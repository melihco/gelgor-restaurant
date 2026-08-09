"""Refresh Google Business rating + review signals into brand_contexts."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.services.brand_context_service import get_brand_context

logger = structlog.get_logger(__name__)


async def refresh_google_business_signals(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    force: bool = False,
) -> dict[str, Any]:
    settings = get_settings()
    if not settings.apify_api_key:
        return {"ok": False, "reason": "apify_missing"}

    ctx = await get_brand_context(db, workspace_id)
    if not ctx:
        return {"ok": False, "reason": "no_brand"}

    query = (ctx.google_business_url or "").strip()
    if not query:
        # Fall back to name + location for maps search
        name = (ctx.business_name or "").strip()
        loc = (ctx.location or "").strip()
        if name and loc:
            query = f"{name} {loc}"
        elif name:
            query = name
    if not query:
        return {"ok": False, "reason": "no_google_query"}

    existing_signals = getattr(ctx, "google_review_signals", None)
    if existing_signals and not force:
        try:
            parsed = json.loads(existing_signals) if isinstance(existing_signals, str) else existing_signals
            if isinstance(parsed, list) and len(parsed) >= 3:
                return {"ok": True, "skipped": True, "reason": "signals_present", "count": len(parsed)}
        except Exception:
            pass

    from app.crew.apify_scraper import fetch_google_business_apify

    data = await fetch_google_business_apify(
        query, settings.apify_api_key, timeout=settings.apify_timeout_seconds,
    )
    if not data.get("raw_fetch_ok"):
        return {"ok": False, "reason": "fetch_failed", "query": query}

    if data.get("rating") is not None:
        ctx.google_rating = str(data["rating"])
    if data.get("review_count") is not None:
        try:
            ctx.google_review_count = int(data["review_count"])
        except (TypeError, ValueError):
            pass

    reviews = data.get("reviews") or []
    if reviews:
        ctx.google_review_signals = json.dumps(reviews[:20], ensure_ascii=False)

    # Stamp extended intel time so freshness audits can see the refresh
    ctx.extended_intelligence_updated_at = datetime.now(timezone.utc).isoformat()
    db.add(ctx)
    await db.commit()

    logger.info(
        "google_business_signals_refreshed",
        workspace_id=str(workspace_id),
        rating=ctx.google_rating,
        reviews=len(reviews),
    )
    return {
        "ok": True,
        "skipped": False,
        "rating": ctx.google_rating,
        "review_count": ctx.google_review_count,
        "reviews": len(reviews),
        "query": query,
    }
