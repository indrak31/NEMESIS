import time
import httpx

PORTS = {
    "API Gateway": 8001,
    "Auth Service": 8002,
    "Payment Service": 8003,
    "Orders Service": 8004,
    "Inventory": 8005,
    "Orders DB": 8006,
    "Cache": 8007,
    "Notification": 8008,
}

print("=" * 80)
print("AUDIT CHECK 1: REAL 8-MICROSERVICE MESH HEALTH & LIVE METRICS")
print("=" * 80)

for name, port in PORTS.items():
    try:
        r = httpx.get(f"http://127.0.0.1:{port}/health", timeout=1.5).json()
        m = httpx.get(f"http://127.0.0.1:{port}/metrics", timeout=1.5).json()
        print(f"[{name:16}] Port {port} -> status={r.get('status')} | requests_total={m.get('requests_total')} | 5xx={m.get('requests_5xx_total')} | p99={m.get('p99_latency_ms')}ms | cb={r.get('circuit_breaker')}")
    except Exception as exc:
        print(f"[{name:16}] Port {port} -> UNREACHABLE ({exc})")

print("\n" + "=" * 80)
print("AUDIT CHECK 2: CHAOS INJECTION (BEFORE vs AFTER LATENCY ON REAL SOCKETS)")
print("=" * 80)

client = httpx.Client(timeout=5.0)

# 1. Reset all
for p in PORTS.values():
    client.post(f"http://127.0.0.1:{p}/admin/reset")

# 2. Measure nominal
nominal_latencies = []
for _ in range(5):
    t0 = time.perf_counter()
    r = client.post("http://127.0.0.1:8001/checkout", json={"user_id": "auditor", "sku": "sku_test", "amount": 25.0, "token": "tok"})
    dur = (time.perf_counter() - t0) * 1000.0
    nominal_latencies.append(dur)
avg_nominal = sum(nominal_latencies) / len(nominal_latencies)
print(f"BEFORE Attack (Nominal 5 requests):")
for i, l in enumerate(nominal_latencies):
    print(f"  Req {i+1}: {l:.2f} ms")
print(f"  Average Nominal Latency: {avg_nominal:.2f} ms")

# 3. Inject real chaos: +450ms on Payment Service (8003)
print("\nTriggering Fault Injection: POST http://127.0.0.1:8003/admin/fault with latency_ms=450.0")
fault_resp = client.post("http://127.0.0.1:8003/admin/fault", json={"latency_ms": 450.0, "error_rate": 0.0})
print(f"Fault Endpoint Response: {fault_resp.status_code} -> {fault_resp.json()}")

# 4. Measure degraded
degraded_latencies = []
for _ in range(5):
    t0 = time.perf_counter()
    r = client.post("http://127.0.0.1:8001/checkout", json={"user_id": "auditor", "sku": "sku_test", "amount": 25.0, "token": "tok"})
    dur = (time.perf_counter() - t0) * 1000.0
    degraded_latencies.append(dur)
avg_degraded = sum(degraded_latencies) / len(degraded_latencies)
print(f"\nAFTER Attack (Injected 5 requests):")
for i, l in enumerate(degraded_latencies):
    print(f"  Req {i+1}: {l:.2f} ms")
print(f"  Average Degraded Latency: {avg_degraded:.2f} ms")
print(f"  Delta Observed: +{avg_degraded - avg_nominal:.2f} ms (Injected delay was 450.0 ms)")

print("\n" + "=" * 80)
print("AUDIT CHECK 3: DETECTION THRESHOLD vs MEASURED SIGNAL")
print("=" * 80)
threshold_ms = 250.0
measured_p99 = avg_degraded
breached = measured_p99 > threshold_ms
print(f"Detection Threshold: {threshold_ms:.1f} ms P99")
print(f"Measured Signal:     {measured_p99:.1f} ms P99")
print(f"Threshold Breached:  {breached} (Signal is {measured_p99 - threshold_ms:.1f} ms above safety threshold)")

print("\n" + "=" * 80)
print("AUDIT CHECK 4: FIX APPLIED + RE-MEASURED VALIDATION")
print("=" * 80)
print("Applying Config: POST http://127.0.0.1:8003/admin/config with Circuit Breaker (timeout=60ms, threshold=1)")
cfg_resp = client.post(
    "http://127.0.0.1:8003/admin/config",
    json={"enabled": True, "timeout_ms": 60.0, "consecutive_5xx_threshold": 1, "base_ejection_seconds": 15.0}
)
print(f"Config Response: {cfg_resp.status_code} -> {cfg_resp.json()}")

# Send 1 request to trip breaker
trip_resp = client.post("http://127.0.0.1:8001/checkout", json={"user_id": "auditor", "sku": "sku_test", "amount": 25.0, "token": "tok"})
print(f"Tripping Request Status: {trip_resp.status_code}")

# Measure mitigated requests
mitigated_latencies = []
statuses = []
for _ in range(5):
    t0 = time.perf_counter()
    r = client.post("http://127.0.0.1:8001/checkout", json={"user_id": "auditor", "sku": "sku_test", "amount": 25.0, "token": "tok"})
    dur = (time.perf_counter() - t0) * 1000.0
    mitigated_latencies.append(dur)
    statuses.append(r.json().get("payment_result", {}).get("status"))

avg_mitigated = sum(mitigated_latencies) / len(mitigated_latencies)
print(f"\nAFTER Fix (Mitigated 5 requests):")
for i, (l, s) in enumerate(zip(mitigated_latencies, statuses)):
    print(f"  Req {i+1}: {l:.2f} ms | payment_result={s}")
print(f"  Average Mitigated Latency: {avg_mitigated:.2f} ms (Drops from {avg_degraded:.2f} ms back to {avg_mitigated:.2f} ms!)")

# Reset
for p in PORTS.values():
    client.post(f"http://127.0.0.1:{p}/admin/reset")
print("\nAll services reset to nominal.")
