"""
Internal orchestration routes.

This router is intended to be called only by the .NET application API.
It accepts fully assembled business context and delegates execution to CrewAI,
without exposing product CRUD responsibilities to external clients.
"""

from __future__ import annotations

import asyncio

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import verify_internal_api_key
from app.config import get_settings
from app.crew.action_extractor import extract_action
from app.crew.brand_analyzer import analyze_brand
from app.crew.context import BrandInfo
from app.crew.engine import get_crew_engine
from app.api.deps import get_db
from app.services.brand_context_service import (
    build_brand_info_from_internal,
    build_brand_info,
    enrich_brand_operating_policy,
    merge_dotnet_brand_with_python_db,
)
from app.services.tenant_learning_service import build_tenant_learning_snapshot, build_learning_context_prompt
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.internal import (
    InternalAgentExecutionRequest,
    InternalAgentExecutionResponse,
)

logger = structlog.get_logger()

router = APIRouter(dependencies=[Depends(verify_internal_api_key)])

# Per-tenant content agent serialization — delegate to the shared lock registry
# so the TaskGraphExecutor and the HTTP orchestration path share the same locks.
from app.services.execution_locks import get_content_lock as _get_tenant_content_lock  # noqa: E402


async def _run_crew_engine_in_thread(
    engine,
    agent_role: str,
    task_type: str,
    brand: BrandInfo,
    input_data: dict,
    timeout_seconds: float,
) -> dict:
    return await asyncio.wait_for(
        asyncio.to_thread(engine.execute, agent_role, task_type, brand, input_data),
        timeout=timeout_seconds,
    )

# agent_role → default artifact_type
_ARTIFACT_TYPE_MAP = {
    "review_agent": "review_response",
    "content_agent": "instagram_caption",
    "content_strategy_agent": "strategy_document",
    "ads_agent": "ad_copy",
    "analytics_agent": "strategy_document",
}

# task_type → more specific artifact_type (overrides role default)
_TASK_ARTIFACT_TYPE_MAP = {
    "single_review_response": "review_response",
    "review_analysis": "generic_document",
    "content_strategy": "strategy_document",
    "content_ideation": "instagram_caption",
    "content_calendar": "instagram_caption",
    "visual_design_cards": "instagram_caption",
    "campaign_analysis": "strategy_document",
    "ad_creative_generation": "ad_copy",
    "auto_budget_optimize": "strategy_document",
    "ads_budget_optimization": "strategy_document",
    "traffic_analysis": "strategy_document",
    "conversion_report": "strategy_document",
    "weekly_performance": "generic_document",
}


def _fallback_content(agent_role: str, task_type: str, brand_name: str) -> str:
    return (
        f"# {brand_name} AI Çalışma Raporu\n\n"
        f"`{agent_role}` / `{task_type}` çalışması tamamlandı ancak model boş içerik döndürdü.\n\n"
        "Bu kayıt bilinçli olarak boş bırakılmadı; kullanıcı arayüzünde takip edilebilmesi için "
        "güvenli fallback artifact olarak oluşturuldu. Lütfen entegrasyon verilerini, LLM yanıtını "
        "ve görev input'unu kontrol edin."
    )


@router.post("/execute", response_model=InternalAgentExecutionResponse)
async def execute_internal_agent(
    request: InternalAgentExecutionRequest,
    db: AsyncSession = Depends(get_db),
) -> InternalAgentExecutionResponse:
    logger.info(
        "orchestration_execute_received",
        agent_role=request.agent_role,
        task_type=request.task_type,
        correlation_id=request.correlation_id,
    )
    settings = get_settings()
    if settings.crewai_llm_provider == "openai" and not (settings.openai_api_key or "").strip():
        raise HTTPException(
            status_code=503,
            detail=(
                "OPENAI_API_KEY tanımlı değil. Python Crew servisi LLM çağrısı yapamaz; "
                "ortam değişkenini veya .env dosyasını kontrol edin."
            ),
        )

    engine = get_crew_engine()

    # Build BrandInfo from .NET's brand_context payload.
    brand = build_brand_info_from_internal(request.brand_context)
    brand.tenant_id = request.tenant_id
    if request.brand_context.operating_capabilities:
        brand.operating_capabilities = list(request.brand_context.operating_capabilities)
    if request.brand_context.gallery_policy:
        brand.gallery_policy = dict(request.brand_context.gallery_policy)

    # ── Enrich from Python DB (Sprint 1-3 intelligence data) ─────────────
    # .NET only knows about CompanyProfile fields. All Sprint enrichment
    # (visual_dna, content_pillars, competitor_brief, trend_brief,
    #  reference_image_urls, google_review_signals, learning_context)
    # lives only in Python's brand_contexts table.
    # We merge it here so ALL agents always get the full intelligence context.
    import uuid as _uuid
    try:
        ws_id = _uuid.UUID(request.tenant_id)
        py_brand = await build_brand_info(db, ws_id)
        if py_brand:
            brand = merge_dotnet_brand_with_python_db(
                brand,
                py_brand,
                dotnet_content_pillars=list(request.brand_context.content_pillars or [])
                if request.brand_context.content_pillars
                else None,
            )
            logger.info(
                "brand_context_enriched_from_python_db",
                tenant_id=request.tenant_id,
                has_visual_dna=bool(py_brand.visual_dna),
                has_content_pillars=bool(py_brand.content_pillars),
                has_trend_brief=bool(py_brand.trend_brief),
                has_brand_dna=bool(py_brand.brand_dna),
                has_industry_calendar=bool(py_brand.industry_calendar),
                has_competitor_pulse=bool(py_brand.competitor_pulse),
                ref_images=len(py_brand.reference_image_urls),
                llm_override=py_brand.preferred_llm_provider or "global_routing",
            )
    except Exception as exc:
        logger.warning("python_db_enrichment_failed", tenant_id=request.tenant_id, error=str(exc))

    # Stamp tenant_id on brand for isolation audit logging
    brand.tenant_id = request.tenant_id
    enrich_brand_operating_policy(brand)

    # ── Learning context ──────────────────────────────────────────────────
    content_tasks = {
        "content_ideation", "content_calendar", "content_strategy",
        "visual_design_cards", "single_review_response", "review_analysis",
    }
    if request.task_type in content_tasks:
        try:
            from app.services.gallery_usage_service import (
                apply_gallery_usage_to_brand,
                fetch_gallery_usage_by_type,
            )

            usage = await fetch_gallery_usage_by_type(request.tenant_id)
            apply_gallery_usage_to_brand(brand, usage)
        except Exception as exc:
            logger.warning("gallery_usage_load_failed", error=str(exc)[:200])

        try:
            learning_snapshot = await build_tenant_learning_snapshot(db, request.tenant_id)
            learning_text = build_learning_context_prompt(learning_snapshot)
            if learning_text:
                brand.learning_context = learning_text
        except Exception as exc:
            logger.warning("learning_context_load_failed", error=str(exc))

        # ── Performance feedback loop: inject real IG engagement patterns ──
        if request.task_type in ("content_ideation", "content_strategy"):
            try:
                from app.services.performance_feedback_service import (
                    refresh_learning_context_with_performance,
                )
                ig_handle = brand.instagram_handle or ""
                if ig_handle and settings.apify_api_key:
                    brand.learning_context = await refresh_learning_context_with_performance(
                        brand_name=brand.business_name,
                        instagram_handle=ig_handle,
                        existing_learning_context=brand.learning_context or "",
                        api_key=settings.apify_api_key,
                        timeout=30,
                    )
            except Exception as exc:
                logger.warning("performance_feedback_inject_failed", error=str(exc)[:200])

    timeout_sec = float(settings.crew_execution_timeout_seconds)

    try:
        if request.agent_role == "content_agent":
            tenant_lock = await _get_tenant_content_lock(request.tenant_id)
            logger.info(
                "content_agent_serialize",
                phase="awaiting_lock",
                tenant_id=request.tenant_id,
                task_type=request.task_type,
                correlation_id=request.correlation_id,
            )
            async with tenant_lock:
                logger.info(
                    "content_agent_serialize",
                    phase="lock_acquired",
                    tenant_id=request.tenant_id,
                    task_type=request.task_type,
                    correlation_id=request.correlation_id,
                )
                result = await _run_crew_engine_in_thread(
                    engine,
                    request.agent_role,
                    request.task_type,
                    brand,
                    request.input_data,
                    timeout_sec,
                )
        else:
            result = await _run_crew_engine_in_thread(
                engine,
                request.agent_role,
                request.task_type,
                brand,
                request.input_data,
                timeout_sec,
            )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail=(
                f"Crew yürütmesi {settings.crew_execution_timeout_seconds} sn içinde tamamlanamadı "
                "(LLM veya araç döngüsü). Daha hızlı deneme için CREWAI_AGENT_MEMORY=false kullanın; "
                "OrchestrationService:TimeoutSeconds (.NET) değerini de kontrol edin."
            ),
        )
    except Exception as ex:
        logger.exception("orchestration_execute_failed", error=str(ex)[:500])
        raise

    if result.get("status") != "completed":
        raise HTTPException(
            status_code=502,
            detail=result.get("error", "Execution failed"),
        )

    effective_agent_role = str(result.get("agent_role") or request.agent_role)
    effective_task_type = str(result.get("task_type") or request.task_type)

    # ── Artifact type resolution ──────────────────────────────────────────
    artifact_type = (
        _TASK_ARTIFACT_TYPE_MAP.get(effective_task_type)
        or _ARTIFACT_TYPE_MAP.get(effective_agent_role)
        or "generic_document"
    )

    raw_output = str(result.get("raw_output") or "").strip()
    used_fallback = not raw_output
    content = raw_output or _fallback_content(
        effective_agent_role,
        effective_task_type,
        request.brand_context.business_name,
    )
    title = f"{effective_agent_role}:{effective_task_type}".replace("_", " ").title()

    # ── Action payload extraction ─────────────────────────────────────────
    # Convert the unstructured LLM text into a typed, executable action dict.
    action_payload = extract_action(
        agent_role=effective_agent_role,
        task_type=effective_task_type,
        raw_output=content,
        review_context=result.get("review_context"),
        parameters=result.get("parameters"),
    )

    tokens_used = int(result.get("tokens_used") or 0)

    # ── Creative Director Review (Task 10) ────────────────────────────────────
    # Run brand safety validation on content-producing tasks.
    # Never blocks production — errors here are caught and logged.
    # Adds metadata["creative_director_review"] with approved/confidence/violations.
    # .NET reads auto_approved to decide whether to skip the human review queue.
    cd_review: dict = {}
    try:
        from app.crew.crews.creative_director_crew import (
            REVIEWABLE_TASK_TYPES,
            run_brand_safety_review,
        )
        if (
            effective_task_type in REVIEWABLE_TASK_TYPES
            and content
            and not used_fallback
        ):
            cd_review = await asyncio.to_thread(
                run_brand_safety_review,
                brand,
                content,
                effective_task_type,
                effective_agent_role,
                engine.get_llm_for_task(effective_task_type, brand=brand),
            )
            tokens_used += cd_review.get("tokens_used", 0)
            logger.info(
                "creative_director_review_complete",
                tenant_id=request.tenant_id,
                task_type=effective_task_type,
                approved=cd_review.get("approved"),
                confidence=cd_review.get("confidence"),
                auto_approved=cd_review.get("auto_approved"),
                violations=len(cd_review.get("violations", [])),
            )
    except Exception as cd_exc:
        logger.warning("creative_director_review_failed", error=str(cd_exc)[:300])

    return InternalAgentExecutionResponse(
        status=result.get("status", "completed"),
        agent_role=effective_agent_role,
        task_type=effective_task_type,
        artifact_type=artifact_type,
        artifact_title=title,
        content=content,
        summary=content[:240],
        metadata={
            "tenant_id": request.tenant_id,
            "office_id": request.office_id,
            "crew_name": result.get("crew_name"),
            "review_context": result.get("review_context"),
            "fallback_content": used_fallback,
            "tokens_used": tokens_used,
            **({"creative_director_review": cd_review} if cd_review else {}),
        },
        correlation_id=request.correlation_id,
        action_payload=action_payload,
        tokens_used=tokens_used,
    )


# ── Brand Analysis Endpoint ───────────────────────────────────────────────────

class BrandAnalysisRequest(BaseModel):
    website_url: str = ""
    instagram_handle: str = ""
    google_business_url: str = ""
    brand_name: str = ""
    industry: str = ""


@router.post("/analyze-brand")
async def analyze_brand_endpoint(request: BrandAnalysisRequest):
    """
    Analyze a brand's connected accounts and return structured brand context.
    Called by .NET API when user clicks "Markamı Analiz Et".
    """
    try:
        result = await analyze_brand(
            website_url=request.website_url,
            instagram_handle=request.instagram_handle,
            google_business_url=request.google_business_url,
            company_profile={
                "brand_name": request.brand_name,
                "industry": request.industry,
            },
        )
        return {
            "success": True,
            "analysis_text": result["analysis_text"],
            "top_hashtags": result["top_hashtags"],
            "inferred_tone": result["inferred_tone"],
            "inferred_language": result["inferred_language"],
            "report": result.get("report", {}),
            "website_title": result.get("website", {}).get("title", ""),
            "website_description": result.get("website", {}).get("description", ""),
            "instagram_bio": result["instagram"].get("bio", ""),
            "instagram_followers": result["instagram"].get("follower_count"),
            "fetch_ok": (
                result.get("website", {}).get("raw_fetch_ok", False)
                or result["instagram"].get("raw_fetch_ok", False)
                or result["google_business"].get("raw_fetch_ok", False)
            ),
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "analysis_text": "",
            "top_hashtags": [],
            "inferred_tone": "professional",
            "inferred_language": "tr",
        }
