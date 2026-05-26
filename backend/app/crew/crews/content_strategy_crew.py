"""
Content Strategy Crew – creates the weekly mission brief for Gram Master.
"""

from __future__ import annotations

from typing import Any

from crewai import Crew, LLM, Process

from app.config import get_settings
from app.crew.agents.content_strategy_agent import create_content_strategy_agent
from app.crew.context import BrandInfo
from app.crew.tasks.content_strategy_tasks import create_content_strategy_task
from app.crew.token_usage import total_tokens_from_crew


def run_content_strategy(
    brand: BrandInfo,
    *,
    brief: str = "",
    content_pillars: list[str] | None = None,
    time_period: str = "next week",
    llm: LLM | None = None,
) -> dict[str, Any]:
    """Generate a strategic weekly mission brief for Gram Master."""
    strategy_agent = create_content_strategy_agent(brand, llm=llm)
    strategy_task = create_content_strategy_task(
        strategy_agent,
        brand,
        brief=brief,
        content_pillars=content_pillars,
        time_period=time_period,
    )

    crew = Crew(
        agents=[strategy_agent],
        tasks=[strategy_task],
        process=Process.sequential,
        verbose=get_settings().crew_verbose,
    )

    result = crew.kickoff()

    return {
        "crew_name": "content_strategy_crew",
        "task_type": "content_strategy",
        "status": "completed",
        "raw_output": str(result),
        "agent_role": "content_strategy_agent",
        "parameters": {
            "brief": brief,
            "content_pillars": content_pillars or [],
            "time_period": time_period,
        },
        "tokens_used": total_tokens_from_crew(crew),
    }
