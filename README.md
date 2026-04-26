<div align="center">

# 🔬 KURNICUS
### Linux Security Telemetry Platform

**Collect · Stream · Visualize · Detect**

![Bash](https://img.shields.io/badge/Agent-Bash-4EAA25?style=for-the-badge&logo=gnubash&logoColor=white)
![Python](https://img.shields.io/badge/Backend-Flask-000000?style=for-the-badge&logo=flask&logoColor=white)
![React](https://img.shields.io/badge/Frontend-React-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![AWS](https://img.shields.io/badge/Cloud-AWS%20S3-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white)

</div>

---

## What is Kurnicus?

Kurnicus is a full-stack Linux security telemetry platform for real-time OS-level monitoring and threat detection. It has two components that work together:

| Component | Folder | Role |
|-----------|--------|------|
| **Agent** | `agent/` | Runs on target Linux machines — collects telemetry across 10+ OS subsystems and streams to AWS S3 |
| **Dashboard** | `dashboard/` | Flask API + React frontend — fetches data from S3 and visualizes it in real time |

---

## Architecture

```
┌─────────────────────────────────────┐
│         Target Linux Machine        │
│  agent/SERVICEFILE/servicev2.sh     │
│    ├── Network.sh   (tshark)        │
│    ├── Liveprocess.sh  (top)        │
│    ├── Memory.sh    (sar)           │
│    ├── File_monitoring.sh (inotify) │
│    ├── Kernel.sh    (dmesg)         │
│    └── iostat / iotop / ioping ...  │
└──────────────┬──────────────────────┘
               │ HTTP upload
               ▼
┌─────────────────────────────────────┐
│     EC2 Receiver (agent/Cloud/)     │
└──────────────┬──────────────────────┘
               │ boto3
               ▼
┌─────────────────────────────────────┐
│          AWS S3 Bucket              │
│       output/logs_*.txt             │
└──────────────┬──────────────────────┘
               │ boto3
               ▼
┌─────────────────────────────────────┐
│   dashboard/backend (Flask API)     │
└──────────────┬──────────────────────┘
               │ REST API
               ▼
┌─────────────────────────────────────┐
│   dashboard/frontend (React/Vite)   │
│  Network · Memory · Process · File  │
└─────────────────────────────────────┘
```

---

## Features

### 🕵️ Agent — Monitoring Modules

| Module | Tool | What it collects |
|--------|------|-----------------|
| Network | tshark | Packets, IPs, ports — with blacklist/whitelist classification |
| Live Process | top | Real-time processes with threat flags |
| Process Info | ps | Full process snapshots |
| Memory | sar | Free, used, cached, buffers over time |
| File Integrity | inotify | Create/modify/delete events with user attribution |
| Kernel | dmesg | Kernel messages and hardware events |
| Disk I/O | iostat | Read/write throughput per device |
| Disk Latency | ioping | I/O latency measurements |
| I/O per Process | iotop | Per-process disk activity |

### 📊 Dashboard — Views

- **Network** — Packet table with blacklisted/whitelisted IP counts and filters
- **File Integrity** — Chronological file event log with threat classification
- **Process Inspector** — Snapshot tables with blacklisted process highlighting
- **Memory Analytics** — Charts of memory usage metrics over time
- **Live Process Feed** — Continuously updated process monitor
- **Export** — Download all telemetry logs as a ZIP archive

---

## Quick Start

### Step 1 — Set up the EC2 receiver

```bash
# Copy agent/Cloud/server.py and agent/Cloud/config.json to your EC2 instance
# Fill in your S3 bucket name and AWS credentials in config.json
pip3 install boto3
python3 server.py
```

### Step 2 — Install and run the agent on your Linux machine

```bash
cd agent/requirement
chmod +x prerequisite.sh && sudo ./prerequisite.sh
```

```bash
# Edit agent/SERVICEFILE/config.json with your EC2 IP,
# whitelisted processes, and IPs
cd agent/SERVICEFILE
chmod +x servicev2.sh
sudo ./servicev2.sh
```

### Step 3 — Run the dashboard

```bash
# Backend
cd dashboard/backend
pip install -r requirements.txt
cp .env.example .env    # add your AWS credentials
python app.py           # http://localhost:5000
```

```bash
# Frontend (new terminal)
cd dashboard/frontend
npm install
npm run dev             # http://localhost:5173
```

---

## Project Structure

```
kurnicus/
├── agent/                    # Linux telemetry collection agent
│   ├── Cloud/                # EC2 receiver
│   ├── SERVICEFILE/          # Monitoring scripts + orchestrator
│   ├── Exploits/             # Benchmark & security testing scripts
│   ├── requirement/          # Prerequisite installer
│   └── Documentations/       # Docs & testing methodology
│
└── dashboard/                # Visualization platform
    ├── backend/              # Flask REST API (reads from S3)
    └── frontend/             # React + Vite + MUI dashboard
```

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Agent | Bash, Python, tshark, inotify-tools, sysstat, iotop, ioping |
| Backend | Python, Flask, Flask-CORS, boto3 |
| Frontend | React 18, Vite, Material UI, ApexCharts, React Router, Axios |
| Cloud | AWS S3, AWS EC2 |

---

## ⚠️ Security

- Never commit real AWS credentials — use `.env` files (see `dashboard/backend/.env.example`)
- `agent/Cloud/config.json` contains placeholder values — fill in your own before deploying
- Scripts in `Exploits/` are for **authorized testing only** on systems you own
