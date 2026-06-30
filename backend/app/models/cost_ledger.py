"""Immutable AI cost line items — mission graph + feed artifacts."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Integer, SmallInteger, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class MissionCostLedger(Base):
    __tablename__ = "mission_cost_ledger"

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
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc),
    )
    usage_date: Mapped[date] = mapped_column(Date, nullable=False)

    category: Mapped[str] = mapped_column(String(64), nullable=False)
    source_system: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")
    source_ref: Mapped[str | None] = mapped_column(String(128))
    provider: Mapped[str | None] = mapped_column(String(32))
    model: Mapped[str | None] = mapped_column(String(64))

    amount_usd: Mapped[Decimal] = mapped_column(nullable=False)
    tokens_in: Mapped[int | None] = mapped_column(Integer)
    tokens_out: Mapped[int | None] = mapped_column(Integer)
    cached_tokens: Mapped[int | None] = mapped_column(Integer)

    idempotency_key: Mapped[str | None] = mapped_column(String(160), unique=True)
    extra: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class ArtifactCostLedger(Base):
    __tablename__ = "artifact_cost_ledger"

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
    artifact_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc),
    )
    usage_date: Mapped[date] = mapped_column(Date, nullable=False)

    category: Mapped[str] = mapped_column(String(64), nullable=False)
    call_type: Mapped[str | None] = mapped_column(String(64))
    source_system: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")
    provider: Mapped[str | None] = mapped_column(String(32))
    model: Mapped[str | None] = mapped_column(String(64))

    amount_usd: Mapped[Decimal] = mapped_column(nullable=False)
    slot_role: Mapped[str | None] = mapped_column(String(64))
    idea_index: Mapped[int | None] = mapped_column(Integer)
    pipeline: Mapped[str | None] = mapped_column(String(64))
    attempt: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)

    idempotency_key: Mapped[str | None] = mapped_column(String(160), unique=True)
    extra: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
