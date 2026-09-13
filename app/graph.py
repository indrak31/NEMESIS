"""Static infrastructure topology definition for Nemesis.

This module provides the enterprise 8-service microservice graph and dependency edges
specified in the Nemesis Core Data Contract.
"""

from typing import Dict, List, Set, Tuple
from .models import GraphTopology, Node, NodeCriticality

# Static node list matching Section 3 of Data Contract
STATIC_NODES: List[Dict[str, str]] = [
    {"id": "API Gateway", "criticality": "high"},
    {"id": "Auth Service", "criticality": "medium"},
    {"id": "Payment Service", "criticality": "high"},
    {"id": "Orders Service", "criticality": "high"},
    {"id": "Inventory", "criticality": "medium"},
    {"id": "Orders DB", "criticality": "high"},
    {"id": "Cache", "criticality": "low"},
    {"id": "Notification", "criticality": "low"},
]

# Hardcoded static edge list (directed dependencies: [source, target])
STATIC_EDGES: List[Tuple[str, str]] = [
    ("API Gateway", "Auth Service"),
    ("API Gateway", "Payment Service"),
    ("Payment Service", "Orders Service"),
    ("Orders Service", "Orders DB"),
    ("Orders Service", "Inventory"),
    ("Orders Service", "Cache"),
    ("API Gateway", "Notification"),
]


def get_static_graph() -> GraphTopology:
    """Return the fixed static topology graph."""
    return GraphTopology(
        nodes=[Node(id=n["id"], criticality=n["criticality"]) for n in STATIC_NODES],
        edges=list(STATIC_EDGES),
    )


def get_node_criticality_map() -> Dict[str, NodeCriticality]:
    """Return mapping from node id to its criticality level."""
    return {n["id"]: n["criticality"] for n in STATIC_NODES}


def get_adjacency_list() -> Dict[str, List[str]]:
    """Return adjacency list of outgoing edges from each service."""
    adj: Dict[str, List[str]] = {n["id"]: [] for n in STATIC_NODES}
    for src, dst in STATIC_EDGES:
        adj[src].append(dst)
    return adj


def get_reverse_adjacency_list() -> Dict[str, List[str]]:
    """Return reverse adjacency list (incoming callers for each service)."""
    rev: Dict[str, List[str]] = {n["id"]: [] for n in STATIC_NODES}
    for src, dst in STATIC_EDGES:
        rev[dst].append(src)
    return rev
