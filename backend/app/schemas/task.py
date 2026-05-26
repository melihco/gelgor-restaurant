from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import OrmBase


class TaskRead(OrmBase):
    id: uuid.UUID
    workspace_id: uuid.UUID
    agent_role: str
    crew_name: str
    task_type: str
    title: str
    description: str | None
    status: str
    priority: str
    tokens_used: int
    execution_time_ms: int | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime


class TaskDetail(TaskRead):
    input_json: str | None
    output_json: str | None
    error_message: str | None
    retry_count: int
    suggestions: list[SuggestionRead] = []


class SuggestionRead(OrmBase):
    id: uuid.UUID
    task_id: uuid.UUID
    agent_role: str
    suggestion_type: str
    title: str
    summary: str | None
    content_json: str | None
    confidence_score: float | None
    urgency: str
    status: str
    created_at: datetime


class ApprovalCreate(BaseModel):
    decision: str  # approved, rejected, revision_requested
    reviewer_note: str | None = None
    # Structured rejection reason — only relevant when decision == "rejected".
    # Must be a valid RejectionReason enum value (see tenant_learning_service.py).
    # Omit or pass null for approvals.
    rejection_code: str | None = None


class ApprovalRead(OrmBase):
    id: uuid.UUID
    suggestion_id: uuid.UUID
    decision: str
    reviewer_note: str | None
    rejection_code: str | None
    reviewed_at: datetime
