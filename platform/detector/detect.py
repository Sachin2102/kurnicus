"""
Kurnicus detection worker — Phase 3.

Turns raw telemetry into real detections. For each numeric-signal source we fit
an Isolation Forest on the events (learning what "normal" looks like for this
fleet) and flag statistical outliers. File events use a rule (sensitive-path
access) because they're categorical. Flagged events get:
  * events.anomaly_score  (0..1, higher = more anomalous)
  * events.verdict = 'anomalous'  (unless already 'blacklisted')
  * a row in `alerts` with a human title, severity, and a heuristic MITRE
    technique (the Phase 4 AI analyst will enrich these later).

Run once:   docker compose run --rm detector
Run a loop: docker compose run --rm detector python detect.py --loop 30
"""
import argparse
import asyncio
import json
import os
import time

import asyncpg
import numpy as np
from sklearn.ensemble import IsolationForest

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://kurnicus:kurnicus@db:5432/kurnicus"
)

COMMON_PORTS = {"80", "443", "53", "22", "123", "8000", "8080"}
SENSITIVE_PATHS = ("/etc/shadow", "/etc/passwd", "/etc/sudoers", "/root/.ssh")
CONTAMINATION = 0.05  # expected anomaly fraction

# --- Automotive / CAN bus ---
# A vehicle's normal in-network traffic uses a fixed, known set of CAN
# arbitration IDs (engine, brakes, steering, etc.), each at a steady cadence.
# Attacks show up as (a) unknown IDs (message injection/spoofing) or
# (b) abnormally high frequency on an ID (bus flooding / DoS).
KNOWN_CAN_IDS = {"0x0C9", "0x0D1", "0x1A0", "0x1B0", "0x244", "0x316", "0x329", "0x545"}
CAN_FLOOD_INTERVAL_MS = 3.0   # below this inter-arrival = suspected flooding


def _f(v, default=0.0):
    """Parse a value to float, tolerating '', None, '12.3%' etc."""
    try:
        return float(str(v).replace("%", "").strip())
    except (TypeError, ValueError):
        return default


# --------------------------------------------------------------------------
# Per-source feature extraction. Each returns a vector describing one event.
# --------------------------------------------------------------------------
def features_network(p: dict) -> list[float]:
    dport = p.get("tcp.dstport") or p.get("udp.dstport") or "0"
    return [
        _f(p.get("frame.len")),
        _f(dport),
        0.0 if dport in COMMON_PORTS else 1.0,  # uncommon destination port
    ]


def features_liveprocess(p: dict) -> list[float]:
    return [
        _f(p.get("%CPU")),
        _f(p.get("%MEM")),
        1.0 if str(p.get("USER", "")).lower() == "root" else 0.0,
        _f(p.get("VIRT")),
        _f(p.get("RES")),
    ]


def features_memory(p: dict) -> list[float]:
    return [_f(p.get("%memused")), _f(p.get("%commit")), _f(p.get("kbdirty"))]


def features_auth(p: dict) -> list[float]:
    # Login/authentication telemetry — universal across servers, IoT, kiosks,
    # industrial, medical, any device with user accounts.
    return [
        _f(p.get("failed_count")),                                  # recent failures from this source
        1.0 if str(p.get("result", "")).lower() == "failed" else 0.0,
        1.0 if str(p.get("user", "")).lower() in ("root", "admin") else 0.0,
    ]


def features_canbus(p: dict) -> list[float]:
    can_id = p.get("can_id", "0x000")
    try:
        can_id_int = float(int(str(can_id), 16))
    except (TypeError, ValueError):
        can_id_int = 0.0
    return [
        can_id_int,
        _f(p.get("dlc")),                                   # data length 0-8
        _f(p.get("interval_ms"), 100.0),                    # inter-arrival time
        0.0 if str(can_id) in KNOWN_CAN_IDS else 1.0,       # unknown ID flag
    ]


NUMERIC_SOURCES = {
    "network": features_network,
    "liveprocess": features_liveprocess,
    "memory": features_memory,
    "canbus": features_canbus,
    "auth": features_auth,
}


# --------------------------------------------------------------------------
# Alert descriptions (title, description, severity, heuristic MITRE technique)
# --------------------------------------------------------------------------
def describe(source: str, p: dict) -> tuple[str, str, str, str, str]:
    """Return (title, description, severity, mitre_technique, standard_ref)."""
    if source == "network":
        dst = p.get("ip.dst", "?")
        dport = p.get("tcp.dstport") or p.get("udp.dstport") or "?"
        return (
            f"Unusual outbound connection to {dst}:{dport}",
            f"Traffic to {dst} on port {dport} (len {p.get('frame.len','?')}) "
            f"deviates from this host's normal network behavior.",
            "high" if dport not in COMMON_PORTS else "medium",
            "T1071",  # Application Layer Protocol
            "",
        )
    if source == "liveprocess":
        cmd, cpu = p.get("COMMAND", "?"), p.get("%CPU", "?")
        return (
            f"Anomalous process '{cmd}' (PID {p.get('PID','?')})",
            f"Process '{cmd}' running as {p.get('USER','?')} at {cpu}% CPU "
            f"is an outlier vs baseline process behavior.",
            "high",
            "T1496",  # Resource Hijacking (e.g. crypto-mining)
            "",
        )
    if source == "memory":
        return (
            f"Memory usage anomaly ({p.get('%memused','?')}% used)",
            "Memory utilization is statistically abnormal for this host.",
            "medium",
            "T1499",  # Endpoint Denial of Service
            "",
        )
    if source == "auth":
        user = p.get("user", "?")
        src = p.get("source_ip", "?")
        fails = p.get("failed_count", "?")
        return (
            f"Possible brute-force login on '{user}' from {src}",
            f"{fails} failed login attempts for '{user}' from {src} — someone may "
            f"be guessing the password to break into this device.",
            "high",
            "T1110",  # Brute Force
            "",
        )
    if source == "canbus":
        can_id = p.get("can_id", "?")
        interval = _f(p.get("interval_ms"), 100.0)
        unknown = str(can_id) not in KNOWN_CAN_IDS
        if interval < CAN_FLOOD_INTERVAL_MS:
            return (
                f"CAN bus flooding on {can_id} ({interval:.1f} ms interval)",
                f"CAN ID {can_id} is transmitting every {interval:.1f} ms — far "
                f"above its normal cadence, consistent with a bus denial-of-service.",
                "critical",
                "T0814",  # ICS: Denial of Service
                "UN R155 Annex 5 §4.3.1 (DoS on vehicle network); ISO/SAE 21434 threat: Availability",
            )
        if unknown:
            return (
                f"Unknown CAN ID injected: {can_id}",
                f"Frame with unrecognized arbitration ID {can_id} observed on the "
                f"vehicle network — consistent with message injection / spoofing.",
                "critical",
                "T0839",  # ICS: Module Firmware / spoofed messaging analog
                "UN R155 Annex 5 §4.3.6 (message injection/spoofing); ISO/SAE 21434 threat: Spoofing",
            )
        return (
            f"Anomalous CAN traffic on {can_id}",
            f"CAN ID {can_id} shows out-of-baseline behavior on the vehicle network.",
            "high",
            "T0801",
            "ISO/SAE 21434 threat: Tampering",
        )
    return ("Anomaly detected", "Statistical outlier in telemetry.", "medium", "", "")


async def score_numeric_source(conn, source: str, extract) -> int:
    """Fit Isolation Forest for one source, write scores + alerts. Returns #alerts."""
    rows = await conn.fetch(
        "SELECT id, host_id, payload, verdict FROM events WHERE source = $1", source
    )
    if len(rows) < 20:  # not enough to learn a baseline
        return 0

    X = np.array([extract(r["payload"]) for r in rows], dtype=float)
    clf = IsolationForest(contamination=CONTAMINATION, random_state=42)
    clf.fit(X)
    raw = -clf.score_samples(X)  # higher = more anomalous
    flags = clf.predict(X)  # -1 = anomaly
    lo, hi = raw.min(), raw.max()
    norm = (raw - lo) / (hi - lo) if hi > lo else np.zeros_like(raw)

    score_updates = [(float(s), r["id"]) for r, s in zip(rows, norm)]
    await conn.executemany(
        "UPDATE events SET anomaly_score = $1 WHERE id = $2", score_updates
    )

    alerts = []
    flagged_ids = []
    for r, flag in zip(rows, flags):
        if flag == -1:
            flagged_ids.append(r["id"])
            title, desc, sev, mitre, std = describe(source, r["payload"])
            alerts.append((r["host_id"], r["id"], sev, title, desc, mitre, std))

    if flagged_ids:
        # Promote 'valid' -> 'anomalous' but never overwrite 'blacklisted'.
        await conn.execute(
            "UPDATE events SET verdict = 'anomalous' "
            "WHERE id = ANY($1::bigint[]) AND verdict = 'valid'",
            flagged_ids,
        )
        await conn.executemany(
            "INSERT INTO alerts (host_id, event_id, severity, title, description, "
            "mitre_technique, standard_ref) VALUES ($1,$2,$3,$4,$5,$6,$7)",
            alerts,
        )
    return len(alerts)


async def score_file_rule(conn) -> int:
    """Rule-based detection for categorical file events."""
    rows = await conn.fetch(
        "SELECT id, host_id, payload FROM events WHERE source = 'file'"
    )
    alerts, flagged = [], []
    for r in rows:
        path = str(r["payload"].get("file", ""))
        if any(path.startswith(s) for s in SENSITIVE_PATHS):
            flagged.append(r["id"])
            alerts.append(
                (r["host_id"], r["id"], "high",
                 f"Sensitive file access: {path}",
                 f"{r['payload'].get('user','?')} accessed {path} "
                 f"({r['payload'].get('event','?')}).",
                 "T1003", "")  # OS Credential Dumping
            )
    if flagged:
        await conn.execute(
            "UPDATE events SET verdict = 'anomalous', anomaly_score = 1.0 "
            "WHERE id = ANY($1::bigint[]) AND verdict = 'valid'",
            flagged,
        )
        await conn.executemany(
            "INSERT INTO alerts (host_id, event_id, severity, title, description, "
            "mitre_technique, standard_ref) VALUES ($1,$2,$3,$4,$5,$6,$7)",
            alerts,
        )
    return len(alerts)


async def run_once(pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute("TRUNCATE alerts RESTART IDENTITY")  # idempotent demo pass
        total = 0
        for source, extract in NUMERIC_SOURCES.items():
            n = await score_numeric_source(conn, source, extract)
            print(f"  {source:12s}: {n} alerts")
            total += n
        nf = await score_file_rule(conn)
        print(f"  {'file':12s}: {nf} alerts (rule-based)")
        print(f"Detection pass complete: {total + nf} alerts total.")


async def _init(conn):
    await conn.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--loop", type=int, default=0, help="seconds between passes (0 = once)")
    args = ap.parse_args()

    pool = await asyncpg.create_pool(DATABASE_URL, init=_init)
    try:
        if args.loop > 0:
            print(f"Detector running every {args.loop}s. Ctrl-C to stop.")
            while True:
                await run_once(pool)
                time.sleep(args.loop)
        else:
            await run_once(pool)
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
