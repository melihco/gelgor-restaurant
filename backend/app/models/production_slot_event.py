"""Production-line lifecycle events — durable timing / status telemetry."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ProductionSlotEvent(Base):
    __tablename__ = "production_slot_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("production_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    mission_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    idea_index: Mapped[int | None] = mapped_column(Integer)
    slot_role: Mapped[str | None] = mapped_column(Text)
    slot_key: Mapped[str | None] = mapped_column(String(128))
    format: Mapped[str | None] = mapped_column(Text)
    pipeline: Mapped[str | None] = mapped_column(Text)

    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str | None] = mapped_column(String(32))
    attempt: Mapped[int | None] = mapped_column(Integer)
    queue_wait_ms: Mapped[int | None] = mapped_column(Integer)
    duration_ms: Mapped[int | None] = mapped_column(Integer)

    provider: Mapped[str | None] = mapped_column(String(64))
    model: Mapped[str | None] = mapped_column(String(96))
    artifact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    error_code: Mapped[str | None] = mapped_column(String(96))
    error_message: Mapped[str | None] = mapped_column(Text)

    source_system: Mapped[str] = mapped_column(String(32), nullable=False, default="factory")
    worker_id: Mapped[str | None] = mapped_column(Text)
    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
