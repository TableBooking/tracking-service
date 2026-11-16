SET LOCAL search_path TO tracking;
-- TARGET SCHEMA V2: tracking_db, append-only (no cross-service FK)
CREATE TABLE IF NOT EXISTS reservation_history (
 event_id UUID PRIMARY KEY, booking_id UUID NOT NULL, customer_id UUID NOT NULL,
 aggregate_version INT NOT NULL CHECK(aggregate_version>=1),
 previous_state TEXT, state TEXT NOT NULL, actor_id TEXT, reason TEXT,
 occurred_at TIMESTAMPTZ NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT ux_history_booking_version UNIQUE(booking_id,aggregate_version)
);
CREATE INDEX IF NOT EXISTS ix_history_booking ON reservation_history(booking_id,aggregate_version);
CREATE TABLE IF NOT EXISTS reservation_projection (
 booking_id UUID PRIMARY KEY, customer_id UUID NOT NULL, state TEXT NOT NULL,
 aggregate_version INT NOT NULL, gap_detected BOOLEAN NOT NULL DEFAULT FALSE,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS inbox_events (
 event_id UUID PRIMARY KEY, processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE reservation_history ADD COLUMN payload_hash TEXT NOT NULL;
ALTER TABLE reservation_projection ADD COLUMN slot_id TEXT NOT NULL, ADD COLUMN party_size INT NOT NULL CHECK(party_size BETWEEN 1 AND 12), ADD COLUMN table_id TEXT, ADD COLUMN last_event_at TIMESTAMPTZ NOT NULL;

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='tracking_app') THEN REVOKE UPDATE ON tracking.reservation_history FROM tracking_app; REVOKE UPDATE ON tracking.inbox_events FROM tracking_app; END IF; END $$;
