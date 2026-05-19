use axum::{
    routing::{get, patch, post},
    Router,
};
use sqlx::postgres::PgPoolOptions;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod auth;
mod config;
mod errors;
mod orders;
mod permissions;
mod users;

use config::Config;

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub config: Config,
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env();

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&config.database_url)
        .await
        .expect("failed to connect to database");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrations failed");

    seed_admin(&pool, &config).await;

    let state = AppState { db: pool, config };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/auth/login", post(auth::handlers::login))
        .route("/api/auth/me", get(auth::handlers::me))
        .route("/api/orders", get(orders::handlers::list_orders).post(orders::handlers::create_order))
        .route("/api/orders/:id", get(orders::handlers::get_order))
        .route("/api/orders/:id/status", patch(orders::handlers::change_status))
        .route("/api/orders/:id/package-count", patch(orders::handlers::update_package_count))
        .route("/api/users", get(users::handlers::list_users).post(users::handlers::create_user))
        .route("/api/users/:id", axum::routing::delete(users::handlers::delete_user))
        .route("/api/permissions", get(permissions::handlers::get_permissions).put(permissions::handlers::update_permissions))
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    tracing::info!("listening on 0.0.0.0:8080");
    axum::serve(listener, app).await.unwrap();
}

async fn seed_admin(pool: &sqlx::PgPool, config: &Config) {
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE role = 'admin')")
        .fetch_one(pool)
        .await
        .unwrap_or(false);

    if exists {
        return;
    }

    let hash = bcrypt::hash(&config.admin_password, bcrypt::DEFAULT_COST)
        .expect("bcrypt hash failed");

    sqlx::query(
        "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin')
         ON CONFLICT (email) DO NOTHING",
    )
    .bind(&config.admin_email)
    .bind(&hash)
    .execute(pool)
    .await
    .expect("failed to seed admin user");

    tracing::info!("seeded admin user: {}", config.admin_email);
}
