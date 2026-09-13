from __future__ import annotations

from typing import List, Literal, Optional, Tuple
from pydantic import BaseModel, Field


NodeCriticality = Literal["high", "medium", "low"]
NodeState = Literal["healthy", "attacked", "patching", "protected"]
EventType = Literal[
    "attack_start",
    "cascade",
    "defender_fix",
    "simulation_result",
    "pr_opened",
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
