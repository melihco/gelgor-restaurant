"""
Tokenized billing — convert API cost (USD) to customer-facing SA Kredi.

Formula (ENV-configurable):
  billed_usd   = cost_usd × TOKEN_MARKUP_MULTIPLIER   (default 10×)
  tokens       = billed_usd / TOKEN_USD_VALUE        (default 1 token = $0.01 billed)
  try_display  = tokens × TOKEN_TRY_RATE

Monthly wallet:
  remaining = monthly_grant_tokens − month_to_date_spent_tokens

No separate ledger table — tokens are derived from workspace_usage_daily.cost_usd
so historical rows work retroactively.
"""

from __future__ import annotations

import math
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.workspace_usage import WorkspaceUsageDaily

GRANT_BY_PACKAGE: dict[str, int] = {
    "starter": 5_000,
    "studio": 5_000,
    "growth": 15_000,
    "agency": 15_000,
    "performance": 40_000,
    "signature": 40_000,
    "premium": 40_000,
    "executive": 150_000,
    "collective": 150_000,
}

# Mirrors package-plan-config.ts / PackagePlanCatalog.cs
OUTPUTS_BY_PACKAGE: dict[str, dict[str, int]] = {
    "starter": {
        "missions": 14,
        "social_content": 168,
        "gallery_analysis": 40,
        "reels": 56,
        "meta_ad_creatives": 14,
        "google_ad_creatives": 14,
    },
    "studio": {
        "missions": 14,
        "social_content": 168,
        "gallery_analysis": 40,
        "reels": 56,
        "meta_ad_creatives": 14,
        "google_ad_creatives": 14,
    },
    "growth": {"missions": 28, "social_content": 336, "gallery_analysis": 120, "reels": 112, "meta_ad_creatives": 28, "google_ad_creatives": 28},
    "agency": {"missions": 28, "social_content": 336, "gallery_analysis": 120, "reels": 112, "meta_ad_creatives": 28, "google_ad_creatives": 28},
    "performance": {"missions": 65, "social_content": 780, "gallery_analysis": 250, "reels": 260, "meta_ad_creatives": 65, "google_ad_creatives": 65},
    "signature": {"missions": 65, "social_content": 780, "gallery_analysis": 250, "reels": 260, "meta_ad_creatives": 65, "google_ad_creatives": 65},
    "premium": {"missions": 65, "social_content": 780, "gallery_analysis": 250, "reels": 260, "meta_ad_creatives": 65, "google_ad_creatives": 65},
    "executive": {"missions": -1, "social_content": -1, "gallery_analysis": -1, "reels": -1, "meta_ad_creatives": -1, "google_ad_creatives": -1},
    "collective": {"missions": -1, "social_content": -1, "gallery_analysis": -1, "reels": -1, "meta_ad_creatives": -1, "google_ad_creatives": -1},
}

# Tuned API unit costs (USD) — keep in sync with apps/web/src/lib/package-plan-config.ts
API_UNIT_COST_USD: dict[str, float] = {
    "mission_propose": 0.28,
    "mission_production_cycle": 3.2,
    "gallery_vision_analysis": 0.04,
    "standalone_reel": 0.30,
}


def estimate_monthly_api_cost_usd(package_slug: str | None) -> float | None:
    """Estimated API COGS if monthly output caps are fully used."""
    outputs = OUTPUTS_BY_PACKAGE.get((package_slug or "").strip().lower())
    if not outputs:
        return None

    def cap(v: int, default: int) -> int:
        return default if v < 0 else v

    missions = cap(outputs["missions"], 20)
    gallery = cap(outputs["gallery_analysis"], 300)
    u = API_UNIT_COST_USD
    cost = missions * (u["mission_propose"] + u["mission_production_cycle"])
    cost += gallery * u["gallery_vision_analysis"]
    return round(cost, 2)

CATEGORY_LABELS_TR: dict[str, str] = {
    "auto_produce": "Feed üretimi (görsel/video)",
    "mission_propose": "Mission önerisi",
    "content_strategy": "İçerik stratejisi",
    "content_ideation": "İçerik fikirleri",
    "feed_art_director": "Feed Art Director",
    "scene_brief": "Sahne yönetmeni (scene brief)",
    "gpt_image_enhance": "GPT fotoğraf iyileştirme",
    "gallery_vision_analysis": "Galeri vision analizi",
    "market_intelligence": "Pazar analizi",
    "gallery_match": "Galeri eşleştirme",
    "standalone_reel": "Bağımsız reel",
    "other": "Diğer",
}


def get_token_settings() -> dict[str, float | int | bool | str]:
    s = get_settings()
    return {
        "enabled": s.token_billing_enabled,
        "markup_multiplier": s.token_markup_multiplier,
        "profit_margin_percent": s.token_profit_margin_percent,
        "token_usd_value": s.token_usd_value,
        "try_per_token": s.token_try_rate,
        "monthly_grant_tokens": s.token_monthly_grant,
        "token_name": s.token_display_name,
    }


def cost_usd_to_billed_usd(cost_usd: float) -> float:
    s = get_settings()
    return round(max(0.0, cost_usd) * s.token_markup_multiplier, 6)


def cost_usd_to_tokens(cost_usd: float) -> int:
    """Customer-facing tokens charged for an API cost."""
    s = get_settings()
    if cost_usd <= 0:
        return 0
    billed = cost_usd_to_billed_usd(cost_usd)
    return max(1, int(math.ceil(billed / s.token_usd_value)))


def tokens_to_try(tokens: int) -> float:
    s = get_settings()
    return round(tokens * s.token_try_rate, 2)


def effective_margin_percent(cost_usd: float, billed_usd: float) -> float:
    if billed_usd <= 0:
        return 0.0
    return round((billed_usd - cost_usd) / billed_usd * 100, 1)


def cost_profit_ratio(cost_usd: float, billed_usd: float) -> float | None:
    """Maliyet / kar (USD). Kar = faturalanan − API maliyeti."""
    profit = billed_usd - cost_usd
    if profit <= 0.001:
        return None
    return round(cost_usd / profit, 2)


def resolve_monthly_grant(package_slug: str | None = None) -> int:
    s = get_settings()
    if package_slug:
        slug = package_slug.strip().lower()
        if slug in GRANT_BY_PACKAGE:
            return GRANT_BY_PACKAGE[slug]
    return s.token_monthly_grant


def _month_start(d: date | None = None) -> date:
    today = d or date.today()
    return today.replace(day=1)


async def get_month_cost_usd(
    db: AsyncSession,
    workspace_id,
    *,
    month_start: date | None = None,
) -> tuple[float, int, dict[str, float]]:
    """Return (total_cost_usd, total_tokens, category_cost_breakdown) for current month."""
    start = month_start or _month_start()
    result = await db.execute(
        select(WorkspaceUsageDaily).where(
            WorkspaceUsageDaily.workspace_id == workspace_id,
            WorkspaceUsageDaily.usage_date >= start,
        )
    )
    rows = list(result.scalars().all())
    total_cost = 0.0
    categories: dict[str, float] = {}
    for row in rows:
        c = float(row.cost_usd)
        total_cost += c
        for cat, amt in (row.breakdown or {}).items():
            categories[cat] = round(categories.get(cat, 0) + float(amt), 4)
    total_tokens = sum(cost_usd_to_tokens(float(r.cost_usd)) for r in rows)
    return round(total_cost, 4), total_tokens, categories


async def build_token_wallet_summary(
    db: AsyncSession,
    workspace_id,
    *,
    package_slug: str | None = None,
    period_cost_usd: float = 0.0,
    period_days: int = 7,
    category_totals: dict[str, float] | None = None,
    spent_today_usd: float = 0.0,
) -> dict[str, Any]:
    """Build wallet block for usage API + profile UI."""
    s = get_settings()
    settings = get_token_settings()
    grant = resolve_monthly_grant(package_slug)

    month_cost, month_tokens, month_categories = await get_month_cost_usd(db, workspace_id)
    remaining = max(0, grant - month_tokens)

    period_billed = cost_usd_to_billed_usd(period_cost_usd)
    month_billed = cost_usd_to_billed_usd(month_cost)
    today_tokens = cost_usd_to_tokens(spent_today_usd)

    cat_tokens: dict[str, int] = {}
    for cat, usd in (category_totals or month_categories).items():
        if usd > 0:
            cat_tokens[cat] = cost_usd_to_tokens(usd)

    eff_margin = effective_margin_percent(month_cost, month_billed)
    cp_ratio = cost_profit_ratio(month_cost, month_billed)
    period_cp_ratio = cost_profit_ratio(period_cost_usd, period_billed) if period_cost_usd > 0 else None

    period_tokens = sum(cost_usd_to_tokens(float(v)) for v in (category_totals or {}).values()) if category_totals else cost_usd_to_tokens(period_cost_usd)

    plan_outputs = OUTPUTS_BY_PACKAGE.get((package_slug or "").strip().lower())
    plan_estimated_api = estimate_monthly_api_cost_usd(package_slug)

    return {
        **settings,
        "monthly_grant_tokens": grant,
        "spent_month_tokens": month_tokens,
        "remaining_tokens": remaining,
        "spent_today_tokens": today_tokens,
        "period_spent_tokens": period_tokens,
        "month_cost_usd": month_cost,
        "month_billed_usd": round(month_billed, 4),
        "month_billed_try": tokens_to_try(month_tokens),
        "period_cost_usd": round(period_cost_usd, 4),
        "period_billed_usd": round(period_billed, 4),
        "period_billed_try": tokens_to_try(period_tokens),
        "effective_margin_percent": eff_margin,
        "target_margin_percent": s.token_profit_margin_percent,
        "cost_profit_ratio": cp_ratio,
        "period_cost_profit_ratio": period_cp_ratio,
        "plan_monthly_outputs": plan_outputs,
        "plan_estimated_api_cost_usd": plan_estimated_api,
        "category_tokens": cat_tokens,
        "category_labels": CATEGORY_LABELS_TR,
        "period_days": period_days,
        "usage_percent": round(min(100.0, month_tokens / grant * 100), 1) if grant > 0 else 0,
        "note_tr": (
            f"1 {s.token_display_name} = {s.token_try_rate:.2f} ₺ · "
            f"API maliyeti ×{s.token_markup_multiplier:.0f} kredi olarak yansır"
        ),
    }


def estimate_tokens_before_action(estimated_cost_usd: float) -> dict[str, Any]:
    """Pre-flight estimate for UI before mission/produce."""
    tokens = cost_usd_to_tokens(estimated_cost_usd)
    billed = cost_usd_to_billed_usd(estimated_cost_usd)
    return {
        "estimated_cost_usd": round(estimated_cost_usd, 4),
        "estimated_tokens": tokens,
        "estimated_billed_usd": round(billed, 4),
        "estimated_try": tokens_to_try(tokens),
    }


async def check_token_wallet(
    db: AsyncSession,
    workspace_id,
    additional_cost_usd: float = 0.0,
    package_slug: str | None = None,
) -> dict[str, Any]:
    """Whether workspace has enough tokens for additional spend."""
    grant = resolve_monthly_grant(package_slug)
    _, month_tokens, _ = await get_month_cost_usd(db, workspace_id)
    additional = cost_usd_to_tokens(additional_cost_usd) if additional_cost_usd > 0 else 0
    remaining = grant - month_tokens
    allowed = remaining >= additional

    return {
        "allowed": allowed,
        "remaining_tokens": max(0, remaining),
        "monthly_grant_tokens": grant,
        "spent_month_tokens": month_tokens,
        "additional_tokens": additional,
        "reason": None if allowed else (
            f"Aylık kredi limiti doldu ({month_tokens:,} / {grant:,} {get_settings().token_display_name})"
        ),
    }
