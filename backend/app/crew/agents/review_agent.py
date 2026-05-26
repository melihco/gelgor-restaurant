"""
Review Agent definition.

Creates a CrewAI Agent configured for Google review analysis and response
generation. The agent uses brand context to produce business-specific outputs.
"""

from __future__ import annotations

from crewai import Agent, LLM

from app.config import get_settings
from app.crew.context import BrandInfo, build_brand_context_prompt
from app.crew.prompts.review_prompts import (
    REVIEW_AGENT_BACKSTORY,
    REVIEW_AGENT_GOAL,
    REVIEW_AGENT_ROLE,
)
from app.crew.tools.google_reviews import GoogleReviewsTool, GoogleReviewResponderTool


def create_review_agent(brand: BrandInfo, llm: LLM | None = None) -> Agent:
    """
    Factory function that builds a Review Agent configured for a specific brand.

    Using a factory instead of class inheritance keeps the agent definition
    decoupled from CrewAI internals and makes it easy to swap configuration
    per workspace.
    """
    # "review" profile + competitor_brief so agent can contextualize negative reviews
    # against competitive landscape (e.g. "competitors charge more but get same complaint")
    brand_context_block = build_brand_context_prompt(brand, profile="review")
    if brand.competitor_brief:
        brand_context_block += (
            f"\n\n## 🏆 Competitor Context (for review response framing)\n"
            f"{brand.competitor_brief[:400]}\n"
        )

    backstory = REVIEW_AGENT_BACKSTORY.format(
        business_name=brand.business_name,
        business_type=brand.business_type,
        location=brand.location or "not specified",
        brand_tone=brand.brand_tone,
        description=brand.description or "A local business serving its community.",
        brand_context=brand_context_block,
    )

    goal = REVIEW_AGENT_GOAL.format(business_name=brand.business_name)

    agent_kwargs = dict(
        role=REVIEW_AGENT_ROLE,
        goal=goal,
        backstory=backstory,
        tools=[GoogleReviewsTool(), GoogleReviewResponderTool()],
        verbose=True,
        allow_delegation=False,
        max_iter=5,
        memory=False,  # ChromaDB shared across tenants — isolation violation risk
    )

    if llm:
        agent_kwargs["llm"] = llm

    return Agent(**agent_kwargs)
