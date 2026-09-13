"""Tests for Nemesis scenario engine and defender validation logic."""

from app.defender import (
    TERRAFORM_PATCHES,
    generate_defender_fix_event,
    generate_simulation_result_event,
    get_patch_content,
    simulate_validation,
)
from app.engine import (
    SCENARIOS,
    calculate_severity,
    generate_attack_start_event,
    generate_cascade_events,
    get_scenario,
    list_scenarios,
)


def test_scenario_library_completeness():
    """Verify all 4 named failure scenarios are registered."""
    expected_scenarios = [
        "payment_latency_spike",
        "orders_db_exhaustion",
        "auth_token_flood",
        "inventory_sync_deadlock",
    ]
    for name in expected_scenarios:
        scenario = get_scenario(name)
        assert scenario is not None
        assert scenario.name == name
        assert len(scenario.cascade_path) > 0
        assert scenario.severity_score > 0
        assert scenario.canned_fix_file in TERRAFORM_PATCHES


def test_payment_latency_spike_deterministic_flow():
    """Verify exact cascade path and fix for payment_latency_spike."""
    scenario = get_scenario("payment_latency_spike")
    assert scenario.target_service == "Payment Service"
    assert scenario.cascade_path == ["Orders Service", "Orders DB"]
    assert scenario.canned_fix_file == "circuit_breaker.tf"
    assert scenario.protected_edge == ("Payment Service", "Orders Service")

    # Severity includes Payment Service (high), Orders Service (high), Orders DB (high)
    assert scenario.severity_score >= 8.0


def test_defender_simulated_validation():
    """Verify simulated re-run containment validation."""
    scenario = get_scenario("payment_latency_spike")

    # When protected edge is present in protected set:
    protected_set = {("Payment Service", "Orders Service")}
    is_contained, uncontained = simulate_validation(scenario, protected_set)
    assert is_contained is True
    assert uncontained == []

    # When protected edge is NOT present:
    is_contained_fail, uncontained_fail = simulate_validation(scenario, set())
    assert is_contained_fail is False
    assert uncontained_fail == scenario.cascade_path


def test_event_generation_contract():
    """Verify generated events strictly adhere to schema requirements."""
    scenario = get_scenario("payment_latency_spike")

    # 1. attack_start
    ev_start = generate_attack_start_event(scenario)
    assert ev_start.type == "attack_start"
    assert ev_start.service == "Payment Service"
    assert ev_start.graph_delta is not None
    assert ev_start.graph_delta.state == "attacked"
    assert ev_start.graph_delta.node == "Payment Service"

    # 2. cascade
    cascade_events = generate_cascade_events(scenario)
    assert len(cascade_events) == 2
    assert cascade_events[0].type == "cascade"
    assert cascade_events[0].service == "Orders Service"
    assert cascade_events[0].graph_delta.state == "attacked"
    assert cascade_events[1].type == "cascade"
    assert cascade_events[1].service == "Orders DB"
    assert cascade_events[1].graph_delta.state == "attacked"

    # 3. defender_fix
    ev_fix = generate_defender_fix_event(scenario)
    assert ev_fix.type == "defender_fix"
    assert ev_fix.detail == "circuit_breaker.tf"
    assert ev_fix.graph_delta.state == "patching"

    # 4. simulation_result
    ev_sim = generate_simulation_result_event(scenario, is_contained=True)
    assert ev_sim.type == "simulation_result"
    assert "cascade contained" in ev_sim.message.lower()
    assert ev_sim.graph_delta.state == "protected"


def test_terraform_patches():
    """Verify Terraform configurations exist for all canned fixes."""
    for patch_file, content in TERRAFORM_PATCHES.items():
        assert len(content.strip()) > 50
        assert "resource" in content
