"""
Workspace model – represents a single brand/business within a tenant.

A digital agency may manage multiple clients. Each client's brand is
a Workspace with its own brand context, integrations, and agent instances.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel

if TYPE_CHECKING:
    from app.models.tenant import Tenant
    from app.models.brand_context import BrandContext
    from app.models.agent_config import AgentInstance
    from app.models.integration import IntegrationConnection
    from app.models.task import Task


class Workspace(BaseModel):
    __tablename__ = "workspaces"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    package_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("packages.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    settings_json: Mapped[str | None] = mapped_column(Text)

    tenant: Mapped[Tenant] = relationship(back_populates="workspaces")
    brand_context: Mapped[BrandContext | None] = relationship(
        back_populates="workspace", uselist=False, cascade="all, delete-orphan"
    )
    agent_instances: Mapped[list[AgentInstance]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan"
    )
    integrations: Mapped[list[IntegrationConnection]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan"
    )
    tasks: Mapped[list[Task]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan"
    )
