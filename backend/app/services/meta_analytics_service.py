"""
Meta Graph API service — Instagram Business analytics.

Fetches account insights, recent post performance, and best posting times
for tenants who have connected their Instagram Business account.

Token lifecycle:
  Short-lived (1h)  → exchanged for long-lived (60 days) at callback
  Long-lived (60d)  → stored in social_connections table
  Refresh: re-initiate OAuth when token_expires_at < now + 7 days
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from typing import Any
import uuid

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.social_connection import SocialConnection

logger = structlog.get_logger()

_GRAPH = "https://graph.facebook.com/v19.0"


# ── Token exchange ────────────────────────────────────────────────────────────

async def exchange_code_for_token(
    code: str,
    redirect_uri: str,
    app_id: str,
    app_secret: str,
) -> dict[str, Any]:
    """Exchange OAuth code for a long-lived access token."""
    async with httpx.AsyncClient(timeout=15) as client:
        # Step 1: short-lived token
        r = await client.get(f"{_GRAPH}/oauth/access_token", params={
            "client_id": app_id,
            "client_secret": app_secret,
            "redirect_uri": redirect_uri,
            "code": code,
        })
        r.raise_for_status()
        short = r.json()
        short_token = short["access_token"]

        # Step 2: exchange for long-lived (60 days)
        r2 = await client.get(f"{_GRAPH}/oauth/access_token", params={
            "grant_type": "fb_exchange_token",
            "client_id": app_id,
            "client_secret": app_secret,
            "fb_exchange_token": short_token,
        })
        r2.raise_for_status()
        long = r2.json()

    expires_in = long.get("expires_in", 5_184_000)  # default 60 days
    return {
        "access_token": long["access_token"],
        "token_type": long.get("token_type", "bearer"),
        "expires_at": datetime.now(timezone.utc) + timedelta(seconds=expires_in),
    }


async def get_ig_account(access_token: str) -> dict[str, Any]:
    """
    Fetch the user's Facebook Pages → find the connected Instagram Business account.
    Returns {page_id, page_name, ig_user_id, ig_username, followers_count, media_count}
    """
    async with httpx.AsyncClient(timeout=15) as client:
        # Get pages
        r = await client.get(f"{_GRAPH}/me/accounts", params={
            "access_token": access_token,
            "fields": "id,name,instagram_business_account",
        })
        r.raise_for_status()
        pages = r.json().get("data", [])

        for page in pages:
            ig = page.get("instagram_business_account")
            if not ig:
                continue

            ig_id = ig["id"]
            # Get IG profile
            r2 = await client.get(f"{_GRAPH}/{ig_id}", params={
                "access_token": access_token,
                "fields": "id,username,followers_count,media_count,biography,website",
            })
            r2.raise_for_status()
            profile = r2.json()

            return {
                "page_id": page["id"],
                "page_name": page["name"],
                "ig_user_id": ig_id,
                "ig_username": profile.get("username", ""),
                "followers_count": profile.get("followers_count"),
                "media_count": profile.get("media_count"),
            }

    raise ValueError("No Instagram Business account found on this Facebook account.")


# ── DB helpers ────────────────────────────────────────────────────────────────

async def save_connection(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    token_data: dict,
    ig_data: dict,
) -> SocialConnection:
    # Upsert: one connection per workspace per platform
    existing = await db.execute(
        select(SocialConnection).where(
            SocialConnection.workspace_id == workspace_id,
            SocialConnection.platform == "meta",
        )
    )
    conn = existing.scalar_one_or_none()
    if not conn:
        conn = SocialConnection(workspace_id=workspace_id, platform="meta")

    conn.access_token = token_data["access_token"]
    conn.token_type = token_data.get("token_type", "bearer")
    conn.token_expires_at = token_data["expires_at"]
    conn.ig_user_id = ig_data["ig_user_id"]
    conn.ig_username = ig_data["ig_username"]
    conn.page_id = ig_data["page_id"]
    conn.page_name = ig_data["page_name"]
    conn.followers_count = ig_data.get("followers_count")
    conn.media_count = ig_data.get("media_count")
    conn.is_active = True

    db.add(conn)
    await db.commit()
    await db.refresh(conn)
    return conn


async def get_connection(db: AsyncSession, workspace_id: uuid.UUID) -> SocialConnection | None:
    r = await db.execute(
        select(SocialConnection).where(
            SocialConnection.workspace_id == workspace_id,
            SocialConnection.platform == "meta",
            SocialConnection.is_active == True,
        )
    )
    return r.scalar_one_or_none()


# ── Analytics fetching ────────────────────────────────────────────────────────

async def fetch_account_insights(ig_user_id: str, access_token: str) -> dict[str, Any]:
    """Fetch 28-day account-level insights: reach, impressions, profile views."""
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(f"{_GRAPH}/{ig_user_id}/insights", params={
            "access_token": access_token,
            "metric": "reach,impressions,profile_views,follower_count",
            "period": "day",
            "since": int((datetime.now(timezone.utc) - timedelta(days=28)).timestamp()),
            "until": int(datetime.now(timezone.utc).timestamp()),
        })
        if r.status_code != 200:
            logger.warning("meta_insights_failed", status=r.status_code, body=r.text[:200])
            return {}
        data = r.json().get("data", [])

    result: dict[str, Any] = {}
    for metric in data:
        name = metric.get("name")
        values = metric.get("values", [])
        total = sum(v.get("value", 0) for v in values if isinstance(v.get("value"), (int, float)))
        result[name] = total

    return result


async def fetch_recent_media(ig_user_id: str, access_token: str, limit: int = 20) -> list[dict]:
    """Fetch recent posts with engagement metrics."""
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(f"{_GRAPH}/{ig_user_id}/media", params={
            "access_token": access_token,
            "fields": "id,media_type,timestamp,like_count,comments_count,caption",
            "limit": limit,
        })
        if r.status_code != 200:
            return []
        media = r.json().get("data", [])

        # Fetch insights for each post
        enriched = []
        for post in media[:limit]:
            try:
                ri = await client.get(f"{_GRAPH}/{post['id']}/insights", params={
                    "access_token": access_token,
                    "metric": "reach,impressions,saved,video_views",
                })
                if ri.status_code == 200:
                    for m in ri.json().get("data", []):
                        post[m["name"]] = m.get("values", [{}])[0].get("value", 0)
            except Exception:
                pass
            enriched.append(post)

    return enriched


def _compute_best_times(media: list[dict]) -> list[dict]:
    """Find the day+hour combos with highest average engagement."""
    slot_data: dict[tuple, list[int]] = defaultdict(list)

    for post in media:
        ts = post.get("timestamp", "")
        likes = post.get("like_count", 0) or 0
        comments = post.get("comments_count", 0) or 0
        reach = post.get("reach", 0) or 0
        score = likes + comments * 3 + int(reach * 0.01)

        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            slot_data[(dt.weekday(), dt.hour)].append(score)
        except Exception:
            continue

    if not slot_data:
        return []

    DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
    best = sorted(
        [(slot, sum(scores) / len(scores)) for slot, scores in slot_data.items()],
        key=lambda x: -x[1],
    )[:5]

    return [
        {
            "day": DAYS[day],
            "hour": f"{hour:02d}:00",
            "avg_engagement_score": round(score, 1),
            "sample_posts": len(slot_data[(day, hour)]),
        }
        for (day, hour), score in best
    ]


def _top_post_patterns(media: list[dict]) -> list[str]:
    """Extract patterns from top-performing posts."""
    if not media:
        return []

    scored = sorted(
        media,
        key=lambda p: (p.get("like_count", 0) or 0) + (p.get("comments_count", 0) or 0) * 3,
        reverse=True,
    )[:5]

    patterns = []
    type_counter: Counter = Counter()
    for p in scored:
        type_counter[p.get("media_type", "IMAGE")] += 1

    for media_type, count in type_counter.most_common(2):
        patterns.append(f"{media_type} formatı en çok engagement alıyor ({count}/5 top post)")

    return patterns


async def build_full_analytics(
    db: AsyncSession, workspace_id: uuid.UUID
) -> dict[str, Any] | None:
    """
    Fetch and cache complete analytics for a workspace.
    Returns structured analytics dict, or None if no connection exists.
    """
    conn = await get_connection(db, workspace_id)
    if not conn or not conn.access_token:
        return None

    # Check token expiry
    if conn.token_expires_at and conn.token_expires_at < datetime.now(timezone.utc) + timedelta(days=7):
        logger.warning("meta_token_expiring_soon", workspace_id=str(workspace_id),
                       expires_at=str(conn.token_expires_at))

    try:
        account = await fetch_account_insights(conn.ig_user_id, conn.access_token)
        media = await fetch_recent_media(conn.ig_user_id, conn.access_token)
        best_times = _compute_best_times(media)
        patterns = _top_post_patterns(media)

        analytics = {
            "ig_username": conn.ig_username,
            "followers_count": conn.followers_count,
            "media_count": conn.media_count,
            "account_28d": account,
            "recent_posts_count": len(media),
            "best_posting_times": best_times,
            "top_content_patterns": patterns,
            "top_posts": [
                {
                    "id": p["id"],
                    "media_type": p.get("media_type"),
                    "timestamp": p.get("timestamp"),
                    "likes": p.get("like_count", 0),
                    "comments": p.get("comments_count", 0),
                    "reach": p.get("reach", 0),
                    "caption_preview": (p.get("caption") or "")[:100],
                }
                for p in sorted(
                    media,
                    key=lambda x: (x.get("like_count", 0) or 0) + (x.get("comments_count", 0) or 0),
                    reverse=True,
                )[:5]
            ],
            "refreshed_at": datetime.now(timezone.utc).isoformat(),
        }

        # Cache in DB
        conn.cached_insights = json.dumps(analytics, ensure_ascii=False)
        conn.insights_updated_at = datetime.now(timezone.utc)
        conn.followers_count = conn.followers_count  # keep existing
        db.add(conn)
        await db.commit()

        return analytics

    except Exception as exc:
        logger.error("meta_analytics_failed", workspace_id=str(workspace_id), error=str(exc))

        # Return cached data if available
        if conn.cached_insights:
            try:
                return json.loads(conn.cached_insights)
            except Exception:
                pass
        return None


def build_instagram_analytics_prompt(analytics: dict[str, Any]) -> str:
    """
    Convert analytics into a prompt block injected into agent context.
    Agents use this to give data-driven recommendations.
    """
    if not analytics:
        return ""

    lines = ["## 📈 Instagram Business Analytics (real account data)\n"]

    username = analytics.get("ig_username", "")
    followers = analytics.get("followers_count")
    if username:
        lines.append(f"**Account**: @{username}" + (f" · {followers:,} followers" if followers else ""))

    account_28d = analytics.get("account_28d", {})
    if account_28d:
        reach = account_28d.get("reach", 0)
        impressions = account_28d.get("impressions", 0)
        profile_views = account_28d.get("profile_views", 0)
        lines.append(f"**Last 28 days**: {reach:,} reach · {impressions:,} impressions · {profile_views:,} profile views")

    best_times = analytics.get("best_posting_times", [])
    if best_times:
        lines.append("\n**Best posting times (data-driven, not estimates)**:")
        for slot in best_times[:3]:
            lines.append(f"  - {slot['day']} {slot['hour']} (avg engagement score: {slot['avg_engagement_score']})")

    patterns = analytics.get("top_content_patterns", [])
    if patterns:
        lines.append("\n**What works for this account**:")
        for p in patterns:
            lines.append(f"  - {p}")

    lines.append(
        "\n⚡ Use the best posting times above instead of generic estimates. "
        "Prioritise the content formats that this account's audience responds to."
    )

    return "\n".join(lines)
