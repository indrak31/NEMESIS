"""Payment Service (Port 8003) - Real transaction processing with client circuit breaker."""

import time
from fastapi import FastAPI, HTTPException
import httpx
from pydantic import BaseModel
from .common import MicroserviceNode

node = MicroserviceNode("Payment Service", 8003)
app = FastAPI(title="Payment Service")
app.include_router(node.router)

ORDERS_SERVICE_URL = "http://127.0.0.1:8004"


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


class PaymentRequest(BaseModel):
    payment_id: str = "pay_8839"
    amount: float = 99.99
    user_id: str = "usr_42"
    sku: str = "sku_default"


@app.post("/process-payment")
async def process_payment(req: PaymentRequest):
    t0 = time.perf_counter()
    status_code = 200

    async def _execute_call():
        # 1. Apply any injected chaos delay / error
        await node.apply_chaos_delay()

        # 2. Call downstream Orders Service
        client = get_client()
        resp = await client.post(
            f"{ORDERS_SERVICE_URL}/orders",
            json={
                "order_id": f"ord_{req.payment_id}",
                "user_id": req.user_id,
                "amount": req.amount,
                "sku": req.sku,
            },
        )
        if resp.status_code >= 400:
            raise HTTPException(
                status_code=resp.status_code,
                detail=f"Payment Service: Downstream order failure ({resp.text})",
            )
        return resp.json()

    async def _fallback(reason: str):
        # Graceful degraded fallback: queue for offline reconciliation
        return {
            "status": "degraded_fallback",
            "service": "Payment Service",
            "payment_id": req.payment_id,
            "circuit_breaker": node.circuit_breaker.state.value,
            "fallback_reason": reason,
            "message": "Transaction accepted for asynchronous batch settlement.",
        }

    try:
        # Pass through real circuit breaker
        result = await node.circuit_breaker.execute(_execute_call, _fallback)
        return result
    except HTTPException as e:
        status_code = e.status_code
        raise e
    except Exception as exc:
        status_code = 500
        raise HTTPException(status_code=500, detail=f"Payment processing failure: {str(exc)}")
    finally:
        node.metrics.record_request(time.perf_counter() - t0, status_code)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8003, log_level="warning")
