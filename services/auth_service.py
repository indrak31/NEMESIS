"""Auth Service (Port 8002) - Token verification and IAM authority."""

import time
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from .common import MicroserviceNode

node = MicroserviceNode("Auth Service", 8002)
app = FastAPI(title="Auth Service")
app.include_router(node.router)


class VerifyTokenRequest(BaseModel):
    token: str = "jwt_bearer_demo_token_xyz"
    user_id: str = "usr_42"


@app.post("/verify-token")
async def verify_token(req: VerifyTokenRequest):
    t0 = time.perf_counter()
    status_code = 200
    try:
        # In-service chaos check (e.g. CPU crypto exhaustion)
        await node.apply_chaos_delay()

        # Simple verification simulation
        is_valid = bool(req.token and req.user_id)
        if not is_valid:
            raise HTTPException(status_code=401, detail="Invalid bearer token credentials")

        return {
            "valid": True,
            "service": "Auth Service",
            "user_id": req.user_id,
            "roles": ["customer", "shopper"],
            "verification_time_ms": round((time.perf_counter() - t0) * 1000, 2),
        }
    except HTTPException as e:
        status_code = e.status_code
        raise e
    finally:
        node.metrics.record_request(time.perf_counter() - t0, status_code)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8002, log_level="warning")
