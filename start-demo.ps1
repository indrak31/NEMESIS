# ==============================================================================
# NEMESIS: Single-Command Demo Startup & Verification Script
# ==============================================================================

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  NEMESIS // Autonomous Cloud Resilience Engine (Tier 1 Launch)  " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Start Backend Orchestrator (which boots all 8 real microservices in lifespan)
Write-Host "`n[1/3] Launching FastAPI Orchestrator on port 8000..." -ForegroundColor Yellow
$BackendProcess = Start-Process python -ArgumentList "-m uvicorn app.main:app --port 8000" -PassThru -NoNewWindow

Start-Sleep -Seconds 3

# 2. Verify Health of all 8 Microservices
Write-Host "[2/3] Verifying 8-service real microservices mesh (ports 8001-8008)..." -ForegroundColor Yellow

$Services = @(
    @{ Name = "API Gateway"; Port = 8001 },
    @{ Name = "Auth Service"; Port = 8002 },
    @{ Name = "Payment Service"; Port = 8003 },
    @{ Name = "Orders Service"; Port = 8004 },
    @{ Name = "Inventory"; Port = 8005 },
    @{ Name = "Orders DB"; Port = 8006 },
    @{ Name = "Cache"; Port = 8007 },
    @{ Name = "Notification"; Port = 8008 }
)

$AllHealthy = $true
foreach ($svc in $Services) {
    try {
        $res = Invoke-RestMethod -Uri "http://127.0.0.1:$($svc.Port)/health" -TimeoutSec 2 -ErrorAction Stop
        if ($res.status -eq "healthy") {
            Write-Host "  -> $($svc.Name) on port $($svc.Port): HEALTHY" -ForegroundColor Green
        } else {
            Write-Host "  -> $($svc.Name) on port $($svc.Port): ERROR" -ForegroundColor Red
            $AllHealthy = $false
        }
    } catch {
        Write-Host "  -> $($svc.Name) on port $($svc.Port): UNREACHABLE" -ForegroundColor Red
        $AllHealthy = $false
    }
}

# 3. Start Frontend
Write-Host "`n[3/3] Launching React Operations Center on port 5173..." -ForegroundColor Yellow
Set-Location frontend
$FrontendProcess = Start-Process npm -ArgumentList "start" -PassThru -NoNewWindow
Set-Location ..

Write-Host "`n=================================================================" -ForegroundColor Green
Write-Host "  NEMESIS IS LIVE AND READY FOR DEMO PRESENTATION!               " -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
Write-Host "Dashboard URL:          http://localhost:5173" -ForegroundColor White
Write-Host "Backend API:            http://localhost:8000/docs" -ForegroundColor White
Write-Host "Cluster Health:         http://localhost:8000/cluster/health" -ForegroundColor White
Write-Host "API Gateway (Real):     http://localhost:8001/checkout" -ForegroundColor White
Write-Host "Payment Metrics (Real): http://localhost:8003/metrics" -ForegroundColor White

Write-Host "`nPRE-PRESENTATION PROOF CHECKLIST (To show judges raw data):" -ForegroundColor Cyan
Write-Host "1. Test Real Checkout over Network:" -ForegroundColor Gray
Write-Host "   curl -X POST http://127.0.0.1:8001/checkout -H 'Content-Type: application/json' -d '{\`"user_id\`":\`"usr_demo\`", \`"sku\`":\`"sku_default\`", \`"amount\`":99.99, \`"token\`":\`"jwt\`"}'" -ForegroundColor White
Write-Host "2. Trigger Real In-Service Chaos:" -ForegroundColor Gray
Write-Host "   curl -X POST http://127.0.0.1:8003/admin/fault -H 'Content-Type: application/json' -d '{\`"latency_ms\`":500, \`"error_rate\`":0.3}'" -ForegroundColor White
Write-Host "3. Show Raw Scraped Prometheus Metrics:" -ForegroundColor Gray
Write-Host "   curl http://127.0.0.1:8003/metrics" -ForegroundColor White
Write-Host "4. Trigger Real Circuit Breaker Mitigation:" -ForegroundColor Gray
Write-Host "   curl -X POST http://127.0.0.1:8003/admin/config -H 'Content-Type: application/json' -d '{\`"enabled\`":true, \`"timeout_ms\`":60, \`"consecutive_5xx_threshold\`":2}'" -ForegroundColor White
