# Kurnicus — platform (Phase 1)

The reproducible core: Postgres + FastAPI, runnable with one command. Replaces
the old S3-text-file pipeline. The existing React dashboard plugs into this API.

## Prerequisites
- Docker + Docker Compose (in WSL: `docker --version`; if missing, install Docker Desktop with WSL integration, or `docker.io` inside the distro).

## Run
```bash
cd platform
docker compose up --build -d        # start Postgres + API
docker compose run --rm seed        # load synthetic telemetry
```

## Verify
```bash
curl http://localhost:8000/health           # {"status":"ok"}
curl http://localhost:8000/api/hosts         # web-01, db-01
curl "http://localhost:8000/network_logs" | head
```
Interactive API docs: http://localhost:8000/docs

## Point the existing frontend at it
In `Linux_Sentinel/frontend`, change the axios base URL from the old Flask
`http://127.0.0.1:5000` to `http://localhost:8000`. Endpoints match, so the
dashboard works unchanged.

## Layout
- `db/schema.sql` — hosts, events (JSONB payloads), alerts
- `api/` — FastAPI app (compat endpoints + new `/api/*`)
- `seed/` — synthetic telemetry generator (includes anomalies to detect)

## Next phases
- P2: hardened agents post structured, host-tagged events to a real ingest endpoint
- P3: anomaly-detection worker writes to `alerts`
- P4: NVIDIA NIM AI SOC analyst (summaries, MITRE mapping, NL search)
