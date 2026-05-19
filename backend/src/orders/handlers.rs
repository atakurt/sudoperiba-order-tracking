use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use crate::{
    auth::{middleware::AdminClaims, Claims},
    errors::AppError,
    orders::models::{AuditEntry, ChangeStatusRequest, CreateOrderRequest, Order, OrderDetail, OrderStatus, UpdatePackageCountRequest},
    AppState,
};

const ORDER_COLS: &str =
    "id, customer_name, customer_email, customer_phone, description, package_count, status, created_at, updated_at";

pub async fn create_order(
    State(state): State<AppState>,
    _admin: AdminClaims,
    Json(body): Json<CreateOrderRequest>,
) -> Result<(StatusCode, Json<Order>), AppError> {
    if body.id.trim().is_empty() || body.customer_name.trim().is_empty() {
        return Err(AppError::BadRequest("id and customer_name are required".into()));
    }
    let package_count = body.package_count.unwrap_or(1).max(1);

    let order = sqlx::query_as::<_, Order>(
        "INSERT INTO orders (id, customer_name, customer_email, customer_phone, description, package_count)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, customer_name, customer_email, customer_phone, description, package_count, status, created_at, updated_at",
    )
    .bind(body.id.trim())
    .bind(body.customer_name.trim())
    .bind(body.customer_email.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(body.customer_phone.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(body.description.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(package_count)
    .fetch_one(&state.db)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(ref dbe) if dbe.constraint() == Some("orders_pkey") => {
            AppError::BadRequest("an order with that ID already exists".into())
        }
        other => AppError::Database(other),
    })?;

    Ok((StatusCode::CREATED, Json(order)))
}

#[derive(Deserialize)]
pub struct OrdersFilter {
    pub status: Option<OrderStatus>,
    pub q: Option<String>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

#[derive(serde::Serialize)]
pub struct OrdersPage {
    pub orders: Vec<Order>,
    pub total: i64,
    pub page: i64,
    pub per_page: i64,
}

pub async fn list_orders(
    State(state): State<AppState>,
    claims: Claims,
    Query(filter): Query<OrdersFilter>,
) -> Result<Json<OrdersPage>, AppError> {
    let is_admin = claims.role == "admin";
    let page = filter.page.unwrap_or(1).max(1);
    let per_page = filter.per_page.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * per_page;

    let search = filter.q
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| format!("%{s}%"));

    // Resolve which status filter applies (non-admins are restricted to visible statuses)
    let non_admin_catch_all = !is_admin && filter.status.as_ref().map_or(true, |s| !matches!(s, OrderStatus::Pending | OrderStatus::Packaging | OrderStatus::Packaged | OrderStatus::Shipped));
    let status_bind: Option<OrderStatus> = if is_admin {
        filter.status
    } else {
        match filter.status {
            Some(s) if matches!(s, OrderStatus::Pending | OrderStatus::Packaging | OrderStatus::Packaged | OrderStatus::Shipped) => Some(s),
            _ => None,
        }
    };

    // Build WHERE conditions with dynamic $N indices
    let mut conditions: Vec<String> = Vec::new();
    let mut p = 1i32; // next parameter index

    if search.is_some() {
        conditions.push(format!(
            "(id ILIKE ${p} OR customer_name ILIKE ${p} OR customer_email ILIKE ${p} \
             OR COALESCE(customer_phone,'') ILIKE ${p} OR COALESCE(description,'') ILIKE ${p})"
        ));
        p += 1;
    }
    if non_admin_catch_all {
        conditions.push("status IN ('pending','packaging','packaged','shipped')".into());
    } else if status_bind.is_some() {
        conditions.push(format!("status = ${p}"));
        p += 1;
    }

    let where_sql = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };
    let limit_p = p;
    let offset_p = p + 1;

    let list_sql = format!(
        "SELECT {ORDER_COLS} FROM orders {where_sql} ORDER BY created_at DESC LIMIT ${limit_p} OFFSET ${offset_p}"
    );
    let count_sql = format!("SELECT COUNT(*) FROM orders {where_sql}");

    let orders = {
        let mut q = sqlx::query_as::<_, Order>(&list_sql);
        if let Some(ref s) = search { q = q.bind(s.as_str()); }
        if let Some(ref s) = status_bind { q = q.bind(s); }
        q.bind(per_page).bind(offset).fetch_all(&state.db).await?
    };

    let total: i64 = {
        let mut q = sqlx::query_scalar(&count_sql);
        if let Some(ref s) = search { q = q.bind(s.as_str()); }
        if let Some(ref s) = status_bind { q = q.bind(s); }
        q.fetch_one(&state.db).await?
    };

    Ok(Json(OrdersPage { orders, total, page, per_page }))
}

pub async fn get_order(
    State(state): State<AppState>,
    _claims: Claims,
    Path(id): Path<String>,
) -> Result<Json<OrderDetail>, AppError> {
    let order = sqlx::query_as::<_, Order>(
        &format!("SELECT {ORDER_COLS} FROM orders WHERE id = $1"),
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    let audit = sqlx::query_as::<_, AuditEntry>(
        "SELECT a.id, a.order_id, a.changed_by,
                u.email AS changed_by_email,
                a.from_status, a.to_status,
                a.from_package_count, a.to_package_count,
                a.changed_at
         FROM order_status_audit a
         JOIN users u ON u.id = a.changed_by
         WHERE a.order_id = $1
         ORDER BY a.changed_at ASC",
    )
    .bind(&id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(OrderDetail { order, audit }))
}

pub async fn change_status(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<String>,
    Json(body): Json<ChangeStatusRequest>,
) -> Result<Json<Order>, AppError> {
    let allowed: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM role_permissions WHERE role = $1 AND allowed_status = $2)",
    )
    .bind(&claims.role)
    .bind(&body.status)
    .fetch_one(&state.db)
    .await?;

    if !allowed {
        return Err(AppError::Forbidden);
    }

    let mut tx = state.db.begin().await?;

    let order = sqlx::query_as::<_, Order>(
        &format!("SELECT {ORDER_COLS} FROM orders WHERE id = $1 FOR UPDATE"),
    )
    .bind(&id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(AppError::NotFound)?;

    if order.status == body.status {
        tx.rollback().await?;
        return Err(AppError::BadRequest("order already has that status".into()));
    }

    // Non-admins cannot change orders that are already packaged or shipped
    if claims.role != "admin"
        && matches!(order.status, OrderStatus::Packaged | OrderStatus::Shipped)
    {
        tx.rollback().await?;
        return Err(AppError::Forbidden);
    }

    let from_status = order.status;

    let updated = sqlx::query_as::<_, Order>(
        &format!(
            "UPDATE orders SET status = $1, updated_at = NOW()
             WHERE id = $2
             RETURNING {ORDER_COLS}"
        ),
    )
    .bind(&body.status)
    .bind(&id)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO order_status_audit (order_id, changed_by, from_status, to_status)
         VALUES ($1, $2, $3, $4)",
    )
    .bind(&id)
    .bind(claims.sub)
    .bind(from_status)
    .bind(Some(&body.status))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(Json(updated))
}

pub async fn update_package_count(
    State(state): State<AppState>,
    admin: AdminClaims,
    Path(id): Path<String>,
    Json(body): Json<UpdatePackageCountRequest>,
) -> Result<Json<Order>, AppError> {
    if body.package_count < 1 {
        return Err(AppError::BadRequest("package_count must be at least 1".into()));
    }

    let mut tx = state.db.begin().await?;

    let order = sqlx::query_as::<_, Order>(
        &format!("SELECT {ORDER_COLS} FROM orders WHERE id = $1 FOR UPDATE"),
    )
    .bind(&id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(AppError::NotFound)?;

    if order.package_count == body.package_count {
        tx.rollback().await?;
        return Err(AppError::BadRequest("package count is already that value".into()));
    }

    let from_count = order.package_count;

    let updated = sqlx::query_as::<_, Order>(
        &format!(
            "UPDATE orders SET package_count = $1, updated_at = NOW()
             WHERE id = $2
             RETURNING {ORDER_COLS}"
        ),
    )
    .bind(body.package_count)
    .bind(&id)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO order_status_audit (order_id, changed_by, from_package_count, to_package_count)
         VALUES ($1, $2, $3, $4)",
    )
    .bind(&id)
    .bind(admin.0.sub)
    .bind(from_count)
    .bind(body.package_count)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(Json(updated))
}
