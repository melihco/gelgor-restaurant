"""
Meta Publishing Service — posts approved content to Instagram Business.

Supports:
  - Feed posts (image)
  - Reels (video)
  - Stories (image/video)
  - Carousel (multiple images)

Flow:
  1. Create media container (upload media + metadata)
  2. Poll until container is ready
  3. Publish container → live on Instagram
  4. Return post ID + permalink

Required OAuth permissions:
  instagram_content_publish, pages_read_engagement, pages_manage_posts
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Literal

import httpx
import structlog

logger = structlog.get_logger()

_GRAPH = "https://graph.facebook.com/v19.0"
_MAX_POLL = 12   # max 60 seconds waiting for container
_POLL_INTERVAL = 5


# ── Container creation ────────────────────────────────────────────────────────

async def _create_image_container(
    ig_user_id: str,
    access_token: str,
    image_url: str,
    caption: str,
    is_story: bool = False,
) -> str:
    """Create an image media container. Returns container_id."""
    async with httpx.AsyncClient(timeout=30) as client:
        params: dict[str, Any] = {
            "access_token": access_token,
            "image_url": image_url,
            "caption": caption,
        }
        if is_story:
            params["media_type"] = "STORIES"

        r = await client.post(f"{_GRAPH}/{ig_user_id}/media", params=params)
        r.raise_for_status()
        return r.json()["id"]


async def _create_reel_container(
    ig_user_id: str,
    access_token: str,
    video_url: str,
    caption: str,
    cover_url: str | None = None,
) -> str:
    """Create a Reel media container. Returns container_id."""
    async with httpx.AsyncClient(timeout=30) as client:
        params: dict[str, Any] = {
            "access_token": access_token,
            "media_type": "REELS",
            "video_url": video_url,
            "caption": caption,
            "share_to_feed": "true",
        }
        if cover_url:
            params["cover_url"] = cover_url

        r = await client.post(f"{_GRAPH}/{ig_user_id}/media", params=params)
        r.raise_for_status()
        return r.json()["id"]


async def _create_video_story_container(
    ig_user_id: str,
    access_token: str,
    video_url: str,
) -> str:
    """Create a video Story container."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(f"{_GRAPH}/{ig_user_id}/media", params={
            "access_token": access_token,
            "media_type": "STORIES",
            "video_url": video_url,
        })
        r.raise_for_status()
        return r.json()["id"]


# ── Container polling ─────────────────────────────────────────────────────────

async def _wait_for_container(
    container_id: str,
    access_token: str,
) -> bool:
    """Poll until container status is FINISHED. Returns True if ready."""
    async with httpx.AsyncClient(timeout=15) as client:
        for _ in range(_MAX_POLL):
            r = await client.get(
                f"{_GRAPH}/{container_id}",
                params={"access_token": access_token, "fields": "status_code,status"},
            )
            if not r.ok:
                return False
            data = r.json()
            status = data.get("status_code") or data.get("status", "")
            if status == "FINISHED":
                return True
            if status in ("ERROR", "EXPIRED"):
                logger.error("container_failed", container_id=container_id, status=status)
                return False
            await asyncio.sleep(_POLL_INTERVAL)
    return False


# ── Publish ───────────────────────────────────────────────────────────────────

async def _publish_container(
    ig_user_id: str,
    container_id: str,
    access_token: str,
) -> dict[str, str]:
    """Publish a ready container. Returns {post_id, permalink}."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{_GRAPH}/{ig_user_id}/media_publish",
            params={"access_token": access_token, "creation_id": container_id},
        )
        r.raise_for_status()
        post_id = r.json()["id"]

        # Fetch permalink
        r2 = await client.get(
            f"{_GRAPH}/{post_id}",
            params={"access_token": access_token, "fields": "permalink,timestamp"},
        )
        permalink = r2.json().get("permalink", "") if r2.ok else ""

        return {"post_id": post_id, "permalink": permalink}


# ── Public API ────────────────────────────────────────────────────────────────

PublishType = Literal["feed_image", "reel", "story_image", "story_video"]


async def publish_to_instagram(
    ig_user_id: str,
    access_token: str,
    publish_type: PublishType,
    *,
    image_url: str | None = None,
    video_url: str | None = None,
    caption: str = "",
    hashtags: list[str] | None = None,
    cover_url: str | None = None,
) -> dict[str, Any]:
    """
    Publish content to Instagram Business account.

    Returns:
      {"success": True, "post_id": "...", "permalink": "...", "published_at": "..."}
      or
      {"success": False, "error": "..."}
    """
    full_caption = caption
    if hashtags:
        tag_str = " ".join(h if h.startswith("#") else f"#{h}" for h in hashtags[:30])
        full_caption = f"{caption}\n\n{tag_str}" if caption else tag_str

    try:
        # 1. Create container
        if publish_type == "feed_image":
            if not image_url:
                return {"success": False, "error": "image_url required for feed posts"}
            container_id = await _create_image_container(ig_user_id, access_token, image_url, full_caption)

        elif publish_type == "reel":
            if not video_url:
                return {"success": False, "error": "video_url required for reels"}
            container_id = await _create_reel_container(ig_user_id, access_token, video_url, full_caption, cover_url)

        elif publish_type == "story_image":
            if not image_url:
                return {"success": False, "error": "image_url required for stories"}
            container_id = await _create_image_container(ig_user_id, access_token, image_url, "", is_story=True)

        elif publish_type == "story_video":
            if not video_url:
                return {"success": False, "error": "video_url required for video stories"}
            container_id = await _create_video_story_container(ig_user_id, access_token, video_url)

        else:
            return {"success": False, "error": f"Unknown publish_type: {publish_type}"}

        logger.info("instagram_container_created", container_id=container_id, type=publish_type)

        # 2. Wait for container to be ready (video processing)
        needs_poll = publish_type in ("reel", "story_video")
        if needs_poll:
            ready = await _wait_for_container(container_id, access_token)
            if not ready:
                return {"success": False, "error": "Container processing timed out or failed"}

        # 3. Publish
        result = await _publish_container(ig_user_id, container_id, access_token)

        logger.info(
            "instagram_published",
            post_id=result["post_id"],
            type=publish_type,
            permalink=result.get("permalink", ""),
        )

        return {
            "success": True,
            "post_id": result["post_id"],
            "permalink": result.get("permalink", ""),
            "published_at": datetime.now(timezone.utc).isoformat(),
            "type": publish_type,
        }

    except httpx.HTTPStatusError as exc:
        error_body = exc.response.text[:400]
        logger.error("instagram_publish_failed", status=exc.response.status_code, body=error_body)
        return {"success": False, "error": f"Meta API error {exc.response.status_code}: {error_body}"}
    except Exception as exc:
        logger.error("instagram_publish_error", error=str(exc))
        return {"success": False, "error": str(exc)}
