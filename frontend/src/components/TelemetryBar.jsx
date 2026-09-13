import React from "react";
import { Activity, AlertTriangle, ShieldCheck, Zap, Clock } from "lucide-react";

export default function TelemetryBar({
  phase = "normal", // "normal" | "attack" | "cascade" | "patching" | "contained"
  blastRadius = 0,
  latency = 45,
  errorRate = 0.0,
}) {
  const getPhaseMeta = () => {
    switch (phase) {
      case "attack":
        return {
          step: 2,
          label: "FAILURE INJECTED",
          colorClass: "phase-alert",
          icon: <AlertTriangle size={14} className="text-red animate-pulse" />,
        };
      case "cascade":
        return {
          step: 3,
          label: "BLAST RADIUS SPREADING",
          colorClass: "phase-danger",
          icon: <Zap size={14} className="text-red animate-pulse" />,
        };
      case "patching":
        return {
          step: 4,
          label: "DEFENDER PATCHING (.TF)",
          colorClass: "phase-patching",
          icon: <Activity size={14} className="text-amber animate-spin" />,
        };
      case "contained":
        return {
          step: 5,
          label: "CONTAINED & HEALED",
          colorClass: "phase-contained",
          icon: <ShieldCheck size={14} className="text-green" />,
        };
      case "normal":
      default:
        return {
          step: 1,
          label: "NORMAL OPERATIONS",
          colorClass: "phase-normal",
          icon: <Activity size={14} className="text-gray" />,
        };
    }
  };

  const phaseMeta = getPhaseMeta();

  return (
    <div className="telemetry-bar">
      {/* 1. Incident Phase Stepper */}
      <div className="telemetry-col telemetry-phase">
        <span className="telemetry-label">INCIDENT LIFECYCLE</span>
        <div className={`telemetry-phase-badge ${phaseMeta.colorClass}`}>
          {phaseMeta.icon}
          <span>{phaseMeta.label}</span>
          <span className="phase-step-num">STAGE {phaseMeta.step}/5</span>
        </div>
      </div>

      {/* 2. P99 Latency Gauge */}
      <div className="telemetry-col">
        <div className="telemetry-label-row">
          <Clock size={12} className="text-muted" />
          <span className="telemetry-label">P99 LATENCY</span>
        </div>
        <div className="telemetry-value-row">
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
