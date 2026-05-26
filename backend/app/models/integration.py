"""
Integration connection model.

Stores per-workspace credentials and configuration for external services
(Google Business, Instagram/Meta, Google Ads, etc.).

Credentials are stored encrypted in production. The provider field maps
to the integration adapter used by CrewAI tools.
"""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel
from app.models.workspace import Workspace


class IntegrationConnection(BaseModel):
    __tablename__ = "integration_connections"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    credentials_json: Mapped[str | None] = mapped_column(Text)
    config_json: Mapped[str | None] = mapped_column(Text)
    last_sync_at: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(50), default="pending")

    workspace: Mapped[Workspace] = relationship(back_populates="integrations")
