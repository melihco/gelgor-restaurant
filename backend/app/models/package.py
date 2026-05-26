"""
Package model – drives the package-based agent activation system.

Each package defines which agent roles are available at that tier.
Workspaces are assigned a package, which determines which agents are
instantiated and active for that brand.

The PackageAgentAllocation table maps package → agent role with
per-allocation configuration (e.g., execution limits, feature flags).
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Boolean, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel

if TYPE_CHECKING:
    from app.models.tenant import Tenant


class Package(BaseModel):
    __tablename__ = "packages"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    max_workspaces: Mapped[int] = mapped_column(Integer, default=1)
    monthly_task_limit: Mapped[int] = mapped_column(Integer, default=100)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    tenant: Mapped[Tenant] = relationship(back_populates="packages")
    agent_allocations: Mapped[list[PackageAgentAllocation]] = relationship(
        back_populates="package", cascade="all, delete-orphan"
    )


class PackageAgentAllocation(BaseModel):
    """
    Links a package to an agent role with tier-specific settings.
    agent_role is a string key (e.g. 'review_agent', 'content_agent')
    that maps to a CrewAI agent definition in the orchestration layer.
    """

    __tablename__ = "package_agent_allocations"

    package_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("packages.id", ondelete="CASCADE"), nullable=False
    )
    agent_role: Mapped[str] = mapped_column(String(100), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    daily_execution_limit: Mapped[int] = mapped_column(Integer, default=50)
    config_json: Mapped[str | None] = mapped_column(Text)

    package: Mapped[Package] = relationship(back_populates="agent_allocations")
