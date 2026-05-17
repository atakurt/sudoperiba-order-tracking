CREATE TABLE role_permissions (
    role           TEXT NOT NULL,
    allowed_status order_status NOT NULL,
    PRIMARY KEY (role, allowed_status)
);

INSERT INTO role_permissions (role, allowed_status) VALUES
    ('admin', 'pending'),
    ('admin', 'packaging'),
    ('admin', 'packaged'),
    ('admin', 'shipped'),
    ('admin', 'delivered'),
    ('admin', 'cancelled'),
    ('user', 'packaging'),
    ('user', 'packaged');
