"""
StrategistAgent — the AI campaign planner.

Reads all brand intelligence already injected via BrandInfo and produces
MissionProposal[] objects with full TaskGraphs.

No external tools needed — all intelligence (brand_dna, competitor_pulse,
market_opportunity_ideas, industry_calendar, social_signals, trend_brief,
learning_context) is already present in the brand context block.

Using tools here would slow the crew down without adding value since the
context already contains the synthesised intelligence layer.
"""

from __future__ import annotations

from crewai import Agent, LLM

from app.config import get_settings
from app.crew.context import BrandInfo, build_brand_context_prompt
from app.crew.prompts.strategist_prompts import (
    STRATEGIST_AGENT_BACKSTORY,
    STRATEGIST_AGENT_GOAL,
    STRATEGIST_AGENT_ROLE,
)


def create_strategist_agent(brand: BrandInfo, llm: LLM | None = None) -> Agent:
    """
    Create the StrategistAgent with full brand intelligence in its backstory.

    Uses Claude by default — strategic synthesis and structured JSON output
    benefit from Claude's instruction-following and reasoning strength.
    max_iter=3: read context → synthesise missions → output JSON (no loops).
    """
    settings = get_settings()
    brand_context_block = build_brand_context_prompt(brand, profile="full")

    backstory = STRATEGIST_AGENT_BACKSTORY.format(
        business_name=brand.business_name,
        business_type=brand.business_type,
        location=brand.location or "Türkiye",
        brand_context=brand_context_block,
    )
    goal = STRATEGIST_AGENT_GOAL.format(business_name=brand.business_name)

    agent_kwargs: dict = dict(
        role=STRATEGIST_AGENT_ROLE,
        goal=goal,
        backstory=backstory,
        tools=[],           # No tools — context already contains all intelligence
        verbose=settings.crew_verbose,
        allow_delegation=False,
        max_iter=3,         # Context read → synthesis → output (tight loop)
        memory=False,       # Stateless — fresh intelligence injected every call
    )

    if llm:
        agent_kwargs["llm"] = llm

    return Agent(**agent_kwargs)
