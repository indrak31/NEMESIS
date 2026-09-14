import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  RotateCcw,
  Radio,
  Wifi,
  WifiOff,
  ShieldAlert,
  FileCode,
  GitPullRequest,
  FileText
} from "lucide-react";
import Graph from "./components/Graph";
import Scoreboard from "./components/Scoreboard";
import LiveTrace from "./components/LiveTrace";
import TelemetryBar from "./components/TelemetryBar";
import TerraformModal from "./components/TerraformModal";
import GitOpsModal from "./components/GitOpsModal";
import NodeInspectorModal from "./components/NodeInspectorModal";
import IncidentReportModal from "./components/IncidentReportModal";
import { FALLBACK_GRAPH, SCENARIO_OPTIONS } from "./mockEvents";
import "./App.css";

// =============================================================================
// CONFIGURATION: Real backend on localhost:8000
// =============================================================================
const WS_BACKEND_URL =
  typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? `ws://${window.location.hostname}:8000/events`
    : "ws://localhost:8000/events";

const REST_BACKEND_URL =
  typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? `http://${window.location.hostname}:8000`
    : "http://localhost:8000";

// Protected boundary mapping for each scenario
const SCENARIO_PROTECTED_EDGES = {
  payment_latency_spike: ["Payment Service", "Orders Service"],
  auth_token_flood: ["API Gateway", "Auth Service"],
  orders_db_exhaustion: ["Orders Service", "Orders DB"],
  inventory_sync_deadlock: ["Orders Service", "Inventory"],
};

export default function App() {
  // Live WebSocket connection status: "connected" | "connecting" | "disconnected"
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [isRunning, setIsRunning] = useState(false);

  // Selected scenario
  const [selectedScenario, setSelectedScenario] = useState("payment_latency_spike");

  // Topology state
  const [nodes, setNodes] = useState(FALLBACK_GRAPH.nodes);
  const [edges, setEdges] = useState(FALLBACK_GRAPH.edges);
  const [nodeStates, setNodeStates] = useState({});
  const [activeEdges, setActiveEdges] = useState(new Set());
  const [activeHopNode, setActiveHopNode] = useState(null);
  const [protectedEdge, setProtectedEdge] = useState(null);

  // Telemetry HUD state
  const [telemetry, setTelemetry] = useState({
    phase: "normal",
    blastRadius: 0,
    latency: 42,
    errorRate: 0.0,
  });

  // Trace and Scoreboard state
  const [events, setEvents] = useState([]);
  const [latestPr, setLatestPr] = useState(null);
  const [isPrDeployed, setIsPrDeployed] = useState(false);
  const [scoreboard, setScoreboard] = useState({
    failuresFound: 0,
    neutralized: 0,
    escalated: 0,
  });

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPatchKey, setModalPatchKey] = useState("circuit_breaker.tf");
  const [gitopsModalOpen, setGitopsModalOpen] = useState(false);
  const [nodeInspectorOpen, setNodeInspectorOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [incidentReportOpen, setIncidentReportOpen] = useState(false);

  const wsRef = useRef(null);
  const previousServiceRef = useRef(null);
  const attackedNodesRef = useRef(new Set());
  const currentScenarioIdRef = useRef(selectedScenario);

  const currentScenarioMeta =
    SCENARIO_OPTIONS.find((s) => s.id === selectedScenario) ||
    SCENARIO_OPTIONS[0];

  // 1. Fetch static topology on load (or use fallback)
  useEffect(() => {
    async function loadTopology() {
      try {
        const res = await fetch(`${REST_BACKEND_URL}/graph`);
        if (res.ok) {
          const data = await res.json();
          if (data.nodes && data.edges) {
            setNodes(data.nodes);
            setEdges(data.edges);
          }
        }
      } catch (err) {
        setNodes(FALLBACK_GRAPH.nodes);
        setEdges(FALLBACK_GRAPH.edges);
      }
    }
    loadTopology();
  }, []);

  // 2. Central Event Handler (Consumes exact data contract + applies recovery logic)
  const handleIncomingEvent = useCallback((event) => {
    // Append to Live Trace
    setEvents((prev) => [...prev, event]);

    // State & Telemetry Progression based on event type
    if (event.type === "attack_start") {
      attackedNodesRef.current.add(event.service);
      if (event.graph_delta) {
        setNodeStates((prev) => ({ ...prev, [event.graph_delta.node]: "attacked" }));
      }
      setActiveHopNode(event.service);

      setTelemetry({
        phase: "attack",
        blastRadius: 1,
        latency: 480,
        errorRate: 24.5,
      });

      setScoreboard((prev) => ({
        ...prev,
        failuresFound: 1,
      }));
    } else if (event.type === "cascade") {
      let sourceNode = previousServiceRef.current;
      let targetNode = event.service;

      if (event.detail && event.detail.includes("->")) {
        const parts = event.detail.replace(/Cascade path:\s*/i, "").split("->");
        if (parts.length === 2) {
          sourceNode = parts[0].trim();
          targetNode = parts[1].trim();
        }
      }

      if (sourceNode && targetNode) {
        const edgeKey = `${sourceNode}->${targetNode}`;
        const reverseKey = `${targetNode}->${sourceNode}`;
        setActiveEdges((prev) => new Set([...prev, edgeKey, reverseKey]));
      }

      attackedNodesRef.current.add(targetNode);
      if (event.graph_delta) {
        setNodeStates((prev) => ({ ...prev, [event.graph_delta.node]: "attacked" }));
      }
      setActiveHopNode(targetNode);

      const currentCount = attackedNodesRef.current.size;
      setTelemetry({
        phase: "cascade",
        blastRadius: currentCount,
        latency: 520,
        errorRate: 42.8,
      });

      setScoreboard((prev) => ({
        ...prev,
        failuresFound: currentCount,
      }));
    } else if (event.type === "defender_fix") {
      if (event.graph_delta) {
        setNodeStates((prev) => ({ ...prev, [event.graph_delta.node]: "patching" }));
      }
      setActiveHopNode(event.service);

      setTelemetry((prev) => ({
        ...prev,
        phase: "patching",
        latency: 210,
        errorRate: 8.2,
      }));
    } else if (event.type === "simulation_result") {
      // Recovery logic
      setActiveEdges(new Set());

      const targetService = event.service;
      let boundaryEdge = null;
      if (event.detail) {
        const match = event.detail.match(/\[\s*(.*?)\s*->\s*(.*?)\s*\]/i);
        if (match) {
          boundaryEdge = [match[1].trim(), match[2].trim()];
        }
      }
      if (!boundaryEdge) {
        const activeKey = currentScenarioIdRef.current || selectedScenario;
        boundaryEdge = SCENARIO_PROTECTED_EDGES[activeKey] || [targetService, "Orders Service"];
      }
      setProtectedEdge(boundaryEdge);

      setNodeStates((prev) => {
        const updated = { ...prev };
        updated[targetService] = "protected";
        attackedNodesRef.current.forEach((nodeId) => {
          if (nodeId !== targetService) {
            updated[nodeId] = "healthy";
          }
        });
        return updated;
      });

      setTelemetry({
        phase: "contained",
        blastRadius: 0,
        latency: 48,
        errorRate: 0.0,
      });

      setScoreboard((prev) => ({
        ...prev,
        neutralized: prev.failuresFound > 0 ? prev.failuresFound : 1,
      }));
    } else if (event.type === "pr_opened") {
      setLatestPr(event);
      setIsRunning(false);
    } else if (event.type === "deployment_complete") {
      setIsPrDeployed(true);
      if (event.service) {
        setNodeStates((prev) => ({ ...prev, [event.service]: "deployed" }));
      }
      setTelemetry((prev) => ({
        ...prev,
        phase: "deployed",
        latency: 38,
        errorRate: 0.0,
      }));
    }

    if (event.service) {
      previousServiceRef.current = event.service;
    }
  }, [selectedScenario]);

  // 3. WebSocket Connection Hook (Direct to real backend)
  useEffect(() => {
    let isMounted = true;
    let reconnectTimeout = null;

    function connectWs() {
      if (!isMounted) return;
      setConnectionStatus("connecting");
      try {
        const ws = new WebSocket(WS_BACKEND_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setConnectionStatus("connected");
        };

        ws.onmessage = (msg) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(msg.data);
            handleIncomingEvent(data);
          } catch (e) {
            console.error("Failed to parse incoming WebSocket message:", e);
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setConnectionStatus("disconnected");
          reconnectTimeout = setTimeout(connectWs, 2000);
        };

        ws.onerror = () => {
          if (!isMounted) return;
          setConnectionStatus("disconnected");
          try {
            ws.close();
          } catch (e) {}
        };
      } catch (err) {
        if (isMounted) {
          setConnectionStatus("disconnected");
          reconnectTimeout = setTimeout(connectWs, 2000);
        }
      }
    }

    connectWs();

    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (e) {}
      }
    };
  }, [handleIncomingEvent]);

  // 4. Trigger Simulation for Selected Scenario against Real Backend
  const handleTriggerRun = async (overrideScenario) => {
    const scenarioToRun = overrideScenario || selectedScenario;
    currentScenarioIdRef.current = scenarioToRun;
    await handleReset();
    setIsRunning(true);

    try {
      const res = await fetch(`${REST_BACKEND_URL}/run-scenario/${scenarioToRun}`, {
        method: "POST",
      });
      if (!res.ok) {
        console.warn("Backend run-scenario endpoint returned error status:", res.status);
        setIsRunning(false);
      }
    } catch (err) {
      console.error("Failed to trigger real backend scenario:", err);
      setIsRunning(false);
    }
  };

  // 5. Reset Topology & State
  const handleReset = async () => {
    const healthyStates = {};
    nodes.forEach((n) => {
      healthyStates[n.id] = "healthy";
    });
    setNodeStates(healthyStates);
    setActiveEdges(new Set());
    setActiveHopNode(null);
    setProtectedEdge(null);
    attackedNodesRef.current.clear();
    setEvents([]);
    setLatestPr(null);
    setIsPrDeployed(false);
    setScoreboard({ failuresFound: 0, neutralized: 0, escalated: 0 });
    setTelemetry({
      phase: "normal",
      blastRadius: 0,
      latency: 42,
      errorRate: 0.0,
    });
    previousServiceRef.current = null;
    setIsRunning(false);

    try {
      await fetch(`${REST_BACKEND_URL}/reset`, { method: "POST" });
    } catch (err) {
      // Graceful fallback if backend is temporarily unreachable
    }
  };

  // Open Terraform patch modal
  const handleOpenPatchModal = (fixFileName) => {
    setModalPatchKey(fixFileName || currentScenarioMeta.fixFile);
    setModalOpen(true);
  };

  // Open Node Inspector when a node in graph is clicked
  const handleSelectNode = (nodeId) => {
    setSelectedNodeId(nodeId);
    setNodeInspectorOpen(true);
  };

  // Handler for GitOps merge success
  const handleMergeSuccess = (result) => {
    setIsPrDeployed(true);
    const targetService = currentScenarioMeta.target;
    setNodeStates((prev) => ({
      ...prev,
      [targetService]: "deployed",
    }));
    setTelemetry((prev) => ({
      ...prev,
      phase: "deployed",
      latency: 36,
      errorRate: 0.0,
    }));
    setEvents((prev) => [
      ...prev,
      {
        type: "deployment_complete",
        timestamp: new Date().toTimeString().split(" ")[0],
        service: targetService,
        message: "GitOps Engine: PR merged & deployed to production (AWS EKS)",
        detail: "Zero-downtime rolling update certified. Canary health 100%.",
      },
    ]);
  };

  // Handler for ad-hoc custom fault injection
  const handleCustomFaultInjected = (fault) => {
    handleIncomingEvent({
      type: "attack_start",
      timestamp: new Date().toTimeString().split(" ")[0],
      service: fault.target_node,
      message: `Chaos Engine: injected ${fault.fault_type} on ${fault.target_node}`,
      detail: `Severity: ${fault.severity} | Latency: +${fault.latency_ms || 450}ms`,
      graph_delta: { node: fault.target_node, state: "attacked" },
    });
  };

  // Initial reset on load
  useEffect(() => {
    handleReset();
  }, []);

  return (
    <div className="app-root">
      {/* Dynamic Reconnection Banner if WebSocket is disconnected or connecting */}
      {connectionStatus !== "connected" && (
        <div className="reconnect-banner">
          <span className="reconnect-pulse-dot" />
          <span>
            {connectionStatus === "connecting"
              ? "CONNECTING: Establishing real WebSocket link to ws://localhost:8000/events..."
              : "BACKEND UNRESPONSIVE: Connection dropped. Retrying real WebSocket in 2s..."}
          </span>
        </div>
      )}

      {/* ====================================================================
          TOP BAR (Dark Navy)
          ==================================================================== */}
      <header className="top-bar">
        <div className="top-bar-left">
          <span className="brand-nemesis">NEMESIS</span>
          <span className="brand-subtitle">Autonomous Cloud Resilience Engine</span>
        </div>

        <div className="top-bar-right">
          {/* Scenario Selector Dropdown */}
          <div className="scenario-dropdown-wrap" title="Select failure scenario to inject">
            <ShieldAlert size={14} className="text-amber" />
            <span className="scenario-dropdown-label">SCENARIO:</span>
            <select
              className="scenario-select"
              value={selectedScenario}
              onChange={(e) => {
                const newScenario = e.target.value;
                setSelectedScenario(newScenario);
                handleTriggerRun(newScenario);
              }}
              disabled={isRunning}
            >
              {SCENARIO_OPTIONS.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.title} (Target: {sc.target})
                </option>
              ))}
            </select>
          </div>

          {/* Quick Patch Inspect Button in Header */}
          <button
            className="top-action-btn btn-inspect-header"
            onClick={() => handleOpenPatchModal(currentScenarioMeta.fixFile)}
            title="Inspect current Terraform patch code"
          >
            <FileCode size={13} className="text-cyan" />
            <span>{currentScenarioMeta.fixFile}</span>
          </button>

          {/* GitOps Automation Hub Button in Header */}
          <button
            className={`top-action-btn btn-gitops-header ${isPrDeployed ? "btn-gitops-header-deployed" : ""}`}
            onClick={() => setGitopsModalOpen(true)}
            title="Open GitOps Review & Deployment Hub"
          >
            <GitPullRequest size={13} className={isPrDeployed ? "text-green" : "text-cyan"} />
            <span>{isPrDeployed ? "GITOPS: DEPLOYED" : "GITOPS HUB"}</span>
          </button>

          {/* AI RCA Post-Mortem Button in Header */}
          <button
            className="top-action-btn btn-report-header"
            onClick={() => setIncidentReportOpen(true)}
            title="View Executive Incident Post-Mortem and Root Cause Analysis"
          >
            <FileText size={13} className="text-cyan" />
            <span>POST-MORTEM</span>
          </button>

          {/* Visible Real Connection Status Indicator (Small Dot: Green = Connected, Red = Disconnected) */}
          <div
            className={`ws-connection-indicator ${
              connectionStatus === "connected"
                ? "indicator-connected"
                : connectionStatus === "connecting"
                ? "indicator-connecting"
                : "indicator-disconnected"
            }`}
            title={
              connectionStatus === "connected"
                ? "Connected to real NEMESIS backend WebSocket at ws://localhost:8000/events"
                : "WebSocket disconnected from backend. Attempting automatic reconnection..."
            }
          >
            <span
              className={`status-dot ${
                connectionStatus === "connected"
                  ? "status-dot-green"
                  : connectionStatus === "connecting"
                  ? "status-dot-amber"
                  : "status-dot-red"
              }`}
            />
            <span className="indicator-label">
              {connectionStatus === "connected"
                ? "BACKEND CONNECTED"
                : connectionStatus === "connecting"
                ? "CONNECTING..."
                : "DISCONNECTED (RETRYING)"}
            </span>
          </div>

          {/* Trigger Run Button */}
          <button
            className="top-action-btn btn-trigger-run"
            onClick={() => handleTriggerRun()}
            disabled={isRunning}
          >
            <Play size={13} fill="currentColor" />
            <span>{isRunning ? "RUNNING..." : "TRIGGER ATTACK"}</span>
          </button>

          {/* Reset Button */}
          <button className="top-action-btn btn-reset-run" onClick={handleReset}>
            <RotateCcw size={13} />
            <span>RESET</span>
          </button>

          {/* Red "LIVE RUN" Pill */}
          <div className="pill-live-run">
            <span className="pill-dot-red"></span>
            <span>LIVE RUN</span>
          </div>
        </div>
      </header>

      {/* Reconnection Alert Banner if backend is disconnected */}
      {connectionStatus === "disconnected" && (
        <div className="reconnect-banner">
          <WifiOff size={14} className="text-red" />
          <span>
            Backend connection lost. Real-time telemetry paused. Reconnecting to ws://localhost:8000/events...
          </span>
        </div>
      )}

      {/* ====================================================================
          MAIN DASHBOARD: Telemetry HUD + 65% Graph | 35% Scoreboard + Trace
          ==================================================================== */}
      <main className="main-content-layout">
        {/* Real-Time Quantitative Telemetry HUD */}
        <TelemetryBar
          phase={telemetry.phase}
          blastRadius={telemetry.blastRadius}
          latency={telemetry.latency}
          errorRate={telemetry.errorRate}
        />

        <div className="dashboard-columns">
          {/* Left Panel (~65% width): White Card Infrastructure Graph */}
          <section className="left-panel">
            <Graph
              nodes={nodes}
              edges={edges}
              nodeStates={nodeStates}
              activeEdges={activeEdges}
              activeHopNode={activeHopNode}
              activeScenarioMeta={currentScenarioMeta}
              protectedEdge={protectedEdge}
              onInspectPatch={handleOpenPatchModal}
              onSelectNode={handleSelectNode}
            />
          </section>

          {/* Right Column: Scoreboard Card (Top) + Live Trace Card (Bottom) */}
          <aside className="right-column">
            <Scoreboard
              failuresFound={scoreboard.failuresFound}
              neutralized={scoreboard.neutralized}
              escalated={scoreboard.escalated}
            />

            <LiveTrace
              events={events}
              latestPr={latestPr}
              activePatchKey={currentScenarioMeta.fixFile}
              onInspectPatch={handleOpenPatchModal}
              onOpenGitOps={() => setGitopsModalOpen(true)}
              onOpenIncidentReport={() => setIncidentReportOpen(true)}
              isPrDeployed={isPrDeployed}
            />
          </aside>
        </div>
      </main>

      {/* Interactive Terraform Patch Modal */}
      <TerraformModal
        patchKey={modalPatchKey}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />

      {/* Interactive GitOps Review & Merge Hub Modal */}
      <GitOpsModal
        isOpen={gitopsModalOpen}
        onClose={() => setGitopsModalOpen(false)}
        onMergeSuccess={handleMergeSuccess}
        backendUrl={REST_BACKEND_URL}
        useMockStream={false}
      />

      {/* Interactive Node Inspector & Chaos Fault Injection Modal */}
      <NodeInspectorModal
        nodeId={selectedNodeId}
        isOpen={nodeInspectorOpen}
        onClose={() => setNodeInspectorOpen(false)}
        nodeState={nodeStates[selectedNodeId] || "healthy"}
        onInjectFault={handleCustomFaultInjected}
        backendUrl={REST_BACKEND_URL}
        useMockStream={false}
      />

      {/* Executive AI Incident Post-Mortem & RCA Modal */}
      <IncidentReportModal
        isOpen={incidentReportOpen}
        onClose={() => setIncidentReportOpen(false)}
        backendUrl={REST_BACKEND_URL}
        useMockStream={false}
        scenarioMeta={currentScenarioMeta}
      />
    </div>
  );
}
