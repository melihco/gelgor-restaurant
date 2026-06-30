"""Schemas for brand scheduled templates (recurring story/reel gallery)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ScheduledMediaItem(BaseModel):
    url: str
    key: str | None = None
    type: Literal["image", "video"] = "image"
    thumbnail_url: str | None = None
    duration_ms: int | None = None
    uploaded_at: str | None = None


class ScheduledTemplateCreate(BaseModel):
    slot_index: int = Field(ge=1, le=10)
    name: str = Field(max_length=120)
    description: str | None = None
    format: Literal["story", "reel"] = "story"
    media_items: list[ScheduledMediaItem] = []
    schedule_type: Literal["daily", "specific_days"] = "daily"
    schedule_days: list[int] = Field(default=[0, 1, 2, 3, 4, 5, 6])
    schedule_time: str = "10:00"
    schedule_end_time: str | None = None
    timezone: str = "Europe/Istanbul"
    category: str | None = None


class ScheduledTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    format: Literal["story", "reel"] | None = None
    media_items: list[ScheduledMediaItem] | None = None
    schedule_type: Literal["daily", "specific_days"] | None = None
    schedule_days: list[int] | None = None
    schedule_time: str | None = None
    schedule_end_time: str | None = None
    timezone: str | None = None
    status: Literal["active", "paused", "archived"] | None = None
    category: str | None = None


class ScheduledTemplateRead(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    slot_index: int
    name: str
    description: str | None
    format: str
    media_items: list[ScheduledMediaItem]
    schedule_type: str
    schedule_days: list[int]
    schedule_time: str
    schedule_end_time: str | None
    timezone: str
    status: str
    category: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ScheduledTemplateFeedItem(BaseModel):
    """Lightweight representation for mobile feed rendering."""
    template_id: uuid.UUID
    name: str
    format: str
    media_items: list[ScheduledMediaItem]
    schedule_time: str
    schedule_end_time: str | None
    is_active_now: bool
    next_activation: str | None = None
    category: str | None = None
