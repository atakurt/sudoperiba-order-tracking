use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;

use crate::{
    auth::middleware::AdminClaims,
    errors::AppError,
    users::models::{CreateUserRequest, User},
    AppState,
};

pub async fn list_users(
    State(state): State<AppState>,
    _admin: AdminClaims,
) -> Result<Json<Vec<User>>, AppError> {
    let users = sqlx::query_as::<_, User>(
        "SELECT id, email, role, created_at FROM users ORDER BY created_at DESC",
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(users))
}

pub async fn create_user(
    State(state): State<AppState>,
    _admin: AdminClaims,
    Json(body): Json<CreateUserRequest>,
) -> Result<Json<User>, AppError> {
    if body.role != "user" && body.role != "admin" {
        return Err(AppError::BadRequest("role must be 'user' or 'admin'".into()));
    }

    let hash = bcrypt::hash(&body.password, bcrypt::DEFAULT_COST)
        .map_err(|e| AppError::Internal(e.into()))?;

    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)
         RETURNING id, email, role, created_at",
    )
    .bind(&body.email)
    .bind(&hash)
    .bind(&body.role)
    .fetch_one(&state.db)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(ref dbe) if dbe.constraint() == Some("users_email_key") => {
            AppError::BadRequest("email already exists".into())
        }
        other => AppError::Database(other),
    })?;

    Ok(Json(user))
}

pub async fn delete_user(
    State(state): State<AppState>,
    admin: AdminClaims,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    if admin.0.sub == id {
        return Err(AppError::BadRequest("cannot delete your own account".into()));
    }

    let result = sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(StatusCode::NO_CONTENT)
}
