from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import OrmBase


class AgentAllocationCreate(BaseModel):
    agent_role: str
    is_enabled: bool = True
    daily_execution_limit: int = 50
    config_json: str | None = None


class PackageCreate(BaseModel):
    name: str
    slug: str
    description: str | None = None
    is_default: bool = False
    max_workspaces: int = 1
    monthly_task_limit: int = 100
    agent_allocations: list[AgentAllocationCreate] = []


class PackageUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    max_workspaces: int | None = None
    monthly_task_limit: int | None = None
    is_active: bool | None = None


class AgentAllocationRead(OrmBase):
    id: uuid.UUID
    agent_role: str
    is_enabled: bool
    daily_execution_limit: int


class PackageRead(OrmBase):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    is_default: bool
    max_workspaces: int
    monthly_task_limit: int
    is_active: bool
    created_at: datetime
    agent_allocations: list[AgentAllocationRead] = []
