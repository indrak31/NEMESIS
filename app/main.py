"""Nemesis Resilience Platform — Backend API Service.

This service provides:
1. Static microservice topology via `GET /graph`
2. Deterministic adversarial scenario runner via `POST /run-scenario/{name}`
3. Live event streaming over WebSocket via `WS /events`
4. Rule-based Defender fix and simulated containment verification
5. Pull Request bot (real GitHub PR integration when GITHUB_TOKEN is set, realistic stub otherwise)
"""

import asyncio
import os
from contextlib import asynccontextmanager
from typing import Dict, List, Optional, Set
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()


from .defender import (
    generate_defender_fix_event,
    generate_simulation_result_event,
    simulate_validation,
)
from .engine import (
    SCENARIOS,
    generate_attack_start_event,
    generate_cascade_events,
    get_current_timestamp,
    get_scenario,
    list_scenarios,
)
from .github_pr import generate_pr_opened_event, open_github_pr
from .graph import get_static_graph
from .models import Event, GraphDelta, GraphTopology


# =============================================================================
# WebSocket Connection Manager
# =============================================================================
class ConnectionManager:
    """Manages active WebSocket connections and broadcasts events."""

    def __init__(self) -> None:
        self.active_connections: Set[WebSocket] = set()
        self.history: List[Event] = []
        self._max_history = 100

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.active_connections.discard(websocket)

    async def broadcast(self, event: Event) -> None:
        """Record and broadcast an event to all connected clients."""
        self.history.append(event)
        if len(self.history) > self._max_history:
            self.history.pop(0)

        # Serialize strictly to JSON matching data contract
        data = event.model_dump(mode="json")
        disconnected: List[WebSocket] = []
        for connection in list(self.active_connections):
            try:
                await connection.send_json(data)
            except Exception:
                disconnected.append(connection)

        for conn in disconnected:
            self.disconnect(conn)


manager = ConnectionManager()


# =============================================================================
# FastAPI Application & Lifecycle
# =============================================================================
from .cluster_manager import cluster_manager
from .traffic import traffic_engine
from .github_pr import (
    configure_github_credentials,
    generate_deployment_complete_event,
    get_current_pr,
    merge_current_pr,
)
from .defender import generate_incident_report
from .engine import create_custom_chaos_scenario
from .models import CustomFaultInjection, IncidentReport, PullRequestDetails, TelemetryPoint


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup initialization
    enable_cluster = os.getenv("ENABLE_REAL_CLUSTER", "true").lower() in ("true", "1", "yes")
    if enable_cluster:
        await cluster_manager.start()

    traffic_engine.start()
    yield
    # Shutdown cleanup
    traffic_engine.stop()
    if enable_cluster:
        await cluster_manager.stop()


app = FastAPI(
    title="Nemesis API",
    description="Autonomous resilience simulation backend and GitOps engine for microservice topologies",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# REST Endpoints
# =============================================================================
@app.get("/")
async def root():
    """Service status and quick links."""
    return {
        "service": "Nemesis Resilience Platform Backend",
        "status": "online",
        "version": "1.0.0",
        "endpoints": {
            "graph": "/graph",
            "events_ws": "/events",
            "run_scenario": "/run-scenario/{scenario_name}",
            "scenarios": "/scenarios",
            "reset": "/reset",
            "history": "/events/history",
            "pr_current": "/pr/current",
            "pr_merge": "/pr/merge",
            "pr_configure": "/pr/configure",
            "metrics_history": "/metrics/history",
            "inject_fault": "/inject-fault",
            "incident_report": "/incident/report",
        },
    }


@app.get("/health")
async def health_check():
    """Health check endpoint with live traffic engine status."""
    latest_tel = traffic_engine.get_latest_telemetry()
    return {
        "status": "healthy",
        "timestamp": get_current_timestamp(),
        "active_ws_clients": len(manager.active_connections),
        "traffic_engine_running": traffic_engine.is_running,
        "rolling_p99_latency_ms": latest_tel.p99_latency_ms,
        "rolling_error_rate_pct": latest_tel.error_rate_pct,
    }


@app.get("/cluster/health", tags=["Cluster"])
async def get_cluster_health():
    """Retrieve real-time health and socket status of all 8 microservices."""
    health = await cluster_manager.get_health_status()
    all_healthy = len(health) == 8 and all(s.get("status") == "healthy" for s in health.values())
    return {
        "cluster_healthy": all_healthy,
        "services_count": len(health),
        "services": health,
    }



@app.get("/graph", response_model=GraphTopology)
async def get_graph():
    """Return the fixed static topology graph matching Section 3 Data Contract."""
    return get_static_graph()


@app.get("/scenarios")
async def get_available_scenarios():
    """List available failure scenarios with descriptions and severity scores."""
    return {
        "count": len(SCENARIOS),
        "scenarios": list_scenarios(),
    }


@app.get("/events/history", response_model=List[Event])
async def get_event_history():
    """Retrieve recently emitted events."""
    return manager.history


@app.get("/metrics/history", response_model=List[TelemetryPoint])
async def get_metrics_history():
    """Retrieve rolling time-series metrics history for live sparkline waveforms."""
    return traffic_engine.get_history()


@app.get("/service/{service_name}/telemetry")
async def get_service_telemetry(service_name: str):
    """Retrieve individual microservice telemetry metrics."""
    return traffic_engine.get_service_telemetry(service_name)


# --- GITOPS PULL REQUEST & REMEDIATION ENDPOINTS ---


@app.get("/pr/current", response_model=Optional[PullRequestDetails])
async def get_active_pr():
    """Retrieve current Pull Request details, unified diff, and CI/CD checks."""
    pr = get_current_pr()
    if not pr:
        # Default fallback to payment latency spike PR details if none opened yet
        default_sc = get_scenario("payment_latency_spike")
        if default_sc:
            await open_github_pr(default_sc)
            pr = get_current_pr()
    return pr


@app.post("/pr/merge")
async def merge_pr_endpoint():
    """Execute automated GitOps merge of active PR and deploy Terraform patch to production."""
    pr = get_current_pr()
    if not pr:
        raise HTTPException(status_code=400, detail="No active Pull Request to merge.")

    success, message = await merge_current_pr()
    if success:
        # Broadcast Stage 6/6 deployment_complete event over WebSocket
        deploy_ev = generate_deployment_complete_event(pr.target_service, pr.patch_file)
        await manager.broadcast(deploy_ev)
        traffic_engine.mark_protected(pr.target_service)

    return {"success": success, "message": message, "pr": get_current_pr()}


@app.post("/pr/configure")
async def configure_github_api(payload: Dict[str, str]):
    """Dynamically set GitHub API credentials from the UI."""
    token = payload.get("token", "")
    repo = payload.get("repo", "")
    return configure_github_credentials(token, repo)


# --- CUSTOM CHAOS INJECTION & AI INCIDENT REPORT ---


@app.post("/inject-fault")
async def inject_custom_fault(payload: CustomFaultInjection):
    """Inject custom on-demand chaos fault into any selected microservice."""
    scenario = create_custom_chaos_scenario(
        target_service=payload.service,
        fault_type=payload.fault_type,
        intensity_ms=payload.intensity_ms,
        error_rate_pct=payload.error_rate_pct,
    )

    # Launch execution asynchronously
    asyncio.create_task(execute_scenario_sequence(scenario.name, pace_ms=600))

    return {
        "status": "injected",
        "scenario_name": scenario.name,
        "target": payload.service,
        "fault_type": payload.fault_type,
        "severity_score": scenario.severity_score,
        "cascade_path": scenario.cascade_path,
    }


@app.get("/incident/report")
async def get_incident_report(scenario_name: str = "payment_latency_spike"):
    """Generate executive AI Incident Post-Mortem and Root Cause Analysis."""
    scenario = get_scenario(scenario_name) or get_scenario("payment_latency_spike")
    pr = get_current_pr()
    return generate_incident_report(scenario, pr)


@app.post("/reset")
async def reset_topology():
    """Reset all nodes in the topology back to healthy state."""
    static_graph = get_static_graph()
    reset_events: List[Event] = []
    ts = get_current_timestamp()
    traffic_engine.clear_faults()

    for node in static_graph.nodes:
        ev = Event(
            type="simulation_result",
            timestamp=ts,
            service=node.id,
            message=f"Topology Reset: {node.id} restored to healthy",
            detail="System state normalized",
            graph_delta=GraphDelta(node=node.id, state="healthy"),
        )
        reset_events.append(ev)
        await manager.broadcast(ev)

    return {
        "status": "reset_completed",
        "restored_nodes": [n.id for n in static_graph.nodes],
    }



# =============================================================================
# Scenario Execution Engine
# =============================================================================
async def execute_scenario_sequence(scenario_name: str, pace_ms: int = 600) -> List[Event]:
    """Execute full attack -> cascade -> fix -> validation -> PR sequence.

    Each step is paced with `asyncio.sleep` to allow frontend dashboard animation.
    """
    scenario = get_scenario(scenario_name)
    if not scenario:
        raise ValueError(f"Scenario '{scenario_name}' not found")

    sleep_sec = pace_ms / 1000.0
    emitted_events: List[Event] = []

    # Step 1: attack_start
    traffic_engine.inject_fault(scenario.target_service, 450.0, 28.0)
    ev1 = generate_attack_start_event(scenario)
    emitted_events.append(ev1)
    await manager.broadcast(ev1)
    await asyncio.sleep(sleep_sec)

    # Step 2: cascade hops (one event per hop)
    cascade_events = generate_cascade_events(scenario)
    for hop_ev in cascade_events:
        if hop_ev.service:
            traffic_engine.inject_fault(hop_ev.service, 320.0, 16.0)
        emitted_events.append(hop_ev)
        await manager.broadcast(hop_ev)
        await asyncio.sleep(sleep_sec)

    # Step 3: defender_fix (state -> patching)
    fix_ev = generate_defender_fix_event(scenario)
    emitted_events.append(fix_ev)
    await manager.broadcast(fix_ev)
    await asyncio.sleep(sleep_sec)

    # Step 4: simulation_result (validation proof-of-work)
    # The defender marks the targeted edge as protected and verifies containment
    protected_edges = {scenario.protected_edge}
    is_contained, _ = simulate_validation(scenario, protected_edges)
    sim_ev = generate_simulation_result_event(scenario, is_contained)
    emitted_events.append(sim_ev)

    # Traffic engine short-circuits faults and restores downstream nodes
    traffic_engine.mark_protected(scenario.target_service)
    for hop in scenario.cascade_path:
        if hop in traffic_engine.metrics:
            traffic_engine.metrics[hop].fault_latency_ms = 0.0
            traffic_engine.metrics[hop].fault_error_rate = 0.0

    await manager.broadcast(sim_ev)
    await asyncio.sleep(sleep_sec)

    # Step 5: pr_opened (open real GitHub PR or realistic stub)
    pr_ref, pr_url = await open_github_pr(scenario)
    pr_ev = generate_pr_opened_event(scenario, pr_ref, pr_url)
    emitted_events.append(pr_ev)
    await manager.broadcast(pr_ev)

    return emitted_events


@app.post("/run-scenario/{scenario_name}")
async def run_scenario(
    scenario_name: str,
    background: bool = Query(
        False,
        description="If True, launch scenario in background task and return immediately.",
    ),
    pace_ms: int = Query(
        600,
        description="Delay in milliseconds between sequence events (default: 600ms).",
    ),
):
    """Trigger a full resilience simulation run for a named scenario.

    Pushes events over WebSocket /events paced for live visualization.
    """
    scenario = get_scenario(scenario_name)
    if not scenario:
        valid_names = list(SCENARIOS.keys())
        raise HTTPException(
            status_code=404,
            detail=f"Unknown scenario '{scenario_name}'. Valid options: {valid_names}",
        )

    if background:
        # Launch asynchronously in the background
        asyncio.create_task(execute_scenario_sequence(scenario_name, pace_ms=pace_ms))
        return {
            "status": "started",
            "scenario": scenario_name,
            "message": f"Scenario '{scenario_name}' launched in background. Streaming over /events.",
        }
    else:
        # Await completion while broadcasting live
        events = await execute_scenario_sequence(scenario_name, pace_ms=pace_ms)
        return {
            "status": "completed",
            "scenario": scenario_name,
            "events_emitted_count": len(events),
            "events": [e.model_dump(mode="json") for e in events],
        }


# =============================================================================
# WebSocket Endpoint
# =============================================================================
@app.websocket("/events")
async def websocket_events_endpoint(websocket: WebSocket):
    """Live WebSocket event stream endpoint matching Section 3 Data Contract."""
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive; clients can also send heartbeat/ping
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
