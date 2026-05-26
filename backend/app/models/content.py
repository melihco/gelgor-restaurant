"""
Content asset and prompt profile models.

ContentAsset: generated or curated content pieces (captions, images,
ad copy, response drafts) linked to a workspace and optionally a task.

PromptProfile: workspace-level prompt customization templates.
Allows per-brand tuning of how agents generate content without
modifying the underlying agent definitions.
"""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String, Text, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel


class ContentAsset(BaseModel):
    __tablename__ = "content_assets"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL")
    )
    asset_type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[str | None] = mapped_column(Text)
    file_url: Mapped[str | None] = mapped_column(String(512))
    metadata_json: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="draft")


class PromptProfile(BaseModel):
    __tablename__ = "prompt_profiles"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    agent_role: Mapped[str] = mapped_column(String(100), nullable=False)
    profile_name: Mapped[str] = mapped_column(String(255), nullable=False)
    system_prompt_override: Mapped[str | None] = mapped_column(Text)
    style_instructions: Mapped[str | None] = mapped_column(Text)
    forbidden_phrases: Mapped[str | None] = mapped_column(Text)
    required_elements: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
