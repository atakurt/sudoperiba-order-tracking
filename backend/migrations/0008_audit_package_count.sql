ALTER TABLE order_status_audit
    ADD COLUMN from_package_count INTEGER,
    ADD COLUMN to_package_count   INTEGER,
    ALTER COLUMN to_status DROP NOT NULL;
