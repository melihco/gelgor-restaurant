from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import OrmBase


class WorkspaceCreate(BaseModel):
    name: str
    slug: str
    package_id: uuid.UUID | None = None


class WorkspaceUpdate(BaseModel):
    name: str | None = None
    package_id: uuid.UUID | None = None
    is_active: bool | None = None


class WorkspaceRead(OrmBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    package_id: uuid.UUID | None
    name: str
    slug: str
    is_active: bool
    created_at: datetime


class WorkspaceDetail(WorkspaceRead):
    brand_context: BrandContextSummary | None = None
    agent_count: int = 0
    integration_count: int = 0


class BrandContextSummary(OrmBase):
    business_name: str
    business_type: str
    brand_tone: str | None
    location: str | None
