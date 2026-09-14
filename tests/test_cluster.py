"""Integration tests for NEMESIS Real 8-Service Microservices Mesh."""

import asyncio
import pytest
import pytest_asyncio
import httpx
from app.cluster_manager import cluster_manager


@pytest_asyncio.fixture(scope="module")
async def live_cluster():
    """Start all 8 microservices once for the test module."""
    await cluster_manager.start()
    yield cluster_manager


@pytest_asyncio.fixture(autouse=True)
async def clean_services():
    """Reset all 8 microservices before each test to guarantee test isolation."""
    async with httpx.AsyncClient(timeout=2.0) as client:
        for port in range(8001, 8009):
            try:
                await client.post(f"http://127.0.0.1:{port}/admin/reset")
            except Exception:
                pass
    yield
    async with httpx.AsyncClient(timeout=2.0) as client:
        for port in range(8001, 8009):
            try:
                await client.post(f"http://127.0.0.1:{port}/admin/reset")
            except Exception:
                pass


@pytest.mark.asyncio
async def test_cluster_startup_and_health(live_cluster):
    """Verify all 8 microservices start and respond on ports 8001-8008."""
    health = await live_cluster.get_health_status()
    assert len(health) == 8
    for service_name, status in health.items():
        assert status["status"] == "healthy", f"Service {service_name} failed: {status}"


@pytest.mark.asyncio
async def test_real_http_checkout_cascade(live_cluster):
    """Verify real HTTP request traverses API Gateway down through all microservices."""
    async with httpx.AsyncClient(timeout=6.0) as client:
        resp = await client.post(
            "http://127.0.0.1:8001/checkout",
            json={
                "user_id": "usr_test_cluster",
                "sku": "sku_default",
                "amount": 49.99,
                "token": "valid_bearer_token",
            },
        )
        assert resp.status_code == 200, f"Checkout failed: {resp.text}"
        data = resp.json()
        assert data["status"] == "success"
        assert data["service"] == "API Gateway"
        assert "timings" in data
        assert "auth_ms" in data["timings"]
        assert "payment_ms" in data["timings"]
        assert "notification_ms" in data["timings"]
        assert data["total_latency_ms"] > 0


@pytest.mark.asyncio
async def test_real_chaos_injection_and_metrics(live_cluster):
    """Verify real in-service chaos causes measurable latency spike observed in real metrics."""
    async with httpx.AsyncClient(timeout=6.0) as client:
        # 1. Reset state
        await client.post("http://127.0.0.1:8003/admin/reset")

        # 2. Baseline latency
        resp1 = await client.post(
            "http://127.0.0.1:8001/checkout",
            json={"user_id": "usr_test", "sku": "sku_default", "amount": 10.0, "token": "token"},
        )
        assert resp1.status_code == 200
        base_latency = resp1.json()["total_latency_ms"]

        # 3. Inject real 200ms fault into Payment Service
        fault_resp = await client.post(
            "http://127.0.0.1:8003/admin/fault",
            json={"latency_ms": 200.0, "error_rate": 0.0},
        )
        assert fault_resp.status_code == 200

        # 4. Measure checkout under injected chaos
        resp2 = await client.post(
            "http://127.0.0.1:8001/checkout",
            json={"user_id": "usr_test", "sku": "sku_default", "amount": 10.0, "token": "token"},
        )
        assert resp2.status_code == 200
        chaos_latency = resp2.json()["total_latency_ms"]
        assert chaos_latency >= base_latency + 150.0, f"Expected >150ms increase: base={base_latency}, chaos={chaos_latency}"

        # 5. Verify Prometheus metrics format
        metrics_resp = await client.get(
            "http://127.0.0.1:8003/metrics",
            headers={"Accept": "text/plain"},
        )
        assert metrics_resp.status_code == 200
        assert "http_requests_total" in metrics_resp.text
        assert "http_request_duration_ms" in metrics_resp.text

        # 6. Reset fault
        await client.post("http://127.0.0.1:8003/admin/reset")


@pytest.mark.asyncio
async def test_real_circuit_breaker_mitigation(live_cluster):
    """Verify enabling circuit breaker fast-fails Payment Service and prevents downstream cascade."""
    async with httpx.AsyncClient(timeout=6.0) as client:
        # Reset state
        await client.post("http://127.0.0.1:8004/admin/reset")
        await client.post("http://127.0.0.1:8003/admin/reset")

        # Inject 100% 503 error into Orders Service (downstream of Payment)
        await client.post(
            "http://127.0.0.1:8004/admin/fault",
            json={"latency_ms": 10.0, "error_rate": 1.0},
        )

        # Enable circuit breaker on Payment Service with fast timeout
        cb_resp = await client.post(
            "http://127.0.0.1:8003/admin/config",
            json={
                "enabled": True,
                "timeout_ms": 100.0,
                "consecutive_5xx_threshold": 2,
                "base_ejection_seconds": 10.0,
            },
        )
        assert cb_resp.status_code == 200

        # Call payment service - first two will fail downstream, tripping the breaker
        for _ in range(3):
            pay_resp = await client.post(
                "http://127.0.0.1:8003/process-payment",
                json={"payment_id": "pay_cb_test", "amount": 25.0, "user_id": "usr_cb", "sku": "sku_default"},
            )

        # The breaker should now be OPEN and returning degraded fallback
        data = pay_resp.json()
        assert data["status"] == "degraded_fallback"
        assert data["circuit_breaker"] == "OPEN"

        # Cleanup
        await client.post("http://127.0.0.1:8004/admin/reset")
        await client.post("http://127.0.0.1:8003/admin/reset")
