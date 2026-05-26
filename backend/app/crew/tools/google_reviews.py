"""
Google Business Reviews tool for CrewAI agents.

In production, this connects to the Google Business Profile API to fetch
real reviews. During development, it returns realistic mock data so the
full pipeline can be tested without API credentials.

The tool is registered with CrewAI's tool system so agents can call it
during task execution.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta

from crewai.tools import BaseTool
from pydantic import BaseModel, Field

# Sahte yorum listesi yalnızca SMART_AGENCY_FAKE_TOOL_DATA=true iken (yerel pipeline testi).
_FAKE_TOOL_DATA = os.getenv("SMART_AGENCY_FAKE_TOOL_DATA", "false").lower() in ("true", "1", "yes")


class GoogleReviewsInput(BaseModel):
    business_id: str = Field(description="Google Business Profile ID or location name")
    filter_status: str = Field(
        default="unanswered",
        description="Filter: 'unanswered', 'all', 'negative', 'recent'"
    )
    limit: int = Field(default=10, description="Maximum number of reviews to return")


class GoogleReviewsTool(BaseTool):
    name: str = "google_reviews_fetcher"
    description: str = (
        "Fetches Google Business reviews for a given business. "
        "Can filter by unanswered, negative, or recent reviews. "
        "Returns structured review data including reviewer name, rating, text, and date."
    )
    args_schema: type[BaseModel] = GoogleReviewsInput

    def _run(self, business_id: str, filter_status: str = "unanswered", limit: int = 10) -> str:
        """
        Fetch reviews. Returns [] until Google Business Profile API is wired.
        Set SMART_AGENCY_FAKE_TOOL_DATA=true for local test fixtures only.
        """
        if not _FAKE_TOOL_DATA:
            return json.dumps([], ensure_ascii=False)
        reviews = self._get_mock_reviews(business_id, filter_status, limit)
        return json.dumps(reviews, ensure_ascii=False, indent=2)

    def _get_mock_reviews(self, business_id: str, filter_status: str, limit: int) -> list[dict]:
        """Realistic mock reviews for development and testing."""
        mock_reviews = [
            {
                "review_id": "rev_001",
                "reviewer_name": "Ahmet Y.",
                "rating": 1,
                "date": (datetime.now() - timedelta(hours=3)).isoformat(),
                "text": "Yarım saat beklettiler, sipariş yanlış geldi. Garson ilgisizdi. Bir daha gelmem.",
                "is_answered": False,
                "language": "tr",
            },
            {
                "review_id": "rev_002",
                "reviewer_name": "Sarah M.",
                "rating": 5,
                "date": (datetime.now() - timedelta(hours=8)).isoformat(),
                "text": "Amazing experience! The atmosphere was wonderful and the staff was incredibly friendly. Will definitely come back.",
                "is_answered": False,
                "language": "en",
            },
            {
                "review_id": "rev_003",
                "reviewer_name": "Elif K.",
                "rating": 3,
                "date": (datetime.now() - timedelta(days=1)).isoformat(),
                "text": "Yemekler güzeldi ama fiyatlar biraz yüksek. Porsiyon boyutları da küçülmüş sanki. Mekan güzel ama biraz gürültülü.",
                "is_answered": False,
                "language": "tr",
            },
            {
                "review_id": "rev_004",
                "reviewer_name": "Mehmet A.",
                "rating": 2,
                "date": (datetime.now() - timedelta(days=2)).isoformat(),
                "text": "Rezervasyon yaptırmama rağmen masa hazır değildi. 20 dakika ayakta bekledik. Yemekler fena değildi ama bu deneyim çok kötüydü.",
                "is_answered": False,
                "language": "tr",
            },
            {
                "review_id": "rev_005",
                "reviewer_name": "Laura B.",
                "rating": 5,
                "date": (datetime.now() - timedelta(days=3)).isoformat(),
                "text": "Best brunch in the city! The avocado toast was perfect and the coffee selection is impressive. The terrace view is gorgeous.",
                "is_answered": False,
                "language": "en",
            },
            {
                "review_id": "rev_006",
                "reviewer_name": "Can T.",
                "rating": 4,
                "date": (datetime.now() - timedelta(days=4)).isoformat(),
                "text": "Genel olarak memnun kaldım. Servis hızlıydı, kahvaltı tabağı doyurucuydu. Tek eksiği park sorunu.",
                "is_answered": True,
                "language": "tr",
            },
        ]

        if filter_status == "unanswered":
            mock_reviews = [r for r in mock_reviews if not r["is_answered"]]
        elif filter_status == "negative":
            mock_reviews = [r for r in mock_reviews if r["rating"] <= 2]
        elif filter_status == "recent":
            mock_reviews = sorted(mock_reviews, key=lambda r: r["date"], reverse=True)

        return mock_reviews[:limit]


class GoogleReviewResponderTool(BaseTool):
    """
    Posts a response to a Google review.
    In development, this is a no-op that logs the action.
    In production, this would use the Google Business Profile API.
    """

    name: str = "google_review_responder"
    description: str = "Posts an approved response to a Google Business review."

    def _run(self, review_id: str, response_text: str) -> str:
        return json.dumps({
            "status": "simulated",
            "review_id": review_id,
            "message": "Response would be posted to Google Business Profile in production.",
            "response_preview": response_text[:100] + "..." if len(response_text) > 100 else response_text,
        })
