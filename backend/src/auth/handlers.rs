use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{auth::{create_token, Claims}, errors::AppError, AppState};

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: UserInfo,
}

#[derive(Serialize)]
pub struct UserInfo {
    pub id: String,
    pub email: String,
    pub role: String,
}

#[derive(sqlx::FromRow)]
struct UserRow {
    id: Uuid,
    email: String,
    password_hash: String,
    role: String,
    #[allow(dead_code)]
    created_at: OffsetDateTime,
}

pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    let row = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, password_hash, role, created_at FROM users WHERE email = $1",
    )
    .bind(&body.email)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Unauthorized)?;

    let valid = bcrypt::verify(&body.password, &row.password_hash)
        .map_err(|e| AppError::Internal(e.into()))?;

    if !valid {
        return Err(AppError::Unauthorized);
    }

    let token = create_token(row.id, &row.email, &row.role, &state.config.jwt_secret)
        .map_err(|e| AppError::Internal(e))?;

    Ok(Json(LoginResponse {
        token,
        user: UserInfo {
            id: row.id.to_string(),
            email: row.email,
            role: row.role,
        },
    }))
}

pub async fn me(claims: Claims) -> Json<UserInfo> {
    Json(UserInfo {
        id: claims.sub.to_string(),
        email: claims.email,
        role: claims.role,
    })
}
