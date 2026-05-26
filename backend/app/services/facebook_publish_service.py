"""
Facebook Publishing Service — posts to Facebook Pages.

Uses the same Meta access token as Instagram (linked via Facebook Page).
The token must have: pages_manage_posts, pages_read_engagement permissions.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx
import structlog

logger = structlog.get_logger()

_GRAPH = "https://graph.facebook.com/v19.0"


async def publish_to_facebook(
    page_id: str,
    access_token: str,
    *,
    image_url: str | None = None,
    video_url: str | None = None,
    caption: str = "",
) -> dict[str, Any]:
    """
    Publish a post to a Facebook Page.
    Returns {"success": True, "post_id": "...", "permalink": "..."}
    """
    if not page_id:
        return {"success": False, "error": "Facebook Page ID not available. Reconnect Instagram."}

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            if video_url:
                # Video post
                r = await client.post(
                    f"{_GRAPH}/{page_id}/videos",
                    data={
                        "access_token": access_token,
                        "file_url": video_url,
                        "description": caption,
                    },
                )
            elif image_url:
                # Photo post
                r = await client.post(
                    f"{_GRAPH}/{page_id}/photos",
                    data={
                        "access_token": access_token,
                        "url": image_url,
                        "caption": caption,
                    },
                )
            else:
                # Text only
                r = await client.post(
                    f"{_GRAPH}/{page_id}/feed",
                    data={
                        "access_token": access_token,
                        "message": caption,
                    },
                )

            r.raise_for_status()
            data = r.json()
            post_id = data.get("post_id") or data.get("id", "")

            # Get permalink
            permalink = f"https://www.facebook.com/{post_id}" if post_id else ""

            logger.info("facebook_published", page_id=page_id, post_id=post_id)

            return {
                "success": True,
                "post_id": post_id,
                "permalink": permalink,
                "published_at": datetime.now(timezone.utc).isoformat(),
                "platform": "facebook",
            }

    except httpx.HTTPStatusError as exc:
        error = exc.response.text[:300]
        logger.error("facebook_publish_failed", status=exc.response.status_code, body=error)
        return {"success": False, "error": f"Facebook API error {exc.response.status_code}: {error}"}
    except Exception as exc:
        logger.error("facebook_publish_error", error=str(exc))
        return {"success": False, "error": str(exc)}
