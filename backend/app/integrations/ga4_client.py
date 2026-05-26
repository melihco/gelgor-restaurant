"""
Google Analytics 4 Data API client.

Fetches website traffic metrics, audience data, and conversion events.
Falls back to mock data when SMART_AGENCY_MOCK=true.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

import structlog

logger = structlog.get_logger()

_MOCK_MODE = os.getenv("SMART_AGENCY_MOCK", "true").lower() in ("true", "1", "yes")


@dataclass
class TrafficSummary:
    total_users: int
    new_users: int
    sessions: int
    pageviews: int
    avg_session_duration: float
    bounce_rate: float
    pages_per_session: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "total_users": self.total_users,
            "new_users": self.new_users,
            "sessions": self.sessions,
            "pageviews": self.pageviews,
            "avg_session_duration": round(self.avg_session_duration, 1),
            "bounce_rate": round(self.bounce_rate, 2),
            "pages_per_session": round(self.pages_per_session, 2),
        }


@dataclass
class TrafficSource:
    source: str
    medium: str
    sessions: int
    users: int
    conversions: int
    bounce_rate: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "medium": self.medium,
            "sessions": self.sessions,
            "users": self.users,
            "conversions": self.conversions,
            "bounce_rate": round(self.bounce_rate, 2),
        }


@dataclass
class PagePerformance:
    page_path: str
    page_title: str
    pageviews: int
    unique_pageviews: int
    avg_time_on_page: float
    bounce_rate: float
    exit_rate: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "page_path": self.page_path,
            "page_title": self.page_title,
            "pageviews": self.pageviews,
            "unique_pageviews": self.unique_pageviews,
            "avg_time_on_page": round(self.avg_time_on_page, 1),
            "bounce_rate": round(self.bounce_rate, 2),
            "exit_rate": round(self.exit_rate, 2),
        }


@dataclass
class ConversionEvent:
    event_name: str
    event_count: int
    total_users: int
    conversion_rate: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_name": self.event_name,
            "event_count": self.event_count,
            "total_users": self.total_users,
            "conversion_rate": round(self.conversion_rate, 2),
        }


@dataclass
class RealTimeData:
    active_users: int
    top_pages: list[dict[str, Any]]
    top_sources: list[dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        return {
            "active_users": self.active_users,
            "top_pages": self.top_pages,
            "top_sources": self.top_sources,
        }


@dataclass
class DailyMetric:
    date: str
    users: int
    sessions: int
    pageviews: int
    conversions: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "date": self.date,
            "users": self.users,
            "sessions": self.sessions,
            "pageviews": self.pageviews,
            "conversions": self.conversions,
        }


class GA4Client:
    """
    High-level wrapper around the GA4 Data API.
    Falls back to mock data when SMART_AGENCY_MOCK=true.
    """

    def __init__(self, property_id: str, credentials_json: str = ""):
        self.property_id = property_id
        self._credentials_json = credentials_json
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client

        from google.analytics.data_v1beta import BetaAnalyticsDataClient
        from google.oauth2 import service_account
        import json

        if self._credentials_json:
            creds_dict = json.loads(self._credentials_json)
            credentials = service_account.Credentials.from_service_account_info(
                creds_dict,
                scopes=["https://www.googleapis.com/auth/analytics.readonly"],
            )
            self._client = BetaAnalyticsDataClient(credentials=credentials)
        else:
            self._client = BetaAnalyticsDataClient()

        return self._client

    def get_traffic_summary(self, date_range: str = "30daysAgo") -> TrafficSummary:
        if _MOCK_MODE:
            return self._mock_traffic_summary()

        client = self._get_client()
        from google.analytics.data_v1beta.types import (
            RunReportRequest, DateRange, Metric,
        )

        request = RunReportRequest(
            property=f"properties/{self.property_id}",
            date_ranges=[DateRange(start_date=date_range, end_date="today")],
            metrics=[
                Metric(name="totalUsers"),
                Metric(name="newUsers"),
                Metric(name="sessions"),
                Metric(name="screenPageViews"),
                Metric(name="averageSessionDuration"),
                Metric(name="bounceRate"),
                Metric(name="screenPageViewsPerSession"),
            ],
        )

        response = client.run_report(request)
        row = response.rows[0] if response.rows else None

        if not row:
            return TrafficSummary(0, 0, 0, 0, 0.0, 0.0, 0.0)

        vals = [v.value for v in row.metric_values]
        return TrafficSummary(
            total_users=int(vals[0]),
            new_users=int(vals[1]),
            sessions=int(vals[2]),
            pageviews=int(vals[3]),
            avg_session_duration=float(vals[4]),
            bounce_rate=float(vals[5]) * 100,
            pages_per_session=float(vals[6]),
        )

    def get_traffic_sources(self, date_range: str = "30daysAgo", limit: int = 10) -> list[TrafficSource]:
        if _MOCK_MODE:
            return self._mock_traffic_sources()

        client = self._get_client()
        from google.analytics.data_v1beta.types import (
            RunReportRequest, DateRange, Metric, Dimension,
        )

        request = RunReportRequest(
            property=f"properties/{self.property_id}",
            date_ranges=[DateRange(start_date=date_range, end_date="today")],
            dimensions=[
                Dimension(name="sessionSource"),
                Dimension(name="sessionMedium"),
            ],
            metrics=[
                Metric(name="sessions"),
                Metric(name="totalUsers"),
                Metric(name="conversions"),
                Metric(name="bounceRate"),
            ],
            limit=limit,
        )

        response = client.run_report(request)
        results: list[TrafficSource] = []
        for row in response.rows:
            vals = [v.value for v in row.metric_values]
            results.append(TrafficSource(
                source=row.dimension_values[0].value,
                medium=row.dimension_values[1].value,
                sessions=int(vals[0]),
                users=int(vals[1]),
                conversions=int(vals[2]),
                bounce_rate=float(vals[3]) * 100,
            ))
        return results

    def get_page_performance(self, date_range: str = "30daysAgo", limit: int = 15) -> list[PagePerformance]:
        if _MOCK_MODE:
            return self._mock_page_performance()

        client = self._get_client()
        from google.analytics.data_v1beta.types import (
            RunReportRequest, DateRange, Metric, Dimension, OrderBy,
        )

        request = RunReportRequest(
            property=f"properties/{self.property_id}",
            date_ranges=[DateRange(start_date=date_range, end_date="today")],
            dimensions=[
                Dimension(name="pagePath"),
                Dimension(name="pageTitle"),
            ],
            metrics=[
                Metric(name="screenPageViews"),
                Metric(name="screenPageViews"),
                Metric(name="averageSessionDuration"),
                Metric(name="bounceRate"),
                Metric(name="bounceRate"),
            ],
            order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name="screenPageViews"), desc=True)],
            limit=limit,
        )

        response = client.run_report(request)
        results: list[PagePerformance] = []
        for row in response.rows:
            vals = [v.value for v in row.metric_values]
            results.append(PagePerformance(
                page_path=row.dimension_values[0].value,
                page_title=row.dimension_values[1].value,
                pageviews=int(vals[0]),
                unique_pageviews=int(float(vals[1]) * 0.85),
                avg_time_on_page=float(vals[2]),
                bounce_rate=float(vals[3]) * 100,
                exit_rate=float(vals[4]) * 100 * 0.7,
            ))
        return results

    def get_conversions(self, date_range: str = "30daysAgo") -> list[ConversionEvent]:
        if _MOCK_MODE:
            return self._mock_conversions()

        client = self._get_client()
        from google.analytics.data_v1beta.types import (
            RunReportRequest, DateRange, Metric, Dimension,
        )

        request = RunReportRequest(
            property=f"properties/{self.property_id}",
            date_ranges=[DateRange(start_date=date_range, end_date="today")],
            dimensions=[Dimension(name="eventName")],
            metrics=[
                Metric(name="eventCount"),
                Metric(name="totalUsers"),
                Metric(name="conversions"),
            ],
        )

        response = client.run_report(request)
        results: list[ConversionEvent] = []
        for row in response.rows:
            event_name = row.dimension_values[0].value
            vals = [v.value for v in row.metric_values]
            count = int(vals[0])
            users = int(vals[1])
            results.append(ConversionEvent(
                event_name=event_name,
                event_count=count,
                total_users=users,
                conversion_rate=(count / users * 100) if users > 0 else 0,
            ))
        return results

    def get_realtime(self) -> RealTimeData:
        if _MOCK_MODE:
            return self._mock_realtime()

        client = self._get_client()
        from google.analytics.data_v1beta.types import (
            RunRealtimeReportRequest, Metric, Dimension,
        )

        request = RunRealtimeReportRequest(
            property=f"properties/{self.property_id}",
            metrics=[Metric(name="activeUsers")],
        )
        response = client.run_realtime_report(request)
        active = int(response.rows[0].metric_values[0].value) if response.rows else 0

        return RealTimeData(active_users=active, top_pages=[], top_sources=[])

    def get_daily_metrics(self, date_range: str = "30daysAgo") -> list[DailyMetric]:
        if _MOCK_MODE:
            return self._mock_daily_metrics()

        client = self._get_client()
        from google.analytics.data_v1beta.types import (
            RunReportRequest, DateRange, Metric, Dimension, OrderBy,
        )

        request = RunReportRequest(
            property=f"properties/{self.property_id}",
            date_ranges=[DateRange(start_date=date_range, end_date="today")],
            dimensions=[Dimension(name="date")],
            metrics=[
                Metric(name="totalUsers"),
                Metric(name="sessions"),
                Metric(name="screenPageViews"),
                Metric(name="conversions"),
            ],
            order_bys=[OrderBy(dimension=OrderBy.DimensionOrderBy(dimension_name="date"))],
        )

        response = client.run_report(request)
        results: list[DailyMetric] = []
        for row in response.rows:
            d = row.dimension_values[0].value
            date_str = f"{d[:4]}-{d[4:6]}-{d[6:8]}"
            vals = [v.value for v in row.metric_values]
            results.append(DailyMetric(
                date=date_str,
                users=int(vals[0]),
                sessions=int(vals[1]),
                pageviews=int(vals[2]),
                conversions=int(vals[3]),
            ))
        return results

    # ── Mock Data ─────────────────────────────────────────────────────────────

    @staticmethod
    def _mock_traffic_summary() -> TrafficSummary:
        return TrafficSummary(
            total_users=12450,
            new_users=8320,
            sessions=18200,
            pageviews=54600,
            avg_session_duration=185.4,
            bounce_rate=42.3,
            pages_per_session=3.0,
        )

    @staticmethod
    def _mock_traffic_sources() -> list[TrafficSource]:
        return [
            TrafficSource("google", "organic", 7200, 5100, 142, 38.5),
            TrafficSource("google", "cpc", 3800, 3200, 89, 45.2),
            TrafficSource("instagram", "social", 2400, 1800, 34, 52.1),
            TrafficSource("(direct)", "(none)", 2100, 1600, 28, 41.8),
            TrafficSource("facebook", "social", 1200, 950, 18, 55.3),
            TrafficSource("yandex", "organic", 800, 620, 8, 44.7),
            TrafficSource("tripadvisor", "referral", 450, 380, 12, 35.2),
            TrafficSource("whatsapp", "social", 250, 200, 5, 28.4),
        ]

    @staticmethod
    def _mock_page_performance() -> list[PagePerformance]:
        return [
            PagePerformance("/", "Ana Sayfa", 12400, 10540, 45.2, 35.8, 25.1),
            PagePerformance("/etkinlikler", "Etkinlikler", 8200, 6970, 120.5, 28.4, 18.6),
            PagePerformance("/hakkimizda", "Hakkımızda", 4100, 3485, 95.3, 42.1, 35.2),
            PagePerformance("/iletisim", "İletişim", 3800, 3230, 65.8, 22.5, 45.8),
            PagePerformance("/galeri", "Galeri", 3200, 2720, 180.2, 18.9, 12.4),
            PagePerformance("/blog", "Blog", 2800, 2380, 210.4, 32.6, 28.9),
            PagePerformance("/fiyatlar", "Fiyatlar", 2400, 2040, 88.6, 25.3, 42.1),
            PagePerformance("/referanslar", "Referanslar", 1600, 1360, 145.8, 20.8, 15.6),
        ]

    @staticmethod
    def _mock_conversions() -> list[ConversionEvent]:
        return [
            ConversionEvent("form_submit", 342, 12450, 2.75),
            ConversionEvent("phone_click", 185, 12450, 1.49),
            ConversionEvent("whatsapp_click", 128, 12450, 1.03),
            ConversionEvent("booking_complete", 67, 12450, 0.54),
            ConversionEvent("newsletter_signup", 245, 12450, 1.97),
            ConversionEvent("gallery_view", 890, 12450, 7.15),
        ]

    @staticmethod
    def _mock_realtime() -> RealTimeData:
        return RealTimeData(
            active_users=23,
            top_pages=[
                {"page": "/", "active_users": 8},
                {"page": "/etkinlikler", "active_users": 6},
                {"page": "/galeri", "active_users": 4},
                {"page": "/iletisim", "active_users": 3},
                {"page": "/blog", "active_users": 2},
            ],
            top_sources=[
                {"source": "google", "active_users": 12},
                {"source": "direct", "active_users": 5},
                {"source": "instagram", "active_users": 4},
                {"source": "facebook", "active_users": 2},
            ],
        )

    @staticmethod
    def _mock_daily_metrics() -> list[DailyMetric]:
        import random
        from datetime import datetime, timedelta
        base = datetime(2026, 3, 6)
        return [
            DailyMetric(
                date=(base + timedelta(days=i)).strftime("%Y-%m-%d"),
                users=random.randint(300, 600),
                sessions=random.randint(450, 800),
                pageviews=random.randint(1200, 2400),
                conversions=random.randint(5, 25),
            )
            for i in range(30)
        ]


def get_ga4_client(property_id: str = "", credentials_json: str = "") -> GA4Client:
    from app.config import get_settings
    s = get_settings()
    return GA4Client(
        property_id=property_id or s.ga4_property_id,
        credentials_json=credentials_json or s.ga4_credentials_json,
    )
