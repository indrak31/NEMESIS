"""Tests for GitOps Pull Request lifecycle, live traffic simulation, and custom chaos injection."""

import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.github_pr import get_current_pr, open_github_pr
from app.engine import get_scenario


@pytest.mark.asyncio
async def test_gitops_pr_current_endpoint():
    """Verify that /pr/current returns structured PR details with diff and CI checks."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/pr/current")
        assert res.status_code == 200
        data = res.json()
        assert "number" in data
        assert "title" in data
        assert "diff_content" in data
        assert "ci_checks" in data
        assert len(data["ci_checks"]) >= 2
        assert "diff --git" in data["diff_content"]


@pytest.mark.asyncio
async def test_gitops_pr_merge_endpoint():
    """Verify that /pr/merge transitions PR state to deployed."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Ensure a PR is open
        await client.get("/pr/current")

        res = await client.post("/pr/merge")
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert "merged PR" in data["message"]
        assert data["pr"]["status"] == "deployed"


@pytest.mark.asyncio
async def test_metrics_history_endpoint():
    """Verify that /metrics/history returns time-series points."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/metrics/history")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)


@pytest.mark.asyncio
async def test_service_telemetry_endpoint():
    """Verify individual service telemetry retrieval."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/service/Payment%20Service/telemetry")
        assert res.status_code == 200
        data = res.json()
        assert data["service"] == "Payment Service"
        assert "p99_latency_ms" in data
        assert "active_connections" in data


@pytest.mark.asyncio
async def test_custom_fault_injection_endpoint():
    """Verify on-demand custom chaos injection endpoint."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "service": "Orders DB",
            "fault_type": "latency",
            "intensity_ms": 600,
            "error_rate_pct": 35.0,
        }
        res = await client.post("/inject-fault", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "injected"
        assert data["target"] == "Orders DB"
        assert "custom_chaos" in data["scenario_name"]


@pytest.mark.asyncio
async def test_incident_report_generation():
    """Verify AI Root Cause Analysis and Post-Mortem report generation."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/incident/report?scenario_name=payment_latency_spike")
        assert res.status_code == 200
        data = res.json()
        assert "incident_id" in data
        assert "root_cause_analysis" in data
        assert "markdown_content" in data
        assert "Executive Summary" in data["markdown_content"]
