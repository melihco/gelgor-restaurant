"""
Content Agent definition.

Creates a CrewAI Agent for Instagram content strategy and creation.
Focuses on brand-authentic content that uses real business assets.

Sprint B: Market research tools (Apify + Perplexity) are added so the agent
can research trends and competitors DURING ideation — not just from pre-loaded context.
"""

from __future__ import annotations

from crewai import Agent, LLM

from app.config import get_settings
from app.crew.context import BrandInfo, build_brand_context_prompt
from app.crew.cta_localization import localize_ctas, resolve_language_code, resolve_output_language
from app.crew.prompts.content_prompts import (
    CONTENT_AGENT_BACKSTORY,
    CONTENT_AGENT_GOAL,
    CONTENT_AGENT_ROLE,
    get_language_persona,
)
from app.crew.tools.instagram import InstagramInsightsTool, InstagramContentPrepareTool
from app.crew.tools.image_pipeline import AssetSelectorTool, ImagePromptPreparerTool
from app.crew.tools.apify_tools import build_market_research_tools
from app.crew.tools.perplexity_search import PerplexitySearchTool


def create_content_agent(
    brand: BrandInfo,
    llm: LLM | None = None,
    *,
    for_ideation: bool = False,
    for_calendar: bool = False,
    max_execution_seconds: int | None = None,
) -> Agent:
    """
    Build the Content Agent with the appropriate tool set.

    Tool tiers:
    - light (for_ideation=True, ideation_instagram_tools=False):
        AssetSelector + ImagePromptPreparer + MarketResearch(Apify+Perplexity)
        Fast, no Instagram API dependency, real-time research enabled.

    - full (default):
        Light tools + InstagramInsights + InstagramContentPrepare
        Used when Instagram Business API is connected.

    Market research tools (Apify hashtag scout + Perplexity web search) are
    always included when API keys are available, regardless of tier. They
    degrade gracefully (return "not_configured") when keys are missing.
    """
    settings = get_settings()
    # Faz 1.2 — ideation task'ı zengin gallery scene block taşır; flag açıkken
    # backstory'deki kaba gallery envanteri kopyasını çıkararak input token tasarrufu.
    # Varsayılan: mevcut davranış (envanter dahil).
    import os as _os
    _dedup_gallery = (
        for_ideation and _os.getenv("DEDUP_GALLERY_BACKSTORY") == "true"
    )
    brand_context_block = build_brand_context_prompt(
        brand, include_gallery_inventory=not _dedup_gallery
    )

    lang_map = {"en": "English", "tr": "Turkish", "de": "German", "fr": "French", "es": "Spanish"}
    raw_lang = (brand.languages or "tr").split(",")[0].strip().lower()
    output_language = lang_map.get(raw_lang, raw_lang.capitalize())

    backstory = CONTENT_AGENT_BACKSTORY.format(
        business_name=brand.business_name,
        business_type=brand.business_type,
        brand_tone=brand.brand_tone,
        visual_style=brand.visual_style or "modern and clean",
        target_audience=brand.target_audience or "general audience",
        location=brand.location or "not specified",
        language_persona=get_language_persona(output_language),
        brand_context=brand_context_block,
    )

    goal = CONTENT_AGENT_GOAL.format(business_name=brand.business_name)

    # ── Market research tools (Sprint B) ──────────────────────────────────
    # Added to both tool tiers — agents can now research trends during execution.
    market_research_tools = build_market_research_tools(
        apify_api_key=settings.apify_api_key or "",
        apify_timeout=settings.apify_timeout_seconds,
    )
    perplexity_tool = PerplexitySearchTool(
        api_key=settings.perplexity_api_key or "",
        model=settings.perplexity_model,
    )

    use_light_tools = (for_ideation and not settings.crewai_content_ideation_instagram_tools) or (
        for_calendar and not settings.crewai_content_calendar_instagram_tools
    )

    if use_light_tools:
        tools = [
            AssetSelectorTool(),
            ImagePromptPreparerTool(),
            perplexity_tool,            # real-time web research
            *market_research_tools,     # Apify hashtag + competitor scan
        ]
        max_iter = settings.crewai_content_ideation_max_iter if for_ideation else settings.crewai_content_max_iter
        if for_calendar and not for_ideation:
            max_iter = min(max_iter, settings.crewai_content_ideation_max_iter)
        # Allow more iterations when market research tools are available
        max_iter = min(max_iter + 2, 10)
    else:
        tools = [
            InstagramInsightsTool(),
            InstagramContentPrepareTool(),
            AssetSelectorTool(),
            ImagePromptPreparerTool(),
            perplexity_tool,
            *market_research_tools,
        ]
        max_iter = (
            settings.crewai_content_ideation_max_iter
            if for_ideation
            else settings.crewai_content_max_iter
        )
        max_iter = min(max_iter + 2, 12)

    # Memory is always False in production — if enabled via CREWAI_AGENT_MEMORY=true,
    # ChromaDB would share a single vector store across all tenants (ISOLATION VIOLATION).
    # Tenant learning is handled safely via tenant_learning_service (DB-backed, per-tenant).
    agent_kwargs = dict(
        role=CONTENT_AGENT_ROLE,
        goal=goal,
        backstory=backstory,
        tools=tools,
        verbose=settings.crew_verbose,
        allow_delegation=False,
        max_iter=max_iter,
        memory=False,
        max_execution_time=max_execution_seconds or settings.crewai_content_agent_max_execution_seconds,
    )

    if llm:
        agent_kwargs["llm"] = llm

    return Agent(**agent_kwargs)
