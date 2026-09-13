/**
 * Static fallback topology, scenario metadata, and multi-scenario mock event sequences
 * for standalone frontend demo and testing.
 */

export const FALLBACK_GRAPH = {
  nodes: [
    { id: "API Gateway", criticality: "high" },
    { id: "Auth Service", criticality: "medium" },
    { id: "Payment Service", criticality: "high" },
    { id: "Orders Service", criticality: "high" },
    { id: "Inventory", criticality: "medium" },
    { id: "Orders DB", criticality: "high" },
    { id: "Cache", criticality: "low" },
    { id: "Notification", criticality: "low" },
  ],
  edges: [
    ["API Gateway", "Auth Service"],
    ["API Gateway", "Payment Service"],
    ["Payment Service", "Orders Service"],
    ["Orders Service", "Orders DB"],
    ["Orders Service", "Inventory"],
    ["Orders Service", "Cache"],
    ["API Gateway", "Notification"],
  ],
};

export const SCENARIO_OPTIONS = [
  {
    id: "payment_latency_spike",
    title: "Payment Latency Spike",
    target: "Payment Service",
    cascadePath: "Orders Service → Orders DB",
    severity: "9.2",
    fixFile: "circuit_breaker.tf",
  },
  {
    id: "auth_token_flood",
    title: "Auth Token Flood",
    target: "Auth Service",
    cascadePath: "API Gateway",
    severity: "7.5",
    fixFile: "rate_limiter.tf",
  },
  {
    id: "orders_db_exhaustion",
    title: "Orders DB Exhaustion",
    target: "Orders DB",
    cascadePath: "Orders Service → Inventory → Payment Service",
    severity: "9.5",
    fixFile: "db_connection_pool.tf",
  },
  {
    id: "inventory_sync_deadlock",
    title: "Inventory Sync Deadlock",
    target: "Inventory",
    cascadePath: "Orders Service → Cache",
    severity: "6.8",
    fixFile: "async_inventory_queue.tf",
  },
];

export const MOCK_SCENARIO_SEQUENCES = {
  // Scenario 1: Payment Latency Spike
  payment_latency_spike: [
    {
      type: "attack_start",
      timestamp: "11:05:06",
      service: "Payment Service",
      message: "Attacker: injecting failure vector (Payment Gateway Latency Spike)",
      detail: "Target: Payment Service | Severity: 9.2/10",
      graph_delta: { node: "Payment Service", state: "attacked" },
      delay: 900,
    },
    {
      type: "cascade",
      timestamp: "11:05:07",
      service: "Orders Service",
      message: "Cascade: failure propagated from Payment Service to Orders Service",
      detail: "Cascade path: Payment Service -> Orders Service",
      graph_delta: { node: "Orders Service", state: "attacked" },
      delay: 1000,
    },
    {
      type: "cascade",
      timestamp: "11:05:08",
      service: "Orders DB",
      message: "Cascade: failure propagated from Orders Service to Orders DB",
      detail: "Cascade path: Orders Service -> Orders DB",
      graph_delta: { node: "Orders DB", state: "attacked" },
      delay: 1000,
    },
    {
      type: "defender_fix",
      timestamp: "11:05:09",
      service: "Payment Service",
      message: "Defender: proposing remediation (Deploy resilience circuit breaker and fallback bulkhead)",
      detail: "circuit_breaker.tf applied to Payment Service",
      graph_delta: { node: "Payment Service", state: "patching" },
      delay: 1200,
    },
    {
      type: "simulation_result",
      timestamp: "11:05:10",
      service: "Payment Service",
      message: "Defender: simulated validation passed — cascade contained at Payment Service",
      detail: "Cascade contained. Protected edge [Payment Service -> Orders Service] blocked propagation.",
      graph_delta: { node: "Payment Service", state: "protected" },
      delay: 1100,
    },
    {
      type: "pr_opened",
      timestamp: "11:05:11",
      service: "Payment Service",
      message: "Defender: remediation PR opened (#142 fix/payment-service-circuit_breaker)",
      detail: "#142 fix/payment-service-circuit_breaker",
      pr_url: "https://github.com/craftverse/nemesis-infra/pull/142",
      graph_delta: null,
      delay: 600,
    },
  ],

  // Scenario 2: Auth Token Flood (Demonstrates Auth Service and API Gateway moving!)
  auth_token_flood: [
    {
      type: "attack_start",
      timestamp: "11:08:12",
      service: "Auth Service",
      message: "Attacker: injecting failure vector (Auth Token Verification Flood)",
      detail: "Target: Auth Service | Severity: 7.5/10",
      graph_delta: { node: "Auth Service", state: "attacked" },
      delay: 900,
    },
    {
      type: "cascade",
      timestamp: "11:08:13",
      service: "API Gateway",
      message: "Cascade: cryptographic CPU exhaustion backpressure starved API Gateway",
      detail: "Cascade path: Auth Service -> API Gateway",
      graph_delta: { node: "API Gateway", state: "attacked" },
      delay: 1000,
    },
    {
      type: "defender_fix",
      timestamp: "11:08:14",
      service: "API Gateway",
      message: "Defender: proposing remediation (Deploy token-bucket rate limiter and Redis cache)",
      detail: "rate_limiter.tf applied to API Gateway -> Auth Service",
      graph_delta: { node: "API Gateway", state: "patching" },
      delay: 1200,
    },
    {
      type: "simulation_result",
      timestamp: "11:08:15",
      service: "API Gateway",
      message: "Defender: simulated validation passed — Auth flood contained at API Gateway",
      detail: "Cascade contained. Protected edge [API Gateway -> Auth Service] throttled flood.",
      graph_delta: { node: "API Gateway", state: "protected" },
      delay: 1100,
    },
    {
      type: "pr_opened",
      timestamp: "11:08:16",
      service: "API Gateway",
      message: "Defender: remediation PR opened (#143 fix/api-gateway-rate-limiter)",
      detail: "#143 fix/api-gateway-rate-limiter",
      pr_url: "https://github.com/craftverse/nemesis-infra/pull/143",
      graph_delta: null,
      delay: 600,
    },
  ],

  // Scenario 3: Orders DB Connection Exhaustion
  orders_db_exhaustion: [
    {
      type: "attack_start",
      timestamp: "11:12:01",
      service: "Orders DB",
      message: "Attacker: injecting unindexed slow query storm exhausting PostgreSQL connections",
      detail: "Target: Orders DB | Severity: 9.5/10",
      graph_delta: { node: "Orders DB", state: "attacked" },
      delay: 900,
    },
    {
      type: "cascade",
      timestamp: "11:12:02",
      service: "Orders Service",
      message: "Cascade: pool starvation propagated upstream to Orders Service",
      detail: "Cascade path: Orders DB -> Orders Service",
      graph_delta: { node: "Orders Service", state: "attacked" },
      delay: 900,
    },
    {
      type: "cascade",
      timestamp: "11:12:03",
      service: "Inventory",
      message: "Cascade: sync lock wait timeout propagated to Inventory",
      detail: "Cascade path: Orders Service -> Inventory",
      graph_delta: { node: "Inventory", state: "attacked" },
      delay: 900,
    },
    {
      type: "cascade",
      timestamp: "11:12:04",
      service: "Payment Service",
      message: "Cascade: checkout confirmation timeouts propagated to Payment Service",
      detail: "Cascade path: Orders Service -> Payment Service",
      graph_delta: { node: "Payment Service", state: "attacked" },
      delay: 900,
    },
    {
      type: "defender_fix",
      timestamp: "11:12:05",
      service: "Orders DB",
      message: "Defender: proposing remediation (Deploy PgBouncer connection pooling and read replicas)",
      detail: "db_connection_pool.tf applied to Orders Service -> Orders DB",
      graph_delta: { node: "Orders DB", state: "patching" },
      delay: 1200,
    },
    {
      type: "simulation_result",
      timestamp: "11:12:06",
      service: "Orders DB",
      message: "Defender: simulated validation passed — DB pool connection limits contained",
      detail: "Cascade contained. Protected edge [Orders Service -> Orders DB] stabilized.",
      graph_delta: { node: "Orders DB", state: "protected" },
      delay: 1100,
    },
    {
      type: "pr_opened",
      timestamp: "11:12:07",
      service: "Orders DB",
      message: "Defender: remediation PR opened (#144 fix/orders-db-connection-pool)",
      detail: "#144 fix/orders-db-connection-pool",
      pr_url: "https://github.com/craftverse/nemesis-infra/pull/144",
      graph_delta: null,
      delay: 600,
    },
  ],

  // Scenario 4: Inventory Sync Deadlock
  inventory_sync_deadlock: [
    {
      type: "attack_start",
      timestamp: "11:16:30",
      service: "Inventory",
      message: "Attacker: injecting concurrent stock lock contention in Inventory",
      detail: "Target: Inventory | Severity: 6.8/10",
      graph_delta: { node: "Inventory", state: "attacked" },
      delay: 900,
    },
    {
      type: "cascade",
      timestamp: "11:16:31",
      service: "Orders Service",
      message: "Cascade: reservation timeout failure propagated to Orders Service",
      detail: "Cascade path: Inventory -> Orders Service",
      graph_delta: { node: "Orders Service", state: "attacked" },
      delay: 1000,
    },
    {
      type: "cascade",
      timestamp: "11:16:32",
      service: "Cache",
      message: "Cascade: inventory cache eviction storm propagated to Cache",
      detail: "Cascade path: Orders Service -> Cache",
      graph_delta: { node: "Cache", state: "attacked" },
      delay: 1000,
    },
    {
      type: "defender_fix",
      timestamp: "11:16:33",
      service: "Inventory",
      message: "Defender: proposing remediation (Decouple updates with asynchronous FIFO queue)",
      detail: "async_inventory_queue.tf applied to Orders Service -> Inventory",
      graph_delta: { node: "Inventory", state: "patching" },
      delay: 1200,
    },
    {
      type: "simulation_result",
      timestamp: "11:16:34",
      service: "Inventory",
      message: "Defender: simulated validation passed — Inventory lock queue contained",
      detail: "Cascade contained. Protected edge [Orders Service -> Inventory] queued asynchronously.",
      graph_delta: { node: "Inventory", state: "protected" },
      delay: 1100,
    },
    {
      type: "pr_opened",
      timestamp: "11:16:35",
      service: "Inventory",
      message: "Defender: remediation PR opened (#145 fix/async-inventory-fifo-queue)",
      detail: "#145 fix/async-inventory-fifo-queue",
      pr_url: "https://github.com/craftverse/nemesis-infra/pull/145",
      graph_delta: null,
      delay: 600,
    },
  ],
};

/**
 * Runs the mock event stream sequence for a specific scenario using a setTimeout ladder.
 * @param {string} scenarioId Name of the scenario
 * @param {Function} onEvent Callback invoked with each Event object
 * @param {Function} onComplete Callback invoked when sequence completes
 * @returns {Function} Cancel function to clear pending timeouts
 */
export function startMockEventStream(scenarioId = "payment_latency_spike", onEvent, onComplete) {
  const sequence = MOCK_SCENARIO_SEQUENCES[scenarioId] || MOCK_SCENARIO_SEQUENCES.payment_latency_spike;
  const timers = [];
  let accumulatedDelay = 400;

  sequence.forEach((item, index) => {
    accumulatedDelay += item.delay;
    const timer = setTimeout(() => {
      const { delay, ...eventData } = item;
      const now = new Date();
      const ts = now.toTimeString().split(" ")[0];
      const event = { ...eventData, timestamp: ts };

      onEvent(event);

      if (index === sequence.length - 1 && onComplete) {
        onComplete();
      }
    }, accumulatedDelay);

    timers.push(timer);
  });

  return () => {
    timers.forEach((t) => clearTimeout(t));
  };
}
