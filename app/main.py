"""Nemesis Resilience Platform — Backend API Service.

This service provides:
1. Static microservice topology via `GET /graph`
2. Deterministic adversarial scenario runner via `POST /run-scenario/{name}`
3. Live event streaming over WebSocket via `WS /events`
4. Rule-based Defender fix and simulated containment verification
5. Pull Request bot (real GitHub PR integration when GITHUB_TOKEN is set, realistic stub otherwise)
"""

import asyncio
from contextlib import asynccontextmanager
from typing import Dict, List, Optional, Set
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

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
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup initialization
    yield
    # Shutdown cleanup


app = FastAPI(
    title="Nemesis API",
    description="Adversarial resilience simulation backend for microservice topologies",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for frontend integration (React dashboard on localhost:3000 / 5173 / etc.)
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
        },
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": get_current_timestamp(),
        "active_ws_clients": len(manager.active_connections),
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


@app.post("/reset")
async def reset_topology():
    """Reset all nodes in the topology back to healthy state."""
    static_graph = get_static_graph()
    reset_events: List[Event] = []
    ts = get_current_timestamp()

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
    ev1 = generate_attack_start_event(scenario)
    emitted_events.append(ev1)
    await manager.broadcast(ev1)
    await asyncio.sleep(sleep_sec)

    # Step 2: cascade hops (one event per hop)
    cascade_events = generate_cascade_events(scenario)
    for hop_ev in cascade_events:
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
