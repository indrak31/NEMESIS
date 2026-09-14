"""Orders Service (Port 8004) - Order lifecycle coordinator."""

import time
from fastapi import FastAPI, HTTPException
import httpx
from pydantic import BaseModel
from .common import MicroserviceNode

node = MicroserviceNode("Orders Service", 8004)
app = FastAPI(title="Orders Service")
app.include_router(node.router)

ORDERS_DB_URL = "http://127.0.0.1:8006"
INVENTORY_URL = "http://127.0.0.1:8005"
CACHE_URL = "http://127.0.0.1:8007"
from typing import Optional

_client: Optional[httpx.AsyncClient] = None


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=4.0,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=50),
        )
    return _client


class CreateOrderRequest(BaseModel):
    order_id: str = "ord_1001"
    user_id: str = "usr_42"
    amount: float = 99.99
    sku: str = "sku_default"


@app.post("/orders")
async def create_order(req: CreateOrderRequest):
    t0 = time.perf_counter()
    status_code = 200
    try:
        # In-service chaos check
        await node.apply_chaos_delay()

        # Real HTTP calls to downstream dependencies
        client = get_client()
        # 1. Check cache
        try:
            cache_resp = await client.get(f"{CACHE_URL}/cache/get?key=sku:{req.sku}")
        except Exception:
            pass

        # 2. Reserve inventory
        inv_resp = await client.post(
            f"{INVENTORY_URL}/inventory/reserve",
            json={"sku": req.sku, "quantity": 1},
        )
        if inv_resp.status_code >= 400:
            raise HTTPException(
                status_code=inv_resp.status_code,
                detail=f"Inventory failure: {inv_resp.text}",
            )

        # 3. Write order to Orders DB
        db_resp = await client.post(
            f"{ORDERS_DB_URL}/db/query",
            json={"query_type": "INSERT_ORDER", "payload": req.model_dump()},
        )
        if db_resp.status_code >= 400:
            raise HTTPException(
                status_code=db_resp.status_code,
                detail=f"Orders DB failure: {db_resp.text}",
            )

        return {
            "status": "created",
            "service": "Orders Service",
            "order_id": req.order_id,
            "total_ms": round((time.perf_counter() - t0) * 1000, 2),
        }
    except HTTPException as e:
        status_code = e.status_code
        raise e
    except Exception as exc:
        status_code = 502
        raise HTTPException(status_code=502, detail=f"Orders Service downstream error: {str(exc)}")
    finally:
        node.metrics.record_request(time.perf_counter() - t0, status_code)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8004, log_level="warning")
