"""
Instagram / Meta integration tools for CrewAI agents.

Provides tools for:
- Fetching account insights and recent posts
- Analyzing post performance
- Preparing content for publishing (drafts, not direct publish)

In production, connects to Meta Graph API.
In development, returns realistic mock data.
"""

from __future__ import annotations

import json
import os

from crewai.tools import BaseTool
from pydantic import BaseModel, Field

_FAKE_TOOL_DATA = os.getenv("SMART_AGENCY_FAKE_TOOL_DATA", "false").lower() in ("true", "1", "yes")


class InstagramInsightsInput(BaseModel):
    account_id: str = Field(description="Instagram Business account ID")
    period: str = Field(default="last_30_days", description="Time period for insights")


class InstagramInsightsTool(BaseTool):
    name: str = "instagram_insights"
    description: str = (
        "Fetches Instagram account insights including follower count, "
        "engagement rate, top performing content, and audience demographics."
    )
    args_schema: type[BaseModel] = InstagramInsightsInput

    def _run(self, account_id: str, period: str = "last_30_days") -> str:
        if not _FAKE_TOOL_DATA:
            return json.dumps(
                {
                    "account_id": account_id,
                    "period": period,
                    "status": "not_connected",
                    "message": (
                        "Instagram Graph API bağlı değil; gerçek metrik yok. "
                        "Entegrasyonu bağlayın veya yalnızca yerel test için SMART_AGENCY_FAKE_TOOL_DATA=true kullanın."
                    ),
                },
                ensure_ascii=False,
                indent=2,
            )
        return json.dumps({
            "account_id": account_id,
            "period": period,
            "followers": 12450,
            "following": 890,
            "posts_count": 342,
            "avg_engagement_rate": 4.2,
            "avg_likes": 520,
            "avg_comments": 35,
            "top_performing_content_types": ["carousel", "reel", "single_image"],
            "best_posting_times": ["12:00-14:00", "19:00-21:00"],
            "audience_demographics": {
                "age_groups": {"18-24": 15, "25-34": 42, "35-44": 28, "45-54": 10, "55+": 5},
                "gender": {"female": 58, "male": 42},
                "top_cities": ["Istanbul", "Ankara", "Izmir"],
            },
            "recent_posts_performance": [
                {"type": "carousel", "likes": 680, "comments": 45, "saves": 120, "shares": 30},
                {"type": "reel", "likes": 1200, "comments": 89, "saves": 250, "shares": 95},
                {"type": "single_image", "likes": 350, "comments": 22, "saves": 45, "shares": 12},
            ],
            "note": "Fake fixture (SMART_AGENCY_FAKE_TOOL_DATA=true)",
        }, ensure_ascii=False, indent=2)


class InstagramContentPrepareTool(BaseTool):
    """
    Prepares content for Instagram publishing.
    Does NOT publish directly — creates a draft package that goes through
    the approval workflow before any publishing action.
    """

    name: str = "instagram_content_prepare"
    description: str = (
        "Prepares an Instagram content package (image specs, caption, hashtags, "
        "scheduling suggestion) for approval. Does not publish directly."
    )

    def _run(self, content_type: str, caption: str, hashtags: str,
             visual_direction: str, schedule_time: str = "") -> str:
        return json.dumps({
            "status": "draft_created",
            "content_package": {
                "content_type": content_type,
                "caption": caption,
                "hashtags": hashtags,
                "visual_direction": visual_direction,
                "suggested_schedule": schedule_time or "pending_approval",
                "requires_assets": True,
                "approval_required": True,
            },
            "message": "Content package prepared for human approval.",
        }, ensure_ascii=False, indent=2)
