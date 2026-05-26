"""
Remarketing audience builder.

Creates Google Ads remarketing lists based on GA4 audience segments.
Bridges visitor analytics data to advertising targeting.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import structlog

logger = structlog.get_logger()

_MOCK_MODE = os.getenv("SMART_AGENCY_MOCK", "true").lower() in ("true", "1", "yes")


@dataclass
class AudienceRule:
    """A single condition that defines a segment of visitors."""
    dimension: str  # e.g., "page_path", "source", "event_name", "days_since_visit"
    operator: str   # "equals", "contains", "greater_than", "less_than"
    value: str


@dataclass
class AudienceSegment:
    name: str
    description: str
    rules: list[AudienceRule]
    membership_duration_days: int = 30
    estimated_size: int = 0


@dataclass
class RemarketingListResult:
    success: bool
    list_id: str = ""
    list_name: str = ""
    estimated_size: int = 0
    error: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "list_id": self.list_id,
            "list_name": self.list_name,
            "estimated_size": self.estimated_size,
            "error": self.error,
        }


# Pre-built audience templates for common remarketing scenarios
AUDIENCE_TEMPLATES: dict[str, AudienceSegment] = {
    "cart_abandoners": AudienceSegment(
        name="Sepet Terk Edenler",
        description="Fiyat sayfasını ziyaret edip form doldurmayan kullanıcılar",
        rules=[
            AudienceRule("page_path", "contains", "/fiyatlar"),
            AudienceRule("event_name", "not_equals", "form_submit"),
        ],
        membership_duration_days=14,
        estimated_size=850,
    ),
    "recent_visitors_no_conversion": AudienceSegment(
        name="Son 7 Gün — Dönüşüm Yok",
        description="Son 7 günde gelen ama hiçbir dönüşüm yapmayan kullanıcılar",
        rules=[
            AudienceRule("days_since_visit", "less_than", "8"),
            AudienceRule("event_name", "not_equals", "form_submit"),
            AudienceRule("event_name", "not_equals", "phone_click"),
        ],
        membership_duration_days=7,
        estimated_size=2400,
    ),
    "high_intent_visitors": AudienceSegment(
        name="Yüksek Niyetli Ziyaretçiler",
        description="İletişim veya fiyat sayfasını ziyaret eden kullanıcılar",
        rules=[
            AudienceRule("page_path", "contains", "/iletisim"),
            AudienceRule("page_path", "contains", "/fiyatlar"),
        ],
        membership_duration_days=30,
        estimated_size=1200,
    ),
    "gallery_viewers": AudienceSegment(
        name="Galeri İnceleyenler",
        description="Galeri sayfasını en az 60 saniye inceleyen kullanıcılar",
        rules=[
            AudienceRule("page_path", "contains", "/galeri"),
            AudienceRule("time_on_page", "greater_than", "60"),
        ],
        membership_duration_days=30,
        estimated_size=1800,
    ),
    "blog_readers": AudienceSegment(
        name="Blog Okuyucuları",
        description="Blog içeriklerini okuyan kullanıcılar",
        rules=[
            AudienceRule("page_path", "contains", "/blog"),
            AudienceRule("time_on_page", "greater_than", "120"),
        ],
        membership_duration_days=60,
        estimated_size=950,
    ),
    "organic_searchers": AudienceSegment(
        name="Organik Arama — Marka Kelimeleri",
        description="Google aramadan marka kelimesiyle gelen kullanıcılar",
        rules=[
            AudienceRule("source", "equals", "google"),
            AudienceRule("medium", "equals", "organic"),
        ],
        membership_duration_days=30,
        estimated_size=3200,
    ),
    "social_engagers": AudienceSegment(
        name="Sosyal Medya Ziyaretçileri",
        description="Instagram veya Facebook'tan gelen kullanıcılar",
        rules=[
            AudienceRule("source", "contains", "instagram"),
            AudienceRule("source", "contains", "facebook"),
        ],
        membership_duration_days=30,
        estimated_size=1500,
    ),
}


class RemarketingBuilder:
    """
    Builds Google Ads remarketing audiences from GA4 segments.
    """

    def __init__(self, google_ads_customer_id: str = ""):
        self.customer_id = google_ads_customer_id

    def list_templates(self) -> list[dict[str, Any]]:
        return [
            {
                "template_id": tid,
                "name": seg.name,
                "description": seg.description,
                "estimated_size": seg.estimated_size,
                "duration_days": seg.membership_duration_days,
                "rule_count": len(seg.rules),
            }
            for tid, seg in AUDIENCE_TEMPLATES.items()
        ]

    def create_audience(self, template_id: str) -> RemarketingListResult:
        """Create a remarketing list from a pre-built template."""
        template = AUDIENCE_TEMPLATES.get(template_id)
        if not template:
            return RemarketingListResult(success=False, error=f"Unknown template: {template_id}")

        return self._create_remarketing_list(template)

    def create_custom_audience(self, segment: AudienceSegment) -> RemarketingListResult:
        """Create a remarketing list from a custom segment definition."""
        return self._create_remarketing_list(segment)

    def _create_remarketing_list(self, segment: AudienceSegment) -> RemarketingListResult:
        if _MOCK_MODE:
            logger.info("mock_remarketing_list_created", name=segment.name, size=segment.estimated_size)
            return RemarketingListResult(
                success=True,
                list_id=f"rmkt_{segment.name.lower().replace(' ', '_')[:20]}",
                list_name=segment.name,
                estimated_size=segment.estimated_size,
            )

        try:
            from app.integrations.google_ads_client import get_google_ads_client

            client = get_google_ads_client(customer_id=self.customer_id)
            ads_client = client._get_client()
            user_list_service = ads_client.get_service("UserListService")

            operation = ads_client.get_type("UserListOperation")
            user_list = operation.create
            user_list.name = segment.name
            user_list.description = segment.description
            user_list.membership_life_span = segment.membership_duration_days
            user_list.membership_status = ads_client.enums.UserListMembershipStatusEnum.OPEN

            rule_based = user_list.rule_based_user_list
            rule_based.prepopulation_status = ads_client.enums.UserListPrepopulationStatusEnum.REQUESTED

            result = user_list_service.mutate_user_lists(
                customer_id=self.customer_id,
                operations=[operation],
            )

            resource_name = result.results[0].resource_name
            list_id = resource_name.split("/")[-1]

            return RemarketingListResult(
                success=True,
                list_id=list_id,
                list_name=segment.name,
                estimated_size=segment.estimated_size,
            )
        except Exception as e:
            logger.error("remarketing_list_failed", error=str(e))
            return RemarketingListResult(success=False, error=str(e))


def get_remarketing_builder(customer_id: str = "") -> RemarketingBuilder:
    from app.config import get_settings
    s = get_settings()
    return RemarketingBuilder(
        google_ads_customer_id=customer_id or s.google_ads_customer_id,
    )
