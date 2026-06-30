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

import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import structlog
from crewai import LLM

from app.config import get_settings
from app.crew.context import BrandInfo
from app.crew.crews.ads_crew import (
    run_ad_creative_generation,
    run_budget_optimization,
    run_campaign_analysis,
)
from app.crew.crews.analytics_crew import (
    run_conversion_report,
    run_traffic_analysis,
    run_weekly_performance,
)
from app.crew.crews.content_crew import (
    run_content_calendar,
    run_content_ideation,
)
from app.crew.crews.content_strategy_crew import run_content_strategy
from app.crew.crews.feed_art_director_crew import run_feed_art_director
from app.crew.crews.review_crew import (
    run_review_analysis,
    run_single_review_response,
)
from app.crew.crews.strategist_crew import run_mission_planning
from app.crew.crews.visual_design_crew import run_visual_design_cards
from app.crew.registry import (
    first_task_type_for_role,
    get_agent_roles,
    get_task_types_for_role,
    is_valid_agent_task_pair,
)

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


AGENT_ROLES = get_agent_roles()


# Tasks that benefit most from Claude's creative language ability
_CLAUDE_PREFERRED_TASKS = {
    # Disabled — use OpenAI for CrewAI tasks; Anthropic reserved for MCP design consult only.
    # Re-enable when Anthropic credits are available: add task names back here.
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

# Faz 3.2 — structured/planning tasks that can run on the lite model when
# LITE_STRUCTURAL_TASKS_ENABLED is set. These shape/route existing creative output
# (calendar slotting, visual design cards, feed cohesion assignment) rather than
# author it. content_ideation / content_strategy are intentionally excluded — they
# remain on the full model. Default OFF → no behavior change.
_STRUCTURAL_LITE_TASKS = {
    "content_calendar",
    "visual_design_cards",
    "feed_cohesion_review",
}


@dataclass
class _LLMContext:
    """Resolved inputs shared by every LLM-routing rule.

    ``make`` is the token-cap-aware LLM factory; rules call it instead of
    constructing ``LLM`` directly so the completion-token cap applies uniformly
    regardless of which rule wins.
    """

    settings: Any
    task_type: str | None
    brand: BrandInfo | None
    has_anthropic: bool
    has_openai: bool
    lite_model: str
    make: Callable[..., LLM]


def _rule_ollama(ctx: _LLMContext) -> LLM | None:
    # Explicit Ollama override — for local dev without cloud API costs
    if ctx.settings.crewai_llm_provider == "ollama":
        return ctx.make(
            model=f"ollama/{ctx.settings.ollama_model}",
            base_url=ctx.settings.ollama_base_url,
        )
    return None


def _rule_tenant_override(ctx: _LLMContext) -> LLM | None:
    # ── Per-tenant override (highest priority) ────────────────────────────
    brand = ctx.brand
    if brand and brand.preferred_llm_provider and brand.preferred_llm_model:
        provider = brand.preferred_llm_provider.lower()
        model = brand.preferred_llm_model
        if provider == "anthropic" and ctx.has_anthropic:
            logger.debug("llm_tenant_override", tenant=brand.tenant_id, model=f"anthropic/{model}")
            return ctx.make(model=f"anthropic/{model}", api_key=ctx.settings.anthropic_api_key)
        if provider == "openai" and ctx.has_openai:
            logger.debug("llm_tenant_override", tenant=brand.tenant_id, model=f"openai/{model}")
            return ctx.make(model=f"openai/{model}", api_key=ctx.settings.openai_api_key)
    return None


def _rule_claude_preferred(ctx: _LLMContext) -> LLM | None:
    if ctx.task_type and ctx.has_anthropic and ctx.task_type in _CLAUDE_PREFERRED_TASKS:
        model = ctx.settings.anthropic_model or "claude-3-5-sonnet-20241022"
        return ctx.make(model=f"anthropic/{model}", api_key=ctx.settings.anthropic_api_key)
    return None


def _rule_lite_task(ctx: _LLMContext) -> LLM | None:
    # Lite model for pure data/analytics tasks — 15x cheaper, no quality loss
    if ctx.task_type and ctx.has_openai and ctx.task_type in _LITE_MODEL_TASKS and ctx.lite_model:
        logger.debug("llm_lite_routing", task_type=ctx.task_type, model=f"openai/{ctx.lite_model}")
        return ctx.make(model=f"openai/{ctx.lite_model}", api_key=ctx.settings.openai_api_key)
    return None


def _rule_structural_lite(ctx: _LLMContext) -> LLM | None:
    # Faz 3.2 — structured planning tasks → lite model when flag is enabled.
    # Gated so the default keeps these on the full model (no behavior change).
    if (
        ctx.task_type
        and ctx.has_openai
        and ctx.lite_model
        and ctx.task_type in _STRUCTURAL_LITE_TASKS
        and getattr(ctx.settings, "lite_structural_tasks_enabled", False)
    ):
        logger.debug(
            "llm_structural_lite_routing",
            task_type=ctx.task_type,
            model=f"openai/{ctx.lite_model}",
        )
        return ctx.make(model=f"openai/{ctx.lite_model}", api_key=ctx.settings.openai_api_key)
    return None


def _rule_gpt_preferred(ctx: _LLMContext) -> LLM | None:
    if ctx.task_type and ctx.has_openai and ctx.task_type in _GPT_PREFERRED_TASKS:
        if ctx.settings.openai_content_model:
            return ctx.make(
                model=f"openai/{ctx.settings.openai_content_model}",
                api_key=ctx.settings.openai_api_key,
            )
        return ctx.make(model=f"openai/{ctx.settings.openai_model}", api_key=ctx.settings.openai_api_key)
    return None


def _rule_global_anthropic(ctx: _LLMContext) -> LLM | None:
    if ctx.settings.crewai_llm_provider == "anthropic" and ctx.has_anthropic:
        model = ctx.settings.anthropic_model or "claude-3-5-sonnet-20241022"
        return ctx.make(model=f"anthropic/{model}", api_key=ctx.settings.anthropic_api_key)
    return None


def _rule_default(ctx: _LLMContext) -> LLM:
    # Terminal rule — always returns an LLM.
    s = ctx.settings
    if ctx.task_type and ctx.task_type.startswith("content") and s.openai_content_model:
        return ctx.make(model=f"openai/{s.openai_content_model}", api_key=s.openai_api_key)
    return ctx.make(model=f"openai/{s.openai_model}", api_key=s.openai_api_key if ctx.has_openai else None)


# Ordered routing strategy. First rule returning a non-None LLM wins.
# Adding a routing policy = insert a rule here (Open/Closed); get_llm stays untouched.
_LLM_RULES: list[Callable[[_LLMContext], LLM | None]] = [
    _rule_ollama,
    _rule_tenant_override,
    _rule_claude_preferred,
    _rule_lite_task,
    _rule_structural_lite,
    _rule_gpt_preferred,
    _rule_global_anthropic,
    _rule_default,
]


def get_llm(task_type: str | None = None, brand: BrandInfo | None = None) -> LLM:
    """
    Return the best LLM for the given task type, respecting per-tenant overrides.

    Resolution is an ordered strategy list (``_LLM_RULES``); the first rule that
    returns a non-None LLM wins:
    1. Ollama dev override
    2. Per-tenant override (brand.preferred_llm_provider / preferred_llm_model)
    3. Smart per-task routing (Claude-preferred, lite, structural-lite, GPT-preferred)
    4. Global CREWAI_LLM_PROVIDER fallback / default OpenAI model.

    TENANT ISOLATION: each brand carries its own LLM preferences. Tenant A (B2B event
    firm using Claude Opus) and Tenant B (beach club using GPT-4o) never share a model
    selection — they each get their own LLM instance per call.
    """
    settings = get_settings()

    # Faz 3.3 — optional completion-token cap. 0/unset → no cap (current behavior).
    # Injected into every LLM construction via the make() factory so the cap applies
    # uniformly regardless of which routing rule wins.
    _token_cap = getattr(settings, "llm_max_tokens_cap", 0) or 0

    def _llm(**kwargs: Any) -> LLM:
        if _token_cap and _token_cap > 0:
            kwargs.setdefault("max_tokens", _token_cap)
        return LLM(**kwargs)

    ctx = _LLMContext(
        settings=settings,
        task_type=task_type,
        brand=brand,
        has_anthropic=bool(settings.anthropic_api_key and settings.anthropic_api_key.strip()),
        has_openai=bool(settings.openai_api_key and settings.openai_api_key.strip()),
        lite_model=getattr(settings, "openai_lite_model", "gpt-4o-mini"),
        make=_llm,
    )

    for rule in _LLM_RULES:
        resolved = rule(ctx)
        if resolved is not None:
            return resolved

    # Unreachable: _rule_default is terminal. Kept as a defensive fallback.
    return _llm(model=f"openai/{settings.openai_model}")


# ── Dispatch registry ────────────────────────────────────────────────────
# Each adapter takes (brand, input_data, llm) and returns the crew result dict.
# Adapters reference the run_* crew functions by module-global name so they stay
# patchable in tests and so the registry maps (agent_role, task_type) → runner
# declaratively (Open/Closed: a new task = a new adapter + one table entry).
_DispatchAdapter = Callable[[BrandInfo, dict[str, Any], "LLM | None"], dict[str, Any]]


def _adapt_review_analysis(brand, data, llm):
    return run_review_analysis(brand, llm=llm)


def _adapt_single_review_response(brand, data, llm):
    return run_single_review_response(
        brand,
        reviewer_name=data.get("reviewer_name", "Customer"),
        rating=data.get("rating", 3),
        review_text=data.get("review_text", ""),
        review_date=data.get("review_date", ""),
        language=data.get("language", brand.languages or "tr"),
        llm=llm,
    )


def _adapt_content_ideation(brand, data, llm):
    # iterations: 1 = standard, 2 = high-quality (2x cost, ~40% better)
    iterations = int(data.get("iterations", get_settings().crewai_content_iterations))
    return run_content_ideation(
        brand,
        count=data.get("count", 10),
        time_period=data.get("time_period", "next week"),
        brief=data.get("brief", ""),
        content_pillars=data.get("content_pillars") or data.get("contentPillars") or [],
        autonomy_mode=bool(data.get("autonomy_mode") or data.get("autonomyMode")),
        strategy_action_id=data.get("strategy_action_id", ""),
        llm=llm,
        iterations=iterations,
        mission_id=data.get("mission_id"),
    )


def _adapt_content_calendar(brand, data, llm):
    return run_content_calendar(
        brand,
        duration_days=data.get("duration_days", 7),
        frequency=data.get("frequency", "daily"),
        llm=llm,
    )


def _adapt_visual_design_cards(brand, data, llm):
    return run_visual_design_cards(
        brand,
        count=data.get("count", 3),
        brief=data.get("brief", ""),
        content_pillars=data.get("content_pillars") or [],
        llm=llm,
    )


def _adapt_content_strategy(brand, data, llm):
    return run_content_strategy(
        brand,
        brief=data.get("brief", ""),
        content_pillars=data.get("content_pillars") or data.get("contentPillars") or [],
        time_period=data.get("time_period", "next week"),
        llm=llm,
    )


def _adapt_feed_cohesion_review(brand, data, llm):
    report = run_feed_art_director(
        brand,
        content_ideas_json=data.get("content_ideas_json", ""),
        weekly_theme=data.get("weekly_theme", ""),
        mission_type=data.get("mission_type", ""),
        mission_title=data.get("mission_title", ""),
        creative_brief=data.get("creative_brief", ""),
        production_package=data.get("production_package"),
        production_profile=data.get("production_profile"),
        llm=llm,
    )
    return {
        "crew_name": "feed_art_director_crew",
        "task_type": "feed_cohesion_review",
        "status": "completed",
        "raw_output": json.dumps(report, ensure_ascii=False),
        "agent_role": "feed_art_director",
    }


def _adapt_campaign_analysis(brand, data, llm):
    return run_campaign_analysis(brand, campaign_data=data.get("campaign_data", ""), llm=llm)


def _adapt_ad_creative_generation(brand, data, llm):
    return run_ad_creative_generation(
        brand,
        platform=data.get("platform", "google_ads"),
        objective=data.get("objective", "conversions"),
        count=data.get("count", 3),
        llm=llm,
    )


def _adapt_budget_optimization(brand, data, llm):
    return run_budget_optimization(brand, llm=llm)


def _adapt_traffic_analysis(brand, data, llm):
    return run_traffic_analysis(brand, llm=llm)


def _adapt_conversion_report(brand, data, llm):
    return run_conversion_report(brand, llm=llm)


def _adapt_weekly_performance(brand, data, llm):
    return run_weekly_performance(brand, llm=llm)


def _adapt_mission_planning(brand, data, llm):
    return run_mission_planning(brand, llm=llm)


# (agent_role, task_type) → adapter
_DISPATCH_TABLE: dict[tuple[str, str], _DispatchAdapter] = {
    ("review_agent", "review_analysis"): _adapt_review_analysis,
    ("review_agent", "single_review_response"): _adapt_single_review_response,
    ("content_agent", "content_ideation"): _adapt_content_ideation,
    ("content_agent", "content_calendar"): _adapt_content_calendar,
    ("content_agent", "visual_design_cards"): _adapt_visual_design_cards,
    ("content_strategy_agent", "content_strategy"): _adapt_content_strategy,
    ("feed_art_director", "feed_cohesion_review"): _adapt_feed_cohesion_review,
    ("ads_agent", "campaign_analysis"): _adapt_campaign_analysis,
    ("ads_agent", "ad_creative_generation"): _adapt_ad_creative_generation,
    ("ads_agent", "auto_budget_optimize"): _adapt_budget_optimization,
    ("ads_agent", "ads_budget_optimization"): _adapt_budget_optimization,
    ("analytics_agent", "traffic_analysis"): _adapt_traffic_analysis,
    ("analytics_agent", "conversion_report"): _adapt_conversion_report,
    ("analytics_agent", "weekly_performance"): _adapt_weekly_performance,
    ("strategic_agent", "mission_planning"): _adapt_mission_planning,
}


def _apply_content_image_overrides(brand: BrandInfo, data: dict[str, Any]) -> None:
    if data.get("used_images_by_type"):
        brand.used_images_by_type = data["used_images_by_type"]
    if data.get("used_image_urls"):
        brand.used_image_urls = data["used_image_urls"]


# Per-role pre-dispatch hooks (run before the adapter, mutate brand from inputs).
_PRE_DISPATCH_HOOKS: dict[str, Callable[[BrandInfo, dict[str, Any]], None]] = {
    "content_agent": _apply_content_image_overrides,
}


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

    def get_llm_for_task(self, task_type: str, brand: BrandInfo | None = None) -> LLM:
        """Return the best LLM for the given task type, respecting per-tenant override."""
        return get_llm(task_type=task_type, brand=brand)

    def is_brand_safety_reviewable(self, task_type: str) -> bool:
        """True when a task type's output should go through Creative Director review.

        Exposed on the engine so callers don't reach into crew internals
        (creative_director_crew.REVIEWABLE_TASK_TYPES) directly.
        """
        from app.crew.crews.creative_director_crew import REVIEWABLE_TASK_TYPES

        return task_type in REVIEWABLE_TASK_TYPES

    def run_brand_safety_review(
        self,
        brand: BrandInfo,
        raw_output: str,
        task_type: str,
        agent_role: str,
    ) -> dict[str, Any]:
        """Run the Creative Director brand-safety post-processor through the engine.

        Resolves the LLM with the same per-tenant / per-task routing as execute(),
        so this previously-bypassing crew call is funneled through the single
        engine entry point. The underlying crew never raises (returns a safe
        human-review fallback on failure).
        """
        from app.crew.crews.creative_director_crew import (
            run_brand_safety_review as _run_brand_safety_review,
        )

        llm = self.get_llm_for_task(task_type, brand=brand)
        return _run_brand_safety_review(brand, raw_output, task_type, agent_role, llm=llm)

    def get_available_roles(self) -> dict[str, dict]:
        return AGENT_ROLES

    def is_valid_execution(self, agent_role: str, task_type: str) -> bool:
        return is_valid_agent_task_pair(agent_role, task_type)

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
        if role_info and get_task_types_for_role(agent_role):
            # Keep the agent, use its first valid task_type
            corrected_task = first_task_type_for_role(agent_role)
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

        if not self.is_valid_execution(agent_role, task_type):
            logger.error(
                "crew_execution_invalid_pair",
                agent_role=agent_role,
                task_type=task_type,
            )
            return {
                "status": "failed",
                "error": f"Invalid agent/task pair: {agent_role}/{task_type}",
                "agent_role": agent_role,
                "task_type": task_type,
                "crew_name": f"{agent_role.replace('_agent', '')}_crew",
            }

        try:
            result = self._dispatch(agent_role, task_type, brand, input_data, llm=llm)
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
        llm: LLM | None = None,
    ) -> dict[str, Any]:
        """Route to the correct crew runner based on agent_role + task_type.

        llm is resolved by execute() via get_llm_for_task(task_type, brand) so
        per-tenant overrides and per-task smart routing are always respected.
        Falls back to self.llm (default no-arg routing) when called without llm.

        Routing is a declarative registry (``_DISPATCH_TABLE``); per-role
        pre-hooks (``_PRE_DISPATCH_HOOKS``) mutate brand from inputs first.
        """
        effective_llm = llm if llm is not None else self.llm

        hook = _PRE_DISPATCH_HOOKS.get(agent_role)
        if hook is not None:
            hook(brand, input_data)

        adapter = _DISPATCH_TABLE.get((agent_role, task_type))
        if adapter is None:
            raise ValueError(f"Unhandled dispatch: {agent_role}/{task_type}")

        return adapter(brand, input_data, effective_llm)


_engine_instance: CrewEngine | None = None


def get_crew_engine() -> CrewEngine:
    """Singleton accessor for the CrewEngine. Lazy-initialized."""
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = CrewEngine()
    return _engine_instance
