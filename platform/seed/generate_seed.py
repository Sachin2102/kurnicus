"""
Kurnicus seed generator.

Populates the database with realistic telemetry for a couple of hosts so we
can build and demo the dashboard + detection without live agents running.
Deliberately mixes in some anomalous/blacklisted events so Phase 3 detection
and the Phase 4 AI analyst have something to find.

Run inside the compose network:  python generate_seed.py
"""
import asyncio
import json
import os
import random
from datetime import datetime, timedelta, timezone

import asyncpg

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://kurnicus:kurnicus@db:5432/kurnicus"
)

HOSTS = [
    {"hostname": "web-01", "ip": "10.0.1.10", "os": "Ubuntu 22.04"},
    {"hostname": "db-01", "ip": "10.0.1.20", "os": "Debian 12"},
    # Automotive edge units (Automotive Grade Linux compute nodes).
    {"hostname": "telematics-ecu-01", "ip": "192.168.7.2", "os": "Automotive Grade Linux"},
    {"hostname": "infotainment-01", "ip": "192.168.7.5", "os": "Automotive Grade Linux"},
]

# Normal in-vehicle CAN arbitration IDs (must match detect.KNOWN_CAN_IDS).
KNOWN_CAN_IDS = ["0x0C9", "0x0D1", "0x1A0", "0x1B0", "0x244", "0x316", "0x329", "0x545"]

NORMAL_IPS = ["10.0.1.10", "10.0.1.20", "10.0.1.1", "8.8.8.8", "140.82.112.3"]
SUSPICIOUS_IP = "185.220.101.44"  # stands in for a known-bad / C2 address
PROCS = ["nginx", "postgres", "sshd", "systemd", "python3", "cron"]
SUSPICIOUS_PROC = "xmrig"  # crypto-miner, a classic host-compromise signal


def _ts(minutes_ago: float) -> datetime:
    return datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)


def network_payload(i: int, anomalous: bool) -> dict:
    dst = SUSPICIOUS_IP if anomalous else random.choice(NORMAL_IPS)
    return {
        "frame.number": str(i),
        "frame.time": _ts(random.uniform(0, 240)).strftime("%b %d, %Y %H:%M:%S"),
        "ip.src": "10.0.1.10",
        "ip.dst": dst,
        "tcp.srcport": str(random.randint(1024, 65535)),
        "tcp.dstport": "443" if not anomalous else "4444",
        "udp.srcport": "",
        "udp.dstport": "",
        "frame.len": str(random.randint(64, 1500)),
        "frame.protocols": "eth:ethertype:ip:tcp",
        "listing": "Blacklisted" if anomalous else "Valid IP",
    }


def liveprocess_payload(anomalous: bool) -> dict:
    name = SUSPICIOUS_PROC if anomalous else random.choice(PROCS)
    return {
        "listing": "BLACKLISTED" if anomalous else "WHITELISTED",
        "PID": str(random.randint(100, 30000)),
        "USER": "root" if anomalous else "www-data",
        "PR": "20",
        "NI": "0",
        "VIRT": str(random.randint(10000, 900000)),
        "RES": str(random.randint(1000, 90000)),
        "SHR": str(random.randint(500, 20000)),
        "S": "R" if anomalous else "S",
        "%CPU": f"{random.uniform(95, 100):.1f}" if anomalous else f"{random.uniform(0, 5):.1f}",
        "%MEM": f"{random.uniform(0, 8):.1f}",
        "TIME+": "0:12.34",
        "COMMAND": name,
    }


def memory_payload() -> dict:
    return {
        "time": _ts(random.uniform(0, 240)).strftime("%H:%M:%S"),
        "kbmemfree": str(random.randint(100000, 900000)),
        "kbavail": str(random.randint(100000, 900000)),
        "kbmemused": str(random.randint(500000, 3000000)),
        "%memused": f"{random.uniform(20, 85):.2f}",
        "kbbuffers": str(random.randint(1000, 50000)),
        "kbcached": str(random.randint(100000, 800000)),
        "kbcommit": str(random.randint(500000, 2000000)),
        "%commit": f"{random.uniform(20, 90):.2f}",
        "kbactive": str(random.randint(100000, 900000)),
        "kbinact": str(random.randint(100000, 900000)),
        "kbdirty": str(random.randint(0, 5000)),
    }


def file_payload(anomalous: bool) -> dict:
    path = "/etc/shadow" if anomalous else random.choice(
        ["/var/www/index.html", "/var/log/nginx/access.log", "/tmp/session"]
    )
    return {
        "timestamp": _ts(random.uniform(0, 240)).strftime("%Y-%m-%d %H:%M:%S"),
        "user": "root" if anomalous else "www-data",
        "group": "root" if anomalous else "www-data",
        "event": "OPEN",
        "file": path,
        "listing": "Blacklist" if anomalous else "Whitelist",
    }


def auth_payload(anomalous: bool) -> dict:
    """Login/authentication events — universal to any device with accounts."""
    if not anomalous:
        return {
            "event": "login",
            "user": random.choice(["alice", "bob", "svc-app", "operator"]),
            "result": "success",
            "source_ip": random.choice(["10.0.1.50", "10.0.1.51", "192.168.7.9"]),
            "failed_count": 0,
        }
    # Brute-force: many failed attempts against a privileged account from a bad IP.
    return {
        "event": "login",
        "user": random.choice(["root", "admin"]),
        "result": "failed",
        "source_ip": random.choice(["185.220.101.44", "45.155.205.7", "89.248.165.2"]),
        "failed_count": random.randint(15, 80),
    }


def canbus_payload(anomalous: bool) -> dict:
    """Normal: a known CAN ID at a steady cadence. Anomalous: injected unknown
    ID (spoofing) or flooding cadence (DoS)."""
    if not anomalous:
        return {
            "can_id": random.choice(KNOWN_CAN_IDS),
            "dlc": 8,
            "data": " ".join(f"{random.randint(0,255):02X}" for _ in range(8)),
            "interval_ms": round(random.uniform(8, 100), 1),
            "bus": "can0",
        }
    if random.random() < 0.5:
        # Injection: an arbitration ID the vehicle never legitimately uses.
        return {
            "can_id": random.choice(["0x7DF", "0x666", "0x400", "0x0FF"]),
            "dlc": 8,
            "data": " ".join(f"{random.randint(0,255):02X}" for _ in range(8)),
            "interval_ms": round(random.uniform(8, 100), 1),
            "bus": "can0",
        }
    # Flooding: a known ID hammered far above its normal cadence.
    return {
        "can_id": random.choice(KNOWN_CAN_IDS),
        "dlc": 8,
        "data": "00 00 00 00 00 00 00 00",
        "interval_ms": round(random.uniform(0.3, 2.5), 1),
        "bus": "can0",
    }


async def main() -> None:
    pool = await asyncpg.create_pool(DATABASE_URL)
    async with pool.acquire() as conn:
        # Fresh start each run so the demo is deterministic-ish.
        await conn.execute("TRUNCATE alerts, events, hosts RESTART IDENTITY CASCADE")

        host_ids = {}
        for h in HOSTS:
            hid = await conn.fetchval(
                "INSERT INTO hosts (hostname, ip, os, agent_token) "
                "VALUES ($1,$2,$3,$4) RETURNING id",
                h["hostname"], h["ip"], h["os"], f"token-{h['hostname']}",
            )
            host_ids[h["hostname"]] = hid

        rows = []
        for hostname, hid in host_ids.items():
            for i in range(1, 401):
                anom = random.random() < 0.05  # ~5% anomalies
                rows.append((hid, _ts(random.uniform(0, 240)), "network",
                             json.dumps(network_payload(i, anom)),
                             "blacklisted" if anom else "valid"))
            for _ in range(200):
                anom = random.random() < 0.04
                rows.append((hid, _ts(random.uniform(0, 240)), "liveprocess",
                             json.dumps(liveprocess_payload(anom)),
                             "blacklisted" if anom else "valid"))
            for _ in range(150):
                rows.append((hid, _ts(random.uniform(0, 240)), "memory",
                             json.dumps(memory_payload()), "valid"))
            for _ in range(120):
                anom = random.random() < 0.06
                rows.append((hid, _ts(random.uniform(0, 240)), "file",
                             json.dumps(file_payload(anom)),
                             "blacklisted" if anom else "valid"))
            # Authentication/login telemetry — every device with user accounts.
            for _ in range(150):
                anom = random.random() < 0.05
                rows.append((hid, _ts(random.uniform(0, 240)), "auth",
                             json.dumps(auth_payload(anom)),
                             "blacklisted" if anom else "valid"))
            # CAN bus telemetry only for the automotive edge units.
            if "ecu" in hostname or "infotainment" in hostname:
                for _ in range(300):
                    anom = random.random() < 0.05
                    rows.append((hid, _ts(random.uniform(0, 240)), "canbus",
                                 json.dumps(canbus_payload(anom)),
                                 "blacklisted" if anom else "valid"))

        await conn.executemany(
            "INSERT INTO events (host_id, ts, source, payload, verdict) "
            "VALUES ($1,$2,$3,$4::jsonb,$5)",
            rows,
        )
        total = await conn.fetchval("SELECT count(*) FROM events")
        print(f"Seeded {total} events across {len(host_ids)} hosts.")
    await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
