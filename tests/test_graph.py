"""Tests for Nemesis static infrastructure topology contract."""

from app.graph import STATIC_EDGES, STATIC_NODES, get_static_graph
from app.models import GraphTopology


def test_static_graph_structure():
    """Verify that get_static_graph matches the exact topology specification."""
    g = get_static_graph()
    assert isinstance(g, GraphTopology)
    assert len(g.nodes) == 8
    assert len(g.edges) == 7

    node_dict = {n.id: n.criticality for n in g.nodes}
    expected_criticalities = {
        "API Gateway": "high",
        "Auth Service": "medium",
        "Payment Service": "high",
        "Orders Service": "high",
        "Inventory": "medium",
        "Orders DB": "high",
        "Cache": "low",
        "Notification": "low",
    }
    assert node_dict == expected_criticalities


def test_static_edges_exact_contract():
    """Verify edges strictly match Section 3 Data Contract."""
    expected_edges = [
        ("API Gateway", "Auth Service"),
        ("API Gateway", "Payment Service"),
        ("Payment Service", "Orders Service"),
        ("Orders Service", "Orders DB"),
        ("Orders Service", "Inventory"),
        ("Orders Service", "Cache"),
        ("API Gateway", "Notification"),
    ]
    assert STATIC_EDGES == expected_edges

    # Check all edge endpoints exist in nodes
    node_ids = {n["id"] for n in STATIC_NODES}
    for src, dst in STATIC_EDGES:
        assert src in node_ids, f"Source node {src} not found in nodes"
        assert dst in node_ids, f"Target node {dst} not found in nodes"
