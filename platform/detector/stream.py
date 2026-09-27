"""
Kurnicus streaming detector — real-time, low-power.

Event-driven anomaly detection for the edge / automotive target:
  * Waits on a Postgres LISTEN/NOTIFY channel — reacts the instant an event is
    inserted. No polling loop, so idle CPU (and power draw) is ~zero.
  * Uses River online ML (Half-Space Trees) — a pure-Python, CPU-only,
    incremental model that scores each event in well under a millisecond and
    adapts to each host's normal behavior. No GPU, no batch retraining.
  * Keeps a separate model per (host, source): a telematics unit and an
    infotainment box learn their own baselines.
  * Measures end-to-end detection latency (event insert -> scored) and stores
    it on the row, so the <2s real-time claim is provable, not asserted.

Run: docker compose --profile realtime run --rm stream
"""
import asyncio
import json
import os
import pickle
import time
from collections import defaultdict
from datetime import datetime, timezone

import asyncpg
from river import anomaly, compose, preprocessing

# Reuse the feature extractors + alert descriptions from the batch detector.
from detect import (
    CAN_FLOOD_INTERVAL_MS, KNOWN_CAN_IDS, SENSITIVE_PATHS, _f, describe,
    features_canbus, features_liveprocess, features_memory, features_network,
)

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://kurnicus:kurnicus@db:5432/kurnicus"
)
# Where per-host baselines are persisted so they survive restarts (edge devices
# reboot). Kept on a mounted volume in compose.
MODEL_PATH = os.environ.get("MODEL_PATH", "/models/state.pkl")

FEATURE_FN = {
    "network": features_network,
    "liveprocess": features_liveprocess,
    "memory": features_memory,
    "canbus": features_canbus,
}
WARMUP = 40          # events a stream must see before it can raise alerts
THRESHOLD = 0.72     # Half-Space Trees anomaly score above which we alert


def _new_model():
    # MinMaxScaler keeps features in [0,1] (what HST expects); HST does the rest.
    return compose.Pipeline(
        preprocessing.MinMaxScaler(),
        anomaly.HalfSpaceTrees(seed=42),
    )


class Detector:
    def __init__(self):
        self.models = defaultdict(_new_model)   # (host_id, source) -> pipeline
        self.seen = defaultdict(int)             # (host_id, source) -> count
        self.latencies = []                      # ms, recent
        self.n_scored = 0
        self.n_alerts = 0
        self.t0 = time.time()
        self._load()

    def _load(self):
        """Restore per-host baselines from disk so a reboot doesn't cold-start."""
        try:
            with open(MODEL_PATH, "rb") as f:
                state = pickle.load(f)
            self.models = defaultdict(_new_model, state.get("models", {}))
            self.seen = defaultdict(int, state.get("seen", {}))
            print(f"[stream] restored {len(self.models)} models from {MODEL_PATH}",
                  flush=True)
        except FileNotFoundError:
            print("[stream] no saved models — learning baselines from scratch",
                  flush=True)
        except Exception as e:
            print(f"[stream] could not load models ({e}); starting fresh", flush=True)

    def _save_sync(self):
        """Blocking save — only ever called off the hot path (thread/shutdown)."""
        try:
            os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
            tmp = MODEL_PATH + ".tmp"
            with open(tmp, "wb") as f:
                pickle.dump({"models": dict(self.models), "seen": dict(self.seen)}, f)
            os.replace(tmp, MODEL_PATH)  # atomic
        except Exception as e:
            print(f"[stream] model save failed: {e}", flush=True)

    async def save_async(self):
        # Pickle in a worker thread so the scoring loop never stalls.
        await asyncio.to_thread(self._save_sync)

    def as_dict(self, vec):
        return {f"f{i}": float(v) for i, v in enumerate(vec)}

    async def handle_event(self, conn, event_id: str):
        row = await conn.fetchrow(
            "SELECT id, host_id, source, payload, verdict, created_at "
            "FROM events WHERE id = $1", int(event_id)
        )
        if not row:
            return
        source = row["source"]
        payload = row["payload"]
        key = (row["host_id"], source)

        score = 0.0
        is_anom = False

        if source in FEATURE_FN:
            x = self.as_dict(FEATURE_FN[source](payload))
            model = self.models[key]
            score = float(model.score_one(x))   # score BEFORE learning
            model.learn_one(x)
            self.seen[key] += 1
            if self.seen[key] >= WARMUP and score >= THRESHOLD:
                is_anom = True
        elif source == "file":
            path = str(payload.get("file", ""))
            if any(path.startswith(s) for s in SENSITIVE_PATHS):
                score, is_anom = 1.0, True

        # Safety-critical automotive rule fast-path: known CAN attack patterns
        # (unknown arbitration ID = injection, or flooding cadence = DoS) alert
        # immediately, without waiting for ML warmup.
        if source == "canbus":
            can_id = str(payload.get("can_id", ""))
            interval = _f(payload.get("interval_ms"), 100.0)
            if can_id not in KNOWN_CAN_IDS or interval < CAN_FLOOD_INTERVAL_MS:
                is_anom, score = True, max(score, 0.95)

        # Latency: from insert (created_at) to now (scored).
        now = datetime.now(timezone.utc)
        latency_ms = (now - row["created_at"]).total_seconds() * 1000.0

        await conn.execute(
            "UPDATE events SET anomaly_score = $1, scored_at = $2, "
            "detect_latency_ms = $3, "
            "verdict = CASE WHEN verdict = 'blacklisted' THEN verdict "
            "              WHEN $4 THEN 'anomalous' ELSE verdict END "
            "WHERE id = $5",
            score, now, latency_ms, is_anom, int(event_id),
        )

        if is_anom:
            title, desc, sev, mitre, std = describe(source, payload)
            await conn.execute(
                "INSERT INTO alerts (host_id, event_id, severity, title, "
                "description, mitre_technique, standard_ref) "
                "VALUES ($1,$2,$3,$4,$5,$6,$7)",
                row["host_id"], int(event_id), sev, title, desc, mitre, std,
            )
            self.n_alerts += 1

        self.n_scored += 1
        self.latencies.append(latency_ms)
        if len(self.latencies) > 200:
            self.latencies.pop(0)
        if self.n_scored % 20 == 0:
            self.report()

    def report(self):
        if not self.latencies:
            return
        lat = sorted(self.latencies)
        avg = sum(lat) / len(lat)
        p95 = lat[int(len(lat) * 0.95) - 1]
        rate = self.n_scored / max(time.time() - self.t0, 1e-6)
        print(f"[stream] scored={self.n_scored} alerts={self.n_alerts} "
              f"avg={avg:.1f}ms p95={p95:.1f}ms throughput={rate:.0f}/s",
              flush=True)


async def _init(conn):
    await conn.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )


async def main():
    det = Detector()
    queue: asyncio.Queue = asyncio.Queue()

    # Dedicated listener connection.
    listen_conn = await asyncpg.connect(DATABASE_URL)
    await listen_conn.set_type_codec("jsonb", encoder=json.dumps,
                                     decoder=json.loads, schema="pg_catalog")

    def on_notify(conn, pid, channel, payload):
        queue.put_nowait(payload)

    await listen_conn.add_listener("new_event", on_notify)
    print(f"[stream] listening on 'new_event' — River HST, warmup={WARMUP}, "
          f"threshold={THRESHOLD}. Waiting for events…", flush=True)

    # Worker connection for scoring/writes.
    work_conn = await asyncpg.connect(DATABASE_URL)
    await work_conn.set_type_codec("jsonb", encoder=json.dumps,
                                   decoder=json.loads, schema="pg_catalog")

    # Periodic saver runs OFF the scoring path (every 30s, in a worker thread)
    # so persistence never adds latency to detection.
    async def periodic_save():
        while True:
            await asyncio.sleep(30)
            if det.n_scored:
                await det.save_async()

    saver = asyncio.create_task(periodic_save())

    try:
        while True:
            event_id = await queue.get()
            await det.handle_event(work_conn, event_id)
    finally:
        saver.cancel()
        det._save_sync()  # final persist on shutdown
        await listen_conn.remove_listener("new_event", on_notify)
        await listen_conn.close()
        await work_conn.close()


if __name__ == "__main__":
    asyncio.run(main())
