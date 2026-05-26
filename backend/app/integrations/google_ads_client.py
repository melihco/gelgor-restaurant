"""
Google Ads API client.

Wraps the google-ads Python library to provide high-level helpers
for fetching campaign data, mutating budgets, and managing ad creatives.

When SMART_AGENCY_MOCK=true (default in development), all methods return
realistic mock data without calling the API.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any

import structlog

logger = structlog.get_logger()

_MOCK_MODE = os.getenv("SMART_AGENCY_MOCK", "true").lower() in ("true", "1", "yes")


@dataclass
class CampaignMetrics:
    campaign_id: str
    name: str
    campaign_type: str
    status: str
    budget_daily: float
    impressions: int
    clicks: int
    ctr: float
    avg_cpc: float
    conversions: int
    cost: float
    conversion_rate: float
    roas: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "campaign_id": self.campaign_id,
            "name": self.name,
            "type": self.campaign_type,
            "status": self.status,
            "budget_daily": self.budget_daily,
            "impressions": self.impressions,
            "clicks": self.clicks,
            "ctr": round(self.ctr, 2),
            "avg_cpc": round(self.avg_cpc, 2),
            "conversions": self.conversions,
            "cost": round(self.cost, 2),
            "conversion_rate": round(self.conversion_rate, 2),
            "roas": round(self.roas, 2),
        }


@dataclass
class AdGroupMetrics:
    ad_group_id: str
    name: str
    campaign_id: str
    status: str
    impressions: int
    clicks: int
    ctr: float
    avg_cpc: float
    conversions: int
    cost: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "ad_group_id": self.ad_group_id,
            "name": self.name,
            "campaign_id": self.campaign_id,
            "status": self.status,
            "impressions": self.impressions,
            "clicks": self.clicks,
            "ctr": round(self.ctr, 2),
            "avg_cpc": round(self.avg_cpc, 2),
            "conversions": self.conversions,
            "cost": round(self.cost, 2),
        }


@dataclass
class KeywordMetrics:
    keyword_id: str
    keyword_text: str
    match_type: str
    ad_group_id: str
    impressions: int
    clicks: int
    ctr: float
    avg_cpc: float
    conversions: int
    quality_score: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "keyword_id": self.keyword_id,
            "keyword_text": self.keyword_text,
            "match_type": self.match_type,
            "ad_group_id": self.ad_group_id,
            "impressions": self.impressions,
            "clicks": self.clicks,
            "ctr": round(self.ctr, 2),
            "avg_cpc": round(self.avg_cpc, 2),
            "conversions": self.conversions,
            "quality_score": self.quality_score,
        }


@dataclass
class MutateResult:
    success: bool
    resource_name: str = ""
    error: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {"success": self.success, "resource_name": self.resource_name, "error": self.error}


class GoogleAdsClient:
    """
    High-level wrapper around the Google Ads API.
    Falls back to mock data when SMART_AGENCY_MOCK=true.
    """

    def __init__(
        self,
        customer_id: str,
        developer_token: str = "",
        client_id: str = "",
        client_secret: str = "",
        refresh_token: str = "",
    ):
        self.customer_id = customer_id.replace("-", "")
        self._developer_token = developer_token
        self._client_id = client_id
        self._client_secret = client_secret
        self._refresh_token = refresh_token
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client

        from google.ads.googleads.client import GoogleAdsClient as _GAClient

        self._client = _GAClient.load_from_dict({
            "developer_token": self._developer_token,
            "client_id": self._client_id,
            "client_secret": self._client_secret,
            "refresh_token": self._refresh_token,
            "use_proto_plus": True,
        })
        return self._client

    # ── Campaigns ─────────────────────────────────────────────────────────────

    def list_campaigns(self, date_range: str = "LAST_30_DAYS") -> list[CampaignMetrics]:
        if _MOCK_MODE:
            return self._mock_campaigns()

        client = self._get_client()
        ga_service = client.get_service("GoogleAdsService")

        query = f"""
            SELECT
                campaign.id,
                campaign.name,
                campaign.advertising_channel_type,
                campaign.status,
                campaign_budget.amount_micros,
                metrics.impressions,
                metrics.clicks,
                metrics.ctr,
                metrics.average_cpc,
                metrics.conversions,
                metrics.cost_micros,
                metrics.all_conversions_from_interactions_rate,
                metrics.conversions_value
            FROM campaign
            WHERE segments.date DURING {date_range}
                AND campaign.status != 'REMOVED'
            ORDER BY metrics.cost_micros DESC
        """

        results: list[CampaignMetrics] = []
        stream = ga_service.search_stream(customer_id=self.customer_id, query=query)

        for batch in stream:
            for row in batch.results:
                cost = row.metrics.cost_micros / 1_000_000
                conv_value = row.metrics.conversions_value
                roas = (conv_value / cost) if cost > 0 else 0.0

                results.append(CampaignMetrics(
                    campaign_id=str(row.campaign.id),
                    name=row.campaign.name,
                    campaign_type=row.campaign.advertising_channel_type.name,
                    status=row.campaign.status.name,
                    budget_daily=row.campaign_budget.amount_micros / 1_000_000,
                    impressions=row.metrics.impressions,
                    clicks=row.metrics.clicks,
                    ctr=row.metrics.ctr * 100,
                    avg_cpc=row.metrics.average_cpc / 1_000_000,
                    conversions=int(row.metrics.conversions),
                    cost=cost,
                    conversion_rate=row.metrics.all_conversions_from_interactions_rate * 100,
                    roas=round(roas, 2),
                ))

        logger.info("google_ads_campaigns_fetched", count=len(results), customer=self.customer_id)
        return results

    # ── Ad Groups ─────────────────────────────────────────────────────────────

    def list_ad_groups(self, campaign_id: str, date_range: str = "LAST_30_DAYS") -> list[AdGroupMetrics]:
        if _MOCK_MODE:
            return self._mock_ad_groups(campaign_id)

        client = self._get_client()
        ga_service = client.get_service("GoogleAdsService")

        query = f"""
            SELECT
                ad_group.id, ad_group.name, ad_group.campaign, ad_group.status,
                metrics.impressions, metrics.clicks, metrics.ctr,
                metrics.average_cpc, metrics.conversions, metrics.cost_micros
            FROM ad_group
            WHERE campaign.id = {campaign_id}
                AND segments.date DURING {date_range}
            ORDER BY metrics.cost_micros DESC
        """

        results: list[AdGroupMetrics] = []
        stream = ga_service.search_stream(customer_id=self.customer_id, query=query)
        for batch in stream:
            for row in batch.results:
                results.append(AdGroupMetrics(
                    ad_group_id=str(row.ad_group.id),
                    name=row.ad_group.name,
                    campaign_id=campaign_id,
                    status=row.ad_group.status.name,
                    impressions=row.metrics.impressions,
                    clicks=row.metrics.clicks,
                    ctr=row.metrics.ctr * 100,
                    avg_cpc=row.metrics.average_cpc / 1_000_000,
                    conversions=int(row.metrics.conversions),
                    cost=row.metrics.cost_micros / 1_000_000,
                ))
        return results

    # ── Keywords ──────────────────────────────────────────────────────────────

    def list_keywords(self, ad_group_id: str, date_range: str = "LAST_30_DAYS") -> list[KeywordMetrics]:
        if _MOCK_MODE:
            return self._mock_keywords(ad_group_id)

        client = self._get_client()
        ga_service = client.get_service("GoogleAdsService")

        query = f"""
            SELECT
                ad_group_criterion.criterion_id,
                ad_group_criterion.keyword.text,
                ad_group_criterion.keyword.match_type,
                metrics.impressions, metrics.clicks, metrics.ctr,
                metrics.average_cpc, metrics.conversions,
                ad_group_criterion.quality_info.quality_score
            FROM keyword_view
            WHERE ad_group.id = {ad_group_id}
                AND segments.date DURING {date_range}
            ORDER BY metrics.impressions DESC
        """

        results: list[KeywordMetrics] = []
        stream = ga_service.search_stream(customer_id=self.customer_id, query=query)
        for batch in stream:
            for row in batch.results:
                qs = row.ad_group_criterion.quality_info.quality_score
                results.append(KeywordMetrics(
                    keyword_id=str(row.ad_group_criterion.criterion_id),
                    keyword_text=row.ad_group_criterion.keyword.text,
                    match_type=row.ad_group_criterion.keyword.match_type.name,
                    ad_group_id=ad_group_id,
                    impressions=row.metrics.impressions,
                    clicks=row.metrics.clicks,
                    ctr=row.metrics.ctr * 100,
                    avg_cpc=row.metrics.average_cpc / 1_000_000,
                    conversions=int(row.metrics.conversions),
                    quality_score=qs if qs > 0 else None,
                ))
        return results

    # ── Mutations ─────────────────────────────────────────────────────────────

    def update_campaign_budget(self, campaign_id: str, new_daily_budget: float) -> MutateResult:
        if _MOCK_MODE:
            logger.info("mock_budget_update", campaign_id=campaign_id, budget=new_daily_budget)
            return MutateResult(
                success=True,
                resource_name=f"customers/{self.customer_id}/campaignBudgets/{campaign_id}",
            )

        client = self._get_client()
        campaign_budget_service = client.get_service("CampaignBudgetService")
        ga_service = client.get_service("GoogleAdsService")

        budget_query = f"""
            SELECT campaign_budget.resource_name, campaign_budget.amount_micros
            FROM campaign_budget
            WHERE campaign.id = {campaign_id}
            LIMIT 1
        """
        response = ga_service.search(customer_id=self.customer_id, query=budget_query)
        budget_resource = None
        for row in response:
            budget_resource = row.campaign_budget.resource_name

        if not budget_resource:
            return MutateResult(success=False, error=f"Budget not found for campaign {campaign_id}")

        budget_operation = client.get_type("CampaignBudgetOperation")
        budget = budget_operation.update
        budget.resource_name = budget_resource
        budget.amount_micros = int(new_daily_budget * 1_000_000)

        field_mask = client.get_type("FieldMask")
        field_mask.paths.append("amount_micros")
        budget_operation.update_mask.CopyFrom(field_mask)

        try:
            result = campaign_budget_service.mutate_campaign_budgets(
                customer_id=self.customer_id, operations=[budget_operation]
            )
            return MutateResult(success=True, resource_name=result.results[0].resource_name)
        except Exception as e:
            logger.error("budget_update_failed", error=str(e))
            return MutateResult(success=False, error=str(e))

    def set_campaign_status(self, campaign_id: str, status: str) -> MutateResult:
        """Set campaign status: ENABLED, PAUSED, or REMOVED."""
        if _MOCK_MODE:
            logger.info("mock_campaign_status", campaign_id=campaign_id, status=status)
            return MutateResult(
                success=True,
                resource_name=f"customers/{self.customer_id}/campaigns/{campaign_id}",
            )

        client = self._get_client()
        campaign_service = client.get_service("CampaignService")

        operation = client.get_type("CampaignOperation")
        campaign = operation.update
        campaign.resource_name = f"customers/{self.customer_id}/campaigns/{campaign_id}"
        campaign.status = client.enums.CampaignStatusEnum[status].value

        field_mask = client.get_type("FieldMask")
        field_mask.paths.append("status")
        operation.update_mask.CopyFrom(field_mask)

        try:
            result = campaign_service.mutate_campaigns(
                customer_id=self.customer_id, operations=[operation]
            )
            return MutateResult(success=True, resource_name=result.results[0].resource_name)
        except Exception as e:
            logger.error("campaign_status_failed", error=str(e))
            return MutateResult(success=False, error=str(e))

    def create_responsive_search_ad(
        self,
        ad_group_id: str,
        headlines: list[str],
        descriptions: list[str],
        final_url: str,
    ) -> MutateResult:
        if _MOCK_MODE:
            logger.info("mock_create_rsa", ad_group_id=ad_group_id, headlines=len(headlines))
            return MutateResult(
                success=True,
                resource_name=f"customers/{self.customer_id}/adGroupAds/mock_rsa",
            )

        client = self._get_client()
        ad_group_ad_service = client.get_service("AdGroupAdService")

        operation = client.get_type("AdGroupAdOperation")
        ad_group_ad = operation.create
        ad_group_ad.ad_group = f"customers/{self.customer_id}/adGroups/{ad_group_id}"
        ad_group_ad.status = client.enums.AdGroupAdStatusEnum.PAUSED

        ad = ad_group_ad.ad
        ad.final_urls.append(final_url)

        for headline in headlines[:15]:
            asset = client.get_type("AdTextAsset")
            asset.text = headline
            ad.responsive_search_ad.headlines.append(asset)

        for desc in descriptions[:4]:
            asset = client.get_type("AdTextAsset")
            asset.text = desc
            ad.responsive_search_ad.descriptions.append(asset)

        try:
            result = ad_group_ad_service.mutate_ad_group_ads(
                customer_id=self.customer_id, operations=[operation]
            )
            return MutateResult(success=True, resource_name=result.results[0].resource_name)
        except Exception as e:
            logger.error("rsa_create_failed", error=str(e))
            return MutateResult(success=False, error=str(e))

    # ── Mock Data ─────────────────────────────────────────────────────────────

    @staticmethod
    def _mock_campaigns() -> list[CampaignMetrics]:
        return [
            CampaignMetrics("camp_001", "Marka Bilinirliği — İstanbul", "SEARCH", "ENABLED", 150.0, 45200, 1850, 4.09, 2.35, 42, 4347.50, 2.27, 3.2),
            CampaignMetrics("camp_002", "Retargeting — Websitesi Ziyaretçileri", "DISPLAY", "ENABLED", 75.0, 120000, 960, 0.80, 1.85, 28, 1776.0, 2.92, 4.8),
            CampaignMetrics("camp_003", "Yerel Hizmetler — Yakınımdaki", "SEARCH", "ENABLED", 200.0, 28500, 2100, 7.37, 3.10, 85, 6510.0, 4.05, 5.1),
            CampaignMetrics("camp_004", "Bahar Menüsü Tanıtımı", "SEARCH", "ENABLED", 120.0, 18400, 720, 3.91, 2.08, 31, 1497.6, 4.31, 3.8),
            CampaignMetrics("camp_005", "Instagram Awareness", "DISPLAY", "PAUSED", 90.0, 68400, 2450, 3.58, 0.89, 42, 2180.5, 1.71, 2.1),
        ]

    @staticmethod
    def _mock_ad_groups(campaign_id: str) -> list[AdGroupMetrics]:
        return [
            AdGroupMetrics(f"ag_{campaign_id}_1", "Genel Anahtar Kelimeler", campaign_id, "ENABLED", 12500, 520, 4.16, 2.10, 15, 1092.0),
            AdGroupMetrics(f"ag_{campaign_id}_2", "Marka Anahtar Kelimeleri", campaign_id, "ENABLED", 8200, 680, 8.29, 1.45, 22, 986.0),
            AdGroupMetrics(f"ag_{campaign_id}_3", "Rakip Hedefleme", campaign_id, "ENABLED", 5800, 190, 3.28, 3.20, 5, 608.0),
        ]

    @staticmethod
    def _mock_keywords(ad_group_id: str) -> list[KeywordMetrics]:
        return [
            KeywordMetrics(f"kw_{ad_group_id}_1", "etkinlik organizasyonu bodrum", "BROAD", ad_group_id, 3200, 180, 5.63, 1.95, 8, 7),
            KeywordMetrics(f"kw_{ad_group_id}_2", "düğün organizasyonu", "PHRASE", ad_group_id, 2800, 120, 4.29, 2.40, 5, 8),
            KeywordMetrics(f"kw_{ad_group_id}_3", "bodrum parti mekan", "EXACT", ad_group_id, 1500, 95, 6.33, 1.80, 4, 9),
            KeywordMetrics(f"kw_{ad_group_id}_4", "etkinlik planlama", "BROAD", ad_group_id, 4100, 85, 2.07, 3.10, 2, 5),
        ]


def get_google_ads_client(
    customer_id: str = "",
    developer_token: str = "",
    client_id: str = "",
    client_secret: str = "",
    refresh_token: str = "",
) -> GoogleAdsClient:
    """Factory that reads credentials from settings if not provided."""
    from app.config import get_settings
    s = get_settings()

    return GoogleAdsClient(
        customer_id=customer_id or s.google_ads_customer_id or s.google_business_account_id,
        developer_token=developer_token or s.google_ads_developer_token,
        client_id=client_id or s.google_ads_client_id,
        client_secret=client_secret or s.google_ads_client_secret,
        refresh_token=refresh_token or s.google_ads_refresh_token,
    )
