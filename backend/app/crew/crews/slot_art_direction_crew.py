"""
Slot Template Art Direction Crew — one brand×slot composition recipe for the
design template library (GPT Image executes; this crew invents the idea).
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
from app.crew.tasks.slot_art_direction_tasks import create_slot_template_art_direction_task
from app.crew.token_usage import total_tokens_from_crew

logger = structlog.get_logger()

TYPE_ZONE_ANCHORS = frozenset({
    "top_left",
    "top_right",
    "bottom_left",
    "bottom_right",
    "left_rail",
    "right_rail",
    "top_band",
    "bottom_band",
    "center_stack",
    "inset_frame",
    "diagonal_split",
})


def run_slot_template_art_direction(
    brand: BrandInfo,
    *,
    catalog_slot_key: str = "",
    slot_name: str = "",
    format: str = "post",
    template_type: str = "",
    purpose_job: str = "",
    sample_headline: str = "",
    primary_color: str = "",
    accent_color: str = "",
    diversity_salt: str = "",
    llm: LLM | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    agent = create_content_agent(brand, llm=llm, for_ideation=True)
    task = create_slot_template_art_direction_task(
        agent,
        brand,
        catalog_slot_key=catalog_slot_key,
        slot_name=slot_name,
        format=format,
        template_type=template_type,
        purpose_job=purpose_job,
        sample_headline=sample_headline,
        primary_color=primary_color,
        accent_color=accent_color,
        diversity_salt=diversity_salt,
    )

    crew = Crew(
        agents=[agent],
        tasks=[task],
        process=Process.sequential,
        verbose=settings.crew_verbose,
    )
    result = crew.kickoff()
    raw_output = str(result)
    direction = parse_slot_art_direction(raw_output)

    logger.info(
        "slot_template_art_direction_complete",
        business=brand.business_name,
        catalog_slot_key=catalog_slot_key,
        has_direction=bool(direction),
        anchor=direction.get("type_zone_anchor") if direction else None,
    )

    return {
        "crew_name": "slot_art_direction_crew",
        "task_type": "slot_template_art_direction",
        "status": "completed" if direction else "partial",
        "raw_output": raw_output,
        "slot_art_direction": direction,
        "agent_role": "content_agent",
        "tokens_used": total_tokens_from_crew(crew),
    }


def parse_slot_art_direction(raw: str) -> dict[str, str] | None:
    """Extract and validate a single slot art-direction JSON object."""
    if not raw or not raw.strip():
        return None

    candidates: list[Any] = []
    text = raw.strip()
    try:
        candidates.append(json.loads(text))
    except json.JSONDecodeError:
        pass

    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        try:
            candidates.append(json.loads(fence.group(1)))
        except json.JSONDecodeError:
            pass

    obj_match = re.search(r"\{.*\}", text, re.DOTALL)
    if obj_match:
        try:
            candidates.append(json.loads(obj_match.group()))
        except json.JSONDecodeError:
            pass

    for parsed in candidates:
        validated = _validate_direction(parsed)
        if validated:
            return validated
    return None


def _validate_direction(item: Any) -> dict[str, str] | None:
    if not isinstance(item, dict):
        return None
    concept = str(item.get("layout_concept") or "").strip()
    anchor_raw = str(item.get("type_zone_anchor") or "").strip().lower().replace(" ", "_").replace("-", "_")
    if not concept or anchor_raw not in TYPE_ZONE_ANCHORS:
        return None

    def clip(key: str, n: int) -> str:
        return str(item.get(key) or "").strip()[:n]

    return {
        "layout_concept": concept[:320],
        "type_zone_anchor": anchor_raw,
        "color_surfaces": clip("color_surfaces", 220) or "Use brand primary/accent as painted craft fills — never cream panels.",
        "type_hierarchy": clip("type_hierarchy", 180) or "Bold display headline; short support only if needed.",
        "motif_from_dna": clip("motif_from_dna", 160),
        "reject_look": clip("reject_look", 180) or "cream/beige top-left Canva sticker reused across slots",
        "diversity_note": clip("diversity_note", 180),
    }
