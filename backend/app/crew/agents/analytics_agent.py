"""
Analytics Agent definition.

Creates a CrewAI Agent for website analytics, SEO, and conversion analysis.
Uses GA4 and Search Console tools for real data.
"""

from __future__ import annotations

from crewai import Agent, LLM

from app.config import get_settings
from app.crew.context import BrandInfo, build_brand_context_prompt
from app.crew.prompts.analytics_prompts import (
    ANALYTICS_AGENT_BACKSTORY,
    ANALYTICS_AGENT_GOAL,
    ANALYTICS_AGENT_ROLE,
)
from app.crew.tools.analytics import (
    GA4TrafficSummaryTool,
    GA4TrafficSourcesTool,
    GA4ConversionsTool,
    GA4PagePerformanceTool,
)
from app.crew.tools.search_console import (
    SearchConsoleQueriesTool,
    SearchConsolePagesTool,
    SearchConsoleDevicesTool,
)


def create_analytics_agent(brand: BrandInfo, llm: LLM | None = None) -> Agent:
    brand_context_block = build_brand_context_prompt(brand, profile="minimal")

    _lang_map = {"en": "English", "tr": "Turkish", "de": "German", "fr": "French", "es": "Spanish"}
    _raw_lang = (brand.languages or "tr").split(",")[0].strip().lower()
    output_language = _lang_map.get(_raw_lang, _raw_lang.capitalize())

    backstory = ANALYTICS_AGENT_BACKSTORY.format(
        business_name=brand.business_name,
        business_type=brand.business_type,
        location=brand.location or "not specified",
        target_audience=brand.target_audience or "general audience",
        campaign_goals=brand.campaign_goals or "increase visibility and conversions",
        output_language=output_language,
        brand_context=brand_context_block,
    )

    goal = ANALYTICS_AGENT_GOAL.format(business_name=brand.business_name)

    agent_kwargs = dict(
        role=ANALYTICS_AGENT_ROLE,
        goal=goal,
        backstory=backstory,
        tools=[
            GA4TrafficSummaryTool(),
            GA4TrafficSourcesTool(),
            GA4ConversionsTool(),
            GA4PagePerformanceTool(),
            SearchConsoleQueriesTool(),
            SearchConsolePagesTool(),
            SearchConsoleDevicesTool(),
        ],
        verbose=True,
        allow_delegation=False,
        max_iter=8,
        memory=False,  # ChromaDB shared across tenants — isolation violation risk
    )

    if llm:
        agent_kwargs["llm"] = llm

    return Agent(**agent_kwargs)
