"""
Visual Design Card tasks — instructs the content agent to produce
designed social card concepts (not raw photography briefs).

Each concept specifies: background treatment, color overlay, headline,
CTA, typography style, and a complete image_generation_prompt ready
for GPT-image-1 or Flux to produce the finished designed card.
"""

from __future__ import annotations

from crewai import Agent, Task

from app.crew.context import BrandInfo
from app.crew.prompts.content_prompts import VISUAL_DESIGN_CARD_TASK


def create_visual_design_card_task(
    agent: Agent,
    brand: BrandInfo,
    count: int = 3,
    brief: str = "",
    content_pillars: list[str] | None = None,
) -> Task:
    """
    Create a task that produces designed social card concepts.
    count: how many cards (3 = story + feed post + feed announcement)
    """
    ref_urls = brand.reference_image_urls[:6] if brand.reference_image_urls else []
    ref_list = "\n".join(f"  - {u}" for u in ref_urls) if ref_urls else "  (no reference images — use color_primary_with_logo style)"

    pillars = ", ".join(content_pillars or brand.content_pillars[:3] or ["campaign_offer", "event_announcement", "daily_story"])
    ctas = " | ".join(brand.default_ctas[:3]) if brand.default_ctas else "Rezervasyon Yap | Keşfet"

    description = VISUAL_DESIGN_CARD_TASK.format(
        count=count,
        business_name=brand.business_name,
        business_type=brand.business_type,
        location=brand.location or "Turkey",
        brand_tone=brand.brand_tone or "professional",
        visual_dna=brand.visual_dna[:200] if brand.visual_dna else "warm, coastal, natural light",
        reference_image_urls=ref_list,
        brief=brief or f"Haftalık sosyal medya kampanyası için {count} tasarım kartı üret.",
        content_pillars=pillars,
        default_ctas=ctas,
    )

    return Task(
        description=description,
        expected_output=(
            f"A JSON array of {count} visual design card objects, each with: "
            "card_type, format, concept_title, background_intent, background_reference_url, "
            "overlay_color, overlay_opacity, headline, subline, cta_text, cta_style, cta_color, "
            "typography_style, logo_position, text_color, visual_mood, "
            "image_generation_prompt, canva_field_mapping, strategic_purpose."
        ),
        agent=agent,
    )
