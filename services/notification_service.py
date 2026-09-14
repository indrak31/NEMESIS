"""Notification Service (Port 8008) - Asynchronous notification dispatcher."""

import time
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from .common import MicroserviceNode

node = MicroserviceNode("Notification", 8008)
app = FastAPI(title="Notification Service")
app.include_router(node.router)


class NotifyRequest(BaseModel):
    user_id: str = "usr_demo_101"
    event_type: str = "order_completed"
    message: str = "Order placed successfully"


@app.post("/notify")
async def send_notification(req: NotifyRequest):
    t0 = time.perf_counter()
    status_code = 200
    try:
        await node.apply_chaos_delay()
        return {
            "status": "sent",
            "service": "Notification",
            "user_id": req.user_id,
            "channel": "email_and_sms",
            "delivered_at": time.time(),
        }
    except HTTPException as e:
        status_code = e.status_code
        raise e
    finally:
        node.metrics.record_request(time.perf_counter() - t0, status_code)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8008, log_level="warning")
