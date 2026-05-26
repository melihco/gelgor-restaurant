"""
CreativeDirectorAgent — post-execution brand safety validator.

Reads brand context from backstory (injected at creation time),
reads the generated content from the task description,
and returns a structured JSON verdict: {approved, confidence, violations, notes}.

No tools — context is already in backstory.
max_iter=2 — read content + output verdict (no looping needed).
"""

from __future__ import annotations

from crewai import Agent, LLM

from app.config import get_settings
from app.crew.context import BrandInfo, build_brand_context_prompt
from app.crew.prompts.creative_director_prompts import (
    CREATIVE_DIRECTOR_BACKSTORY,
    CREATIVE_DIRECTOR_GOAL,
    CREATIVE_DIRECTOR_ROLE,
)


def create_creative_director_agent(brand: BrandInfo, llm: LLM | None = None) -> Agent:
    """
    Create the CreativeDirectorAgent with full brand context in its backstory.

    Uses Claude by default — instruction-following and JSON output are reliable.
    Minimal context profile: we only need brand identity + rules, not market intel.
    """
    settings = get_settings()

    # Use "review" profile — brand identity + risk rules only, compact
    brand_context_block = build_brand_context_prompt(brand, profile="review")

    backstory = CREATIVE_DIRECTOR_BACKSTORY.format(
        business_name=brand.business_name,
        brand_context=brand_context_block,
    )
    goal = CREATIVE_DIRECTOR_GOAL.format(business_name=brand.business_name)

    agent_kwargs: dict = dict(
        role=CREATIVE_DIRECTOR_ROLE,
        goal=goal,
        backstory=backstory,
        tools=[],           # no tools — everything is in the backstory
        verbose=settings.crew_verbose,
        allow_delegation=False,
        max_iter=2,         # read task → output verdict (tight loop)
        memory=False,
    )

    if llm:
        agent_kwargs["llm"] = llm

    return Agent(**agent_kwargs)
