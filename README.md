# Edge AI System Intelligence Platform

> **100% Offline Edge Intelligence Platform** — High-frequency system telemetry via a native C++ daemon, on-device AI inference with ONNX Runtime & Snapdragon NPU (QNN) acceleration, intelligent temporary file cleanup with self-training machine learning, automated log anomaly detection, and human-in-the-loop remediation.

---

## 📋 Table of Contents

1. [System Architecture](#-system-architecture)
2. [Core Features](#-core-features)
3. [Prerequisites](#-prerequisites)
4. [Option A — Setup via Docker (Recommended)](#-option-a--setup-via-docker-recommended)
5. [Option B — Setup Without Docker (Bare-Metal)](#-option-b--setup-without-docker-bare-metal)
6. [Project Structure](#-project-structure)
7. [API Reference](#-api-reference)
8. [WebSocket Protocol](#-websocket-protocol)
9. [Hardware Acceleration & Fallback Chain](#-hardware-acceleration--fallback-chain)
10. [Safety & Remediation Guardrails](#-safety--remediation-guardrails)
11. [Troubleshooting Guide](#-troubleshooting-guide)

---

## 🧠 System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       React 18 + TypeScript + Vite                          │
│                                (Port 5173)                                  │
│   Dashboard · Charts · Real-time Latency (2 Decimals) · AI Temp Cleaner    │
│            Process Manager · Live Logs · Remediation Modal                  │
└──────────────────────┬───────────────────────────────┬──────────────────────┘
                       │ HTTP REST (Port 5000)         │ WebSocket (/ws/live-metrics)
                       ▼                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Node.js Express Backend                              │
│                                (Port 5000)                                  │
│  ┌───────────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │   REST Orchestrator   │  │ WebSocket Server │  │ Cleanup Coordinator  │  │
│  │      /api/system      │  │  Client Broadcast│  │ Plan/Execute Runner  │  │
│  │  /api/logs · /api/ai  │  │   1s Tick Stream │  │ Sandboxed ExecFile   │  │
│  └───────────────────────┘  └──────────────────┘  └──────────────────────┘  │
│          │ HTTP Proxy                           ▲ Subprocess Pipe (JSONL)   │
│          ▼                                      │                           │
│  ┌───────────────────────────────┐     ┌─────────────────────────────────┐  │
│  │    Python AI Engine :8000     │     │       System Agent Daemon       │  │
│  │  ┌─────────────────────────┐  │     │  ┌───────────────────────────┐  │  │
│  │  │ ONNX Anomaly Detector   │  │     │  │ C++ Daemon (Primary)      │  │  │
│  │  │ QNN (Snapdragon NPU)    │  │     │  │ Differential /proc & /sys │  │  │
│  │  │ CPU Fallback Execution  │  │     │  │ Top 20 Processes & States │  │  │
│  │  ├─────────────────────────┤  │     │  └───────────────────────────┘  │  │
│  │  │ AI Temp File Classifier │  │     │  ┌───────────────────────────┐  │  │
│  │  │ RandomForest + Rules    │  │     │  │ Python collector.py       │  │  │
│  │  │ Bash Script Generator   │  │     │  │ (Automatic Fallback)      │  │  │
│  │  └─────────────────────────┘  │     │  └───────────────────────────┘  │  │
│  └───────────────────────────────┘     └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                           ┌────────────▼────────────┐
                           │      Host Linux OS      │
                           │  /proc  /sys  /tmp      │
                           │  Qualcomm Hexagon NPU   │
                           └─────────────────────────┘
```

---

## ⚡ Core Features

- **High-Frequency Native Telemetry (C++17 Daemon)**:
  - Differential CPU calculation (reading `/proc/stat` idle vs. total jiffies).
  - Accurate memory metrics (MemTotal, MemFree, MemAvailable, Buffers, Cached).
  - Process inspector: Real PID, CPU %, Memory %, Thread count, User (via `getpwuid_r`), and Process State (`running`, `sleeping`, `stopped`, `zombie`).
  - Network I/O delta rates (MB/s) across physical interfaces; thermal zone temperatures from `/sys/class/thermal/`.
- **Snapdragon NPU Optimization & Strict Verification Pipeline**:
  - Quantized INT8 ONNX models (< 50MB) optimized for edge deployment.
  - Hardware Execution Provider selection (`QNNExecutionProvider` with HTP burst mode vs. `CPUExecutionProvider` fallback).
  - Real-time model inference latency tracked and rendered to **2 decimal places** (e.g. `2.45 ms`).
  - Dedicated NPU status verification, on-device benchmarks, and model re-optimization triggers.
- **AI-Powered Temp File Cleaner**:
  - Scans `/tmp`, `/var/tmp`, `~/.cache`, and `~/.local/share/Trash`.
  - Feature extraction: age, size, idle access time, sockets, symlinks, PIDs, empty files, and scratch extensions.
  - Self-training 100% offline `RandomForestClassifier` combined with deterministic safety pre-filters.
  - Sub-second cached scans (~25ms) with depth limits and heavy application cache pruning.
  - Strict system lock file protections (`.X0-lock`, `.X1-lock`, `wayland`, `dbus`).
  - Pre-deletion manifest backups stored in `/tmp/edge-ai-cleanup-logs/`.
  - Sandboxed bash script generator (`script_generator.py`) with UI review modal and immediate list clearing upon execution.
- **Log Anomaly Detection & AI Remediation**:
  - Live log monitoring for memory pressure, CPU runaway, kernel panics, and segmentation faults.
  - Automated bash remediation plan generator with 5-minute cryptographic token expiry.
  - Strict human-in-the-loop requirement: no script runs without explicit approval.

---

## 📦 Prerequisites

| Component | Minimum Version | Notes |
|---|---|---|
| **OS** | Linux (Ubuntu 20.04+, Debian 11+) | Required for `/proc` and `/sys` filesystem interfaces |
| **Node.js** | ≥ 20.x | [nodejs.org](https://nodejs.org) |
| **Python** | ≥ 3.11 | [python.org](https://python.org) |
| **g++ / GCC** | ≥ 11 | `sudo apt install build-essential` |
| **CMake** | ≥ 3.16 | `sudo apt install cmake` |
| **Docker & Compose** | Docker 24+, Compose v2 | Optional: for containerized setup |
| **Snapdragon NPU** | Qualcomm QNN SDK (Optional) | Platform falls back to CPU automatically if NPU is absent |

---

## 🐳 Option A — Setup via Docker (Recommended)

Docker Compose provisions and connects all three tiers (AI Engine, Node.js Backend, and React Frontend) with host filesystem mounts and host PID namespace mapping.

### 1. Configure Environment

```bash
# Clone and enter directory
cd /home/ashutosh-maurya/Desktop/MERN/EdgeAI

# Copy environment template
cp .env.example .env
```

### 2. Build and Launch Containers

```bash
# Build images and start services in the background
docker compose up --build -d
```

> **Why `pid: host` and `privileged: true`?**
> The backend orchestrator spawns the C++ telemetry daemon inside the container. To report real host CPU, host memory, and host processes rather than isolated container limits, the container uses the host PID namespace and mounts `/tmp`, `/var/tmp`, and `~/.cache`.

### 3. Check Container Health

```bash
docker compose ps
```

You should see 3 healthy containers running:
- `edgeai-ai-engine` on port `8000` (FastAPI)
- `edgeai-backend` on port `5000` (Express + WebSockets)
- `edgeai-frontend` on port `5173` (Vite + React)

Verify backend & AI engine health:
```bash
# Backend health
curl -s http://localhost:5000/health
# {"status":"ok","uptime":...,"timestamp":...}

# AI Engine health
curl -s http://localhost:8000/health
# {"status":"healthy","model_loaded":true,"provider":"CPUExecutionProvider",...}
```

### 4. Open the Web Dashboard

Open your browser and navigate to:
```
http://localhost:5173
```

### 5. Managing the Containers

```bash
# Follow logs in real-time
docker compose logs -f

# Follow logs for a specific service
docker compose logs -f backend
docker compose logs -f ai-engine
docker compose logs -f frontend

# Stop containers
docker compose stop

# Teardown containers
docker compose down
```

---

## 💻 Option B — Setup Without Docker (Bare-Metal)

If you prefer running directly on your host machine without Docker, follow these steps in separate terminal windows.

### Step 1: Compile the C++ Telemetry Daemon

The telemetry daemon is modularized into header files (`include/`) and source files (`src/`).

```bash
cd /home/ashutosh-maurya/Desktop/MERN/EdgeAI/system-agent/cpp-core

# Configure with CMake (Release mode for maximum compiler optimization)
cmake -B build -DCMAKE_BUILD_TYPE=Release

# Compile using all available CPU cores
cmake --build build -j$(nproc)

# Verify the binary runs and outputs telemetry JSON
./build/telemetry_daemon
# (Press Ctrl+C to stop)
```

*(Note: If the C++ daemon is not compiled, the Node.js backend automatically falls back to `system-agent/collector.py` using `psutil`)*.

---

### Step 2: Setup and Start the Python AI Engine

To comply with **PEP 668** on modern Linux systems (e.g. Ubuntu 23.04+, Debian 12+), always use a Python virtual environment.

```bash
cd /home/ashutosh-maurya/Desktop/MERN/EdgeAI/ai-engine

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Upgrade pip and install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Export and quantize the ONNX anomaly detection model (first run only)
python models/export_model.py --quantize

# Start the FastAPI server
python -m uvicorn inference.run_inference:app --host 0.0.0.0 --port 8000 --reload
```

The AI Engine will initialize on `http://localhost:8000`. Test it with:
```bash
curl http://localhost:8000/health
```

---

### Step 3: Setup and Start the Node.js Backend

```bash
cd /home/ashutosh-maurya/Desktop/MERN/EdgeAI/backend

# Install Node.js dependencies
npm install

# Start the backend server (runs on port 5000)
npm start

# Or start in development mode with auto-reload:
npm run dev
```

The backend server will launch on `http://localhost:5000`, connect to the AI engine on port `8000`, spawn `telemetry_daemon`, and initialize WebSocket broadcasting on `ws://localhost:5000/ws/live-metrics`.

---

### Step 4: Setup and Start the React Frontend

```bash
cd /home/ashutosh-maurya/Desktop/MERN/EdgeAI/frontend

# Install frontend dependencies
npm install

# Start the Vite development server
npm run dev
```

The Vite dev server will start instantly:
```
  VITE v5.4.8  ready in 400 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://0.0.0.0:5173/
```

Open **`http://localhost:5173`** in your browser to use the platform.

---

## 📁 Project Structure

```
EdgeAI/
├── .env.example                         # Environment configuration template
├── docker-compose.yml                   # Multi-service orchestration configuration
├── Dockerfile.ai                        # Python FastAPI container specification
├── Dockerfile.backend                   # Node.js + C++ build container specification
├── README.md                            # Comprehensive project guide
│
├── ai-engine/                           # Python AI Service (Port 8000)
│   ├── cleanup/
│   │   ├── file_classifier.py          # AI Temp File Classifier (RandomForest + heuristics)
│   │   └── script_generator.py         # Sandboxed Bash cleanup generator with manifest audit
│   ├── inference/
│   │   └── run_inference.py            # FastAPI service endpoints (/analyze, /cleanup, /npu)
│   ├── models/
│   │   ├── anomaly_model.py            # PyTorch LSTM Anomaly Detection architecture
│   │   ├── export_model.py             # PyTorch -> ONNX -> INT8 quantization pipeline
│   │   └── anomaly_detector.onnx       # Generated ONNX model artifact
│   ├── npu/
│   │   ├── npu_verifier.py             # Strict NPU vs CPU fallback detection
│   │   ├── model_optimizer.py          # NPU graph optimization & shape inference
│   │   └── qnn_config.py               # Qualcomm QNN Execution Provider configuration
│   └── requirements.txt
│
├── backend/                             # Node.js Express Orchestrator (Port 5000)
│   ├── app.js                          # Express entry point & HTTP upgrade handler
│   ├── config/
│   │   └── default.json                # Service ports, intervals, and timeouts
│   ├── logger.js                       # Winston structured logging
│   ├── routes/
│   │   ├── ai.routes.js                # AI anomaly analysis & remediation execution
│   │   ├── cleanup.routes.js           # Temp cleanup analysis, plan generation & execute
│   │   ├── logs.routes.js              # Recent logs & detected anomalies
│   │   └── system.routes.js            # Telemetry metrics & process snapshot
│   ├── services/
│   │   ├── ai.service.js               # AI Engine HTTP client with heuristic fallbacks
│   │   ├── cleanup.service.js          # Plan caching (5-min expiry) & execFile executor
│   │   ├── log.service.js              # Circular log buffer & regex anomaly scanner
│   │   ├── remediation.service.js      # Plan generator & bash script runner
│   │   ├── telemetry.service.js        # C++ daemon / Python collector /proc reader
│   │   └── websocket.service.js        # WebSocket broadcaster (1000ms tick)
│   └── package.json
│
├── frontend/                            # React 18 + TypeScript + Vite (Port 5173)
│   ├── src/
│   │   ├── components/
│   │   │   ├── AiInsights.tsx          # Real-time AI anomaly cards & root causes
│   │   │   ├── Dashboard.tsx           # Main control center layout
│   │   │   ├── LogsViewer.tsx          # Live terminal log viewer & filter
│   │   │   ├── NpuPowerWidget.tsx      # NPU vs CPU monitor (latency to 2 decimals)
│   │   │   ├── ProcessTable.tsx        # Top 20 processes (R/S/T/Z status, CPU, RAM)
│   │   │   ├── RemediationModal.tsx    # Plan review & user confirmation modal
│   │   │   ├── Sidebar.tsx             # Navigation & system status overview
│   │   │   ├── SystemStats.tsx         # KPI cards (CPU %, RAM, Disk, Net, Thermal)
│   │   │   └── TempCleaner.tsx         # AI Temp Cleaner (Review, clean & empty list)
│   │   ├── hooks/                      # Custom hooks (useWebSocket, useMetrics)
│   │   ├── services/
│   │   │   ├── api.ts                  # Axios client (30s timeout) + fallback
│   │   │   └── mockData.ts             # Deterministic fallback simulator
│   │   ├── types/                      # Strict TypeScript interfaces
│   │   └── App.tsx
│   ├── index.html
│   ├── tailwind.config.js
│   └── vite.config.ts
│
└── system-agent/                        # Native Telemetry Daemon
    ├── collector.py                    # Python psutil fallback collector
    └── cpp-core/                       # C++17 Multi-file Daemon
        ├── CMakeLists.txt              # CMake build script (-O2, pthread)
        ├── include/                    # Header files (cpu.h, mem.h, net.h, process.h, utils.h)
        └── src/                        # Implementations (cpu.cpp, mem.cpp, net.cpp, process.cpp, main.cpp)
```

---

## 📡 API Reference

All REST endpoints are served on `http://localhost:5000` (Node.js Orchestrator).

### 1. System Telemetry & Processes

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/system/metrics` | Returns latest system metrics (CPU %, RAM %, Disk %, Net I/O, Thermal, Load Avg) |
| `GET` | `/api/system/processes` | Returns top 20 active processes (PID, Name, CPU %, RAM %, User, Status, Threads) |
| `GET` | `/health` | Service health status, uptime, and timestamp |

---

### 2. AI-Powered Temp File Cleanup

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/system/cleanup/analyze` | Scans `/tmp`, `/var/tmp`, `~/.cache`; runs AI classifier; returns safe vs. skipped files |
| `POST` | `/api/system/cleanup/plan` | Generates a validated bash script and backup manifest for approved file paths |
| `POST` | `/api/system/cleanup/execute` | Executes approved cleanup plan using sandboxed `execFile` and deletes files from disk |

#### Example: Analyze Request & Response
```bash
curl -X POST http://localhost:5000/api/system/cleanup/analyze
```
```json
{
  "scanned": 585,
  "safe_to_delete": [
    {
      "path": "/tmp/.org.chromium.Chromium.7Rbcd8",
      "size_kb": 1847.92,
      "age_hours": 1.4,
      "extension": "",
      "label": "junk",
      "safe_to_delete": true,
      "confidence": 0.95,
      "reason": "Junk: temp process artifact, age 1.4h (confidence 95%)"
    }
  ],
  "skip": [
    {
      "path": "/tmp/.X0-lock",
      "size_kb": 0.01,
      "age_hours": 12.2,
      "label": "system-critical",
      "safe_to_delete": false,
      "confidence": 1.0,
      "reason": "Protected runtime or system lock file: .x0-lock"
    }
  ],
  "total_reclaimable_mb": 4.72,
  "timestamp": 1726590600000
}
```

---

### 3. Snapdragon NPU Optimization & Benchmarking

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/system/npu/status` | Reports whether inference is executing on Snapdragon NPU (`QNNExecutionProvider`) or CPU fallback |
| `POST` | `/api/system/npu/benchmark` | Runs comparative 50-iteration latency benchmark (NPU vs CPU) |
| `POST` | `/api/system/npu/optimize` | Runs ONNX graph transformations and static INT8 calibration |

#### Example: NPU Status Response
```json
{
  "provider": "CPUExecutionProvider",
  "device": "CPU (Fallback)",
  "hardware_verified": true,
  "is_npu": false,
  "model_path": "models/anomaly_detector.onnx",
  "avg_latency_ms": 2.45,
  "inference_count": 142
}
```

---

### 4. Logs & AI Remediation

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/logs/recent?limit=100` | Returns recent system and backend logs |
| `GET` | `/api/logs/anomalies?limit=50` | Returns logs flagged by regex or AI anomaly detection |
| `POST` | `/api/ai/analyze` | Submits telemetry & log buffer to AI engine for anomaly scoring |
| `POST` | `/api/ai/remediate` | Generates a remediation plan for an insight (stored with 5-minute expiry) |
| `POST` | `/api/ai/remediate/execute` | Executes an approved remediation plan (`{ planId, approved: true }`) |

---

## 🔌 WebSocket Protocol

Connect to:
```
ws://localhost:5000/ws/live-metrics
```

The server broadcasts structured JSON messages every 1 second:

### 1. `type: "system"`
```json
{
  "type": "system",
  "data": {
    "cpuUsage": 18.5,
    "memoryUsage": 54.2,
    "memoryTotal": 15.8,
    "memoryUsed": 8.56,
    "diskUsage": 62.1,
    "networkIn": 1.45,
    "networkOut": 0.38,
    "uptime": 86400,
    "temperature": 48.0,
    "loadAverage": [1.12, 0.95, 0.88],
    "timestamp": 1726590600000
  }
}
```

### 2. `type: "npu"`
```json
{
  "type": "npu",
  "data": {
    "utilization": 24.5,
    "powerDraw": 1.8,
    "temperature": 45.2,
    "frequency": 1200,
    "inferenceCount": 3820,
    "modelLatency": 2.45,
    "timestamp": 1726590600000
  }
}
```

### 3. `type: "cleanup:suggestions"` & `type: "cleanup:complete"`
Broadcast when background cleanup scans complete or after a user-approved script finishes deleting files.

---

## 🚀 Hardware Acceleration & Fallback Chain

The platform implements multi-tiered fallback architecture to ensure 100% operational uptime on any hardware:

### 1. AI Inference Pipeline
```
[Snapdragon Hexagon HTP / NPU]
          │ (If QNNExecutionProvider fails / hardware absent)
          ▼
[ONNX Runtime CPU Execution Provider]
          │ (If ONNX model missing / unreadable)
          ▼
[Python Heuristic Rule Engine (Deterministic Fallback)]
```

### 2. System Telemetry Pipeline
```
[Compiled C++17 Daemon (telemetry_daemon)]
          │ (If binary not compiled or fails to spawn)
          ▼
[Python psutil Collector (collector.py)]
          │ (If Python environment missing)
          ▼
[Node.js Native /proc & /sys File Reader]
```

---

## 🛡️ Safety & Remediation Guardrails

1. **Human-in-the-Loop Verification**:
   - Remediation scripts and file cleanup scripts are **NEVER** executed automatically.
   - Scripts are displayed in the UI review modal for user inspection.
2. **Pre-Deletion Backup Manifests**:
   - Before deleting files, a JSON audit manifest recording exact file paths, sizes, and timestamps is created at `/tmp/edge-ai-cleanup-logs/cleanup_<plan_id>_manifest.json`.
3. **Protected File Patterns**:
   - Sockets (`stat.S_ISSOCK`) and symbolic links (`stat.S_ISLNK`) are never touched.
   - Active process PID locks (`/proc/<pid>`) are verified against running processes.
   - System display server locks (`.X0-lock`, `.X1-lock`, `wayland`, `dbus`) are unconditionally protected.
   - Minimum file age threshold of 1.0 hour protects recently created files.
4. **Sandboxed Subprocess Execution**:
   - Scripts are executed via `child_process.execFile('/bin/bash', [tmpFile])` with `set -euo pipefail`. Shell string interpolation is strictly forbidden to prevent shell injection vulnerabilities.

---

## 🔧 Troubleshooting Guide

### 1. Dashboard shows mock / static data
- **Cause**: Frontend Axios cannot reach `http://localhost:5000` or timed out.
- **Fix**: Verify `edgeai-backend` is running (`curl http://localhost:5000/health`). Confirm your browser can reach port 5000.

### 2. Python `error: externally-managed-environment` (PEP 668)
- **Cause**: Modern Linux distros (Ubuntu 23+, Debian 12+) block system-wide `pip install`.
- **Fix**: Use a virtual environment:
  ```bash
  cd ai-engine
  python3 -m venv venv
  source venv/bin/activate
  pip install -r requirements.txt
  ```

### 3. `sh: 1: vite: not found` in Docker Frontend
- **Cause**: Stale Docker volume cache in `edgeai_frontend_node_modules`.
- **Fix**: Re-install dependencies inside the container:
  ```bash
  docker compose run --rm frontend npm install
  docker compose restart frontend
  ```

### 4. C++ Daemon Warning: `output may be truncated copying 63 bytes`
- **Cause**: Using `strncpy` with length matching the destination buffer without guaranteed null termination.
- **Fix**: Already resolved using `snprintf(pi.name, sizeof(pi.name), "%s", comm)`.

### 5. Port Conflicts (Port 5000, 8000, or 5173 in use)
- **Diagnosis**: Check what process is holding the port:
  ```bash
  sudo lsof -i :5000
  sudo lsof -i :8000
  sudo lsof -i :5173
  ```
- **Fix**: Kill the conflicting process or change the port mapping in `docker-compose.yml` or `.env`.

---

## 📄 License

MIT © Edge AI Platform Contributors
