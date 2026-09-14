import asyncio
import json
import time
import httpx
import websockets

async def run_single_flow(iteration: int):
    print(f"\n>>> STARTING RUN {iteration} OF 3 <<<")
    uri = "ws://127.0.0.1:8000/events"
    events_received = []

    async with websockets.connect(uri) as ws:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Step 1: Trigger attack
            t_start = time.perf_counter()
            r_trig = await client.post("http://127.0.0.1:8000/run-scenario/payment_latency_spike")
            if r_trig.status_code != 200:
                return False, f"Trigger failed with {r_trig.status_code}: {r_trig.text}"
            print(f"  [Run {iteration}] Step 1: Scenario Triggered (Status 200)")

            # Step 2: Stream WebSocket events
            while len(events_received) < 5:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=8.0)
                    data = json.loads(msg)
                    events_received.append(data)
                    print(f"  [Run {iteration}] Step 2 Event: type={data.get('type'):17} | service={data.get('service'):15} | {data.get('message')}")
                except asyncio.TimeoutError:
                    return False, f"Timeout waiting for WS event {len(events_received)+1}/5"

            # Step 3: Check active PR
            r_pr = await client.get("http://127.0.0.1:8000/pr/current")
            if r_pr.status_code != 200 or not r_pr.json():
                return False, f"PR retrieval failed: {r_pr.status_code}"
            pr_data = r_pr.json()
            print(f"  [Run {iteration}] Step 3: Active PR #{pr_data.get('pr_number')} verified ({pr_data.get('patch_file')})")

            # Step 4: Merge PR (GitOps deploy)
            r_merge = await client.post("http://127.0.0.1:8000/pr/merge")
            if r_merge.status_code != 200 or not r_merge.json().get("success"):
                return False, f"PR merge failed: {r_merge.status_code} - {r_merge.text}"
            print(f"  [Run {iteration}] Step 4: PR Merged & Deployed ({r_merge.json().get('message')[:60]}...)")

            # Step 5: Reset topology
            r_reset = await client.post("http://127.0.0.1:8000/reset")
            if r_reset.status_code != 200:
                return False, f"Reset failed: {r_reset.status_code}"
            print(f"  [Run {iteration}] Step 5: Topology Reset Complete")

            dur = round(time.perf_counter() - t_start, 2)
            print(f">>> RUN {iteration} COMPLETED SUCCESSFULLY IN {dur}s <<<")
            return True, f"Success in {dur}s"

async def main():
    print("=" * 80)
    print("AUDIT CHECK 5: THREE CONSECUTIVE END-TO-END RUNS (BACK TO BACK)")
    print("=" * 80)
    results = []
    for i in range(1, 4):
        ok, msg = await run_single_flow(i)
        results.append((i, ok, msg))
        if not ok:
            print(f"RUN {i} FAILED: {msg}")
            break
        await asyncio.sleep(0.5)

    print("\n" + "=" * 80)
    print("THREE-RUN SUMMARY:")
    for i, ok, msg in results:
        status = "PASSED" if ok else "FAILED"
        print(f"  Run {i}: [{status}] - {msg}")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(main())
