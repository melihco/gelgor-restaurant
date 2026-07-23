"""Task factory for slot_template_art_direction."""

from __future__ import annotations

from crewai import Agent, Task

from app.crew.context import BrandInfo
from app.crew.prompts.slot_art_direction_prompts import SLOT_TEMPLATE_ART_DIRECTION_TASK


def create_slot_template_art_direction_task(
    agent: Agent,
    brand: BrandInfo,
    *,
    catalog_slot_key: str,
    slot_name: str,
    format: str,
    template_type: str,
    purpose_job: str,
    sample_headline: str = "",
    primary_color: str = "",
    accent_color: str = "",
    diversity_salt: str = "",
) -> Task:
    description = SLOT_TEMPLATE_ART_DIRECTION_TASK.format(
        business_name=brand.business_name or "Brand",
        business_type=brand.business_type or "hospitality",
        location=brand.location or "Turkey",
        brand_tone=brand.brand_tone or "professional",
        visual_dna=(brand.visual_dna or brand.visual_style or "authentic brand atmosphere")[:400],
        primary_color=primary_color or "#1a1a1a",
        accent_color=accent_color or primary_color or "#c4a574",
        catalog_slot_key=catalog_slot_key or slot_name,
        slot_name=slot_name or catalog_slot_key or "slot",
        format=format or "post",
        template_type=template_type or "venue_showcase",
        purpose_job=purpose_job or slot_name or "brand template",
        sample_headline=(sample_headline or brand.business_name or "Brand")[:48],
        diversity_salt=diversity_salt or "(none — invent a strong first recipe)",
    )

    return Task(
        description=description,
        expected_output=(
            "A single JSON object with keys: layout_concept, type_zone_anchor, "
            "color_surfaces, type_hierarchy, motif_from_dna, reject_look, diversity_note."
        ),
        agent=agent,
    )
