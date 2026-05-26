from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class OrmBase(BaseModel):
    model_config = {"from_attributes": True}


class IdTimestamp(OrmBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class StatusResponse(BaseModel):
    success: bool
    message: str


class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    page_size: int
