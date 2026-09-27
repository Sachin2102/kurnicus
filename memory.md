# Kurnicus — Project Memory

> Single source of truth for context. Paste this file (or link it) into a new chat to resume work without losing context.
> **Last updated:** 2026-09-25

---

## 0. How to use this file
- This is the living context/handoff doc for the **Kurnicus** project.
- When we make decisions or changes, they get appended to the **Changelog** at the bottom.
- GitHub: https://github.com/Sachin2102/kurnicus  (local folder `E:\Project\Kurnicus` = same files; "Kurnicus" is just the project/pitch name for the code below).
- Owner: Sachin (sachin.rai8012.sr@gmail.com).

---

## 1. What Kurnicus actually is (one line)
A **host-based Linux security monitoring / telemetry system** (an "EDR-lite" / HIDS): lightweight agents collect OS telemetry from Linux hosts → stream to a cloud collector → store in S3 → a web dashboard visualizes it and flags traffic/processes via static whitelist/blacklist.

---

## 2. Architecture (3 layers)

```
[ Monitored Linux host(s) ]                [ AWS EC2 ]              [ AWS S3 ]         [ Analyst / Ops ]
  Bash telemetry agents        raw TCP        server.py            output/logs_*.txt     React dashboard
  (SERVICEFILE/*.sh)        ports 8880-8890   (threaded socket   ───────────────►      (Linux_Sentinel
  servicev2.sh orchestrates ───────────────►  listener, appends    (append-only         /frontend)
  config.json = whitelists    plaintext        to S3 text files)    text logs)               ▲
                                                                                              │ REST JSON
                                                                              Flask backend (app.py)
                                                                              reads+parses S3 → JSON API
```

### Layer A — Telemetry Agent  (`FInal_OSTelem2/FInal_OSTelem/`)
Bash scripts run on the monitored host, each pipes a Linux tool's output over a raw TCP socket (`/dev/tcp/<ip>/<port>`) to the cloud collector. Ports → source:
| Port | Script | Collects |
|------|--------|----------|
| 8880 | Kernel.sh | auditd kernel audit log (`/var/log/audit/audit.log`) |
| 8881 | iotop.sh | per-process disk I/O |
| 8882 | iostat.sh | device I/O stats |
| 8883 | sar.sh | system activity |
| 8884 | ioping.sh | disk latency |
| 8885 | Network.sh | `tshark` packet capture + IP whitelist tagging |
| 8886 | Memory.sh | memory stats |
| 8887 | File_monitoring.sh | file access events + whitelist tagging |
| 8888 | memmapshlib.sh | memory maps / shared libs |
| 8889 | Liveprocess.sh | `top` snapshot + process whitelist tagging |
| 8890 | Process_info.sh | process metadata |
- `servicev2.sh` = orchestrator (prompts for collector IP + interface, runs chosen/all scripts).
- `SERVICEFILE/config.json` = `{ process: [...whitelist], IPs: [...whitelist] }` (read via `jq`).
- `requirement/prerequisite.sh` installs deps (tshark, jq, sysstat, auditd, etc.); `clean.sh` tears down.
- Detection today = **static string match** against whitelist → tags rows "Valid IP/WHITELISTED" vs "Blacklisted/BLACKLISTED". No real intelligence.

### Layer B — Cloud Collector  (`FInal_OSTelem2/FInal_OSTelem/Cloud/server.py`)
- Python + `boto3`. Spawns one thread per port (8880-8890), accepts TCP, appends received bytes to `output/logs_<type>.txt` in S3.
- Credentials read from `Cloud/config.json` (bucket, access key, secret).
- **No TLS, no auth, no backpressure, append-only text files.**

### Layer C — Visualization  (`Linux_Sentinel/`)
- **backend/app.py** — Flask + Flask-CORS. Endpoints pull each `logs_*.txt` from S3 bucket `ostelemetry2`, parse text→JSON: `/network_logs`, `/file_logs`, `/process_info`, `/memory_logs`, `/liveprocess_logs`, `/download_all_files` (zips all logs). Debug server (`app.run(debug=True)`).
- **frontend/** — React 18 + Vite + MUI + ApexCharts + axios + react-router. Components: Header, Sidebar, HeroSection (dashboard), NetworkLogs, FileLogs, ProcessLogs, MemoryLogs, LiveProcessLogs. Routes map 1:1 to backend endpoints.

---

## 3. KNOWN ISSUES / TECH DEBT (fix before pitching)
1. **🔴 CRITICAL: hardcoded AWS keys in `Linux_Sentinel/backend/app.py`** (`AKIA****REDACTED****` + secret). If repo is/was public, key is compromised → **deactivate in IAM, remove from code + git history, switch to env vars / IAM roles.**
2. Raw TCP, unencrypted, unauthenticated transport (Layers A→B). No mutual TLS, anyone can inject logs.
3. Append-only **text files in S3** = no indexing, expensive re-parse on every dashboard load, no retention policy, race conditions on concurrent writes.
4. Detection is **static whitelist/blacklist only** — no anomaly detection, no behavioral baseline, high false negatives.
5. Flask runs in `debug=True` (not production-safe). No auth on dashboard/API.
6. Hardcoded Windows path in `download_all_files` (`D:\SEMESTER_8\...`).
7. `eth0` hardcoded in Network.sh; brittle parsing across backend endpoints.
8. No multi-host identity — logs from many hosts collide into one file per type.

---

## 4. AI / ENHANCEMENT DIRECTION (agreed target)
Turn the static-rule tool into an **AI-assisted detection + SOC-analyst platform**. Three AI layers (see full analysis doc / section 5):
- **L1 – Classical ML anomaly detection** (Isolation Forest / River streaming) on structured telemetry. Local, cheap, fast.
- **L2 – LLM "SOC analyst"** via **NVIDIA NIM** (build.nvidia.com, OpenAI-compatible REST; Llama/Nemotron) — summarizes alerts, explains audit logs in plain English, recommends actions, maps to MITRE ATT&CK.
- **L3 – Hugging Face** for embeddings (log similarity/clustering) + a lightweight text-classification triage model.
- Recommendation: **NVIDIA NIM for the LLM reasoning layer** (managed API, free starter credits, no GPU to run), **Hugging Face for embeddings/small classifiers**, **scikit-learn/River for the numeric anomaly layer**.

---

## 5. Pitch framing
- Positioning: "**Open, cloud-native Linux EDR with an AI SOC analyst**" — affordable alternative to CrowdStrike/Wazuh for SMBs, labs, and education.
- Real-world users: SMB IT/security teams, MSSPs, cloud/DevOps teams, universities/security courses, CTF/lab environments.

---

## 4b. DECISIONS (locked 2026-09-25)
- Goal: **portfolio-first, but on product-grade foundations** (grow to product later).
- Dev env: **local Docker Compose first** (no AWS needed to develop; deploy to AWS later).
- Test host: **WSL (Ubuntu) now**, VMware later. Synthetic seed data used to build/demo without live agents.
- Stack: **Postgres (JSONB) + FastAPI + Docker Compose**, reuse existing React frontend. Legacy code kept untouched as reference.
- AWS key issue: owner says the key in `app.py` is fake/for-docs — ignored for now (still remove before any real repo publish).

## 4c. CURRENT STATE — Phase 1 DONE & RUNNING ✅ (new code in `platform/`)
- `platform/db/schema.sql` — `hosts`, `events` (JSONB payload + anomaly_score + verdict), `alerts`. Multi-host by design.
- `platform/api/` — FastAPI (asyncpg pool w/ JSON codec). Endpoints:
  - new: `GET /health`, `GET /api/hosts`, `GET /api/events?source=&host=&limit=`
  - frontend-compatible: `/network_logs`, `/liveprocess_logs`, `/memory_logs`, `/file_logs`, `/process_info`
- `platform/seed/generate_seed.py` — synthetic telemetry, 2 hosts (web-01, db-01), ~5% anomalies (bad IP 185.220.101.44, xmrig miner, /etc/shadow access). Seeded **1740 events**.
- `platform/docker-compose.yml` — postgres:16 + api + one-shot `seed` service.
- **Verified working:** health ok; network_logs 42 blacklisted / 758 valid; liveprocess 24 / 376; `/api/events` returns structured rows. API docs at http://localhost:8000/docs.

### How to run (from Windows or WSL)
```bash
cd platform
docker compose up --build -d      # Docker Desktop must be running
docker compose run --rm seed      # load synthetic data
curl http://localhost:8000/health
```
Docker Desktop exe: `C:\Users\sachi\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe`. WSL lacks docker integration (use Windows docker CLI, which works).

## 4e. Phase 3 — DETECTION ENGINE DONE ✅ (`platform/detector/`)
- `detector/detect.py` — **Isolation Forest** anomaly detection per numeric source (network, liveprocess, memory) + **rule-based** detection for file (sensitive-path access). Writes `events.anomaly_score` (0..1), promotes `verdict` 'valid'→'anomalous' (never overwrites 'blacklisted'), inserts `alerts` rows with title/severity/**MITRE technique**.
  - Features: network=[frame.len, dst_port, uncommon_port]; liveprocess=[%CPU,%MEM,is_root,VIRT,RES]; memory=[%memused,%commit,kbdirty]. contamination=0.05.
  - MITRE mapping (heuristic, AI will enrich in P4): network→T1071, process→T1496, memory→T1499, file/shadow→T1003.
- Run: `docker compose run --rm detector` (one-shot) or `... detector python detect.py --loop 30` (continuous). Added `detector` service to compose (built image).
- **New API endpoints:** `GET /api/alerts` (filter status/severity, sorted by severity), `GET /api/alerts/summary`.
- **Frontend:** HeroSection ALERTS card now pulls `/api/alerts/summary` (real detector count).
- **VERIFIED:** 89 alerts generated. Caught **all planted threats with NO signatures for them**: 20/20 `xmrig` miners (T1496), 39 C2 conns to 185.220.101.44:4444 (T1071), /etc/shadow access (T1003). Dashboard ALERTS shows 89.

## 4f. Alerts UI DONE ✅ (`Linux_Sentinel/frontend/src/components/Alerts/`)
- New **Alerts page** (`/alerts` route, sidebar link added at top): summary tiles (Total/High/Medium/Low), severity filter buttons (all/high/medium/low, working), table with color-coded severity chips, host, title, description, **clickable MITRE technique links** (→ attack.mitre.org), status chips, and **Ack/Resolve action buttons**.
- New API endpoint: `PATCH /api/alerts/{id}` body `{"status": "open|acknowledged|resolved"}` (validated). Tested working.
- HeroSection dashboard ALERTS card already shows real count (89).
- VERIFIED in browser: page renders, filters work, chips colored correctly.
- Files: `components/Alerts/Alerts.jsx`, `Alerts.css`; edits to `App.jsx`, `Sidebar/Sidebar.jsx`.

## 4g. Phase 4 — AI SOC ANALYST DONE ✅ (WORKING END-TO-END)
- `api/ai.py` — OpenAI-compatible client for NVIDIA NIM (`https://integrate.api.nvidia.com/v1`). Env: `NVIDIA_API_KEY`, `NVIDIA_MODEL`. SYSTEM_PROMPT = SOC analyst → ASSESSMENT/MITRE/ACTION. Handles reasoning models (reads `reasoning_content` if `content` empty). max_tokens=1024.
- API endpoints: `GET /api/ai/status`, `POST /api/alerts/{id}/explain` (fetches alert+event, calls NIM, stores `alerts.ai_summary`, returns it). Graceful 503 if no key, 502 on upstream error.
- `api/requirements.txt` += `openai==1.51.0` + **`httpx==0.27.2`** (CRITICAL PIN: openai 1.51 breaks on httpx≥0.28 with `Client got unexpected kwarg 'proxies'`).
- Config: `platform/.env` (GITIGNORED, holds real key) with `NVIDIA_API_KEY` + `NVIDIA_MODEL`. Compose passes them to `api`. `.env.example` documents it.
- Frontend Alerts page: checks `/api/ai/status`; shows "✨ AI" button per alert → renders purple **🛡️ AI SOC Analyst** panel below the row.
- **MODEL DISCOVERY (as of 2026-09-25, this account's key):** Llama family (3.1/3.3 8b/70b/…) all **410 GONE (EOL)**. Many text models **404 "Function not found for account"** (not provisioned). **WORKING model = `nvidia/nemotron-3-super-120b-a12b`** (returns 200; it's a REASONING model, ~30-60s latency, can 503 when overloaded → retry). Vision models (llama-3.2-90b/11b-vision) accessible but time out (000). To find a working model later: `curl https://integrate.api.nvidia.com/v1/models -H "Authorization: Bearer $KEY"` then probe with a tiny chat request; look for 200/503 (accessible) vs 404/410 (no).
- **VERIFIED:** xmrig alert → live AI output: "ASSESSMENT: cryptocurrency miner (xmrig) executing as root at 96% CPU... MITRE: T1496 – Resource Hijacking. ACTION: terminate PID 26121, quarantine the binary, verify no persistence on db-01." Rendered in UI panel. Pulled real PID + hostname from telemetry.
- NOTE: NVIDIA key was pasted in chat + stored in `platform/.env` (gitignored, safe from commits). If repo ever goes public, key is not in git, but rotate if chat/key leaks.

## 4h. REAL-TIME STREAMING DETECTION + AI MODAL DONE ✅ (2026-09-26)
**Strategic pivot: targeting AUTOMOTIVE + low-power/edge sectors** (tool must run on low-power devices, not big-tech GPU farms). Key architecture principle: **heavy LLM is NEVER in the real-time path** — edge ML detects (<2s, low power), cloud LLM only explains alerts async for human analysts. Offline vehicle is still fully protected (no LLM needed for detection).

**AI panel → MODAL** (`components/Alerts/Alerts.jsx` + `Alerts.css`):
- Clicking "✨ AI" opens a centered modal (backdrop blur) parsing the model output into **Assessment / MITRE ATT&CK / Recommended action** (green-highlighted) sections. Loading spinner, Re-analyze, click-outside/Close. Alerts with stored summary show "🛡️ View" (instant). `parseAnalysis()` splits ASSESSMENT/MITRE/ACTION. Removed old inline row. VERIFIED in browser.

**Real-time streaming detector** (`detector/stream.py`, River online ML):
- **Event-driven via Postgres LISTEN/NOTIFY** (trigger `events_notify` → channel `new_event`; migration `db/02_realtime.sql`, also folded into `schema.sql`). No polling = ~zero idle CPU/power (edge story).
- **River `HalfSpaceTrees` + `MinMaxScaler`** pipeline, **per-(host,source) model** (each unit learns its own baseline). WARMUP=40 events, THRESHOLD=0.72. Pure-Python, CPU-only, no GPU, no batch retraining.
- Reuses `detect.py` feature fns + `describe()`. File source = sensitive-path rule.
- Writes `events.anomaly_score`, `scored_at`, `detect_latency_ms`, verdict; inserts alerts in real time.
- **Latency instrumentation:** new cols `events.scored_at`, `events.detect_latency_ms` (= created_at→scored).
- `detector/requirements.txt` += `river==0.21.1`; **numpy pinned 1.26.4** (river needs numpy<2.0 — do NOT bump to 2.x).
- Live generator: `seed/stream_events.py` (`--rate`, `--duration`), reuses `generate_seed.py` payload builders, inserts ~4% threats with ts=now.
- Compose services `stream` + `streamgen` under **profile `realtime`** (don't auto-start). Run:
  `docker compose --profile realtime up -d stream`
  `docker compose --profile realtime run --rm streamgen sh -c "pip install -q -r requirements.txt && python stream_events.py --rate 20 --duration 40"`
- **PROVEN RESULT (753 live events):** avg **3.34ms**, p95 **3.99ms**, max 76.83ms detection latency. ~650× under the 2s target. Real-time alerts raised after warmup.

**Metrics surfaced in product:**
- API `GET /api/metrics` (events_total/scored, avg/p95/max latency ms, events_last_60s).
- Dashboard HeroSection: real-time metrics banner (avg latency, p95, events scored, last 60s) — `rt-metrics` CSS in HeroSection.css. VERIFIED showing 3.34ms/3.99ms/753.

## 4i. MODEL PERSISTENCE + FOOTPRINT + AUTOMOTIVE (CAN BUS) DONE ✅ (2026-09-26)
**A — Model persistence + footprint:**
- `stream.py` saves/loads per-host River models to `/models/state.pkl` (pickle, atomic write). Restores on startup ("restored N models from disk"). Compose: `modeldata` volume on `stream` service, `MODEL_PATH` env.
- **CRITICAL BUG FIXED:** initial per-event synchronous save blocked the event loop → latency ballooned to 1646ms. Fixed: saving now runs off the hot path via `asyncio.to_thread` on a **30s background task** (`periodic_save`) + sync save on shutdown. Latency back to **avg 3.19ms / p95 4.17ms / max 24ms**.
- **FOOTPRINT (docker stats):** CPU **0.00% idle** (event-driven), **~154 MB RAM** total (Python+River+sklearn+numpy). Runs on Raspberry-Pi-class hardware. Backs the low-power claim with real numbers.

**B — Automotive / CAN bus (targets automotive sector):**
- New telemetry source **`canbus`** (in-vehicle network). `detect.py`: `KNOWN_CAN_IDS`, `CAN_FLOOD_INTERVAL_MS=3.0`, `features_canbus()`. Detects **message injection** (unknown arbitration ID → spoofing) + **bus flooding** (low interval → DoS).
- `describe()` now returns 5-tuple incl. **`standard_ref`** mapping to **UN R155 Annex 5** (§4.3.6 injection/spoofing, §4.3.1 DoS) + **ISO/SAE 21434** threat categories. New `alerts.standard_ref` column (migration `db/03_automotive.sql` + schema.sql).
- Streaming detector has a **rule fast-path for canbus** (injection/flooding alert instantly, bypass ML warmup — safety-critical). `stream.py` imports `_f, KNOWN_CAN_IDS, CAN_FLOOD_INTERVAL_MS`.
- Seed: 2 new **automotive hosts** (`telematics-ecu-01`, `infotainment-01`, OS "Automotive Grade Linux") + `canbus_payload()` in `generate_seed.py`; `stream_events.py` emits canbus for automotive hosts (`make_event(i, automotive)`).
- API `/api/alerts` + explain return `standard_ref`; AI prompt includes it. UI: 🚗 std-ref tag in alerts table MITRE cell + "Automotive standard" section in AI modal.
- **VERIFIED:** batch detector → 30 canbus alerts; live stream caught injection (0x666/0x0FF) + flooding (0x1A0 etc.) in real time with correct UN R155/ISO 21434 refs.

## 4j. WHOLE-UI VISUAL OVERHAUL DONE ✅ (2026-09-26) — "make raw numbers understandable"
User feedback: log pages were unreadable walls of numbers. Fixed across the app:
- **`InfoBanner`** component (`components/InfoBanner/`): plain-English "In plain English / What you're seeing / Red flags" on EVERY page (dashboard, alerts, memory, network, liveprocess, file, process).
- **`ApexChart`** wrapper (`components/Chart/ApexChart.jsx`): vanilla ApexCharts (already a dep) in React, no new package. Shared **`components/viz.css`** (viz-cards, viz-status good/warn/bad, viz-chart-card).
- **AI panel → MODAL** (done earlier §4h): parsed Assessment/MITRE/Action + automotive standard section.
- **Memory Logs:** status cards (in-use % now w/ Healthy/Elevated/Critical badge, avg, peak) + **area chart** of %used over time. Raw table behind "Show detailed numbers" toggle.
- **Live Process Logs:** cards (programs running, unrecognized/flagged w/ badge, busiest CPU) + **horizontal bar chart** of top-8 CPU (blacklisted bars RED) + table rows color-coded red, listing → "⚠ Unrecognized / ✓ Known-good". (Miner xmrig now visually obvious at ~99% CPU in red.)
- **Network Logs:** cards (connections seen, suspicious w/ badge, unique destinations) + **donut** safe vs suspicious + rows color-coded, listing → "⚠ Suspicious / ✓ Safe".
- **File Logs:** cards (accesses, sensitive/suspicious w/ INVESTIGATE badge, users) + rows color-coded, listing → "⚠ Suspicious / ✓ Normal".
- **Dashboard:** InfoBanner + cards renamed to plain words (Suspicious / Verified safe / Alerts) w/ subtitles; rt-metrics labels de-jargoned ("Avg time to catch a threat", etc.).
- **VERIFIED in browser:** all pages render with charts, status badges, color-coding. Non-technical-readable.
- NOTE: Process Logs page (`/processing_logs`) uses `process_info` which seed doesn't populate (empty) — has InfoBanner but no data; low priority.

## 4k. EXPLAINABILITY + AI-EVERYWHERE + HEALTH SCORE + MULTI-DOMAIN ✅ (2026-09-26 sess 2)
User asks: network "what/why/how" per suspicious row; AI on every tab; simplest possible UI; a reliability feature; multi-domain (not just automotive — configurable to any device, fetch more data).
- **Per-row "Why?" explainer (instant, no AI):** NetworkLogs suspicious rows get a red "Why?" button → modal with **What happened / Why it's suspicious / How to handle it** (4 steps). `explainNetworkRow()` in NetworkLogs.jsx (rule-based). Generic `.detail-*` + `.why-btn` styles in `viz.css`. VERIFIED (185.220.101.44:4444 explanation).
- **AI on every tab:** new `AiInsights` component (`components/AiInsights/`) — "🤖 Explain this page in plain English" button → `POST /api/ai/insights {context, summary}` → parses SUMMARY/CONCERN/ADVICE into "What this shows / Anything wrong? / What to do". Added to Memory, Network, LiveProcess, File pages. Backend: `ai.insights()` (INSIGHTS_PROMPT, non-technical) + `/api/ai/insights` endpoint (503 if no key). VERIFIED on Memory page (real plain-English output).
- **Security Health Score (reliability feature):** `GET /api/health-score` → {score 0-100, grade Good/Fair/At risk, open_critical/high/medium, suspicious_percent}. Formula: 100 − min(55, crit*12+high*4+med*1.5) − min(25, suspicious%*0.5). Dashboard shows a **radialBar gauge** (color by grade) + factor chips (`health-panel` CSS in HeroSection.css). VERIFIED (39 "At risk").
- **MULTI-DOMAIN proof — new `auth` source (login/brute-force):** universal to ANY device with accounts. `features_auth()` + `describe()` branch (T1110 Brute Force) in detect.py; `auth_payload()` in generate_seed.py (seeded for ALL hosts, 150 each); added to stream_events.py `make_event`. VERIFIED: 28 brute-force alerts ("Possible brute-force login on 'admin' from 185.220.101.44"). Proves the generic events+JSONB+per-source pipeline handles any telemetry — automotive (canbus) is just one profile.
- Architecture note: adding a new data source = payload builder (seed) + feature fn + describe() branch + register in NUMERIC_SOURCES. Alerts/AI/UI-alerts work automatically. Only dedicated *log pages* are per-source.

### DATA CATALOG — what more any device can send (multi-domain roadmap)
Already have: network, processes, memory, files, kernel-audit(defined), CAN bus (automotive), auth/login. Easy high-value additions (same pattern): CPU load & temperature (thermal/overheating), disk usage & SMART health, USB device insert/removal, systemd service up/down, package/software changes, GPS/location (fleet), Bluetooth/WiFi scans, container/Docker events, GPIO/sensor readings (IoT), Modbus/OT industrial protocols, syslog ingestion (catch-all). Positioning: "configurable telemetry+detection agent for ANY Linux/edge device" — automotive, IoT, industrial/OT, medical, kiosks, servers — not automotive-only.

## 4l. ACTION CENTER + LIVE DASHBOARD + DESCRIPTIONS-EVERYWHERE ✅ (2026-09-26 sess 2)
- **Recommendations engine:** `GET /api/recommendations` groups open alerts by threat type (keyed off MITRE via `_GUIDANCE` map in main.py) → prioritized list, each with category, why (plain), how (steps), count, example, severity. Sorted by severity then count.
- **NEW "Action Center" tab → then MERGED into Dashboard** (user asked to merge). The dashboard (`HeroSection`) now renders a **"What needs your attention"** section = the recommendation cards (priority #, severity chip, title, example, "Why this matters", "What to do" steps). `ActionCenter` component still exists but `/action_center` route → HeroSection; sidebar item removed. Card styles in `ActionCenter/ActionCenter.css` (ac-* classes), imported by HeroSection.
- **LIVE-UPDATING:** HeroSection polls every 10s (`setInterval`), shows "● live · updated <time>". (ActionCenter component also polls if used.)
- **Descriptions with output (not just numbers) on every tab:**
  - Dashboard: health-score description is now **value-aware** (Good/Fair/At-risk → different sentence naming open critical/high counts + "go to Action Center").
  - Each log tab has a `.viz-summary` (viz.css) value-aware sentence quoting the actual numbers + what to do: Memory ("Right now X% in use — …"), Network ("X of Y connections suspicious — …"), LiveProcess ("X of Y programs unrecognized — check red bars…"), File ("X of Y file accesses suspicious — …"). Red border when there's a problem.
  - Plus existing per-tab: InfoBanner (plain English), AiInsights button (🤖 on-demand AI), status badges, and Network per-row "Why?" modal (what/why/how).
- Latency note: bulk re-seed floods the live detector's NOTIFY queue → inflates metrics (saw 2828ms). FIX for clean demo numbers: `UPDATE events SET scored_at=NULL, detect_latency_ms=NULL;` then run a controlled `streamgen`. After that: clean **3.46ms avg / 4.17ms p95**.

## 4d. NEXT STEPS (automotive / low-power product roadmap)
**DONE ✅:** Phase 1 foundation, frontend wiring, batch detection, Alerts UI, AI analyst (modal), real-time streaming detection (~3ms), metrics.
**DONE:** ~~1 model persistence~~ ✅, ~~2 footprint proof~~ ✅ (154MB/0% idle), ~~4 automotive CAN bus + ISO21434/UNR155~~ ✅, whole-UI visual overhaul ✅.
**Remaining (priority order):**
1. **Real ingestion endpoint** `POST /ingest` (token auth, structured JSON, host self-registration) so real agents (not just the DB seeder) feed events. Then harden bash agents (fix Kernel.sh full-log re-send; TLS/mTLS). Add real SocketCAN `candump` agent for a live vehicle demo.
2. **Live dashboard:** websocket/SSE or auto-poll so Alerts + metrics + charts update in real time as the stream runs (currently need page refresh).
3. **Accuracy hardening:** persistence-based alerting (require N consecutive anomalies to cut false positives), per-source thresholds, feature enrichment (beaconing detection for network, parent-child for processes).
4. **Offline mode:** whole detect path works with zero cloud (no LLM, local alert store) — the true edge/automotive deployment. LLM optional sync when connected.
5. **Process Logs page** has no data (seed doesn't populate `process_info`) — either seed it or repurpose the page.
6. **Phase 5 hardening:** API auth, tests, prod README, remove/rotate secrets, AWS deploy path.

### Historical next-steps (now completed)
1. ~~**Wire existing React frontend**~~ ✅ DONE. Added `src/config.js` (`API_BASE` from `VITE_API_URL`, default localhost:8000) + `.env.example`; updated all 6 components (HeroSection, NetworkLogs, LiveProcessLogs, FileLogs, MemoryLogs, ProcessLogs). Added `/download_all_files` to API (zips per-source JSON). Fixed pre-existing NaN date bug in NetworkLogs (now uses `new Date()` directly). Verified in browser: dashboard shows Blacklisted 74 / Whitelisted 1366; network table 800 rows with real dates. Frontend: `cd Linux_Sentinel/frontend && npm run dev` → http://localhost:5173.
2. ~~**Phase 3: detection worker**~~ ✅ DONE. See §4e.
3. **Phase 4: NVIDIA NIM AI analyst** — CODE BUILT, awaiting API key. See §4g.
4. **Phase 2: hardened agents** — bash agents emit structured host-tagged JSON to a token-auth `/ingest` endpoint; fix Kernel.sh full-log re-send; TLS.
5. **Phase 5: auth, tests, README, AWS deploy path.**

## 6. Changelog
- **2026-09-25 (1)** — Created memory file. Mapped full architecture (3 layers). Flagged critical hardcoded-AWS-key issue. Defined AI enhancement direction (NVIDIA NIM + Hugging Face + classical ML). Delivered enhancement/feature analysis to owner.
- **2026-09-25 (2)** — No-sugar-coat review delivered. Locked decisions (§4b). Built & verified **Phase 1** (`platform/`): Postgres + FastAPI + Docker Compose + synthetic seed, 1740 events, all endpoints working. Fixed asyncpg JSONB codec bug + schema identity-column typo.
