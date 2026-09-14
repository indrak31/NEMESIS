# NEMESIS: Master AI Context & Architecture Reference

> **Purpose**: This document is a complete, self-contained context specification for **NEMESIS**. Provide this file to LLMs (ChatGPT, Claude, Gemini, Cursor, Copilot) or human team members to give them full architectural understanding, file manifests, data contracts, API specifications, and extension guidelines.

---

## 1. Project Overview & Identity

* **Project Name**: NEMESIS (Autonomous Cloud Resilience Engine & Closed-Loop GitOps Platform)
* **Tagline**: Autonomous Failure Injection · Graph-Theoretic Cascade Containment · Closed-Loop GitOps PR Automation · AI Incident Post-Mortem
* **Problem Solved**: When a microservice slows down or locks up, failures cascade upstream and downstream across dependencies (e.g. latency spikes causing thread pool starvation and DB connection exhaustion). SREs usually respond after outages spread.
* **Solution**: NEMESIS detects anomalies in real-time, isolates the failure boundary at the graph level, pairs the failure with hardened Terraform (`.tf`) resilience policies (circuit breakers, rate limiters, connection pools, queues), formally verifies containment via topological simulation, opens automated Pull Requests with CI/CD safety checks, and deploys zero-touch remediation into production cloud environments.

---

## 2. Technology Stack & Design Constraints

| Layer | Technologies | Key Libraries / Frameworks |
|---|---|---|
| **Backend** | Python 3.11+ | FastAPI, Uvicorn, Pydantic v2, WebSockets, AnyIO, Pytest |
| **Frontend** | React 18, JavaScript (ESM) | Vite, Lucide React (SVG icons), HTML5 Canvas/SVG |
| **Styling** | Vanilla CSS (`frontend/src/App.css`) | **STRICT RULE**: No TailwindCSS. Curated HSL dark/navy theme, glassmorphism, responsive CSS grid/flexbox. |
| **DevOps / IaC** | HashiCorp Terraform (HCL) | Envoy proxies, AWS WAFv2, RDS Proxy/PgBouncer, AWS SQS FIFO |
| **Design Rule** | **Zero Emojis** | Strictly zero emojis across UI, code comments, and documentation. Use SVG Lucide icons and geometric status badges. |

---

## 3. Microservice Dependency Topology

NEMESIS operates on a directed 8-microservice topology defined in `app/graph.py`:

```
                     [ API Gateway ] (GW) [High]
                      /     |      \
                     /      |       \
                    v       v        v
        [Auth Service]  [Payment]   [Notification] (NOTIF) [Low]
            (AUTH)        (PAY)
           [Medium]       [High]
                            |
                            v
                    [Orders Service] (ORD) [High]
                     /      |      \
                    /       |       \
                   v        v        v
             [Inventory] [Orders DB] [Cache]
                (INV)       (DB)     (CACHE)
              [Medium]     [High]     [Low]
```

### Static Service Contract (`app/graph.py`)
```json
{
  "nodes": [
    { "id": "API Gateway", "criticality": "high" },
    { "id": "Auth Service", "criticality": "medium" },
    { "id": "Payment Service", "criticality": "high" },
    { "id": "Orders Service", "criticality": "high" },
    { "id": "Inventory", "criticality": "medium" },
    { "id": "Orders DB", "criticality": "high" },
    { "id": "Cache", "criticality": "low" },
    { "id": "Notification", "criticality": "low" }
  ],
  "edges": [
    ["API Gateway", "Auth Service"],
    ["API Gateway", "Payment Service"],
    ["Payment Service", "Orders Service"],
    ["Orders Service", "Orders DB"],
    ["Orders Service", "Inventory"],
    ["Orders Service", "Cache"],
    ["API Gateway", "Notification"]
  ]
}
```

### Criticality Point Scoring
* **High Criticality (Weight 3)**: API Gateway, Payment Service, Orders Service, Orders DB.
* **Medium Criticality (Weight 2)**: Auth Service, Inventory.
* **Low Criticality (Weight 1)**: Cache, Notification.
* **Severity Score**: Normalized 1.0 - 10.0 scale based on total path criticality.

---

## 4. The 4 Built-In Failure Scenarios & Terraform Fixes

| Scenario ID | Injected Target | Cascade Path | Severity | Fix File | Resilience Mechanism |
|---|---|---|:---:|---|---|
| `payment_latency_spike` | Payment Service | Orders Service -> Orders DB | 9.2 | `circuit_breaker.tf` | Envoy cluster circuit breaker (`max_connections=100`, outlier ejection after 3 consecutive 5xx errors) |
| `orders_db_exhaustion` | Orders DB | Orders Service -> Inventory -> Payment Service | 9.5 | `db_connection_pool.tf` | AWS RDS Proxy / PgBouncer pool ceiling (`max_connections_percent=85`) |
| `auth_token_flood` | Auth Service | API Gateway | 7.5 | `rate_limiter.tf` | AWS WAFv2 regional token-bucket rate limiter rule (`limit=500/IP`) + Redis token caching |
| `inventory_sync_deadlock`| Inventory | Orders Service -> Cache | 6.8 | `async_inventory_queue.tf` | Decouples synchronous stock locks via AWS SQS FIFO queue with DLQ |

---

## 5. Incident Lifecycle & Node States

Every incident transitions through a 6-stage lifecycle:

```
[ STAGE 1/6 ] NORMAL OPERATIONS
      ↓ (Attacker failure vector injected)
[ STAGE 2/6 ] FAILURE INJECTED (Target node turns red 'ATTACKED')
      ↓ (Unmitigated RPC backpressure propagates)
[ STAGE 3/6 ] BLAST RADIUS SPREADING (Cascade paths glow red with packet animations)
      ↓ (Defender detects signature and synthesizes .tf patch)
[ STAGE 4/6 ] DEFENDER PATCHING (Target node turns amber 'PATCHING')
      ↓ (Simulation proves containment, boundary shield deployed)
[ STAGE 5/6 ] CONTAINED AT BOUNDARY (Cyan shield on edge, downstream nodes heal to healthy)
      ↓ (Operator or automated GitOps executes 1-click merge)
[ STAGE 6/6 ] DEPLOYED IN PRODUCTION (Target node turns emerald 'DEPLOYED', canary certified)
```

### Node State Enum (`app/models.py`)
* `healthy`: Slate blue baseline, nominal operations.
* `attacked`: Red glowing halo, pulsating radar ping.
* `patching`: Amber halo, IaC patch being synthesized.
* `protected`: Cyan electric halo, boundary shield active.
* `deployed`: Emerald green halo, patch merged and running in production.

---

## 6. Event Schema & WebSocket Protocol

Events are streamed over `WS /events` with sub-millisecond serialization and realistic pacing (~600ms per step):

```json
{
  "type": "attack_start",
  "timestamp": "13:54:02",
  "service": "Payment Service",
  "message": "Attacker: injecting failure vector (Payment Gateway Latency Spike)",
  "detail": "Target: Payment Service | Severity: 9.2/10",
  "pr_url": null,
  "graph_delta": {
    "node": "Payment Service",
    "state": "attacked"
  }
}
```

### Event Types:
1. `attack_start`: Initial failure injection.
2. `cascade`: Failure propagation along an edge.
3. `defender_fix`: Defender proposing and matching the Terraform patch.
4. `simulation_result`: Re-simulation proving containment; establishes boundary shield.
5. `pr_opened`: Pull Request created with CI/CD checks.
6. `deployment_complete`: Pull Request merged; Stage 6 deployment verified.

---

## 7. REST API Endpoints Specification

| Method | Path | Description | Request Body | Response Body |
|---|---|---|---|---|
| `GET` | `/health` | Healthcheck | None | `{"status": "healthy", "service": "nemesis-backend"}` |
| `GET` | `/graph` | Complete static graph contract | None | `{"nodes": [...], "edges": [...]}` |
| `GET` | `/scenarios` | List available failure scenarios | None | Array of scenario definitions |
| `POST` | `/run-scenario/{name}` | Trigger failure injection sequence | None | `{"status": "started", "scenario": name}` |
| `POST` | `/reset` | Reset all services to healthy baseline | None | `{"status": "reset_complete"}` |
| `GET` | `/pr/current` | Get current remediation PR & CI checks | None | `PullRequestDetails` (unified diff, checks, state) |
| `POST` | `/pr/merge` | Merge PR & trigger Stage 6 deployment | None | `{"status": "merged_and_deployed", "commit": "c373697"}` |
| `POST` | `/pr/configure` | Configure live GitHub PAT token & repo | `{"token": "ghp_...", "repo": "owner/repo"}` | `{"status": "configured"}` |
| `POST` | `/inject-fault` | Ad-hoc chaos injection on any node | `{"target_node": "...", "fault_type": "...", "severity": "...", "latency_ms": 450, "error_rate_multiplier": 25.0}` | `{"status": "fault_injected"}` |
| `GET` | `/incident/report` | Generate AI RCA Post-Mortem | None | `IncidentReport` (MTTR, RCA text, raw markdown) |
| `GET` | `/metrics/history` | Rolling P99 latency circular buffer | None | Array of `{"timestamp": "...", "p99_latency_ms": 42, "error_rate": 0.0}` |
| `GET` | `/service/{name}/telemetry` | Single microservice diagnostics | None | Thread pool, connection count, latency, error rate |

---

## 8. Repository File Manifest

```
NEMESIS/
├── app/                                # Backend package
│   ├── main.py                         # FastAPI app, lifespan, REST endpoints, WebSocket manager
│   ├── models.py                       # Pydantic v2 data contracts, Event, NodeState, IncidentReport
│   ├── graph.py                        # Static topology, criticality weights, adjacency matrices
│   ├── traffic.py                      # Real-time synthetic request engine & rolling P99 latency deque
│   ├── engine.py                       # Scenario failure injection & custom chaos builder
│   ├── defender.py                     # Terraform patch library, simulated containment, AI RCA generator
│   └── github_pr.py                    # Unified diff generator, CI/CD checks, GitHub API integration
├── frontend/                           # React frontend (Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Graph.jsx               # Interactive SVG topology, node clicking, shields, halo filters
│   │   │   ├── TelemetryBar.jsx        # Telemetry HUD, Stage 1-6 Stepper, SVG latency sparkline
│   │   │   ├── Scoreboard.jsx          # Attacker vs Defender containment efficiency cards
│   │   │   ├── LiveTrace.jsx           # Terminal trace, GitOps trigger, Post-Mortem trigger
│   │   │   ├── GitOpsModal.jsx         # Unified diff viewer, CI safety checks, 1-click Merge button
│   │   │   ├── NodeInspectorModal.jsx  # Microservice telemetry diagnostics & ad-hoc chaos injection
│   │   │   ├── IncidentReportModal.jsx # Executive AI Incident Post-Mortem & RCA viewer with export
│   │   │   └── TerraformModal.jsx      # Raw Terraform HCL viewer
│   │   ├── constants/
│   │   │   └── terraformPatches.js     # Production-grade HCL code for all 4 scenarios
│   │   ├── mockEvents.js               # Standalone mock event emitter for offline mode
│   │   ├── App.jsx                     # Top-level state orchestrator, WebSocket hook, modals
│   │   ├── App.css                     # Vanilla CSS design system (zero Tailwind)
│   │   └── main.jsx                    # React entrypoint
│   ├── package.json
│   └── vite.config.js
├── tests/                              # Automated test suite (21 tests, 100% passing)
│   ├── test_api.py                     # REST endpoints and WebSocket integration tests
│   ├── test_gitops.py                  # GitOps PR, CI/CD checks, and traffic metrics tests
│   ├── test_graph.py                   # Graph contract and edge integrity tests
│   └── test_scenarios.py               # Deterministic cascade flow and validation tests
├── assets/                             # Banner graphics
├── requirements.txt                    # Python dependencies
├── pyproject.toml                      # Packaging & pytest configuration
├── LICENSE                             # MIT License
├── README.md                           # Comprehensive documentation
└── CONTEXT.md                          # THIS MASTER CONTEXT FILE
```

---

## 9. How to Run Locally

### Start Backend (Port 8000)
```bash
# In project root
python -m uvicorn app.main:app --port 8000 --reload
```
* **Swagger UI**: `http://localhost:8000/docs`
* **WebSocket**: `ws://localhost:8000/events`

### Start Frontend (Port 5173)
```bash
# In frontend directory
cd frontend
npm install
npm start
```
* **Dashboard**: `http://localhost:5173`

### Run Test Suite
```bash
# In project root
python -m pytest -v
# Output: 21 passed in ~1.2s
```

### Standalone Mock vs Live Backend
In `frontend/src/App.jsx`, toggle `USE_MOCK_STREAM_DEFAULT`:
* `false` (Default): Connects to live FastAPI backend at `ws://localhost:8000/events`.
* `true`: Runs standalone in-browser mock emitter (ideal for offline presentations).
* Can also be toggled live via the top-bar button (`STREAM: MOCK EMITTER` $\leftrightarrow$ `WS: CONNECTED`).

---

## 10. AI Prompting Cheatsheet for Team Members

When asking your AI model to build features or troubleshoot NEMESIS, copy-paste this prompt template:

### Prompt Template:
```markdown
I am working on NEMESIS, an Autonomous Cloud Resilience Engine & Closed-Loop GitOps platform.
Stack: Python 3.11+ (FastAPI, WebSockets, Pydantic v2) and React (Vite, Vanilla CSS, SVG Topology).
Constraints: Strictly zero emojis (use Lucide SVG icons), no TailwindCSS (Vanilla CSS in App.css only), preserve the 8-node microservice graph contract.
Reference: Read the CONTEXT.md file for data models, API endpoints, and event schemas.

Task: [INSERT YOUR TASK HERE, e.g. "Add a new failure scenario for Redis Cache Eviction storm"]
```

### Example Extension Recipes:

#### Recipe 1: Adding a New Failure Scenario
1. In `app/engine.py`: Add definition to `SCENARIOS` dict with `name`, `target_service`, `cascade_path`, `canned_fix_file`, `protected_edge`.
2. In `app/defender.py`: Add corresponding `.tf` file to `TERRAFORM_PATCHES` and RCA description to `rca_descriptions`.
3. In `frontend/src/mockEvents.js`: Add scenario metadata to `SCENARIO_OPTIONS` and event sequence to `MOCK_SCENARIO_SEQUENCES`.
4. In `frontend/src/constants/terraformPatches.js`: Add raw HCL string.

#### Recipe 2: Adding a New Microservice Node
1. In `app/graph.py`: Add node to `STATIC_NODES` with criticality rating, and add edges to `STATIC_EDGES`.
2. In `frontend/src/components/Graph.jsx`: Add position `(x, y)` to `NODE_POSITIONS` and 2-4 letter abbreviation to `NODE_BADGES`.
3. In `frontend/src/mockEvents.js`: Update `FALLBACK_GRAPH`.
