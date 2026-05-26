"""
Content Crew – orchestrates Instagram content strategy and creation.

Composes the Content Agent with tasks for ideation, calendar planning,
and content package preparation. All outputs go through the approval
workflow before any publishing action.
"""

from __future__ import annotations

from typing import Any

from crewai import Crew, Process, LLM

import json
import re

from app.config import get_settings
from app.crew.agents.content_agent import create_content_agent
from app.crew.context import BrandInfo
from app.crew.token_usage import total_tokens_from_crew
from app.crew.tasks.content_tasks import (
    create_content_ideation_task,
    create_content_calendar_task,
)
from app.services.content_consistency_service import check_weekly_content, score_batch
from app.crew.cta_localization import harmonize_content_concepts


def _run_revision_pass(
    brand: BrandInfo,
    original_output: str,
    revision_prompt: str,
    llm: Any,
) -> tuple[str | None, int]:
    """
    Run a targeted revision pass. Instead of a full CrewAI re-run (expensive),
    we use a single LLM call with the original output + error report to produce
    a corrected version. Cost: ~1/3 of a full ideation run.
    """
    from openai import OpenAI
    from app.config import get_settings

    settings = get_settings()
    try:
        client = OpenAI(api_key=settings.openai_api_key)
        system_msg = (
            "You are a content quality reviewer. You receive a JSON array of content ideas "
            "and a quality report listing issues. Fix ONLY the flagged issues — do not change "
            "pieces that passed. Return the corrected JSON array only, no explanation."
        )
        user_msg = (
            f"## Original output:\n```json\n{original_output[:8000]}\n```\n\n"
            f"## Quality issues found:\n{revision_prompt}\n\n"
            f"Brand: {brand.business_name} ({brand.business_type})\n"
            f"Fix the issues and return the corrected JSON array."
        )
        response = client.chat.completions.create(
            model=settings.openai_lite_model or "gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.4,
            max_tokens=4000,
        )
        revised = response.choices[0].message.content or ""
        tokens = (response.usage.total_tokens if response.usage else 0)
        return revised, tokens
    except Exception:
        return None, 0


def _run_single_ideation(
    brand: BrandInfo,
    count: int,
    time_period: str,
    brief: str,
    content_pillars: list[str] | None,
    autonomy_mode: bool,
    llm: Any,
) -> tuple[str, int]:
    """Single ideation run — returns (raw_output, tokens_used)."""
    content_agent = create_content_agent(brand, llm=llm, for_ideation=True)
    ideation_task = create_content_ideation_task(
        content_agent, brand, count, time_period,
        brief=brief, content_pillars=content_pillars, autonomy_mode=autonomy_mode,
    )
    crew = Crew(
        agents=[content_agent], tasks=[ideation_task],
        process=Process.sequential, verbose=get_settings().crew_verbose,
    )
    result = crew.kickoff()
    return str(result), total_tokens_from_crew(crew)


def _pick_better_output(output_a: str, output_b: str, brand: BrandInfo) -> str:
    """
    Compare two ideation outputs and return the better one.
    Uses consistency check scores + concept count as quality signal.
    """
    def score(raw: str) -> float:
        s = 0.0
        try:
            m = re.search(r"\[.*\]", raw, re.DOTALL)
            if not m:
                return 0.0
            concepts = json.loads(m.group())
            s += len(concepts) * 2  # more valid concepts = better
            # Check diversity of hook types
            hooks = {c.get("caption_hook_type", "") for c in concepts if c.get("caption_hook_type")}
            s += len(hooks) * 3
            # Check visual_production_spec presence
            has_vps = sum(1 for c in concepts if c.get("visual_production_spec"))
            s += has_vps * 2
            # Penalise missing required fields
            for c in concepts:
                if not c.get("caption_draft"):
                    s -= 3
                if not c.get("hashtags"):
                    s -= 1
        except Exception:
            pass
        return s

    return output_a if score(output_a) >= score(output_b) else output_b


def run_content_ideation(
    brand: BrandInfo,
    count: int = 5,
    time_period: str = "next week",
    brief: str = "",
    content_pillars: list[str] | None = None,
    autonomy_mode: bool = False,
    strategy_action_id: str = "",
    llm: LLM | None = None,
    iterations: int = 1,
) -> dict[str, Any]:
    """
    Generate content concepts for a brand.

    iterations=2 → runs twice, picks the better output (higher quality, ~2x cost).
    iterations=1 → single run (default, backward compatible).
    """
    settings = get_settings()

    raw_output_a, tokens_a = _run_single_ideation(
        brand, count, time_period, brief, content_pillars, autonomy_mode, llm
    )
    total_tokens = tokens_a

    if iterations >= 2:
        raw_output_b, tokens_b = _run_single_ideation(
            brand, count, time_period, brief, content_pillars, autonomy_mode, llm
        )
        total_tokens += tokens_b
        raw_output = _pick_better_output(raw_output_a, raw_output_b, brand)
        iteration_used = 2
    else:
        raw_output = raw_output_a
        iteration_used = 1

    # ── Hard quality gate with auto-revision ────────────────────────────
    consistency_report = None
    revision_used = False
    try:
        json_match = re.search(r"\[.*\]", raw_output, re.DOTALL)
        if json_match:
            concepts = json.loads(json_match.group())
            concepts = harmonize_content_concepts(concepts, brand.languages)
            raw_output = json.dumps(concepts, ensure_ascii=False)
            report = check_weekly_content(
                concepts=concepts,
                content_pillars=content_pillars or brand.content_pillars,
                brand_ctas=brand.default_ctas,
            )

            has_errors = any(i.severity == "error" for i in report.issues)

            if has_errors and count >= 3:
                revision_prompt = report.to_prompt_block()
                revised_output, revision_tokens = _run_revision_pass(
                    brand, raw_output, revision_prompt, llm,
                )
                total_tokens += revision_tokens

                if revised_output:
                    revised_match = re.search(r"\[.*\]", revised_output, re.DOTALL)
                    if revised_match:
                        revised_concepts = json.loads(revised_match.group())
                        revised_concepts = harmonize_content_concepts(revised_concepts, brand.languages)
                        revised_output = json.dumps(revised_concepts, ensure_ascii=False)
                        revised_report = check_weekly_content(
                            concepts=revised_concepts,
                            content_pillars=content_pillars or brand.content_pillars,
                            brand_ctas=brand.default_ctas,
                        )
                        if revised_report.passed or len(revised_report.issues) < len(report.issues):
                            raw_output = revised_output
                            report = revised_report
                            revision_used = True

            # Per-piece quality scores
            quality_scores = score_batch(concepts, brand.default_ctas)
            avg_score = sum(s["overall"] for s in quality_scores) / len(quality_scores) if quality_scores else 0

            consistency_report = {
                "passed": report.passed,
                "summary": report.summary,
                "stats": report.stats,
                "issues": [
                    {"severity": i.severity, "check": i.check, "description": i.description, "suggestion": i.suggestion}
                    for i in report.issues
                ],
                "revision_applied": revision_used,
                "quality_scores": quality_scores,
                "avg_quality_score": round(avg_score, 1),
                "batch_grade": "A" if avg_score >= 80 else "B" if avg_score >= 60 else "C" if avg_score >= 40 else "D",
            }
    except Exception:
        pass

    return {
        "crew_name": "content_crew",
        "task_type": "content_ideation",
        "status": "completed",
        "raw_output": raw_output,
        "agent_role": "content_agent",
        "consistency_report": consistency_report,
        "parameters": {
            "count": count,
            "time_period": time_period,
            "brief": brief,
            "content_pillars": content_pillars or [],
            "autonomy_mode": autonomy_mode,
            "strategy_action_id": strategy_action_id,
            "iterations": iteration_used,
        },
        "iterations_used": iteration_used,
        "revision_used": revision_used,
        "tokens_used": total_tokens,
    }


def run_content_calendar(
    brand: BrandInfo,
    duration_days: int = 7,
    frequency: str = "daily",
    llm: LLM | None = None,
) -> dict[str, Any]:
    """Generate a content calendar for a brand."""
    content_agent = create_content_agent(brand, llm=llm, for_calendar=True)
    calendar_task = create_content_calendar_task(content_agent, brand, duration_days, frequency)

    crew = Crew(
        agents=[content_agent],
        tasks=[calendar_task],
        process=Process.sequential,
        verbose=get_settings().crew_verbose,
    )

    result = crew.kickoff()

    return {
        "crew_name": "content_crew",
        "task_type": "content_calendar",
        "status": "completed",
        "raw_output": str(result),
        "agent_role": "content_agent",
        "parameters": {"duration_days": duration_days, "frequency": frequency},
        "tokens_used": total_tokens_from_crew(crew),
    }
