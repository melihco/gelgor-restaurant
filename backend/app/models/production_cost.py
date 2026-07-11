"""Production cost SSOT — atomic events + mission/slot rollups for admin analytics."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Integer, SmallInteger, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CostEvent(Base):
    __tablename__ = "cost_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    mission_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("missions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    artifact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc),
    )
    usage_date: Mapped[date] = mapped_column(Date, nullable=False)

    scope: Mapped[str] = mapped_column(String(32), nullable=False, default="other")
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    call_type: Mapped[str | None] = mapped_column(String(64))

    slot_key: Mapped[str | None] = mapped_column(String(96))
    idea_index: Mapped[int | None] = mapped_column(Integer)
    slot_role: Mapped[str | None] = mapped_column(String(64))
    pipeline: Mapped[str | None] = mapped_column(String(64))
    attempt: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)

    source_system: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")
    source_ref: Mapped[str | None] = mapped_column(String(128))
    provider: Mapped[str | None] = mapped_column(String(32))
    model: Mapped[str | None] = mapped_column(String(64))
    pricing_basis: Mapped[str] = mapped_column(String(32), nullable=False, default="catalog_estimate")
    amount_usd: Mapped[Decimal] = mapped_column(nullable=False)
    tokens_in: Mapped[int | None] = mapped_column(Integer)
    tokens_out: Mapped[int | None] = mapped_column(Integer)
    cached_tokens: Mapped[int | None] = mapped_column(Integer)
    external_request_id: Mapped[str | None] = mapped_column(String(128))

    idempotency_key: Mapped[str | None] = mapped_column(String(192), unique=True)
    extra: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class MissionSlotCostRollup(Base):
    __tablename__ = "mission_slot_cost_rollups"
    __table_args__ = (
        UniqueConstraint("mission_id", "slot_key", name="uq_mission_slot_cost_rollups_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    mission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("missions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    slot_key: Mapped[str] = mapped_column(String(96), nullable=False)
    idea_index: Mapped[int | None] = mapped_column(Integer)
    slot_role: Mapped[str | None] = mapped_column(String(64))
    pipeline: Mapped[str | None] = mapped_column(String(64))
    artifact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))

    total_usd: Mapped[Decimal] = mapped_column(nullable=False, default=Decimal("0"))
    measured_usd: Mapped[Decimal] = mapped_column(nullable=False, default=Decimal("0"))
    estimated_usd: Mapped[Decimal] = mapped_column(nullable=False, default=Decimal("0"))
    line_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    by_category: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    by_call_type: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    status: Mapped[str] = mapped_column(String(24), nullable=False, default="in_progress")
    first_recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc),
    )


class MissionCostRollup(Base):
    __tablename__ = "mission_cost_rollups"
    __table_args__ = (
        UniqueConstraint("mission_id", name="uq_mission_cost_rollups_mission"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    mission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("missions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    mission_graph_usd: Mapped[Decimal] = mapped_column(nullable=False, default=Decimal("0"))
    feed_slot_usd: Mapped[Decimal] = mapped_column(nullable=False, default=Decimal("0"))
    integration_usd: Mapped[Decimal] = mapped_column(nullable=False, default=Decimal("0"))
    gallery_usd: Mapped[Decimal] = mapped_column(nullable=False, default=Decimal("0"))
    other_usd: Mapped[Decimal] = mapped_column(nullable=False, default=Decimal("0"))
    total_usd: Mapped[Decimal] = mapped_column(nullable=False, default=Decimal("0"))

    measured_usd: Mapped[Decimal] = mapped_column(nullable=False, default=Decimal("0"))
    estimated_usd: Mapped[Decimal] = mapped_column(nullable=False, default=Decimal("0"))
    event_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    slot_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    graph_by_category: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    feed_by_category: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    by_provider: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    first_recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc),
    )
