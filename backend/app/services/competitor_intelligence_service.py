"""
Competitor Intelligence Service — Apify-powered analysis of competitor Instagram accounts.

Fetches recent posts from competitor handles, analyses content themes, engagement patterns,
and uses GPT to synthesise actionable differentiation opportunities.

The resulting 'competitor_brief' string is:
  1. Stored in BrandContext.competitor_brief (refreshed weekly)
  2. Injected into Content Strategy Agent and review agent prompts
"""

from __future__ import annotations

import re
import json
from collections import Counter
from typing import Any

import httpx
import structlog

logger = structlog.get_logger()

_HANDLE_CLEANUP = re.compile(r"[^a-zA-Z0-9_.]")


def _name_to_handle_guess(name: str) -> str:
    """Convert a business name like 'Macakızı Bodrum' to a guessed Instagram handle."""
    replacements = {"ı": "i", "ğ": "g", "ş": "s", "ç": "c", "ö": "o", "ü": "u",
                    "İ": "I", "Ğ": "G", "Ş": "S", "Ç": "C", "Ö": "O", "Ü": "U"}
    handle = name.lower().strip()
    for src, dst in replacements.items():
        handle = handle.replace(src, dst)
    handle = re.sub(r"\s+", "", handle)
    handle = _HANDLE_CLEANUP.sub("", handle)
    return handle[:30]


async def _fetch_instagram_profile_light(
    handle: str,
    api_key: str,
    timeout: int = 60,
) -> dict[str, Any]:
    """Fetch Instagram profile + last 12 posts via Apify."""
    url = "https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items"
    try:
        async with httpx.AsyncClient(timeout=timeout + 10) as client:
            resp = await client.post(
                url,
                params={"token": api_key},
                json={"usernames": [handle], "resultsLimit": 12},
                timeout=timeout,
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                return data[0] if data else {}
    except Exception as exc:
        logger.debug("competitor_fetch_failed", handle=handle, error=str(exc))
    return {}


def _extract_content_themes(captions: list[str]) -> list[str]:
    """Infer content themes from caption text."""
    blob = " ".join(captions).lower()
    themes: list[str] = []

    theme_map = [
        (["event", "etkinlik", "night", "gece", "dj", "sahne", "stage"], "event & nightlife"),
        (["menu", "yemek", "food", "cocktail", "içecek", "drink", "kahve", "coffee"], "food & drinks"),
        (["indirim", "kampanya", "offer", "discount", "fiyat", "price"], "promotions & offers"),
        (["günaydın", "good morning", "sabah", "akşam", "evening", "haftasonu", "weekend"], "daily lifestyle"),
        (["mutlu", "happy", "kutlama", "celebrate", "doğum günü", "birthday", "anniversary"], "celebrations"),
        (["rezervasyon", "reservation", "booking", "bilet", "ticket"], "reservations & bookings"),
        (["arkadaş", "friends", "aile", "family", "birlikte", "together"], "community & togetherness"),
        (["yaz", "summer", "tatil", "holiday", "plaj", "beach", "havuz", "pool"], "summer & travel"),
        (["behind the scenes", "backstage", "ekip", "team", "mutfak", "kitchen"], "behind the scenes"),
        (["repost", "regram", "müşteri", "customer", "yorumlar", "review"], "social proof"),
    ]

    for keywords, label in theme_map:
        if any(kw in blob for kw in keywords):
            themes.append(label)

    return themes[:5]


def _calc_avg_engagement(posts: list[dict]) -> str:
    """Return avg likes + comments as a readable string."""
    likes = [p.get("likesCount") or p.get("likes") or 0 for p in posts]
    comments = [p.get("commentsCount") or p.get("comments") or 0 for p in posts]
    valid = [(l, c) for l, c in zip(likes, comments) if l or c]
    if not valid:
        return "unknown"
    avg_l = int(sum(l for l, _ in valid) / len(valid))
    avg_c = int(sum(c for _, c in valid) / len(valid))
    return f"{avg_l} likes / {avg_c} comments avg"


def _summarise_competitor(name: str, profile: dict) -> dict[str, Any] | None:
    """Convert raw Apify profile into a structured competitor snapshot."""
    if not profile or not profile.get("username"):
        return None

    posts = profile.get("latestPosts") or []
    captions = [(p.get("caption") or "").strip() for p in posts if p.get("caption")]
    all_tags: list[str] = []
    for cap in captions:
        all_tags.extend(re.findall(r"#\w+", cap.lower()))

    top_tags = [t for t, _ in Counter(all_tags).most_common(8)]
    followers = profile.get("followersCount") or profile.get("followers_count") or 0
    themes = _extract_content_themes(captions)
    engagement = _calc_avg_engagement(posts)
    sample_captions = [c[:150] for c in captions[:3]]

    return {
        "name": name,
        "handle": profile["username"],
        "followers": followers,
        "post_count_sample": len(posts),
        "top_hashtags": top_tags,
        "content_themes": themes,
        "engagement": engagement,
        "sample_captions": sample_captions,
    }


async def _synthesise_with_gpt(
    brand_name: str,
    brand_type: str,
    competitors: list[dict],
    openai_api_key: str,
) -> str:
    """Use GPT-4o-mini to synthesise a strategic competitor brief."""
    competitor_json = json.dumps(competitors, ensure_ascii=False, indent=2)
    prompt = f"""You are a senior social media strategist. Analyse these competitor Instagram profiles for {brand_name} ({brand_type}).

Competitor data:
{competitor_json}

Write a concise competitor brief (max 400 words) that includes:
1. What each competitor is doing well (content themes, tone, posting rhythm)
2. Common patterns across all competitors (what everyone is doing)
3. Gaps and white space — topics, formats, or tones that competitors are NOT using
4. 3 specific differentiation opportunities for {brand_name} to stand out

Be specific and actionable. Focus on what the content team can USE immediately.
Write in English."""

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {openai_api_key}"},
                json={
                    "model": "gpt-4o-mini",
                    "max_tokens": 600,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            if resp.status_code == 200:
                return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        logger.warning("competitor_gpt_synthesis_failed", error=str(exc))
    return ""


async def build_competitor_brief(
    brand_name: str,
    competitors_raw: str,
    api_key: str,
    timeout: int = 60,
    brand_type: str = "business",
    openai_api_key: str = "",
) -> str:
    """
    Analyse competitor Instagram accounts and return a strategic brief string.

    competitors_raw: comma-separated list of competitor business names or @handles.
    Returns "" if Apify is unavailable or no competitor data is found.
    """
    if not competitors_raw or not api_key:
        return ""

    entries = [c.strip() for c in competitors_raw.split(",") if c.strip()]
    if not entries:
        return ""

    logger.info("competitor_intelligence_start", brand=brand_name, competitors=len(entries))

    snapshots: list[dict] = []
    for entry in entries[:4]:  # cap at 4 competitors
        handle = entry.lstrip("@") if entry.startswith("@") else _name_to_handle_guess(entry)
        if not handle:
            continue

        profile = await _fetch_instagram_profile_light(handle, api_key, timeout)
        snapshot = _summarise_competitor(entry, profile)
        if snapshot:
            snapshots.append(snapshot)

    if not snapshots:
        logger.info("competitor_intelligence_no_data", brand=brand_name)
        return ""

    # Try GPT synthesis first for richer output
    if openai_api_key:
        gpt_brief = await _synthesise_with_gpt(brand_name, brand_type, snapshots, openai_api_key)
        if gpt_brief:
            # Prepend structured raw data for agent reference
            raw_section = _build_raw_section(snapshots)
            brief = f"## Competitor Intelligence — {brand_name}\n\n{raw_section}\n\n### Strategic Analysis\n{gpt_brief}"
            logger.info("competitor_intelligence_complete", brand=brand_name, profiles=len(snapshots), method="gpt")
            return brief

    # Fallback: structured text without GPT
    brief = _build_raw_section(snapshots)
    brief += (
        "\n\n**Differentiation opportunity**: "
        f"Identify topics, tones, or formats competitors are underusing where "
        f"{brand_name} can establish a stronger presence."
    )
    logger.info("competitor_intelligence_complete", brand=brand_name, profiles=len(snapshots), method="structured")
    return brief


def _build_raw_section(snapshots: list[dict]) -> str:
    lines = ["### Competitor Profiles\n"]
    for s in snapshots:
        lines.append(f"**{s['name']}** (@{s['handle']}, {s['followers']:,} followers)")
        if s["content_themes"]:
            lines.append(f"  Content themes: {', '.join(s['content_themes'])}")
        if s["top_hashtags"]:
            lines.append(f"  Top hashtags: {' '.join(s['top_hashtags'][:6])}")
        lines.append(f"  Engagement: {s['engagement']}")
        if s["sample_captions"]:
            lines.append(f"  Sample: \"{s['sample_captions'][0]}\"")
        lines.append("")
    return "\n".join(lines)
