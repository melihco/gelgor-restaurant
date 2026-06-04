"""
Visual Production Director Crew (experimental, opt-in).

Enriches ideas with visual_production_spec without replacing content ideation output.
Existing per-idea VPS fields always win on merge downstream.
"""

from __future__ import annotations

import json
import re
from typing import Any

import structlog
from crewai import Crew, LLM, Process

from app.config import get_settings
from app.crew.agents.visual_production_director_agent import create_visual_production_director_agent
from app.crew.context import BrandInfo
from app.crew.tasks.visual_production_director_tasks import create_visual_production_director_task
from app.crew.token_usage import total_tokens_from_crew

logger = structlog.get_logger()


def _extract_json(raw: str) -> dict[str, Any] | None:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        pass
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            data = json.loads(text[start : end + 1])
            return data if isinstance(data, dict) else None
        except json.JSONDecodeError:
            return None
    return None


def run_visual_production_director(
    brand: BrandInfo,
    ideas: list[dict[str, Any]],
    *,
    weekly_theme: str = "",
    production_package: str = "weekly_content",
    feed_director_report: dict[str, Any] | None = None,
    llm: LLM | None = None,
) -> dict[str, Any]:
    """Return { specs: [...], brand_visual_anchor, _source } or empty on failure."""
    settings = get_settings()
    if not ideas:
        return {"specs": [], "_source": "skipped_empty"}

    ideas_json = json.dumps(ideas, ensure_ascii=False)[:12000]
    feed_json = json.dumps(feed_director_report or {}, ensure_ascii=False)[:4000]

    try:
        agent = create_visual_production_director_agent(brand, llm=llm)
        task = create_visual_production_director_task(
            agent=agent,
            brand_name=brand.business_name,
            business_type=brand.business_type or "brand",
            ideas_json=ideas_json,
            weekly_theme=weekly_theme,
            production_package=production_package,
            feed_report_json=feed_json,
        )
        crew = Crew(
            agents=[agent],
            tasks=[task],
            process=Process.sequential,
            verbose=settings.crew_verbose,
        )
        result = crew.kickoff()
        raw = str(result.raw) if hasattr(result, "raw") else str(result)
        parsed = _extract_json(raw)
        if not parsed or not isinstance(parsed.get("specs"), list):
            logger.warning("visual_production_director.parse_failed", preview=raw[:200])
            return {"specs": [], "_source": "parse_failed", "_token_usage": total_tokens_from_crew(result)}

        specs = [s for s in parsed["specs"] if isinstance(s, dict)]
        logger.info(
            "visual_production_director.success",
            brand=brand.business_name,
            spec_count=len(specs),
        )
        return {
            "specs": specs,
            "brand_visual_anchor": parsed.get("brand_visual_anchor", ""),
            "_source": "crewai",
            "_token_usage": total_tokens_from_crew(result),
        }
    except Exception as exc:
        logger.warning(
            "visual_production_director.failed",
            brand=brand.business_name,
            error=str(exc)[:300],
        )
        return {"specs": [], "_source": "error", "error": str(exc)[:200]}
