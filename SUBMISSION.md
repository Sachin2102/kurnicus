# Kurnicus — Hackathon Submission

## Project Title
**Kurnicus — Real-Time, Low-Power AI Security for Linux, IoT & Automotive Devices**

---

## Project Description

### Problem Statement
Billions of devices now run Linux where we can least afford a breach — cars, medical equipment, industrial controllers, and IoT. Yet securing them is hard:
- **Existing security tools are too heavy.** Enterprise EDR and tools like Falco/Wazuh assume server-class CPU/RAM and constant cloud connectivity. They don't fit a vehicle ECU or a low-power IoT board.
- **Detection is slow and after-the-fact.** Many tools evaluate rules in batches and ship everything to a cloud GPU farm — burning power and adding latency, when an attack on a moving vehicle needs a decision in milliseconds.
- **Alerts are unreadable.** Raw telemetry (`kbmemfree`, `tcp.dstport`, CAN IDs) and cryptic alerts mean only a trained analyst can act — useless for the small teams that actually run these fleets.

### Solution Overview
**Kurnicus is a host-based security platform that detects threats at the edge in milliseconds, on hardware that sips power, and explains every alert in plain English.**

A lightweight streaming machine-learning model runs on the device's own CPU and learns what *normal* looks like for that specific device. It scores every event in ~3 ms — no GPU, no cloud round-trip needed for detection. When something is wrong, an optional AI analyst turns the alert into a plain-language explanation with a recommended fix, and the whole dashboard is written for non-experts: it tells you *what you're seeing, whether it's a problem, and what to do.*

It is **domain-agnostic**: the same engine monitors a web server, an IoT sensor, or a car's CAN bus — you just configure which data sources to send.

### Key Features
- **Real-time edge detection (~3 ms).** Online/streaming anomaly detection (River Half-Space Trees), CPU-only, learns a separate baseline per device and per data source. Event-driven (PostgreSQL `LISTEN/NOTIFY`), so idle CPU is ~0%.
- **Low-power footprint.** ~150 MB RAM, ~0% idle CPU — runs on Raspberry-Pi-class hardware. No GPU required.
- **AI SOC analyst (optional).** NVIDIA NIM explains any alert as *Assessment → MITRE ATT&CK → Recommended action*, and summarizes any page in plain English. Detection works fully without it.
- **Understandable by anyone.** A Security Health Score (0–100), an "Action Center" that lists exactly what to review/why/how (most urgent first), per-row "Why is this suspicious?" explanations, charts, and a live-updating dashboard.
- **Multi-domain detection.** Network (C2/suspicious connections), processes (crypto-miners), memory, file access (credential theft), **logins (brute-force)**, and **automotive CAN bus (message injection & bus flooding)**.
- **Standards-mapped.** Every alert carries a MITRE ATT&CK technique; automotive alerts map to **UN R155** and **ISO/SAE 21434**.
- **One-command deploy.** `docker compose up` brings up the whole stack.

**Proven in testing:** with zero hand-written signatures, Kurnicus caught 20/20 crypto-miner processes, 39 command-and-control connections, brute-force login attempts, sensitive-file access, and CAN bus injection/flooding — purely from learned behaviour.

### Technologies Used
- **Detection / ML:** River (Half-Space Trees, online learning), scikit-learn (Isolation Forest), NumPy
- **AI:** NVIDIA NIM (Nemotron, OpenAI-compatible API)
- **Backend:** FastAPI, asyncpg, PostgreSQL 16 (JSONB events + `LISTEN/NOTIFY`), Uvicorn
- **Frontend:** React 18, Vite, Material UI, ApexCharts
- **Infra:** Docker & Docker Compose
- **Telemetry agent (legacy v1):** Bash, tshark, sysstat, iotop/ioping, AWS S3/EC2

### Target Users
- **Automotive software & security engineers** — runtime intrusion detection for Linux-based ECUs and in-vehicle networks (UN R155 / ISO 21434).
- **IoT & embedded manufacturers** — behavioural monitoring for constrained devices at scale.
- **Industrial / OT, medical, and kiosk operators** — configurable detection for any Linux endpoint.
- **DevOps / SecOps teams** — unified, low-overhead security observability across a Linux fleet.

---

## Project Link / Repository
**GitHub:** https://github.com/Sachin2102/kurnicus

*Live demo runs locally via `docker compose up` (see README Quick Start). Screenshots included in Project Files.*
