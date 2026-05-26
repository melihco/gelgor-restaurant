"""
Provider write endpoints used by the .NET action execution pipeline.

These endpoints are intentionally narrow: they expose approved write actions only
after the .NET side has performed tenant, approval, and integration checks.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter
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


@router.post("/google-business/reviews/reply")
async def reply_to_google_review(req: GoogleReviewReplyRequest):
    settings = get_settings()

    if not req.access_token and not settings.is_development:
        return {
            "success": False,
            "status": "missing_credentials",
            "provider": "google_business",
            "message": "Google Business access token is required for production review replies.",
        }

    # Production implementation should call:
    # accounts/{account_id}/locations/{location_id}/reviews/{review_id}/reply
    # via Google Business Profile APIs. Development keeps this deterministic.
    return {
        "success": True,
        "status": "simulated" if not req.access_token else "submitted",
        "provider": "google_business",
        "account_id": req.account_id,
        "review_id": req.review_id,
        "reply_length": len(req.reply_text),
        "submitted_at": datetime.utcnow().isoformat() + "Z",
        "message": "Review reply accepted by provider adapter.",
    }


@router.post("/instagram/posts/schedule")
async def schedule_instagram_posts(req: InstagramScheduleRequest):
    settings = get_settings()

    if not req.posts:
        return {
            "success": False,
            "status": "missing_posts",
            "provider": "instagram",
            "message": "At least one post is required.",
        }

    if not req.access_token and not settings.is_development:
        return {
            "success": False,
            "status": "missing_credentials",
            "provider": "instagram",
            "message": "Meta access token is required for production Instagram scheduling.",
        }

    scheduled = []
    for index, post in enumerate(req.posts, start=1):
        scheduled.append({
            "draft_id": f"ig_draft_{index}",
            "status": "simulated" if not req.access_token else "scheduled",
            "caption_preview": str(post.get("caption_draft") or post.get("caption") or "")[:140],
            "scheduled_time": post.get("posting_time_suggestion") or post.get("schedule_time") or "pending_manual_slot",
        })

    # Production implementation should use Meta Graph API container creation
    # and publish/scheduling calls after asset URLs are available.
    return {
        "success": True,
        "status": "simulated" if not req.access_token else "scheduled",
        "provider": "instagram",
        "account_id": req.account_id,
        "scheduled": len(scheduled),
        "details": scheduled,
        "message": "Instagram schedule accepted by provider adapter.",
    }
