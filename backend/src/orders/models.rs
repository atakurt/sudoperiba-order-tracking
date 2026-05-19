use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, sqlx::Type, Clone, PartialEq)]
#[sqlx(type_name = "order_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum OrderStatus {
    Pending,
    Packaging,
    Packaged,
    Shipped,
    Delivered,
    Cancelled,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Order {
    pub id: String,
    pub customer_name: String,
    pub customer_email: Option<String>,
    pub customer_phone: Option<String>,
    pub description: Option<String>,
    pub package_count: i32,
    pub status: OrderStatus,
    #[serde(with = "time::serde::rfc3339")]
    pub created_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339")]
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct AuditEntry {
    pub id: Uuid,
    pub order_id: String,
    pub changed_by: Uuid,
    pub changed_by_email: String,
    pub from_status: Option<OrderStatus>,
    pub to_status: Option<OrderStatus>,
    pub from_package_count: Option<i32>,
    pub to_package_count: Option<i32>,
    #[serde(with = "time::serde::rfc3339")]
    pub changed_at: OffsetDateTime,
}

#[derive(Debug, Serialize)]
pub struct OrderDetail {
    #[serde(flatten)]
    pub order: Order,
    pub audit: Vec<AuditEntry>,
}

#[derive(Debug, Deserialize)]
pub struct ChangeStatusRequest {
    pub status: OrderStatus,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePackageCountRequest {
    pub package_count: i32,
}

#[derive(Debug, Deserialize)]
pub struct CreateOrderRequest {
    pub id: String,
    pub customer_name: String,
    pub customer_email: Option<String>,
    pub customer_phone: Option<String>,
    pub description: Option<String>,
    pub package_count: Option<i32>,
}
