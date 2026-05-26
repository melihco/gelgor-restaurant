"""Daily API usage / cost aggregates per workspace."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Integer, Numeric, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class WorkspaceUsageDaily(Base, TimestampMixin):
    __tablename__ = "workspace_usage_daily"
    __table_args__ = (
        UniqueConstraint("workspace_id", "usage_date", name="uq_workspace_usage_daily_ws_date"),
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
    usage_date: Mapped[date] = mapped_column(Date, nullable=False)
    cost_usd: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False, default=Decimal("0"))
    artifact_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    mission_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    breakdown: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
