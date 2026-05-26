"""
CrewAI Engine – the single entry point from the application layer into CrewAI.

This module is the ONLY place that the application service layer touches
CrewAI. It provides a clean, typed interface that:
1. Accepts business-domain inputs (workspace, brand context, task type)
2. Maps them to the correct crew/agent/task composition
3. Executes the crew
4. Returns structured results

All CrewAI internals (agents, crews, tasks, tools) are hidden behind
this interface. If CrewAI's API changes, only this module needs updating.

The engine also handles LLM provider configuration, ensuring agents
use the correct model based on application settings.
"""

from __future__ import annotations

import os
import re
from typing import Any

import structlog
from crewai import LLM

from app.config import get_settings
from app.crew.context import BrandInfo
from app.crew.crews.review_crew import (
    run_review_analysis,
    run_single_review_response,
)
from app.crew.crews.content_crew import (
    run_content_ideation,
    run_content_calendar,
)
from app.crew.crews.content_strategy_crew import run_content_strategy
from app.crew.crews.visual_design_crew import run_visual_design_cards
from app.crew.crews.ads_crew import (
    run_campaign_analysis,
    run_ad_creative_generation,
    run_budget_optimization,
)
from app.crew.crews.analytics_crew import (
    run_traffic_analysis,
    run_conversion_report,
    run_weekly_performance,
)
from app.crew.crews.strategist_crew import run_mission_planning

logger = structlog.get_logger()


def _camel_to_snake(value: str) -> str:
    value = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", value)
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", value).lower()


def _normalize_input_keys(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            _camel_to_snake(str(key)): _normalize_input_keys(item)
            for key, item in value.items()
        }

    if isinstance(value, list):
        return [_normalize_input_keys(item) for item in value]

    return value

# Instagram/content-creation tasks: if the UI sends the wrong agent (e.g. Ads analyst + content ideation),
# run them on content_agent instead of coercing to ads_agent → campaign_analysis (no ideas / no imagery).
CONTENT_SHAPED_TASK_TYPES = frozenset(
    {"content_ideation", "content_calendar", "visual_design_cards"}
)


AGENT_ROLES = {
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
}


# Tasks that benefit most from Claude's creative language ability
_CLAUDE_PREFERRED_TASKS = {
    "content_ideation",
    "content_calendar",
    "content_strategy",
    "single_review_response",
    "review_analysis",
}

# Tasks that benefit from GPT-4o's analytical / structured-output strength
_GPT_PREFERRED_TASKS = {
    "campaign_analysis",
    "ad_creative_generation",
    "auto_budget_optimize",
    "ads_budget_optimization",
    "traffic_analysis",
    "conversion_report",
    "weekly_performance",
}

# Tasks that only need structured parsing / light reasoning — gpt-4o-mini is sufficient
# and 15x cheaper. These are purely data transformation tasks, not creative work.
_LITE_MODEL_TASKS = {
    "traffic_analysis",
    "conversion_report",
    "weekly_performance",
    "auto_budget_optimize",
    "ads_budget_optimization",
}


def get_llm(task_type: str | None = None, brand: "BrandInfo | None" = None) -> LLM:
    """
    Return the best LLM for the given task type, respecting per-tenant overrides.

    Resolution order (first match wins):
    1. brand.preferred_llm_provider / brand.preferred_llm_model  — per-tenant override
       stored in brand_contexts table, configured from Brand Hub.
    2. Smart per-task routing: content/review → Claude, analytics/ads → GPT-4o
    3. Global CREWAI_LLM_PROVIDER env var fallback.

    TENANT ISOLATION: each brand carries its own LLM preferences. Tenant A (B2B event
    firm using Claude Opus) and Tenant B (beach club using GPT-4o) never share a model
    selection — they each get their own LLM instance per call.
    """
    settings = get_settings()

    # Explicit Ollama override — for local dev without cloud API costs
    if settings.crewai_llm_provider == "ollama":
        return LLM(
            model=f"ollama/{settings.ollama_model}",
            base_url=settings.ollama_base_url,
        )

    has_anthropic = bool(settings.anthropic_api_key and settings.anthropic_api_key.strip())
    has_openai = bool(settings.openai_api_key and settings.openai_api_key.strip())

    # ── 1. Per-tenant override ────────────────────────────────────────────
    if brand and brand.preferred_llm_provider and brand.preferred_llm_model:
        provider = brand.preferred_llm_provider.lower()
        model = brand.preferred_llm_model
        if provider == "anthropic" and has_anthropic:
            os.environ["ANTHROPIC_API_KEY"] = settings.anthropic_api_key
            logger.debug("llm_tenant_override", tenant=brand.tenant_id, model=f"anthropic/{model}")
            return LLM(model=f"anthropic/{model}")
        if provider == "openai" and has_openai:
            os.environ["OPENAI_API_KEY"] = settings.openai_api_key
            logger.debug("llm_tenant_override", tenant=brand.tenant_id, model=f"openai/{model}")
            return LLM(model=f"openai/{model}")

    # ── 2. Smart per-task routing ─────────────────────────────────────────
    if task_type and has_anthropic and task_type in _CLAUDE_PREFERRED_TASKS:
        os.environ["ANTHROPIC_API_KEY"] = settings.anthropic_api_key
        model = settings.anthropic_model or "claude-3-5-sonnet-20241022"
        return LLM(model=f"anthropic/{model}")

    # Lite model for pure data/analytics tasks — 15x cheaper, no quality loss
    lite_model = getattr(settings, "openai_lite_model", "gpt-4o-mini")
    if task_type and has_openai and task_type in _LITE_MODEL_TASKS and lite_model:
        os.environ["OPENAI_API_KEY"] = settings.openai_api_key
        logger.debug("llm_lite_routing", task_type=task_type, model=f"openai/{lite_model}")
        return LLM(model=f"openai/{lite_model}")

    if task_type and has_openai and task_type in _GPT_PREFERRED_TASKS:
        os.environ["OPENAI_API_KEY"] = settings.openai_api_key
        if settings.openai_content_model:
            return LLM(model=f"openai/{settings.openai_content_model}")
        return LLM(model=f"openai/{settings.openai_model}")

    # ── 3. Global provider fallback ───────────────────────────────────────
    if settings.crewai_llm_provider == "anthropic" and has_anthropic:
        os.environ["ANTHROPIC_API_KEY"] = settings.anthropic_api_key
        model = settings.anthropic_model or "claude-3-5-sonnet-20241022"
        return LLM(model=f"anthropic/{model}")

    if has_openai:
        os.environ["OPENAI_API_KEY"] = settings.openai_api_key
    if task_type and task_type.startswith("content") and settings.openai_content_model:
        return LLM(model=f"openai/{settings.openai_content_model}")
    return LLM(model=f"openai/{settings.openai_model}")


class CrewEngine:
    """
    Main orchestration engine that maps business requests to CrewAI executions.

    Usage from the service layer:
        engine = CrewEngine()
        result = engine.execute("review_agent", "single_review_response", brand, input_data)

    LLM is not cached on the engine: concurrent .NET execute calls run in threads; sharing one
    LLM/client caused stuck runs when Wordsmith + Gram Master (both content_agent) overlapped.
    Internal /execute additionally serializes content_agent with an asyncio lock so two content
    crews never kick off in parallel in the same Python process.
    """

    @property
    def llm(self) -> LLM:
        return get_llm()

    def get_llm_for_task(self, task_type: str, brand: "BrandInfo | None" = None) -> LLM:
        """Return the best LLM for the given task type, respecting per-tenant override."""
        return get_llm(task_type=task_type, brand=brand)

    def get_available_roles(self) -> dict[str, dict]:
        return AGENT_ROLES

    def is_valid_execution(self, agent_role: str, task_type: str) -> bool:
        role_info = AGENT_ROLES.get(agent_role)
        if not role_info:
            return False
        return task_type in role_info["task_types"]

    def correct_execution(self, agent_role: str, task_type: str) -> tuple[str, str]:
        """
        If (agent_role, task_type) is invalid, return the closest valid pair.
        Prefers keeping agent_role and picking its first valid task_type.
        Called before execute() to ensure .NET never gets a 502.
        """
        if self.is_valid_execution(agent_role, task_type):
            return agent_role, task_type

        if task_type in CONTENT_SHAPED_TASK_TYPES and agent_role != "content_agent":
            logger.warning(
                "engine_route_content_task_to_content_agent",
                original=f"{agent_role}/{task_type}",
                corrected=f"content_agent/{task_type}",
            )
            return "content_agent", task_type

        role_info = AGENT_ROLES.get(agent_role)
        if role_info and role_info.get("task_types"):
            # Keep the agent, use its first valid task_type
            corrected_task = role_info["task_types"][0]
            logger.warning(
                "engine_task_type_corrected",
                original=f"{agent_role}/{task_type}",
                corrected=f"{agent_role}/{corrected_task}",
            )
            return agent_role, corrected_task

        # Unknown agent — fall back to content_agent/content_ideation
        logger.warning(
            "engine_agent_role_corrected",
            original=f"{agent_role}/{task_type}",
            corrected="content_agent/content_ideation",
        )
        return "content_agent", "content_ideation"

    def execute(
        self,
        agent_role: str,
        task_type: str,
        brand: BrandInfo,
        input_data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Execute a crew for the given agent role and task type.

        This is the main dispatch method. It maps (agent_role, task_type)
        to the correct crew runner and passes brand context + inputs.

        Returns a structured dict with:
        - crew_name, task_type, status, raw_output, agent_role
        - Any task-specific additional data
        """
        input_data = _normalize_input_keys(input_data or {})
        # Resolve LLM: per-tenant override wins, then per-task smart routing
        llm = self.get_llm_for_task(task_type, brand=brand)

        logger.info(
            "crew_execution_start",
            agent_role=agent_role,
            task_type=task_type,
            business=brand.business_name,
            tenant_id=brand.tenant_id or "unknown",
            llm_model=getattr(llm, "model", "unknown"),
        )

        # Auto-correct invalid combinations instead of failing with 502.
        # .NET passes whatever task_type the UI sent — we make it work.
        if not self.is_valid_execution(agent_role, task_type):
            agent_role, task_type = self.correct_execution(agent_role, task_type)

        try:
            result = self._dispatch(agent_role, task_type, brand, input_data)
            logger.info("crew_execution_complete", agent_role=agent_role, task_type=task_type)
            return result
        except Exception as e:
            logger.error(
                "crew_execution_failed",
                agent_role=agent_role,
                task_type=task_type,
                error=str(e),
            )
            return {
                "status": "failed",
                "error": str(e),
                "agent_role": agent_role,
                "task_type": task_type,
                "crew_name": f"{agent_role.replace('_agent', '')}_crew",
            }

    def _dispatch(
        self,
        agent_role: str,
        task_type: str,
        brand: BrandInfo,
        input_data: dict[str, Any],
    ) -> dict[str, Any]:
        """Route to the correct crew runner based on agent_role + task_type."""

        # ── Review Agent ────────────────────────────────
        if agent_role == "review_agent":
            if task_type == "review_analysis":
                return run_review_analysis(brand, llm=self.llm)

            if task_type == "single_review_response":
                return run_single_review_response(
                    brand,
                    reviewer_name=input_data.get("reviewer_name", "Customer"),
                    rating=input_data.get("rating", 3),
                    review_text=input_data.get("review_text", ""),
                    review_date=input_data.get("review_date", ""),
                    language=input_data.get("language", brand.languages or "tr"),
                    llm=self.llm,
                )

        # ── Content Agent ───────────────────────────────
        if agent_role == "content_agent":
            if input_data.get("used_images_by_type"):
                brand.used_images_by_type = input_data["used_images_by_type"]
            if input_data.get("used_image_urls"):
                brand.used_image_urls = input_data["used_image_urls"]
            if task_type == "content_ideation":
                # iterations: 1 = standard, 2 = high-quality (2x cost, ~40% better)
                iterations = int(input_data.get("iterations", get_settings().crewai_content_iterations))
                return run_content_ideation(
                    brand,
                    count=input_data.get("count", 5),
                    time_period=input_data.get("time_period", "next week"),
                    brief=input_data.get("brief", ""),
                    content_pillars=input_data.get("content_pillars") or input_data.get("contentPillars") or [],
                    autonomy_mode=bool(input_data.get("autonomy_mode") or input_data.get("autonomyMode")),
                    strategy_action_id=input_data.get("strategy_action_id", ""),
                    llm=self.llm,
                    iterations=iterations,
                )

            if task_type == "content_calendar":
                return run_content_calendar(
                    brand,
                    duration_days=input_data.get("duration_days", 7),
                    frequency=input_data.get("frequency", "daily"),
                    llm=self.llm,
                )

            if task_type == "visual_design_cards":
                return run_visual_design_cards(
                    brand,
                    count=input_data.get("count", 3),
                    brief=input_data.get("brief", ""),
                    content_pillars=input_data.get("content_pillars") or [],
                    llm=self.get_llm_for_task(task_type),
                )

        # ── Content Strategy Agent ───────────────────────
        if agent_role == "content_strategy_agent":
            if task_type == "content_strategy":
                return run_content_strategy(
                    brand,
                    brief=input_data.get("brief", ""),
                    content_pillars=input_data.get("content_pillars") or input_data.get("contentPillars") or [],
                    time_period=input_data.get("time_period", "next week"),
                    llm=self.llm,
                )

        # ── Ads Agent ───────────────────────────────────
        if agent_role == "ads_agent":
            if task_type == "campaign_analysis":
                return run_campaign_analysis(
                    brand,
                    campaign_data=input_data.get("campaign_data", ""),
                    llm=self.llm,
                )

            if task_type == "ad_creative_generation":
                return run_ad_creative_generation(
                    brand,
                    platform=input_data.get("platform", "google_ads"),
                    objective=input_data.get("objective", "conversions"),
                    count=input_data.get("count", 3),
                    llm=self.llm,
                )

            if task_type in {"auto_budget_optimize", "ads_budget_optimization"}:
                return run_budget_optimization(brand, llm=self.llm)

        # ── Analytics Agent ────────────────────────────────
        if agent_role == "analytics_agent":
            if task_type == "traffic_analysis":
                return run_traffic_analysis(brand, llm=self.llm)

            if task_type == "conversion_report":
                return run_conversion_report(brand, llm=self.llm)

            if task_type == "weekly_performance":
                return run_weekly_performance(brand, llm=self.llm)

        # ── Strategic Agent ──────────────────────────────────
        if agent_role == "strategic_agent":
            if task_type == "mission_planning":
                return run_mission_planning(brand, llm=self.llm)

        raise ValueError(f"Unhandled dispatch: {agent_role}/{task_type}")


_engine_instance: CrewEngine | None = None


def get_crew_engine() -> CrewEngine:
    """Singleton accessor for the CrewEngine. Lazy-initialized."""
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = CrewEngine()
    return _engine_instance
