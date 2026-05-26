"""
Ads Agent definition.

Creates a CrewAI Agent for advertising campaign analysis and optimization.
Produces specific, actionable recommendations rather than vague advice.
"""

from __future__ import annotations

from crewai import Agent, LLM

from app.config import get_settings
from app.crew.context import BrandInfo, build_brand_context_prompt
from app.crew.prompts.ads_prompts import (
    ADS_AGENT_BACKSTORY,
    ADS_AGENT_GOAL,
    ADS_AGENT_ROLE,
)
from app.crew.tools.google_ads import (
    GoogleAdsCampaignTool,
    GoogleAdsAdGroupTool,
    GoogleAdsKeywordTool,
)


def create_ads_agent(brand: BrandInfo, llm: LLM | None = None) -> Agent:
    brand_context_block = build_brand_context_prompt(brand, profile="ads")

    _lang_map = {"en": "English", "tr": "Turkish", "de": "German", "fr": "French", "es": "Spanish"}
    _raw_lang = (brand.languages or "tr").split(",")[0].strip().lower()
    output_language = _lang_map.get(_raw_lang, _raw_lang.capitalize())

    backstory = ADS_AGENT_BACKSTORY.format(
        business_name=brand.business_name,
        business_type=brand.business_type,
        location=brand.location or "not specified",
        target_audience=brand.target_audience or "general audience",
        campaign_goals=brand.campaign_goals or "increase visibility and conversions",
        output_language=output_language,
        brand_context=brand_context_block,
    )

    goal = ADS_AGENT_GOAL.format(business_name=brand.business_name)

    agent_kwargs = dict(
        role=ADS_AGENT_ROLE,
        goal=goal,
        backstory=backstory,
        tools=[
            GoogleAdsCampaignTool(),
            GoogleAdsAdGroupTool(),
            GoogleAdsKeywordTool(),
        ],
        verbose=True,
        allow_delegation=False,
        max_iter=6,
        memory=False,  # ChromaDB shared across tenants — isolation violation risk
    )

    if llm:
        agent_kwargs["llm"] = llm

    return Agent(**agent_kwargs)
