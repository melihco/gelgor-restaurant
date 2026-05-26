from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import OrmBase


class AgentDefinitionRead(OrmBase):
    id: uuid.UUID
    role_key: str
    display_name: str
    description: str | None
    avatar_url: str | None
    category: str
    is_active: bool


class AgentInstanceRead(OrmBase):
    id: uuid.UUID
    workspace_id: uuid.UUID
    definition_id: uuid.UUID
    is_enabled: bool
    total_executions: int
    total_tokens_used: int
    created_at: datetime

    definition: AgentDefinitionRead | None = None


class AgentExecutionRequest(BaseModel):
    """Request to trigger an agent execution for a workspace."""
    workspace_id: uuid.UUID
    agent_role: str
    task_type: str
    input_data: dict | None = None
    priority: str = "normal"


class AgentExecutionResponse(BaseModel):
    task_id: uuid.UUID
    status: str
    message: str
