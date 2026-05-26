from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import Numeric, String, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel


class MetaAdCampaign(BaseModel):
    __tablename__ = "meta_ad_campaigns"

    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    artifact_id: Mapped[str | None] = mapped_column(String(64))
    campaign_id: Mapped[str] = mapped_column(String(64), nullable=False)
    adset_id: Mapped[str | None] = mapped_column(String(64))
    ad_id: Mapped[str | None] = mapped_column(String(64))
    ad_creative_id: Mapped[str | None] = mapped_column(String(64))
    objective: Mapped[str | None] = mapped_column(String(64))
    budget_tl: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    duration_days: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32), default="PAUSED")
    estimated_reach: Mapped[int | None] = mapped_column(Integer)
    actual_reach: Mapped[int | None] = mapped_column(Integer)
    spend_tl: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"))
    impressions: Mapped[int] = mapped_column(Integer, default=0)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
