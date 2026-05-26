"""
Web Search Service — unified search with cost-optimized provider routing.

Priority order (cheapest first):
  1. Brave Search — FREE 2K/month, then $3/month
     https://brave.com/search/api/
  2. Tavily — $5/month (1K searches), AI-optimized results
     https://tavily.com/pricing
  3. Perplexity — $50/month, best quality but most expensive
     Only used as last resort

All return the same format: list of {title, url, snippet} dicts.
The caller gets the best available provider without knowing which one ran.
"""

from __future__ import annotations

from typing import Any

import httpx
import structlog

logger = structlog.get_logger()


async def web_search(
    query: str,
    *,
    tavily_api_key: str = "",
    brave_api_key: str = "",
    perplexity_api_key: str = "",
    perplexity_model: str = "sonar",
    max_results: int = 5,
) -> list[dict[str, str]]:
    """
    Search the web using the cheapest available provider.
    Returns list of {title, url, snippet}.
    """
    if tavily_api_key:
        results = await _tavily_search(query, tavily_api_key, max_results)
        if results:
            logger.debug("web_search_via_tavily", query=query[:60])
            return results

    if brave_api_key:
        results = await _brave_search(query, brave_api_key, max_results)
        if results:
            logger.debug("web_search_via_brave", query=query[:60])
            return results

    if perplexity_api_key:
        text = await _perplexity_search(query, perplexity_api_key, perplexity_model)
        if text:
            logger.debug("web_search_via_perplexity", query=query[:60])
            return [{"title": "Perplexity Answer", "url": "", "snippet": text}]

    logger.warning("web_search_no_provider_configured", query=query[:60])
    return []


async def web_search_summary(
    query: str,
    *,
    tavily_api_key: str = "",
    brave_api_key: str = "",
    perplexity_api_key: str = "",
    perplexity_model: str = "sonar",
) -> str:
    """Return a plain text summary from the top search results."""
    results = await web_search(
        query,
        tavily_api_key=tavily_api_key,
        brave_api_key=brave_api_key,
        perplexity_api_key=perplexity_api_key,
        perplexity_model=perplexity_model,
    )
    if not results:
        return ""
    # Concatenate snippets
    parts = []
    for r in results[:4]:
        snippet = r.get("snippet", "")
        title = r.get("title", "")
        if snippet:
            parts.append(f"{title}: {snippet}" if title else snippet)
    return " | ".join(parts)[:1200]


# ── Provider implementations ──────────────────────────────────────────────────

async def _tavily_search(query: str, api_key: str, max_results: int = 5) -> list[dict[str, str]]:
    """Tavily API — $5/month, 1K searches, AI-optimized."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                "https://api.tavily.com/search",
                headers={"Content-Type": "application/json"},
                json={
                    "api_key": api_key,
                    "query": query,
                    "search_depth": "basic",
                    "max_results": max_results,
                    "include_answer": True,
                },
            )
            r.raise_for_status()
            data = r.json()

        results = []
        # Include Tavily's AI answer if present
        if data.get("answer"):
            results.append({"title": "Summary", "url": "", "snippet": data["answer"]})
        for item in data.get("results", [])[:max_results]:
            results.append({
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "snippet": item.get("content", "")[:300],
            })
        return results
    except Exception as exc:
        logger.warning("tavily_search_failed", error=str(exc)[:100])
        return []


async def _brave_search(query: str, api_key: str, max_results: int = 5) -> list[dict[str, str]]:
    """Brave Search API — FREE 2K/month, then $3/month."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                params={"q": query, "count": max_results, "safesearch": "moderate"},
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip",
                    "X-Subscription-Token": api_key,
                },
            )
            r.raise_for_status()
            data = r.json()

        results = []
        for item in data.get("web", {}).get("results", [])[:max_results]:
            results.append({
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "snippet": item.get("description", "")[:300],
            })
        return results
    except Exception as exc:
        logger.warning("brave_search_failed", error=str(exc)[:100])
        return []


async def _perplexity_search(query: str, api_key: str, model: str = "sonar") -> str:
    """Perplexity API — $50/month, best quality, last resort."""
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                "https://api.perplexity.ai/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": query}],
                    "max_tokens": 400,
                },
            )
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        logger.warning("perplexity_search_failed", error=str(exc)[:100])
        return ""
