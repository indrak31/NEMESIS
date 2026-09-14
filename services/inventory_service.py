"""Inventory Service (Port 8005) - Real-time stock reservation and catalog allocation."""

import time
from typing import Dict
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from .common import MicroserviceNode

node = MicroserviceNode("Inventory", 8005)
app = FastAPI(title="Inventory Service")
app.include_router(node.router)

_STOCK: Dict[str, int] = {
    "sku_default": 450,
    "sku_enterprise": 80,
}


class ReserveRequest(BaseModel):
    sku: str = "sku_default"
    quantity: int = 1


@app.post("/inventory/reserve")
async def reserve_stock(req: ReserveRequest):
    t0 = time.perf_counter()
    status_code = 200
    try:
        await node.apply_chaos_delay()
        current_stock = _STOCK.get(req.sku, 100)
        if current_stock < req.quantity:
            raise HTTPException(status_code=409, detail=f"Insufficient inventory for {req.sku}")

        _STOCK[req.sku] = current_stock - req.quantity
        return {
            "status": "reserved",
            "service": "Inventory",
            "sku": req.sku,
            "quantity": req.quantity,
            "remaining_stock": _STOCK[req.sku],
        }
    except HTTPException as e:
        status_code = e.status_code
        raise e
    finally:
        node.metrics.record_request(time.perf_counter() - t0, status_code)


@app.get("/inventory/check")
async def check_stock(sku: str = "sku_default"):
    t0 = time.perf_counter()
    status_code = 200
    try:
        await node.apply_chaos_delay()
        return {
            "service": "Inventory",
            "sku": sku,
            "in_stock": _STOCK.get(sku, 100) > 0,
            "available": _STOCK.get(sku, 100),
        }
    except HTTPException as e:
        status_code = e.status_code
        raise e
    finally:
        node.metrics.record_request(time.perf_counter() - t0, status_code)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8005, log_level="warning")
