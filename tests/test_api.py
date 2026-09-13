"""End-to-end API and WebSocket tests for Nemesis backend."""

import pytest
from fastapi.testclient import TestClient
from app.main import app, manager
from app.models import Event


@pytest.fixture
def client():
    return TestClient(app)


def test_root_endpoint(client):
    """Verify root endpoint provides discovery info."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "Nemesis Resilience Platform Backend"
    assert "/graph" in data["endpoints"].values()
    assert "/events" in data["endpoints"].values()


def test_health_endpoint(client):
    """Verify health endpoint reports online status."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "timestamp" in data


def test_get_graph_contract(client):
    """Verify GET /graph conforms strictly to Section 3 contract."""
    response = client.get("/graph")
    assert response.status_code == 200
    data = response.json()

    # Must contain nodes and edges keys
    assert "nodes" in data
    assert "edges" in data
    assert len(data["nodes"]) == 8
    assert len(data["edges"]) == 7

    # Check node schema
    for node in data["nodes"]:
        assert "id" in node
        assert "criticality" in node
        assert node["criticality"] in ["high", "medium", "low"]

    # Check payment and auth edges
    edges_tuples = [tuple(e) for e in data["edges"]]
    assert ("API Gateway", "Payment Service") in edges_tuples
    assert ("Payment Service", "Orders Service") in edges_tuples


def test_list_scenarios(client):
    """Verify GET /scenarios lists registered failure scenarios."""
    response = client.get("/scenarios")
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 4
    names = [s["name"] for s in data["scenarios"]]
    assert "payment_latency_spike" in names
    assert "orders_db_exhaustion" in names


def test_run_scenario_404(client):
    """Verify unknown scenario name returns 404."""
    response = client.post("/run-scenario/invalid_scenario_name")
    assert response.status_code == 404
    assert "Unknown scenario" in response.json()["detail"]


def test_run_scenario_payment_latency_spike(client):
    """Verify full execution sequence for payment_latency_spike."""
    response = client.post("/run-scenario/payment_latency_spike?pace_ms=1")
    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "completed"
    assert data["scenario"] == "payment_latency_spike"
    events = data["events"]

    # Sequence must match:
    # 1. attack_start
    # 2. cascade (Orders Service)
    # 3. cascade (Orders DB)
    # 4. defender_fix
    # 5. simulation_result
    # 6. pr_opened
    assert len(events) == 6

    ev_types = [e["type"] for e in events]
    assert ev_types == [
        "attack_start",
        "cascade",
        "cascade",
        "defender_fix",
        "simulation_result",
        "pr_opened",
    ]

    # Validate every event strictly validates against Event model
    for raw_ev in events:
        ev = Event(**raw_ev)
        assert ev.timestamp
        assert ev.message

    # Verify specific event properties
    assert events[0]["service"] == "Payment Service"
    assert events[0]["graph_delta"]["state"] == "attacked"

    assert events[1]["service"] == "Orders Service"
    assert events[1]["graph_delta"]["state"] == "attacked"

    assert events[2]["service"] == "Orders DB"
    assert events[2]["graph_delta"]["state"] == "attacked"

    assert events[3]["detail"] == "circuit_breaker.tf"
    assert events[3]["graph_delta"]["state"] == "patching"

    assert "contained" in events[4]["message"].lower()
    assert events[4]["graph_delta"]["state"] == "protected"

    assert "pr_opened" == events[5]["type"]
    assert "#" in events[5]["detail"]


def test_reset_endpoint(client):
    """Verify POST /reset emits normalized healthy state for all 8 nodes."""
    response = client.post("/reset")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "reset_completed"
    assert len(data["restored_nodes"]) == 8


def test_websocket_event_streaming(client):
    """Verify WebSocket client receives real-time broadcasted events."""
    with client.websocket_connect("/events") as ws:
        # Trigger scenario run
        response = client.post("/run-scenario/auth_token_flood?pace_ms=1")
        assert response.status_code == 200

        # Read events from WebSocket
        received_events = []
        for _ in range(4):  # attack_start + cascade (API Gateway) + fix + sim_result + pr_opened -> 5 events
            msg = ws.receive_json()
            received_events.append(msg)

        assert len(received_events) >= 4
        assert received_events[0]["type"] == "attack_start"
        assert received_events[0]["service"] == "Auth Service"
