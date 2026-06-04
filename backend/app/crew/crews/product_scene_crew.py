"""
Product Scene Crew — generates a visual scene brief for product photo enhancement.

Called by POST /api/v1/product-scene-director (Python internal endpoint) which is
then consumed by the Next.js /api/enhance-product-photo route.

Flow:
  1. ProductSceneDirectorAgent reads brand DNA + caption
  2. Returns structured JSON scene brief
  3. Next.js uses the brief to call GPT image-2 (images.edit) with precise instructions
  4. Sharp composites brand logo at position specified in brief
  5. Final image: enhanced background + original product + brand logo watermark
"""

from __future__ import annotations

import json
import re
from typing import Any

import structlog
from crewai import Crew, LLM, Process

from app.config import get_settings
from app.crew.agents.product_scene_director_agent import create_product_scene_director_agent
from app.crew.context import BrandInfo
from app.crew.tasks.product_scene_tasks import create_product_scene_brief_task
from app.crew.token_usage import total_tokens_from_crew

logger = structlog.get_logger()


def _extract_json(text: str) -> dict[str, Any] | None:
    """Extract first JSON object from LLM response."""
    # Try direct parse first
    text = text.strip()
    if text.startswith('{'):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

    # Strip markdown fences
    cleaned = re.sub(r'```(?:json)?\s*', '', text).strip().rstrip('`').strip()
    if cleaned.startswith('{'):
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass

    # Find first {...} block
    m = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            pass

    return None


def run_product_scene_director(
    brand: BrandInfo,
    caption: str,
    product_type: str = "",
    enhance_level: str = "moderate",
    sector: str = "",
    mood: str = "",
    visual_subject: str = "product_hero",
    llm: LLM | None = None,
) -> dict[str, Any]:
    """
    Run the Product Scene Director crew and return a scene brief dict.

    Returns a fallback dict on any error so the caller can always proceed
    (worst case: plain enhancement without a detailed brief).
    """
    settings = get_settings()

    # Resolve sector from brand if not explicitly provided
    resolved_sector = sector or brand.business_type or "local_retail"

    # Extract brand color hints from vibe profile
    primary_color = ""
    accent_color = ""
    visual_dna = ""
    try:
        vibe = brand.brand_vibe_profile  # type: ignore[attr-defined]
        if isinstance(vibe, dict):
            palette = vibe.get("palette", {})
            if isinstance(palette, dict):
                primary_color = palette.get("primary", "")
                accent_color = palette.get("accent", "")
        visual_dna_raw = getattr(brand, "visual_dna", None)
        if visual_dna_raw:
            visual_dna = str(visual_dna_raw)[:400]
    except Exception:
        pass

    try:
        agent = create_product_scene_director_agent(brand, llm=llm)
        task = create_product_scene_brief_task(
            agent=agent,
            brand_name=brand.business_name,
            business_type=brand.business_type or "brand",
            sector=resolved_sector,
            caption=caption,
            product_type=product_type or "product",
            enhance_level=enhance_level,
            primary_color=primary_color,
            accent_color=accent_color,
            visual_dna=visual_dna,
            mood=mood,
            visual_subject=visual_subject,
        )

        crew = Crew(
            agents=[agent],
            tasks=[task],
            process=Process.sequential,
            verbose=settings.crew_verbose,
        )

        result = crew.kickoff()
        raw_output = str(result.raw) if hasattr(result, "raw") else str(result)
        usage = total_tokens_from_crew(result)

        scene_brief = _extract_json(raw_output)
        if not scene_brief:
            logger.warning(
                "product_scene_crew.json_parse_failed",
                brand=brand.business_name,
                raw_snippet=raw_output[:200],
            )
            return _fallback_brief(brand.business_name, resolved_sector, caption)

        scene_brief["_token_usage"] = usage
        logger.info(
            "product_scene_crew.success",
            brand=brand.business_name,
            sector=resolved_sector,
            archetype=scene_brief.get("sector_archetype"),
        )
        return scene_brief

    except Exception as exc:
        logger.error("product_scene_crew.failed", exc=str(exc), brand=brand.business_name)
        return _fallback_brief(brand.business_name, resolved_sector, caption)


def _fallback_brief(brand_name: str, sector: str, caption: str) -> dict[str, Any]:
    """Safe fallback scene brief when the agent fails."""
    is_food = any(w in sector.lower() for w in ("food", "artisan", "café", "restaurant", "bakery"))
    is_beauty = any(w in sector.lower() for w in ("beauty", "wellness", "skin", "cosmetic"))

    if is_food:
        bg = "warm wooden table surface with soft natural light, rustic and authentic"
    elif is_beauty:
        bg = "clean white marble surface with soft diffused daylight"
    else:
        bg = "neutral light grey gradient background with professional directional lighting"

    return {
        "sector_archetype": "local_retail",
        "background_concept": bg,
        "surface_material": "wood" if is_food else "marble" if is_beauty else "neutral",
        "props": [],
        "lighting_style": "warm_golden" if is_food else "soft_daylight",
        "lighting_direction": "left",
        "depth_of_field": "medium",
        "color_temperature": "warm" if is_food else "neutral",
        "mood_words": ["authentic", "premium", "trustworthy"],
        "gpt_image2_prompt": (
            f"Product photography enhancement for {brand_name}. "
            f"CRITICAL: preserve the product, its label text, packaging, and logo EXACTLY as shown — "
            f"do not alter the product in any way. Only change the background to: {bg}. "
            f"Add professional lighting. Caption context: '{caption[:100]}'. "
            f"Result: Instagram-ready product photo that looks premium but authentic."
        ),
        "logo_placement": "bottom_right",
        "logo_size_pct": 12,
        "logo_opacity": 0.75,
        "brand_color_accent": "none",
        "instagram_aspect": "1:1",
        "quality_rationale": "Fallback brief — basic enhancement",
        "_fallback": True,
    }
