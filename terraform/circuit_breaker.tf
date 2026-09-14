# Nemesis Remediation: Circuit Breaker & Bulkhead
# Target: Payment Service -> Orders Service
resource "envoy_cluster_circuit_breakers" "payment_to_orders" {
  cluster_name = "orders_service"
  thresholds {
    priority                     = "DEFAULT"
    max_connections              = 100
    max_pending_requests         = 20
    max_requests                 = 500
    max_retries                  = 2
    track_remaining_concurrency  = true
  }
}

resource "envoy_outlier_detection" "orders_outlier" {
  cluster_name               = "orders_service"
  consecutive_5xx            = 3
  interval_ms                = 5000
  base_ejection_time_ms      = 15000
  max_ejection_percent       = 50
}
