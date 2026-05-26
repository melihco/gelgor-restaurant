"""
Mission model — the strategic orchestration layer.

A Mission is a time-bound, multi-agent, multi-task operation with a shared
creative brief, a phase breakdown, and a DAG of task nodes.

Two tables:
  missions           — the mission entity (metadata, brief, status, phases)
  mission_task_nodes — individual executable nodes in the task graph

Relationship to other models:
  missions.workspace_id    → workspaces.id
  mission_task_nodes.mission_id → missions.id
  brand_contexts.active_mission_id → missions.id  (added in migration 0010)

The TaskGraphExecutor (Task 6) queries mission_task_nodes directly to find
nodes whose dependencies are all completed and schedules them via the
existing engine.execute() path.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime, ForeignKey, String, Text, Integer, Float,
    ARRAY, func,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel

if TYPE_CHECKING:
    from app.models.workspace import Workspace


class Mission(BaseModel):
    __tablename__ = "missions"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Identity ──────────────────────────────────────────────────────────
    title: Mapped[str] = mapped_column(String(500), nullable=False)

    # What type of signal created this mission.
    # Values: seasonal | opportunity | competitive | recovery | manual
    type: Mapped[str] = mapped_column(String(50), nullable=False)

    # ── Intelligence provenance ───────────────────────────────────────────
    # Which intelligence field triggered this (e.g. "industry_calendar.current_phase").
    trigger_signal: Mapped[str | None] = mapped_column(String(200))
    # The actual text evidence from the signal (competitor_pulse excerpt, phase name, etc.).
    trigger_evidence: Mapped[str | None] = mapped_column(Text)

    # ── Strategic intent ─────────────────────────────────────────────────
    objective: Mapped[str | None] = mapped_column(Text)
    timeline_days: Mapped[int | None] = mapped_column(Integer)

    # Shared creative brief injected into every task node in this mission.
    # This is the Mission Context layer of the layered prompt architecture.
    creative_brief: Mapped[str | None] = mapped_column(Text)

    # ── Task graph metadata ───────────────────────────────────────────────
    # JSON array of MissionPhase objects — display/grouping metadata only.
    # [{index, name, description, node_keys: [str]}]
    phases: Mapped[dict | None] = mapped_column(JSONB)

    # Agent roles required by this mission (e.g. ["content_agent", "ads_agent"]).
    assigned_agent_roles: Mapped[list[str] | None] = mapped_column(ARRAY(String(100)))

    # ── Priority & confidence ─────────────────────────────────────────────
    # critical | high | medium | low
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="high")
    # 0.0–1.0: how confident the StrategistAgent is about this mission's value.
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.8)

    # ── Status lifecycle ──────────────────────────────────────────────────
    # proposed → approved → in_flight → completed
    #                     ↘ rejected
    #          → cancelled (operator aborts before approval)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="proposed", index=True
    )

    # ── Timestamps for each status transition ────────────────────────────
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[str | None] = mapped_column(String(255))   # user_id or "auto"
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected_reason: Mapped[str | None] = mapped_column(Text)

    # ── Post-completion analytics ─────────────────────────────────────────
    # Filled by the post-mission analysis job after completion.
    # {total_nodes, completed_nodes, failed_nodes, approval_rate, duration_hours}
    performance_summary: Mapped[dict | None] = mapped_column(JSONB)

    # ── Relationships ─────────────────────────────────────────────────────
    task_nodes: Mapped[list[MissionTaskNode]] = relationship(
        back_populates="mission",
        cascade="all, delete-orphan",
        order_by="MissionTaskNode.phase_index, MissionTaskNode.created_at",
    )


class MissionTaskNode(BaseModel):
    """
    A single executable node in a mission's task graph.

    Each node maps to exactly one engine.execute() call.
    Nodes are connected by the depends_on field: a node is "ready" when
    all node_keys listed in depends_on have status == "completed".

    node_key is a short human-readable identifier unique within the mission
    (e.g. "content_strategy", "post_ideation", "reel_calendar").
    The TaskGraphExecutor uses node_key — not UUID — for dependency resolution
    so that StrategistAgent-generated graphs are human-readable.
    """

    __tablename__ = "mission_task_nodes"

    mission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("missions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Node identity ─────────────────────────────────────────────────────
    # Short key, unique within the mission. Used in depends_on references.
    # e.g. "content_strategy", "post_ideation_1", "reel_calendar"
    node_key: Mapped[str] = mapped_column(String(100), nullable=False)

    # Display ordering within phases (0-indexed).
    phase_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Human-readable label shown in the Mission Hub UI.
    title: Mapped[str] = mapped_column(String(500), nullable=False)

    # ── Execution config ──────────────────────────────────────────────────
    task_type: Mapped[str] = mapped_column(String(100), nullable=False)
    agent_role: Mapped[str] = mapped_column(String(100), nullable=False)

    # Input parameters forwarded to engine.execute() as input_data.
    # The executor merges mission.creative_brief into input_data["brief"]
    # before calling execute(), so nodes don't need to duplicate the brief.
    input_data: Mapped[dict | None] = mapped_column(JSONB)

    # Node-specific brief (overrides mission creative_brief for this node only).
    # NULL means: use mission.creative_brief.
    brief_override: Mapped[str | None] = mapped_column(Text)

    # ── Dependency graph ──────────────────────────────────────────────────
    # Array of node_key strings that must be status="completed" before this
    # node is eligible to run.  [] or NULL = no dependencies (runs immediately).
    depends_on: Mapped[list[str] | None] = mapped_column(ARRAY(String(100)))

    # ── Execution status ──────────────────────────────────────────────────
    # pending → running → completed
    #                   ↘ failed → (retry or skipped)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pending", index=True
    )

    # ── Output ────────────────────────────────────────────────────────────
    # Nexus OutputArtifact ID (string UUID from .NET DB) when the node produces
    # a creatable artifact (content_ideation, ad_creative_generation, etc.).
    output_artifact_id: Mapped[str | None] = mapped_column(String(36))
    output_summary: Mapped[str | None] = mapped_column(Text)

    # ── Execution tracking ────────────────────────────────────────────────
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[str | None] = mapped_column(Text)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # ── Relationships ─────────────────────────────────────────────────────
    mission: Mapped[Mission] = relationship(back_populates="task_nodes")
