"""
Pinterest Visual Trend Scraper — finds visual inspiration for content strategy.

Uses Apify's Pinterest Search Scraper to discover:
- Color palettes trending in the brand's sector
- Visual composition styles performing well
- Seasonal aesthetic themes
- Content format inspiration (flat lay, lifestyle, close-up)

Results are stored in brand_contexts.visual_inspiration and injected into:
- Content agent's visual direction guidance
- Image generation prompts for more on-trend visuals
- Brand DNA synthesis for visual section
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import structlog

logger = structlog.get_logger()

_APIFY_ACTOR = "NagEuvONHQtmNhnle"  # Pinterest Search Scraper (60K+ runs)
_APIFY_BASE = "https://api.apify.com/v2"


async def scrape_pinterest_trends(
    queries: list[str],
    api_key: str,
    max_per_query: int = 10,
    timeout: int = 90,
) -> list[dict[str, Any]]:
    """
    Search Pinterest for multiple queries and return pin data.
    Returns list of {title, description, imageUrl, link, boardName, saves}
    """
    if not api_key:
        return []

    all_pins: list[dict[str, Any]] = []

    async with httpx.AsyncClient(timeout=timeout + 10) as client:
        for query in queries[:4]:  # max 4 queries to stay within limits
            try:
                r = await client.post(
                    f"{_APIFY_BASE}/acts/{_APIFY_ACTOR}/run-sync-get-dataset-items",
                    params={"token": api_key},
                    json={
                        "query": query,
                        "maxResults": max_per_query,
                        "searchType": "pins",
                    },
                )

                if r.status_code not in (200, 201):
                    logger.warning("pinterest_scrape_failed", query=query, status=r.status_code)
                    continue

                pins = r.json() if isinstance(r.json(), list) else []
                for pin in pins:
                    all_pins.append({
                        "query": query,
                        "title": (pin.get("title") or "")[:120],
                        "description": (pin.get("description") or "")[:200],
                        "imageUrl": pin.get("imageUrl") or pin.get("imageOriginalUrl") or "",
                        "link": pin.get("link") or "",
                        "saves": pin.get("repins") or pin.get("saves") or 0,
                        "boardName": pin.get("boardName") or "",
                    })

                logger.info("pinterest_scraped", query=query, pins=len(pins))

            except Exception as exc:
                logger.warning("pinterest_query_failed", query=query, error=str(exc))

    # Sort by save count (most popular first)
    return sorted(all_pins, key=lambda p: p.get("saves", 0), reverse=True)


def build_visual_inspiration_queries(brand_name: str, business_type: str, location: str) -> list[str]:
    """Generate Pinterest search queries relevant to this brand."""
    queries = []

    # Sector-specific visual aesthetics
    type_queries = {
        "beach_club": ["beach club aesthetic", "coastal dining luxury", "pool party setup"],
        "restaurant_cafe": ["restaurant food photography", "cafe aesthetic interior", "food styling", "ice cream aesthetic", "dessert photography"],
        "dondurma": ["ice cream aesthetic", "gelato photography", "dessert flat lay"],
        "mental_health_clinic": ["wellness minimal design", "therapy office calm", "mental health visual"],
        "bakery": ["bakery aesthetic", "pastry photography", "sweets flat lay"],
        "hotel": ["boutique hotel aesthetic", "luxury room design", "hotel pool photography"],
        "olive_oil": ["olive oil photography", "mediterranean food styling", "artisan product flat lay"],
        "event": ["event decoration ideas", "venue setup elegant", "party aesthetic"],
    }

    # Find matching sector
    for key, sector_queries in type_queries.items():
        if key in business_type.lower():
            queries.extend(sector_queries[:2])
            break

    # Location-specific
    if location:
        city = location.split(",")[0].strip().lower()
        queries.append(f"{city} aesthetic photography")

    # Generic fallbacks
    if len(queries) < 2:
        queries.extend(["brand aesthetic social media", "instagram content ideas"])

    return queries[:4]


async def build_pinterest_inspiration_brief(
    brand_name: str,
    business_type: str,
    location: str,
    apify_api_key: str,
) -> dict[str, Any]:
    """
    Scrape Pinterest and synthesise visual inspiration brief.
    Returns structured data for agent context injection.
    """
    queries = build_visual_inspiration_queries(brand_name, business_type, location)
    logger.info("pinterest_inspiration_start", brand=brand_name, queries=queries)

    pins = await scrape_pinterest_trends(queries, apify_api_key)

    if not pins:
        return {
            "available": False,
            "queries": queries,
            "pins": [],
            "brief": "Pinterest data unavailable.",
        }

    # Extract visual patterns from top pins
    top_pins = pins[:20]
    image_urls = [p["imageUrl"] for p in top_pins if p.get("imageUrl")][:10]

    # Analyze common themes from titles/descriptions
    all_text = " ".join([p.get("title", "") + " " + p.get("description", "") for p in top_pins])
    words = [w.lower() for w in all_text.split() if len(w) > 4]
    from collections import Counter
    common_words = [w for w, _ in Counter(words).most_common(15) if w not in ("with", "this", "that", "from", "have", "more", "your", "their")]

    brief = (
        f"Pinterest visual trends for {brand_name} ({business_type}):\n"
        f"Searched: {', '.join(queries)}\n"
        f"Top visual themes: {', '.join(common_words[:8])}\n"
        f"Most saved content style: {top_pins[0].get('title', 'N/A') if top_pins else 'N/A'}\n"
        f"Reference images available: {len(image_urls)}"
    )

    return {
        "available": True,
        "queries": queries,
        "pins_count": len(pins),
        "top_pins": [
            {"title": p["title"], "imageUrl": p["imageUrl"], "saves": p["saves"]}
            for p in top_pins[:8]
        ],
        "visual_themes": common_words[:10],
        "reference_image_urls": image_urls,
        "brief": brief,
    }
