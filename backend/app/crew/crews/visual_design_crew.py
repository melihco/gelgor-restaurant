"""
Visual Design Crew — produces designed social card concepts.

Uses the content agent (Claude for brand voice) with a specialized task
that outputs complete design specs: background photo, color overlay,
headline, CTA, typography style, and a ready image_generation_prompt.

The image_generation_prompt can be passed directly to:
  - GPT-image-1 via /api/generate-instagram-image (existing route)
  - Flux via fal.ai (existing route)
  - Canva autofill (via canva_field_mapping field)
"""

from __future__ import annotations

import json
import re
from typing import Any

import structlog
from crewai import Crew, LLM, Process

from app.config import get_settings
from app.crew.agents.content_agent import create_content_agent
from app.crew.context import BrandInfo
from app.crew.token_usage import total_tokens_from_crew
from app.crew.tasks.visual_design_tasks import create_visual_design_card_task

logger = structlog.get_logger()


def run_visual_design_cards(
    brand: BrandInfo,
    count: int = 3,
    brief: str = "",
    content_pillars: list[str] | None = None,
    llm: LLM | None = None,
) -> dict[str, Any]:
    """
    Generate designed social card concepts for a brand.
    Returns list of card specs with image_generation_prompt ready for image APIs.
    """
    settings = get_settings()

    agent = create_content_agent(brand, llm=llm, for_ideation=True)
    task = create_visual_design_card_task(
        agent, brand,
        count=count,
        brief=brief,
        content_pillars=content_pillars,
    )

    crew = Crew(
        agents=[agent],
        tasks=[task],
        process=Process.sequential,
        verbose=settings.crew_verbose,
    )

    result = crew.kickoff()
    raw_output = str(result)

    # Parse cards from raw output
    cards = _parse_cards(raw_output)

    logger.info(
        "visual_design_cards_complete",
        business=brand.business_name,
        cards_produced=len(cards),
    )

    return {
        "crew_name": "visual_design_crew",
        "task_type": "visual_design_cards",
        "status": "completed",
        "raw_output": raw_output,
        "cards": cards,
        "agent_role": "content_agent",
        "tokens_used": total_tokens_from_crew(crew),
    }


def _parse_cards(raw: str) -> list[dict]:
    """Extract JSON card array from agent output."""
    try:
        parsed = json.loads(raw.strip())
        if isinstance(parsed, list):
            return _validate_cards(parsed)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\[.*?\]", raw, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group())
            if isinstance(parsed, list):
                return _validate_cards(parsed)
        except json.JSONDecodeError:
            pass

    return []


_REQUIRED_FIELDS = {
    "card_type", "format", "concept_title", "background_intent",
    "headline", "overlay_color", "image_generation_prompt",
}


def _validate_cards(items: list) -> list[dict]:
    """Filter out incomplete cards."""
    valid = []
    for item in items:
        if not isinstance(item, dict):
            continue
        # Must have at minimum: a headline and an image_generation_prompt
        if item.get("headline") and item.get("image_generation_prompt"):
            valid.append(item)
    return valid[:5]
