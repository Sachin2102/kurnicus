-- Real-time detection support (Phase: streaming).
-- 1) Latency instrumentation on events.
-- 2) A trigger that fires a NOTIFY the instant an event is inserted, so the
--    streaming detector reacts on a push (event-driven, no polling = low power).

ALTER TABLE events ADD COLUMN IF NOT EXISTS scored_at        TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS detect_latency_ms DOUBLE PRECISION;

CREATE OR REPLACE FUNCTION notify_new_event() RETURNS trigger AS $$
BEGIN
    -- Payload is just the new event id; the detector fetches what it needs.
    PERFORM pg_notify('new_event', NEW.id::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_notify ON events;
CREATE TRIGGER events_notify
    AFTER INSERT ON events
    FOR EACH ROW EXECUTE FUNCTION notify_new_event();
