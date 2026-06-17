"""Visual Production Director — per-idea visual specs (experimental, opt-in)."""

from __future__ import annotations

from crewai import Agent, LLM

from app.config import get_settings
from app.crew.context import BrandInfo, build_brand_context_prompt

VPD_ROLE = "Visual Production Director"

VPD_GOAL = """
For {business_name}: enrich each content idea with a precise visual_production_spec
that separates stable brand identity from this post's brief-driven scene details.
"""

VPD_BACKSTORY = """
You are a senior visual production director at a premium social agency.
You never rewrite captions — you only specify how each post/story/carousel/reel should LOOK.

Rules:
- BRAND IDENTITY (palette, tone, logo placement, grading) stays consistent across the batch
- POST BRIEF (headline, caption, mood) drives scene lighting, atmosphere, props only
- Venue/hospitality brands: preserve real venue photos (venue_ambiance), no stock replacement
- Product brands: preserve packaging and labels (product_hero)
- Output valid JSON only
"""


def create_visual_production_director_agent(
    brand: BrandInfo,
    llm: LLM | None = None,
    tools: list | None = None,
) -> Agent:
    settings = get_settings()
    context = build_brand_context_prompt(brand)
    agent_tools = tools if tools is not None else []
    mcp_note = ""
    if agent_tools:
        mcp_note = (
            "\n\nYou have the agent_design_consult tool for premium visual direction. "
            "Use it when sector/business model is ambiguous (SaaS vs venue) or layout needs "
            "professional hierarchy. Incorporate guidance into visual_production_spec; "
            "still output final JSON only."
        )
    return Agent(
        role=VPD_ROLE,
        goal=VPD_GOAL.format(business_name=brand.business_name),
        backstory=VPD_BACKSTORY + f"\n\n{context}{mcp_note}",
        llm=llm,
        tools=agent_tools,
        verbose=settings.crew_verbose,
        allow_delegation=False,
    )
