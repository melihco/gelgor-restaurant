"""
Social Media connection endpoints — Meta (Instagram Business) OAuth + analytics.
"""

from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, verify_workspace_access
from app.config import get_settings
from app.services.meta_analytics_service import (
    build_full_analytics,
    exchange_code_for_token,
    get_connection,
    get_ig_account,
    save_connection,
)

logger = structlog.get_logger()
router = APIRouter()


class MetaCallbackRequest(BaseModel):
    code: str
    workspace_id: str
    redirect_uri: str


class DisconnectRequest(BaseModel):
    workspace_id: str


@router.post("/meta/connect")
async def meta_connect_callback(
    req: MetaCallbackRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Exchange OAuth code for a long-lived token and save the connection.
    Called by the Next.js BFF after Meta redirects back with the code.
    """
    settings = get_settings()
    app_id = settings.meta_app_id
    app_secret = settings.meta_app_secret

    if not app_id or not app_secret:
        raise HTTPException(
            status_code=503,
            detail="META_APP_ID / META_APP_SECRET are not configured.",
        )

    try:
        token_data = await exchange_code_for_token(
            code=req.code,
            redirect_uri=req.redirect_uri,
            app_id=app_id,
            app_secret=app_secret,
        )
        ig_data = await get_ig_account(token_data["access_token"])
        ws_id = uuid.UUID(req.workspace_id)
        conn = await save_connection(db, ws_id, token_data, ig_data)

        logger.info(
            "meta_connected",
            workspace_id=req.workspace_id,
            ig_username=conn.ig_username,
        )

        return {
            "success": True,
            "ig_username": conn.ig_username,
            "followers_count": conn.followers_count,
            "page_name": conn.page_name,
            "expires_at": token_data["expires_at"].isoformat(),
        }

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as exc:
        logger.error("meta_connect_failed", error=str(exc)[:400])
        raise HTTPException(status_code=500, detail=f"Meta connection failed: {exc}")


@router.get("/meta/analytics/{workspace_id}")
async def get_meta_analytics(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Fetch fresh Instagram Business analytics for a workspace."""
    try:
        ws_id = uuid.UUID(workspace_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid workspace_id")

    conn = await get_connection(db, ws_id)
    if not conn:
        return {"connected": False}

    analytics = await build_full_analytics(db, ws_id)
    if not analytics:
        return {
            "connected": True,
            "ig_username": conn.ig_username,
            "followers_count": conn.followers_count,
            "error": "Could not fetch live analytics. Token may have expired.",
        }

    return {"connected": True, **analytics}


@router.get("/meta/status/{workspace_id}")
async def get_meta_status(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Quick check — is this workspace connected to Meta?"""
    try:
        ws_id = uuid.UUID(workspace_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid workspace_id")

    conn = await get_connection(db, ws_id)
    if not conn:
        return {"connected": False}

    from datetime import datetime, timezone, timedelta
    token_ok = (
        conn.token_expires_at is None
        or conn.token_expires_at > datetime.now(timezone.utc) + timedelta(days=2)
    )
    return {
        "connected": True,
        "ig_username": conn.ig_username,
        "followers_count": conn.followers_count,
        "token_expires_at": conn.token_expires_at.isoformat() if conn.token_expires_at else None,
        "token_valid": token_ok,
        "insights_updated_at": conn.insights_updated_at.isoformat() if conn.insights_updated_at else None,
    }


@router.delete("/meta/disconnect/{workspace_id}", dependencies=[Depends(verify_workspace_access())])
async def disconnect_meta(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        ws_id = uuid.UUID(workspace_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid workspace_id")

    conn = await get_connection(db, ws_id)
    if conn:
        conn.is_active = False
        conn.access_token = None
        db.add(conn)
        await db.commit()

    return {"success": True}


# ── Instagram Publishing ──────────────────────────────────────────────────────

from pydantic import BaseModel as _PubModel

class PublishRequest(_PubModel):
    publish_type: str  # feed_image | reel | story_image | story_video
    image_url: str | None = None
    video_url: str | None = None
    caption: str = ""
    hashtags: list[str] = []
    cover_url: str | None = None

@router.post("/meta/publish/{workspace_id}", dependencies=[Depends(verify_workspace_access())])
async def publish_to_instagram(
    workspace_id: str,
    req: PublishRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Publish approved content to Instagram Business account.
    Requires Meta OAuth connection with instagram_content_publish permission.
    """
    import uuid as _uuid
    from app.services.meta_analytics_service import get_connection
    from app.services.meta_publish_service import publish_to_instagram as _publish

    try:
        ws_id = _uuid.UUID(workspace_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid workspace_id")

    conn = await get_connection(db, ws_id)
    if not conn or not conn.access_token:
        raise HTTPException(
            status_code=403,
            detail="Instagram hesabı bağlı değil. Brand Hub → Instagram Bağla.",
        )
    if not conn.ig_user_id:
        raise HTTPException(status_code=403, detail="Instagram Business hesabı bulunamadı.")

    result = await _publish(
        ig_user_id=conn.ig_user_id,
        access_token=conn.access_token,
        publish_type=req.publish_type,
        image_url=req.image_url,
        video_url=req.video_url,
        caption=req.caption,
        hashtags=req.hashtags,
        cover_url=req.cover_url,
    )

    if not result.get("success"):
        raise HTTPException(status_code=422, detail=result.get("error", "Publish failed"))

    logger.info(
        "content_published",
        workspace_id=workspace_id,
        post_id=result.get("post_id"),
        type=req.publish_type,
    )

    return result


# ── Scheduling ────────────────────────────────────────────────────────────────

from pydantic import BaseModel as _SchedModel
from datetime import datetime as _dt

class SchedulePostRequest(_SchedModel):
    platform: str = "instagram"
    publish_type: str
    scheduled_at: str  # ISO datetime string
    image_url: str | None = None
    video_url: str | None = None
    caption: str = ""
    hashtags: list[str] = []
    artifact_title: str | None = None

@router.post("/schedule/{workspace_id}")
async def schedule_post(workspace_id: str, req: SchedulePostRequest, db: AsyncSession = Depends(get_db)) -> dict:
    import uuid as _uuid
    from app.services.post_scheduler_service import schedule_post as _schedule
    from datetime import timezone as _tz
    ws_id = _uuid.UUID(workspace_id)
    scheduled_at = _dt.fromisoformat(req.scheduled_at.replace("Z", "+00:00"))
    if scheduled_at.tzinfo is None:
        scheduled_at = scheduled_at.replace(tzinfo=_tz.utc)
    return await _schedule(db, ws_id, req.platform, req.publish_type, scheduled_at,
        image_url=req.image_url, video_url=req.video_url, caption=req.caption,
        hashtags=req.hashtags, artifact_title=req.artifact_title)

@router.get("/schedule/{workspace_id}")
async def list_scheduled(workspace_id: str, db: AsyncSession = Depends(get_db)) -> list:
    import uuid as _uuid
    from app.services.post_scheduler_service import get_scheduled_posts as _list
    return await _list(db, _uuid.UUID(workspace_id))

@router.delete("/schedule/{workspace_id}/{post_id}")
async def cancel_post(workspace_id: str, post_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    import uuid as _uuid
    from app.services.post_scheduler_service import cancel_scheduled_post as _cancel
    ok = await _cancel(db, post_id, _uuid.UUID(workspace_id))
    return {"success": ok}

@router.post("/facebook/publish/{workspace_id}", dependencies=[Depends(verify_workspace_access())])
async def publish_facebook(workspace_id: str, req: PublishRequest, db: AsyncSession = Depends(get_db)) -> dict:
    import uuid as _uuid
    from app.services.meta_analytics_service import get_connection
    from app.services.facebook_publish_service import publish_to_facebook as _fb
    conn = await get_connection(db, _uuid.UUID(workspace_id))
    if not conn or not conn.access_token:
        raise HTTPException(status_code=403, detail="Instagram/Facebook hesabı bağlı değil.")
    if not conn.page_id:
        raise HTTPException(status_code=403, detail="Facebook Page bağlantısı yok.")
    result = await _fb(page_id=conn.page_id, access_token=conn.access_token,
        image_url=req.image_url, video_url=req.video_url, caption=f"{req.caption}\n\n{' '.join('#'+h.lstrip('#') for h in req.hashtags)}" if req.hashtags else req.caption)
    if not result.get("success"):
        raise HTTPException(status_code=422, detail=result.get("error"))
    return result


# ── Meta Ads endpoints ────────────────────────────────────────────────────────

from decimal import Decimal as _Decimal
from datetime import datetime as _dt, timezone as _tz


class BoostPostRequest(BaseModel):
    artifact_id: str = ""
    ig_media_id: str = ""
    caption: str = ""
    objective: str = "OUTCOME_AWARENESS"   # OUTCOME_AWARENESS | OUTCOME_ENGAGEMENT | OUTCOME_TRAFFIC
    budget_tl: float = 100.0
    duration_days: int = 7
    ad_account_id: str = ""                # override; falls back to stored value


@router.get("/meta/ad-accounts/{workspace_id}")
async def get_meta_ad_accounts(workspace_id: str, db: AsyncSession = Depends(get_db)) -> list:
    import uuid as _uuid
    from app.services.meta_ads_service import fetch_ad_accounts
    conn = await get_connection(db, _uuid.UUID(workspace_id))
    if not conn or not conn.access_token:
        raise HTTPException(status_code=404, detail="Meta hesabı bağlı değil")
    accounts = await fetch_ad_accounts(conn.access_token)
    # Auto-save first active account
    if accounts and not conn.ad_account_id:
        conn.ad_account_id = accounts[0]["id"]
        conn.ad_account_name = accounts[0].get("name", "")
        await db.commit()
    return accounts


@router.post("/meta/boost/{workspace_id}", dependencies=[Depends(verify_workspace_access())])
async def boost_post_endpoint(workspace_id: str, req: BoostPostRequest, db: AsyncSession = Depends(get_db)) -> dict:
    import uuid as _uuid
    from app.services.meta_ads_service import boost_post as _boost
    from app.models.meta_ad_campaign import MetaAdCampaign

    conn = await get_connection(db, _uuid.UUID(workspace_id))
    if not conn or not conn.access_token:
        raise HTTPException(status_code=404, detail="Meta hesabı bağlı değil")

    ad_account_id = req.ad_account_id or conn.ad_account_id or ""
    if not ad_account_id:
        raise HTTPException(status_code=400, detail="Meta Reklam Hesabı bulunamadı. ad-accounts endpoint'ini çağırın.")

    result = await _boost(
        access_token=conn.access_token,
        ad_account_id=ad_account_id,
        ig_media_id=req.ig_media_id or None,
        ig_user_id=conn.ig_user_id or "",
        page_id=conn.page_id or "",
        caption=req.caption,
        objective=req.objective,
        budget_amount_tl=req.budget_tl,
        duration_days=req.duration_days,
    )

    campaign = MetaAdCampaign(
        workspace_id=_uuid.UUID(workspace_id),
        artifact_id=req.artifact_id or None,
        campaign_id=result["campaign_id"],
        adset_id=result.get("adset_id"),
        ad_id=result.get("ad_id"),
        ad_creative_id=result.get("ad_creative_id"),
        objective=req.objective,
        budget_tl=_Decimal(str(req.budget_tl)),
        duration_days=req.duration_days,
        status="PAUSED",
        estimated_reach=result.get("estimated_reach", 0),
    )
    db.add(campaign)
    await db.commit()

    return {
        "campaign_id": result["campaign_id"],
        "status": "PAUSED",
        "estimated_reach": result.get("estimated_reach", 0),
        "message": "Kampanya oluşturuldu. AdsOverview'den 'Aktive Et' ile başlatın.",
    }


@router.post("/meta/campaigns/{campaign_id}/activate/{workspace_id}", dependencies=[Depends(verify_workspace_access())])
async def activate_campaign(campaign_id: str, workspace_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    import uuid as _uuid
    from sqlalchemy import select as _sel
    from app.services.meta_ads_service import update_campaign_status
    from app.models.meta_ad_campaign import MetaAdCampaign

    conn = await get_connection(db, _uuid.UUID(workspace_id))
    if not conn or not conn.access_token:
        raise HTTPException(status_code=404, detail="Meta hesabı bağlı değil")

    r = await db.execute(
        _sel(MetaAdCampaign).where(
            MetaAdCampaign.campaign_id == campaign_id,
            MetaAdCampaign.workspace_id == _uuid.UUID(workspace_id),
        )
    )
    row = r.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Kampanya bulunamadı")

    result = await update_campaign_status(
        access_token=conn.access_token,
        campaign_id=row.campaign_id,
        adset_id=row.adset_id or "",
        ad_id=row.ad_id or "",
        status="ACTIVE",
    )

    row.status = "ACTIVE"
    await db.commit()
    return result


@router.get("/meta/campaigns/{workspace_id}")
async def list_campaigns(workspace_id: str, db: AsyncSession = Depends(get_db)) -> list:
    import uuid as _uuid
    from sqlalchemy import select as _sel
    from app.models.meta_ad_campaign import MetaAdCampaign
    from app.services.meta_ads_service import get_campaign_insights

    conn = await get_connection(db, _uuid.UUID(workspace_id))

    r = await db.execute(
        _sel(MetaAdCampaign)
        .where(MetaAdCampaign.workspace_id == _uuid.UUID(workspace_id))
        .order_by(MetaAdCampaign.created_at.desc())
        .limit(50)
    )
    rows = r.scalars().all()

    results = []
    for row in rows:
        insights: dict = {}
        if conn and conn.access_token and row.status == "ACTIVE":
            try:
                insights = await get_campaign_insights(conn.access_token, row.campaign_id)
                if insights.get("reach"):
                    row.actual_reach = insights["reach"]
                    row.impressions = insights.get("impressions", 0)
                    row.clicks = insights.get("clicks", 0)
                    row.spend_tl = _Decimal(str(insights.get("spend_tl", 0)))
                    await db.commit()
            except Exception as exc:
                # Non-fatal: insights refresh failed, fall back to cached values
                logger.warning("meta_campaign_insights_refresh_failed",
                               campaign_id=row.campaign_id, error=str(exc)[:200])

        results.append({
            "id": str(row.id),
            "artifact_id": row.artifact_id or "",
            "campaign_id": row.campaign_id,
            "adset_id": row.adset_id or "",
            "ad_id": row.ad_id or "",
            "ad_creative_id": row.ad_creative_id or "",
            "objective": row.objective or "",
            "budget_tl": float(row.budget_tl or 0),
            "duration_days": row.duration_days or 0,
            "status": row.status,
            "estimated_reach": row.estimated_reach or 0,
            "actual_reach": row.actual_reach or 0,
            "spend_tl": float(row.spend_tl or 0),
            "impressions": row.impressions or 0,
            "clicks": row.clicks or 0,
            "created_at": row.created_at.isoformat() if row.created_at else "",
        })

    return results
