import React from "react";
import { Shield, ShieldAlert, Zap } from "lucide-react";

// Fixed positions matching visual spec with clean vertical spacing
const NODE_POSITIONS = {
  "API Gateway": { x: 310, y: 60 },
  "Auth Service": { x: 140, y: 180 },
  "Payment Service": { x: 450, y: 175 },
  "Orders Service": { x: 450, y: 315 },
  "Inventory": { x: 260, y: 435 },
  "Orders DB": { x: 450, y: 445 },
  "Cache": { x: 610, y: 435 },
  "Notification": { x: 570, y: 60 },
};

// Distinct labels for every node (NO DUPLICATES!)
const NODE_BADGES = {
  "API Gateway": "GW",
  "Auth Service": "AUTH",
  "Payment Service": "PAY",
  "Orders Service": "ORD",
  "Orders DB": "DB",
  "Inventory": "INV",
  "Cache": "CACHE",
  "Notification": "NOTIF",
};

export default function Graph({
  nodes = [],
  edges = [],
  nodeStates = {},
  activeEdges = new Set(),
  activeHopNode = null,
  activeScenarioMeta = null,
  protectedEdge = null, // e.g. ["Payment Service", "Orders Service"]
  onInspectPatch = null,
}) {
  // Map node state to color & glow filter
  const getNodeVisuals = (nodeId) => {
    const state = nodeStates[nodeId] || "healthy";
    switch (state) {
      case "attacked":
        return {
          fill: "#ef4444",
          stroke: "#b91c1c",
          filter: "url(#glow-red)",
          textColor: "#dc2626",
          stateLabel: "ATTACKED",
          pulse: true,
        };
      case "patching":
        return {
          fill: "#f59e0b",
          stroke: "#b45309",
          filter: "url(#glow-amber)",
          textColor: "#d97706",
          stateLabel: "PATCHING (.TF)",
          pulse: false,
        };
      case "protected":
        return {
          fill: "#06b6d4",
          stroke: "#0891b2",
          filter: "url(#glow-cyan)",
          textColor: "#0891b2",
          stateLabel: "PROTECTED (SHIELD)",
          pulse: false,
        };
      case "healed":
      case "healthy":
      default:
        return {
          fill: "#94a3b8",
          stroke: "#64748b",
          filter: "none",
          textColor: "#334155",
          stateLabel: "HEALTHY",
          pulse: false,
        };
    }
  };

  return (
    <div className="card-white graph-card">
      <div className="card-header">
        <div>
          <h2 className="card-title">Infrastructure graph</h2>
          <p className="card-subtitle">
            {activeScenarioMeta ? (
              <>
                <span className="font-semibold text-main">{activeScenarioMeta.title}:</span>{" "}
                {activeScenarioMeta.target} &rarr; {activeScenarioMeta.cascadePath}
              </>
            ) : (
              "8 microservices · Directed dependency topology"
            )}
          </p>
        </div>

        <div className="header-actions-right">
          {activeScenarioMeta && onInspectPatch && (
            <button
              className="btn-inspect-patch"
              onClick={() => onInspectPatch(activeScenarioMeta.fixFile)}
              title="Inspect the Terraform resilience code applied to this failure"
            >
              <span>Inspect {activeScenarioMeta.fixFile}</span>
              <span className="badge-iactag">IaC</span>
            </button>
          )}

          <div className="card-header-badge">
            <span className="topology-badge-dot"></span>
            <span>ACTIVE MONITOR</span>
          </div>
        </div>
      </div>

      <div className="graph-svg-container">
        <svg
          viewBox="0 0 720 500"
          className="graph-svg"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Soft Red Halo for Attacked */}
            <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="7"
                floodColor="#ef4444"
                floodOpacity="0.8"
              />
            </filter>

            {/* Soft Amber Halo for Patching */}
            <filter id="glow-amber" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="7"
                floodColor="#f59e0b"
                floodOpacity="0.75"
              />
            </filter>

            {/* Electric Cyan Halo for Protected Shield */}
            <filter id="glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="8"
                floodColor="#06b6d4"
                floodOpacity="0.9"
              />
            </filter>

            {/* Directed Edge Arrowhead - Default */}
            <marker
              id="arrow-default"
              viewBox="0 0 10 10"
              refX="33"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#cbd5e1" />
            </marker>

            {/* Directed Edge Arrowhead - Active Cascade */}
            <marker
              id="arrow-cascade"
              viewBox="0 0 10 10"
              refX="33"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
            </marker>

            {/* Directed Edge Arrowhead - Protected Boundary */}
            <marker
              id="arrow-protected"
              viewBox="0 0 10 10"
              refX="33"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#06b6d4" />
            </marker>
          </defs>

          {/* Render Edges */}
          <g className="edges-layer">
            {edges.map(([source, target]) => {
              const posA = NODE_POSITIONS[source];
              const posB = NODE_POSITIONS[target];
              if (!posA || !posB) return null;

              const edgeKey = `${source}->${target}`;
              const isCascade = activeEdges.has(edgeKey);
              const isEdgeProtected =
                protectedEdge &&
                ((protectedEdge[0] === source && protectedEdge[1] === target) ||
                  (protectedEdge[0] === target && protectedEdge[1] === source));

              return (
                <g key={edgeKey}>
                  <line
                    x1={posA.x}
                    y1={posA.y}
                    x2={posB.x}
                    y2={posB.y}
                    className={`graph-edge ${
                      isEdgeProtected
                        ? "edge-protected"
                        : isCascade
                        ? "edge-cascade"
                        : ""
                    }`}
                    markerEnd={
                      isEdgeProtected
                        ? "url(#arrow-protected)"
                        : isCascade
                        ? "url(#arrow-cascade)"
                        : "url(#arrow-default)"
                    }
                  />

                  {/* Animated Cascade packet */}
                  {isCascade && !isEdgeProtected && (
                    <circle r="4.5" fill="#ef4444">
                      <animateMotion
                        path={`M ${posA.x} ${posA.y} L ${posB.x} ${posB.y}`}
                        dur="1s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}

                  {/* PROTECTED BOUNDARY SHIELD BADGE */}
                  {isEdgeProtected && (() => {
                    const isVertical = Math.abs(posA.x - posB.x) < 10;
                    // On vertical cascades (e.g. PAY -> ORD or ORD -> DB), position slightly lower so it doesn't touch the top node's label
                    const t = isVertical ? 0.60 : 0.50;
                    const badgeX = posA.x + (posB.x - posA.x) * t;
                    const badgeY = posA.y + (posB.y - posA.y) * t;

                    return (
                      <g transform={`translate(${badgeX}, ${badgeY})`}>
                        <g className="shield-badge-inner">
                          <rect
                            x="-55"
                            y="-11"
                            width="110"
                            height="22"
                            rx="11"
                            fill="#082f49"
                            stroke="#06b6d4"
                            strokeWidth="1.6"
                            filter="url(#glow-cyan)"
                          />
                          <text
                            textAnchor="middle"
                            dy="3"
                            fill="#38bdf8"
                            fontSize="8"
                            fontWeight="800"
                            fontFamily="JetBrains Mono, monospace"
                            letterSpacing="0.06em"
                          >
                            HALTED AT EDGE
                          </text>
                        </g>
                      </g>
                    );
                  })()}
                </g>
              );
            })}
          </g>

          {/* Render Nodes */}
          <g className="nodes-layer">
            {nodes.map((node) => {
              const pos = NODE_POSITIONS[node.id];
              if (!pos) return null;
              const { fill, stroke, filter, textColor, pulse, stateLabel } =
                getNodeVisuals(node.id);
              const badgeText = NODE_BADGES[node.id] || "SVC";

              return (
                <g
                  key={node.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  className={`graph-node-group ${pulse ? "node-pulsing" : ""}`}
                >
                  {/* Animated outer ping ring if attacked */}
                  {pulse && (
                    <circle
                      r="27"
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="2"
                      className="radar-ping"
                    />
                  )}

                  {/* Base Circle with smooth CSS transition */}
                  <circle
                    r="25"
                    fill={fill}
                    stroke={stroke}
                    strokeWidth="2.5"
                    filter={filter}
                    className="graph-node-circle"
                  />

                  {/* Distinct Badge Text */}
                  <text
                    textAnchor="middle"
                    dy="4.5"
                    fill="#ffffff"
                    fontSize={badgeText.length > 4 ? "9.5" : "11"}
                    fontWeight="800"
                    fontFamily="Inter, sans-serif"
                    letterSpacing="0.03em"
                    pointerEvents="none"
                  >
                    {badgeText}
                  </text>

                  {/* Primary Service Label below */}
                  <text
                    textAnchor="middle"
                    dy="38"
                    fill="#1e293b"
                    fontSize="11.5"
                    fontWeight="700"
                    fontFamily="Inter, sans-serif"
                    className="node-text-label"
                  >
                    {node.id}
                  </text>

                  {/* State Subtitle */}
                  <text
                    textAnchor="middle"
                    dy="50"
                    fill={textColor}
                    fontSize="8.5"
                    fontWeight="700"
                    fontFamily="JetBrains Mono, monospace"
                    letterSpacing="0.04em"
                  >
                    {stateLabel}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Visual Spec Legend */}
      <div className="graph-legend">
        <div className="legend-item">
          <span className="legend-dot dot-gray"></span>
          <span className="legend-text">Healthy (Nominal)</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot dot-red"></span>
          <span className="legend-text">Attacked / Cascading</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot dot-amber"></span>
          <span className="legend-text">Patching (.tf)</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot dot-cyan"></span>
          <span className="legend-text">Protected / Isolated Boundary</span>
        </div>
      </div>
    </div>
  );
}
