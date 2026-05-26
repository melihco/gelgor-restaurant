"""
GA4 Analytics tool for CrewAI agents.
Provides traffic, conversion, and audience data for analysis.
"""

from __future__ import annotations

import json

from crewai.tools import BaseTool
from pydantic import BaseModel, Field

from app.integrations.ga4_client import get_ga4_client


class GA4TrafficInput(BaseModel):
    date_range: str = Field(default="30daysAgo", description="GA4 date range: 7daysAgo, 30daysAgo, 90daysAgo")


class GA4TrafficSummaryTool(BaseTool):
    name: str = "ga4_traffic_summary"
    description: str = (
        "Fetches website traffic summary from Google Analytics 4: "
        "total users, sessions, pageviews, bounce rate, average session duration."
    )
    args_schema: type[BaseModel] = GA4TrafficInput

    def _run(self, date_range: str = "30daysAgo") -> str:
        client = get_ga4_client()
        summary = client.get_traffic_summary(date_range=date_range)
        return json.dumps(summary.to_dict(), ensure_ascii=False, indent=2)


class GA4TrafficSourcesTool(BaseTool):
    name: str = "ga4_traffic_sources"
    description: str = (
        "Fetches traffic source breakdown from GA4: "
        "which channels (organic, paid, social, direct) bring the most users."
    )
    args_schema: type[BaseModel] = GA4TrafficInput

    def _run(self, date_range: str = "30daysAgo") -> str:
        client = get_ga4_client()
        sources = client.get_traffic_sources(date_range=date_range)
        return json.dumps(
            {"sources": [s.to_dict() for s in sources]},
            ensure_ascii=False, indent=2,
        )


class GA4ConversionsTool(BaseTool):
    name: str = "ga4_conversions"
    description: str = (
        "Fetches conversion event data from GA4: "
        "form submissions, phone clicks, bookings, newsletter signups."
    )
    args_schema: type[BaseModel] = GA4TrafficInput

    def _run(self, date_range: str = "30daysAgo") -> str:
        client = get_ga4_client()
        conversions = client.get_conversions(date_range=date_range)
        return json.dumps(
            {"conversions": [c.to_dict() for c in conversions]},
            ensure_ascii=False, indent=2,
        )


class GA4PagePerformanceTool(BaseTool):
    name: str = "ga4_page_performance"
    description: str = (
        "Fetches page-level performance from GA4: "
        "pageviews, time on page, bounce rate per page."
    )
    args_schema: type[BaseModel] = GA4TrafficInput

    def _run(self, date_range: str = "30daysAgo") -> str:
        client = get_ga4_client()
        pages = client.get_page_performance(date_range=date_range)
        return json.dumps(
            {"pages": [p.to_dict() for p in pages]},
            ensure_ascii=False, indent=2,
        )
