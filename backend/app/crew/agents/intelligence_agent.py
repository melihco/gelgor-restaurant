"""
CEO Intelligence Agent — strategic advisor that analyses workspace health
and generates prioritised task recommendations.
"""

from __future__ import annotations

from crewai import Agent, LLM

from app.config import get_settings
from app.crew.context import BrandInfo, build_brand_context_prompt
from app.crew.cta_localization import resolve_output_language
from app.crew.prompts.intelligence_prompts import (
    INTELLIGENCE_AGENT_BACKSTORY,
    INTELLIGENCE_AGENT_GOAL,
    INTELLIGENCE_AGENT_ROLE,
)
from app.crew.tools.workspace_health import WorkspaceHealthAnalyzerTool


def create_intelligence_agent(
    brand: BrandInfo,
    health_tool: WorkspaceHealthAnalyzerTool,
    llm: LLM | None = None,
) -> Agent:
    """
    Create the CEO Intelligence Agent with the workspace health tool.
    Uses Claude 3.5 Sonnet by default — strategic analysis benefits from
    Claude's reasoning and contextual synthesis.
    """
    settings = get_settings()
    brand_context_block = build_brand_context_prompt(brand, profile="minimal")
    output_language = resolve_output_language(brand.languages)

    backstory = INTELLIGENCE_AGENT_BACKSTORY.format(
        business_name=brand.business_name,
        business_type=brand.business_type,
        location=brand.location or "not specified",
        output_language=output_language,
        brand_context=brand_context_block,
    )
    goal = INTELLIGENCE_AGENT_GOAL.format(business_name=brand.business_name)

    agent_kwargs: dict = dict(
        role=INTELLIGENCE_AGENT_ROLE,
        goal=goal,
        backstory=backstory,
        tools=[health_tool],
        verbose=settings.crew_verbose,
        allow_delegation=False,
        max_iter=4,   # health read + analysis + output, no loops needed
        memory=False,  # stateless — health data is injected fresh each run
    )

    if llm:
        agent_kwargs["llm"] = llm

    return Agent(**agent_kwargs)
