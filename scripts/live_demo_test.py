"""Live verification script demonstrating real-time WebSocket reception.

Usage:
    python scripts/live_demo_test.py
"""

import asyncio
import json
import httpx
import websockets


async def run_live_verification():
    uri = "ws://127.0.0.1:8000/events"
    api_url = "http://127.0.0.1:8000/run-scenario/payment_latency_spike"

    print(f"Connecting to WebSocket at {uri}...")
    async with websockets.connect(uri) as ws:
        print("Connected to WebSocket! Triggering scenario via HTTP POST...")

        async with httpx.AsyncClient() as client:
            resp = await client.post(api_url, timeout=10.0)
            print(f"HTTP Response: {resp.status_code}")

        print("\n--- Receiving Live Streamed Events ---")
        received_count = 0
        while True:
            msg_text = await asyncio.wait_for(ws.recv(), timeout=5.0)
            event = json.loads(msg_text)
            received_count += 1
            print(
                f"[{event['timestamp']}] Event #{received_count}: {event['type']:<18} | Node: {event.get('service') or 'N/A':<16} | Msg: {event['message']}"
            )
            if event.get("graph_delta"):
                print(
                    f"    ↳ GraphDelta: {event['graph_delta']['node']} -> {event['graph_delta']['state']}"
                )
            if event.get("detail"):
                print(f"    ↳ Detail: {event['detail']}")

            if event["type"] == "pr_opened":
                print("\nVerification successful: 'pr_opened' received!")
                break

    print(f"Total events received: {received_count}")


if __name__ == "__main__":
    asyncio.run(run_live_verification())
