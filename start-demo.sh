#!/usr/bin/env bash
# ==============================================================================
# NEMESIS: Single-Command Linux/Kind Demo Startup & Verification Script
# ==============================================================================

set -e

echo "================================================================="
echo "  NEMESIS // Autonomous Cloud Resilience Engine (Tier 1 Launch)  "
echo "================================================================="

# 1. Start Backend Orchestrator (which boots all 8 real microservices in lifespan)
echo "[1/3] Launching FastAPI Orchestrator on port 8000..."
python -m uvicorn app.main:app --port 8000 &
BACKEND_PID=$!

sleep 3

# 2. Verify Health of all 8 Microservices
echo "[2/3] Verifying 8-service real microservices mesh (ports 8001-8008)..."
declare -A SERVICES=(
    ["API Gateway"]="8001"
    ["Auth Service"]="8002"
    ["Payment Service"]="8003"
    ["Orders Service"]="8004"
    ["Inventory"]="8005"
    ["Orders DB"]="8006"
    ["Cache"]="8007"
    ["Notification"]="8008"
)

for name in "${!SERVICES[@]}"; do
    port="${SERVICES[$name]}"
    if curl -s -f "http://127.0.0.1:${port}/health" > /dev/null; then
        echo "  -> $name on port $port: HEALTHY"
    else
        echo "  -> $name on port $port: FAILED"
    fi
done

# 3. Start Frontend
echo "[3/3] Launching React Operations Center on port 5173..."
cd frontend
npm start &
FRONTEND_PID=$!
cd ..

echo "================================================================="
echo "  NEMESIS IS LIVE AND READY FOR DEMO PRESENTATION!               "
echo "================================================================="
echo "Dashboard URL:          http://localhost:5173"
echo "Backend API:            http://localhost:8000/docs"
echo "Cluster Health:         http://localhost:8000/cluster/health"
echo "API Gateway (Real):     http://localhost:8001/checkout"
echo "Payment Metrics (Real): http://localhost:8003/metrics"
echo ""
echo "Press Ctrl+C to terminate all services."
wait
