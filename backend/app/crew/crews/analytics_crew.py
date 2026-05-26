"""
Analytics Crew – orchestrates website analytics and reporting.

Composes the Analytics Agent with tasks for traffic analysis,
conversion reporting, and weekly performance digests.
"""

from __future__ import annotations

from typing import Any

from crewai import Crew, Process, LLM

from app.config import get_settings
from app.crew.agents.analytics_agent import create_analytics_agent
from app.crew.context import BrandInfo
from app.crew.token_usage import total_tokens_from_crew
from app.crew.tasks.analytics_tasks import (
    create_traffic_analysis_task,
    create_conversion_report_task,
    create_weekly_performance_task,
)


def run_traffic_analysis(
    brand: BrandInfo,
    llm: LLM | None = None,
) -> dict[str, Any]:
    """Analyze website traffic and produce optimization recommendations."""
    agent = create_analytics_agent(brand, llm=llm)
    task = create_traffic_analysis_task(agent, brand)

    crew = Crew(
        agents=[agent],
        tasks=[task],
        process=Process.sequential,
        verbose=get_settings().crew_verbose,
    )

    result = crew.kickoff()

    return {
        "crew_name": "analytics_crew",
        "task_type": "traffic_analysis",
        "status": "completed",
        "raw_output": str(result),
        "agent_role": "analytics_agent",
        "tokens_used": total_tokens_from_crew(crew),
    }


def run_conversion_report(
    brand: BrandInfo,
    llm: LLM | None = None,
) -> dict[str, Any]:
    """Analyze conversion performance and identify opportunities."""
    agent = create_analytics_agent(brand, llm=llm)
    task = create_conversion_report_task(agent, brand)

    crew = Crew(
        agents=[agent],
        tasks=[task],
        process=Process.sequential,
        verbose=get_settings().crew_verbose,
    )

    result = crew.kickoff()

    return {
        "crew_name": "analytics_crew",
        "task_type": "conversion_report",
        "status": "completed",
        "raw_output": str(result),
        "agent_role": "analytics_agent",
    }


def run_weekly_performance(
    brand: BrandInfo,
    llm: LLM | None = None,
) -> dict[str, Any]:
    """Generate comprehensive weekly performance digest."""
    agent = create_analytics_agent(brand, llm=llm)
    task = create_weekly_performance_task(agent, brand)

    crew = Crew(
        agents=[agent],
        tasks=[task],
        process=Process.sequential,
        verbose=get_settings().crew_verbose,
    )

    result = crew.kickoff()

    return {
        "crew_name": "analytics_crew",
        "task_type": "weekly_performance",
        "status": "completed",
        "raw_output": str(result),
        "agent_role": "analytics_agent",
        "tokens_used": total_tokens_from_crew(crew),
    }
