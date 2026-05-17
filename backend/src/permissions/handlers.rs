use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::{
    auth::middleware::AdminClaims,
    errors::AppError,
    orders::models::OrderStatus,
    AppState,
};

#[derive(Debug, sqlx::FromRow)]
struct RolePermissionRow {
    role: String,
    allowed_status: OrderStatus,
}

#[derive(Serialize)]
pub struct PermissionsResponse {
    pub permissions: HashMap<String, Vec<OrderStatus>>,
}

#[derive(Deserialize)]
pub struct UpdatePermissionsRequest {
    pub permissions: HashMap<String, Vec<OrderStatus>>,
}

pub async fn get_permissions(
    State(state): State<AppState>,
    _admin: AdminClaims,
) -> Result<Json<PermissionsResponse>, AppError> {
    let rows = sqlx::query_as::<_, RolePermissionRow>(
        "SELECT role, allowed_status FROM role_permissions ORDER BY role, allowed_status",
    )
    .fetch_all(&state.db)
    .await?;

    let mut permissions: HashMap<String, Vec<OrderStatus>> = HashMap::new();
    for row in rows {
        permissions.entry(row.role).or_default().push(row.allowed_status);
    }

    Ok(Json(PermissionsResponse { permissions }))
}

pub async fn update_permissions(
    State(state): State<AppState>,
    _admin: AdminClaims,
    Json(body): Json<UpdatePermissionsRequest>,
) -> Result<Json<PermissionsResponse>, AppError> {
    let mut tx = state.db.begin().await?;

    sqlx::query("DELETE FROM role_permissions")
        .execute(&mut *tx)
        .await?;

    for (role, statuses) in &body.permissions {
        for status in statuses {
            sqlx::query(
                "INSERT INTO role_permissions (role, allowed_status) VALUES ($1, $2)",
            )
            .bind(role)
            .bind(status)
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    Ok(Json(PermissionsResponse {
        permissions: body.permissions,
    }))
}
