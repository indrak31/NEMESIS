"""NEMESIS Real Cluster Manager.

Orchestrates all 8 microservices on dedicated TCP ports (8001 - 8008)
using daemon server threads (providing independent event loops and clean socket isolation on Windows):
- API Gateway (8001)
- Auth Service (8002)
- Payment Service (8003)
- Orders Service (8004)
- Inventory Service (8005)
- Orders DB Service (8006)
- Cache Service (8007)
- Notification Service (8008)
"""

import asyncio
import logging
import threading
import time
from typing import Dict, List
import httpx
import uvicorn

logger = logging.getLogger("nemesis.cluster")

PORTS = {
    "API Gateway": 8001,
    "Auth Service": 8002,
    "Payment Service": 8003,
    "Orders Service": 8004,
    "Inventory": 8005,
    "Orders DB": 8006,
    "Cache": 8007,
    "Notification": 8008,
}


class ClusterManager:
    """Manages lifecycle of all 8 real microservices running on dedicated TCP ports."""

    def __init__(self):
        self._servers: List[uvicorn.Server] = []
        self._threads: List[threading.Thread] = []
        self._is_running = False

    async def start(self):
        """Start all 8 microservice servers in daemon threads with dedicated socket listeners."""
        if self._is_running:
            return

        # Check if already running / listening externally
        already_healthy = True
        try:
            async with httpx.AsyncClient(timeout=0.3) as client:
                for port in PORTS.values():
                    r = await client.get(f"http://127.0.0.1:{port}/health")
                    if r.status_code != 200:
                        already_healthy = False
                        break
        except Exception:
            already_healthy = False

        if already_healthy:
            self._is_running = True
            logger.info("All 8 microservices are already UP and healthy.")
            return

        logger.info("Starting NEMESIS 8-service real microservices mesh on ports 8001-8008...")

        from services.api_gateway import app as app_gw
        from services.auth_service import app as app_auth
        from services.payment_service import app as app_pay
        from services.orders_service import app as app_ord
        from services.inventory_service import app as app_inv
        from services.orders_db import app as app_db
        from services.cache_service import app as app_cache
        from services.notification_service import app as app_notif

        apps = [
            ("API Gateway", 8001, app_gw),
            ("Auth Service", 8002, app_auth),
            ("Payment Service", 8003, app_pay),
            ("Orders Service", 8004, app_ord),
            ("Inventory", 8005, app_inv),
            ("Orders DB", 8006, app_db),
            ("Cache", 8007, app_cache),
            ("Notification", 8008, app_notif),
        ]

        for name, port, app_inst in apps:
            config = uvicorn.Config(
                app=app_inst,
                host="127.0.0.1",
                port=port,
                log_level="error",
                access_log=False,
            )
            server = uvicorn.Server(config)
            self._servers.append(server)
            t = threading.Thread(target=server.run, name=f"svc-{name}", daemon=True)
            t.start()
            self._threads.append(t)

        # Wait for all ports to respond with 200 OK on /health
        await self._wait_for_healthy(timeout_seconds=6.0)
        self._is_running = True
        logger.info("All 8 microservices are UP and listening on ports 8001-8008.")

    async def _wait_for_healthy(self, timeout_seconds: float = 6.0):
        """Poll health endpoint on all services until responsive."""
        deadline = time.time() + timeout_seconds

        async with httpx.AsyncClient(timeout=0.6) as client:
            for name, port in PORTS.items():
                while time.time() < deadline:
                    try:
                        res = await client.get(f"http://127.0.0.1:{port}/health")
                        if res.status_code == 200:
                            break
                    except Exception:
                        await asyncio.sleep(0.08)

    async def stop(self):
        """Gracefully signal all microservice servers to exit."""
        if not self._is_running:
            return

        logger.info("Stopping NEMESIS microservices mesh...")
        for server in self._servers:
            server.should_exit = True

        # Wait for threads to terminate
        await asyncio.sleep(0.3)
        self._servers.clear()
        self._threads.clear()
        self._is_running = False
        logger.info("NEMESIS microservices mesh stopped.")

    async def get_health_status(self) -> Dict[str, dict]:
        """Query health of all 8 microservices."""
        statuses = {}
        async with httpx.AsyncClient(timeout=1.0) as client:
            for name, port in PORTS.items():
                try:
                    res = await client.get(f"http://127.0.0.1:{port}/health")
                    statuses[name] = res.json() if res.status_code == 200 else {"status": "error"}
                except Exception as exc:
                    statuses[name] = {"status": "unreachable", "error": str(exc)}
        return statuses


# Cluster singleton
cluster_manager = ClusterManager()
