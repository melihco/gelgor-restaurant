"""
Production slot catalog ORM models.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseModel, TimestampMixin


class CatalogBase(Base, TimestampMixin):
    """Catalog tables with string primary keys + timestamps."""

    __abstract__ = True


class CanonicalSector(CatalogBase):
    __tablename__ = "canonical_sectors"

    sector_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    label_tr: Mapped[str] = mapped_column(String(120), nullable=False)
    label_en: Mapped[str] = mapped_column(String(120), nullable=False)
    aliases: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ProductionSlotDefinition(CatalogBase):
    __tablename__ = "production_slot_definitions"

    slot_key: Mapped[str] = mapped_column(String(128), primary_key=True)
    sector_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("canonical_sectors.sector_id", ondelete="RESTRICT"),
        nullable=False,
    )
    label_tr: Mapped[str] = mapped_column(String(160), nullable=False)
    label_en: Mapped[str] = mapped_column(String(160), nullable=False)
    format: Mapped[str] = mapped_column(String(24), nullable=False)
    pipeline: Mapped[str] = mapped_column(String(48), nullable=False)
    slot_role: Mapped[str] = mapped_column(String(64), nullable=False)
    design_template_type: Mapped[str] = mapped_column(String(48), nullable=False)
    library_slot_key: Mapped[str | None] = mapped_column(String(48))
    tier: Mapped[str] = mapped_column(String(24), nullable=False, default="standard")
    match_signals: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    prompt_pack: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    optional_tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    enabled_by_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")


class TenantSlotAssignment(BaseModel):
    __tablename__ = "tenant_slot_assignments"
    __table_args__ = (
        UniqueConstraint("workspace_id", "slot_key", name="uq_tenant_slot_assignments_workspace_slot"),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    slot_key: Mapped[str] = mapped_column(
        String(128),
        ForeignKey("production_slot_definitions.slot_key", ondelete="CASCADE"),
        nullable=False,
    )
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    assignment_source: Mapped[str] = mapped_column(String(32), nullable=False, default="auto_default")
    notes: Mapped[str | None] = mapped_column(Text)
