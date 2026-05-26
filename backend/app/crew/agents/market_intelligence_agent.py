"""
Market Intelligence Agent — daily trend scout and competitor monitor.
"""

from __future__ import annotations

from crewai import Agent, LLM

from app.config import get_settings
from app.crew.context import BrandInfo
from app.crew.prompts.market_intelligence_prompts import (
    MARKET_AGENT_BACKSTORY,
    MARKET_AGENT_GOAL,
    MARKET_AGENT_ROLE,
)
from app.crew.tools.apify_tools import build_market_research_tools
from app.crew.tools.perplexity_search import PerplexitySearchTool


def create_market_intelligence_agent(brand: BrandInfo, llm: LLM | None = None) -> Agent:
    settings = get_settings()

    backstory = MARKET_AGENT_BACKSTORY.format(
        business_name=brand.business_name,
        business_type=brand.business_type,
        location=brand.location or "Turkey",
    )
    goal = MARKET_AGENT_GOAL.format(business_name=brand.business_name)

    tools = [
        PerplexitySearchTool(
            api_key=settings.perplexity_api_key or "",
            model=settings.perplexity_model,
        ),
        *build_market_research_tools(
            apify_api_key=settings.apify_api_key or "",
            apify_timeout=settings.apify_timeout_seconds,
        ),
    ]

    agent_kwargs: dict = dict(
        role=MARKET_AGENT_ROLE,
        goal=goal,
        backstory=backstory,
        tools=tools,
        verbose=settings.crew_verbose,
        allow_delegation=False,
        max_iter=8,
        memory=False,
    )
    if llm:
        agent_kwargs["llm"] = llm

    return Agent(**agent_kwargs)
