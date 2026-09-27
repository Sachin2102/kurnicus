-- Kurnicus core schema
-- Design goals: multi-host, structured, queryable, scale-ready.
-- Every telemetry event is one row with a common envelope + a JSONB payload
-- that holds the source-specific fields. This keeps ingestion flexible while
-- letting us index the things we filter/sort on.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Hosts: identity for every monitored machine. Fixes the "all logs collide
-- into one file" problem in the old design.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hosts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hostname     TEXT NOT NULL,
    ip           TEXT,
    os           TEXT,
    agent_token  TEXT UNIQUE,                 -- shared secret the agent presents on ingest
    first_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (hostname, ip)
);

-- ---------------------------------------------------------------------------
-- Events: the unified telemetry stream.
-- source = 'network' | 'liveprocess' | 'memory' | 'file' | 'kernel' |
--          'process_info' | 'iostat' | 'iotop' | 'sar' | 'ioping' | 'memmap'
-- verdict = 'valid' | 'blacklisted' | 'anomalous' | 'unknown'
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    host_id        UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    ts             TIMESTAMPTZ NOT NULL,       -- when the event happened on the host
    source         TEXT NOT NULL,
    payload        JSONB NOT NULL,             -- source-specific fields
    anomaly_score  DOUBLE PRECISION,           -- filled by the detection worker (Phase 3)
    verdict        TEXT NOT NULL DEFAULT 'unknown',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),  -- when we received it
    scored_at      TIMESTAMPTZ,                -- when the streaming detector scored it
    detect_latency_ms DOUBLE PRECISION         -- created_at -> scored_at, in ms
);

CREATE INDEX IF NOT EXISTS idx_events_host_ts   ON events (host_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_source_ts ON events (source, ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_verdict   ON events (verdict);
CREATE INDEX IF NOT EXISTS idx_events_payload   ON events USING GIN (payload);

-- ---------------------------------------------------------------------------
-- Alerts: what the detection layer + AI analyst produce for humans.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alerts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id          UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    event_id         BIGINT REFERENCES events(id) ON DELETE SET NULL,
    ts               TIMESTAMPTZ NOT NULL DEFAULT now(),
    severity         TEXT NOT NULL DEFAULT 'medium',  -- low | medium | high | critical
    title            TEXT NOT NULL,
    description      TEXT,
    mitre_technique  TEXT,                    -- e.g. 'T1071' (filled by AI layer, Phase 4)
    standard_ref     TEXT,                    -- automotive std ref (ISO 21434 / UN R155)
    ai_summary       TEXT,                    -- natural-language explanation (Phase 4)
    status           TEXT NOT NULL DEFAULT 'open',    -- open | acknowledged | resolved
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_host_ts  ON alerts (host_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_status   ON alerts (status);

-- ---------------------------------------------------------------------------
-- Real-time push: NOTIFY the streaming detector the instant an event lands.
-- Event-driven (no polling) keeps idle CPU/power near zero — important for the
-- low-power edge / automotive target.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_new_event() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('new_event', NEW.id::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_notify ON events;
CREATE TRIGGER events_notify
    AFTER INSERT ON events
    FOR EACH ROW EXECUTE FUNCTION notify_new_event();
