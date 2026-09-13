import React, { useState, useEffect, useRef, useCallback } from "react";
import { Play, RotateCcw, Radio, Wifi, WifiOff, ShieldAlert, FileCode } from "lucide-react";
import Graph from "./components/Graph";
import Scoreboard from "./components/Scoreboard";
import LiveTrace from "./components/LiveTrace";
import TelemetryBar from "./components/TelemetryBar";
import TerraformModal from "./components/TerraformModal";
import { FALLBACK_GRAPH, SCENARIO_OPTIONS, startMockEventStream } from "./mockEvents";
import "./App.css";

// =============================================================================
// CONFIGURATION: SWAP THIS SINGLE LINE TO SWITCH BETWEEN MOCK & REAL BACKEND
// =============================================================================
const USE_MOCK_STREAM_DEFAULT = true; // Set to FALSE when backend is running!
const WS_BACKEND_URL = "ws://localhost:8000/events";
const REST_BACKEND_URL = "http://localhost:8000";

// Protected boundary mapping for each scenario
const SCENARIO_PROTECTED_EDGES = {
  payment_latency_spike: ["Payment Service", "Orders Service"],
  auth_token_flood: ["API Gateway", "Auth Service"],
  orders_db_exhaustion: ["Orders Service", "Orders DB"],
  inventory_sync_deadlock: ["Orders Service", "Inventory"],
};

export default function App() {
  // Mode flag: toggle between standalone Mock simulation and live WebSocket
  const [useMockStream, setUseMockStream] = useState(USE_MOCK_STREAM_DEFAULT);
  const [wsConnected, setWsConnected] = useState(false);
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
  const [scoreboard, setScoreboard] = useState({
    failuresFound: 0,
    neutralized: 0,
    escalated: 0,
  });

  // Terraform Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPatchKey, setModalPatchKey] = useState("circuit_breaker.tf");

  const wsRef = useRef(null);
  const cancelMockRef = useRef(null);
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
    // A. Append to Live Trace
    setEvents((prev) => [...prev, event]);

    // B. State & Telemetry Progression based on event type
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
      // RECOVERY LOGIC:
      // 1. Clear active red cascade paths so arrows don't linger!
      setActiveEdges(new Set());

      // 2. Extract exact boundary edge from detail string: "Protected edge [A -> B]"
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

      // 3. Target node is protected (cyan shield); downstream nodes heal back to healthy!
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
    }

    if (event.service) {
      previousServiceRef.current = event.service;
    }
  }, [selectedScenario]);

  // 3. WebSocket Connection Hook
  useEffect(() => {
    if (useMockStream) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
      return;
    }

    let isMounted = true;
    let reconnectTimeout = null;

    function connectWs() {
      try {
        const ws = new WebSocket(WS_BACKEND_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setWsConnected(true);
        };

        ws.onmessage = (msg) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(msg.data);
            handleIncomingEvent(data);
          } catch (e) {}
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setWsConnected(false);
          reconnectTimeout = setTimeout(connectWs, 2500);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (err) {
        setWsConnected(false);
      }
    }

    connectWs();

    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, [useMockStream, handleIncomingEvent]);

  // 4. Trigger / Replay Simulation for Selected Scenario
  const handleTriggerRun = (overrideScenario) => {
    const scenarioToRun = overrideScenario || selectedScenario;
    currentScenarioIdRef.current = scenarioToRun;
    handleReset();
    setIsRunning(true);

    if (useMockStream) {
      if (cancelMockRef.current) cancelMockRef.current();
      cancelMockRef.current = startMockEventStream(
        scenarioToRun,
        handleIncomingEvent,
        () => {
          setIsRunning(false);
        }
      );
    } else {
      fetch(`${REST_BACKEND_URL}/run-scenario/${scenarioToRun}`, {
        method: "POST",
      }).catch((err) => {
        console.error("Failed to trigger backend scenario:", err);
      });
    }
  };

  // 5. Reset Topology & State
  const handleReset = () => {
    if (cancelMockRef.current) {
      cancelMockRef.current();
      cancelMockRef.current = null;
    }

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
    setScoreboard({ failuresFound: 0, neutralized: 0, escalated: 0 });
    setTelemetry({
      phase: "normal",
      blastRadius: 0,
      latency: 42,
      errorRate: 0.0,
    });
    previousServiceRef.current = null;
    setIsRunning(false);

    if (!useMockStream) {
      fetch(`${REST_BACKEND_URL}/reset`, { method: "POST" }).catch(() => {});
    }
  };

  // Open Terraform patch modal
  const handleOpenPatchModal = (fixFileName) => {
    setModalPatchKey(fixFileName || currentScenarioMeta.fixFile);
    setModalOpen(true);
  };

  // Run initial mock on mount
  useEffect(() => {
    if (useMockStream) {
      handleTriggerRun("payment_latency_spike");
    }
    return () => {
      if (cancelMockRef.current) cancelMockRef.current();
    };
  }, []);

  return (
    <div className="app-root">
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

          {/* Mock vs Live Stream Mode Indicator & Toggle */}
          <button
            className="stream-toggle-pill"
            onClick={() => {
              const nextMode = !useMockStream;
              setUseMockStream(nextMode);
              handleReset();
            }}
            title="Toggle between Standalone Mock and Live Backend WebSocket"
          >
            {useMockStream ? (
              <>
                <Radio size={12} className="text-cyan" />
                <span>STREAM: MOCK EMITTER</span>
              </>
            ) : wsConnected ? (
              <>
                <Wifi size={12} className="text-green" />
                <span>WS: CONNECTED (PORT 8000)</span>
              </>
            ) : (
              <>
                <WifiOff size={12} className="text-red" />
                <span>WS: DISCONNECTED</span>
              </>
            )}
          </button>

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
    </div>
  );
}
