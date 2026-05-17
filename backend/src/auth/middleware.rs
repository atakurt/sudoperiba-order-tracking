use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{request::Parts, HeaderMap},
};

use crate::{auth::{verify_token, Claims}, errors::AppError, AppState};

fn extract_bearer(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
}

#[async_trait]
impl FromRequestParts<AppState> for Claims {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, AppError> {
        let token = extract_bearer(&parts.headers).ok_or(AppError::Unauthorized)?;
        verify_token(token, &state.config.jwt_secret).map_err(|_| AppError::Unauthorized)
    }
}

#[allow(dead_code)]
pub struct AdminClaims(pub Claims);

#[async_trait]
impl FromRequestParts<AppState> for AdminClaims {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, AppError> {
        let claims = Claims::from_request_parts(parts, state).await?;
        if claims.role != "admin" {
            return Err(AppError::Forbidden);
        }
        Ok(AdminClaims(claims))
    }
}
