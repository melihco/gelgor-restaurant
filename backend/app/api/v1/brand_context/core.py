"""Core brand-context: CRUD, discovery/analysis, intelligence, config, briefs.

Part of the brand-context router package; mounted by ``__init__``.
"""
# ruff: noqa: F403, F405  — intentional star re-export from the package _shared module
from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.brand_context._shared import *

router = APIRouter()


@router.get("/{workspace_id}", response_model=BrandContextRead)
async def get_brand_context(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    ctx = await brand_context_service.ensure_brand_context(db, workspace_id)
    ctx = await brand_context_service.seed_missing_brand_fields(db, ctx)
    return ctx

@router.get("/{workspace_id}/snapshot", summary="Normalized brand intelligence snapshot")
async def get_brand_context_snapshot(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    ctx = await brand_context_service.ensure_brand_context(db, workspace_id)
    ctx = await brand_context_service.seed_missing_brand_fields(db, ctx)
    theme = dict(ctx.brand_theme) if isinstance(ctx.brand_theme, dict) else {}
    return {
        "workspace_id": str(workspace_id),
        "business_name": ctx.business_name or "",
        "business_type": ctx.business_type or "",
        "description": ctx.description or "",
        "target_audience": ctx.target_audience or "",
        "brand_tone": ctx.brand_tone or "",
        "visual_style": ctx.visual_style or "",
        "visual_dna": ctx.visual_dna or "",
        "brand_dna": ctx.brand_dna or "",
        "website_summary": ctx.website_summary or "",
        "instagram_bio": ctx.instagram_bio or "",
        "location": ctx.location or "",
        "languages": list(ctx.languages or []),
        "reference_image_urls": brand_context_service._parse_reference_image_urls(
            ctx.reference_image_urls,
        ),
        "logo_url": ctx.logo_url or "",
        "brand_theme": theme,
        "brand_constitution_confirmed_at": ctx.brand_constitution_confirmed_at,
        "brand_theme_updated_at": ctx.brand_theme_updated_at.isoformat() if ctx.brand_theme_updated_at else None,
    }

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
    body: ConfirmConstitutionRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Sets brand_constitution_confirmed_at; agents receive confirmed=True after this.
    Also auto-bootstraps BrandTheme so the brand kit is ready immediately.
    When synthesize_dna=True, writes Brand DNA (living constitution) from gallery + discovery.
    """
    opts = body or ConfirmConstitutionRequest()
    ctx = await brand_context_service.ensure_brand_context(db, workspace_id)
    ctx = await brand_context_service.seed_missing_brand_fields(db, ctx)

    if opts.synthesize_dna:
        import json as _json

        from app.services.brand_context_service import build_brand_info
        from app.services.brand_dna_service import build_brand_dna

        settings = get_settings()
        if settings.openai_api_key:
            brand = await build_brand_info(db, workspace_id)
            if brand:
                try:
                    dna = await build_brand_dna(brand, openai_api_key=settings.openai_api_key)
                    ctx.brand_dna = _json.dumps(dna, ensure_ascii=False)
                    ctx.brand_dna_updated_at = datetime.now(timezone.utc).isoformat()
                    logger.info(
                        "brand_dna_synthesised_on_confirm",
                        workspace_id=str(workspace_id),
                        richness=dna.get("data_richness"),
                    )
                except Exception as exc:
                    logger.warning(
                        "brand_dna_on_confirm_failed",
                        workspace_id=str(workspace_id),
                        error=str(exc)[:200],
                    )

    ctx.brand_constitution_confirmed_at = datetime.now(timezone.utc)
    await db.flush()
    logger.info(
        "brand_constitution_confirmed",
        workspace_id=str(workspace_id),
        auto=opts.auto_confirmed,
    )

    # Fire-and-forget brand bootstrap (theme + intelligence + service profile).
    # Logic lives in the service so this controller stays thin (SRP).
    from app.services.brand_bootstrap_service import schedule_post_constitution_bootstrap

    schedule_post_constitution_bootstrap(workspace_id)

    return ctx

@router.post("/{workspace_id}/service-profile/derive", response_model=BrandContextRead)
async def derive_service_profile(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Derive + persist the validated Brand Service Profile from discovery data."""
    ctx = await brand_context_service.persist_brand_service_profile(db, workspace_id)
    if ctx is None:
        raise HTTPException(status_code=404, detail="brand_context_not_found")
    return ctx


@router.post("/{workspace_id}/production-design-profile/derive")
async def derive_production_design_profile_endpoint(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Onboarding-grade production design profile — visual_dna rewrite, pillars,
    brand_tone/style, theme production layers (typography_design, fal intensity).
    """
    from app.config import get_settings
    from app.services.production_design_profile_service import (
        apply_production_design_profile,
        derive_production_design_profile,
    )

    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="brand_context_not_found")

    settings = get_settings()
    profile = derive_production_design_profile(
        ctx,
        openai_api_key=settings.openai_api_key or "",
    )
    await apply_production_design_profile(db, ctx, profile)

    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    return {
        "ok": True,
        "profile": profile,
        "brand_theme": ctx.brand_theme if ctx else None,
        "visual_dna_preview": (profile.get("visual_dna") or "")[:240],
    }


@router.get("/{workspace_id}/brand-gaps")
async def get_brand_gaps(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """List critical brand-context gaps that block agent / production quality."""
    from app.services.brand_gap_completion_service import detect_brand_gaps

    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="brand_context_not_found")
    gaps = detect_brand_gaps(ctx)
    return {"workspace_id": str(workspace_id), "gap_count": len(gaps), "gaps": gaps}


@router.post("/{workspace_id}/complete-gaps")
async def complete_brand_gaps_endpoint(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    AI-assisted repair of detected brand gaps (description, visual_dna, brand_dna,
    industry calendar, production design profile). Multi-tenant — sector-driven only.
    """
    from app.config import get_settings
    from app.services.brand_gap_completion_service import complete_brand_gaps

    settings = get_settings()
    result = await complete_brand_gaps(
        db,
        workspace_id,
        openai_api_key=settings.openai_api_key or "",
    )
    if result.get("error") == "brand_context_not_found":
        raise HTTPException(status_code=404, detail="brand_context_not_found")
    return result


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

    kit = result.get("kit") or {}
    return {
        "ok": bool(result.get("ok")),
        "reason": result.get("reason") or result.get("error"),
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
    if not body.website_url and not body.instagram_handle and not body.google_business_url and not body.menu_url:
        raise HTTPException(
            400,
            "Provide at least one of: website_url, instagram_handle, google_business_url, menu_url",
        )

    logger.info(
        "brand_analyze_started",
        workspace_id=str(workspace_id),
        has_website=bool(body.website_url),
        has_instagram=bool(body.instagram_handle),
        has_google=bool(body.google_business_url),
    )

    try:
        brand_name = (body.brand_name or "").strip()
        result = await analyze_brand(
            website_url=body.website_url,
            instagram_handle=body.instagram_handle,
            google_business_url=body.google_business_url,
            menu_url=body.menu_url or "",
            company_profile={"brand_name": brand_name} if brand_name else {},
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
        if brand_name:
            ctx.business_name = brand_name
            report = result.get("report") if isinstance(result.get("report"), dict) else {}
            if isinstance(report, dict):
                report["brand_name"] = brand_name
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
                from app.database import async_session_factory
                from app.services.competitor_intelligence_service import build_competitor_brief
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
    from app.services.brand_context_service import _parse_reference_image_urls
    from app.services.visual_dna_service import ensure_visual_dna

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
    from app.services.brand_context_service import _parse_json_list
    from app.services.trend_intelligence_service import build_trend_brief, is_trend_brief_stale

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

    from sqlalchemy import and_ as _and
    from sqlalchemy import select as _select

    from app.models.mission import Mission
    from app.models.mission import MissionTaskNode as _MissionTaskNode

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

@router.post("/{workspace_id}/industry-intelligence")
async def refresh_industry_intelligence(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    On-demand refresh of industry intelligence calendar for a workspace.
    Called from Brand Hub "Sektör Analizi" button.
    """
    import asyncio as _asyncio
    import json as _json
    from datetime import datetime, timezone

    from app.services.brand_context_service import build_brand_info
    from app.services.event_intelligence_service import build_event_intelligence
    from app.services.industry_intelligence_service import build_industry_calendar
    from app.services.linkedin_intelligence_service import build_linkedin_intelligence

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

@router.post("/{workspace_id}/brand-dna")
async def synthesise_brand_dna(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """On-demand Brand DNA synthesis."""
    import json as _json
    from datetime import datetime, timezone

    from app.services.brand_context_service import build_brand_info
    from app.services.brand_dna_service import build_brand_dna

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

@router.post("/{workspace_id}/monthly-brief")
async def generate_monthly_brief(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a comprehensive monthly strategic brief."""
    import json as _json
    from datetime import datetime, timezone

    from app.services.brand_context_service import build_brand_info
    from app.services.monthly_brief_service import build_monthly_brief

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

@router.post("/{workspace_id}/pinterest-inspiration")
async def refresh_pinterest_inspiration(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Scrape Pinterest for visual trends and save to brand context."""
    import json as _json
    from datetime import datetime, timezone

    from app.services.brand_context_service import build_brand_info
    from app.services.pinterest_scraper_service import build_pinterest_inspiration_brief

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
        "business_type": ctx.business_type,
        "brand_service_profile": ctx.brand_service_profile if isinstance(ctx.brand_service_profile, dict) else _load("brand_service_profile"),
        "google_rating": ctx.google_rating,
        "google_review_count": ctx.google_review_count,
        "discovery_confidence": ctx.discovery_confidence,
    }

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

@router.post("/{workspace_id}/social-listening")
async def run_social_listening_endpoint(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """On-demand social listening scan."""
    import json as _json
    from datetime import datetime, timezone

    from app.services.brand_context_service import build_brand_info
    from app.services.social_listening_service import run_social_listening

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

@router.get("/{workspace_id}/tenant-learning")
async def get_tenant_learning_prompt(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Approved/rejected history as markdown for production prompts (MT-10)."""
    from app.services.tenant_learning_service import (
        build_learning_context_prompt,
        build_tenant_learning_snapshot,
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
