"""Templates & video packs: post-templates, Creatomate/Shotstack, renders.

Part of the brand-context router package; mounted by ``__init__``.
"""
# ruff: noqa: F403, F405  — intentional star re-export from the package _shared module
from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.brand_context._shared import *

router = APIRouter()


@router.get("/{workspace_id}/post-templates", response_model=list[BrandPostTemplateRead])
async def list_brand_post_templates(
    workspace_id: uuid.UUID,
    include_archived: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
):
    conditions = [BrandPostTemplate.workspace_id == workspace_id]
    if not include_archived:
        conditions.append(BrandPostTemplate.status == "active")
    result = await db.execute(
        select(BrandPostTemplate)
        .where(*conditions)
        .order_by(
            desc(BrandPostTemplate.last_used_at).nullslast(),
            desc(BrandPostTemplate.created_at),
        )
    )
    return list(result.scalars().all())

@router.post(
    "/{workspace_id}/post-templates",
    response_model=BrandPostTemplateRead,
    status_code=201,
)
async def create_brand_post_template(
    workspace_id: uuid.UUID,
    data: BrandPostTemplateCreate,
    db: AsyncSession = Depends(get_db),
):
    await brand_context_service.ensure_brand_context(db, workspace_id)
    template = BrandPostTemplate(
        workspace_id=workspace_id,
        name=data.name.strip(),
        format=data.format or "post",
        status=data.status or "active",
        template_kind=data.template_kind or "canvas",
        layout_spec=data.layout_spec or {},
        thumbnail_url=data.thumbnail_url,
        example_artifact_url=data.example_artifact_url,
    )
    db.add(template)
    await db.flush()
    await db.refresh(template)
    return template

@router.patch(
    "/{workspace_id}/post-templates/{template_id}",
    response_model=BrandPostTemplateRead,
)
async def update_brand_post_template(
    workspace_id: uuid.UUID,
    template_id: uuid.UUID,
    data: BrandPostTemplateUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BrandPostTemplate).where(
            BrandPostTemplate.workspace_id == workspace_id,
            BrandPostTemplate.id == template_id,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(404, "Post template not found")

    patch = data.model_dump(exclude_unset=True)
    increment_usage = bool(patch.pop("increment_usage", False))
    nullable_fields = {"thumbnail_url", "example_artifact_url"}
    for field, value in patch.items():
        if field == "name" and isinstance(value, str):
            value = value.strip()
        if value is None and field not in nullable_fields:
            continue
        setattr(template, field, value)
    if increment_usage:
        template.usage_count += 1
        template.last_used_at = datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(template)
    return template

@router.delete("/{workspace_id}/post-templates/{template_id}")
async def delete_brand_post_template(
    workspace_id: uuid.UUID,
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BrandPostTemplate).where(
            BrandPostTemplate.workspace_id == workspace_id,
            BrandPostTemplate.id == template_id,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(404, "Post template not found")
    await db.delete(template)
    await db.flush()
    return {"success": True}

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
    from app.crew.crews.video_production_crew import run_video_production
    from app.services.brand_context_service import build_brand_info

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
        BrandTemplate,
        VideoPackInput,
        is_creatomate_configured,
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
    from app.services.graphic_design_service import DESIGN_STYLES, render_style_variants
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
    from app.config import get_settings
    from app.services.brand_context_service import build_brand_info
    from app.services.creatomate_brand_bundle import (
        generate_brand_bundle,
        resolve_tokens_from_brand,
    )

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
    from app.services.shotstack_service import SHOTSTACK_TEMPLATES, list_templates
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
