"""
Video Production Agent — selects best gallery photo and writes the reel video prompt.
"""

from __future__ import annotations

from crewai import Agent, LLM

from app.config import get_settings
from app.crew.context import BrandInfo, build_brand_context_prompt
from app.crew.prompts.video_production_prompts import (
    VIDEO_PRODUCTION_AGENT_BACKSTORY,
    VIDEO_PRODUCTION_AGENT_GOAL,
    VIDEO_PRODUCTION_AGENT_ROLE,
)


def create_video_production_agent(brand: BrandInfo, llm: LLM | None = None) -> Agent:
    settings = get_settings()
    # "video" profile: includes industry calendar (urgency/phase) + market intel + Pinterest
    # Critical: video agent must know current season urgency to choose the right motion style
    brand_context = build_brand_context_prompt(brand, profile="video")

    backstory = VIDEO_PRODUCTION_AGENT_BACKSTORY.format(
        business_name=brand.business_name,
        business_type=brand.business_type,
        brand_context=brand_context,
    )
    goal = VIDEO_PRODUCTION_AGENT_GOAL.format(business_name=brand.business_name)

    agent_kwargs = dict(
        role=VIDEO_PRODUCTION_AGENT_ROLE,
        goal=goal,
        backstory=backstory,
        tools=[],
        verbose=settings.crew_verbose,
        allow_delegation=False,
        max_iter=3,
        memory=False,
    )
    if llm:
        agent_kwargs["llm"] = llm

    return Agent(**agent_kwargs)
