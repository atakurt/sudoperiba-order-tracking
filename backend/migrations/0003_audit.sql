CREATE TABLE order_status_audit (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    changed_by  UUID NOT NULL REFERENCES users(id),
    from_status order_status,
    to_status   order_status NOT NULL,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_order_id ON order_status_audit(order_id);
