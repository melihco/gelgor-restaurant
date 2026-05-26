"""
CrewAI task definitions for the Content Strategy Agent.
"""

from __future__ import annotations

from crewai import Agent, Task

from app.crew.context import BrandInfo, build_urgency_directive
from app.crew.prompts.content_strategy_prompts import CONTENT_STRATEGY_TASK


def create_content_strategy_task(
    agent: Agent,
    brand: BrandInfo,
    *,
    brief: str = "",
    content_pillars: list[str] | None = None,
    time_period: str = "next week",
) -> Task:
    competitor_brief = getattr(brand, "competitor_brief", "") or "No competitor data available."
    trend_brief = getattr(brand, "trend_brief", "") or "No trend data available for this week."

    description = CONTENT_STRATEGY_TASK.format(
        business_name=brand.business_name,
        content_pillars=", ".join(content_pillars or ["brand story", "product/service value", "social proof", "conversion CTA"]),
        available_assets=", ".join(brand.asset_descriptions or ["No assets uploaded yet"]),
        brief=brief or "No extra operator context. Infer the best weekly brief from brand memory.",
        time_period=time_period,
        competitor_brief=competitor_brief,
        trend_brief=trend_brief,
    )

    urgency_block = build_urgency_directive(brand)
    if urgency_block:
        description = urgency_block + "\n\n---\n\n" + description

    return Task(
        description=description,
        expected_output=(
            "A valid JSON object with weekly_theme, mission_brief, pillar_mix, "
            "recommended_formats, template_use_cases, asset_intents, missing_question, "
            "ready_for_gram_master, and strategy_notes."
        ),
        agent=agent,
    )
