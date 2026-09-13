import React from "react";

export default function Scoreboard({
  failuresFound = 0,
  neutralized = 0,
  escalated = 0,
}) {
  // Calculate neutralization percentage
  const total = failuresFound;
  const percent = total > 0 ? Math.round((neutralized / total) * 100) : 100;

  return (
    <div className="card-white scoreboard-card">
      <div className="card-header">
        <div>
          <h2 className="card-title">Attacker vs Defender</h2>
          <p className="card-subtitle">
            Autonomous containment efficiency · {percent}% neutralized
          </p>
        </div>
      </div>

      <div className="scoreboard-rows">
        {/* Row 1: Failures Found (Red) */}
        <div className="scoreboard-row">
          <div className="scoreboard-label-group">
            <span className="scoreboard-indicator indicator-red"></span>
            <span className="scoreboard-label">Failures found</span>
          </div>
          <span className="scoreboard-value value-red">{failuresFound}</span>
        </div>

        {/* Row 2: Neutralized (Green) */}
        <div className="scoreboard-row">
          <div className="scoreboard-label-group">
            <span className="scoreboard-indicator indicator-green"></span>
            <span className="scoreboard-label">Neutralized</span>
          </div>
          <span className="scoreboard-value value-green">{neutralized}</span>
        </div>

        {/* Row 3: Escalated to human (Amber) */}
        <div className="scoreboard-row">
          <div className="scoreboard-label-group">
            <span className="scoreboard-indicator indicator-amber"></span>
            <span className="scoreboard-label">Escalated to human</span>
          </div>
          <span className="scoreboard-value value-amber">{escalated}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="scoreboard-bar-wrap">
        <div className="scoreboard-bar-track">
          <div
            className="scoreboard-bar-fill"
            style={{ width: `${percent}%` }}
          ></div>
        </div>
        <div className="scoreboard-bar-meta">
          <span>Containment rate</span>
          <span className="font-mono">{percent}%</span>
        </div>
      </div>
    </div>
  );
}
