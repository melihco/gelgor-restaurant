"""
Google Ads integration tools for CrewAI agents.

Provides tools for fetching campaign performance data and generating
optimization recommendations. Uses the GoogleAdsClient which automatically
falls back to mock data when SMART_AGENCY_MOCK=true.
"""

from __future__ import annotations

import json

from crewai.tools import BaseTool
from pydantic import BaseModel, Field

from app.integrations.google_ads_client import get_google_ads_client


class GoogleAdsCampaignInput(BaseModel):
    account_id: str = Field(description="Google Ads account/customer ID")
    date_range: str = Field(default="LAST_30_DAYS", description="GAQL date range: LAST_7_DAYS, LAST_30_DAYS, LAST_90_DAYS")


class GoogleAdsCampaignTool(BaseTool):
    name: str = "google_ads_campaigns"
    description: str = (
        "Fetches Google Ads campaign performance data including impressions, "
        "clicks, conversions, cost, and ROAS for analysis."
    )
    args_schema: type[BaseModel] = GoogleAdsCampaignInput

    def _run(self, account_id: str, date_range: str = "LAST_30_DAYS") -> str:
        client = get_google_ads_client(customer_id=account_id)
        campaigns = client.list_campaigns(date_range=date_range)

        return json.dumps({
            "account_id": account_id,
            "date_range": date_range,
            "campaigns": [c.to_dict() for c in campaigns],
            "total_cost": round(sum(c.cost for c in campaigns), 2),
            "total_conversions": sum(c.conversions for c in campaigns),
            "total_clicks": sum(c.clicks for c in campaigns),
        }, ensure_ascii=False, indent=2)


class GoogleAdsAdGroupInput(BaseModel):
    account_id: str = Field(description="Google Ads account/customer ID")
    campaign_id: str = Field(description="Campaign ID to fetch ad groups for")
    date_range: str = Field(default="LAST_30_DAYS", description="GAQL date range")


class GoogleAdsAdGroupTool(BaseTool):
    name: str = "google_ads_ad_groups"
    description: str = (
        "Fetches ad group performance data for a specific campaign, "
        "including impressions, clicks, conversions, and cost."
    )
    args_schema: type[BaseModel] = GoogleAdsAdGroupInput

    def _run(self, account_id: str, campaign_id: str, date_range: str = "LAST_30_DAYS") -> str:
        client = get_google_ads_client(customer_id=account_id)
        ad_groups = client.list_ad_groups(campaign_id=campaign_id, date_range=date_range)

        return json.dumps({
            "campaign_id": campaign_id,
            "ad_groups": [ag.to_dict() for ag in ad_groups],
        }, ensure_ascii=False, indent=2)


class GoogleAdsKeywordInput(BaseModel):
    account_id: str = Field(description="Google Ads account/customer ID")
    ad_group_id: str = Field(description="Ad group ID to fetch keywords for")
    date_range: str = Field(default="LAST_30_DAYS", description="GAQL date range")


class GoogleAdsKeywordTool(BaseTool):
    name: str = "google_ads_keywords"
    description: str = (
        "Fetches keyword performance data for a specific ad group, "
        "including search terms, quality scores, and conversion data."
    )
    args_schema: type[BaseModel] = GoogleAdsKeywordInput

    def _run(self, account_id: str, ad_group_id: str, date_range: str = "LAST_30_DAYS") -> str:
        client = get_google_ads_client(customer_id=account_id)
        keywords = client.list_keywords(ad_group_id=ad_group_id, date_range=date_range)

        return json.dumps({
            "ad_group_id": ad_group_id,
            "keywords": [kw.to_dict() for kw in keywords],
        }, ensure_ascii=False, indent=2)
