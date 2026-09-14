import React, { useState, useEffect } from "react";
import { Activity, AlertTriangle, ShieldCheck, Zap, Clock, CheckCircle2 } from "lucide-react";

export default function TelemetryBar({
  phase = "normal", // "normal" | "attack" | "cascade" | "patching" | "contained" | "deployed"
  blastRadius = 0,
  latency = 45,
  errorRate = 0.0,
}) {
  const [latencyHistory, setLatencyHistory] = useState([42, 45, 41, 44, 43, 46, 42, 45]);

  useEffect(() => {
    setLatencyHistory((prev) => {
      const next = [...prev.slice(-19), latency];
      return next;
    });
  }, [latency]);

  const getPhaseMeta = () => {
    switch (phase) {
      case "attack":
        return {
          step: 2,
          totalSteps: 6,
          label: "FAILURE INJECTED",
          colorClass: "phase-alert",
          icon: <AlertTriangle size={14} className="text-red animate-pulse" />,
        };
      case "cascade":
        return {
          step: 3,
          totalSteps: 6,
          label: "BLAST RADIUS SPREADING",
          colorClass: "phase-danger",
          icon: <Zap size={14} className="text-red animate-pulse" />,
        };
      case "patching":
        return {
          step: 4,
          totalSteps: 6,
          label: "DEFENDER PATCHING (.TF)",
          colorClass: "phase-patching",
          icon: <Activity size={14} className="text-amber animate-spin" />,
        };
      case "contained":
        return {
          step: 5,
          totalSteps: 6,
          label: "CONTAINED AT BOUNDARY",
          colorClass: "phase-contained",
          icon: <ShieldCheck size={14} className="text-cyan" />,
        };
      case "deployed":
        return {
          step: 6,
          totalSteps: 6,
          label: "DEPLOYED IN PRODUCTION",
          colorClass: "phase-deployed",
          icon: <CheckCircle2 size={14} className="text-green" />,
        };
      case "normal":
      default:
        return {
          step: 1,
          totalSteps: 6,
          label: "NORMAL OPERATIONS",
          colorClass: "phase-normal",
          icon: <Activity size={14} className="text-gray" />,
        };
    }
  };

  const phaseMeta = getPhaseMeta();

  // Generate sparkline SVG points (width: 100, height: 28)
  const maxVal = Math.max(...latencyHistory, 100);
  const minVal = Math.min(...latencyHistory, 20);
  const range = maxVal - minVal || 1;
  const points = latencyHistory
    .map((val, idx) => {
      const x = (idx / (latencyHistory.length - 1 || 1)) * 96 + 2;
      const y = 26 - ((val - minVal) / range) * 22;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="telemetry-bar">
      {/* 1. Incident Phase Stepper */}
      <div className="telemetry-col telemetry-phase">
        <span className="telemetry-label">INCIDENT LIFECYCLE</span>
        <div className={`telemetry-phase-badge ${phaseMeta.colorClass}`}>
          {phaseMeta.icon}
          <span>{phaseMeta.label}</span>
          <span className="phase-step-num">
            STAGE {phaseMeta.step}/{phaseMeta.totalSteps}
          </span>
        </div>
      </div>

      {/* 2. P99 Latency Gauge with Live Sparkline */}
      <div className="telemetry-col telemetry-latency-col">
        <div className="telemetry-label-row">
          <Clock size={12} className="text-muted" />
          <span className="telemetry-label">P99 LATENCY WAVEFORM</span>
        </div>
        <div className="telemetry-sparkline-row">
          <div className="telemetry-value-wrap">
            <span
              className={`telemetry-value ${
                latency > 200 ? "val-danger" : latency > 80 ? "val-warn" : "val-normal"
              }`}
            >
              {latency}ms
            </span>
            <span className="telemetry-sub">
              {latency > 200 ? "▲ +475ms spike" : latency > 80 ? "▼ stabilizing" : "nominal"}
            </span>
          </div>

          {/* Real-time SVG sparkline */}
          <div className="sparkline-wrapper">
            <svg viewBox="0 0 100 28" className="sparkline-svg">
              <polyline
                fill="none"
                stroke={latency > 200 ? "#ef4444" : latency > 80 ? "#f59e0b" : "#06b6d4"}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points}
              />
            </svg>
          </div>
        </div>
      </div>

      {/* 3. 5xx Error Rate */}
      <div className="telemetry-col">
        <div className="telemetry-label-row">
          <AlertTriangle size={12} className="text-muted" />
          <span className="telemetry-label">5XX ERROR RATE</span>
        </div>
        <div className="telemetry-value-row">
          <span
            className={`telemetry-value ${
              errorRate > 10 ? "val-danger" : errorRate > 0 ? "val-warn" : "val-normal"
            }`}
          >
            {errorRate.toFixed(1)}%
          </span>
          <span className="telemetry-sub">
            {errorRate > 0 ? "failing upstream" : "0 dropped"}
          </span>
        </div>
      </div>

      {/* 4. Blast Radius (Impacted Microservices) */}
      <div className="telemetry-col">
        <div className="telemetry-label-row">
          <Zap size={12} className="text-muted" />
          <span className="telemetry-label">ACTIVE BLAST RADIUS</span>
        </div>
        <div className="telemetry-value-row">
          <span
            className={`telemetry-value ${
              blastRadius > 0 ? "val-danger" : "val-normal"
            }`}
          >
            {blastRadius > 0 ? `${blastRadius} / 8 Services` : "0 / 8 (Contained)"}
          </span>
          <span className="telemetry-sub">
            {blastRadius > 0 ? "cascading" : "healthy baseline"}
          </span>
        </div>
      </div>
    </div>
  );
}
