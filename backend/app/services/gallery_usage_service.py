"""
Load gallery photo usage per post type from Nexus OutputArtifacts.

Each gallery URL may be reused across different post types (feed vs story),
but must not repeat for the same post type once shared in Feed/Outputs.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import structlog

from app.config import get_settings

logger = structlog.get_logger()

POST_TYPES = ("feed", "story", "reel", "carousel")


def normalize_gallery_url(url: str) -> str:
    return url.split("?")[0].strip()


def kind_to_post_type(kind: str) -> str:
    k = (kind or "").lower()
    if "carousel" in k:
        return "carousel"
    if "reel" in k:
        return "reel"
    if any(x in k for x in ("story", "canvas", "event", "announcement")):
        return "story"
    return "feed"


def content_type_to_post_type(content_type: str) -> str:
    ct = (content_type or "").lower()
    if "carousel" in ct:
        return "carousel"
    if "reel" in ct:
        return "reel"
    if "story" in ct or "canvas" in ct:
        return "story"
    return "feed"


def _parse_json_obj(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str) or not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _is_rejected(status: Any) -> bool:
    s = str(status or "").lower()
    return s in ("2", "rejected", "3", "revisionrequested", "revision_requested")


_GENERATED_URL_MARKERS = (
    "oaidalleapiprodscus",  # OpenAI DALL-E CDN
    "r2.dev",               # Cloudflare R2 (enhanced outputs)
    "cdn.creatomate",
    "storage.googleapis.com",
    "blob.core.windows.net",
    "fal.ai",
)


def _looks_generated(url: str) -> bool:
    return any(marker in url for marker in _GENERATED_URL_MARKERS)


def _push_url(bucket: set[str], url: Any) -> None:
    if isinstance(url, str) and url.startswith("http"):
        bucket.add(normalize_gallery_url(url))


def _resolve_post_type(meta: dict[str, Any], content: dict[str, Any]) -> str:
    kind = str(meta.get("kind") or content.get("kind") or "")
    if kind:
        return kind_to_post_type(kind)
    ct = str(
        meta.get("contentType")
        or content.get("contentType")
        or content.get("content_type")
        or "feed"
    )
    return content_type_to_post_type(ct)


def extract_gallery_urls_from_artifact(artifact: dict[str, Any]) -> tuple[str, list[str]] | None:
    if _is_rejected(artifact.get("reviewStatus") or artifact.get("ReviewStatus")):
        return None

    meta = _parse_json_obj(artifact.get("metadata") or artifact.get("Metadata"))
    content = _parse_json_obj(artifact.get("content") or artifact.get("Content"))
    post_type = _resolve_post_type(meta, content)

    urls: set[str] = set()
    _push_url(urls, meta.get("reference_photo_url"))
    _push_url(urls, content.get("reference_photo_url"))
    _push_url(urls, meta.get("selected_gallery_url"))
    _push_url(urls, content.get("selected_gallery_url"))

    vps = _parse_json_obj(meta.get("visual_production_spec") or content.get("visual_production_spec"))
    _push_url(urls, vps.get("selected_gallery_url"))

    gallery_list = meta.get("gallery_photo_urls") or content.get("gallery_photo_urls")
    if isinstance(gallery_list, list):
        for u in gallery_list:
            _push_url(urls, u)

    carousel_urls = meta.get("carousel_urls") or content.get("carousel_urls")
    if isinstance(carousel_urls, list):
        for u in carousel_urls:
            _push_url(urls, u)

    # Secondary: imageUrl / contentUrl — track only if they look like real venue photos
    for field in ("imageUrl", "image_url"):
        image_url_candidate = str(meta.get(field) or content.get(field) or "")
        if image_url_candidate and not _looks_generated(image_url_candidate):
            _push_url(urls, image_url_candidate)
    content_url = str(artifact.get("contentUrl") or artifact.get("content_url") or "")
    if content_url and not _looks_generated(content_url):
        _push_url(urls, content_url)

    if not urls:
        return None
    return post_type, sorted(urls)


def build_usage_from_artifacts(artifacts: list[dict[str, Any]]) -> dict[str, list[str]]:
    by_type: dict[str, set[str]] = {t: set() for t in POST_TYPES}
    for artifact in artifacts:
        extracted = extract_gallery_urls_from_artifact(artifact)
        if not extracted:
            continue
        post_type, urls = extracted
        bucket = by_type.get(post_type, by_type["feed"])
        bucket.update(urls)
    return {t: sorted(by_type[t]) for t in POST_TYPES}


async def fetch_gallery_usage_by_type(workspace_id: str) -> dict[str, list[str]]:
    """Fetch Nexus artifacts and return gallery URLs used per post type."""
    settings = get_settings()
    nexus_url = getattr(settings, "nexus_api_url", "http://localhost:5050").rstrip("/")
    headers = {
        "X-Tenant-Id": workspace_id,
        "X-Internal-Api-Key": settings.internal_api_key,
    }
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(f"{nexus_url}/api/artifacts", headers=headers)
        if resp.status_code >= 300:
            logger.warning(
                "gallery_usage_fetch_failed",
                workspace_id=workspace_id,
                status=resp.status_code,
            )
            return {t: [] for t in POST_TYPES}
        data = resp.json()
        if not isinstance(data, list):
            return {t: [] for t in POST_TYPES}
        return build_usage_from_artifacts(data)
    except Exception as exc:
        logger.warning(
            "gallery_usage_fetch_error",
            workspace_id=workspace_id,
            error=str(exc)[:200],
        )
        return {t: [] for t in POST_TYPES}


def apply_gallery_usage_to_brand(brand: Any, usage_by_type: dict[str, list[str]]) -> None:
    """Attach per-type gallery usage to BrandInfo for ideation prompts."""
    brand.used_images_by_type = usage_by_type
    flat: set[str] = set()
    for urls in usage_by_type.values():
        flat.update(urls)
    brand.used_image_urls = sorted(flat)
