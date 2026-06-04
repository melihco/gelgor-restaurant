"""
Product Scene Director Tasks — generates detailed visual scene briefs
for GPT image-2 product photo enhancement.
"""

from __future__ import annotations

from crewai import Agent, Task

# ─── Sector archetype library (used as agent context) ─────────────────────────
SECTOR_ARCHETYPES = """
SECTOR SCENE ARCHETYPES (reference only — adapt to brand DNA):

food_artisan    → Worn wooden table, linen or burlap surface, fresh raw ingredients
                  nearby (relevant to product), warm morning light from left, subtle steam
                  or condensation if appropriate. Earthy greens and amber tones.

beauty_clean    → White marble or light stone surface, single petal or botanical element,
                  soft diffused light, minimal props (1 only), high-key background.
                  Clean shadows. Premium pharmacy aesthetic.

fashion_lifestyle → Real-life context: coffee table, city bench, nature trail.
                    Lifestyle not studio. Shallow depth of field on surroundings.

technology      → Dark surface (slate, charcoal concrete), soft blue/purple ambient light,
                  minimal props — perhaps a glass, notebook. Modern and precise.

sports_fitness  → Outdoor context: concrete, asphalt, grass, sunrise sky.
                  High contrast, slightly desaturated. Energy and motion suggestion.

cafe_coffee     → Coffee beans scattered, aged wood, rustic ceramic cup nearby.
                  Warm amber bokeh lights. Morning ritual feel.

wine_spirits    → Deep wood or stone surface, candlelight or fireplace reflection,
                  dark dramatic background, single elegant prop (cork, grape leaf).

home_interior   → Lifestyle room context (kitchen counter, living room shelf),
                  natural materials. Props match season. Editorial flat-lay or hero shot.

professional    → Pure white or off-white gradient background, directional key light,
                  subtle drop shadow. Product is hero. Nothing distracts.

health_wellness → Natural linen or wood, botanical element (leaf, seed), daylight.
                  Clean, trustworthy. Understated luxury.

local_retail    → Neutral hero background or relevant real-world context.
                  Brand colors in background subtly if possible. Clean and honest.
"""


def create_product_scene_brief_task(
    agent: Agent,
    brand_name: str,
    business_type: str,
    sector: str,
    caption: str,
    product_type: str,
    enhance_level: str,
    primary_color: str = "",
    accent_color: str = "",
    visual_dna: str = "",
    mood: str = "",
    visual_subject: str = "product_hero",
) -> Task:
    """
    Task: analyze brand context + caption → output a detailed JSON scene brief
    for GPT image-2 product photo enhancement.
    """

    is_venue = visual_subject == "venue_ambiance"
    preservation_rules = (
        "1. NEVER replace the real venue — keep architecture, furniture, mirrors, staff as photographed\n"
        "2. Only lighting, color grade, atmosphere may change to match BRAND IDENTITY + POST BRIEF blocks in caption\n"
        "3. POST BRIEF section controls mood/props/atmosphere; BRAND IDENTITY section is fixed per brand\n"
        "4. Logo watermark: corner that does not cover the hero subject\n"
        "5. Do NOT invent signage or menu text in the image"
        if is_venue
        else "1. NEVER change the product, its label, packaging text, or logo\n"
        "2. BRAND IDENTITY block in caption = stable brand; POST SCENE BRIEF = this post only\n"
        "3. Scene must match sector archetype AND post brief emotional tone\n"
        "4. Props must make sense (no random items)\n"
        "5. Logo watermark: corner that doesn't overlap product"
    )

    description = f"""
You are the {"Venue" if is_venue else "Product"} Scene Director for {brand_name}.

CONTEXT (caption may contain BRAND IDENTITY + POST SCENE BRIEF sections):
- Brand: {brand_name}
- Business type: {business_type}
- Sector archetype: {sector}
- Subject: {product_type}
- Visual mode: {visual_subject}
- Enhancement level: {enhance_level}  (subtle=light/shadow only | moderate=refined scene | full=cinematic grade)
- Director context: "{caption[:800]}"
- Mood: {mood or 'derive from POST SCENE BRIEF section'}
- Primary color: {primary_color or 'derive from brand'}
- Accent color: {accent_color or 'derive from brand'}
- Visual DNA notes: {visual_dna[:300] if visual_dna else 'not specified'}

{SECTOR_ARCHETYPES}

YOUR TASK:
Produce the PERFECT scene brief for GPT image-2 enhancement.

Rules:
{preservation_rules}

Respond ONLY with valid JSON — no markdown, no explanation, no preamble:

{{
  "sector_archetype": "food_artisan | beauty_clean | fashion_lifestyle | technology | sports_fitness | cafe_coffee | wine_spirits | home_interior | professional | health_wellness | local_retail",
  "background_concept": "single sentence describing the new background",
  "surface_material": "wood | marble | concrete | linen | white | dark | grass | etc.",
  "props": ["prop1", "prop2"],
  "max_props": 2,
  "lighting_style": "warm_golden | soft_daylight | studio_clean | dramatic_side | blue_hour | candlelight",
  "lighting_direction": "left | right | top | overhead",
  "depth_of_field": "shallow | medium | deep",
  "color_temperature": "warm | neutral | cool | golden",
  "mood_words": ["word1", "word2", "word3"],
  "gpt_image2_prompt": "Full production-ready prompt for GPT image-2 images.edit — detailed, specific, preservation rules embedded",
  "logo_placement": "bottom_right | bottom_left | top_right | top_left | none",
  "logo_size_pct": 12,
  "logo_opacity": 0.80,
  "brand_color_accent": "hex or 'none'",
  "instagram_aspect": "1:1 | 4:5 | 9:16",
  "quality_rationale": "Why this scene will stop the scroll for this specific product and brand"
}}

The gpt_image2_prompt field is the most critical — write it as if you are briefing a professional image editor.
It must include: 1) Preservation rules (do NOT change product/label/logo), 2) Background and surface description,
3) Lighting setup, 4) Props (max 2), 5) Mood/atmosphere, 6) Camera perspective, 7) Final quality standard.
"""

    return Task(
        description=description,
        expected_output="Valid JSON scene brief object — no markdown fences",
        agent=agent,
    )
