"""API Gateway (Port 8001) - Top-level edge routing and transit gateway."""

import time
from typing import Optional
from fastapi import FastAPI, HTTPException
import httpx
from pydantic import BaseModel
from .common import MicroserviceNode

node = MicroserviceNode("API Gateway", 8001)
app = FastAPI(title="API Gateway")
app.include_router(node.router)

AUTH_SERVICE_URL = "http://127.0.0.1:8002"
PAYMENT_SERVICE_URL = "http://127.0.0.1:8003"
NOTIFICATION_SERVICE_URL = "http://127.0.0.1:8008"


_client: Optional[httpx.AsyncClient] = None


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=6.0,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=50),
        )
    return _client


class CheckoutRequest(BaseModel):
    user_id: str = "usr_42"
    sku: str = "sku_default"
    amount: float = 99.99
    token: str = "jwt_bearer_demo_token_xyz"


@app.post("/checkout")
async def handle_checkout(req: CheckoutRequest):
    t0 = time.perf_counter()
    status_code = 200
    timings = {}

    try:
        # In-service chaos check on gateway itself
        await node.apply_chaos_delay()

        client = get_client()
        # 1. Edge Auth Verification
        t_auth = time.perf_counter()
        auth_resp = await client.post(
            f"{AUTH_SERVICE_URL}/verify-token",
            json={"token": req.token, "user_id": req.user_id},
        )
        timings["auth_ms"] = round((time.perf_counter() - t_auth) * 1000, 2)
        if auth_resp.status_code >= 400:
            raise HTTPException(status_code=auth_resp.status_code, detail="Auth token verification failed")

        # 2. Payment & Downstream Orders Cascade
        t_pay = time.perf_counter()
        pay_resp = await client.post(
            f"{PAYMENT_SERVICE_URL}/process-payment",
            json={
                "payment_id": f"pay_{int(time.time() * 1000) % 100000}",
                "amount": req.amount,
                "user_id": req.user_id,
                "sku": req.sku,
            },
        )
        timings["payment_ms"] = round((time.perf_counter() - t_pay) * 1000, 2)
        if pay_resp.status_code >= 500:
            raise HTTPException(status_code=502, detail=f"Upstream payment gateway failure: {pay_resp.text}")

        pay_data = pay_resp.json()

        # 3. Notification Dispatch
        t_notif = time.perf_counter()
        try:
            await client.post(
                f"{NOTIFICATION_SERVICE_URL}/notify",
                json={
                    "user_id": req.user_id,
                    "event_type": "checkout_success",
                    "message": f"Payment {pay_data.get('status')} for amount ${req.amount}",
                },
            )
        except Exception:
            pass  # Non-blocking async notification
        timings["notification_ms"] = round((time.perf_counter() - t_notif) * 1000, 2)

        total_ms = round((time.perf_counter() - t0) * 1000, 2)
        return {
            "status": "success",
            "service": "API Gateway",
            "total_latency_ms": total_ms,
            "timings": timings,
            "payment_result": pay_data,
        }

    except HTTPException as e:
        status_code = e.status_code
        raise e
    except Exception as exc:
        status_code = 504
        raise HTTPException(status_code=504, detail=f"API Gateway upstream timeout: {str(exc)}")
    finally:
        node.metrics.record_request(time.perf_counter() - t0, status_code)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="warning")
