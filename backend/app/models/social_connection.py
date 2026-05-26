"""
SocialConnection — stores OAuth tokens for tenant social media accounts.

Currently supports: meta (Instagram Business / Facebook Page)
Designed for: tiktok, linkedin, twitter/x (future)
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel


class SocialConnection(BaseModel):
    __tablename__ = "social_connections"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    platform: Mapped[str] = mapped_column(String(32), nullable=False)  # 'meta'

    # Meta / Instagram Business fields
    ig_user_id: Mapped[str | None] = mapped_column(String(64))
    ig_username: Mapped[str | None] = mapped_column(String(128))
    page_id: Mapped[str | None] = mapped_column(String(64))
    page_name: Mapped[str | None] = mapped_column(String(255))

    # Tokens
    access_token: Mapped[str | None] = mapped_column(Text)
    token_type: Mapped[str | None] = mapped_column(String(32))
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Cached stats (refreshed daily)
    followers_count: Mapped[int | None] = mapped_column()
    media_count: Mapped[int | None] = mapped_column()
    cached_insights: Mapped[str | None] = mapped_column(Text)  # JSON
    insights_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Meta Ads fields
    ad_account_id: Mapped[str | None] = mapped_column(String(64))
    ad_account_name: Mapped[str | None] = mapped_column(String(255))

    is_active: Mapped[bool] = mapped_column(default=True)
