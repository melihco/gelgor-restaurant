"""
Meta Ads Service — Campaign creation, boosting, and insights via Meta Graph API.

Flow:
  boost_post() → Campaign → AdSet → AdCreative → Ad (all PAUSED)
  activate_campaign() → set all to ACTIVE → real spend begins

PAUSED başlar, kullanıcı "Aktive Et" diyene kadar para harcanmaz.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import httpx
import structlog
from fastapi import HTTPException

logger = structlog.get_logger()

GRAPH_BASE = "https://graph.facebook.com/v19.0"
_DEFAULT_TIMEOUT = 30.0

# Optimization goal per objective
_OBJECTIVE_OPT: dict[str, str] = {
    "OUTCOME_AWARENESS": "REACH",
    "OUTCOME_ENGAGEMENT": "POST_ENGAGEMENT",
    "OUTCOME_TRAFFIC": "LINK_CLICKS",
}
_OBJECTIVE_BILLING: dict[str, str] = {
    "OUTCOME_AWARENESS": "IMPRESSIONS",
    "OUTCOME_ENGAGEMENT": "IMPRESSIONS",
    "OUTCOME_TRAFFIC": "LINK_CLICKS",
}


def _get_usd_try_rate() -> float:
    try:
        return float(os.environ.get("META_USD_TRY_RATE", "32.0"))
    except ValueError:
        return 32.0


def _tl_to_usd_cents_daily(budget_tl: float, duration_days: int) -> int:
    """Convert total TL budget → daily USD cents for Meta API."""
    rate = _get_usd_try_rate()
    total_usd = Decimal(str(budget_tl)) / Decimal(str(rate))
    daily_usd = total_usd / Decimal(str(max(duration_days, 1)))
    # Meta minimum daily budget: $1.00 = 100 cents
    daily_cents = max(int(daily_usd * 100), 100)
    return daily_cents


async def fetch_ad_accounts(access_token: str) -> list[dict[str, Any]]:
    """
    Fetch all ad accounts accessible with this token.
    GET /me/adaccounts?fields=id,name,account_status,currency,timezone_name
    """
    if not access_token:
        raise HTTPException(status_code=404, detail="Meta hesabı bağlı değil")

    async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
        r = await client.get(
            f"{GRAPH_BASE}/me/adaccounts",
            params={
                "fields": "id,name,account_status,currency,timezone_name",
                "access_token": access_token,
            },
        )

    if not r.is_success:
        err = r.json().get("error", {})
        logger.warning("meta_ads_fetch_accounts_failed", status=r.status_code, error=err)
        raise HTTPException(
            status_code=r.status_code,
            detail=f"Meta reklam hesapları alınamadı: {err.get('message', r.text[:100])}",
        )

    data = r.json().get("data", [])
    return [
        {
            "id": acc["id"],
            "name": acc.get("name", ""),
            "currency": acc.get("currency", "TRY"),
            "status": acc.get("account_status", 1),
            "timezone": acc.get("timezone_name", ""),
        }
        for acc in data
        if acc.get("account_status") == 1  # 1 = ACTIVE
    ]


async def boost_post(
    access_token: str,
    ad_account_id: str,
    ig_media_id: str | None,
    ig_user_id: str,
    page_id: str,
    caption: str,
    objective: str,
    budget_amount_tl: float,
    duration_days: int,
    targeting: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Create a full Meta Ads campaign for an Instagram post/reel.
    All objects start PAUSED — activate_campaign() activates them.

    Returns: {campaign_id, adset_id, ad_creative_id, ad_id, status, estimated_reach}
    """
    if not access_token:
        raise HTTPException(status_code=404, detail="Meta hesabı bağlı değil")

    if not ad_account_id.startswith("act_"):
        ad_account_id = f"act_{ad_account_id}"

    now = datetime.now(timezone.utc)
    end_time = now + timedelta(days=duration_days)
    daily_budget_cents = _tl_to_usd_cents_daily(budget_amount_tl, duration_days)

    default_targeting: dict[str, Any] = {
        "age_min": 18,
        "age_max": 65,
        "geo_locations": {"countries": ["TR"]},
    }
    if targeting:
        default_targeting.update(targeting)

    opt_goal = _OBJECTIVE_OPT.get(objective, "REACH")
    billing_event = _OBJECTIVE_BILLING.get(objective, "IMPRESSIONS")
    campaign_name = f"SmartAgency Boost · {now.strftime('%Y-%m-%d %H:%M')}"

    async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:

        # ── 1. Create Campaign ────────────────────────────────────────────
        camp_r = await client.post(
            f"{GRAPH_BASE}/{ad_account_id}/campaigns",
            params={"access_token": access_token},
            json={
                "name": campaign_name,
                "objective": objective,
                "status": "PAUSED",
                "special_ad_categories": [],
            },
        )
        if not camp_r.is_success:
            err = camp_r.json().get("error", {})
            raise HTTPException(
                status_code=400,
                detail=f"Kampanya oluşturulamadı: {err.get('message', camp_r.text[:150])}",
            )
        campaign_id: str = camp_r.json()["id"]
        logger.info("meta_ads_campaign_created", campaign_id=campaign_id)

        # ── 2. Create AdSet ───────────────────────────────────────────────
        adset_payload: dict[str, Any] = {
            "name": f"{campaign_name} · AdSet",
            "campaign_id": campaign_id,
            "optimization_goal": opt_goal,
            "billing_event": billing_event,
            "daily_budget": str(daily_budget_cents),
            "start_time": now.isoformat(),
            "end_time": end_time.isoformat(),
            "targeting": default_targeting,
            "status": "PAUSED",
            "instagram_actor_id": ig_user_id,
        }
        adset_r = await client.post(
            f"{GRAPH_BASE}/{ad_account_id}/adsets",
            params={"access_token": access_token},
            json=adset_payload,
        )
        if not adset_r.is_success:
            err = adset_r.json().get("error", {})
            raise HTTPException(
                status_code=400,
                detail=f"AdSet oluşturulamadı: {err.get('message', adset_r.text[:150])}",
            )
        adset_id: str = adset_r.json()["id"]
        logger.info("meta_ads_adset_created", adset_id=adset_id)

        # ── 3. Create AdCreative ──────────────────────────────────────────
        if ig_media_id:
            # Promote existing published post
            creative_payload: dict[str, Any] = {
                "name": f"{campaign_name} · Creative",
                "object_story_spec": {
                    "instagram_actor_id": ig_user_id,
                    "link_data": {
                        "link": "https://www.instagram.com/",
                        "message": caption[:1000] if caption else "",
                    },
                },
                "effective_instagram_media_id": ig_media_id,
            }
        else:
            # No published post yet — use caption + page
            creative_payload = {
                "name": f"{campaign_name} · Creative",
                "object_story_spec": {
                    "page_id": page_id,
                    "link_data": {
                        "link": "https://www.instagram.com/",
                        "message": caption[:1000] if caption else "",
                    },
                },
            }

        creative_r = await client.post(
            f"{GRAPH_BASE}/{ad_account_id}/adcreatives",
            params={"access_token": access_token},
            json=creative_payload,
        )
        if not creative_r.is_success:
            err = creative_r.json().get("error", {})
            raise HTTPException(
                status_code=400,
                detail=f"Reklam içeriği oluşturulamadı: {err.get('message', creative_r.text[:150])}",
            )
        ad_creative_id: str = creative_r.json()["id"]
        logger.info("meta_ads_creative_created", creative_id=ad_creative_id)

        # ── 4. Create Ad ──────────────────────────────────────────────────
        ad_r = await client.post(
            f"{GRAPH_BASE}/{ad_account_id}/ads",
            params={"access_token": access_token},
            json={
                "name": f"{campaign_name} · Ad",
                "adset_id": adset_id,
                "creative": {"creative_id": ad_creative_id},
                "status": "PAUSED",
            },
        )
        if not ad_r.is_success:
            err = ad_r.json().get("error", {})
            raise HTTPException(
                status_code=400,
                detail=f"Reklam oluşturulamadı: {err.get('message', ad_r.text[:150])}",
            )
        ad_id: str = ad_r.json()["id"]
        logger.info("meta_ads_ad_created", ad_id=ad_id)

    # Estimated reach: budget_tl / CPM_TL * 1000  (CPM ≈ 8₺)
    CPM_TL = 8.0
    estimated_reach = int((budget_amount_tl / CPM_TL) * 1000)

    return {
        "campaign_id": campaign_id,
        "adset_id": adset_id,
        "ad_creative_id": ad_creative_id,
        "ad_id": ad_id,
        "status": "PAUSED",
        "estimated_reach": estimated_reach,
    }


async def get_campaign_insights(access_token: str, campaign_id: str) -> dict[str, Any]:
    """GET /{campaign_id}/insights"""
    if not access_token:
        return {}

    async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
        r = await client.get(
            f"{GRAPH_BASE}/{campaign_id}/insights",
            params={
                "fields": "reach,impressions,spend,clicks,cpm",
                "access_token": access_token,
            },
        )

    if not r.is_success:
        logger.warning("meta_ads_insights_failed", campaign_id=campaign_id, status=r.status_code)
        return {}

    data = r.json().get("data", [{}])
    row = data[0] if data else {}
    rate = _get_usd_try_rate()
    spend_usd = float(row.get("spend", 0) or 0)

    return {
        "reach": int(row.get("reach", 0) or 0),
        "impressions": int(row.get("impressions", 0) or 0),
        "spend_tl": round(spend_usd * rate, 2),
        "clicks": int(row.get("clicks", 0) or 0),
        "cpm": float(row.get("cpm", 0) or 0),
    }


async def update_campaign_status(
    access_token: str,
    campaign_id: str,
    adset_id: str,
    ad_id: str,
    status: str,
) -> dict[str, Any]:
    """Set campaign + adset + ad to ACTIVE or PAUSED."""
    if not access_token:
        raise HTTPException(status_code=404, detail="Meta hesabı bağlı değil")
    if status not in ("ACTIVE", "PAUSED"):
        raise HTTPException(status_code=400, detail="Geçersiz status")

    async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
        results = []
        for obj_id in [campaign_id, adset_id, ad_id]:
            if not obj_id:
                continue
            r = await client.post(
                f"{GRAPH_BASE}/{obj_id}",
                params={"access_token": access_token},
                json={"status": status},
            )
            results.append({"id": obj_id, "ok": r.is_success})
            if not r.is_success:
                err = r.json().get("error", {})
                logger.warning("meta_ads_status_update_failed", obj_id=obj_id, error=err)

    logger.info("meta_ads_status_updated", campaign_id=campaign_id, status=status)
    return {"campaign_id": campaign_id, "status": status, "results": results}
