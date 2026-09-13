/**
 * Authentic Terraform resilience configurations paired by Nemesis AI Defender
 * to mitigate cascading microservice failure vectors.
 */

export const TERRAFORM_PATCHES = {
  "circuit_breaker.tf": {
    filename: "circuit_breaker.tf",
    title: "Envoy Outlier Detection & Bulkhead Circuit Breaker",
    target: "Payment Service → Orders Service",
    pattern: "Fail-Fast Circuit Breaker & Concurrency Limiting",
    description:
      "Prevents cascading thread pool exhaustion by capping pending HTTP requests, ejecting consecutive 5xx hosts, and falling back to a cached bulkhead response.",
    code: `# Nemesis Automated Remediation: Circuit Breaker & Fallback Bulkhead
# Target Edge: Payment Service -> Orders Service

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
`,
  },

  "rate_limiter.tf": {
    filename: "rate_limiter.tf",
    title: "AWS WAFv2 Token-Bucket Adaptive Rate Limiter",
    target: "API Gateway → Auth Service",
    pattern: "Per-IP Burst Throttling & Redis Token Caching",
    description:
      "Blocks cryptographic CPU exhaustion on Auth Service by enforcing a 500 req/sec IP limit at the API Gateway layer and caching validated public keys in Redis.",
    code: `# Nemesis Automated Remediation: Adaptive Token Bucket Rate Limiting
# Target Edge: API Gateway -> Auth Service

resource "aws_wafv2_web_acl" "auth_flood_protection" {
  name        = "auth-rate-limit-rule"
  scope       = "REGIONAL"
  description = "Throttles burst requests to Auth Service during token flood attacks"

  default_action {
    allow {}
  }

  rule {
    name     = "AuthRateLimit"
    priority = 1
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 500
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AuthRateLimitMetric"
      sampled_requests_enabled   = true
    }
  }
}
`,
  },

  "db_connection_pool.tf": {
    filename: "db_connection_pool.tf",
    title: "AWS RDS Proxy (PgBouncer) & Read Replica Routing",
    target: "Orders Service → Orders DB",
    pattern: "Connection Multiplexing & Read-Write Splitting",
    description:
      "Resolves PostgreSQL connection exhaustion by multiplexing client connections through RDS Proxy and offloading read queries to dedicated read replicas.",
    code: `# Nemesis Automated Remediation: PgBouncer Connection Pool & Read Replica
# Target Edge: Orders Service -> Orders DB

resource "aws_db_proxy" "orders_db_proxy" {
  name                   = "orders-db-pgbouncer"
  engine_family          = "POSTGRESQL"
  role_arn               = aws_iam_role.db_proxy_role.arn
  vpc_subnet_ids         = var.private_subnets
  require_tls            = true
  idle_client_timeout    = 1800
  max_connections_percent = 85
}

resource "aws_db_proxy_target_group" "orders_read_replica" {
  db_proxy_name = aws_db_proxy.orders_db_proxy.name
  target_group_name = "default"
  connection_pool_config {
    max_connections_percent      = 90
    max_idle_connections_percent = 40
    connection_borrow_timeout    = 30
  }
}
`,
  },

  "async_inventory_queue.tf": {
    filename: "async_inventory_queue.tf",
    title: "AWS SQS FIFO Queue & Asynchronous Decoupling",
    target: "Orders Service → Inventory",
    pattern: "Deadlock-Free Eventual Consistency",
    description:
      "Decouples synchronous inventory stock reservations into an ordered SQS FIFO queue with dead-letter queue retries, eliminating lock contention deadlocks.",
    code: `# Nemesis Automated Remediation: SQS FIFO Decoupled Queue
# Target Edge: Orders Service -> Inventory

resource "aws_sqs_queue" "inventory_reservation_queue" {
  name                        = "inventory-reservations.fifo"
  fifo_queue                  = true
  content_based_deduplication = true
  visibility_timeout_seconds  = 30
  message_retention_seconds   = 86400
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.inventory_dlq.arn
    maxReceiveCount     = 3
  })
}
`,
  },
};
