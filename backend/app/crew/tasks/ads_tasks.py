"""
CrewAI Task definitions for the Ads Agent crew.
"""

from __future__ import annotations

from crewai import Agent, Task

from app.crew.context import BrandInfo
from app.crew.prompts.ads_prompts import ADS_ANALYSIS_TASK, ADS_CREATIVE_TASK, ADS_BUDGET_OPTIMIZE_TASK


def create_campaign_analysis_task(
    agent: Agent,
    brand: BrandInfo,
    campaign_data: str = "",
) -> Task:
    description = ADS_ANALYSIS_TASK.format(
        business_name=brand.business_name,
        campaign_data=campaign_data or "Use the google_ads_campaigns tool to fetch current campaign data.",
    )

    return Task(
        description=description,
        expected_output=(
            "A JSON object with performance_summary, key_metrics, opportunities, "
            "budget_recommendation, creative_suggestions, and warning_flags."
        ),
        agent=agent,
    )


def create_ad_creative_task(
    agent: Agent,
    brand: BrandInfo,
    platform: str = "google_ads",
    objective: str = "conversions",
    count: int = 3,
) -> Task:
    description = ADS_CREATIVE_TASK.format(
        business_name=brand.business_name,
        count=count,
        platform=platform,
        objective=objective,
        target_audience=brand.target_audience or "general audience",
    )

    return Task(
        description=description,
        expected_output=(
            "A JSON array of ad creative concepts, each with headline_options, "
            "description_options, visual_direction, cta, targeting_suggestion, "
            "and landing_page_recommendation."
        ),
        agent=agent,
    )


def create_budget_optimization_task(agent: Agent, brand: BrandInfo) -> Task:
    description = ADS_BUDGET_OPTIMIZE_TASK.format(
        business_name=brand.business_name,
    )

    return Task(
        description=description,
        expected_output=(
            "A JSON object with current_total_daily, recommended_total_daily, "
            "campaign_changes (list), overall_projected_improvement, risk_assessment, "
            "implementation_timeline, and monitoring_kpis."
        ),
        agent=agent,
    )
