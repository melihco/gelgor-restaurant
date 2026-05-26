"""
Agent configuration models.

AgentDefinition: global, reusable definition of an agent role. Lives at the
system level—not tied to a specific tenant. Contains the CrewAI agent role key,
default prompts, capability descriptions.

AgentInstance: a workspace-level activation of an AgentDefinition. Created when
a workspace's package includes that agent role. Holds workspace-specific overrides
(custom prompts, enabled/disabled state, runtime stats).

This separation lets us ship new agent types centrally and let each workspace
customize behavior without modifying the shared definition.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Boolean, Text, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel

if TYPE_CHECKING:
    from app.models.workspace import Workspace


class AgentDefinition(BaseModel):
    """
    System-level agent blueprint.
    role_key must match the key used in CrewAI orchestration layer
    (e.g. 'review_agent', 'content_agent', 'ads_agent').
    """

    __tablename__ = "agent_definitions"

    role_key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    avatar_url: Mapped[str | None] = mapped_column(String(512))
    default_system_prompt: Mapped[str | None] = mapped_column(Text)
    capabilities_json: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(50), default="general")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class AgentInstance(BaseModel):
    """
    Workspace-level agent activation.
    When a workspace's package includes 'review_agent', an AgentInstance
    is created pointing to the AgentDefinition with role_key='review_agent'.
    """

    __tablename__ = "agent_instances"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    definition_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_definitions.id", ondelete="CASCADE"), nullable=False
    )
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    custom_system_prompt: Mapped[str | None] = mapped_column(Text)
    config_overrides_json: Mapped[str | None] = mapped_column(Text)
    total_executions: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens_used: Mapped[int] = mapped_column(Integer, default=0)

    workspace: Mapped[Workspace] = relationship(back_populates="agent_instances")
    definition: Mapped[AgentDefinition] = relationship()
