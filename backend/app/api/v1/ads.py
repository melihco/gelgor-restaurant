"""
Public-facing ads API for frontend consumption.
Fetches campaign data via the GoogleAdsClient (mock or real).
Exposes mutation endpoints for budget and status changes.
"""

from __future__ import annotations

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.integrations.google_ads_client import get_google_ads_client
from app.integrations.remarketing import get_remarketing_builder, AudienceSegment, AudienceRule

router = APIRouter()


@router.get("/campaigns")
async def get_campaigns(
    date_range: str = Query("LAST_30_DAYS", alias="date_range"),
    account_id: str = Query("", alias="account_id"),
):
    client = get_google_ads_client(customer_id=account_id)
    campaigns = client.list_campaigns(date_range=date_range)

    return {
        "account_id": client.customer_id,
        "date_range": date_range,
        "campaigns": [c.to_dict() for c in campaigns],
        "total_cost": round(sum(c.cost for c in campaigns), 2),
        "total_conversions": sum(c.conversions for c in campaigns),
        "total_clicks": sum(c.clicks for c in campaigns),
    }


@router.get("/campaigns/{campaign_id}/ad-groups")
async def get_ad_groups(
    campaign_id: str,
    date_range: str = Query("LAST_30_DAYS"),
    account_id: str = Query(""),
):
    client = get_google_ads_client(customer_id=account_id)
    ad_groups = client.list_ad_groups(campaign_id=campaign_id, date_range=date_range)

    return {
        "campaign_id": campaign_id,
        "ad_groups": [ag.to_dict() for ag in ad_groups],
    }


@router.get("/campaigns/{campaign_id}/ad-groups/{ad_group_id}/keywords")
async def get_keywords(
    campaign_id: str,
    ad_group_id: str,
    date_range: str = Query("LAST_30_DAYS"),
    account_id: str = Query(""),
):
    client = get_google_ads_client(customer_id=account_id)
    keywords = client.list_keywords(ad_group_id=ad_group_id, date_range=date_range)

    return {
        "campaign_id": campaign_id,
        "ad_group_id": ad_group_id,
        "keywords": [kw.to_dict() for kw in keywords],
    }


# ── Mutations ─────────────────────────────────────────────────────────────────


class BudgetUpdateRequest(BaseModel):
    campaign_id: str
    new_daily_budget: float
    account_id: str = ""


class CampaignStatusRequest(BaseModel):
    campaign_id: str
    status: str  # ENABLED | PAUSED | REMOVED
    account_id: str = ""


class CreateAdRequest(BaseModel):
    ad_group_id: str
    headlines: list[str]
    descriptions: list[str]
    final_url: str
    account_id: str = ""


class BulkBudgetUpdateRequest(BaseModel):
    campaign_changes: list[dict]
    account_id: str = ""


@router.post("/campaigns/budget")
async def update_budget(req: BudgetUpdateRequest):
    client = get_google_ads_client(customer_id=req.account_id)
    result = client.update_campaign_budget(req.campaign_id, req.new_daily_budget)
    return result.to_dict()


@router.post("/campaigns/budget/bulk")
async def bulk_update_budgets(req: BulkBudgetUpdateRequest):
    """Apply budget optimization: update multiple campaign budgets in one call."""
    client = get_google_ads_client(customer_id=req.account_id)
    results = []
    total_before = 0.0
    total_after = 0.0

    for change in req.campaign_changes:
        campaign_id = change.get("campaign_id", "")
        current = float(change.get("current_budget", 0))
        recommended = float(change.get("recommended_budget", 0))
        total_before += current
        total_after += recommended

        if not campaign_id or abs(current - recommended) < 0.01:
            results.append({
                "campaign_id": campaign_id,
                "status": "skipped",
                "reason": "no change needed",
            })
            continue

        result = client.update_campaign_budget(campaign_id, recommended)
        results.append({
            "campaign_id": campaign_id,
            "campaign_name": change.get("campaign_name", ""),
            "previous_budget": current,
            "new_budget": recommended,
            "change_pct": round(((recommended - current) / current) * 100, 1) if current > 0 else 0,
            "status": "applied" if result.success else "failed",
            "error": result.error or None,
        })

    applied_count = sum(1 for r in results if r.get("status") == "applied")
    failed_count = sum(1 for r in results if r.get("status") == "failed")

    return {
        "success": failed_count == 0,
        "total_before": round(total_before, 2),
        "total_after": round(total_after, 2),
        "budget_neutral": abs(total_before - total_after) < 1.0,
        "applied": applied_count,
        "skipped": len(results) - applied_count - failed_count,
        "failed": failed_count,
        "details": results,
    }


@router.post("/campaigns/status")
async def update_status(req: CampaignStatusRequest):
    client = get_google_ads_client(customer_id=req.account_id)
    result = client.set_campaign_status(req.campaign_id, req.status)
    return result.to_dict()


@router.post("/ads/create-rsa")
async def create_rsa(req: CreateAdRequest):
    client = get_google_ads_client(customer_id=req.account_id)
    result = client.create_responsive_search_ad(
        ad_group_id=req.ad_group_id,
        headlines=req.headlines,
        descriptions=req.descriptions,
        final_url=req.final_url,
    )
    return result.to_dict()


# ── Remarketing ───────────────────────────────────────────────────────────────


@router.get("/remarketing/templates")
async def list_remarketing_templates():
    builder = get_remarketing_builder()
    return {"templates": builder.list_templates()}


class CreateRemarketingRequest(BaseModel):
    template_id: str


@router.post("/remarketing/create")
async def create_remarketing_audience(req: CreateRemarketingRequest):
    builder = get_remarketing_builder()
    result = builder.create_audience(req.template_id)
    return result.to_dict()


class CustomAudienceRequest(BaseModel):
    name: str
    description: str
    rules: list[dict]
    membership_duration_days: int = 30


@router.post("/remarketing/create-custom")
async def create_custom_audience(req: CustomAudienceRequest):
    builder = get_remarketing_builder()
    segment = AudienceSegment(
        name=req.name,
        description=req.description,
        rules=[AudienceRule(**r) for r in req.rules],
        membership_duration_days=req.membership_duration_days,
    )
    result = builder.create_custom_audience(segment)
    return result.to_dict()
