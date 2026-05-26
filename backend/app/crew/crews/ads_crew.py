"""
Ads Crew – orchestrates advertising analysis and optimization.

Composes the Ads Agent with tasks for campaign analysis and
ad creative generation.
"""

from __future__ import annotations

from typing import Any

from crewai import Crew, Process, LLM

from app.config import get_settings
from app.crew.agents.ads_agent import create_ads_agent
from app.crew.context import BrandInfo
from app.crew.token_usage import total_tokens_from_crew
from app.crew.tasks.ads_tasks import (
    create_campaign_analysis_task,
    create_ad_creative_task,
    create_budget_optimization_task,
)


def run_campaign_analysis(
    brand: BrandInfo,
    campaign_data: str = "",
    llm: LLM | None = None,
) -> dict[str, Any]:
    """Analyze campaign performance and generate optimization recommendations."""
    ads_agent = create_ads_agent(brand, llm=llm)
    analysis_task = create_campaign_analysis_task(ads_agent, brand, campaign_data)

    crew = Crew(
        agents=[ads_agent],
        tasks=[analysis_task],
        process=Process.sequential,
        verbose=get_settings().crew_verbose,
    )

    result = crew.kickoff()

    return {
        "crew_name": "ads_crew",
        "task_type": "campaign_analysis",
        "status": "completed",
        "raw_output": str(result),
        "agent_role": "ads_agent",
        "tokens_used": total_tokens_from_crew(crew),
    }


def run_ad_creative_generation(
    brand: BrandInfo,
    platform: str = "google_ads",
    objective: str = "conversions",
    count: int = 3,
    llm: LLM | None = None,
) -> dict[str, Any]:
    """Generate ad creative concepts."""
    ads_agent = create_ads_agent(brand, llm=llm)
    creative_task = create_ad_creative_task(ads_agent, brand, platform, objective, count)

    crew = Crew(
        agents=[ads_agent],
        tasks=[creative_task],
        process=Process.sequential,
        verbose=get_settings().crew_verbose,
    )

    result = crew.kickoff()

    return {
        "crew_name": "ads_crew",
        "task_type": "ad_creative_generation",
        "status": "completed",
        "raw_output": str(result),
        "agent_role": "ads_agent",
        "parameters": {"platform": platform, "objective": objective, "count": count},
        "tokens_used": total_tokens_from_crew(crew),
    }


def run_budget_optimization(
    brand: BrandInfo,
    llm: LLM | None = None,
) -> dict[str, Any]:
    """Generate AI-driven budget allocation recommendations."""
    ads_agent = create_ads_agent(brand, llm=llm)
    task = create_budget_optimization_task(ads_agent, brand)

    crew = Crew(
        agents=[ads_agent],
        tasks=[task],
        process=Process.sequential,
        verbose=get_settings().crew_verbose,
    )

    result = crew.kickoff()

    return {
        "crew_name": "ads_crew",
        "task_type": "auto_budget_optimize",
        "status": "completed",
        "raw_output": str(result),
        "agent_role": "ads_agent",
        "tokens_used": total_tokens_from_crew(crew),
    }
