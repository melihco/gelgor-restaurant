"""
Performance Feedback Loop — connects real Instagram engagement data back to
the brand's learning context so future content agents produce better content.

Two feedback channels:

1. INTERNAL (always active):
   Reads our own approval/rejection data from the Suggestions table.
   Already handled by tenant_learning_service.py.

2. EXTERNAL (requires Instagram handle + Apify):
   Fetches the brand's own recent Instagram posts and their engagement metrics
   (likes, comments, views for reels). Identifies top and bottom performers.
   Builds a 'performance_brief' that tells agents:
     - What content formats/hooks actually drove engagement
     - What posted well vs what flopped
     - Caption length, emoji use, hashtag count patterns of winners

The performance_brief is merged into learning_context so all creative agents
automatically improve based on what ACTUALLY worked in the real world.

Refresh cadence: weekly (re-run via /refresh-performance endpoint).
"""

from __future__ import annotations

import re
import json
from collections import Counter
from typing import Any

import httpx
import structlog

logger = structlog.get_logger()


# ── Apify: fetch brand's own Instagram posts ─────────────────────────────

async def _fetch_brand_posts(
    handle: str,
    api_key: str,
    timeout: int = 90,
    max_posts: int = 20,
) -> list[dict]:
    """Fetch the brand's own recent Instagram posts with engagement metrics."""
    url = "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items"
    try:
        async with httpx.AsyncClient(timeout=timeout + 10) as client:
            resp = await client.post(
                url,
                params={"token": api_key},
                json={
                    "directUrls": [f"https://www.instagram.com/{handle}/"],
                    "resultsType": "posts",
                    "resultsLimit": max_posts,
                },
                timeout=timeout,
            )
            if resp.status_code in (200, 201):
                return resp.json() or []
    except Exception as exc:
        logger.warning("brand_posts_fetch_failed", handle=handle, error=str(exc))
    return []


def _engagement_score(post: dict) -> float:
    """Composite engagement score: likes + comments*2 + views*0.1 (for reels)."""
    likes = post.get("likesCount") or post.get("likes_count") or 0
    comments = post.get("commentsCount") or post.get("comments_count") or 0
    views = post.get("videoViewCount") or post.get("video_view_count") or 0
    return likes + comments * 2 + views * 0.1


def _caption_traits(caption: str) -> dict:
    """Extract observable traits from a caption for pattern analysis."""
    if not caption:
        return {}
    return {
        "length": len(caption),
        "has_emoji": bool(re.search(r"[^\x00-\x7F]", caption)),
        "has_question": "?" in caption,
        "hashtag_count": len(re.findall(r"#\w+", caption)),
        "line_breaks": caption.count("\n"),
    }


# ── Performance brief builder ─────────────────────────────────────────────

async def build_performance_brief(
    brand_name: str,
    instagram_handle: str,
    api_key: str,
    *,
    timeout: int = 90,
) -> str:
    """
    Analyse the brand's recent Instagram posts and build a performance brief.
    Returns "" if handle is missing, Apify unavailable, or insufficient data.
    """
    handle = (instagram_handle or "").lstrip("@").strip()
    if not handle or not api_key:
        return ""

    logger.info("performance_feedback_start", brand=brand_name, handle=handle)

    posts = await _fetch_brand_posts(handle, api_key, timeout)
    if len(posts) < 3:
        logger.info("performance_feedback_insufficient_data", posts=len(posts))
        return ""

    # Score all posts
    scored = sorted(
        [(p, _engagement_score(p)) for p in posts],
        key=lambda x: x[1],
        reverse=True,
    )

    top_3 = scored[:3]
    bottom_3 = scored[-3:]
    median_score = scored[len(scored) // 2][1] if scored else 0

    # Analyse top performer traits
    top_traits: list[dict] = []
    for post, score in top_3:
        caption = (post.get("caption") or "").strip()
        traits = _caption_traits(caption)
        traits["score"] = round(score)
        traits["type"] = post.get("type") or post.get("productType") or "post"
        traits["caption_preview"] = caption[:80].replace("\n", " ")
        top_traits.append(traits)

    # Common patterns in top posts
    top_lengths = [t["length"] for t in top_traits if t.get("length")]
    avg_top_length = int(sum(top_lengths) / len(top_lengths)) if top_lengths else 0
    top_emoji_pct = int(sum(1 for t in top_traits if t.get("has_emoji")) / len(top_traits) * 100) if top_traits else 0
    top_question_pct = int(sum(1 for t in top_traits if t.get("has_question")) / len(top_traits) * 100) if top_traits else 0
    top_hashtag_avg = int(sum(t.get("hashtag_count", 0) for t in top_traits) / len(top_traits)) if top_traits else 0
    top_types = Counter(t.get("type", "post") for t in top_traits)

    # Patterns in bottom posts
    bottom_traits = [_caption_traits((p.get("caption") or "").strip()) for p, _ in bottom_3]
    bottom_hashtag_avg = int(sum(t.get("hashtag_count", 0) for t in bottom_traits) / len(bottom_traits)) if bottom_traits else 0

    lines = [
        f"## Instagram Performance Patterns — @{handle} (last {len(posts)} posts)",
        "",
        f"**Top performers** (avg engagement score: {round(top_3[0][1]) if top_3 else '?'}+):",
    ]

    for i, (post, score) in enumerate(top_3, 1):
        preview = (post.get("caption") or "")[:60].replace("\n", " ")
        post_type = post.get("type") or "post"
        lines.append(f"  {i}. [{post_type}] Score {round(score)} — \"{preview}...\"")

    lines += [
        "",
        "**What works for this account**:",
    ]

    if avg_top_length > 0:
        length_desc = "kısa (<100 karakter)" if avg_top_length < 100 else "orta (100-250)" if avg_top_length < 250 else "uzun (250+)"
        lines.append(f"- Caption uzunluğu: {length_desc} ({avg_top_length} ort.)")
    if top_emoji_pct >= 60:
        lines.append("- Emoji kullanan captionlar daha iyi performans gösteriyor")
    elif top_emoji_pct <= 30:
        lines.append("- Emoji-free captionlar bu hesapta daha iyi çalışıyor")
    if top_question_pct >= 60:
        lines.append("- Soru hook'u olan captionlar yüksek etkileşim alıyor")
    if top_hashtag_avg > 0:
        if top_hashtag_avg > bottom_hashtag_avg + 3:
            lines.append(f"- Daha fazla hashtag ({top_hashtag_avg} ort.) performansı artırıyor")
        elif bottom_hashtag_avg > top_hashtag_avg + 3:
            lines.append(f"- Daha az hashtag ({top_hashtag_avg} ort.) daha iyi çalışıyor")
    if top_types:
        dominant = top_types.most_common(1)[0][0]
        lines.append(f"- Format: {dominant} en yüksek etkileşimi alıyor")

    lines += [
        "",
        "**Agent talimatı**: Yukarıdaki örüntüleri yeni içeriklerde uygula. "
        "Özellikle caption uzunluğu ve hook stratejisini kopyala.",
    ]

    result = "\n".join(lines)
    logger.info(
        "performance_feedback_complete",
        brand=brand_name,
        posts_analyzed=len(posts),
        top_score=round(top_3[0][1]) if top_3 else 0,
    )
    return result


async def refresh_learning_context_with_performance(
    brand_name: str,
    instagram_handle: str,
    existing_learning_context: str,
    api_key: str,
    *,
    timeout: int = 90,
) -> str:
    """
    Build a performance brief and prepend it to the existing learning_context.
    The combined string is what gets stored and injected into agent prompts.
    """
    perf_brief = await build_performance_brief(brand_name, instagram_handle, api_key, timeout=timeout)
    if not perf_brief:
        return existing_learning_context

    # Prepend performance data (higher priority than historical learning)
    separator = "\n\n---\n\n"
    if existing_learning_context:
        return perf_brief + separator + existing_learning_context
    return perf_brief
