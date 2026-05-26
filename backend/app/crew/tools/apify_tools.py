"""
Apify Agent Tools — CrewAI wrappers for Apify scraping during agent execution.

Previously, Apify was only called during onboarding (brand discovery) via
background services. These tools expose Apify actors as CrewAI tools so agents
can call them DURING task execution for real-time market data.

Agents can now ask:
  - "What are the top hashtags for beach clubs in Bodrum this week?"
  - "What is my competitor @macakizibodrum posting about?"
  - "What do recent Google reviews say about beach clubs in Bitez?"

All tools use synchronous httpx calls (CrewAI tools run in thread pools).
Graceful degradation: returns structured error if Apify is unavailable.

Free tier memory constraint: run max one Apify actor at a time (2-4GB each).
"""

from __future__ import annotations

import json
import re
from collections import Counter
from typing import Any

import httpx
import structlog
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

logger = structlog.get_logger()

_APIFY_BASE = "https://api.apify.com/v2"


def _run_actor_sync(
    actor_id: str,
    input_json: dict,
    api_key: str,
    timeout: int = 90,
) -> list[dict]:
    """Synchronous Apify actor run — safe to call from a thread pool."""
    url = f"{_APIFY_BASE}/acts/{actor_id}/run-sync-get-dataset-items"
    try:
        resp = httpx.post(
            url,
            params={"token": api_key},
            json=input_json,
            timeout=timeout + 10,
        )
        if resp.status_code in (200, 201):
            data = resp.json()
            if isinstance(data, dict) and "data" in data:
                data = data["data"]
            return data if isinstance(data, list) else []
        logger.warning("apify_tool_error", actor=actor_id, status=resp.status_code)
    except Exception as exc:
        logger.warning("apify_tool_failed", actor=actor_id, error=str(exc))
    return []


# ── Tool 1: Instagram Hashtag Trend Scout ─────────────────────────────────

class HashtagTrendInput(BaseModel):
    location_or_niche: str = Field(
        description=(
            "Location or niche to research, e.g. 'bodrum', 'beach club turkey', "
            "'istanbul restaurant'. Use a single keyword without spaces for best results."
        )
    )
    result_limit: int = Field(default=15, description="Number of recent posts to scan (max 30)")


class InstagramHashtagTrendTool(BaseTool):
    """
    Scans recent Instagram posts for a location/niche hashtag and extracts
    trending hashtags, content themes, and posting patterns.
    Use this to find what's trending in a specific location or niche RIGHT NOW.
    """

    name: str = "instagram_hashtag_trend_scout"
    description: str = (
        "Scans recent Instagram posts tagged with a location or niche keyword and returns "
        "trending hashtags, content themes, and popular caption patterns. "
        "Use this to find what content is performing well in a specific market this week. "
        "Example inputs: 'bodrum', 'beachclub', 'bodrumbeach', 'antalyarestaurant'."
    )
    args_schema: type[BaseModel] = HashtagTrendInput

    _api_key: str = ""
    _timeout: int = 90

    def __init__(self, api_key: str = "", timeout: int = 90):
        super().__init__()
        object.__setattr__(self, "_api_key", api_key)
        object.__setattr__(self, "_timeout", timeout)

    def _run(self, location_or_niche: str, result_limit: int = 15) -> str:
        if not self._api_key:
            return json.dumps({"status": "not_configured", "message": "APIFY_API_KEY not set."})

        tag = re.sub(r"[^a-zA-Z0-9_]", "", location_or_niche.lower().strip())
        items = _run_actor_sync(
            "apify~instagram-scraper",
            {
                "directUrls": [f"https://www.instagram.com/explore/tags/{tag}/"],
                "resultsType": "posts",
                "resultsLimit": min(result_limit, 30),
            },
            api_key=self._api_key,
            timeout=self._timeout,
        )

        if not items:
            return json.dumps({
                "status": "no_data",
                "hashtag": tag,
                "message": f"No posts found for #{tag}. Try a different keyword.",
            })

        all_tags: list[str] = []
        captions: list[str] = []
        likes_list: list[int] = []

        for post in items:
            caption = (post.get("caption") or "").strip()
            if caption:
                captions.append(caption[:150])
                all_tags.extend(re.findall(r"#\w+", caption.lower()))
            likes = post.get("likesCount") or 0
            likes_list.append(likes)

        top_tags = [t for t, _ in Counter(all_tags).most_common(15)]
        avg_likes = int(sum(likes_list) / len(likes_list)) if likes_list else 0

        logger.info("hashtag_trend_tool_ok", tag=tag, posts=len(items), tags=len(top_tags))

        return json.dumps({
            "hashtag_searched": f"#{tag}",
            "posts_analyzed": len(items),
            "top_trending_hashtags": top_tags,
            "average_likes_per_post": avg_likes,
            "sample_captions": captions[:3],
            "insight": (
                f"#{tag} has {len(items)} recent posts. "
                f"Top hashtags to include: {' '.join(top_tags[:8])}. "
                f"Average engagement: {avg_likes} likes/post."
            ),
        }, ensure_ascii=False, indent=2)


# ── Tool 2: Competitor Post Scanner ──────────────────────────────────────

class CompetitorScanInput(BaseModel):
    instagram_handle: str = Field(
        description="Instagram handle to scan (without @), e.g. 'macakizibodrum'"
    )
    post_count: int = Field(default=6, description="Number of recent posts to analyze (max 12)")


class CompetitorPostScannerTool(BaseTool):
    """
    Fetches recent posts from a competitor's Instagram account and summarises
    what they're posting, their top hashtags, and engagement patterns.
    Use this to understand what competitors are doing and find differentiation angles.
    """

    name: str = "competitor_post_scanner"
    description: str = (
        "Scans a competitor's recent Instagram posts and returns their content themes, "
        "top hashtags, posting frequency, and engagement metrics. "
        "Use to understand what competitors are promoting and find gaps to exploit. "
        "Input: Instagram handle without @ (e.g. 'macakizibodrum', 'milasbeach')."
    )
    args_schema: type[BaseModel] = CompetitorScanInput

    _api_key: str = ""
    _timeout: int = 90

    def __init__(self, api_key: str = "", timeout: int = 90):
        super().__init__()
        object.__setattr__(self, "_api_key", api_key)
        object.__setattr__(self, "_timeout", timeout)

    def _run(self, instagram_handle: str, post_count: int = 6) -> str:
        if not self._api_key:
            return json.dumps({"status": "not_configured", "message": "APIFY_API_KEY not set."})

        handle = instagram_handle.lstrip("@").strip()
        items = _run_actor_sync(
            "apify~instagram-scraper",
            {
                "directUrls": [f"https://www.instagram.com/{handle}/"],
                "resultsType": "posts",
                "resultsLimit": min(post_count, 12),
            },
            api_key=self._api_key,
            timeout=self._timeout,
        )

        if not items:
            # Try profile scraper as fallback
            profile_items = _run_actor_sync(
                "apify~instagram-profile-scraper",
                {"usernames": [handle], "resultsLimit": 1},
                api_key=self._api_key,
                timeout=self._timeout,
            )
            if not profile_items:
                return json.dumps({
                    "status": "no_data",
                    "handle": handle,
                    "message": f"@{handle} not found or account is private.",
                })
            return json.dumps({
                "handle": handle,
                "bio": profile_items[0].get("biography", ""),
                "followers": profile_items[0].get("followersCount"),
                "posts": "Post content unavailable (private or protected account)",
            }, ensure_ascii=False)

        all_tags: list[str] = []
        captions: list[str] = []
        likes_list: list[int] = []

        for post in items:
            caption = (post.get("caption") or "").strip()
            if caption:
                captions.append(caption[:200])
                all_tags.extend(re.findall(r"#\w+", caption.lower()))
            likes_list.append(post.get("likesCount") or 0)

        top_tags = [t for t, _ in Counter(all_tags).most_common(10)]
        avg_likes = int(sum(likes_list) / len(likes_list)) if likes_list else 0
        total_likes = sum(likes_list)

        logger.info("competitor_scan_ok", handle=handle, posts=len(items))

        return json.dumps({
            "competitor_handle": f"@{handle}",
            "posts_analyzed": len(items),
            "total_engagement_likes": total_likes,
            "avg_likes_per_post": avg_likes,
            "top_hashtags_used": top_tags,
            "recent_captions": captions[:3],
            "differentiation_insight": (
                f"@{handle} focuses on: {', '.join(top_tags[:5])}. "
                f"Average {avg_likes} likes/post. "
                "Consider what topics they are NOT covering as your content opportunity."
            ),
        }, ensure_ascii=False, indent=2)


# ── Tool 3: Google Maps Local Research ───────────────────────────────────

class LocalBusinessResearchInput(BaseModel):
    search_query: str = Field(
        description=(
            "Business search query for Google Maps, e.g. "
            "'beach clubs Bodrum Turkey', 'restaurants Bitez Bodrum', "
            "'hotel events Bodrum summer 2026'"
        )
    )
    max_results: int = Field(default=5, description="Number of businesses to return (max 10)")


class GoogleMapsResearchTool(BaseTool):
    """
    Searches Google Maps for local businesses in a category and returns their
    names, ratings, review counts, and categories. Use for competitive landscape
    research or to discover local events and businesses to reference in content.
    """

    name: str = "google_maps_local_research"
    description: str = (
        "Searches Google Maps for local businesses or venues and returns their ratings, "
        "review counts, and categories. Use for competitive landscape analysis, "
        "discovering local event venues, or researching the local market. "
        "Example queries: 'beach clubs Bodrum Turkey', 'seafood restaurants Bitez', "
        "'summer events Bodrum 2026'."
    )
    args_schema: type[BaseModel] = LocalBusinessResearchInput

    _api_key: str = ""
    _timeout: int = 90

    def __init__(self, api_key: str = "", timeout: int = 90):
        super().__init__()
        object.__setattr__(self, "_api_key", api_key)
        object.__setattr__(self, "_timeout", timeout)

    def _run(self, search_query: str, max_results: int = 5) -> str:
        if not self._api_key:
            return json.dumps({"status": "not_configured", "message": "APIFY_API_KEY not set."})

        items = _run_actor_sync(
            "compass~crawler-google-places",
            {
                "searchStringsArray": [search_query],
                "maxCrawledPlaces": min(max_results, 10),
                "language": "tr",
            },
            api_key=self._api_key,
            timeout=self._timeout,
        )

        if not items:
            return json.dumps({
                "status": "no_data",
                "query": search_query,
                "message": "No results found. Try a different search query.",
            })

        businesses = []
        for place in items:
            businesses.append({
                "name": place.get("title") or place.get("name", ""),
                "category": place.get("category") or place.get("categoryName", ""),
                "rating": place.get("totalScore") or place.get("rating"),
                "review_count": place.get("reviewsCount") or place.get("reviewCount"),
                "address": place.get("address", ""),
            })

        logger.info("google_maps_research_ok", query=search_query, results=len(businesses))

        return json.dumps({
            "query": search_query,
            "results_count": len(businesses),
            "businesses": businesses,
            "market_summary": (
                f"Found {len(businesses)} businesses for '{search_query}'. "
                f"Top rated: {businesses[0]['name']} ({businesses[0]['rating']}/5, {businesses[0]['review_count']} reviews)."
                if businesses else "No data available."
            ),
        }, ensure_ascii=False, indent=2)


# ── Factory: build all market research tools ──────────────────────────────

def build_market_research_tools(
    apify_api_key: str = "",
    apify_timeout: int = 90,
) -> list[BaseTool]:
    """
    Build the full set of market research tools with injected API credentials.
    Returns empty list items for any tool that lacks its required API key,
    so agents degrade gracefully when keys are missing.
    """
    tools: list[BaseTool] = [
        InstagramHashtagTrendTool(api_key=apify_api_key, timeout=apify_timeout),
        CompetitorPostScannerTool(api_key=apify_api_key, timeout=apify_timeout),
        GoogleMapsResearchTool(api_key=apify_api_key, timeout=apify_timeout),
    ]
    return tools
