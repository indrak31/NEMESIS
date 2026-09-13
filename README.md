# Nemesis — Backend Resilience Service

**Event:** CraftVerse 2.0 Hackathon (PCCOE&R, Pune)  
**Track:** AALOK (Backend Track) | **Partner:** INDRA (Frontend Track)  
**Stack:** Python 3.9+ / 3.11, FastAPI, native WebSockets, Pydantic v2, in-memory state.

---

## 1. Overview

Nemesis is an adversarial resilience prototype demonstrating:
- An **"Attacker"** scenario engine that simulates cascading microservice failures.
- A **"Defender"** remediation engine that pairs failure vectors with Terraform (`.tf`) resilience patches, validates containment by re-simulating against the protected topology, and opens a pull request.

> **Note for Judges & Evaluators:**  
> In accordance with Round 1 scope, the Attacker is a **deterministic, scripted scenario engine** and the Defender is a **rule-based fix-matcher with simulated validation**. No black-box ML/RL is claimed.

---

## 2. Quick Start

### 1. Setup Environment
```bash
# Activate virtual environment
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Start the FastAPI Backend
```bash
uvicorn main:app --reload --port 8000
```
Server runs on: **`http://localhost:8000`**  
Interactive API Docs (Swagger): **`http://localhost:8000/docs`**

---

## 3. Triggering Scenarios (Live Demo Commands)

### Run live scenario (Broadcasts live over WebSocket with ~600ms pacing)
```bash
curl -X POST http://localhost:8000/run-scenario/payment_latency_spike
```

### Available Scenarios
| Scenario Name | Target Service | Cascade Path | Severity | Fix Template |
|---|---|---|---|---|
| `payment_latency_spike` *(Recommended for demo)* | Payment Service | Orders Service -> Orders DB | 9.2 / 10 | `circuit_breaker.tf` |
| `orders_db_exhaustion` | Orders DB | Orders Service -> Inventory -> Payment Service | 9.5 / 10 | `db_connection_pool.tf` |
| `auth_token_flood` | Auth Service | API Gateway | 7.5 / 10 | `rate_limiter.tf` |
| `inventory_sync_deadlock` | Inventory | Orders Service -> Cache | 6.8 / 10 | `async_inventory_queue.tf` |

### Reset Topology to All Healthy
```bash
curl -X POST http://localhost:8000/reset
```

### Query Static Topology
```bash
curl http://localhost:8000/graph
```

---

## 4. Frontend Integration Contract (For INDRA)

### Static Topology (`GET /graph`)
Returns the fixed 8 nodes and 7 edges:
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

### Live WebSocket Stream (`WS /events`)
Connect to: **`ws://localhost:8000/events`**

Every event has the exact shape:
```json
{
  "type": "attack_start | cascade | defender_fix | simulation_result | pr_opened",
  "timestamp": "HH:MM:SS",
  "service": "<node id>",
  "message": "<human-readable log line>",
  "detail": "<file name, path, or PR ref>",
  "graph_delta": {
    "node": "<node id>",
    "state": "healthy | attacked | patching | protected"
  }
}
```

### Captured Sample Sequence Reference
A real captured execution sequence is exported to **[`sample_events.json`](./sample_events.json)**. Diff your mock stream against this file.

---

## 5. GitHub PR Integration

- **Offline / Default Demo Mode**: Returns realistic formatted PR references (e.g. `#142 fix/payment-service-circuit_breaker`) and URLs without requiring internet or credentials.
- **Real GitHub API Mode (Optional Stretch)**: Export your GitHub token and target repository:
  ```bash
  export GITHUB_TOKEN="ghp_yourPersonalAccessToken"
  export GITHUB_REPO="your-username/your-demo-repo"
  ```
  When set, Nemesis automatically creates a branch, commits the `.tf` patch, and opens a real PR with verification proofs.

---

## 6. Running Test Suite

```bash
pytest -v
```
All 15 unit and integration tests verify topology contract, scenario deterministic cascades, defender validation logic, REST endpoints, and WebSocket streaming.
