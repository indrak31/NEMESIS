"""Orders DB Service (Port 8006) - Relational persistence layer with connection pooling."""

import asyncio
import time
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from .common import MicroserviceNode

node = MicroserviceNode("Orders DB", 8006)
app = FastAPI(title="Orders DB Service")
app.include_router(node.router)

# Simulated connection pool capacity
_MAX_CONNECTIONS = 50
_CONNECTION_SEMAPHORE = asyncio.Semaphore(_MAX_CONNECTIONS)


class QueryRequest(BaseModel):
    query_type: str = "INSERT_ORDER"
    payload: dict = {"order_id": "ord_9901", "amount": 129.99}


@app.post("/db/query")
async def execute_query(req: QueryRequest):
    t0 = time.perf_counter()
    status_code = 200

    # Acquire connection slot
    try:
        acquired = False
        try:
            # Short wait if saturated
            await asyncio.wait_for(_CONNECTION_SEMAPHORE.acquire(), timeout=0.8)
            acquired = True
        except asyncio.TimeoutError:
            raise HTTPException(
                status_code=504,
                detail="Orders DB connection pool exhausted: timeout waiting for connection slot",
            )

        await node.apply_chaos_delay()

        return {
            "status": "committed",
            "service": "Orders DB",
            "query_type": req.query_type,
            "rows_affected": 1,
            "tx_time_ms": round((time.perf_counter() - t0) * 1000, 2),
        }
    except HTTPException as e:
        status_code = e.status_code
        raise e
    finally:
        if acquired:
            _CONNECTION_SEMAPHORE.release()
        node.metrics.record_request(time.perf_counter() - t0, status_code)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8006, log_level="warning")
