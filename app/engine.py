"""Scenario Engine ("Attacker") for Nemesis.

The Scenario Engine executes deterministic chaos failure vectors across the
dependency topology, simulating cascading brownouts with normalized severity scoring
and real-time event generation.
"""

from datetime import datetime
from typing import Dict, List, Optional
from .graph import get_node_criticality_map
from .models import Event, GraphDelta, ScenarioDefinition


def get_current_timestamp() -> str:
    """Return formatted timestamp HH:MM:SS matching data contract."""
    return datetime.now().strftime("%H:%M:%S")


# Library of 4 deterministic scenarios
SCENARIOS: Dict[str, ScenarioDefinition] = {
    "payment_latency_spike": ScenarioDefinition(
        name="payment_latency_spike",
        title="Payment Gateway Latency Spike",
        description=(
            "Simulates +400ms downstream latency injection on Payment Service, "
            "causing thread pool exhaustion that cascades into Orders Service and locks Orders DB."
        ),
        target_service="Payment Service",
        cascade_path=["Orders Service", "Orders DB"],
        severity_score=9.2,
        canned_fix_file="circuit_breaker.tf",
        canned_fix_desc="Deploy resilience circuit breaker and fallback bulkhead on Payment Service",
        protected_edge=("Payment Service", "Orders Service"),
    ),
    "orders_db_exhaustion": ScenarioDefinition(
        name="orders_db_exhaustion",
        title="Orders DB Connection Exhaustion",
        description=(
            "Simulates an unindexed slow query storm exhausting PostgreSQL connections in Orders DB, "
            "cascading backpressure to Orders Service, Inventory, and Payment Service."
        ),
        target_service="Orders DB",
        cascade_path=["Orders Service", "Inventory", "Payment Service"],
        severity_score=9.5,
        canned_fix_file="db_connection_pool.tf",
        canned_fix_desc="Deploy PgBouncer connection pooling and read-replica query routing",
        protected_edge=("Orders Service", "Orders DB"),
    ),
    "auth_token_flood": ScenarioDefinition(
        name="auth_token_flood",
        title="Auth Token Verification Flood",
        description=(
            "Simulates a massive spike in malformed JWT tokens causing high cryptographic CPU load "
            "in Auth Service, starving API Gateway request workers."
        ),
        target_service="Auth Service",
        cascade_path=["API Gateway"],
        severity_score=7.5,
        canned_fix_file="rate_limiter.tf",
        canned_fix_desc="Apply token-bucket rate limiter and Redis token caching at API Gateway",
        protected_edge=("API Gateway", "Auth Service"),
    ),
    "inventory_sync_deadlock": ScenarioDefinition(
        name="inventory_sync_deadlock",
        title="Inventory Sync Lock Contention",
        description=(
            "Simulates high concurrent lock contention on stock updates in Inventory, "
            "causing synchronous timeout cascades in Orders Service and Cache evictions."
        ),
        target_service="Inventory",
        cascade_path=["Orders Service", "Cache"],
        severity_score=6.8,
        canned_fix_file="async_inventory_queue.tf",
        canned_fix_desc="Decouple inventory updates with asynchronous FIFO queue and optimistic locking",
        protected_edge=("Orders Service", "Inventory"),
    ),
}


def calculate_severity(origin: str, cascade_path: List[str]) -> float:
    """Calculate severity score based on the number of critical nodes compromised.

    Formula:
    high criticality: 3 points
    medium criticality: 2 points
    low criticality: 1 point
    Normalized against maximum possible impact.
    """
    crit_map = get_node_criticality_map()
    all_affected = [origin] + cascade_path
    points = 0
    max_possible = len(crit_map) * 3  # 8 * 3 = 24

    for node in all_affected:
        crit = crit_map.get(node, "low")
        if crit == "high":
            points += 3
        elif crit == "medium":
            points += 2
        else:
            points += 1

    normalized = round(min(10.0, (points / 12.0) * 10.0), 1)
    return normalized


def get_scenario(scenario_name: str) -> Optional[ScenarioDefinition]:
    """Retrieve scenario definition by name."""
    return SCENARIOS.get(scenario_name)


def list_scenarios() -> List[Dict]:
    """List all available scenarios with their metadata."""
    return [
        {
            "name": s.name,
            "title": s.title,
            "description": s.description,
            "target_service": s.target_service,
            "cascade_path": s.cascade_path,
            "severity_score": s.severity_score,
            "canned_fix_file": s.canned_fix_file,
        }
        for s in SCENARIOS.values()
    ]


def generate_attack_start_event(scenario: ScenarioDefinition) -> Event:
    """Generate the initial attack_start event."""
    return Event(
        type="attack_start",
        timestamp=get_current_timestamp(),
        service=scenario.target_service,
        message=f"Attacker: injecting failure vector ({scenario.title})",
        detail=f"Target: {scenario.target_service} | Severity: {scenario.severity_score}/10",
        graph_delta=GraphDelta(node=scenario.target_service, state="attacked"),
    )


def generate_cascade_events(scenario: ScenarioDefinition) -> List[Event]:
    """Generate sequential cascade events for each affected downstream service."""
    events = []
    prev = scenario.target_service
    for hop in scenario.cascade_path:
        events.append(
            Event(
                type="cascade",
                timestamp=get_current_timestamp(),
                service=hop,
                message=f"Cascade: failure propagated from {prev} to {hop}",
                detail=f"Cascade path: {prev} -> {hop}",
                graph_delta=GraphDelta(node=hop, state="attacked"),
            )
        )
        prev = hop
    return events


def create_custom_chaos_scenario(
    target_service: str,
    fault_type: str = "latency",
    intensity_ms: int = 450,
    error_rate_pct: float = 30.0,
) -> ScenarioDefinition:
    """Dynamically synthesize a failure scenario for arbitrary user-selected node."""
    from .graph import STATIC_EDGES

    # Find immediate downstream neighbors
    downstream = [dst for src, dst in STATIC_EDGES if src == target_service]
    if not downstream:
        # Fallback to upstream caller if leaf node
        downstream = [src for src, dst in STATIC_EDGES if dst == target_service]

    cascade_path = downstream[:2] if downstream else ["Orders Service"]
    severity = calculate_severity(target_service, cascade_path)

    # Pick appropriate patch template
    if "db" in target_service.lower():
        patch_file = "db_connection_pool.tf"
        patch_desc = f"Deploy PgBouncer connection pooling and read replicas on {target_service}"
    elif "auth" in target_service.lower() or "gateway" in target_service.lower():
        patch_file = "rate_limiter.tf"
        patch_desc = f"Apply token-bucket rate limiter and WAF filtering on {target_service}"
    elif "inventory" in target_service.lower():
        patch_file = "async_inventory_queue.tf"
        patch_desc = f"Deploy asynchronous FIFO decoupling queue on {target_service}"
    else:
        patch_file = "circuit_breaker.tf"
        patch_desc = f"Deploy Envoy circuit breaker & outlier ejection bulkhead on {target_service}"

    protected_edge = (
        (target_service, cascade_path[0])
        if cascade_path
        else (target_service, "Orders Service")
    )

    scenario = ScenarioDefinition(
        name="custom_chaos",
        title=f"Custom Chaos: {fault_type.capitalize()} on {target_service} (+{intensity_ms}ms)",
        description=f"Ad-hoc {fault_type} injection of {intensity_ms}ms and {error_rate_pct}% error rate on {target_service}.",
        target_service=target_service,
        cascade_path=cascade_path,
        severity_score=severity,
        canned_fix_file=patch_file,
        canned_fix_desc=patch_desc,
        protected_edge=protected_edge,
    )
    SCENARIOS["custom_chaos"] = scenario
    return scenario

