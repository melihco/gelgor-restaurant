"""
Refresh Instagram captions + LLM voice intelligence into brand_contexts.

Onboarding `analyze_brand` already populates these fields once. This service
is the recurring / on-demand path so caption voice does not go stale.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.brand_context import BrandContext
from app.services.brand_context_service import get_brand_context
from app.services.tenant_hygiene import is_stub_business_name

logger = structlog.get_logger(__name__)


def _parse_refreshed_at(intel: Any) -> datetime | None:
    if not isinstance(intel, dict):
        return None
    raw = intel.get("refreshed_at") or intel.get("analyzed_at")
    if not raw:
        return None
    try:
        s = str(raw).strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s.replace(" ", "T"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


async def refresh_instagram_intelligence(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    force: bool = False,
    min_age_hours: int = 144,
) -> dict[str, Any]:
    """
    Scrape the brand IG handle and persist recent captions + voice analysis.

    Returns a status dict for API/scheduler logging.
    """
    settings = get_settings()
    if not settings.apify_api_key:
        return {"ok": False, "reason": "apify_missing"}
    if not settings.openai_api_key:
        return {"ok": False, "reason": "openai_missing"}

    ctx = await get_brand_context(db, workspace_id)
    if not ctx:
        return {"ok": False, "reason": "no_brand"}

    handle = (ctx.instagram_handle or "").strip().lstrip("@")
    if not handle:
        return {"ok": False, "reason": "no_handle"}

    if is_stub_business_name(ctx.business_name):
        return {"ok": False, "reason": "stub_brand"}

    if not force:
        age_at = _parse_refreshed_at(ctx.instagram_intelligence)
        if age_at:
            age_h = (datetime.now(timezone.utc) - age_at).total_seconds() / 3600
            if age_h < min_age_hours:
                return {
                    "ok": True,
                    "skipped": True,
                    "reason": "fresh",
                    "age_hours": round(age_h, 1),
                }

    from app.crew.apify_scraper import fetch_instagram_apify
    from app.crew.brand_analyzer import _analyze_instagram_captions_llm

    ig = await fetch_instagram_apify(handle, settings.apify_api_key, timeout=90)
    captions = [c for c in (ig.get("recent_captions") or []) if isinstance(c, str) and c.strip()]
    if not captions:
        logger.warning(
            "instagram_intelligence_refresh_empty",
            workspace_id=str(workspace_id),
            handle=handle,
            fetch_ok=bool(ig.get("raw_fetch_ok")),
        )
        return {"ok": False, "reason": "no_captions", "handle": handle}

    intelligence = await _analyze_instagram_captions_llm(
        captions=captions,
        posts_detail=ig.get("posts_detail") or [],
        engagement_stats=ig.get("engagement_stats") or {},
        brand_name=ctx.business_name or ig.get("full_name") or handle,
        openai_api_key=settings.openai_api_key,
    )
    if not isinstance(intelligence, dict):
        intelligence = {}
    now_iso = datetime.now(timezone.utc).isoformat()
    intelligence["refreshed_at"] = now_iso
    intelligence["source"] = "instagram_intelligence_refresh"
    intelligence["handle"] = handle

    ctx.instagram_recent_captions = json.dumps(captions, ensure_ascii=False)
    ctx.instagram_intelligence = intelligence

    # Keep lightweight profile mirrors fresh when Apify returns them.
    if ig.get("bio"):
        ctx.instagram_bio = str(ig["bio"])[:2000]
    if ig.get("follower_count") is not None:
        try:
            ctx.instagram_followers = int(ig["follower_count"])
        except (TypeError, ValueError):
            pass
    if ig.get("following_count") is not None:
        try:
            ctx.instagram_following = int(ig["following_count"])
        except (TypeError, ValueError):
            pass
    if ig.get("post_count") is not None:
        try:
            ctx.instagram_posts_count = int(ig["post_count"])
        except (TypeError, ValueError):
            pass
    if ig.get("profile_pic_url"):
        ctx.instagram_profile_pic_url = str(ig["profile_pic_url"])[:2000]
    tags = ig.get("top_hashtags") or []
    if tags:
        ctx.instagram_top_hashtags = json.dumps(tags, ensure_ascii=False)

    # Soft-upgrade brand_tone when voice analysis is confident and tone is generic.
    voice = intelligence.get("brand_voice") if isinstance(intelligence.get("brand_voice"), dict) else {}
    primary_tone = str((voice or {}).get("primary_tone") or "").strip()
    current_tone = (ctx.brand_tone or "").strip().lower()
    generic_tones = {
        "",
        "professional",
        "samimi, sıcak, güvenilir",
        "inviting, vibrant, fresh, relaxed",
    }
    if primary_tone and current_tone in generic_tones:
        ctx.brand_tone = primary_tone

    db.add(ctx)
    await db.commit()

    logger.info(
        "instagram_intelligence_refreshed",
        workspace_id=str(workspace_id),
        handle=handle,
        captions=len(captions),
        themes=len(intelligence.get("content_themes") or []),
    )
    return {
        "ok": True,
        "skipped": False,
        "handle": handle,
        "captions": len(captions),
        "themes": len(intelligence.get("content_themes") or []),
        "refreshed_at": now_iso,
        "brand_voice": voice or None,
    }


async def list_workspaces_needing_instagram_refresh(
    db: AsyncSession,
    *,
    min_age_hours: int = 144,
) -> list[BrandContext]:
    """Active-ish brands with an IG handle that look stale or empty."""
    from sqlalchemy import select

    rows = await db.execute(
        select(BrandContext).where(
            BrandContext.instagram_handle.is_not(None),
            BrandContext.instagram_handle != "",
        )
    )
    out: list[BrandContext] = []
    now = datetime.now(timezone.utc)
    for ctx in rows.scalars().all():
        if is_stub_business_name(ctx.business_name):
            continue
        intel = ctx.instagram_intelligence
        if not isinstance(intel, dict) or not intel:
            out.append(ctx)
            continue
        age_at = _parse_refreshed_at(intel)
        if age_at is None:
            out.append(ctx)
            continue
        age_h = (now - age_at).total_seconds() / 3600
        if age_h >= min_age_hours:
            out.append(ctx)
    return out
