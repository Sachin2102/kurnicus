"""
Kurnicus API — Phase 1.

Replaces the old Flask backend. Reads structured telemetry from Postgres
(instead of re-parsing text files from S3 on every request) and exposes:

  * Health + fleet endpoints (new)
  * Compatibility endpoints matching the existing React dashboard, so the
    current frontend keeps working with only a base-URL change.

Detection (Phase 3) and the AI SOC analyst (Phase 4) plug in on top of this.
"""
import io
import json
import os
import zipfile
from typing import Any

import asyncpg
from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

import ai

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://kurnicus:kurnicus@db:5432/kurnicus"
)

app = FastAPI(title="Kurnicus API", version="0.1.0")

# NOTE: wide-open CORS is fine for local dev only. Phase 5 locks this down.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_pool: asyncpg.Pool | None = None


async def _init_conn(conn: asyncpg.Connection) -> None:
    # asyncpg returns JSON/JSONB as raw text by default; decode to dict/list.
    await conn.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )
    await conn.set_type_codec(
        "json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )


@app.on_event("startup")
async def _startup() -> None:
    global _pool
    _pool = await asyncpg.create_pool(
        DATABASE_URL, min_size=1, max_size=10, init=_init_conn
    )


@app.on_event("shutdown")
async def _shutdown() -> None:
    if _pool:
        await _pool.close()


async def _fetch_payloads(source: str, limit: int, host: str | None) -> list[dict[str, Any]]:
    """Return the JSONB payloads for a given telemetry source, newest first."""
    where = ["e.source = $1"]
    args: list[Any] = [source]
    if host:
        where.append("h.hostname = $2")
        args.append(host)
    args.append(limit)
    sql = f"""
        SELECT e.payload, e.verdict, h.hostname
        FROM events e
        JOIN hosts h ON h.id = e.host_id
        WHERE {' AND '.join(where)}
        ORDER BY e.ts DESC
        LIMIT ${len(args)}
    """
    async with _pool.acquire() as conn:
        rows = await conn.fetch(sql, *args)
    out = []
    for r in rows:
        item = dict(r["payload"])
        item.setdefault("host", r["hostname"])
        out.append(item)
    return out


# --------------------------------------------------------------------------
# New endpoints
# --------------------------------------------------------------------------
@app.get("/health")
async def health() -> dict[str, str]:
    async with _pool.acquire() as conn:
        await conn.fetchval("SELECT 1")
    return {"status": "ok"}


@app.get("/api/hosts")
async def list_hosts() -> list[dict[str, Any]]:
    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, hostname, ip, os, first_seen, last_seen FROM hosts ORDER BY hostname"
        )
    return [dict(r) for r in rows]


@app.get("/api/alerts")
async def get_alerts(
    status: str | None = None,
    severity: str | None = None,
    limit: int = Query(200, le=1000),
) -> list[dict[str, Any]]:
    where, args = [], []
    if status:
        args.append(status)
        where.append(f"a.status = ${len(args)}")
    if severity:
        args.append(severity)
        where.append(f"a.severity = ${len(args)}")
    args.append(limit)
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    sql = f"""
        SELECT a.id, a.ts, a.severity, a.title, a.description,
               a.mitre_technique, a.standard_ref, a.ai_summary, a.status, h.hostname
        FROM alerts a JOIN hosts h ON h.id = a.host_id
        {clause}
        ORDER BY
          CASE a.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                          WHEN 'medium' THEN 2 ELSE 3 END,
          a.ts DESC
        LIMIT ${len(args)}
    """
    async with _pool.acquire() as conn:
        rows = await conn.fetch(sql, *args)
    return [dict(r) for r in rows]


@app.patch("/api/alerts/{alert_id}")
async def update_alert(alert_id: str, status: str = Body(..., embed=True)) -> dict[str, str]:
    if status not in ("open", "acknowledged", "resolved"):
        raise HTTPException(400, "invalid status")
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE alerts SET status = $1 WHERE id = $2 RETURNING id",
            status, alert_id,
        )
    if not row:
        raise HTTPException(404, "alert not found")
    return {"id": str(row["id"]), "status": status}


@app.get("/api/metrics")
async def metrics() -> dict[str, Any]:
    """Real-time detection metrics — proves the low-latency edge claim."""
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT
              count(*) FILTER (WHERE scored_at IS NOT NULL) AS scored,
              round(avg(detect_latency_ms)::numeric, 2) AS avg_ms,
              round((percentile_cont(0.95) WITHIN GROUP (
                     ORDER BY detect_latency_ms))::numeric, 2) AS p95_ms,
              round(max(detect_latency_ms)::numeric, 2) AS max_ms,
              count(*) FILTER (WHERE scored_at > now() - interval '60 seconds') AS last_60s
            FROM events
            """
        )
        total_events = await conn.fetchval("SELECT count(*) FROM events")
    return {
        "events_total": total_events,
        "events_scored": row["scored"],
        "avg_latency_ms": float(row["avg_ms"]) if row["avg_ms"] is not None else None,
        "p95_latency_ms": float(row["p95_ms"]) if row["p95_ms"] is not None else None,
        "max_latency_ms": float(row["max_ms"]) if row["max_ms"] is not None else None,
        "events_last_60s": row["last_60s"],
    }


# Plain-English guidance per threat type (keyed by MITRE technique).
_GUIDANCE = {
    "T1496": {
        "cat": "Crypto-mining malware",
        "why": "A hidden program is secretly using this device's processor to mine cryptocurrency for an attacker. It slows the device, wastes power, and means someone has already gained access.",
        "how": ["Find the program on the Live Process tab (it's the one using ~100% CPU).",
                "Stop (kill) that process.", "Delete the program file and check how it got there.",
                "Change passwords — the device was compromised."],
    },
    "T1071": {
        "cat": "Suspicious outside connections",
        "why": "One or more devices are talking to unknown external addresses. This is how malware 'calls home' or leaks your data.",
        "how": ["Open the Network tab and click 'Why?' on the flagged connections.",
                "Block the unknown addresses on your firewall/router.",
                "Identify which program opened them and remove it if unknown."],
    },
    "T1003": {
        "cat": "Sensitive files accessed",
        "why": "System files that store passwords/secrets were opened. This is a classic step attackers take to steal credentials.",
        "how": ["Check the File tab for which user opened the file.",
                "If it wasn't a legitimate admin action, treat the device as breached.",
                "Reset affected passwords and review who has access."],
    },
    "T1110": {
        "cat": "Password-guessing (brute force)",
        "why": "Someone is repeatedly trying to log in with wrong passwords — attempting to break into an account.",
        "how": ["Block the attacking IP address(es) shown in the alert.",
                "Make sure accounts use strong passwords.",
                "Turn on account lockout after failed attempts, and two-factor login if possible."],
    },
    "T0814": {
        "cat": "Vehicle network flooding (DoS)",
        "why": "The in-vehicle (CAN) network is being flooded with messages, which can disrupt safety-critical functions like braking or steering.",
        "how": ["Isolate the affected bus segment.",
                "Identify the flooding source ECU/port.",
                "Report per UN R155 incident-response requirements."],
    },
    "T0839": {
        "cat": "Vehicle message injection",
        "why": "Unknown messages are being injected onto the vehicle network — an attacker may be spoofing commands to vehicle systems.",
        "how": ["Block/quarantine the injecting node.",
                "Verify no safety functions were affected.",
                "Report per UN R155 / ISO 21434."],
    },
}
_GENERIC_GUIDANCE = {
    "cat": "Unusual activity",
    "why": "The system detected behavior that differs from this device's normal pattern.",
    "how": ["Open the Alerts tab and review the details.", "Use the AI button for a plain-English explanation."],
}
_SEV_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}


@app.get("/api/recommendations")
async def recommendations() -> dict[str, Any]:
    """A prioritized 'what to review and why' list, grouped by threat type."""
    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT mitre_technique, severity, count(*) n, min(title) example "
            "FROM alerts WHERE status='open' "
            "GROUP BY mitre_technique, severity"
        )
    # Merge by threat category, keep the worst severity + total count.
    merged: dict[str, dict] = {}
    for r in rows:
        g = _GUIDANCE.get(r["mitre_technique"], _GENERIC_GUIDANCE)
        key = g["cat"]
        m = merged.setdefault(key, {"category": key, "why": g["why"], "how": g["how"],
                                    "count": 0, "severity": "low", "example": r["example"]})
        m["count"] += r["n"]
        if _SEV_RANK[r["severity"]] < _SEV_RANK[m["severity"]]:
            m["severity"] = r["severity"]
            m["example"] = r["example"]
    recs = sorted(merged.values(), key=lambda x: (_SEV_RANK[x["severity"]], -x["count"]))
    for i, r in enumerate(recs, 1):
        r["priority"] = i
        r["title"] = f"Review {r['count']} {r['category'].lower()} alert{'s' if r['count'] != 1 else ''}"
    return {"count": len(recs), "recommendations": recs}


@app.get("/api/health-score")
async def health_score() -> dict[str, Any]:
    """A single 0-100 posture score for the whole fleet, with a plain-English
    grade and the factors behind it — an at-a-glance 'is my device safe?'."""
    async with _pool.acquire() as conn:
        sev = await conn.fetch(
            "SELECT severity, count(*) n FROM alerts WHERE status='open' GROUP BY severity"
        )
        total = await conn.fetchval("SELECT count(*) FROM events") or 0
        anomalous = await conn.fetchval(
            "SELECT count(*) FROM events WHERE verdict IN ('anomalous','blacklisted')"
        ) or 0
        hosts = await conn.fetchval("SELECT count(*) FROM hosts") or 0
    by = {r["severity"]: r["n"] for r in sev}
    crit, high, med = by.get("critical", 0), by.get("high", 0), by.get("medium", 0)

    alert_penalty = min(55, crit * 12 + high * 4 + med * 1.5)
    ratio = (anomalous / total * 100) if total else 0
    ratio_penalty = min(25, ratio * 0.5)
    score = max(0, round(100 - alert_penalty - ratio_penalty))

    grade = "Good" if score >= 85 else "Fair" if score >= 60 else "At risk"
    return {
        "score": score,
        "grade": grade,
        "hosts": hosts,
        "open_critical": crit,
        "open_high": high,
        "open_medium": med,
        "suspicious_percent": round(ratio, 1),
    }


@app.get("/api/ai/status")
async def ai_status() -> dict[str, Any]:
    return {"enabled": ai.is_enabled(), "model": ai.MODEL if ai.is_enabled() else None}


@app.post("/api/ai/insights")
async def ai_insights(
    context: str = Body(..., embed=True),
    summary: dict = Body(..., embed=True),
) -> dict[str, Any]:
    """Plain-English AI summary for a whole page/tab, from a small stats dict."""
    if not ai.is_enabled():
        raise HTTPException(503, "AI not configured (set NVIDIA_API_KEY)")
    try:
        text = ai.insights(context, summary)
    except Exception as e:
        raise HTTPException(502, f"AI request failed: {e}")
    return {"context": context, "insights": text}


@app.post("/api/alerts/{alert_id}/explain")
async def explain_alert(alert_id: str) -> dict[str, Any]:
    if not ai.is_enabled():
        raise HTTPException(503, "AI not configured (set NVIDIA_API_KEY)")
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT a.id, a.severity, a.title, a.description, a.mitre_technique, "
            "a.standard_ref, a.event_id, h.hostname "
            "FROM alerts a JOIN hosts h ON h.id = a.host_id WHERE a.id = $1",
            alert_id,
        )
        if not row:
            raise HTTPException(404, "alert not found")
        payload = None
        if row["event_id"]:
            payload = await conn.fetchval(
                "SELECT payload FROM events WHERE id = $1", row["event_id"]
            )
    try:
        summary = ai.explain_alert(dict(row), payload)
    except Exception as e:  # surface upstream/model errors clearly
        raise HTTPException(502, f"AI request failed: {e}")
    async with _pool.acquire() as conn:
        await conn.execute(
            "UPDATE alerts SET ai_summary = $1 WHERE id = $2", summary, alert_id
        )
    return {"id": alert_id, "ai_summary": summary}


@app.get("/api/alerts/summary")
async def alerts_summary() -> dict[str, Any]:
    async with _pool.acquire() as conn:
        total = await conn.fetchval("SELECT count(*) FROM alerts")
        by_sev = await conn.fetch(
            "SELECT severity, count(*) AS n FROM alerts GROUP BY severity"
        )
    return {"total": total, "by_severity": {r["severity"]: r["n"] for r in by_sev}}


@app.get("/api/events")
async def get_events(
    source: str | None = None,
    host: str | None = None,
    limit: int = Query(200, le=2000),
) -> list[dict[str, Any]]:
    where, args = [], []
    if source:
        args.append(source)
        where.append(f"e.source = ${len(args)}")
    if host:
        args.append(host)
        where.append(f"h.hostname = ${len(args)}")
    args.append(limit)
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    sql = f"""
        SELECT e.id, e.ts, e.source, e.verdict, e.anomaly_score, e.payload, h.hostname
        FROM events e JOIN hosts h ON h.id = e.host_id
        {clause}
        ORDER BY e.ts DESC
        LIMIT ${len(args)}
    """
    async with _pool.acquire() as conn:
        rows = await conn.fetch(sql, *args)
    return [dict(r) for r in rows]


# --------------------------------------------------------------------------
# Compatibility endpoints (match the existing React dashboard's expectations)
# --------------------------------------------------------------------------
def _counts(logs: list[dict[str, Any]], key: str, black: str, white: str) -> dict[str, int]:
    b = sum(1 for l in logs if l.get(key) == black)
    w = sum(1 for l in logs if l.get(key) == white)
    return {"blacklisted_count": b, "whitelisted_count": w}


@app.get("/network_logs")
async def network_logs(host: str | None = None):
    logs = await _fetch_payloads("network", 1000, host)
    return {"logs": logs, **_counts(logs, "listing", "Blacklisted", "Valid IP")}


@app.get("/liveprocess_logs")
async def liveprocess_logs(host: str | None = None):
    logs = await _fetch_payloads("liveprocess", 1000, host)
    return {"logs": logs, **_counts(logs, "listing", "BLACKLISTED", "WHITELISTED")}


@app.get("/memory_logs")
async def memory_logs(host: str | None = None):
    logs = await _fetch_payloads("memory", 1000, host)
    return {"logs": logs}


@app.get("/file_logs")
async def file_logs(host: str | None = None):
    logs = await _fetch_payloads("file", 1000, host)
    return {"logs": logs, **_counts(logs, "listing", "Blacklist", "Whitelist")}


@app.get("/process_info")
async def process_info(host: str | None = None):
    return await _fetch_payloads("process_info", 1000, host)


@app.get("/download_all_files")
async def download_all_files(host: str | None = None):
    """Zip one JSON file per telemetry source (replaces the old S3 zip)."""
    sources = ["network", "liveprocess", "memory", "file", "process_info"]
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for src in sources:
            logs = await _fetch_payloads(src, 5000, host)
            zf.writestr(f"logs_{src}.json", json.dumps(logs, indent=2))
    buf.seek(0)
    return Response(
        content=buf.read(),
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=kurnicus_logs.zip"},
    )
