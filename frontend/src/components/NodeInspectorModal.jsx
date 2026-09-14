import React, { useState } from "react";
import {
  Server,
  Activity,
  Flame,
  X,
  AlertTriangle,
  Cpu,
  Database,
  ArrowRight,
  ShieldCheck,
  CheckCircle2
} from "lucide-react";

export default function NodeInspectorModal({
  nodeId,
  isOpen,
  onClose,
  nodeState = "healthy",
  onInjectFault,
  backendUrl = "http://localhost:8000",
  useMockStream = false,
}) {
  const [faultType, setFaultType] = useState("latency_spike");
  const [severity, setSeverity] = useState("high");
  const [latencyMs, setLatencyMs] = useState(450);
  const [errorRateMultiplier, setErrorRateMultiplier] = useState(25.0);
  const [isInjecting, setIsInjecting] = useState(false);
  const [injectSuccess, setInjectSuccess] = useState(false);

  if (!isOpen || !nodeId) return null;

  const handleTriggerFault = async (e) => {
    e.preventDefault();
    setIsInjecting(true);
    setInjectSuccess(false);

    try {
      if (useMockStream) {
        await new Promise((res) => setTimeout(res, 600));
        setInjectSuccess(true);
        if (onInjectFault) {
          onInjectFault({
            target_node: nodeId,
            fault_type: faultType,
            severity,
            latency_ms: Number(latencyMs),
            error_rate_multiplier: Number(errorRateMultiplier),
          });
        }
      } else {
        const res = await fetch(`${backendUrl}/inject-fault`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_node: nodeId,
            fault_type: faultType,
            severity,
            latency_ms: Number(latencyMs),
            error_rate_multiplier: Number(errorRateMultiplier),
          }),
        });
        if (res.ok) {
          setInjectSuccess(true);
          if (onInjectFault) {
            onInjectFault({
              target_node: nodeId,
              fault_type: faultType,
              severity,
            });
          }
        }
      }
    } catch (err) {
      console.error("Fault injection error:", err);
    } finally {
      setIsInjecting(false);
      setTimeout(() => setInjectSuccess(false), 3000);
    }
  };

  // Node telemetry mock readings based on state
  const isHealthy = nodeState === "healthy";
  const isAttacked = nodeState === "attacked";
  const isProtected = nodeState === "protected";
  const isDeployed = nodeState === "deployed";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-window node-inspector-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <div className="node-inspector-badge">
              <Server size={16} className="text-cyan" />
              <span>NODE TELEMETRY & CHAOS CONTROLLER</span>
            </div>
            <h3 className="modal-title">{nodeId}</h3>
            <div className="node-state-indicator-row">
              <span
                className={`node-status-badge ${
                  isAttacked
                    ? "status-attacked"
                    : isProtected
                    ? "status-protected"
                    : isDeployed
                    ? "status-deployed"
                    : "status-healthy"
                }`}
              >
                {nodeState.toUpperCase()}
              </span>
              <span className="node-port-tag">PORT 8080</span>
              <span className="node-cluster-tag">AWS EKS // us-east-1a</span>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close Inspector">
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {/* Live Microservice Diagnostic Gauges */}
          <div className="node-metrics-grid">
            <div className="node-metric-card">
              <div className="node-metric-label">
                <Activity size={13} className="text-muted" />
                <span>P99 Latency</span>
              </div>
              <div className={`node-metric-val ${isAttacked ? "val-danger" : "val-normal"}`}>
                {isAttacked ? `${latencyMs}ms` : isProtected ? "48ms" : "38ms"}
              </div>
              <span className="node-metric-sub">{isAttacked ? "Degraded" : "Nominal"}</span>
            </div>

            <div className="node-metric-card">
              <div className="node-metric-label">
                <AlertTriangle size={13} className="text-muted" />
                <span>5xx Error Rate</span>
              </div>
              <div className={`node-metric-val ${isAttacked ? "val-danger" : "val-normal"}`}>
                {isAttacked ? `${errorRateMultiplier.toFixed(1)}%` : "0.0%"}
              </div>
              <span className="node-metric-sub">{isAttacked ? "Dropping upstream" : "Zero errors"}</span>
            </div>

            <div className="node-metric-card">
              <div className="node-metric-label">
                <Cpu size={13} className="text-muted" />
                <span>Thread Utilization</span>
              </div>
              <div className={`node-metric-val ${isAttacked ? "val-warn" : "val-normal"}`}>
                {isAttacked ? "94.2%" : "22.8%"}
              </div>
              <span className="node-metric-sub">Pool size: 128 threads</span>
            </div>

            <div className="node-metric-card">
              <div className="node-metric-label">
                <Database size={13} className="text-muted" />
                <span>Connection Pool</span>
              </div>
              <div className={`node-metric-val ${isAttacked ? "val-danger" : "val-normal"}`}>
                {isAttacked ? "118 / 120" : "14 / 120"}
              </div>
              <span className="node-metric-sub">{isAttacked ? "Exhaustion risk" : "Healthy headroom"}</span>
            </div>
          </div>

          {/* Ad-hoc Chaos Fault Injection Section */}
          <div className="chaos-injection-panel">
            <div className="chaos-panel-header">
              <Flame size={16} className="text-red" />
              <h4>Inject Ad-Hoc Chaos Experiment</h4>
            </div>
            <p className="chaos-panel-desc">
              Test NEMESIS's autonomous detection and zero-touch self-healing loop by injecting an arbitrary failure condition directly into <strong>{nodeId}</strong>.
            </p>

            <form className="chaos-form" onSubmit={handleTriggerFault}>
              <div className="chaos-form-row">
                <div className="form-group flex-1">
                  <label>Failure Type</label>
                  <select
                    className="select-input"
                    value={faultType}
                    onChange={(e) => setFaultType(e.target.value)}
                  >
                    <option value="latency_spike">Downstream Latency Spike</option>
                    <option value="token_flood">Token / Auth Request Flood</option>
                    <option value="connection_exhaustion">DB Connection Pool Exhaustion</option>
                    <option value="deadlock">Worker Thread Pool Deadlock</option>
                    <option value="crash">Pod CrashLoopBackOff</option>
                  </select>
                </div>

                <div className="form-group flex-1">
                  <label>Severity Level</label>
                  <select
                    className="select-input"
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                  >
                    <option value="low">Low (10% degradation)</option>
                    <option value="medium">Medium (40% degradation)</option>
                    <option value="high">High (80% degradation)</option>
                    <option value="critical">Critical (Total cascade)</option>
                  </select>
                </div>
              </div>

              <div className="chaos-form-row">
                <div className="form-group flex-1">
                  <label>Latency Penalty: {latencyMs}ms</label>
                  <input
                    type="range"
                    min="100"
                    max="2000"
                    step="50"
                    value={latencyMs}
                    onChange={(e) => setLatencyMs(e.target.value)}
                    className="range-slider"
                  />
                </div>

                <div className="form-group flex-1">
                  <label>5xx Error Multiplier: {errorRateMultiplier}%</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={errorRateMultiplier}
                    onChange={(e) => setErrorRateMultiplier(e.target.value)}
                    className="range-slider"
                  />
                </div>
              </div>

              <div className="chaos-submit-row">
                {injectSuccess && (
                  <div className="inject-success-badge">
                    <CheckCircle2 size={14} className="text-green" />
                    <span>Fault injected! Watching NEMESIS autonomous response...</span>
                  </div>
                )}
                <button
                  type="submit"
                  className="btn-inject-fault"
                  disabled={isInjecting}
                >
                  <Flame size={15} />
                  <span>{isInjecting ? "Injecting Fault..." : `Inject Fault on ${nodeId}`}</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <div className="modal-footer-left">
            <span className="text-muted text-xs font-mono">
              Autonomous self-healing trigger will activate if anomaly crosses p99 &gt; 120ms or 5xx &gt; 5%.
            </span>
          </div>
          <button className="btn-secondary" onClick={onClose}>
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}
