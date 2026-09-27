"""
Live telemetry stream simulator.

Inserts events continuously (like a vehicle's telematics/infotainment units
streaming in) so the streaming detector has real-time traffic to score. Mixes
in occasional threats (crypto-miner, C2 traffic, sensitive-file access) so you
can watch them get caught in real time.

Run: docker compose --profile realtime run --rm streamgen
     docker compose --profile realtime run --rm streamgen python stream_events.py --rate 20 --duration 60
"""
import argparse
import asyncio
import json
import os
import random
from datetime import datetime, timezone

import asyncpg

# Reuse the payload builders from the batch seeder.
from generate_seed import (
    auth_payload, canbus_payload, file_payload, liveprocess_payload,
    memory_payload, network_payload,
)

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://kurnicus:kurnicus@db:5432/kurnicus"
)


def make_event(i: int, automotive: bool):
    """Pick a random source and build a payload; ~4% are threats.
    Automotive hosts also emit CAN bus traffic."""
    sources = ["network", "liveprocess", "memory", "file", "auth"]
    weights = [0.4, 0.2, 0.12, 0.1, 0.1]
    if automotive:
        sources.append("canbus")
        weights.append(0.3)
    source = random.choices(sources, weights=weights)[0]
    anom = random.random() < 0.04
    if source == "network":
        return source, network_payload(i, anom), ("blacklisted" if anom else "valid")
    if source == "liveprocess":
        return source, liveprocess_payload(anom), ("blacklisted" if anom else "valid")
    if source == "memory":
        return source, memory_payload(), "valid"
    if source == "canbus":
        return source, canbus_payload(anom), ("blacklisted" if anom else "valid")
    if source == "auth":
        return source, auth_payload(anom), ("blacklisted" if anom else "valid")
    return source, file_payload(anom), ("blacklisted" if anom else "valid")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rate", type=int, default=15, help="events per second")
    ap.add_argument("--duration", type=int, default=45, help="seconds to run")
    args = ap.parse_args()

    conn = await asyncpg.connect(DATABASE_URL)
    hosts = await conn.fetch("SELECT id, hostname FROM hosts")
    if not hosts:
        print("No hosts. Run the seed first: docker compose run --rm seed")
        return

    interval = 1.0 / args.rate
    deadline = asyncio.get_event_loop().time() + args.duration
    i, n = 0, 0
    print(f"Streaming ~{args.rate} events/s for {args.duration}s across "
          f"{len(hosts)} hosts…", flush=True)
    while asyncio.get_event_loop().time() < deadline:
        host = random.choice(hosts)
        automotive = "ecu" in host["hostname"] or "infotainment" in host["hostname"]
        source, payload, verdict = make_event(i, automotive)
        # ts = now so detection latency reflects true real-time behavior.
        await conn.execute(
            "INSERT INTO events (host_id, ts, source, payload, verdict) "
            "VALUES ($1,$2,$3,$4::jsonb,$5)",
            host["id"], datetime.now(timezone.utc), source,
            json.dumps(payload), verdict,
        )
        i += 1
        n += 1
        if n % 50 == 0:
            print(f"  inserted {n} events…", flush=True)
        await asyncio.sleep(interval)
    print(f"Done. Inserted {n} events.", flush=True)
    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
