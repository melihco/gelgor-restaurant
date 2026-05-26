"""
Content Strategy Agent definition.

Decides the weekly mission brief before Gram Master creates content.

Sprint B: Market research tools added so the strategy agent can look up
live trends and competitor activity when building the weekly brief.
"""

from __future__ import annotations

from crewai import Agent, LLM

from app.config import get_settings
from app.crew.context import BrandInfo, build_brand_context_prompt
from app.crew.prompts.content_strategy_prompts import (
    CONTENT_STRATEGY_AGENT_BACKSTORY,
    CONTENT_STRATEGY_AGENT_GOAL,
    CONTENT_STRATEGY_AGENT_ROLE,
)
from app.crew.tools.image_pipeline import AssetSelectorTool
from app.crew.tools.apify_tools import build_market_research_tools
from app.crew.tools.perplexity_search import PerplexitySearchTool


def create_content_strategy_agent(brand: BrandInfo, llm: LLM | None = None) -> Agent:
    settings = get_settings()
    brand_context_block = build_brand_context_prompt(brand)

    _lang_map = {"en": "English", "tr": "Turkish", "de": "German", "fr": "French", "es": "Spanish"}
    _raw_lang = (brand.languages or "tr").split(",")[0].strip().lower()
    output_language = _lang_map.get(_raw_lang, _raw_lang.capitalize())

    backstory = CONTENT_STRATEGY_AGENT_BACKSTORY.format(
        business_name=brand.business_name,
        business_type=brand.business_type,
        location=brand.location or "not specified",
        brand_tone=brand.brand_tone or "professional",
        visual_style=brand.visual_style or "modern and clean",
        target_audience=brand.target_audience or "general audience",
        campaign_goals=brand.campaign_goals or "increase engagement and conversion",
        output_language=output_language,
        brand_context=brand_context_block,
    )

    # Sprint B: market research tools for live trend and competitor data
    market_tools = build_market_research_tools(
        apify_api_key=settings.apify_api_key or "",
        apify_timeout=settings.apify_timeout_seconds,
    )
    perplexity = PerplexitySearchTool(
        api_key=settings.perplexity_api_key or "",
        model=settings.perplexity_model,
    )

    agent_kwargs = dict(
        role=CONTENT_STRATEGY_AGENT_ROLE,
        goal=CONTENT_STRATEGY_AGENT_GOAL.format(business_name=brand.business_name),
        backstory=backstory,
        tools=[AssetSelectorTool(), perplexity, *market_tools],
        verbose=settings.crew_verbose,
        allow_delegation=False,
        max_iter=settings.crewai_content_ideation_max_iter + 2,
        memory=False,  # ChromaDB shared across tenants — isolation violation risk
        max_execution_time=settings.crewai_content_agent_max_execution_seconds,
    )

    if llm:
        agent_kwargs["llm"] = llm

    return Agent(**agent_kwargs)
