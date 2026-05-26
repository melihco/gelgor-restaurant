"""
CrewAI Task definitions for the Analytics Agent crew.
"""

from __future__ import annotations

from crewai import Agent, Task

from app.crew.context import BrandInfo
from app.crew.prompts.analytics_prompts import (
    TRAFFIC_ANALYSIS_TASK,
    CONVERSION_REPORT_TASK,
    WEEKLY_PERFORMANCE_TASK,
)


def create_traffic_analysis_task(agent: Agent, brand: BrandInfo) -> Task:
    return Task(
        description=TRAFFIC_ANALYSIS_TASK.format(business_name=brand.business_name),
        expected_output=(
            "A JSON object with executive_summary, key_metrics, source_analysis, "
            "top_performing_pages, problem_areas, and prioritized recommendations."
        ),
        agent=agent,
    )


def create_conversion_report_task(agent: Agent, brand: BrandInfo) -> Task:
    return Task(
        description=CONVERSION_REPORT_TASK.format(business_name=brand.business_name),
        expected_output=(
            "A JSON object with conversion_summary, conversion_funnel, "
            "top_converting_sources, opportunities, and recommendations."
        ),
        agent=agent,
    )


def create_weekly_performance_task(agent: Agent, brand: BrandInfo) -> Task:
    return Task(
        description=WEEKLY_PERFORMANCE_TASK.format(business_name=brand.business_name),
        expected_output=(
            "A JSON object with period, headline, traffic_highlights, "
            "search_performance, conversion_update, action_items, wins, concerns."
        ),
        agent=agent,
    )
