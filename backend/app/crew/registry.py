"""
Canonical agent/task registry for Crew execution.

This file is the single backend source of truth for:
- role metadata returned by APIs
- valid task types per agent role
- validators used by Strategist / Intelligence / Engine
"""

from __future__ import annotations

from typing import Final

AGENT_ROLE_REGISTRY: Final[dict[str, dict[str, object]]] = {
    "review_agent": {
        "display_name": "Review Agent",
        "description": "Monitors and responds to Google Business reviews",
        "category": "reputation",
        "task_types": ["review_analysis", "single_review_response"],
    },
    "content_agent": {
        "display_name": "Content Agent",
        "description": "Creates Instagram content strategy and concepts",
        "category": "content",
        "task_types": ["content_ideation", "content_calendar", "visual_design_cards"],
    },
    "content_strategy_agent": {
        "display_name": "Content Strategy Agent",
        "description": "Decides weekly content priorities and mission briefs",
        "category": "content",
        "task_types": ["content_strategy"],
    },
    "ads_agent": {
        "display_name": "Ads Agent",
        "description": "Analyzes and optimizes advertising campaigns",
        "category": "advertising",
        "task_types": [
            "campaign_analysis",
            "ad_creative_generation",
            "auto_budget_optimize",
            "ads_budget_optimization",
        ],
    },
    "analytics_agent": {
        "display_name": "Analytics Agent",
        "description": "Analyzes website traffic, search performance, and conversions",
        "category": "analytics",
        "task_types": ["traffic_analysis", "conversion_report", "weekly_performance"],
    },
    "intelligence_agent": {
        "display_name": "CEO Intelligence Agent",
        "description": "Analyses workspace health and generates prioritised task recommendations",
        "category": "intelligence",
        "task_types": ["workspace_intelligence"],
    },
    "strategic_agent": {
        "display_name": "Campaign Strategist",
        "description": (
            "Reads all intelligence signals and generates coordinated multi-agent "
            "MissionProposal[] objects with full TaskGraphs"
        ),
        "category": "intelligence",
        "task_types": ["mission_planning"],
    },
    "feed_art_director": {
        "display_name": "Feed Art Director",
        "description": (
            "Reviews the full weekly content batch for cohesion: format distribution, "
            "visual variety, theme alignment, engagement arc, and publish schedule. "
            "Ensures the Instagram feed looks agency-produced, not algorithmic."
        ),
        "category": "visual",
        "task_types": ["feed_cohesion_review"],
    },
    "product_visual_studio": {
        "display_name": "Product Visual Studio",
        "description": (
            "Generates creative scene briefs for product photo enhancement. "
            "Reads brand DNA, sector, and caption to produce precise GPT image-2 "
            "directives that enhance the background, lighting, and composition "
            "while keeping the product, label, and logo pixel-perfect."
        ),
        "category": "visual",
        "task_types": ["product_scene_brief"],
    },
    "visual_production_director": {
        "display_name": "Visual Production Director (experimental)",
        "description": (
            "Opt-in: enriches each idea's visual_production_spec before auto-produce. "
            "Optional agent_design_consult skill (Claude; remote MCP servers optional). "
            "Does not replace ideation or Feed Art Director."
        ),
        "category": "visual",
        "task_types": ["visual_production_enrich"],
    },
}


def get_agent_roles() -> dict[str, dict[str, object]]:
    return AGENT_ROLE_REGISTRY


def get_task_types_for_role(agent_role: str) -> list[str]:
    role = AGENT_ROLE_REGISTRY.get(agent_role)
    if not role:
        return []
    return list(role.get("task_types", []))


def is_valid_agent_task_pair(agent_role: str, task_type: str) -> bool:
    return task_type in get_task_types_for_role(agent_role)


def first_task_type_for_role(agent_role: str, default: str = "content_ideation") -> str:
    task_types = get_task_types_for_role(agent_role)
    return task_types[0] if task_types else default


VALID_AGENT_TASK_MAP: Final[dict[str, list[str]]] = {
    role: list(meta["task_types"])
    for role, meta in AGENT_ROLE_REGISTRY.items()
}
