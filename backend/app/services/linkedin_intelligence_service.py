"""
LinkedIn Intelligence Service — fetches B2B sector news and company announcements
for corporate-facing brands (event agencies, venues, hotels, professional services).

Use cases:
  - Sunu Event gibi event şirketleri için sektör haberleri
  - Kurumsal ortaklık duyuruları, ödüller, proje lansmanları
  - Rekabet analizi: rakip şirketlerin son LinkedIn paylaşımları

Data sources (priority order):
  1. Apify LinkedIn Company Posts Scraper
  2. Web search (Tavily/Brave/Perplexity) for LinkedIn content fallback
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog

logger = structlog.get_logger()

# Apify LinkedIn Company Posts actor
_APIFY_LINKEDIN_ACTOR = "anchor~linkedin-company-post-scraper"
_APIFY_BASE = "https://api.apify.com/v2"

# B2B sector keywords by business type
_B2B_SECTOR_KEYWORDS: dict[str, list[str]] = {
    "event": ["kurumsal etkinlik", "event management", "MICE", "incentive travel", "kongre", "organizasyon"],
    "hotel": ["otel yönetimi", "hospitality", "turizm yatırım", "otel açılış", "leisure travel"],
    "beach_club": ["plaj kulübü", "yaz sezonu", "bodrum etkinlik", "coastal hospitality"],
    "restaurant_cafe": ["F&B", "restoran konsept", "gastronomy", "fine dining", "cafe trend"],
    "mental_health": ["ruh sağlığı", "wellness", "mental health awareness", "terapi trend"],
    "default": ["sektör haberleri", "iş dünyası", "dijital pazarlama", "sosyal medya trend"],
}


async def scrape_linkedin_company_posts(
    company_urls: list[str],
    apify_api_key: str,
    max_posts: int = 10,
    timeout: int = 90,
) -> list[dict[str, Any]]:
    """
    Scrape recent posts from LinkedIn company pages via Apify.
    company_urls: list of LinkedIn company page URLs
    """
    if not apify_api_key or not company_urls:
        return []

    posts: list[dict[str, Any]] = []

    async with httpx.AsyncClient(timeout=timeout + 10) as client:
        for url in company_urls[:3]:
            try:
                r = await client.post(
                    f"{_APIFY_BASE}/acts/{_APIFY_LINKEDIN_ACTOR}/run-sync-get-dataset-items",
                    params={"token": apify_api_key},
                    json={
                        "companyUrl": url,
                        "maxPosts": max_posts,
                    },
                )
                if r.status_code not in (200, 201):
                    logger.warning("linkedin_scrape_failed", url=url, status=r.status_code)
                    continue

                raw = r.json() if isinstance(r.json(), list) else []
                for post in raw:
                    posts.append({
                        "company_url": url,
                        "text": (post.get("text") or "")[:500],
                        "date": post.get("postedAt") or post.get("date") or "",
                        "likes": post.get("likes") or post.get("numLikes") or 0,
                        "comments": post.get("comments") or post.get("numComments") or 0,
                        "post_url": post.get("url") or post.get("postUrl") or "",
                        "source": "linkedin_apify",
                    })
                logger.info("linkedin_posts_scraped", url=url, count=len(raw))

            except Exception as exc:
                logger.warning("linkedin_scrape_error", url=url, error=str(exc))

    return posts


async def search_linkedin_sector_news(
    business_type: str,
    location: str,
    brand_name: str = "",
    competitors: str = "",
    tavily_api_key: str = "",
    brave_api_key: str = "",
    perplexity_api_key: str = "",
) -> dict[str, Any]:
    """
    Search web for LinkedIn sector news and company announcements.
    Falls back gracefully when Apify is unavailable.
    """
    has_search = tavily_api_key or brave_api_key or perplexity_api_key
    if not has_search:
        return {}

    from app.services.web_search_service import web_search_summary

    # Pick sector keywords
    btype = business_type.lower()
    keywords: list[str] = []
    for key, kws in _B2B_SECTOR_KEYWORDS.items():
        if key in btype:
            keywords = kws[:3]
            break
    if not keywords:
        keywords = _B2B_SECTOR_KEYWORDS["default"][:3]

    city = location.split(",")[0].strip()
    kw_str = ", ".join(keywords[:2])

    queries = [
        f"LinkedIn {kw_str} {city} 2025 2026 trend duyuru haber",
        f"site:linkedin.com/company OR site:linkedin.com/pulse {business_type} {city} sector news",
    ]

    if competitors:
        comp_list = [c.strip() for c in competitors.split(",")][:2]
        comp_query = " OR ".join(f'"{c}"' for c in comp_list)
        queries.append(f"LinkedIn {comp_query} son duyuru haber")

    results = []
    import asyncio
    search_kwargs = dict(
        tavily_api_key=tavily_api_key,
        brave_api_key=brave_api_key,
        perplexity_api_key=perplexity_api_key,
    )
    raw_results = await asyncio.gather(*[web_search_summary(q, **search_kwargs) for q in queries])

    for i, raw in enumerate(raw_results):
        if raw:
            results.append({
                "query": queries[i],
                "summary": raw[:600],
                "source": "web_search",
            })

    return {
        "sector_news": results[0]["summary"] if results else "",
        "competitor_activity": results[2]["summary"] if len(results) > 2 else "",
        "keywords_researched": keywords,
        "city": city,
    }


async def build_linkedin_intelligence(
    brand_name: str,
    business_type: str,
    location: str,
    competitors: str = "",
    company_linkedin_urls: list[str] | None = None,
    apify_api_key: str = "",
    tavily_api_key: str = "",
    brave_api_key: str = "",
    perplexity_api_key: str = "",
    openai_api_key: str = "",
) -> dict[str, Any]:
    """
    Main entry: scrape LinkedIn posts (if URLs provided) + search for sector news.
    Returns structured intelligence ready for agent injection.
    """
    posts: list[dict] = []

    # Scrape company LinkedIn pages if URLs provided
    if company_linkedin_urls and apify_api_key:
        posts = await scrape_linkedin_company_posts(company_linkedin_urls, apify_api_key)

    # Always do web search for sector news
    sector_data = await search_linkedin_sector_news(
        business_type=business_type,
        location=location,
        brand_name=brand_name,
        competitors=competitors,
        tavily_api_key=tavily_api_key,
        brave_api_key=brave_api_key,
        perplexity_api_key=perplexity_api_key,
    )

    # Synthesise with GPT if we have data
    brief = ""
    if openai_api_key and (posts or sector_data.get("sector_news")):
        brief = await _synthesise_linkedin_brief(brand_name, business_type, location, posts, sector_data, openai_api_key)

    if not brief:
        brief = _fallback_linkedin_brief(brand_name, posts, sector_data)

    return {
        "available": bool(posts or sector_data.get("sector_news")),
        "company_posts_count": len(posts),
        "top_posts": posts[:5],
        "sector_news": sector_data.get("sector_news", ""),
        "competitor_activity": sector_data.get("competitor_activity", ""),
        "brief": brief,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


async def _synthesise_linkedin_brief(
    brand_name: str,
    business_type: str,
    location: str,
    posts: list[dict],
    sector_data: dict,
    api_key: str,
) -> str:
    """GPT-4o-mini synthesis of LinkedIn signals into actionable brief."""
    try:
        posts_text = "\n".join([f"- {p['text'][:200]}" for p in posts[:5]]) if posts else "No scraped posts"
        sector_news = sector_data.get("sector_news", "")[:800]
        comp_activity = sector_data.get("competitor_activity", "")[:400]

        prompt = (
            f"Brand: {brand_name} ({business_type}, {location})\n\n"
            f"Recent LinkedIn company posts:\n{posts_text}\n\n"
            f"Sector news (LinkedIn/web):\n{sector_news}\n\n"
            f"Competitor activity:\n{comp_activity}\n\n"
            "Write a concise 150-word LinkedIn B2B Intelligence Brief in Turkish. "
            "Focus on: what competitors are announcing, sector trends relevant to this brand's B2B strategy, "
            "content opportunities for LinkedIn (corporate partnerships, awards, project showcases). "
            "Be specific and actionable."
        )

        async with httpx.AsyncClient(timeout=25) as client:
            r = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 350,
                    "temperature": 0.3,
                },
            )
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        logger.warning("linkedin_brief_synthesis_failed", error=str(exc))
        return ""


def _fallback_linkedin_brief(brand_name: str, posts: list[dict], sector_data: dict) -> str:
    lines = [f"## 💼 LinkedIn B2B Intelligence — {brand_name}\n"]
    if posts:
        lines.append(f"**Şirket paylaşımı**: {len(posts)} post tarandı")
        top = posts[0]
        lines.append(f"**En son**: {top['text'][:150]}")
    if sector_data.get("sector_news"):
        lines.append(f"\n**Sektör haberleri**: {sector_data['sector_news'][:300]}")
    if sector_data.get("competitor_activity"):
        lines.append(f"\n**Rakip aktivitesi**: {sector_data['competitor_activity'][:200]}")
    return "\n".join(lines) if len(lines) > 1 else "LinkedIn verisi bulunamadı."


def build_linkedin_prompt(data: dict[str, Any]) -> str:
    """Convert LinkedIn intelligence into an agent prompt block."""
    if not data or not data.get("available"):
        return ""

    brief = data.get("brief", "")
    if not brief:
        return ""

    gen = data.get("generated_at", "")[:10]
    return f"## 💼 LinkedIn B2B Intelligence ({gen})\n\n{brief}\n"
