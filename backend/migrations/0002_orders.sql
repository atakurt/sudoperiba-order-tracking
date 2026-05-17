CREATE TYPE order_status AS ENUM (
    'pending',
    'packaging',
    'packaged',
    'shipped',
    'delivered',
    'cancelled'
);

CREATE TABLE orders (
    id             TEXT PRIMARY KEY,
    customer_name  TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    description    TEXT,
    status         order_status NOT NULL DEFAULT 'pending',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sample orders for development
INSERT INTO orders (id, customer_name, customer_email, description) VALUES
    ('ORD-2026-001', 'Alice Johnson', 'alice@example.com', 'Blue widget x3'),
    ('ORD-2026-002', 'Bob Smith', 'bob@example.com', 'Red gadget deluxe'),
    ('ORD-2026-003', 'Carol White', 'carol@example.com', 'Green gizmo pro');
