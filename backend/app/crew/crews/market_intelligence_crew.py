"""
Market Intelligence Crew — daily trend + competitor scan.

Runs as a scheduled background job and writes results directly to
brand_contexts.trend_brief and brand_contexts.competitor_pulse so that
Gram Master and other content agents always have fresh market intelligence.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

import structlog
from crewai import Crew, Process, Task

from app.config import get_settings
from app.crew.agents.market_intelligence_agent import create_market_intelligence_agent
from app.crew.context import BrandInfo
from app.crew.prompts.market_intelligence_prompts import MARKET_INTELLIGENCE_TASK

logger = structlog.get_logger()


def _extract_competitor_handles(competitors_str: str) -> list[str]:
    """Extract @handles or plain handles from a competitor string."""
    handles = re.findall(r"@?([\w.]+)", competitors_str or "")
    # Filter out words that look like plain text descriptions rather than handles
    return [h for h in handles if len(h) >= 3 and not h.isdigit()][:5]


def _seed_hashtags_for_brand(brand: BrandInfo) -> str:
    if brand.instagram_top_hashtags:
        return " ".join(brand.instagram_top_hashtags[:5])
    # Generate sensible seeds from location + business type
    seeds = []
    if brand.location:
        seeds.append(re.sub(r"\s+", "", brand.location.lower()))
    if brand.business_type:
        seeds.append(re.sub(r"\s+", "", brand.business_type.lower()))
    return " ".join(seeds) or "turkey business"


def run_market_intelligence(brand: BrandInfo) -> dict[str, Any]:
    """
    Run the Market Intelligence Crew for a brand.
    Returns dict with: trend_brief, competitor_pulse, top_opportunity_hashtags,
    urgent_content_ideas, confidence_notes.
    """
    settings = get_settings()
    agent = create_market_intelligence_agent(brand)

    competitor_handles = _extract_competitor_handles(brand.competitors or "")
    handles_str = ", ".join(f"@{h}" for h in competitor_handles) if competitor_handles else "none specified"
    seed_hashtags = _seed_hashtags_for_brand(brand)
    current_month = datetime.now(timezone.utc).strftime("%B %Y")
    industry_niche = f"{brand.business_type} {brand.location or ''}".strip()

    task_description = MARKET_INTELLIGENCE_TASK.format(
        business_name=brand.business_name,
        business_type=brand.business_type,
        location=brand.location or "Turkey",
        industry_niche=industry_niche,
        competitor_handles=handles_str,
        seed_hashtags=seed_hashtags,
        current_month=current_month,
    )

    task = Task(
        description=task_description,
        expected_output=(
            "A JSON object with trend_brief, competitor_pulse, "
            "top_opportunity_hashtags, urgent_content_ideas, confidence_notes."
        ),
        agent=agent,
    )

    crew = Crew(
        agents=[agent],
        tasks=[task],
        process=Process.sequential,
        verbose=settings.crew_verbose,
    )

    result = crew.kickoff()
    raw = str(result).strip()

    # Parse JSON from output
    parsed: dict[str, Any] = {}
    try:
        json_match = re.search(r"\{[\s\S]*\}", raw)
        if json_match:
            parsed = json.loads(json_match.group())
    except Exception:
        pass

    return {
        "status": "completed",
        "trend_brief": parsed.get("trend_brief", raw[:1200] if raw else ""),
        "competitor_pulse": parsed.get("competitor_pulse", ""),
        "top_opportunity_hashtags": parsed.get("top_opportunity_hashtags", []),
        "urgent_content_ideas": parsed.get("urgent_content_ideas", []),
        "confidence_notes": parsed.get("confidence_notes", ""),
        "raw_output": raw,
        "refreshed_at": datetime.now(timezone.utc).isoformat(),
    }
