"""
Visual DNA Service — GPT-4o Vision analysis of real venue/brand photography.

Sends a tenant's reference image URLs to GPT-4o Vision and asks for a structured
analysis covering color palette, lighting, materials, mood, and visual style.

The resulting 'visual_dna' string is stored in BrandContext and injected into
every agent's brand context prompt so content direction stays venue-consistent.

Design decisions:
- Analyzes up to 6 images in a single API call (one round-trip, lower latency).
- Only public HTTP/HTTPS URLs are accepted — data URIs are skipped.
- Returns an empty string (never raises) on any failure so callers can treat
  visual_dna as optional enrichment.
- Does not re-analyze if visual_dna is already populated and force=False.
"""

from __future__ import annotations

import os
import json

import httpx
import structlog

logger = structlog.get_logger()

_VISION_PROMPT = """\
You are a creative director analyzing photography for a brand's visual identity.
The brand may be ANY type: restaurant, salon, gym, clinic, retail shop, tech company, etc.

Look at the provided images (real photos from this brand/business) and return a concise
structured analysis in JSON with exactly these keys:

{
  "color_palette": ["#hex1", "#hex2", "#hex3", "#hex4"],
  "dominant_colors_description": "short prose description of the dominant color scheme",
  "lighting": "describe the typical lighting style (natural, studio, ambient, neon, etc.)",
  "materials_and_textures": "describe physical materials, surfaces, finishes visible in the photos",
  "mood": "the emotional atmosphere — e.g. professional, warm, energetic, luxurious, clinical, cozy",
  "visual_style": "the photographic/visual style — e.g. natural editorial, clinical clean, bright minimal, dark moody",
  "brand_character": "2-3 sentences describing the brand's distinct personality and what makes its space/products/services visually unique",
  "content_direction": "what visual approach — lighting, angles, composition, props — should content follow to stay on-brand"
}

CRITICAL: Do NOT assume this is a restaurant or hospitality brand. Describe ONLY what you actually see.
If you see a salon — describe hair, products, mirrors. If a gym — equipment, space, energy.
If products — packaging, materials, display. Be specific and grounded. Return only valid JSON.
"""


async def analyze_visual_dna(
    image_urls: list[str],
    brand_name: str,
    api_key: str,
    model: str = "gpt-4o",
    *,
    max_images: int = 6,
) -> str:
    """
    Call GPT-4o Vision with up to max_images reference URLs.
    Returns a formatted markdown string ready for prompt injection,
    or "" if analysis fails or no usable images are provided.
    """
    # Filter to public HTTP(S) URLs only
    usable = [
        u for u in image_urls
        if isinstance(u, str) and u.startswith(("http://", "https://"))
    ][:max_images]

    if not usable:
        logger.info("visual_dna_skipped", reason="no_usable_image_urls", brand=brand_name)
        return ""

    logger.info("visual_dna_analysis_start", brand=brand_name, image_count=len(usable))

    # Build the multimodal message content
    content: list[dict] = [{"type": "text", "text": _VISION_PROMPT}]
    for url in usable:
        content.append({
            "type": "image_url",
            "image_url": {"url": url, "detail": "low"},  # "low" = faster + cheaper
        })

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": content}],
                    "max_tokens": 800,
                    "temperature": 0.2,
                    "response_format": {"type": "json_object"},
                },
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"]
    except Exception as exc:
        logger.warning("visual_dna_api_failed", brand=brand_name, error=str(exc))
        return ""

    # Parse and format for prompt injection
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("visual_dna_json_parse_failed", brand=brand_name, raw=raw[:200])
        return ""

    lines = [f"**Brand**: {brand_name}"]

    if data.get("dominant_colors_description"):
        lines.append(f"**Colors**: {data['dominant_colors_description']}")
    if data.get("color_palette"):
        lines.append(f"**Palette**: {' · '.join(data['color_palette'][:4])}")
    if data.get("lighting"):
        lines.append(f"**Lighting**: {data['lighting']}")
    if data.get("materials_and_textures"):
        lines.append(f"**Materials**: {data['materials_and_textures']}")
    if data.get("mood"):
        lines.append(f"**Mood**: {data['mood']}")
    if data.get("visual_style"):
        lines.append(f"**Visual Style**: {data['visual_style']}")
    if data.get("brand_character"):
        lines.append(f"**Brand Character**: {data['brand_character']}")
    elif data.get("venue_character"):
        lines.append(f"**Brand Character**: {data['venue_character']}")
    if data.get("content_direction"):
        lines.append(f"**Content Direction**: {data['content_direction']}")

    result = "\n".join(lines)
    logger.info(
        "visual_dna_analysis_complete",
        brand=brand_name,
        images_analyzed=len(usable),
        output_chars=len(result),
    )
    return result


async def ensure_visual_dna(
    brand_name: str,
    reference_image_urls: list[str],
    existing_visual_dna: str | None,
    api_key: str,
    *,
    force: bool = False,
) -> str:
    """
    Return existing visual_dna if already populated (and not force=True),
    otherwise run the Vision analysis.
    """
    if existing_visual_dna and not force:
        return existing_visual_dna
    return await analyze_visual_dna(reference_image_urls, brand_name, api_key)
