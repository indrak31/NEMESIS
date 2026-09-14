from __future__ import annotations

from typing import List, Literal, Optional, Tuple
from pydantic import BaseModel, Field


NodeCriticality = Literal["high", "medium", "low"]
NodeState = Literal["healthy", "attacked", "patching", "protected", "deployed"]
EventType = Literal[
    "attack_start",
    "cascade",
    "defender_fix",
    "simulation_result",
    "pr_opened",
    "deployment_complete",
]


class Node(BaseModel):
    id: str
    criticality: NodeCriticality


class GraphTopology(BaseModel):
    nodes: List[Node]
    edges: List[Tuple[str, str]]


class GraphDelta(BaseModel):
    node: str
    state: NodeState


class Event(BaseModel):
    type: EventType
    timestamp: str = Field(..., description="Timestamp formatted as HH:MM:SS")
    service: Optional[str] = Field(
        None, description="The node this event concerns, if any. None otherwise."
    )
    message: str = Field(
        ..., description="Human-readable line for the live trace panel"
    )
    detail: Optional[str] = Field(
        None, description="Secondary line (cascade path, filename, PR reference)"
    )
    graph_delta: Optional[GraphDelta] = Field(
        None, description="Delta indicating node visual state update if applicable"
    )


class ScenarioStep(BaseModel):
    event_type: EventType
    service: Optional[str] = None
    message: str
    detail: Optional[str] = None
    graph_delta: Optional[GraphDelta] = None
    delay_ms: int = 600


class ScenarioDefinition(BaseModel):
    name: str
    title: str
    description: str
    target_service: str
    cascade_path: List[str]
    severity_score: float
    canned_fix_file: str
    canned_fix_desc: str
    protected_edge: Tuple[str, str]


# --- ADVANCED GITOPS & TELEMETRY SCHEMAS ---


class CICDCheck(BaseModel):
    name: str
    status: Literal["passed", "running", "failed"]
    duration: str
    output: str


class PullRequestDetails(BaseModel):
    number: int
    title: str
    branch: str
    base_branch: str = "main"
    status: Literal["open", "merged", "deployed"]
    patch_file: str
    patch_content: str
    diff_content: str
    ci_checks: List[CICDCheck]
    pr_url: str
    created_at: str
    merged_at: Optional[str] = None
    target_service: str
    protected_edge: Tuple[str, str]


class CustomFaultInjection(BaseModel):
    service: str
    fault_type: Literal["latency", "packet_loss", "thread_exhaustion", "connection_timeout"] = "latency"
    intensity_ms: int = 400
    error_rate_pct: float = 25.0


class IncidentReport(BaseModel):
    incident_id: str
    scenario_title: str
    timestamp: str
    target_service: str
    cascade_path: List[str]
    severity_score: float
    root_cause_analysis: str
    remediation_applied: str
    terraform_file: str
    downtime_prevented_est: str
    cost_savings_est: str
    markdown_content: str


class TelemetryPoint(BaseModel):
    timestamp: str
    p99_latency_ms: float
    error_rate_pct: float
    requests_per_sec: int
    blast_radius: int

