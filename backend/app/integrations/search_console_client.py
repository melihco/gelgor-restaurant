"""
Google Search Console API client.

Fetches search queries, page performance, and indexing data.
Falls back to mock data when SMART_AGENCY_MOCK=true.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import structlog

logger = structlog.get_logger()

_MOCK_MODE = os.getenv("SMART_AGENCY_MOCK", "true").lower() in ("true", "1", "yes")


@dataclass
class SearchQuery:
    query: str
    impressions: int
    clicks: int
    ctr: float
    position: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "query": self.query,
            "impressions": self.impressions,
            "clicks": self.clicks,
            "ctr": round(self.ctr, 2),
            "position": round(self.position, 1),
        }


@dataclass
class PageSearchData:
    page: str
    impressions: int
    clicks: int
    ctr: float
    position: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "page": self.page,
            "impressions": self.impressions,
            "clicks": self.clicks,
            "ctr": round(self.ctr, 2),
            "position": round(self.position, 1),
        }


@dataclass
class DeviceBreakdown:
    device: str
    impressions: int
    clicks: int
    ctr: float
    position: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "device": self.device,
            "impressions": self.impressions,
            "clicks": self.clicks,
            "ctr": round(self.ctr, 2),
            "position": round(self.position, 1),
        }


@dataclass
class CountryBreakdown:
    country: str
    impressions: int
    clicks: int
    ctr: float
    position: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "country": self.country,
            "impressions": self.impressions,
            "clicks": self.clicks,
            "ctr": round(self.ctr, 2),
            "position": round(self.position, 1),
        }


@dataclass
class DailySearchMetric:
    date: str
    impressions: int
    clicks: int
    ctr: float
    position: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "date": self.date,
            "impressions": self.impressions,
            "clicks": self.clicks,
            "ctr": round(self.ctr, 2),
            "position": round(self.position, 1),
        }


class SearchConsoleClient:
    """
    Wrapper around Google Search Console API.
    Falls back to mock data when SMART_AGENCY_MOCK=true.
    """

    def __init__(self, site_url: str, credentials_json: str = ""):
        self.site_url = site_url
        self._credentials_json = credentials_json
        self._service: Any = None

    def _get_service(self) -> Any:
        if self._service is not None:
            return self._service

        from googleapiclient.discovery import build
        from google.oauth2 import service_account
        import json

        if self._credentials_json:
            creds_dict = json.loads(self._credentials_json)
            credentials = service_account.Credentials.from_service_account_info(
                creds_dict,
                scopes=["https://www.googleapis.com/auth/webmasters.readonly"],
            )
            self._service = build("searchconsole", "v1", credentials=credentials)
        else:
            self._service = build("searchconsole", "v1")

        return self._service

    def _query(
        self,
        dimensions: list[str],
        start_date: str = "2026-03-06",
        end_date: str = "2026-04-04",
        row_limit: int = 25,
    ) -> list[dict]:
        service = self._get_service()
        body = {
            "startDate": start_date,
            "endDate": end_date,
            "dimensions": dimensions,
            "rowLimit": row_limit,
        }
        response = service.searchanalytics().query(siteUrl=self.site_url, body=body).execute()
        return response.get("rows", [])

    def get_top_queries(self, start_date: str = "2026-03-06", end_date: str = "2026-04-04", limit: int = 25) -> list[SearchQuery]:
        if _MOCK_MODE:
            return self._mock_queries()

        rows = self._query(["query"], start_date, end_date, limit)
        return [
            SearchQuery(
                query=r["keys"][0],
                impressions=r.get("impressions", 0),
                clicks=r.get("clicks", 0),
                ctr=r.get("ctr", 0) * 100,
                position=r.get("position", 0),
            )
            for r in rows
        ]

    def get_page_performance(self, start_date: str = "2026-03-06", end_date: str = "2026-04-04", limit: int = 15) -> list[PageSearchData]:
        if _MOCK_MODE:
            return self._mock_pages()

        rows = self._query(["page"], start_date, end_date, limit)
        return [
            PageSearchData(
                page=r["keys"][0],
                impressions=r.get("impressions", 0),
                clicks=r.get("clicks", 0),
                ctr=r.get("ctr", 0) * 100,
                position=r.get("position", 0),
            )
            for r in rows
        ]

    def get_device_breakdown(self, start_date: str = "2026-03-06", end_date: str = "2026-04-04") -> list[DeviceBreakdown]:
        if _MOCK_MODE:
            return self._mock_devices()

        rows = self._query(["device"], start_date, end_date, 10)
        return [
            DeviceBreakdown(
                device=r["keys"][0],
                impressions=r.get("impressions", 0),
                clicks=r.get("clicks", 0),
                ctr=r.get("ctr", 0) * 100,
                position=r.get("position", 0),
            )
            for r in rows
        ]

    def get_country_breakdown(self, start_date: str = "2026-03-06", end_date: str = "2026-04-04", limit: int = 10) -> list[CountryBreakdown]:
        if _MOCK_MODE:
            return self._mock_countries()

        rows = self._query(["country"], start_date, end_date, limit)
        return [
            CountryBreakdown(
                country=r["keys"][0],
                impressions=r.get("impressions", 0),
                clicks=r.get("clicks", 0),
                ctr=r.get("ctr", 0) * 100,
                position=r.get("position", 0),
            )
            for r in rows
        ]

    def get_daily_metrics(self, start_date: str = "2026-03-06", end_date: str = "2026-04-04") -> list[DailySearchMetric]:
        if _MOCK_MODE:
            return self._mock_daily()

        rows = self._query(["date"], start_date, end_date, 90)
        return [
            DailySearchMetric(
                date=r["keys"][0],
                impressions=r.get("impressions", 0),
                clicks=r.get("clicks", 0),
                ctr=r.get("ctr", 0) * 100,
                position=r.get("position", 0),
            )
            for r in rows
        ]

    # ── Mock Data ─────────────────────────────────────────────────────────────

    @staticmethod
    def _mock_queries() -> list[SearchQuery]:
        return [
            SearchQuery("etkinlik organizasyonu bodrum", 4200, 380, 9.05, 3.2),
            SearchQuery("bodrum düğün mekanları", 3800, 290, 7.63, 4.1),
            SearchQuery("sunu event", 2400, 820, 34.17, 1.2),
            SearchQuery("bodrum parti organizasyonu", 1900, 145, 7.63, 5.8),
            SearchQuery("kurumsal etkinlik bodrum", 1600, 120, 7.50, 4.5),
            SearchQuery("bodrum organizasyon firmaları", 1400, 95, 6.79, 6.2),
            SearchQuery("açık hava düğün bodrum", 1200, 88, 7.33, 7.1),
            SearchQuery("bodrum etkinlik mekanları", 1100, 72, 6.55, 8.3),
            SearchQuery("nişan organizasyonu bodrum", 980, 68, 6.94, 5.4),
            SearchQuery("bodrum doğum günü organizasyonu", 850, 52, 6.12, 9.1),
            SearchQuery("beach party bodrum", 780, 45, 5.77, 10.2),
            SearchQuery("bodrum event planner", 650, 38, 5.85, 7.8),
            SearchQuery("deniz kenarı düğün", 580, 32, 5.52, 11.4),
            SearchQuery("bodrum konsept parti", 520, 28, 5.38, 8.9),
            SearchQuery("festival organizasyonu", 480, 22, 4.58, 12.5),
        ]

    @staticmethod
    def _mock_pages() -> list[PageSearchData]:
        return [
            PageSearchData("https://sunuevent.com/", 18500, 2100, 11.35, 4.2),
            PageSearchData("https://sunuevent.com/etkinlikler", 8200, 680, 8.29, 5.8),
            PageSearchData("https://sunuevent.com/dugun-organizasyonu", 6400, 520, 8.13, 3.9),
            PageSearchData("https://sunuevent.com/kurumsal", 4100, 310, 7.56, 6.1),
            PageSearchData("https://sunuevent.com/galeri", 3200, 240, 7.50, 7.4),
            PageSearchData("https://sunuevent.com/blog", 2800, 180, 6.43, 8.2),
            PageSearchData("https://sunuevent.com/iletisim", 2400, 320, 13.33, 3.1),
            PageSearchData("https://sunuevent.com/fiyatlar", 1900, 210, 11.05, 5.5),
        ]

    @staticmethod
    def _mock_devices() -> list[DeviceBreakdown]:
        return [
            DeviceBreakdown("MOBILE", 32000, 2800, 8.75, 5.8),
            DeviceBreakdown("DESKTOP", 14000, 1400, 10.00, 4.2),
            DeviceBreakdown("TABLET", 2500, 180, 7.20, 6.5),
        ]

    @staticmethod
    def _mock_countries() -> list[CountryBreakdown]:
        return [
            CountryBreakdown("TUR", 42000, 3800, 9.05, 5.1),
            CountryBreakdown("GBR", 2400, 180, 7.50, 8.2),
            CountryBreakdown("DEU", 1800, 120, 6.67, 9.4),
            CountryBreakdown("USA", 1200, 85, 7.08, 10.1),
            CountryBreakdown("NLD", 800, 52, 6.50, 11.8),
        ]

    @staticmethod
    def _mock_daily() -> list[DailySearchMetric]:
        import random
        from datetime import datetime, timedelta
        base = datetime(2026, 3, 6)
        return [
            DailySearchMetric(
                date=(base + timedelta(days=i)).strftime("%Y-%m-%d"),
                impressions=random.randint(1200, 2200),
                clicks=random.randint(80, 200),
                ctr=random.uniform(5.0, 12.0),
                position=random.uniform(4.0, 8.0),
            )
            for i in range(30)
        ]


def get_search_console_client(site_url: str = "", credentials_json: str = "") -> SearchConsoleClient:
    from app.config import get_settings
    s = get_settings()
    return SearchConsoleClient(
        site_url=site_url or s.search_console_site_url,
        credentials_json=credentials_json or s.ga4_credentials_json,
    )
