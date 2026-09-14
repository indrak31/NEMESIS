"""Shared Microservice Utilities for NEMESIS Real Microservices Mesh.

Provides:
1. Real latency and 5xx metrics tracking with Prometheus/OpenMetrics text export.
2. In-service chaos fault injection (real asyncio.sleep latency and 503 error injection).
3. Client-side Circuit Breaker with configurable timeout, retry, and outlier ejection.
4. Standard endpoints (/health, /metrics, /admin/fault, /admin/config).
"""

import asyncio
from collections import deque
from enum import Enum
import random
import time
from typing import Any, Callable, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel


class CircuitState(str, Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class FaultConfig(BaseModel):
    latency_ms: float = 0.0
    error_rate: float = 0.0  # 0.0 to 1.0
    connection_limit: Optional[int] = None


class CircuitBreakerConfig(BaseModel):
    enabled: bool = False
    timeout_ms: float = 30.0
    consecutive_5xx_threshold: int = 3
    base_ejection_seconds: float = 15.0


class ServiceMetrics:
    """Thread-safe in-memory metrics collector for real microservices."""

    def __init__(self, service_name: str):
        self.service_name = service_name
        self.start_time = time.time()
        self.requests_total: int = 0
        self.requests_2xx_total: int = 0
        self.requests_5xx_total: int = 0
        self.active_connections: int = 0
        self.latency_history: deque = deque(maxlen=200)

    def record_request(self, duration_seconds: float, status_code: int):
        self.requests_total += 1
        duration_ms = duration_seconds * 1000.0
        self.latency_history.append(duration_ms)

        if 200 <= status_code < 300:
            self.requests_2xx_total += 1
        elif status_code >= 500:
            self.requests_5xx_total += 1

    def get_percentile_ms(self, percentile: float) -> float:
        if not self.latency_history:
            return 0.0
        sorted_history = sorted(self.latency_history)
        idx = int(len(sorted_history) * (percentile / 100.0))
        idx = min(idx, len(sorted_history) - 1)
        return round(sorted_history[idx], 2)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "service": self.service_name,
            "uptime_seconds": round(time.time() - self.start_time, 1),
            "requests_total": self.requests_total,
            "requests_2xx_total": self.requests_2xx_total,
            "requests_5xx_total": self.requests_5xx_total,
            "error_rate_pct": (
                round((self.requests_5xx_total / self.requests_total) * 100.0, 2)
                if self.requests_total > 0
                else 0.0
            ),
            "active_connections": self.active_connections,
            "p50_latency_ms": self.get_percentile_ms(50),
            "p95_latency_ms": self.get_percentile_ms(95),
            "p99_latency_ms": self.get_percentile_ms(99),
        }

    def to_prometheus(self) -> str:
        d = self.to_dict()
        lines = [
            f"# HELP http_requests_total Total number of HTTP requests.",
            f"# TYPE http_requests_total counter",
            f'http_requests_total{{service="{self.service_name}"}} {d["requests_total"]}',
            f"# HELP http_requests_5xx_total Total number of HTTP 5xx errors.",
            f"# TYPE http_requests_5xx_total counter",
            f'http_requests_5xx_total{{service="{self.service_name}"}} {d["requests_5xx_total"]}',
            f"# HELP http_request_duration_ms Latency percentiles in milliseconds.",
            f"# TYPE http_request_duration_ms gauge",
            f'http_request_duration_ms{{service="{self.service_name}",quantile="0.5"}} {d["p50_latency_ms"]}',
            f'http_request_duration_ms{{service="{self.service_name}",quantile="0.95"}} {d["p95_latency_ms"]}',
            f'http_request_duration_ms{{service="{self.service_name}",quantile="0.99"}} {d["p99_latency_ms"]}',
            f"# HELP active_connections Active in-flight connections.",
            f"# TYPE active_connections gauge",
            f'active_connections{{service="{self.service_name}"}} {d["active_connections"]}',
        ]
        return "\n".join(lines) + "\n"


class CircuitBreaker:
    """Client-side Circuit Breaker implementing Outlier Ejection & Fast-Fallback."""

    def __init__(self, target_service: str, config: Optional[CircuitBreakerConfig] = None):
        self.target_service = target_service
        self.config = config or CircuitBreakerConfig()
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_ejection_time = 0.0

    async def execute(self, call_fn: Callable, fallback_fn: Callable):
        now = time.time()

        # If breaker is not enabled, execute directly
        if not self.config.enabled:
            return await call_fn()

        # Check if ejection period expired
        if self.state == CircuitState.OPEN:
            if now - self.last_ejection_time > self.config.base_ejection_seconds:
                self.state = CircuitState.HALF_OPEN
            else:
                # Fast fail / trip immediately
                return await fallback_fn("circuit_breaker_open_ejection")

        try:
            # Enforce timeout
            timeout_sec = self.config.timeout_ms / 1000.0
            result = await asyncio.wait_for(call_fn(), timeout=timeout_sec)
            # Success in half-open resets breaker
            if self.state == CircuitState.HALF_OPEN:
                self.state = CircuitState.CLOSED
                self.failure_count = 0
            return result
        except (asyncio.TimeoutError, Exception) as exc:
            self.failure_count += 1
            if self.failure_count >= self.config.consecutive_5xx_threshold:
                self.state = CircuitState.OPEN
                self.last_ejection_time = now
            return await fallback_fn(str(exc))


class MicroserviceNode:
    """Common microservice controller wrapping FastAPI router with diagnostics."""

    def __init__(self, service_name: str, port: int):
        self.service_name = service_name
        self.port = port
        self.metrics = ServiceMetrics(service_name)
        self.fault = FaultConfig()
        self.circuit_breaker = CircuitBreaker(service_name)
        self.router = APIRouter()
        self._setup_standard_routes()

    def _setup_standard_routes(self):
        @self.router.get("/health")
        async def health():
            return {
                "status": "healthy",
                "service": self.service_name,
                "port": self.port,
                "circuit_breaker": self.circuit_breaker.state,
                "fault_active": self.fault.latency_ms > 0 or self.fault.error_rate > 0,
            }

        @self.router.get("/metrics")
        async def metrics(request: Request):
            accept = request.headers.get("accept", "")
            if "text/plain" in accept or "openmetrics" in accept:
                return Response(content=self.metrics.to_prometheus(), media_type="text/plain")
            return self.metrics.to_dict()

        @self.router.post("/admin/fault")
        async def set_fault(config: FaultConfig):
            self.fault = config
            return {
                "service": self.service_name,
                "status": "fault_configured",
                "fault": self.fault.model_dump(),
            }

        @self.router.post("/admin/config")
        async def set_config(config: CircuitBreakerConfig):
            self.circuit_breaker.config = config
            if config.enabled:
                self.circuit_breaker.state = CircuitState.CLOSED
                self.circuit_breaker.failure_count = 0
            return {
                "service": self.service_name,
                "status": "circuit_breaker_updated",
                "config": config.model_dump(),
                "state": self.circuit_breaker.state,
            }

        @self.router.post("/admin/reset")
        async def reset():
            self.fault = FaultConfig()
            self.circuit_breaker.config = CircuitBreakerConfig(enabled=False)
            self.circuit_breaker.state = CircuitState.CLOSED
            self.circuit_breaker.failure_count = 0
            return {"service": self.service_name, "status": "reset_complete"}

    async def apply_chaos_delay(self):
        """Applies configured real sleep or throws real 503 error."""
        self.metrics.active_connections += 1
        try:
            if self.fault.latency_ms > 0:
                await asyncio.sleep(self.fault.latency_ms / 1000.0)

            if self.fault.error_rate > 0:
                if random.random() < self.fault.error_rate:
                    raise HTTPException(
                        status_code=503,
                        detail=f"{self.service_name} degraded: high error rate injected",
                    )
        finally:
            self.metrics.active_connections = max(0, self.metrics.active_connections - 1)
