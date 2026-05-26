"""
Social Listening Service — monitors brand mentions, competitor activity,
and industry hashtag trends across the web and Instagram.

Data sources (in priority order):
  1. Brand24 API — real-time mention tracking across web + social (optional, paid)
  2. Perplexity — web-wide search for brand/competitor mentions and news
  3. Apify Instagram — hashtag trend monitoring on Instagram

Output: structured SocialSignals dict injected into:
  - Brand DNA synthesis (weekly)
  - Market Intelligence (daily)
  - Content agent prompt via trend_brief

What this enables:
  - "Your brand was mentioned 12 times this week in Bodrum travel blogs"
  - "Competitor @macakizi posted 3 event announcements — zero cocktail content (your gap)"
  - "#bodrum had 1,200 posts today, top theme: sunset, second theme: yat"
  - "TripAdvisor: Sarnıç Beach mentioned in 2 negative posts about parking"
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog

from app.crew.context import BrandInfo

logger = structlog.get_logger()

_PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions"


_PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions"  # kept for reference


async def brand24_list_projects(api_key: str) -> list[dict]:
    """List all Brand24 projects for this API key."""
    if not api_key:
        return []
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                "https://app.brand24.com/api/v3/projects/",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if not r.ok:
                return []
            projects = r.json().get("objects", [])
            return [{"id": str(p["id"]), "name": p.get("name", ""), "keywords": p.get("keywords", "")} for p in projects]
    except Exception as exc:
        logger.warning("brand24_list_failed", error=str(exc))
        return []


async def brand24_create_project(api_key: str, brand_name: str, keywords: list[str]) -> dict:
    """Create a Brand24 project for a tenant."""
    if not api_key:
        return {}
    try:
        kw_str = ", ".join(keywords[:5]) if keywords else brand_name
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                "https://app.brand24.com/api/v3/projects/",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"name": brand_name, "keywords": kw_str},
            )
            if not r.ok:
                return {}
            data = r.json()
            return {"id": str(data.get("id", "")), "name": data.get("name", ""), "keywords": kw_str}
    except Exception as exc:
        logger.warning("brand24_create_failed", error=str(exc))
        return {}


async def _brand24_mentions(brand_name: str, api_key: str, project_id: str = "") -> dict[str, Any]:
    """Fetch Brand24 mention data. Uses project_id if provided, otherwise auto-finds."""
    if not api_key:
        return {}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            if not project_id:
                r = await client.get(
                    "https://app.brand24.com/api/v3/projects/",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                if not r.ok:
                    return {}
                projects = r.json().get("objects", [])
                project = next((p for p in projects if brand_name.lower() in p.get("name", "").lower()), None)
                if not project:
                    return {}
                project_id = str(project["id"])

            r2 = await client.get(
                f"https://app.brand24.com/api/v3/projects/{project_id}/summary/",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if not r2.ok:
                return {}

            data = r2.json()
            # Also fetch recent mentions for actionable signals
            r3 = await client.get(
                f"https://app.brand24.com/api/v3/projects/{project_id}/mentions/",
                headers={"Authorization": f"Bearer {api_key}"},
                params={"per_page": 5, "sentiment": "negative"},
            )
            negative_mentions = []
            if r3.ok:
                for m in r3.json().get("objects", [])[:3]:
                    negative_mentions.append({
                        "source": m.get("domain", ""),
                        "text": (m.get("title") or m.get("content", ""))[:150],
                        "sentiment_score": m.get("sentiment", 0),
                    })

            return {
                "project_id": project_id,
                "total_mentions": data.get("total_mentions", 0),
                "positive_mentions": data.get("positive_mentions", 0),
                "negative_mentions": data.get("negative_mentions", 0),
                "reach": data.get("total_reach", 0),
                "top_sources": data.get("top_sources", [])[:3],
                "recent_negative": negative_mentions,
            }
    except Exception as exc:
        logger.warning("brand24_failed", error=str(exc))
        return {}


async def _apify_hashtag_trend(hashtag: str, api_key: str, timeout: int = 60) -> dict[str, Any]:
    """Fetch Instagram hashtag trend data via Apify."""
    if not api_key:
        return {}
    try:
        tag = re.sub(r"[^a-zA-Z0-9_À-ɏ]", "", hashtag.lstrip("#"))
        url = f"https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items"
        async with httpx.AsyncClient(timeout=timeout + 10) as client:
            r = await client.post(
                url,
                params={"token": api_key},
                json={
                    "directUrls": [f"https://www.instagram.com/explore/tags/{tag}/"],
                    "resultsType": "posts",
                    "resultsLimit": 20,
                },
            )
            if r.status_code not in (200, 201):
                return {}
            posts = r.json() if isinstance(r.json(), list) else r.json().get("data", [])

        all_tags: list[str] = []
        likes: list[int] = []
        captions: list[str] = []

        for post in posts[:20]:
            cap = (post.get("caption") or "").strip()
            if cap:
                captions.append(cap[:100])
                all_tags.extend(re.findall(r"#\w+", cap.lower()))
            likes.append(post.get("likesCount") or 0)

        from collections import Counter
        top_tags = [t for t, _ in Counter(all_tags).most_common(10)]
        avg_likes = int(sum(likes) / len(likes)) if likes else 0

        return {
            "hashtag": f"#{tag}",
            "post_count": len(posts),
            "avg_likes": avg_likes,
            "top_co_hashtags": top_tags[:8],
            "sample_captions": captions[:3],
        }
    except Exception as exc:
        logger.warning("hashtag_trend_failed", hashtag=hashtag, error=str(exc))
        return {}


async def run_social_listening(
    brand: BrandInfo,
    openai_api_key: str = "",
    perplexity_api_key: str = "",
    apify_api_key: str = "",
    brand24_api_key: str = "",
    tavily_api_key: str = "",
    brave_api_key: str = "",
) -> dict[str, Any]:
    """
    Full social listening scan for a brand.
    Returns structured signals ready for injection into agent context.
    """
    now = datetime.now(timezone.utc)
    location = brand.location or "Turkey"
    business_type = brand.business_type or "business"
    brand_name = brand.business_name

    signals: dict[str, Any] = {
        "brand_mentions": {},
        "competitor_signals": {},
        "hashtag_trends": {},
        "web_intelligence": {},
        "generated_at": now.isoformat(),
    }

    import asyncio as _asyncio

    # ── 1. Brand24 mentions (if configured) ───────────────────────────────
    if brand24_api_key:
        b24_project_id = getattr(brand, "_brand24_project_id", "") or ""
        signals["brand_mentions"] = await _brand24_mentions(brand_name, brand24_api_key, b24_project_id)
        logger.info("social_listening_brand24_done", brand=brand_name,
                    mentions=signals["brand_mentions"].get("total_mentions", 0))

    # ── 2. Web intelligence (Tavily → Brave → Perplexity) ────────────────
    has_web_search = tavily_api_key or brave_api_key or perplexity_api_key
    if has_web_search:
        from app.services.web_search_service import web_search_summary
        search_kwargs = dict(
            tavily_api_key=tavily_api_key,
            brave_api_key=brave_api_key,
            perplexity_api_key=perplexity_api_key,
        )
        queries = [
            f'"{brand_name}" {location} mentions reviews social media last week',
            f'{business_type} {location} trends this week instagram content',
        ]
        if brand.competitors:
            queries.append(f'{brand.competitors[:80]} recent instagram activity promotions')

        results = await _asyncio.gather(*[web_search_summary(q, **search_kwargs) for q in queries])

        signals["web_intelligence"] = {
            "brand_web_presence": results[0] if results else "",
            "industry_trends": results[1] if len(results) > 1 else "",
            "competitor_web_activity": results[2] if len(results) > 2 else "",
        }
        logger.info("social_listening_web_done", brand=brand_name, provider="tavily/brave/perplexity")

    # ── 3. Instagram hashtag trends ────────────────────────────────────────
    if apify_api_key:
        seed_tags: list[str] = []
        if brand.location:
            seed_tags.append(re.sub(r"\s+", "", brand.location.lower()))
        if brand.business_type:
            seed_tags.append(re.sub(r"\s+", "", brand.business_type.lower().replace(" ", "")))
        seed_tags.extend(brand.instagram_top_hashtags[:2])
        seed_tags = list(dict.fromkeys(seed_tags))[:3]

        hashtag_results = {}
        for tag in seed_tags:
            result = await _apify_hashtag_trend(tag, apify_api_key)
            if result:
                hashtag_results[tag] = result
            await _asyncio.sleep(2)  # rate limit

        signals["hashtag_trends"] = hashtag_results
        logger.info("social_listening_hashtags_done", brand=brand_name, tags=len(hashtag_results))

    # ── 4. Synthesise into actionable brief ────────────────────────────────
    if openai_api_key and any([
        signals["brand_mentions"],
        signals["web_intelligence"].get("brand_web_presence"),
        signals["hashtag_trends"],
    ]):
        signals["brief"] = await _synthesise_brief(signals, brand, openai_api_key)
    else:
        signals["brief"] = _fallback_brief(signals, brand)

    return signals


async def _synthesise_brief(signals: dict, brand: BrandInfo, api_key: str) -> str:
    """Use GPT-4o-mini to synthesise raw signals into actionable brief."""
    try:
        signal_text = json.dumps({
            "brand_mentions": signals.get("brand_mentions"),
            "web_intelligence": signals.get("web_intelligence"),
            "hashtag_trends": {k: {"post_count": v.get("post_count"), "avg_likes": v.get("avg_likes"), "top_co_hashtags": v.get("top_co_hashtags")}
                               for k, v in signals.get("hashtag_trends", {}).items()},
        }, ensure_ascii=False)

        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": (
                            "You are a social media analyst. Write a concise 150-200 word "
                            "Social Listening Brief in markdown. Be specific and actionable. "
                            "Focus on: what people are saying about the brand, what competitors are doing, "
                            "what's trending in the niche, and what content opportunities this creates."
                        )},
                        {"role": "user", "content": f"Brand: {brand.business_name} ({brand.business_type}, {brand.location})\n\nSignals:\n{signal_text[:2000]}"},
                    ],
                    "max_tokens": 400,
                    "temperature": 0.3,
                },
            )
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        logger.warning("social_brief_synthesis_failed", error=str(exc))
        return _fallback_brief(signals, brand)


def _fallback_brief(signals: dict, brand: BrandInfo) -> str:
    lines = [f"## 📡 Social Listening — {brand.business_name}\n"]
    mentions = signals.get("brand_mentions", {})
    if mentions.get("total_mentions"):
        tone = "pozitif" if mentions.get("positive_mentions", 0) > mentions.get("negative_mentions", 0) else "karışık"
        lines.append(f"**Marka Bahisleri**: {mentions['total_mentions']} mention ({tone})")

    for tag, data in signals.get("hashtag_trends", {}).items():
        if data.get("post_count"):
            lines.append(f"**#{tag}**: {data['post_count']} post, ort. {data.get('avg_likes', 0)} beğeni")

    wi = signals.get("web_intelligence", {})
    if wi.get("industry_trends"):
        lines.append(f"\n**Sektör**: {wi['industry_trends'][:200]}")

    return "\n".join(lines) if len(lines) > 1 else "Yeterli sosyal sinyal verisi bulunamadı."


def build_social_signals_prompt(signals: dict[str, Any]) -> str:
    """Convert social signals into a prompt block for agents."""
    brief = signals.get("brief", "")
    if not brief:
        return ""

    generated_at = signals.get("generated_at", "")
    date_str = generated_at[:10] if generated_at else "unknown"

    return f"## 📡 Social Listening Intelligence ({date_str})\n\n{brief}\n"
