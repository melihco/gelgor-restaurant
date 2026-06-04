from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.crew.brand_analyzer import analyze_brand
from app.config import get_settings
from app.schemas.brand_context import (
    BrandAnalyzeRequest,
    BrandAnalyzeResponse,
    BrandContextCreate,
    BrandContextRead,
    BrandContextUpdate,
    SourceStatus,
)
from app.schemas.brand_theme import AiThemeSettingsPatch, BrandThemeSaveRequest
from app.schemas.brand_vibe import (
    BrandVibeSaveRequest,
    ScrapeRefAccountsRequest,
)
from app.services import brand_context_service

logger = structlog.get_logger()
router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────────

async def _discover_competitor_suggestions(
    brand_name: str,
    business_type: str,
    location: str,
    perplexity_api_key: str = "",
    perplexity_model: str = "sonar",
    openai_api_key: str = "",
) -> list[str]:
    """
    Use Perplexity (preferred) or OpenAI to discover 4-6 real competitor names
    for the given brand. Returns a list of business name strings.
    """
    import httpx as _httpx
    import re as _re

    query = (
        f"List 5 real competitors of '{brand_name}', a {business_type} in {location or 'Turkey'}. "
        f"Return ONLY a JSON array of business names, no explanation. "
        f"Example: [\"Competitor A\", \"Competitor B\", \"Competitor C\"]"
    )

    # Try Perplexity first
    if perplexity_api_key:
        try:
            async with _httpx.AsyncClient(timeout=20) as client:
                r = await client.post(
                    "https://api.perplexity.ai/chat/completions",
                    headers={"Authorization": f"Bearer {perplexity_api_key}"},
                    json={
                        "model": perplexity_model or "sonar",
                        "messages": [{"role": "user", "content": query}],
                        "max_tokens": 200,
                    },
                )
                if r.status_code == 200:
                    content = r.json()["choices"][0]["message"]["content"].strip()
                    arr_match = _re.search(r"\[.*?\]", content, _re.DOTALL)
                    if arr_match:
                        import json as _json
                        names = _json.loads(arr_match.group(0))
                        if isinstance(names, list):
                            return [str(n).strip() for n in names if str(n).strip()][:6]
        except Exception:
            pass

    # Fallback: OpenAI
    if openai_api_key:
        try:
            async with _httpx.AsyncClient(timeout=20) as client:
                r = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {openai_api_key}"},
                    json={
                        "model": "gpt-4o-mini",
                        "max_tokens": 150,
                        "messages": [{"role": "user", "content": query}],
                    },
                )
                if r.status_code == 200:
                    content = r.json()["choices"][0]["message"]["content"].strip()
                    arr_match = _re.search(r"\[.*?\]", content, _re.DOTALL)
                    if arr_match:
                        import json as _json
                        names = _json.loads(arr_match.group(0))
                        if isinstance(names, list):
                            return [str(n).strip() for n in names if str(n).strip()][:6]
        except Exception:
            pass

    return []


def _build_source_status(
    attempted: bool,
    data: dict,
    error_msg: str,
    data_point_keys: list[tuple[str, str]],
) -> SourceStatus:
    """Build a SourceStatus from a raw source data dict."""
    ok = data.get("raw_fetch_ok", False)
    return SourceStatus(
        attempted=attempted,
        ok=ok,
        error=None if ok else (error_msg if attempted else None),
        data_points=[label for label, key in data_point_keys if data.get(key)],
    )


# ── CRUD endpoints ─────────────────────────────────────────────────────────

@router.get("/{workspace_id}", response_model=BrandContextRead)
async def get_brand_context(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    ctx = await brand_context_service.ensure_brand_context(db, workspace_id)
    ctx = await brand_context_service.seed_missing_brand_fields(db, ctx)
    return ctx


@router.post("/{workspace_id}", response_model=BrandContextRead, status_code=201)
async def create_brand_context(
    workspace_id: uuid.UUID,
    data: BrandContextCreate,
    db: AsyncSession = Depends(get_db),
):
    existing = await brand_context_service.get_brand_context(db, workspace_id)
    if existing:
        raise HTTPException(409, "Brand context already exists. Use PATCH to update.")
    return await brand_context_service.create_brand_context(db, workspace_id, data)


@router.patch("/{workspace_id}", response_model=BrandContextRead)
async def update_brand_context(
    workspace_id: uuid.UUID,
    data: BrandContextUpdate,
    db: AsyncSession = Depends(get_db),
):
    ctx = await brand_context_service.update_brand_context(db, workspace_id, data)
    if not ctx:
        raise HTTPException(404, "Brand context not found")
    return ctx


@router.post("/{workspace_id}/confirm-constitution", response_model=BrandContextRead)
async def confirm_brand_constitution(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Sets brand_constitution_confirmed_at; agents receive confirmed=True after this.
    Also auto-bootstraps BrandTheme so the brand kit is ready immediately.
    """
    ctx = await brand_context_service.ensure_brand_context(db, workspace_id)
    ctx = await brand_context_service.seed_missing_brand_fields(db, ctx)
    ctx.brand_constitution_confirmed_at = datetime.now(timezone.utc)
    await db.flush()
    logger.info("brand_constitution_confirmed", workspace_id=str(workspace_id))

    # Auto-bootstrap BrandTheme — fire and forget (non-blocking)
    import asyncio as _asyncio
    from app.services.brand_theme_service import derive_brand_theme, save_brand_theme

    async def _bootstrap_theme():
        try:
            from app.database import async_session_factory
            async with async_session_factory() as _db:
                _ctx = await brand_context_service.get_brand_context(_db, workspace_id)
                if _ctx:
                    theme = await derive_brand_theme(_ctx)
                    await save_brand_theme(_ctx, theme, _db)
                    logger.info(
                        "brand_theme_bootstrapped_on_constitution",
                        workspace_id=str(workspace_id),
                        source=theme.source,
                    )
        except Exception as _e:
            logger.warning("brand_theme_bootstrap_failed", workspace_id=str(workspace_id), error=str(_e)[:200])

    _asyncio.create_task(_bootstrap_theme())

    return ctx


@router.post("/{workspace_id}/enrich-brand-kit-from-website")
async def enrich_brand_kit_from_website(
    workspace_id: uuid.UUID,
    fill_empty_only: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
):
    """
    Crawl the brand website homepage and fill Tipografi / Renkler when empty.
    Used by Marka Detayı and batch backfill scripts.
    """
    try:
        result = await brand_context_service.enrich_brand_kit_from_website(
            db, workspace_id, fill_empty_only=fill_empty_only,
        )
    except Exception as exc:
        logger.error("enrich_brand_kit_failed", workspace_id=str(workspace_id), error=str(exc))
        raise HTTPException(500, f"Brand kit enrichment failed: {exc}") from exc

    if not result.get("ok"):
        raise HTTPException(
            422,
            result.get("error") or "Could not detect fonts or colors from website",
        )

    kit = result.get("kit") or {}
    return {
        "ok": True,
        "applied": result.get("applied", []),
        "primary_font": result.get("brand_font_family") or kit.get("heading_font"),
        "secondary_font": (kit.get("body_font") or ""),
        "brand_colors": ", ".join(
            x for x in [
                result.get("brand_primary_color") or kit.get("primary_color"),
                result.get("brand_accent_color") or kit.get("accent_color"),
            ] if x
        ),
        "accent_color": result.get("brand_accent_color") or kit.get("accent_color"),
        "kit": kit,
        "theme": result.get("theme"),
    }


@router.post("/{workspace_id}/analyze", response_model=BrandAnalyzeResponse)
async def analyze_brand_context(
    workspace_id: uuid.UUID,
    body: BrandAnalyzeRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Run brand discovery from external URLs and persist the result.
    Never fails silently — returns per-source status even on partial failure.
    """
    if not body.website_url and not body.instagram_handle and not body.google_business_url:
        raise HTTPException(
            400,
            "Provide at least one of: website_url, instagram_handle, google_business_url",
        )

    logger.info(
        "brand_analyze_started",
        workspace_id=str(workspace_id),
        has_website=bool(body.website_url),
        has_instagram=bool(body.instagram_handle),
        has_google=bool(body.google_business_url),
    )

    try:
        result = await analyze_brand(
            website_url=body.website_url,
            instagram_handle=body.instagram_handle,
            google_business_url=body.google_business_url,
            company_profile={},
        )
    except Exception as exc:
        logger.error("brand_analyze_failed", workspace_id=str(workspace_id), error=str(exc))
        raise HTTPException(500, f"Brand analysis pipeline failed: {exc}") from exc

    website_data = result.get("website", {})
    instagram_data = result.get("instagram", {})
    google_data = result.get("google_business", {})

    website_status = _build_source_status(
        attempted=bool(body.website_url),
        data=website_data,
        error_msg="Website could not be reached or returned no readable content.",
        data_point_keys=[
            ("title", "title"),
            ("description", "description"),
            ("text_snippet", "text_snippet"),
            ("linked_pages", "links"),
            ("reference photos", "image_urls"),
        ],
    )
    instagram_status = _build_source_status(
        attempted=bool(body.instagram_handle),
        data=instagram_data,
        error_msg="Instagram profile could not be fetched. The account may be private or rate-limited.",
        data_point_keys=[
            ("bio", "bio"),
            ("follower_count", "follower_count"),
            ("recent_captions", "recent_captions"),
            ("top_hashtags", "top_hashtags"),
            ("feed photos", "feed_image_urls"),
        ],
    )
    google_status = _build_source_status(
        attempted=bool(body.google_business_url),
        data=google_data,
        error_msg="Google Business page could not be fetched.",
        data_point_keys=[("name", "name"), ("category", "category")],
    )

    try:
        ctx = await brand_context_service.persist_discovery_result(
            db, workspace_id, result,
            website_url=body.website_url or None,
            instagram_handle=body.instagram_handle.lstrip("@") if body.instagram_handle else None,
            google_business_url=body.google_business_url or None,
        )
    except Exception as exc:
        logger.error("brand_context_persist_failed", workspace_id=str(workspace_id), error=str(exc))
        raise HTTPException(500, f"Failed to save analysis results: {exc}") from exc

    # Re-derive theme when website kit filled typography / colors
    wi_kit = website_data.get("brand_kit") if isinstance(website_data.get("brand_kit"), dict) else {}
    if wi_kit.get("confidence", 0) >= 25:
        try:
            from app.services.brand_theme_service import derive_brand_theme, save_brand_theme
            theme = await derive_brand_theme(ctx)
            await save_brand_theme(ctx, theme, db)
            logger.info(
                "brand_theme_updated_from_website_kit",
                workspace_id=str(workspace_id),
                heading=wi_kit.get("heading_font"),
                primary=wi_kit.get("primary_color"),
            )
        except Exception as exc:
            logger.warning(
                "brand_theme_website_kit_derive_failed",
                workspace_id=str(workspace_id),
                error=str(exc)[:200],
            )

    import asyncio as _asyncio

    # Auto-suggest competitors via Perplexity if none configured yet
    if not getattr(ctx, "competitors", None) and not getattr(ctx, "suggested_competitors", None):
        async def _suggest_competitors() -> None:
            try:
                from app.database import async_session_factory
                suggestions = await _discover_competitor_suggestions(
                    brand_name=ctx.business_name,
                    business_type=getattr(ctx, "business_type", "") or "business",
                    location=getattr(ctx, "location", "") or "",
                    perplexity_api_key=settings.perplexity_api_key or "",
                    perplexity_model=settings.perplexity_model or "sonar",
                    openai_api_key=settings.openai_api_key or "",
                )
                if suggestions:
                    async with async_session_factory() as bg_db:
                        bg_ctx = await brand_context_service.get_brand_context(bg_db, workspace_id)
                        if bg_ctx:
                            import json as _json
                            bg_ctx.suggested_competitors = _json.dumps(suggestions, ensure_ascii=False)
                            await bg_db.commit()
                            logger.info("suggested_competitors_saved", workspace_id=str(workspace_id), count=len(suggestions))
            except Exception as exc:
                logger.warning("suggested_competitors_failed", workspace_id=str(workspace_id), error=str(exc))

        _asyncio.create_task(_suggest_competitors())

    # Auto-trigger competitor analysis in background if competitors are configured
    competitors_raw = getattr(ctx, "competitors", None) or ""
    if competitors_raw and settings.apify_api_key and not getattr(ctx, "competitor_brief", None):

        async def _run_competitor_analysis() -> None:
            try:
                from app.services.competitor_intelligence_service import build_competitor_brief
                from app.database import async_session_factory
                brief = await build_competitor_brief(
                    brand_name=ctx.business_name,
                    competitors_raw=competitors_raw,
                    api_key=settings.apify_api_key,
                    timeout=settings.apify_timeout_seconds,
                    brand_type=getattr(ctx, "business_type", "") or "business",
                    openai_api_key=getattr(settings, "openai_api_key", "") or "",
                )
                if brief:
                    async with async_session_factory() as bg_db:
                        bg_ctx = await brand_context_service.get_brand_context(bg_db, workspace_id)
                        if bg_ctx:
                            bg_ctx.competitor_brief = brief
                            await bg_db.commit()
                            logger.info("competitor_brief_auto_saved", workspace_id=str(workspace_id), chars=len(brief))
            except Exception as exc:
                logger.warning("competitor_brief_auto_failed", workspace_id=str(workspace_id), error=str(exc))

        _asyncio.create_task(_run_competitor_analysis())
        logger.info("competitor_analysis_background_started", workspace_id=str(workspace_id))

    report = result.get("report", {})
    logger.info(
        "brand_analyze_completed",
        workspace_id=str(workspace_id),
        confidence=ctx.discovery_confidence,
        website_ok=website_status.ok,
        instagram_ok=instagram_status.ok,
    )

    return BrandAnalyzeResponse(
        success=True,
        sources={
            "website": website_status.model_dump(),
            "instagram": instagram_status.model_dump(),
            "google": google_status.model_dump(),
        },
        confidence=ctx.discovery_confidence or 0,
        inferred_tone=result.get("inferred_tone", "professional"),
        inferred_language=result.get("inferred_language", "tr"),
        # Use the DB value (already corrected/seeded) — never raw analysis value
        inferred_industry=ctx.business_type or report.get("industry", ""),
        content_pillars=report.get("content_pillars", []),
        default_ctas=report.get("default_ctas", []),
        risk_rules=report.get("risk_rules", {}),
        instagram_top_hashtags=result.get("top_hashtags", []),
        website_summary=report.get("website_summary", ""),
        instagram_bio=instagram_data.get("bio", ""),
        missing_signals=report.get("missing_questions", []),
        brand_context=ctx,
        reference_image_urls=list(result.get("reference_image_urls") or []),
    )


@router.post("/{workspace_id}/analyze-visuals", response_model=dict)
async def analyze_venue_visuals(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    force: bool = False,
):
    """
    Run GPT-4o Vision analysis on the tenant's reference_image_urls.
    Produces a 'visual_dna' string that is stored and injected into all agent prompts,
    ensuring content direction stays consistent with the real venue aesthetic.

    - Skips if visual_dna is already populated and force=False.
    - Returns the full visual_dna text on success.
    """
    from app.services.visual_dna_service import ensure_visual_dna
    from app.services.brand_context_service import _parse_reference_image_urls

    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(503, "OPENAI_API_KEY not configured")

    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(404, "Brand context not found — run /analyze first")

    image_urls = _parse_reference_image_urls(ctx.reference_image_urls)
    if not image_urls:
        raise HTTPException(400, "No reference images available. Run /analyze with a website URL first.")

    existing = getattr(ctx, "visual_dna", None) or ""
    if existing and not force:
        return {"visual_dna": existing, "source": "cached", "image_count": len(image_urls)}

    logger.info("visual_dna_requested", workspace_id=str(workspace_id), images=len(image_urls))

    visual_dna = await ensure_visual_dna(
        brand_name=ctx.business_name,
        reference_image_urls=image_urls,
        existing_visual_dna=None,  # force re-analysis path
        api_key=settings.openai_api_key,
    )

    if not visual_dna:
        raise HTTPException(500, "Visual DNA analysis returned empty result — check OpenAI API key and image URLs")

    ctx.visual_dna = visual_dna
    await db.flush()
    await db.commit()

    logger.info("visual_dna_saved", workspace_id=str(workspace_id), chars=len(visual_dna))
    return {
        "visual_dna": visual_dna,
        "source": "analyzed",
        "image_count": len(image_urls),
        "images_used": image_urls,
    }


@router.post("/{workspace_id}/analyze-competitors", response_model=dict)
async def analyze_competitor_intelligence(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    force: bool = False,
):
    """
    Fetch and analyse competitor Instagram accounts listed in brand_context.competitors.
    Stores the result as 'competitor_brief' — injected into Content Strategy Agent prompts.

    - Skips if competitor_brief already populated and force=False.
    - Requires APIFY_API_KEY.
    """
    from app.services.competitor_intelligence_service import build_competitor_brief

    settings = get_settings()
    if not settings.apify_api_key:
        raise HTTPException(503, "APIFY_API_KEY not configured")

    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(404, "Brand context not found")

    existing = getattr(ctx, "competitor_brief", None) or ""
    if existing and not force:
        return {"competitor_brief": existing, "source": "cached"}

    competitors_raw = ctx.competitors or ""

    # Auto-discover competitors when none are configured
    if not competitors_raw and settings.perplexity_api_key:
        try:
            import httpx as _httpx
            location = getattr(ctx, "location", None) or "Turkey"
            business_type = getattr(ctx, "business_type", None) or "business"
            query = (
                f"Top 3-5 competitors of {ctx.business_name}, "
                f"a {business_type} in {location}. "
                f"List only their Instagram handles (without @). Comma-separated."
            )
            async with _httpx.AsyncClient(timeout=15) as client:
                r = await client.post(
                    "https://api.perplexity.ai/chat/completions",
                    headers={"Authorization": f"Bearer {settings.perplexity_api_key}"},
                    json={
                        "model": settings.perplexity_model or "sonar",
                        "messages": [{"role": "user", "content": query}],
                        "max_tokens": 200,
                    },
                )
                if r.status_code == 200:
                    answer = r.json()["choices"][0]["message"]["content"].strip()
                    # Extract @handles or plain handles
                    import re as _re
                    handles = _re.findall(r"@?([\w.]{3,})", answer)
                    competitors_raw = ", ".join(handles[:5]) if handles else ""
                    if competitors_raw:
                        logger.info("competitor_auto_discovered", handles=competitors_raw)
        except Exception as exc:
            logger.warning("competitor_auto_discover_failed", error=str(exc))

    if not competitors_raw:
        return {
            "competitor_brief": "",
            "source": "no_competitors",
            "message": "No competitors configured. Add competitor @handles in Brand Profile, or ensure Perplexity API key is set for auto-discovery.",
        }

    logger.info("competitor_intelligence_requested", workspace_id=str(workspace_id))

    brief = await build_competitor_brief(
        brand_name=ctx.business_name,
        competitors_raw=competitors_raw,
        api_key=settings.apify_api_key,
        timeout=settings.apify_timeout_seconds,
        brand_type=getattr(ctx, "business_type", "") or "business",
        openai_api_key=getattr(settings, "openai_api_key", "") or "",
    )

    if not brief:
        return {"competitor_brief": "", "source": "no_data",
                "message": "Could not fetch competitor data — accounts may be private or unavailable"}

    ctx.competitor_brief = brief
    await db.flush()
    await db.commit()

    logger.info("competitor_brief_saved", workspace_id=str(workspace_id), chars=len(brief))
    return {"competitor_brief": brief, "source": "analyzed"}


@router.post("/{workspace_id}/refresh-trends", response_model=dict)
async def refresh_trend_intelligence(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    force: bool = False,
):
    """
    Build/refresh the weekly trend brief for this workspace.
    Combines seasonal context (location + month) with trending Apify hashtags.
    Stale after 7 days. Injected into Content Strategy Agent automatically.
    """
    from app.services.trend_intelligence_service import build_trend_brief, is_trend_brief_stale
    from app.services.brand_context_service import _parse_json_list

    settings = get_settings()
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(404, "Brand context not found")

    existing = getattr(ctx, "trend_brief", None) or ""
    updated_at = getattr(ctx, "trend_brief_updated_at", None)

    if existing and not force and not is_trend_brief_stale(updated_at):
        return {"trend_brief": existing, "source": "cached", "updated_at": updated_at}

    # Parse keywords and hashtags for enriched trend signals
    raw_keywords = getattr(ctx, "keywords", None) or ""
    kw_list = [k.strip() for k in raw_keywords.replace("\n", ",").split(",") if k.strip()][:5]
    top_hashtags = _parse_json_list(getattr(ctx, "instagram_top_hashtags", None))

    # Determine geo from location
    location_str = ctx.location or "Turkey"
    geo = "TR"
    if any(w in location_str.lower() for w in ["istanbul", "ankara", "bodrum", "turkey", "türkiye"]):
        geo = "TR"

    trend_brief = await build_trend_brief(
        brand_name=ctx.business_name,
        location=location_str,
        content_pillars=_parse_json_list(ctx.content_pillars),
        api_key=settings.apify_api_key or "",
        keywords=kw_list,
        top_hashtags=top_hashtags,
        geo=geo,
    )

    if not trend_brief:
        raise HTTPException(500, "Could not build trend brief")

    from datetime import datetime, timezone
    ctx.trend_brief = trend_brief
    ctx.trend_brief_updated_at = datetime.now(timezone.utc).isoformat()
    await db.flush()
    await db.commit()

    logger.info("trend_brief_saved", workspace_id=str(workspace_id))
    return {"trend_brief": trend_brief, "source": "refreshed", "updated_at": ctx.trend_brief_updated_at}


@router.post("/{workspace_id}/refresh-performance", response_model=dict)
async def refresh_performance_feedback(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch the brand's own Instagram posts, analyse engagement patterns,
    and update learning_context with what's actually working.
    Requires instagram_handle in brand_context and APIFY_API_KEY.
    """
    from app.services.performance_feedback_service import refresh_learning_context_with_performance

    settings = get_settings()
    if not settings.apify_api_key:
        raise HTTPException(503, "APIFY_API_KEY not configured")

    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(404, "Brand context not found")

    handle = getattr(ctx, "instagram_handle", None) or ""
    if not handle:
        raise HTTPException(400, "instagram_handle not set — add it in brand context first")

    existing_learning = getattr(ctx, "learning_context", None) or ""
    updated = await refresh_learning_context_with_performance(
        brand_name=ctx.business_name,
        instagram_handle=handle,
        existing_learning_context=existing_learning,
        api_key=settings.apify_api_key,
    )

    if not updated or updated == existing_learning:
        return {"message": "No new performance data — Instagram posts may not be public or insufficient data", "updated": False}

    # Store in brand_context (not the Suggestions table — that's for internal approvals)
    # We repurpose the learning_context column for the combined signal
    ctx.learning_context = updated
    await db.flush()
    await db.commit()

    logger.info("performance_feedback_saved", workspace_id=str(workspace_id), chars=len(updated))
    return {"learning_context_updated": True, "chars": len(updated), "updated": True}


# ── Gallery Analysis Cache ─────────────────────────────────────────────────────

from pydantic import BaseModel as _BaseModel, ConfigDict as _ConfigDict, Field as _Field

class GalleryAnalysisEntry(_BaseModel):
    model_config = _ConfigDict(populate_by_name=True)

    url: str
    description: str = ""
    content_tags: list[str] = _Field(default_factory=list, alias="contentTags")
    best_for: list[str] = _Field(default_factory=list, alias="bestFor")
    not_good_for: list[str] = _Field(default_factory=list, alias="notGoodFor")
    mood: str = ""
    has_people: bool = _Field(default=False, alias="hasPeople")
    has_text: bool = _Field(default=False, alias="hasText")
    is_logo: bool = _Field(default=False, alias="isLogo")
    suggested_asset_type: str = _Field(default="venue_reference", alias="suggestedAssetType")
    usage_context: str = _Field(default="", alias="usageContext")
    # Sprint 2 (GIS): deterministic analysis quality (0..100) + freshness timestamp
    quality_score: int | None = _Field(default=None, alias="qualityScore")
    analyzed_at: str | None = _Field(default=None, alias="analyzedAt")

class GalleryAnalysisSaveRequest(_BaseModel):
    results: list[GalleryAnalysisEntry]

@router.post("/{workspace_id}/gallery-analysis")
async def save_gallery_analysis(
    workspace_id: uuid.UUID,
    req: GalleryAnalysisSaveRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Persist gallery photo analysis results to avoid re-running expensive vision calls."""
    import json as _json
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Brand context not found")
    # Merge with existing analysis (keep entries for URLs not in current batch)
    existing: dict = {}
    try:
        existing = _json.loads(ctx.gallery_analysis or "{}")
    except Exception:
        pass
    for entry in req.results:
        existing[entry.url] = entry.model_dump(by_alias=True)
    ctx.gallery_analysis = _json.dumps(existing, ensure_ascii=False)
    db.add(ctx)
    await db.commit()
    return {"saved": len(req.results), "total": len(existing)}


@router.get("/{workspace_id}/gallery-analysis")
async def get_gallery_analysis(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Load persisted gallery analysis results."""
    import json as _json
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Brand context not found")
    try:
        data = _json.loads(ctx.gallery_analysis or "{}")
        if not isinstance(data, dict):
            data = {}
    except Exception:
        data = {}
    # Return the flat {url: analysis} dict directly — frontend uses it as-is
    return data


# ── ICS — Idea Contract Score from recent content_ideation nodes ───────────────

@router.get("/{workspace_id}/ics-score")
async def get_ics_score(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Average Idea Contract Score (ICS) computed from the last 5 content_ideation
    nodes for this workspace. Each idea is scored on 9 required fields (0..100).
    """
    import json as _json
    import re as _re
    from sqlalchemy import select as _select, and_ as _and
    from app.models.mission import Mission, MissionTaskNode as _MissionTaskNode

    try:
        result = await db.execute(
            _select(_MissionTaskNode)
            .join(Mission, Mission.id == _MissionTaskNode.mission_id)
            .where(_and(
                Mission.workspace_id == workspace_id,
                _MissionTaskNode.task_type == "content_ideation",
                _MissionTaskNode.status == "completed",
                _MissionTaskNode.output_summary.isnot(None),
            ))
            .order_by(_MissionTaskNode.completed_at.desc())
            .limit(5)
        )
        nodes = result.scalars().all()
    except Exception:
        return {"ics": None, "sample_size": 0}

    all_scores: list[int] = []
    for node in nodes:
        raw = node.output_summary or ""
        m = _re.search(r"\[.*\]", raw, _re.S)
        try:
            ideas = _json.loads(m.group(0)) if m else []
        except Exception:
            ideas = []
        for idea in ideas:
            if not isinstance(idea, dict):
                continue
            vps = idea.get("visual_production_spec") or {}
            cfc = idea.get("canva_field_copy")
            has_cfc_headline = isinstance(cfc, dict) and bool(cfc.get("headline"))
            present = sum([
                bool(idea.get("headline") or idea.get("concept_title")),
                bool(idea.get("caption_draft") or idea.get("caption")),
                bool(idea.get("content_type")),
                bool(idea.get("cta")),
                bool(idea.get("template_use_case")),
                bool(isinstance(vps, dict) and vps.get("selected_gallery_url")),
                bool(isinstance(vps, dict) and vps.get("image_edit_prompt")),
                bool(has_cfc_headline),
                bool(idea.get("hashtags")),
            ])
            all_scores.append(round(present / 9 * 100))

    if not all_scores:
        return {"ics": None, "sample_size": 0}
    ics = round(sum(all_scores) / len(all_scores))
    return {"ics": ics, "sample_size": len(all_scores), "min": min(all_scores), "max": max(all_scores)}


# ── Gallery match-score instrumentation (Sprint 2 / S2.9) ─────────────────────

class GalleryMatchStatsRequest(_BaseModel):
    """Append a batch of caption↔photo match scores to the rolling log."""
    scores: list[float] = _Field(default_factory=list)


_MATCH_LOG_LIMIT = 40


@router.post("/{workspace_id}/gallery-match-stats")
async def append_gallery_match_stats(
    workspace_id: uuid.UUID,
    req: GalleryMatchStatsRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Append match scores, keeping only the most recent ~40 (rolling window)."""
    import json as _json
    from datetime import datetime, timezone
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Brand context not found")
    prev: list[float] = []
    try:
        parsed = _json.loads(ctx.gallery_match_stats or "{}")
        if isinstance(parsed, dict) and isinstance(parsed.get("scores"), list):
            prev = [float(s) for s in parsed["scores"] if isinstance(s, (int, float))]
    except Exception:
        prev = []
    incoming = [float(s) for s in req.scores if isinstance(s, (int, float))]
    merged = (prev + incoming)[-_MATCH_LOG_LIMIT:]
    ctx.gallery_match_stats = _json.dumps(
        {"scores": merged, "updatedAt": datetime.now(timezone.utc).isoformat()},
        ensure_ascii=False,
    )
    db.add(ctx)
    await db.commit()
    return {"count": len(merged), "added": len(incoming)}


@router.get("/{workspace_id}/gallery-match-stats")
async def get_gallery_match_stats(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Load the rolling match-score log."""
    import json as _json
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Brand context not found")
    try:
        data = _json.loads(ctx.gallery_match_stats or "{}")
        if not isinstance(data, dict):
            data = {}
    except Exception:
        data = {}
    scores = data.get("scores") if isinstance(data.get("scores"), list) else []
    return {"scores": scores, "updatedAt": data.get("updatedAt")}


# ── Industry Intelligence ──────────────────────────────────────────────────────

@router.post("/{workspace_id}/industry-intelligence")
async def refresh_industry_intelligence(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    On-demand refresh of industry intelligence calendar for a workspace.
    Called from Brand Hub "Sektör Analizi" button.
    """
    import json as _json
    import asyncio as _asyncio
    from datetime import datetime, timezone
    from app.services.industry_intelligence_service import build_industry_calendar
    from app.services.event_intelligence_service import build_event_intelligence
    from app.services.linkedin_intelligence_service import build_linkedin_intelligence
    from app.services.brand_context_service import build_brand_info

    settings = get_settings()
    brand = await build_brand_info(db, workspace_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand context not found")

    search_kwargs = dict(
        tavily_api_key=getattr(settings, "tavily_api_key", "") or "",
        brave_api_key=getattr(settings, "brave_search_api_key", "") or "",
        perplexity_api_key=settings.perplexity_api_key or "",
    )

    # Run industry calendar + event intelligence + LinkedIn in parallel
    calendar_coro = build_industry_calendar(
        brand,
        openai_api_key=settings.openai_api_key or "",
        perplexity_model=settings.perplexity_model,
        **search_kwargs,
    )
    event_coro = build_event_intelligence(
        location=brand.location or "",
        eventbrite_api_key=getattr(settings, "eventbrite_api_key", "") or "",
        **search_kwargs,
    )
    linkedin_coro = build_linkedin_intelligence(
        brand_name=brand.business_name,
        business_type=brand.business_type or "",
        location=brand.location or "",
        competitors=brand.competitors or "",
        apify_api_key=settings.apify_api_key or "",
        openai_api_key=settings.openai_api_key or "",
        **search_kwargs,
    )

    calendar, event_data, linkedin_data = await _asyncio.gather(
        calendar_coro, event_coro, linkedin_coro
    )

    # Inject real event data into calendar
    if event_data.get("available"):
        calendar["live_event_data"] = event_data
        # Escalate urgency if there are weekend events
        cp = calendar.get("current_phase", {})
        if event_data.get("urgency_level") == "HIGH" and cp.get("urgency_level") != "high":
            cp["urgency_level"] = "high"
            cp["content_posture"] = (
                f"{cp.get('content_posture', '')} | "
                f"🔴 ACİL: Bu hafta sonu {event_data['city']}'da "
                f"{event_data['this_weekend_count']} etkinlik — anlık içerik fırsatı!"
            )

    if linkedin_data.get("available"):
        calendar["linkedin_intelligence"] = linkedin_data

    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Brand context not found")

    ctx.industry_calendar = _json.dumps(calendar, ensure_ascii=False)
    ctx.industry_intelligence_updated_at = datetime.now(timezone.utc).isoformat()
    db.add(ctx)
    await db.commit()

    logger.info(
        "industry_intelligence_refreshed",
        workspace_id=str(workspace_id),
        industry=calendar.get("industry_type", ""),
        event_urgency=event_data.get("urgency_level", "N/A"),
        linkedin_available=linkedin_data.get("available", False),
    )

    return {
        "success": True,
        "industry_type": calendar.get("industry_type", ""),
        "current_phase": calendar.get("current_phase", {}),
        "upcoming_triggers_count": len(calendar.get("upcoming_triggers", [])),
        "event_urgency": event_data.get("urgency_level", "LOW"),
        "event_count": event_data.get("total_events", 0),
        "linkedin_available": linkedin_data.get("available", False),
        "updated_at": ctx.industry_intelligence_updated_at,
    }


@router.get("/{workspace_id}/industry-intelligence")
async def get_industry_intelligence(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get the current industry intelligence calendar."""
    import json as _json
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx or not ctx.industry_calendar:
        return {"available": False}
    try:
        calendar = _json.loads(ctx.industry_calendar)
        return {
            "available": True,
            "calendar": calendar,
            "updated_at": getattr(ctx, "industry_intelligence_updated_at", None),
        }
    except Exception:
        return {"available": False}


# ── Brand DNA ──────────────────────────────────────────────────────────────────

@router.post("/{workspace_id}/brand-dna")
async def synthesise_brand_dna(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """On-demand Brand DNA synthesis."""
    import json as _json
    from datetime import datetime, timezone
    from app.services.brand_dna_service import build_brand_dna
    from app.services.brand_context_service import build_brand_info

    settings = get_settings()
    brand = await build_brand_info(db, workspace_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand context not found")

    dna = await build_brand_dna(brand, openai_api_key=settings.openai_api_key or "")

    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Brand context not found")

    ctx.brand_dna = _json.dumps(dna, ensure_ascii=False)
    ctx.brand_dna_updated_at = datetime.now(timezone.utc).isoformat()
    db.add(ctx)
    await db.commit()

    return {
        "success": True,
        "data_richness": dna.get("data_richness"),
        "brand_essence": dna.get("brand_essence"),
        "current_priority": dna.get("current_strategic_priority"),
        "opportunities_count": len(dna.get("high_value_content_opportunities", [])),
        "agency_recommendation": dna.get("agency_recommendation"),
        "updated_at": ctx.brand_dna_updated_at,
    }


# ── Monthly Brief ──────────────────────────────────────────────────────────────

@router.post("/{workspace_id}/monthly-brief")
async def generate_monthly_brief(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a comprehensive monthly strategic brief."""
    import json as _json
    from datetime import datetime, timezone
    from app.services.monthly_brief_service import build_monthly_brief
    from app.services.brand_context_service import build_brand_info

    settings = get_settings()
    brand = await build_brand_info(db, workspace_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand context not found")

    result = await build_monthly_brief(brand, openai_api_key=settings.openai_api_key or "")

    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if ctx:
        ctx.monthly_brief = _json.dumps(result, ensure_ascii=False)
        ctx.monthly_brief_updated_at = datetime.now(timezone.utc).isoformat()
        db.add(ctx)
        await db.commit()

    return result


# ── Per-Tenant LLM Config ─────────────────────────────────────────────────────

from pydantic import BaseModel as _LLMModel

class LLMConfigRequest(_LLMModel):
    provider: str | None = None   # "openai" | "anthropic" | None (= global routing)
    model: str | None = None      # e.g. "gpt-4o", "claude-opus-4-7"

@router.post("/{workspace_id}/llm-config")
async def set_llm_config(
    workspace_id: uuid.UUID,
    req: LLMConfigRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Set per-tenant LLM provider and model override."""
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Brand context not found")

    allowed_providers = {None, "openai", "anthropic"}
    if req.provider not in allowed_providers:
        raise HTTPException(status_code=400, detail=f"provider must be one of {allowed_providers}")

    ctx.llm_provider = req.provider or None
    ctx.llm_model = req.model or None
    db.add(ctx)
    await db.commit()

    logger.info("tenant_llm_config_updated", workspace_id=str(workspace_id),
                provider=req.provider, model=req.model)
    return {"success": True, "provider": ctx.llm_provider, "model": ctx.llm_model}

@router.get("/{workspace_id}/llm-config")
async def get_llm_config(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Brand context not found")
    return {
        "provider": getattr(ctx, "llm_provider", None),
        "model": getattr(ctx, "llm_model", None),
    }


# ── Pinterest Visual Inspiration ───────────────────────────────────────────────

@router.post("/{workspace_id}/pinterest-inspiration")
async def refresh_pinterest_inspiration(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Scrape Pinterest for visual trends and save to brand context."""
    import json as _json
    from datetime import datetime, timezone
    from app.services.pinterest_scraper_service import build_pinterest_inspiration_brief
    from app.services.brand_context_service import build_brand_info

    settings = get_settings()
    brand = await build_brand_info(db, workspace_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand context not found")

    brief = await build_pinterest_inspiration_brief(
        brand_name=brand.business_name,
        business_type=brand.business_type or "",
        location=brand.location or "",
        apify_api_key=settings.apify_api_key or "",
    )

    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if ctx:
        ctx.visual_inspiration = _json.dumps(brief, ensure_ascii=False)
        ctx.visual_inspiration_updated_at = datetime.now(timezone.utc).isoformat()
        db.add(ctx)
        await db.commit()

    return {
        "success": True,
        "available": brief.get("available", False),
        "pins_count": brief.get("pins_count", 0),
        "visual_themes": brief.get("visual_themes", []),
        "top_pins": brief.get("top_pins", []),
        "brief": brief.get("brief", ""),
        "updated_at": ctx.visual_inspiration_updated_at if ctx else None,
    }


@router.get("/{workspace_id}/pinterest-inspiration")
async def get_pinterest_inspiration(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return cached Pinterest visual inspiration data."""
    import json as _json
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx or not ctx.visual_inspiration:
        return {"available": False, "pins_count": 0, "visual_themes": [], "top_pins": [], "brief": "", "updated_at": None}

    try:
        data = _json.loads(ctx.visual_inspiration)
    except Exception:
        data = {}

    return {
        "available": data.get("available", False),
        "pins_count": data.get("pins_count", 0),
        "visual_themes": data.get("visual_themes", []),
        "top_pins": data.get("top_pins", []),
        "brief": data.get("brief", ""),
        "updated_at": ctx.visual_inspiration_updated_at,
    }

@router.get("/{workspace_id}/all-briefs")
async def get_all_briefs(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return all intelligence briefs for display in BrandHub."""
    import json as _json
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        return {}

    def _load(field: str) -> dict | str | None:
        val = getattr(ctx, field, None)
        if not val:
            return None
        try:
            return _json.loads(val)
        except Exception:
            return val  # return as raw string if not JSON

    return {
        "brand_dna": _load("brand_dna"),
        "brand_dna_updated_at": getattr(ctx, "brand_dna_updated_at", None),
        "industry_calendar": _load("industry_calendar"),
        "industry_intelligence_updated_at": getattr(ctx, "industry_intelligence_updated_at", None),
        "trend_brief": ctx.trend_brief,
        "trend_brief_updated_at": getattr(ctx, "trend_brief_updated_at", None),
        "monthly_brief": _load("monthly_brief"),
        "monthly_brief_updated_at": getattr(ctx, "monthly_brief_updated_at", None),
        "competitor_brief": ctx.competitor_brief,
        "competitor_pulse": getattr(ctx, "competitor_pulse", None),
        "social_signals": _load("social_signals"),
        "social_signals_updated_at": getattr(ctx, "social_signals_updated_at", None),
        "visual_dna": ctx.visual_dna,
        "google_rating": ctx.google_rating,
        "google_review_count": ctx.google_review_count,
        "discovery_confidence": ctx.discovery_confidence,
    }


# ── Language Setting ───────────────────────────────────────────────────────────

from pydantic import BaseModel as _BM

class LanguageUpdateRequest(_BM):
    language: str  # e.g. "tr", "en", "de"

@router.post("/{workspace_id}/set-language")
async def set_content_language(
    workspace_id: uuid.UUID,
    req: LanguageUpdateRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update the content generation language for this workspace."""
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Brand context not found")
    ctx.languages = req.language.lower().strip()
    db.add(ctx)
    await db.commit()
    logger.info("language_updated", workspace_id=str(workspace_id), language=ctx.languages)
    return {"success": True, "language": ctx.languages}


# ── Social Listening ───────────────────────────────────────────────────────────

@router.post("/{workspace_id}/social-listening")
async def run_social_listening_endpoint(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """On-demand social listening scan."""
    import json as _json
    from datetime import datetime, timezone
    from app.services.social_listening_service import run_social_listening
    from app.services.brand_context_service import build_brand_info

    settings = get_settings()
    brand = await build_brand_info(db, workspace_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand context not found")

    signals = await run_social_listening(
        brand,
        openai_api_key=settings.openai_api_key or "",
        perplexity_api_key=settings.perplexity_api_key or "",
        apify_api_key=settings.apify_api_key or "",
        brand24_api_key=settings.brand24_api_key or "",
    )

    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if ctx:
        ctx.social_signals = _json.dumps(signals, ensure_ascii=False)
        ctx.social_signals_updated_at = datetime.now(timezone.utc).isoformat()
        db.add(ctx)
        await db.commit()

    return {
        "success": True,
        "brief": signals.get("brief", ""),
        "hashtag_count": len(signals.get("hashtag_trends", {})),
        "has_brand_mentions": bool(signals.get("brand_mentions")),
        "has_web_intelligence": bool(signals.get("web_intelligence", {}).get("brand_web_presence")),
        "updated_at": ctx.social_signals_updated_at if ctx else None,
    }


# ── Human Review ───────────────────────────────────────────────────────────────

from pydantic import BaseModel as _BM2

class ReviewSubmitRequest(_BM2):
    review_id: str
    status: str  # approved | rejected | edited
    notes: str = ""
    edited_content: str = ""
    reviewer_name: str = ""

@router.get("/{workspace_id}/reviews/pending")
async def get_pending_reviews(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list:
    from app.services.human_review_service import get_pending_reviews as _get
    return await _get(db, workspace_id)

@router.post("/{workspace_id}/reviews/submit")
async def submit_review(
    workspace_id: uuid.UUID,
    req: ReviewSubmitRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    from app.services.human_review_service import submit_review as _submit
    return await _submit(db, req.review_id, req.status, req.notes or None,
                         req.edited_content or None, req.reviewer_name or None)

@router.get("/{workspace_id}/reviews/stats")
async def review_stats(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    from app.services.human_review_service import get_review_stats as _stats
    return await _stats(db, workspace_id)


# ── Video Production ───────────────────────────────────────────────────────────

from pydantic import BaseModel as _VideoModel

class VideoProductionRequest(_VideoModel):
    title: str
    caption: str = ""
    visual_direction: str = ""
    gallery_photos: list[dict] = []

@router.post("/{workspace_id}/video-production-spec")
async def generate_video_production_spec(
    workspace_id: uuid.UUID,
    req: VideoProductionRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Video Production Agent: selects best gallery photo + crafts Runway prompt.
    Called from Content Studio when user clicks 'AI Reel Üret'.
    """
    from app.services.brand_context_service import build_brand_info
    from app.crew.crews.video_production_crew import run_video_production

    brand = await build_brand_info(db, workspace_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand context not found")

    if not req.gallery_photos:
        raise HTTPException(status_code=400, detail="gallery_photos is required")

    result = await __import__('asyncio').get_event_loop().run_in_executor(
        None,
        lambda: run_video_production(
            brand=brand,
            title=req.title,
            caption=req.caption,
            visual_direction=req.visual_direction,
            gallery_photos=req.gallery_photos,
        )
    )

    return result


# ── Brand Video Pack (Creatomate) ─────────────────────────────────────────────

from pydantic import BaseModel as _VideoPackModel

class BrandVideoPackRequest(_VideoPackModel):
    video_url: str
    title: str
    cta: str = "Keşfet"
    subtitle: str = ""
    event_date: str = ""
    formats: list[str] = []
    wait_for_completion: bool = True
    # Kaynak fotoğraf URL'si — GPT-4o Vision analizi için (Runway'e gönderilen fotoğraf)
    source_image_url: str = ""
    # Background music — CC0 royalty-free track URL baked into the final video
    music_url: str = ""
    music_volume: float = 0.55

class BrandTemplateConfigRequest(_VideoPackModel):
    primary_color: str = "#1a1a2e"
    accent_color: str = "#e8c97a"
    font_family: str = "Montserrat"
    overlay_opacity: float = 0.55

@router.post("/{workspace_id}/brand-video-pack")
async def create_brand_video_pack(
    workspace_id: uuid.UUID,
    req: BrandVideoPackRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Render a branded video pack via Creatomate.
    Takes one Runway video URL and produces up to 5 format outputs.
    """
    from app.services.creatomate_service import (
        BrandTemplate, VideoPackInput, render_video_pack, is_creatomate_configured
    )

    settings = get_settings()
    if not is_creatomate_configured(settings.creatomate_api_key):
        raise HTTPException(status_code=503, detail="Creatomate API key not configured. Set CREATOMATE_API_KEY.")

    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Brand context not found")

    # Build per-tenant brand template from DB config
    brand_tmpl = BrandTemplate(
        primary_color=getattr(ctx, "brand_primary_color", None) or "#1a1a2e",
        accent_color=getattr(ctx, "brand_accent_color", None) or "#e8c97a",
        font_family=getattr(ctx, "brand_font_family", None) or "Montserrat",
        overlay_opacity=float(getattr(ctx, "brand_overlay_opacity", None) or 0.55),
        logo_url=getattr(ctx, "logo_url", None) or "",
        tenant_name=ctx.business_name or "",
    )

    # GPT-4o Vision analizi — kaynak fotoğraftan kompozisyon kılavuzu üret
    visual_spec = None
    if req.source_image_url and settings.openai_api_key:
        try:
            from app.services.visual_composition_service import analyze_image_for_composition
            visual_spec = await analyze_image_for_composition(
                image_url=req.source_image_url,
                openai_api_key=settings.openai_api_key,
                brand_name=ctx.business_name or "",
                content_title=req.title,
            )
            logger.info(
                "visual_composition_spec_ready",
                workspace_id=str(workspace_id),
                text_zone=visual_spec.text_zone,
                opacity=visual_spec.overlay_opacity,
                max_lines=visual_spec.max_text_lines,
                summary=visual_spec.analysis_summary[:60],
            )
        except Exception as exc:
            logger.warning("visual_composition_analysis_failed", error=str(exc))

    pack_input = VideoPackInput(
        video_url=req.video_url,
        title=req.title,
        cta=req.cta,
        subtitle=req.subtitle,
        event_date=req.event_date,
        tenant_id=str(workspace_id),
        brand=brand_tmpl,
        visual_spec=visual_spec,
        music_url=req.music_url,
        music_volume=req.music_volume,
    )

    formats = req.formats or ["reel", "story", "feed", "teaser"]
    if req.event_date and "event" not in formats:
        formats.append("event")

    # 3 farklı tasarım stili paralel üret ve render et
    from app.services.graphic_design_service import render_style_variants, DESIGN_STYLES
    style_results = await render_style_variants(
        pack_input,
        creatomate_api_key=settings.creatomate_api_key,
        openai_api_key=settings.openai_api_key or "",
        formats=formats,
        wait_for_completion=req.wait_for_completion,
    )

    total_succeeded = sum(
        1 for renders in style_results.values()
        for r in renders if r.status == "succeeded"
    )
    logger.info(
        "brand_video_pack_rendered",
        workspace_id=str(workspace_id),
        styles=list(style_results.keys()),
        total_succeeded=total_succeeded,
        used_ai_design=True,
    )

    # Style metadata
    style_meta = {s.key: {"label": s.label, "description": s.description}
                  for s in DESIGN_STYLES}

    return {
        "success": True,
        "variants": {
            style_key: {
                "label": style_meta.get(style_key, {}).get("label", style_key),
                "description": style_meta.get(style_key, {}).get("description", ""),
                "renders": [
                    {
                        "format": r.format,
                        "status": r.status,
                        "render_id": r.render_id,
                        "output_url": r.output_url,
                        "width": r.width,
                        "height": r.height,
                        "duration": r.duration,
                        "error": r.error,
                    }
                    for r in renders
                ],
            }
            for style_key, renders in style_results.items()
        },
        # Geriye dönük uyumluluk — eski "renders" alanı (minimal stili)
        "renders": [
            {
                "format": r.format,
                "status": r.status,
                "render_id": r.render_id,
                "output_url": r.output_url,
                "width": r.width,
                "height": r.height,
                "duration": r.duration,
                "error": r.error,
            }
            for r in style_results.get("minimal", [])
        ],
        "succeeded": total_succeeded,
        "total": sum(len(v) for v in style_results.values()),
    }


@router.post("/{workspace_id}/brand-template-config")
async def set_brand_template_config(
    workspace_id: uuid.UUID,
    req: BrandTemplateConfigRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Save per-tenant brand template config (colors, font, opacity)."""
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Brand context not found")

    ctx.brand_primary_color = req.primary_color
    ctx.brand_accent_color = req.accent_color
    ctx.brand_font_family = req.font_family
    ctx.brand_overlay_opacity = req.overlay_opacity
    db.add(ctx)
    await db.commit()

    logger.info("brand_template_config_saved", workspace_id=str(workspace_id))
    return {
        "success": True,
        "primary_color": ctx.brand_primary_color,
        "accent_color": ctx.brand_accent_color,
        "font_family": ctx.brand_font_family,
        "overlay_opacity": float(ctx.brand_overlay_opacity or 0.55),
    }


@router.get("/{workspace_id}/brand-template-config")
async def get_brand_template_config(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Brand context not found")
    return {
        "primary_color": getattr(ctx, "brand_primary_color", None) or "#1a1a2e",
        "accent_color": getattr(ctx, "brand_accent_color", None) or "#e8c97a",
        "font_family": getattr(ctx, "brand_font_family", None) or "Montserrat",
        "overlay_opacity": float(getattr(ctx, "brand_overlay_opacity", None) or 0.55),
        "logo_url": getattr(ctx, "logo_url", None) or "",
        "business_name": ctx.business_name or "",
    }


# ── Creatomate Template Render ─────────────────────────────────────────────────

from pydantic import BaseModel as _TplModel

class TemplateRenderRequest(_TplModel):
    template_id: str
    video_url: str = ""
    image_url: str = ""
    title: str = ""
    subtitle: str = ""
    cta: str = ""
    event_date: str = ""
    brand_name: str = ""
    # İstediğiniz herhangi bir ek alan — element_name: değer
    extra_modifications: dict[str, str] = {}
    wait_for_completion: bool = True

@router.post("/{workspace_id}/template-render")
async def render_with_template(
    workspace_id: uuid.UUID,
    req: TemplateRenderRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Creatomate template ID + modifications ile render.
    Template Creatomate Studio'da tasarlanır, ID buraya gelir.
    """
    import httpx as _httpx
    settings = get_settings()
    api_key = settings.creatomate_api_key
    if not api_key:
        raise HTTPException(status_code=503, detail="CREATOMATE_API_KEY eksik")

    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    brand_name = req.brand_name or (ctx.business_name if ctx else "") or ""

    # Standart modification map — template element adlarıyla eşleşmeli
    modifications: dict[str, str] = {}
    if req.video_url:
        for key in ("Video-1.source", "Video.source", "video.source", "Background-Video.source"):
            modifications[key] = req.video_url
    if req.image_url:
        for key in ("Image-1.source", "Image.source", "Background-Image.source"):
            modifications[key] = req.image_url
    if req.title:
        for key in ("Title-1.text", "Title.text", "Headline.text", "Main-Title.text"):
            modifications[key] = req.title
    if req.subtitle:
        for key in ("Subtitle.text", "Subtitle-1.text", "Description.text"):
            modifications[key] = req.subtitle
    if req.cta:
        for key in ("CTA.text", "CTA-1.text", "Button.text", "Call-To-Action.text"):
            modifications[key] = req.cta
    if req.event_date:
        for key in ("Date.text", "Event-Date.text", "Date-1.text"):
            modifications[key] = req.event_date
    if brand_name:
        for key in ("Brand-Name.text", "Brand.text", "Logo-Text.text", "Business-Name.text"):
            modifications[key] = brand_name
    # Kullanıcının override ettiği alanlar
    modifications.update(req.extra_modifications)

    async with _httpx.AsyncClient(timeout=300) as client:
        # Submit
        r = await client.post(
            "https://api.creatomate.com/v1/renders",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"template_id": req.template_id, "modifications": modifications},
        )
        if r.status_code not in (200, 201, 202):
            raise HTTPException(status_code=r.status_code,
                detail=f"Creatomate: {r.text[:200]}")
        data = r.json()
        render = data[0] if isinstance(data, list) else data
        render_id = render.get("id", "")

        if not req.wait_for_completion:
            return {"success": True, "render_id": render_id, "status": "pending"}

        # Poll
        import asyncio as _aio
        for _ in range(60):
            await _aio.sleep(4)
            r2 = await client.get(
                f"https://api.creatomate.com/v1/renders/{render_id}",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            d = r2.json()
            status = d.get("status", "")
            if status == "succeeded":
                return {
                    "success": True,
                    "render_id": render_id,
                    "status": "succeeded",
                    "output_url": d.get("url", ""),
                    "modifications_sent": modifications,
                }
            if status == "failed":
                raise HTTPException(status_code=422,
                    detail=f"Render failed: {d.get('error_message','unknown')}")

        raise HTTPException(status_code=408, detail="Render timeout (4 dk)")


# ── Creatomate Template Management ────────────────────────────────────────────

@router.post("/templates/seed")
async def seed_creatomate_templates() -> dict:
    """4 SmartAgency template'ini Creatomate hesabına kaydet (bir kez çalıştır)."""
    from app.services.creatomate_template_service import seed_templates
    settings = get_settings()
    if not settings.creatomate_api_key:
        raise HTTPException(status_code=503, detail="CREATOMATE_API_KEY eksik")
    templates = await seed_templates(settings.creatomate_api_key)
    return {"success": True, "templates": templates, "count": len(templates)}


@router.get("/templates/list")
async def list_creatomate_templates() -> dict:
    """Hesaptaki SmartAgency template'lerini listele (Brand Hub UI için)."""
    from app.services.creatomate_template_service import list_account_templates
    settings = get_settings()
    if not settings.creatomate_api_key:
        return {"templates": [], "seeded": False}
    templates = await list_account_templates(settings.creatomate_api_key)
    return {"templates": templates, "seeded": len(templates) > 0}


@router.post("/{workspace_id}/assign-template")
async def assign_template_to_brand(
    workspace_id: uuid.UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Brand'a Creatomate template ata. body: {template_id: str}"""
    template_id = body.get("template_id", "")
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Brand context not found")
    ctx.creatomate_template_id = template_id or None
    db.add(ctx)
    await db.commit()
    logger.info("template_assigned", workspace_id=str(workspace_id), template_id=template_id)
    return {"success": True, "template_id": ctx.creatomate_template_id}


@router.post("/{workspace_id}/creatomate-bundle")
async def generate_creatomate_bundle(
    workspace_id: uuid.UUID,
    req: dict,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Generate Creatomate brand bundle (2 story + 1 post) using real vibe profile from DB.
    Called from Next.js /api/creatomate/bundle → fire-and-forget from auto-produce.
    """
    from app.services.creatomate_brand_bundle import (
        resolve_tokens_from_brand, generate_brand_bundle
    )
    from app.services.brand_context_service import build_brand_info
    from app.config import get_settings

    settings = get_settings()
    api_key = req.get("api_key") or settings.creatomate_api_key
    if not api_key:
        raise HTTPException(status_code=503, detail="CREATOMATE_API_KEY not configured")

    brand = await build_brand_info(db, workspace_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand context not found")

    tokens = resolve_tokens_from_brand(brand)
    results = await generate_brand_bundle(
        api_key=api_key,
        workspace_id=workspace_id,
        photo_url=req.get("photo_url", ""),
        title=req.get("title", ""),
        subtitle=req.get("subtitle", ""),
        date_badge=req.get("date_badge", ""),
        brand_name=req.get("brand_name") or brand.business_name or "",
        tokens=tokens,
        nexus_api=settings.nexus_api_url if hasattr(settings, "nexus_api_url") else "http://127.0.0.1:5050",
        internal_key=settings.internal_api_key if hasattr(settings, "internal_api_key") else "smartagency-internal-dev-key",
    )

    saved   = sum(1 for r in results if r.status == "succeeded")
    failed  = sum(1 for r in results if r.status != "succeeded")
    return {
        "bundle_id": req.get("bundle_id"),
        "saved": saved, "failed": failed,
        "results": [
            {"slot": r.slot, "status": r.status, "template": r.template_key,
             "artifact_id": r.artifact_id, "error": r.error}
            for r in results
        ],
    }


@router.post("/{workspace_id}/template-video-pack")
async def render_template_video_pack(
    workspace_id: uuid.UUID,
    req: BrandVideoPackRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Brand'a atanmış template ile video render.
    Template atanmamışsa hata döner.
    """
    from app.services.creatomate_template_service import render_with_template
    settings = get_settings()
    if not settings.creatomate_api_key:
        raise HTTPException(status_code=503, detail="CREATOMATE_API_KEY eksik")

    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Brand context not found")

    template_id = getattr(ctx, "creatomate_template_id", None)
    if not template_id:
        raise HTTPException(status_code=400,
            detail="Bu brand'a template atanmamış. Önce Brand Hub'dan template seçin.")

    accent_color = getattr(ctx, "brand_accent_color", None) or "#c9a96e"

    result = await render_with_template(
        api_key=settings.creatomate_api_key,
        template_id=template_id,
        video_url=req.video_url,
        title=req.title,
        brand_name=ctx.business_name or "",
        date_badge=req.event_date,
        accent_color=accent_color,
    )

    return {
        "success": result.get("status") == "succeeded",
        "render_id": result.get("render_id", ""),
        "status": result.get("status"),
        "output_url": result.get("output_url", ""),
        "template_id": template_id,
        "modifications": result.get("modifications", {}),
    }


# ── Auto Template Render ───────────────────────────────────────────────────────

from pydantic import BaseModel as _AutoRenderModel

class AutoRenderRequest(_AutoRenderModel):
    video_url: str
    title: str
    content_use: str = "brand_story"   # event / product / social_proof / promotional / bts / educational
    format: str = "reel_9x16"          # reel_9x16 | story_9x16 | feed_1x1
    urgency_level: str = "low"         # low | medium | high
    event_date: str = ""
    subtitle: str = ""
    visual_tone: str = "dark"          # dark | light | mixed (Vision analizi sonucu)

@router.post("/{workspace_id}/auto-render")
async def auto_template_render(
    workspace_id: uuid.UUID,
    req: AutoRenderRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Tam otomatik pipeline — Shotstack öncelikli, Creatomate fallback:
    Brand profili → Template Brain → template seç → render → URL döner.
    Hiçbir manuel seçim gerekmez.
    """
    from app.services.shotstack_service import auto_render as shotstack_auto_render

    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY eksik")

    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Brand context not found")

    # format normalise: "reel_9x16" → "reel", "story_9x16" → "story", "feed_1x1" → "feed"
    fmt = req.format.split("_")[0]  # reel | story | feed

    # Shotstack önce dene (sandbox ücretsiz)
    shotstack_key = getattr(settings, "shotstack_api_key", "") or ""
    shotstack_env = getattr(settings, "shotstack_env", "stage") or "stage"

    if shotstack_key:
        try:
            result = await shotstack_auto_render(
                api_key=shotstack_key,
                env=shotstack_env,
                openai_api_key=settings.openai_api_key,
                business_type=ctx.business_type or "",
                brand_name=ctx.business_name or "",
                brand_tone=ctx.brand_tone or "professional",
                video_url=req.video_url,
                title=req.title,
                content_use=req.content_use,
                format=fmt,
                urgency_level=req.urgency_level,
                event_date=req.event_date,
            )
            logger.info("auto_render_shotstack_complete",
                workspace_id=str(workspace_id),
                template=result.get("template_key"),
                status=result.get("status"))
            return {**result, "provider": "shotstack"}
        except Exception as exc:
            logger.warning("shotstack_auto_render_failed", error=str(exc))

    # Creatomate fallback
    creatomate_key = settings.creatomate_api_key or ""
    if creatomate_key:
        from app.services.template_brain_service import auto_render as cm_auto_render
        result = await cm_auto_render(
            brand_name=ctx.business_name or "",
            business_type=ctx.business_type or "",
            brand_tone=ctx.brand_tone or "professional",
            primary_color=getattr(ctx, "brand_primary_color", None) or "#1a1a2e",
            accent_color=getattr(ctx, "brand_accent_color", None) or "#c9a96e",
            video_url=req.video_url,
            title=req.title,
            content_use=req.content_use,
            format=req.format,
            urgency_level=req.urgency_level,
            event_date=req.event_date,
            subtitle=req.subtitle,
            visual_tone=req.visual_tone,
            openai_api_key=settings.openai_api_key,
            creatomate_api_key=creatomate_key,
        )
        return {**result, "provider": "creatomate"}

    raise HTTPException(status_code=503,
        detail="Shotstack veya Creatomate API key eksik. En az birini yapılandırın.")


# ── Shotstack Template Management ─────────────────────────────────────────────

@router.post("/shotstack/templates/seed")
async def seed_shotstack_templates() -> dict:
    """12 SmartAgency template'ini Shotstack'a yükle (bir kez)."""
    from app.services.shotstack_service import seed_templates
    settings = get_settings()
    key = getattr(settings, "shotstack_api_key", "") or ""
    env = getattr(settings, "shotstack_env", "stage") or "stage"
    if not key:
        raise HTTPException(status_code=503, detail="SHOTSTACK_API_KEY eksik")
    templates = await seed_templates(key, env)
    return {"success": True, "templates": templates, "count": len(templates)}


@router.get("/shotstack/templates/list")
async def list_shotstack_templates() -> dict:
    """Hesaptaki Shotstack template'lerini metadatalarıyla listele."""
    from app.services.shotstack_service import list_templates, SHOTSTACK_TEMPLATES
    settings = get_settings()
    key = getattr(settings, "shotstack_api_key", "") or ""
    env = getattr(settings, "shotstack_env", "stage") or "stage"

    if not key:
        # Key yoksa statik tanımları döndür (henüz seed edilmemiş ama görünür)
        return {
            "templates": [
                {
                    "key": t["key"], "label": t["label"], "format": t["format"],
                    "tone": t["tone"], "description": t["description"],
                    "thumbnail_color": t["thumbnail_color"],
                    "brand_types": t["brand_types"], "content_uses": t["content_uses"],
                    "template_id": "", "seeded": False,
                }
                for t in SHOTSTACK_TEMPLATES
            ],
            "seeded": False,
        }

    account_templates = await list_templates(key, env)
    seeded_keys = {t["key"] for t in account_templates}

    # Tüm tanımlı template'leri döndür, seed olanları işaretle
    return {
        "templates": [
            {
                "key": t["key"], "label": t["label"], "format": t["format"],
                "tone": t["tone"], "description": t["description"],
                "thumbnail_color": t["thumbnail_color"],
                "brand_types": t["brand_types"], "content_uses": t["content_uses"],
                "template_id": next((a["template_id"] for a in account_templates if a["key"] == t["key"]), ""),
                "seeded": t["key"] in seeded_keys,
            }
            for t in SHOTSTACK_TEMPLATES
        ],
        "seeded": len(seeded_keys) > 0,
        "seeded_count": len(seeded_keys),
    }


# ── Visual Design Cards endpoint ──────────────────────────────────────────────

@router.post("/{workspace_id}/design-cards")
async def generate_design_cards(
    workspace_id: uuid.UUID,
    request: dict = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Runs the visual_design_cards agent for a workspace and returns
    3 design card specs with image_generation_prompts.

    Each card can be rendered by /api/generate-instagram-image
    with designCardPrompt + referenceImageUrls.
    """
    import asyncio as _asyncio
    from app.services.brand_context_service import build_brand_info
    from app.crew.engine import get_crew_engine
    from app.services.tenant_learning_service import (
        build_tenant_learning_snapshot,
        build_learning_context_prompt,
    )

    settings = get_settings()
    brand = await build_brand_info(db, workspace_id)
    if not brand:
        raise HTTPException(404, "Brand context not configured for this workspace")

    # Inject learning context
    try:
        snap = await build_tenant_learning_snapshot(db, str(workspace_id))
        lc = build_learning_context_prompt(snap)
        if lc:
            brand.learning_context = lc
    except Exception:
        pass

    body = request or {}
    brief = body.get("brief", "") if isinstance(body, dict) else ""
    count = int(body.get("count", 3)) if isinstance(body, dict) else 3

    engine = get_crew_engine()
    try:
        result = await _asyncio.to_thread(
            engine.execute,
            "content_agent",
            "visual_design_cards",
            brand,
            {"brief": brief, "count": count, "content_pillars": brand.content_pillars},
        )
    except Exception as exc:
        raise HTTPException(500, f"Design card generation failed: {exc}") from exc

    import json as _json
    raw = result.get("raw_output", "") or ""

    # Parse cards from output
    cards = []
    try:
        cleaned = raw.replace("```json", "").replace("```", "").strip()
        parsed = _json.loads(cleaned)
        if isinstance(parsed, list):
            cards = parsed
        elif isinstance(parsed, dict) and "cards" in parsed:
            cards = parsed["cards"]
    except Exception:
        # Try finding JSON array in prose
        import re
        m = re.search(r"\[.*\]", raw, re.DOTALL)
        if m:
            try:
                cards = _json.loads(m.group())
            except Exception:
                pass

    return {
        "workspace_id": str(workspace_id),
        "cards": cards,
        "raw_output": raw[:500] if not cards else "",
        "count": len(cards),
    }


@router.get("/{workspace_id}/tenant-learning")
async def get_tenant_learning_prompt(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Approved/rejected history as markdown for production prompts (MT-10)."""
    from app.services.tenant_learning_service import (
        build_tenant_learning_snapshot,
        build_learning_context_prompt,
    )

    await brand_context_service.ensure_brand_context(db, workspace_id)
    try:
        snap = await build_tenant_learning_snapshot(db, str(workspace_id))
        prompt = build_learning_context_prompt(snap)
    except Exception as exc:
        logger.warning(
            "tenant_learning_fetch_failed",
            workspace_id=str(workspace_id),
            error=str(exc)[:120],
        )
        return {"prompt": "", "has_learning": False, "approved_count": 0, "rejected_count": 0}

    return {
        "prompt": prompt or "",
        "has_learning": bool(prompt),
        "approved_count": len(snap.approved_examples),
        "rejected_count": len(snap.rejected_patterns),
    }


@router.post("/{workspace_id}/design-director")
async def design_director(
    workspace_id: uuid.UUID,
    request: dict = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Design Director — GPT-4o direct call (fast: 3-8s).

    Takes a content brief + brand context and returns 3 fully specified
    design variants (IMPACT / EDITORIAL / MINIMAL), each with an
    `image_edit_prompt` ready for GPT-image-1 images.edit and a
    `canvas_spec` fallback for offline Canvas rendering.

    Much faster than CrewAI visual_design_cards (3s vs 90s).
    """
    import json as _json
    import httpx as _httpx

    settings = get_settings()
    openai_key = settings.openai_api_key if hasattr(settings, "openai_api_key") else None
    import os
    if not openai_key:
        openai_key = os.environ.get("OPENAI_API_KEY", "")
    if not openai_key:
        raise HTTPException(500, "OPENAI_API_KEY not configured")

    from app.services.brand_context_service import build_brand_info
    brand = await build_brand_info(db, workspace_id)
    if not brand:
        raise HTTPException(404, "Brand context not configured for this workspace")

    body = request or {}
    headline          = body.get("headline", "")
    cta               = body.get("cta", "")
    caption_context   = body.get("caption_context", "")
    content_format    = body.get("format", "post")
    content_type_label = body.get("content_type_label", content_format)
    # Mission & idea vibe context
    mission_brief     = body.get("mission_brief", "")
    strategic_purpose = body.get("strategic_purpose", "")
    visual_direction  = body.get("visual_direction", "")
    agent_image_prompt = body.get("agent_image_prompt", "")
    content_pillar    = body.get("content_pillar", "")
    mood              = body.get("mood", "")

    is_vertical = content_format in ("story", "reel")
    aspect_label = "9:16 vertical (1080x1920)" if is_vertical else "1:1 square (1080x1080)"

    ref_urls = brand.reference_image_urls[:6] if brand.reference_image_urls else []
    photo_list = "\n".join(f"  {i+1}. {u}" for i, u in enumerate(ref_urls)) if ref_urls else "  (none available)"

    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    primary_color = (getattr(ctx, "brand_primary_color", None) or "#1a1a2e").strip()
    accent_color  = (getattr(ctx, "brand_accent_color",  None) or "#c9a96e").strip()
    logo_url      = getattr(ctx, "logo_url", None) or ""
    brand_name    = brand.business_name or "Brand"
    location      = brand.location or ""
    visual_dna    = (brand.visual_dna or brand.visual_style or "warm coastal natural light")[:300]
    brand_tone    = brand.brand_tone or "professional"
    default_ctas  = " | ".join(brand.default_ctas[:3]) if brand.default_ctas else "Keşfet | Rezervasyon"
    badge_text    = f"{brand_name} {location}".strip()[:30]

    _cta      = cta or default_ctas.split("|")[0].strip()
    _headline = headline or brand_name

    # Build vibe block — the most important context for design decisions
    vibe_lines = []
    if mission_brief:
        vibe_lines.append(f"Mission brief: {mission_brief}")
    if strategic_purpose:
        vibe_lines.append(f"Strategic purpose: {strategic_purpose}")
    if content_pillar:
        vibe_lines.append(f"Content pillar: {content_pillar}")
    if mood:
        vibe_lines.append(f"Mood/tone: {mood}")
    if visual_direction:
        vibe_lines.append(f"Content agent's visual direction: {visual_direction}")
    if agent_image_prompt:
        vibe_lines.append(f"Content agent's image suggestion: {agent_image_prompt}")

    vibe_block = "\n".join(vibe_lines) if vibe_lines else "(no additional context)"

    system_prompt = (
        "You are a senior art director at a world-class creative agency (think Wieden+Kennedy, "
        "Mother London, Droga5). You design premium social content.\n\n"
        "THE GOLDEN RULE: Less text = more impact. Real agency work puts 1-3 words on an image, "
        "NEVER a full sentence. The photo carries 90% of the message.\n\n"
        "TEXT ON IMAGE RULES (non-negotiable):\n"
        "- Headline: 1, 2 or MAX 3 words. That's it. No exceptions.\n"
        "- No CTA text on the image. CTAs belong in the caption.\n"
        "- No brand name written as text. Use the logo graphic only.\n"
        "- No sublines with full sentences. Max 2 words if any.\n"
        "- The fewer words, the more premium it feels.\n\n"
        "The 1-3 words must distill the ENTIRE brief vibe into one evocative hook: "
        "'GOLDEN HOUR', 'JUST ARRIVED', 'TASTE THIS', 'SUN DOWN', 'STAY AWHILE'. "
        "Think Helmut Lang campaign copy, not a brochure headline.\n\n"
        "Read the content vibe and let it drive every design decision. "
        "You NEVER invent new photos. You work with real venue photos as background."
    )

    logo_block = (
        f"Official brand logo URL: {logo_url}\n"
        "This is the REAL logo — it must appear in all designs instead of text badges.\n"
        "In image_edit_prompts: write 'Place the brand logo from the provided reference image at [position], "
        "max 14% of canvas width, rendered faithfully as-is — do NOT reimagine or reinterpret it.'\n"
        "In canvas_spec: include logo_url so the Canvas compositor can draw the actual image."
        if logo_url else
        f"No logo URL available — use text badge: '{badge_text}'"
    )

    user_prompt = f"""Design 3 Instagram card concepts for: **{brand_name}** ({brand.business_type}, {location})

━━ BRAND ━━
DNA: {visual_dna}
Tone: {brand_tone}
Primary color: {primary_color}  Accent color: {accent_color}

━━ BRAND LOGO ━━
{logo_block}

━━ CONTENT VIBE (most important — let this shape every design decision) ━━
{vibe_block}

━━ COPY ━━
Headline: "{_headline}"
CTA: "{_cta}"
Caption: {caption_context or "(none)"}
Format: {content_type_label} — {aspect_label}

━━ AVAILABLE VENUE PHOTOS ━━
{photo_list}

━━ INSTRUCTIONS ━━
Read the vibe context above carefully. Ask yourself:
- Is this content energetic/celebratory → lean IMPACT
- Is this content editorial/announcement → lean EDITORIAL
- Is this content subtle/atmospheric → lean MINIMAL

Then design all 3 variants BUT adjust their energy to match the vibe.
For example, if vibe is "summer party, drink & chill, vibrant", even the MINIMAL
variant should feel warm and alive — not cold and corporate.

Return EXACTLY this JSON (no markdown):

{{
  "designs": [
    {{
      "template": "impact",
      "vibe_reading": "<1 sentence: how you read the vibe and how it shaped this design>",
      "headline": "1-3 WORDS MAX — evocative, vibe-driven, ALL CAPS",
      "subline": "",
      "primary_color": "<hex derived from vibe + brand>",
      "accent_color": "<hex for headline — warm if festive, cool if calm>",
      "photo_url": "<pick the most vibe-matching URL from the list, or empty>",
      "image_edit_prompt": "The existing venue photograph must remain COMPLETELY UNCHANGED as the background. ADD ONLY: [1] A gradient scrim bottom {35 if is_vertical else 40}% height, rgba matching vibe temperature. [2] The 1-3 word headline in condensed bold ALL-CAPS — exact hex color, exact px size, exact position. [3] The brand logo graphic placed at top-{'center' if is_vertical else 'left'} at 12% canvas width — render it faithfully from the reference. NO other text elements.",
      "canvas_spec": {{
        "template": "impact",
        "headline_color": "<hex>",
        "overlay_rgba": "rgba(r,g,b,opacity — vibe-matched)",
        "logo_url": "{logo_url}",
        "logo_position": "top_left"
      }}
    }},
    {{
      "template": "editorial",
      "vibe_reading": "<1 sentence>",
      "headline": "1-2 words — lowercase, calm, brand-tone",
      "subline": "",
      "primary_color": "<hex>",
      "accent_color": "<hex>",
      "photo_url": "<best vibe-match URL or empty>",
      "image_edit_prompt": "The existing venue photograph must remain COMPLETELY UNCHANGED as the background. ADD ONLY: [1] A very subtle top band 6% height with brand primary color at 70% opacity. [2] The 1-2 word headline in elegant serif or geometric sans — exact hex, exact px, positioned at natural dark zone in photo. [3] A thin accent line 2px wide below headline. [4] The brand logo at top-center 10% canvas width. NO CTA. NO sublines. NO extra text.",
      "canvas_spec": {{
        "template": "editorial",
        "headline_color": "<hex>",
        "overlay_rgba": "rgba(r,g,b,0.08)",
        "logo_url": "{logo_url}",
        "logo_position": "top_center"
      }}
    }},
    {{
      "template": "minimal",
      "vibe_reading": "<1 sentence>",
      "headline": "1 word — single evocative word only",
      "subline": "",
      "primary_color": "<hex>",
      "accent_color": "<hex>",
      "photo_url": "<best vibe-match URL or empty>",
      "image_edit_prompt": "The existing venue photograph must remain COMPLETELY UNCHANGED as the background. ADD ONLY: [1] The single word headline in wide letter-spacing, 300-weight, positioned in the photo's natural darkest zone — exact hex (light if dark zone, dark if light zone), exact px size. NO overlay. NO logo text. NO CTA. The brand logo graphic only if it fits naturally at bottom-right, 8% canvas width.",
      "canvas_spec": {{
        "template": "minimal",
        "headline_color": "<hex>",
        "overlay_rgba": "rgba(0,0,0,0.0)",
        "logo_url": "{logo_url}",
        "logo_position": "bottom_right"
      }}
    }}
  ]
}}

DESIGN RULES — NON-NEGOTIABLE:
IMPACT: 1-3 ALL-CAPS words. Condensed bold 90-120px. Gradient scrim bottom. Logo graphic top. No badge text, no CTA text on image. Energy comes from color + typography weight alone.
EDITORIAL: 1-2 lowercase words. Elegant serif 60-80px. Thin accent line. Logo graphic top-center. Zero overlay density. The restraint IS the luxury.
MINIMAL: 1 single word. Wide tracking (0.3em+). 300 weight. No overlay. Logo only if it fits. White space is the design.

The 1-3 words must feel like a campaign tagline derived from the vibe:
BAD (too literal): "Reserve Your Table Now", "New Summer Menu", "Special Weekend Offer"
GOOD (agency quality): "GOLDEN HOUR", "JUST IN", "SUN DOWN", "STAY", "TASTE", "NOW", "HERE"

image_edit_prompts — BE HYPER-SPECIFIC:
- Canvas size: {1080}x{1920 if is_vertical else 1080}px
- Exact pixel positions (e.g. "centered at y=1680px")
- Exact hex colors derived from vibe + brand palette
- Font: "condensed bold Bebas/Impact-style uppercase {110 if is_vertical else 96}px" or "elegant 300-weight Didot-style {72 if is_vertical else 64}px letter-spacing 0.3em"
- The venue photo MUST be preserved unchanged — zero alterations to it
"""

    import asyncio as _asyncio

    async def _call_openai(model: str, max_tokens: int) -> list:
        async with _httpx.AsyncClient(timeout=35) as client:
            r = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {openai_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user",   "content": user_prompt},
                    ],
                    "max_tokens": max_tokens,
                    "temperature": 0.3,
                    "response_format": {"type": "json_object"},
                },
            )
            if r.status_code == 429:
                retry_after = int(r.headers.get("retry-after", "8"))
                raise ValueError(f"rate_limit:{retry_after}")
            r.raise_for_status()
        return _json.loads(r.json()["choices"][0]["message"]["content"]).get("designs", [])

    def _canvas_fallback_designs() -> list:
        """Return minimal canvas-only designs when OpenAI is unavailable."""
        photo = ref_urls[0] if ref_urls else ""
        return [
            {"template": "impact",   "headline": _headline.split()[:3:] and " ".join(_headline.split()[:3]).upper() or "NOW",
             "image_edit_prompt": "", "photo_url": photo,
             "canvas_spec": {"template": "impact", "headline_color": accent_color, "overlay_rgba": f"rgba(0,0,0,0.55)", "logo_url": logo_url, "logo_position": "top_left"}},
            {"template": "editorial","headline": _headline.split()[0].lower() if _headline else "taste",
             "image_edit_prompt": "", "photo_url": photo,
             "canvas_spec": {"template": "editorial", "headline_color": accent_color, "overlay_rgba": "rgba(0,0,0,0.28)", "logo_url": logo_url, "logo_position": "top_center"}},
            {"template": "minimal",  "headline": (_headline.split()[0] if _headline else "here"),
             "image_edit_prompt": "", "photo_url": photo,
             "canvas_spec": {"template": "minimal", "headline_color": accent_color, "overlay_rgba": "rgba(0,0,0,0.0)", "logo_url": logo_url, "logo_position": "bottom_right"}},
        ]

    # Try gpt-4o → retry once after rate-limit wait → fallback to gpt-4o-mini → canvas fallback
    designs: list = []
    try:
        designs = await _call_openai("gpt-4o", 3000)
    except ValueError as ve:
        if str(ve).startswith("rate_limit:"):
            wait = int(str(ve).split(":")[1])
            logger.info("design_director_rate_limited", wait=wait)
            # Short wait (cap at 10s so UX doesn't freeze) then retry with mini
            await _asyncio.sleep(min(wait, 10))
            try:
                designs = await _call_openai("gpt-4o-mini", 2000)
            except Exception as inner:
                logger.warning("design_director_mini_failed", error=str(inner))
                designs = _canvas_fallback_designs()
        else:
            logger.warning("design_director_failed", error=str(ve))
            designs = _canvas_fallback_designs()
    except Exception as exc:
        logger.warning("design_director_failed", error=str(exc), workspace_id=str(workspace_id))
        # Return canvas fallback instead of 500 — content can still be designed
        designs = _canvas_fallback_designs()

    # Attach brand reference images pool so frontend knows which photos are available
    return {
        "workspace_id": str(workspace_id),
        "designs": designs,
        "brand_photos": ref_urls,
        "brand_primary_color": primary_color,
        "brand_accent_color": accent_color,
        "logo_url": logo_url,
        "badge_text": badge_text,
    }


# ──────────────────────────────────────────────────────────────────────────
# Brand Vibe Profile — scrape + persist endpoints
# ──────────────────────────────────────────────────────────────────────────


@router.post(
    "/{workspace_id}/vibe/scrape-refs",
    summary="Scrape reference IG accounts (Apify) and return raw image URLs + captions",
)
async def scrape_vibe_references(
    workspace_id: uuid.UUID,
    payload: "ScrapeRefAccountsRequest",
    db: AsyncSession = Depends(get_db),
):
    """Step 1 of the vibe extraction pipeline.

    Pulls recent media + captions from up to 5 reference IG handles via
    Apify. The caller (Next.js BFF) is responsible for mirroring image URLs
    to R2 and running Vision extraction. We keep R2 + OpenAI in Next.js
    because credentials and image processing utilities live there.
    """
    from app.services.brand_vibe_service import scrape_reference_accounts

    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(404, "brand context not found")

    try:
        result = await scrape_reference_accounts(
            handles=payload.handles,
            posts_per_handle=payload.posts_per_handle,
        )
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))

    logger.info(
        "vibe_scrape_done",
        workspace_id=str(workspace_id),
        handles=result.handles,
        image_count=len(result.image_urls),
        caption_count=len(result.captions),
        errors=list(result.fetch_errors.keys()),
    )
    return result.model_dump()


@router.get("/{workspace_id}/vibe", summary="Get current brand vibe profile")
async def get_brand_vibe(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(404, "brand context not found")
    return {
        "vibe": ctx.brand_vibe_profile,
        "updated_at": ctx.brand_vibe_profile_updated_at.isoformat()
        if ctx.brand_vibe_profile_updated_at
        else None,
    }


@router.put("/{workspace_id}/vibe", summary="Persist a brand vibe profile")
async def put_brand_vibe(
    workspace_id: uuid.UUID,
    payload: "BrandVibeSaveRequest",
    db: AsyncSession = Depends(get_db),
):
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(404, "brand context not found")

    ctx.brand_vibe_profile = payload.vibe.model_dump(mode="json", exclude_none=False)
    ctx.brand_vibe_profile_updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(ctx)

    logger.info(
        "vibe_saved",
        workspace_id=str(workspace_id),
        source_accounts=payload.vibe.source_accounts,
        frames=len(payload.vibe.reference_frames),
    )

    # Auto re-derive BrandTheme whenever vibe is updated — fire and forget
    import asyncio as _asyncio
    from app.services.brand_theme_service import derive_brand_theme, save_brand_theme

    async def _rederive():
        try:
            from app.database import async_session_factory
            async with async_session_factory() as _db:
                _ctx = await brand_context_service.get_brand_context(_db, workspace_id)
                if _ctx:
                    theme = await derive_brand_theme(_ctx)
                    await save_brand_theme(_ctx, theme, _db)
                    logger.info("brand_theme_rederived_after_vibe", workspace_id=str(workspace_id))
        except Exception as _e:
            logger.warning("brand_theme_rederive_failed", workspace_id=str(workspace_id), error=str(_e)[:200])

    _asyncio.create_task(_rederive())

    return {
        "ok": True,
        "vibe": ctx.brand_vibe_profile,
        "updated_at": ctx.brand_vibe_profile_updated_at.isoformat(),
    }


# ── Brand Theme endpoints ─────────────────────────────────────────────────────

@router.get("/{workspace_id}/theme", summary="Get derived BrandTheme token set")
async def get_brand_theme(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    from app.services.brand_theme_service import derive_brand_theme, save_brand_theme
    ctx = await brand_context_service.ensure_brand_context(db, workspace_id)
    ctx = await brand_context_service.seed_missing_brand_fields(db, ctx)
    if not ctx.brand_theme:
        theme = await derive_brand_theme(ctx)
        await save_brand_theme(ctx, theme, db)
        ctx = await brand_context_service.get_brand_context(db, workspace_id)

    return {
        "theme": ctx.brand_theme,
        "updated_at": ctx.brand_theme_updated_at.isoformat() if ctx.brand_theme_updated_at else None,
    }


@router.post("/{workspace_id}/theme/derive", summary="Re-derive BrandTheme from latest signals")
async def rederive_brand_theme(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Force re-derivation from current brand signals. Useful after updating vibe, visual_dna, or brand colors."""
    from app.services.brand_theme_service import derive_brand_theme, save_brand_theme
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(404, "brand context not found")

    theme = await derive_brand_theme(ctx)
    await save_brand_theme(ctx, theme, db)
    logger.info("brand_theme_derived_on_demand", workspace_id=str(workspace_id), source=theme.source)
    return {
        "ok": True,
        "source": theme.source,
        "theme": theme.model_dump(mode="json"),
        "updated_at": theme.derived_at.isoformat(),
    }


@router.patch("/{workspace_id}/theme/ai-settings", summary="Patch AI photo/visual production settings")
async def patch_ai_theme_settings(
    workspace_id: uuid.UUID,
    payload: AiThemeSettingsPatch,
    db: AsyncSession = Depends(get_db),
):
    """Merge AI toggles into brand_theme without requiring a full BrandTheme body."""
    from datetime import datetime, timezone

    from sqlalchemy import update

    from app.models.brand_context import BrandContext
    from app.services.brand_theme_service import derive_brand_theme

    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(404, "brand context not found")

    theme: dict = dict(ctx.brand_theme) if isinstance(ctx.brand_theme, dict) else {}
    if not theme:
        derived = await derive_brand_theme(ctx)
        theme = derived.model_dump(mode="json")

    patch = payload.model_dump(exclude_none=True)
    theme.update(patch)

    await db.execute(
        update(BrandContext)
        .where(BrandContext.workspace_id == workspace_id)
        .execution_options(synchronize_session=False)
        .values(
            brand_theme=theme,
            brand_theme_updated_at=datetime.now(timezone.utc),
        )
    )
    await db.commit()

    logger.info(
        "brand_theme_ai_settings_patched",
        workspace_id=str(workspace_id),
        keys=list(patch.keys()),
    )
    return {
        "ok": True,
        "theme": theme,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


class VisualProductionEnrichRequest(_VideoPackModel):
    ideas: list[dict] = []
    feed_director_report: dict | None = None
    mission_title: str = ""
    creative_brief: str = ""
    production_package: str = "weekly_content"


@router.post(
    "/{workspace_id}/visual-production-enrich",
    summary="Opt-in VPD: enrich ideas with visual_production_spec (internal)",
)
async def visual_production_enrich(
    workspace_id: uuid.UUID,
    body: VisualProductionEnrichRequest,
    db: AsyncSession = Depends(get_db),
):
    from app.services.brand_context_service import build_brand_info
    from app.services.visual_production_director_service import (
        is_visual_production_director_enabled,
        maybe_enrich_ideas_with_visual_director,
    )

    brand = await build_brand_info(db, workspace_id)
    if not brand:
        raise HTTPException(404, "brand context not found")

    enabled = await is_visual_production_director_enabled(db, workspace_id)
    ideas = body.ideas or []
    if not enabled or not ideas:
        return {
            "ok": True,
            "vpd_enabled": enabled,
            "ideas": ideas,
            "enriched_count": 0,
        }

    mission_ctx = {
        "mission_title": body.mission_title,
        "creative_brief": body.creative_brief,
        "production_package": body.production_package,
    }
    enriched = await maybe_enrich_ideas_with_visual_director(
        db,
        workspace_id,
        brand,
        ideas,
        mission_ctx=mission_ctx,
        feed_director_report=body.feed_director_report,
    )
    enriched_count = sum(
        1 for i in enriched if isinstance(i, dict) and i.get("_vpd_meta", {}).get("enriched")
    )
    return {
        "ok": True,
        "vpd_enabled": True,
        "ideas": enriched,
        "enriched_count": enriched_count,
    }


@router.put("/{workspace_id}/theme", summary="Manually override BrandTheme tokens")
async def put_brand_theme(
    workspace_id: uuid.UUID,
    payload: BrandThemeSaveRequest,
    db: AsyncSession = Depends(get_db),
):
    """Operator-provided token overrides — sets source='manual_colors' marker."""
    from app.services.brand_theme_service import save_brand_theme
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(404, "brand context not found")

    await save_brand_theme(ctx, payload.theme, db)
    logger.info("brand_theme_manually_saved", workspace_id=str(workspace_id))
    return {
        "ok": True,
        "theme": payload.theme.model_dump(mode="json"),
        "updated_at": payload.theme.derived_at.isoformat(),
    }


_DEFAULT_ANNOUNCEMENT_LIBRARY = {
    "event": "luxury_bottom",
    "campaign": "campaign_badge",
    "announcement": "editorial_left",
    "default_format": "story",
}


@router.get("/{workspace_id}/announcement-templates", summary="Get announcement overlay template preferences")
async def get_announcement_template_prefs(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(404, "Brand context not found")
    theme = ctx.brand_theme if isinstance(ctx.brand_theme, dict) else {}
    prefs = theme.get("announcement_library") or _DEFAULT_ANNOUNCEMENT_LIBRARY
    return {
        "preferences": prefs,
        "defaults": _DEFAULT_ANNOUNCEMENT_LIBRARY,
    }


@router.put("/{workspace_id}/announcement-templates", summary="Save announcement overlay template preferences")
async def put_announcement_template_prefs(
    workspace_id: uuid.UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone

    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(404, "Brand context not found")

    _legacy_template_ids = {
        "luxury_bottom", "editorial_left", "campaign_badge",
        "minimal_whisper", "impact_vignette", "offer_band",
    }
    allowed_formats = {"story", "post", "square"}

    def _valid_template_id(val: str) -> bool:
        if val in _legacy_template_ids:
            return True
        return bool(re.match(r"^agency_[a-z_]+_\d{2}$", val))

    def _pick(key: str, fallback: str) -> str:
        val = body.get(key, fallback)
        return val if isinstance(val, str) and _valid_template_id(val) else fallback

    fmt = body.get("default_format", body.get("defaultFormat", "story"))
    default_format = fmt if isinstance(fmt, str) and fmt in allowed_formats else "story"

    prefs = {
        "event": _pick("event", _DEFAULT_ANNOUNCEMENT_LIBRARY["event"]),
        "campaign": _pick("campaign", _DEFAULT_ANNOUNCEMENT_LIBRARY["campaign"]),
        "announcement": _pick("announcement", _DEFAULT_ANNOUNCEMENT_LIBRARY["announcement"]),
        "default_format": default_format,
    }

    theme = dict(ctx.brand_theme or {})
    theme["announcement_library"] = prefs
    ctx.brand_theme = theme
    ctx.brand_theme_updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.commit()

    logger.info("announcement_template_prefs_saved", workspace_id=str(workspace_id), prefs=prefs)
    return {"ok": True, "preferences": prefs}
