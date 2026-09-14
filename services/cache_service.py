"""Cache Service (Port 8007) - Low-latency in-memory key-value layer."""

import time
from typing import Dict
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from .common import MicroserviceNode

node = MicroserviceNode("Cache", 8007)
app = FastAPI(title="Cache Service")
app.include_router(node.router)

_STORE: Dict[str, str] = {
    "session:user_1": '{"auth": true, "roles": ["customer"]}',
    "sku:item_42": '{"name": "Server Cluster Blade", "price": 499.0, "stock": 140}',
}


class SetCacheRequest(BaseModel):
    key: str
    value: str
    ttl_seconds: int = 300


@app.get("/cache/get")
async def get_cache(key: str = "sku:item_42"):
    t0 = time.perf_counter()
    status_code = 200
    try:
        await node.apply_chaos_delay()
        val = _STORE.get(key)
        return {
            "service": "Cache",
            "key": key,
            "hit": val is not None,
            "value": val or "{}",
        }
    except HTTPException as e:
        status_code = e.status_code
        raise e
    finally:
        node.metrics.record_request(time.perf_counter() - t0, status_code)


@app.post("/cache/set")
async def set_cache(req: SetCacheRequest):
    t0 = time.perf_counter()
    status_code = 200
    try:
        await node.apply_chaos_delay()
        _STORE[req.key] = req.value
        return {"status": "ok", "service": "Cache", "key": req.key}
    except HTTPException as e:
        status_code = e.status_code
        raise e
    finally:
        node.metrics.record_request(time.perf_counter() - t0, status_code)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8007, log_level="warning")
