"""
Tenant model – the top-level customer entity.

Each agency customer gets one Tenant. A tenant owns workspaces,
packages, agents, and all downstream data. This is the root of
multi-tenancy isolation.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel

if TYPE_CHECKING:
    from app.models.workspace import Workspace
    from app.models.package import Package


class Tenant(BaseModel):
    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    contact_email: Mapped[str] = mapped_column(String(255), nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(512))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    settings_json: Mapped[str | None] = mapped_column(Text)

    workspaces: Mapped[list[Workspace]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    packages: Mapped[list[Package]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
