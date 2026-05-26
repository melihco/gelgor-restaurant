"""
Task, Suggestion, Approval, and ActionLog models.

Task: a unit of work executed by a CrewAI crew. Tracks status, agent role,
input/output, and links to the workspace that requested it.

Suggestion: the structured output of an agent's work. For example, a
Review Agent produces a Suggestion containing a draft response to a
Google review. Suggestions go through an approval flow before becoming actions.

Approval: a human decision on a suggestion (approve / reject / revise).

ActionLog: immutable audit trail of all agent actions and state transitions.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, Integer, Float, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel
from app.models.workspace import Workspace


class Task(BaseModel):
    __tablename__ = "tasks"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    agent_role: Mapped[str] = mapped_column(String(100), nullable=False)
    crew_name: Mapped[str] = mapped_column(String(100), nullable=False)
    task_type: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        String(50), default="pending", nullable=False, index=True
    )
    priority: Mapped[str] = mapped_column(String(20), default="normal")
    input_json: Mapped[str | None] = mapped_column(Text)
    output_json: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    execution_time_ms: Mapped[int | None] = mapped_column(Integer)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, default=3)

    workspace: Mapped[Workspace] = relationship(back_populates="tasks")
    suggestions: Mapped[list[Suggestion]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )
    action_logs: Mapped[list[ActionLog]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )


class Suggestion(BaseModel):
    """
    Structured output from an agent execution.
    content_json holds the agent's recommendation in a structured format
    specific to the suggestion_type (e.g., review_response, content_idea, ad_recommendation).
    """

    __tablename__ = "suggestions"

    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    agent_role: Mapped[str] = mapped_column(String(100), nullable=False)
    suggestion_type: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    content_json: Mapped[str | None] = mapped_column(Text)
    confidence_score: Mapped[float | None] = mapped_column(Float)
    urgency: Mapped[str] = mapped_column(String(20), default="normal")
    status: Mapped[str] = mapped_column(String(50), default="pending", index=True)

    task: Mapped[Task] = relationship(back_populates="suggestions")
    approval: Mapped[Approval | None] = relationship(
        back_populates="suggestion", uselist=False
    )


class Approval(BaseModel):
    __tablename__ = "approvals"

    suggestion_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("suggestions.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    decision: Mapped[str] = mapped_column(String(20), nullable=False)
    reviewer_note: Mapped[str | None] = mapped_column(Text)
    # Structured rejection taxonomy — NULL for approvals or when code not provided.
    # Populated when decision == "rejected" and caller supplies a RejectionReason code.
    # Values mirror RejectionReason enum in tenant_learning_service.py.
    rejection_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    reviewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    suggestion: Mapped[Suggestion] = relationship(back_populates="approval")


class ActionLog(BaseModel):
    __tablename__ = "action_logs"

    task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), index=True
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    agent_role: Mapped[str] = mapped_column(String(100), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    details_json: Mapped[str | None] = mapped_column(Text)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    task: Mapped[Task | None] = relationship(back_populates="action_logs")
