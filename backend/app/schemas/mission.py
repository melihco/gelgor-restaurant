"""
Mission schemas — request/response shapes for the Mission API.

Enums inherit from str so they serialise to plain strings in JSON
and compare cleanly against DB values without .value lookups.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import OrmBase


# ── Enums ─────────────────────────────────────────────────────────────────────

class MissionType(str, Enum):
    """What triggered the creation of this mission."""
    SEASONAL    = "seasonal"      # Industry calendar phase transition
    OPPORTUNITY = "opportunity"   # market_opportunity_ideas urgency signal
    COMPETITIVE = "competitive"   # competitor_pulse spike
    RECOVERY    = "recovery"      # approval_rate / velocity degradation
    MANUAL      = "manual"        # operator created directly


class MissionStatus(str, Enum):
    """Lifecycle state of a mission."""
    PROPOSED   = "proposed"    # Created by StrategistAgent, awaiting operator approval
    APPROVED   = "approved"    # Operator approved; TaskGraphExecutor will schedule it
    IN_FLIGHT  = "in_flight"   # At least one task node is running
    COMPLETED  = "completed"   # All nodes completed (some may have failed but mission done)
    REJECTED   = "rejected"    # Operator explicitly rejected the proposal
    CANCELLED  = "cancelled"   # Operator aborted an in-flight mission


class MissionPriority(str, Enum):
    CRITICAL = "critical"
    HIGH     = "high"
    MEDIUM   = "medium"
    LOW      = "low"


class TaskNodeStatus(str, Enum):
    """Lifecycle state of a single task node."""
    PENDING   = "pending"    # Waiting for dependencies
    RUNNING   = "running"    # engine.execute() in progress
    COMPLETED = "completed"  # Execution succeeded, output_artifact_id set
    FAILED    = "failed"     # Execution failed, error_message set
    SKIPPED   = "skipped"    # Skipped because a hard dependency failed


# ── Phase (stored as JSONB in missions.phases) ────────────────────────────────

class MissionPhase(BaseModel):
    """
    Display-only grouping of task nodes within a mission.
    node_keys reference MissionTaskNode.node_key values for this mission.
    """
    index: int
    name: str
    description: str = ""
    node_keys: list[str] = Field(default_factory=list)


# ── Task node schemas ─────────────────────────────────────────────────────────

class TaskNodeCreate(BaseModel):
    """One node in the task graph, as supplied by the StrategistAgent."""
    node_key: str = Field(..., min_length=1, max_length=100)
    phase_index: int = Field(0, ge=0)
    title: str
    task_type: str
    agent_role: str
    input_data: dict[str, Any] | None = None
    brief_override: str | None = None
    # node_key strings this node depends on (empty = run immediately)
    depends_on: list[str] = Field(default_factory=list)


class TaskNodeRead(OrmBase):
    id: uuid.UUID
    mission_id: uuid.UUID
    workspace_id: uuid.UUID
    node_key: str
    phase_index: int
    title: str
    task_type: str
    agent_role: str
    input_data: dict[str, Any] | None
    brief_override: str | None
    depends_on: list[str] | None
    status: str
    output_artifact_id: str | None
    output_summary: str | None
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str | None
    retry_count: int
    created_at: datetime
    updated_at: datetime


class TaskNodeStatusUpdate(BaseModel):
    """Payload used by the TaskGraphExecutor to advance a node's status."""
    status: TaskNodeStatus
    output_artifact_id: str | None = None
    output_summary: str | None = None
    error_message: str | None = None


# ── Mission schemas ───────────────────────────────────────────────────────────

class MissionCreate(BaseModel):
    """
    Create a new mission, optionally with its full task graph.
    Used by the StrategistAgent and by the manual-create API endpoint.
    """
    title: str
    type: MissionType
    trigger_signal: str | None = None
    trigger_evidence: str | None = None
    objective: str | None = None
    timeline_days: int | None = Field(None, ge=1, le=365)
    creative_brief: str | None = None
    phases: list[MissionPhase] | None = None
    assigned_agent_roles: list[str] | None = None
    priority: MissionPriority = MissionPriority.HIGH
    confidence: float = Field(0.8, ge=0.0, le=1.0)
    # Task graph nodes — created atomically with the mission.
    # May be empty for manually-created missions that will be built interactively.
    task_nodes: list[TaskNodeCreate] = Field(default_factory=list)

    @field_validator("task_nodes")
    @classmethod
    def validate_node_keys_unique(cls, nodes: list[TaskNodeCreate]) -> list[TaskNodeCreate]:
        keys = [n.node_key for n in nodes]
        if len(keys) != len(set(keys)):
            raise ValueError("task_nodes must have unique node_key values within the mission")
        return nodes

    @field_validator("task_nodes")
    @classmethod
    def validate_depends_on_references(cls, nodes: list[TaskNodeCreate]) -> list[TaskNodeCreate]:
        keys = {n.node_key for n in nodes}
        for node in nodes:
            for dep in node.depends_on:
                if dep not in keys:
                    raise ValueError(
                        f"Node '{node.node_key}' depends_on '{dep}' which doesn't exist in task_nodes"
                    )
        return nodes


class MissionSummary(OrmBase):
    """Lightweight read — used in list views and the Mission Hub."""
    id: uuid.UUID
    workspace_id: uuid.UUID
    title: str
    type: str
    trigger_signal: str | None
    objective: str | None
    timeline_days: int | None
    priority: str
    confidence: float
    status: str
    assigned_agent_roles: list[str] | None
    created_at: datetime
    approved_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    # Computed counts — populated by the service layer, not from the ORM directly.
    total_nodes: int = 0
    completed_nodes: int = 0
    failed_nodes: int = 0


class MissionRead(MissionSummary):
    """Full read — includes creative brief, phases, and all task nodes."""
    trigger_evidence: str | None
    creative_brief: str | None
    phases: list[MissionPhase] | None
    performance_summary: dict[str, Any] | None
    rejected_at: datetime | None
    rejected_reason: str | None
    approved_by: str | None
    task_nodes: list[TaskNodeRead] = Field(default_factory=list)


class MissionApprove(BaseModel):
    """Operator approves a proposed mission."""
    approved_by: str  # user_id or display name


class MissionReject(BaseModel):
    """Operator rejects a proposed mission."""
    reason: str | None = None


# ── Mission proposal (StrategistAgent output, not directly stored) ────────────

class MissionProposal(BaseModel):
    """
    The structured output of the StrategistAgent.

    Not a DB model — the StrategistAgent returns a list of these via the
    CrewAI execution pipeline. The Mission API converts them into MissionCreate
    requests and persists them as proposed Mission rows.

    Having a distinct proposal type (vs MissionCreate) lets the StrategistAgent
    output raw intelligence evidence and confidence scores that are useful for
    the approval UI but don't need to be stored permanently on the Mission row.
    """
    title: str
    type: MissionType
    trigger_signal: str
    trigger_evidence: str
    objective: str
    timeline_days: int
    creative_brief: str
    phases: list[MissionPhase]
    task_nodes: list[TaskNodeCreate]
    assigned_agent_roles: list[str]
    priority: MissionPriority
    confidence: float = Field(0.8, ge=0.0, le=1.0)
    # Why the StrategistAgent believes this mission is valuable right now.
    rationale: str = ""
    # What the expected outcome is if this mission is executed.
    expected_outcome: str = ""

    def to_mission_create(self) -> MissionCreate:
        """Convert a proposal into a storable MissionCreate request."""
        return MissionCreate(
            title=self.title,
            type=self.type,
            trigger_signal=self.trigger_signal,
            trigger_evidence=self.trigger_evidence,
            objective=self.objective,
            timeline_days=self.timeline_days,
            creative_brief=self.creative_brief,
            phases=self.phases,
            task_nodes=self.task_nodes,
            assigned_agent_roles=self.assigned_agent_roles,
            priority=self.priority,
            confidence=self.confidence,
        )
