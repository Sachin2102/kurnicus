<div align="center">

# 🔬 KURNICUS
### Kernel-Native Linux Security Telemetry Platform

*Lightweight, real-time OS monitoring and anomaly detection for Linux-based IoT, embedded, and automotive systems*

![Bash](https://img.shields.io/badge/Agent-Bash-4EAA25?style=for-the-badge&logo=gnubash&logoColor=white)
![Python](https://img.shields.io/badge/Backend-Flask-000000?style=for-the-badge&logo=flask&logoColor=white)
![React](https://img.shields.io/badge/Frontend-React-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![AWS](https://img.shields.io/badge/Cloud-AWS%20S3%20%2B%20EC2-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white)

![CPU Usage](https://img.shields.io/badge/CPU%20Overhead-%3C3%25-brightgreen?style=flat-square)
![RAM](https://img.shields.io/badge/Min%20RAM-256%20MB-blue?style=flat-square)
![Compliance](https://img.shields.io/badge/Compliance-ISO%2021434%20%7C%20NIST%20CSF-orange?style=flat-square)

</div>

---

## What is Kurnicus?

Modern Linux environments are increasingly difficult to secure. Conventional monitoring tools typically raise alerts only after an issue has already caused damage, allowing hidden threats to persist undetected. Teams are burdened with multiple, fragmented tools that create blind spots and generate excessive false alarms.

**Kurnicus solves this** — it is a full-stack Linux security telemetry platform delivering real-time OS-level monitoring and threat detection in a single, low-overhead package. It hooks directly into the Linux kernel to observe system calls, file access, process creation, and network activity, then streams all telemetry to a cloud-backed visualization dashboard.

| Component | Folder | Role |
|-----------|--------|------|
| **Agent** | `agent/` | Runs on target Linux machines — collects telemetry across 10+ OS subsystems and streams to AWS S3 |
| **Dashboard** | `dashboard/` | Flask API + React frontend — fetches data from S3 and visualizes it in real time |

---

## Why Kurnicus?

### The Problem
- Security tools today alert **after** damage is done — not in real time
- Existing tools (Falco, Wazuh, Osquery) are too heavy for IoT and embedded Linux devices
- Teams juggle multiple fragmented tools, creating blind spots and alert fatigue

### The Kurnicus Advantage

| Area | Prior Art Limitation | Kurnicus Innovation |
|------|---------------------|---------------------|
| **Efficiency** | Falco and Wazuh consume significant CPU/RAM | Operates under **3% CPU load** using lightweight syscall filtering |
| **Integration** | Existing tools handle either security or performance, not both | Merges process, network, and file monitoring into a **unified stream** |
| **Simplicity** | Prior tools require YAML/JSON rule tuning | Runs with **zero configuration** and self-adjusting thresholds |
| **Scalability** | Most tools are server-centric | Supports **offline caching + cloud-sync** for thousands of edge nodes |

> **Novel Feature:** Dual-mode event handling (real-time + offline sync) ensures continuous coverage even during intermittent connectivity — a capability absent in comparable monitoring frameworks.

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
               │ HTTPS upload (TLS 1.3)
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
| `Network.sh` | tshark | Packets, IPs, ports — with blacklist/whitelist classification |
| `Liveprocess.sh` | top | Real-time processes with threat flags |
| `Process_info.sh` | ps | Full process snapshots |
| `Memory.sh` | sar | Free, used, cached, buffers over time |
| `File_monitoring.sh` | inotify | Create/modify/delete events with user attribution |
| `Kernel.sh` | dmesg | Kernel messages and hardware events |
| `iostat.sh` | iostat | Read/write throughput per device |
| `ioping.sh` | ioping | I/O latency measurements |
| `iotop.sh` | iotop | Per-process disk activity |
| `memmapshlib.sh` | custom | Shared library memory mapping |

All modules run **in parallel** as background processes and upload their output to AWS S3 every collection interval.

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

You will be prompted to enter:
1. EC2 public IP address
2. Network interface to monitor (e.g. `eth0`, `ens3`)

The agent displays available monitoring modules and lets you select which ones to run.

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

## System Requirements

| Category | Requirement |
|----------|-------------|
| **Hardware** | Linux-based server or embedded board (256 MB RAM min) |
| **Linux Kernel** | ≥ 5.4 |
| **Python** | 3.10+ (dashboard backend) |
| **Libraries** | libpcap, openssl, systemd |
| **Cloud** | AWS EC2 (t2.micro) + S3 bucket + IAM role |

Tested on: standard Linux servers, Raspberry Pi 4, Yocto-based automotive ECUs.

---

## Project Structure

```
kurnicus/
├── agent/                    # Linux telemetry collection agent
│   ├── Cloud/                # EC2 receiver (server.py + config.json)
│   ├── SERVICEFILE/          # Monitoring scripts + orchestrator (servicev2.sh)
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

## Exploit & Benchmark Testing

The `agent/Exploits/` folder contains scripts for validating detection coverage:

- `audit.sh` — Audit-based attack simulations
- `Benchmark_Testing.sh` — CPU/memory stress tests to validate resource monitoring
- `netben.sh` — Network traffic benchmarking

> These are for **authorized security testing only** on systems you own or have explicit permission to test.

---

## Compliance

Kurnicus is designed to support compliance with:

- **ISO 21434** — Road vehicles cybersecurity engineering (automotive)
- **NIST CSF** — National Institute of Standards and Technology Cybersecurity Framework

Data is transmitted via HTTPS with end-to-end encryption and integrity checks.

---

## Target Users

- **IoT & Embedded Device Manufacturers** — monitor constrained Linux devices at scale
- **Automotive Software Engineers** — runtime security for ECUs and Linux-based vehicle systems
- **DevOps / SecOps teams** — unified observability across Linux fleets without the overhead

---

## Compared to Alternatives

| Tool | Overhead | IoT-Ready | Real-Time | Zero Config | Unified Stream |
|------|----------|-----------|-----------|-------------|----------------|
| **Kurnicus** | <3% CPU | ✅ | ✅ | ✅ | ✅ |
| Falco (CNCF) | High | ❌ | ✅ | ❌ | ❌ |
| Wazuh | High | ❌ | Partial | ❌ | ❌ |
| Osquery | Medium | ❌ | ❌ | ❌ | ❌ |

---

## ⚠️ Security

- Never commit real AWS credentials — use `.env` files (see `dashboard/backend/.env.example`)
- `agent/Cloud/config.json` contains placeholder values — fill in your own before deploying
- Scripts in `Exploits/` are for **authorized testing only** on systems you own
