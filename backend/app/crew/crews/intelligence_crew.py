"""
Intelligence Crew — runs the CEO agent to produce task recommendations.

Input:  BrandInfo + pre-built health snapshot dict
Output: list of RecommendedTask dicts, each with priority/agent/brief/impact
"""

from __future__ import annotations

import json
import re
from typing import Any

import structlog
from crewai import Crew, LLM, Process, Task

from app.config import get_settings
from app.crew.agents.intelligence_agent import create_intelligence_agent
from app.crew.context import BrandInfo, build_brand_context_prompt
from app.crew.cta_localization import resolve_output_language
from app.crew.prompts.intelligence_prompts import INTELLIGENCE_TASK_PROMPT
from app.crew.token_usage import total_tokens_from_crew
from app.crew.tools.workspace_health import WorkspaceHealthAnalyzerTool

logger = structlog.get_logger()


def run_intelligence_analysis(
    brand: BrandInfo,
    health_snapshot: dict[str, Any],
    llm: LLM | None = None,
) -> dict[str, Any]:
    """
    Run the CEO Intelligence Agent and return task recommendations.

    Returns a dict with:
      - recommendations: list of task dicts (priority/agent_role/task_type/title/reason/brief/impact/input_data)
      - raw_output: full agent response string
      - tokens_used: LLM usage
    """
    settings = get_settings()

    health_tool = WorkspaceHealthAnalyzerTool(health_data=health_snapshot)
    agent = create_intelligence_agent(brand, health_tool, llm=llm)

    brand_context_block = build_brand_context_prompt(brand, profile="minimal")
    output_language = resolve_output_language(brand.languages)

    task_description = INTELLIGENCE_TASK_PROMPT.format(
        business_name=brand.business_name,
        health_snapshot=json.dumps(health_snapshot, ensure_ascii=False, indent=2),
        brand_context=brand_context_block,
        output_language=output_language,
    )

    recommendation_task = Task(
        description=task_description,
        expected_output=(
            "A JSON array of 3–5 task recommendation objects, each with: "
            "priority, agent_role, task_type, title, reason, brief, "
            "estimated_impact, and input_data."
        ),
        agent=agent,
    )

    crew = Crew(
        agents=[agent],
        tasks=[recommendation_task],
        process=Process.sequential,
        verbose=settings.crew_verbose,
    )

    result = crew.kickoff()
    raw_output = str(result)

    # Parse recommendations from raw output
    recommendations = _parse_recommendations(raw_output)

    logger.info(
        "intelligence_analysis_complete",
        business=brand.business_name,
        recommendations_count=len(recommendations),
    )

    return {
        "crew_name": "intelligence_crew",
        "task_type": "workspace_intelligence",
        "status": "completed",
        "recommendations": recommendations,
        "raw_output": raw_output,
        "tokens_used": total_tokens_from_crew(crew),
    }


def _parse_recommendations(raw: str) -> list[dict]:
    """Extract the JSON recommendations array from the agent's output."""
    # Try direct JSON parse first (agent may return clean JSON)
    try:
        parsed = json.loads(raw.strip())
        if isinstance(parsed, list):
            return _validate_recommendations(parsed)
    except json.JSONDecodeError:
        pass

    # Try extracting JSON array from prose
    match = re.search(r"\[.*?\]", raw, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group())
            if isinstance(parsed, list):
                return _validate_recommendations(parsed)
        except json.JSONDecodeError:
            pass

    logger.warning("intelligence_parse_failed", raw_preview=raw[:200])
    return []


_VALID_PRIORITIES = {"critical", "high", "medium", "low"}

# Authoritative agent → allowed task_types mapping (mirrors engine.py AGENT_ROLES).
# Used to cross-validate that the CEO agent doesn't mix roles and tasks.
# Ordered list so the first item is always the safest default for that agent.
_AGENT_TASK_MAP: dict[str, list[str]] = {
    "review_agent":           ["review_analysis", "single_review_response"],
    "content_agent":          ["content_ideation", "content_calendar", "visual_design_cards"],
    "content_strategy_agent": ["content_strategy"],
    "ads_agent":              ["campaign_analysis", "ads_budget_optimization"],
    "analytics_agent":        ["traffic_analysis", "weekly_performance", "conversion_report"],
}

# Flat sets for individual field validation
_VALID_AGENTS    = set(_AGENT_TASK_MAP.keys())
_VALID_TASK_TYPES = {t for tasks in _AGENT_TASK_MAP.values() for t in tasks}


def _fix_agent_task_pair(agent_role: str, task_type: str) -> tuple[str, str]:
    """
    Ensure agent_role and task_type are a valid combination.
    If the pair is invalid, keep the agent_role and pick its default task_type.
    Returns (agent_role, task_type) that is guaranteed to pass engine validation.
    """
    if agent_role not in _VALID_AGENTS:
        agent_role = "content_agent"
    if task_type not in _AGENT_TASK_MAP.get(agent_role, set()):
        # Pick the first valid task_type for this agent
        task_type = next(iter(_AGENT_TASK_MAP[agent_role]))
        logger.warning(
            "intelligence_task_type_corrected",
            agent_role=agent_role,
            corrected_to=task_type,
        )
    return agent_role, task_type


def _validate_recommendations(items: list) -> list[dict]:
    """Filter, cross-validate, and normalise recommendation objects."""
    valid = []
    for item in items:
        if not isinstance(item, dict):
            continue

        raw_agent = item.get("agent_role", "content_agent")
        raw_task  = item.get("task_type",  "content_ideation")
        agent_role, task_type = _fix_agent_task_pair(raw_agent, raw_task)

        rec = {
            "priority":         item.get("priority", "medium") if item.get("priority") in _VALID_PRIORITIES else "medium",
            "agent_role":       agent_role,
            "task_type":        task_type,
            "title":            str(item.get("title", "AI Recommended Task"))[:80],
            "reason":           str(item.get("reason", ""))[:300],
            "brief":            str(item.get("brief", ""))[:1000],
            "estimated_impact": str(item.get("estimated_impact", ""))[:200],
            "input_data":       item.get("input_data") or {"brief": item.get("brief", "")},
        }
        if rec["brief"]:
            valid.append(rec)
    return valid[:5]
