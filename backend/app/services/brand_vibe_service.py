"""
Brand Vibe service — scrape reference IG accounts via Apify.

Uses `singhera07/instagram-scraper` with `action: "posts"`, which returns
image URLs proxied through `cdn.socialhubapi.com`. These proxied URLs are
network-agnostic (work from any IP), unlike raw Instagram CDN URLs which
are IP-bound to the scraper's egress IP.

Returns a flat list of image URLs + captions; mirroring to R2 + Vision
extraction is orchestrated by the Next.js BFF.
"""

from __future__ import annotations

from typing import Any

import httpx
import structlog

from app.config import get_settings
from app.schemas.brand_vibe import ScrapeRefAccountsResponse

logger = structlog.get_logger()

# Actor that returns network-agnostic image URLs via socialhubapi CDN proxy.
_VIBE_ACTOR = "singhera07~instagram-scraper"
_APIFY_BASE = "https://api.apify.com/v2"


async def _run_vibe_actor(handle: str, limit: int, api_key: str, timeout: int = 90) -> list[dict[str, Any]]:
    """Run the vibe scraper actor and return the dataset items."""
    payload = {"action": "posts", "username": handle, "limit": limit}
    url = (
        f"{_APIFY_BASE}/acts/{_VIBE_ACTOR}/run-sync-get-dataset-items"
        f"?token={api_key}&clean=1"
    )
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(url, json=payload)
    if r.status_code not in (200, 201):
        raise RuntimeError(f"apify_actor_failed:{r.status_code}:{r.text[:200]}")
    data = r.json()
    if not isinstance(data, list):
        raise RuntimeError(f"unexpected_response:{type(data).__name__}")
    return data


def _is_image_item(it: dict[str, Any]) -> bool:
    """True if the item is a single image (not video/sidecar) and we have a download URL."""
    typename = it.get("__typename") or ""
    if typename in {"GraphImage", "GraphSidecar"}:
        return True
    # type==1 is image per IG's internal numbering
    return it.get("type") == 1


def _extract_image_url(it: dict[str, Any]) -> str | None:
    for key in ("display_url", "download_url"):
        v = it.get(key)
        if isinstance(v, str) and v.startswith("http") and ".mp4" not in v:
            return v
    return None


def _extract_caption(it: dict[str, Any]) -> str:
    # singhera07 returns caption under edge_media_to_caption.edges[*].node.text
    desc = it.get("description")
    if isinstance(desc, str) and desc.strip():
        return desc.strip()[:600]
    edge = it.get("edge_media_to_caption") or {}
    edges = edge.get("edges") if isinstance(edge, dict) else None
    if isinstance(edges, list) and edges:
        node = edges[0].get("node") if isinstance(edges[0], dict) else None
        if isinstance(node, dict):
            txt = node.get("text")
            if isinstance(txt, str):
                return txt.strip()[:600]
    return ""


async def scrape_reference_accounts(
    handles: list[str],
    posts_per_handle: int = 12,
) -> ScrapeRefAccountsResponse:
    settings = get_settings()
    apify_key = settings.apify_api_key
    if not apify_key:
        raise RuntimeError("APIFY_API_KEY missing; cannot scrape reference accounts")

    handles_norm = [h.lstrip("@").strip() for h in handles if h and h.strip()]

    all_urls: list[str] = []
    all_captions: list[str] = []
    errors: dict[str, str] = {}

    for handle in handles_norm:
        try:
            items = await _run_vibe_actor(handle, posts_per_handle, apify_key, timeout=90)
            urls: list[str] = []
            captions: list[str] = []
            for it in items:
                if not _is_image_item(it):
                    continue
                url = _extract_image_url(it)
                if url:
                    urls.append(url)
                cap = _extract_caption(it)
                if cap:
                    captions.append(cap)
            if not urls:
                errors[handle] = "no images returned"
            all_urls.extend(urls[: posts_per_handle * 2])  # carousels expand items
            all_captions.extend(captions[:posts_per_handle])
            logger.info(
                "vibe_ref_scraped",
                handle=handle,
                items=len(items),
                images=len(urls),
                captions=len(captions),
            )
        except Exception as exc:
            err = str(exc)[:300]
            errors[handle] = err
            logger.warning("vibe_ref_scrape_failed", handle=handle, error=err)

    seen: set[str] = set()
    unique_urls = [u for u in all_urls if not (u in seen or seen.add(u))]

    return ScrapeRefAccountsResponse(
        handles=handles_norm,
        image_urls=unique_urls,
        captions=all_captions[:30],
        fetch_errors=errors,
    )
