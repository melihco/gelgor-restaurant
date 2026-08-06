"""
Provider write endpoints used by the .NET action execution pipeline.

These endpoints are intentionally narrow: they expose approved write actions only
after the .NET side has performed tenant, approval, and integration checks.

Honesty policy (controlled pilot):
- Production / non-dev MUST NOT return fake success for Instagram schedule or
  Google review reply — real Graph / GBP writes are not wired here yet.
- Instant IG publish uses meta_publish_service via /api/v1/social (separate path).
- Development may simulate only when explicitly requested (?allow_simulate=1).
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.config import get_settings

router = APIRouter()


class GoogleReviewReplyRequest(BaseModel):
    account_id: str = ""
    review_id: str
    reply_text: str = Field(min_length=1)
    access_token: str = ""


class InstagramScheduleRequest(BaseModel):
    account_id: str = ""
    posts: list[dict] = Field(default_factory=list)
    access_token: str = ""


def _not_implemented(provider: str, message: str) -> dict:
    return {
        "success": False,
        "status": "not_implemented",
        "provider": provider,
        "message": message,
    }


@router.post("/google-business/reviews/reply")
async def reply_to_google_review(
    req: GoogleReviewReplyRequest,
    allow_simulate: bool = Query(False, description="Dev-only deterministic simulate"),
):
    settings = get_settings()

    if settings.is_development and allow_simulate:
        return {
            "success": True,
            "status": "simulated",
            "provider": "google_business",
            "account_id": req.account_id,
            "review_id": req.review_id,
            "reply_length": len(req.reply_text),
            "submitted_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "message": "Simulated review reply (development allow_simulate=1 only).",
        }

    if not req.access_token:
        return {
            "success": False,
            "status": "missing_credentials",
            "provider": "google_business",
            "message": "Google Business access token is required for review replies.",
        }

    # Real GBP reply API is not wired — never report submitted/success in prod.
    return _not_implemented(
        "google_business",
        "Google Business Profile review reply is not implemented. "
        "Do not treat action execution as a live write.",
    )


@router.post("/instagram/posts/schedule")
async def schedule_instagram_posts(
    req: InstagramScheduleRequest,
    allow_simulate: bool = Query(False, description="Dev-only deterministic simulate"),
):
    settings = get_settings()

    if not req.posts:
        return {
            "success": False,
            "status": "missing_posts",
            "provider": "instagram",
            "message": "At least one post is required.",
        }

    if settings.is_development and allow_simulate:
        scheduled = []
        for index, post in enumerate(req.posts, start=1):
            scheduled.append(
                {
                    "draft_id": f"ig_draft_{index}",
                    "status": "simulated",
                    "caption_preview": str(
                        post.get("caption_draft") or post.get("caption") or ""
                    )[:140],
                    "scheduled_time": post.get("posting_time_suggestion")
                    or post.get("schedule_time")
                    or "pending_manual_slot",
                }
            )
        return {
            "success": True,
            "status": "simulated",
            "provider": "instagram",
            "account_id": req.account_id,
            "scheduled": len(scheduled),
            "details": scheduled,
            "message": "Simulated Instagram schedule (development allow_simulate=1 only).",
        }

    if not req.access_token:
        return {
            "success": False,
            "status": "missing_credentials",
            "provider": "instagram",
            "message": "Meta access token is required for Instagram scheduling.",
        }

    # Real Graph schedule/publish container flow is not wired on this adapter.
    # Use Meta publish (social publish) for immediate posts instead.
    return _not_implemented(
        "instagram",
        "Instagram schedule adapter is not implemented for live writes. "
        "Use Meta publish for approved creatives, or keep ActionExecution in dry-run.",
    )
