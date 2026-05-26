"""
Post Scheduler Service — schedule and publish content to Instagram + Facebook.

Scheduled posts are stored in the scheduled_posts table.
APScheduler checks every 5 minutes and publishes posts whose scheduled_at has passed.

Platforms supported:
  - instagram: feed_image, reel, story_image, story_video
  - facebook: feed (image/video), story
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import select, and_, text
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()


# ── Schedule a post ──────────────────────────────────────────────────────────

async def schedule_post(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    platform: str,
    publish_type: str,
    scheduled_at: datetime,
    *,
    image_url: str | None = None,
    video_url: str | None = None,
    caption: str = "",
    hashtags: list[str] | None = None,
    artifact_title: str | None = None,
) -> dict[str, Any]:
    """Save a post to the schedule queue."""
    post_id = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO scheduled_posts
            (id, workspace_id, platform, publish_type, image_url, video_url,
             caption, hashtags, scheduled_at, artifact_title)
            VALUES (:id, :ws, :platform, :type, :img, :vid, :caption, :tags, :at, :title)
        """),
        {
            "id": post_id,
            "ws": workspace_id,
            "platform": platform,
            "type": publish_type,
            "img": image_url,
            "vid": video_url,
            "caption": caption,
            "tags": json.dumps(hashtags or []),
            "at": scheduled_at,
            "title": artifact_title,
        },
    )
    await db.commit()
    logger.info("post_scheduled", id=str(post_id), platform=platform, scheduled_at=str(scheduled_at))
    return {"id": str(post_id), "scheduled_at": scheduled_at.isoformat(), "status": "scheduled"}


async def get_scheduled_posts(db: AsyncSession, workspace_id: uuid.UUID) -> list[dict]:
    """List all scheduled posts for a workspace."""
    rows = await db.execute(
        text("""
            SELECT id, platform, publish_type, caption, scheduled_at,
                   status, post_id, permalink, error_message, artifact_title, created_at
            FROM scheduled_posts
            WHERE workspace_id = :ws
            ORDER BY scheduled_at ASC
        """),
        {"ws": workspace_id},
    )
    return [
        {
            "id": str(r[0]),
            "platform": r[1],
            "publish_type": r[2],
            "caption": (r[3] or "")[:100],
            "scheduled_at": r[4].isoformat() if r[4] else None,
            "status": r[5],
            "post_id": r[6],
            "permalink": r[7],
            "error_message": r[8],
            "artifact_title": r[9],
            "created_at": r[10].isoformat() if r[10] else None,
        }
        for r in rows
    ]


async def cancel_scheduled_post(db: AsyncSession, post_id: str, workspace_id: uuid.UUID) -> bool:
    """Cancel a scheduled post (only if still pending)."""
    result = await db.execute(
        text("""
            UPDATE scheduled_posts SET status = 'cancelled'
            WHERE id = :id AND workspace_id = :ws AND status = 'scheduled'
        """),
        {"id": uuid.UUID(post_id), "ws": workspace_id},
    )
    await db.commit()
    return result.rowcount > 0


# ── Process due posts ─────────────────────────────────────────────────────────

async def process_due_posts(db: AsyncSession) -> dict[str, int]:
    """
    Called by APScheduler every 5 minutes.
    Publishes all posts whose scheduled_at <= now and status = 'scheduled'.
    """
    from app.services.meta_analytics_service import get_connection
    from app.services.meta_publish_service import publish_to_instagram
    from app.services.facebook_publish_service import publish_to_facebook

    now = datetime.now(timezone.utc)
    rows = await db.execute(
        text("""
            SELECT id, workspace_id, platform, publish_type,
                   image_url, video_url, caption, hashtags
            FROM scheduled_posts
            WHERE status = 'scheduled' AND scheduled_at <= :now
            ORDER BY scheduled_at ASC
            LIMIT 20
        """),
        {"now": now},
    )
    posts = rows.fetchall()

    success = 0
    failed = 0

    for post in posts:
        post_uuid, ws_id, platform, publish_type, image_url, video_url, caption, hashtags_json = post
        hashtags = json.loads(hashtags_json or "[]")

        try:
            conn = await get_connection(db, ws_id)
            if not conn or not conn.access_token:
                raise ValueError("No social connection for this workspace")

            if platform == "instagram":
                result = await publish_to_instagram(
                    ig_user_id=conn.ig_user_id,
                    access_token=conn.access_token,
                    publish_type=publish_type,
                    image_url=image_url,
                    video_url=video_url,
                    caption=caption,
                    hashtags=hashtags,
                )
            elif platform == "facebook":
                result = await publish_to_facebook(
                    page_id=conn.page_id,
                    access_token=conn.access_token,
                    image_url=image_url,
                    video_url=video_url,
                    caption=caption,
                )
            else:
                raise ValueError(f"Unknown platform: {platform}")

            if result.get("success"):
                await db.execute(
                    text("""
                        UPDATE scheduled_posts SET
                            status = 'published', post_id = :pid,
                            permalink = :url, published_at = :now
                        WHERE id = :id
                    """),
                    {"pid": result.get("post_id"), "url": result.get("permalink"),
                     "now": now, "id": post_uuid},
                )
                success += 1
                logger.info("scheduled_post_published", id=str(post_uuid), platform=platform)
            else:
                raise ValueError(result.get("error", "Publish failed"))

        except Exception as exc:
            await db.execute(
                text("UPDATE scheduled_posts SET status = 'failed', error_message = :err WHERE id = :id"),
                {"err": str(exc)[:400], "id": post_uuid},
            )
            failed += 1
            logger.error("scheduled_post_failed", id=str(post_uuid), error=str(exc)[:200])

    if posts:
        await db.commit()

    return {"processed": len(posts), "success": success, "failed": failed}
