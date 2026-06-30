"""Brand identity: theme, vibe, chatbot profile, design director, announcements.

Part of the brand-context router package; mounted by ``__init__``.
"""
# ruff: noqa: F403, F405  — intentional star re-export from the package _shared module
from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.brand_context._shared import *

router = APIRouter()


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

    from app.crew.engine import get_crew_engine
    from app.services.brand_context_service import build_brand_info
    from app.services.tenant_learning_service import (
        build_learning_context_prompt,
        build_tenant_learning_snapshot,
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
        "logo_position": "top_left",
        "font_preset": "poster_3d",
        "text_effect": "extrude_3d"
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
        "logo_position": "top_center",
        "font_preset": "elegant_serif",
        "text_effect": "editorial_outline"
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
        "logo_position": "bottom_right",
        "font_preset": "condensed_impact",
        "text_effect": "gradient_stack"
      }}
    }}
  ]
}}

DESIGN RULES — NON-NEGOTIABLE:
IMPACT: 1-3 ALL-CAPS words. Condensed bold 90-120px. Gradient scrim bottom. Logo graphic top. No badge text, no CTA text on image. Energy comes from color + typography weight alone.
EDITORIAL: 1-2 lowercase words. Elegant serif 60-80px. Thin accent line. Logo graphic top-center. Zero overlay density. The restraint IS the luxury.
MINIMAL: 1 single word. Wide tracking (0.3em+). 300 weight. No overlay. Logo only if it fits. White space is the design.
canvas_spec.font_preset must be one of: poster_3d, sticker_pop, condensed_impact, elegant_serif, clean_sans.
canvas_spec.text_effect must be one of: extrude_3d, neon_3d, editorial_outline, gradient_stack, soft_shadow.

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
             "canvas_spec": {"template": "impact", "headline_color": accent_color, "overlay_rgba": f"rgba(0,0,0,0.55)", "logo_url": logo_url, "logo_position": "top_left", "font_preset": "poster_3d", "text_effect": "extrude_3d"}},
            {"template": "editorial","headline": _headline.split()[0].lower() if _headline else "taste",
             "image_edit_prompt": "", "photo_url": photo,
             "canvas_spec": {"template": "editorial", "headline_color": accent_color, "overlay_rgba": "rgba(0,0,0,0.28)", "logo_url": logo_url, "logo_position": "top_center", "font_preset": "elegant_serif", "text_effect": "editorial_outline"}},
            {"template": "minimal",  "headline": (_headline.split()[0] if _headline else "here"),
             "image_edit_prompt": "", "photo_url": photo,
             "canvas_spec": {"template": "minimal", "headline_color": accent_color, "overlay_rgba": "rgba(0,0,0,0.0)", "logo_url": logo_url, "logo_position": "bottom_right", "font_preset": "condensed_impact", "text_effect": "gradient_stack"}},
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

    # Expand visual_source_mode macro into concrete sub-parameters
    mode = patch.pop("visual_source_mode", None)
    if mode in ("gallery_only", "gallery_enhanced", "ai_generated"):
        patch["visual_source_mode"] = mode
        if mode == "gallery_only":
            patch.setdefault("ai_photo_enhance", False)
            patch.setdefault("ai_caption_driven_visual", False)
            patch.setdefault("ai_enhance_gallery_selected", False)
        elif mode == "gallery_enhanced":
            patch.setdefault("ai_photo_enhance", True)
            patch.setdefault("ai_caption_driven_visual", False)
            patch.setdefault("ai_enhance_gallery_selected", True)
        elif mode == "ai_generated":
            patch.setdefault("ai_photo_enhance", True)
            patch.setdefault("ai_caption_driven_visual", True)
            patch.setdefault("ai_enhance_gallery_selected", True)

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

@router.get("/{workspace_id}/chatbot-profile", summary="Read brand chatbot profile")
async def get_chatbot_profile_route(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    from app.schemas.brand_chatbot import BrandChatbotProfileRead
    from app.services import chatbot_profile_service

    profile, updated_at = await chatbot_profile_service.get_chatbot_profile(db, workspace_id)
    return BrandChatbotProfileRead(profile=profile, updated_at=updated_at)

@router.patch("/{workspace_id}/chatbot-profile", summary="Patch brand chatbot profile")
async def patch_chatbot_profile_route(
    workspace_id: uuid.UUID,
    payload: BrandChatbotProfilePatch,
    db: AsyncSession = Depends(get_db),
):
    from app.services import chatbot_profile_service

    profile, updated_at = await chatbot_profile_service.patch_chatbot_profile(
        db, workspace_id, payload,
    )
    return {
        "ok": True,
        "profile": profile.model_dump(mode="json"),
        "updated_at": updated_at.isoformat(),
    }

@router.post("/{workspace_id}/chatbot-profile/analyze", summary="Analyze brand and build chatbot profile")
async def analyze_chatbot_profile_route(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    from app.services import chatbot_profile_service

    profile, updated_at = await chatbot_profile_service.analyze_and_save_chatbot_profile(
        db, workspace_id,
    )
    logger.info("chatbot_profile_analyzed", workspace_id=str(workspace_id))
    return {
        "ok": True,
        "profile": profile.model_dump(mode="json"),
        "updated_at": updated_at.isoformat(),
    }
