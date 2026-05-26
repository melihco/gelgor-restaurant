"""
Analytics API — serves GA4 and Search Console data to the frontend.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.integrations.ga4_client import get_ga4_client
from app.integrations.search_console_client import get_search_console_client
from app.integrations.roi_attribution import generate_roi_report

router = APIRouter()


# ── GA4 ───────────────────────────────────────────────────────────────────────


@router.get("/traffic/summary")
async def traffic_summary(date_range: str = Query("30daysAgo")):
    client = get_ga4_client()
    summary = client.get_traffic_summary(date_range=date_range)
    return summary.to_dict()


@router.get("/traffic/sources")
async def traffic_sources(date_range: str = Query("30daysAgo"), limit: int = Query(10)):
    client = get_ga4_client()
    sources = client.get_traffic_sources(date_range=date_range, limit=limit)
    return {"sources": [s.to_dict() for s in sources]}


@router.get("/traffic/pages")
async def page_performance(date_range: str = Query("30daysAgo"), limit: int = Query(15)):
    client = get_ga4_client()
    pages = client.get_page_performance(date_range=date_range, limit=limit)
    return {"pages": [p.to_dict() for p in pages]}


@router.get("/traffic/conversions")
async def conversions(date_range: str = Query("30daysAgo")):
    client = get_ga4_client()
    events = client.get_conversions(date_range=date_range)
    return {"conversions": [e.to_dict() for e in events]}


@router.get("/traffic/realtime")
async def realtime():
    client = get_ga4_client()
    data = client.get_realtime()
    return data.to_dict()


@router.get("/traffic/daily")
async def daily_metrics(date_range: str = Query("30daysAgo")):
    client = get_ga4_client()
    metrics = client.get_daily_metrics(date_range=date_range)
    return {"daily": [m.to_dict() for m in metrics]}


# ── Search Console ────────────────────────────────────────────────────────────


@router.get("/search/queries")
async def search_queries(limit: int = Query(25)):
    client = get_search_console_client()
    queries = client.get_top_queries(limit=limit)
    return {"queries": [q.to_dict() for q in queries]}


@router.get("/search/pages")
async def search_pages(limit: int = Query(15)):
    client = get_search_console_client()
    pages = client.get_page_performance(limit=limit)
    return {"pages": [p.to_dict() for p in pages]}


@router.get("/search/devices")
async def search_devices():
    client = get_search_console_client()
    devices = client.get_device_breakdown()
    return {"devices": [d.to_dict() for d in devices]}


@router.get("/search/countries")
async def search_countries(limit: int = Query(10)):
    client = get_search_console_client()
    countries = client.get_country_breakdown(limit=limit)
    return {"countries": [c.to_dict() for c in countries]}


@router.get("/search/daily")
async def search_daily():
    client = get_search_console_client()
    daily = client.get_daily_metrics()
    return {"daily": [d.to_dict() for d in daily]}


# ── Combined Dashboard ────────────────────────────────────────────────────────


@router.get("/dashboard")
async def analytics_dashboard(date_range: str = Query("30daysAgo")):
    """Single endpoint for the visitor dashboard — combines all data sources."""
    ga4 = get_ga4_client()
    sc = get_search_console_client()

    traffic = ga4.get_traffic_summary(date_range=date_range)
    sources = ga4.get_traffic_sources(date_range=date_range, limit=8)
    pages = ga4.get_page_performance(date_range=date_range, limit=8)
    conversion_events = ga4.get_conversions(date_range=date_range)
    realtime = ga4.get_realtime()
    daily = ga4.get_daily_metrics(date_range=date_range)

    queries = sc.get_top_queries(limit=15)
    devices = sc.get_device_breakdown()
    countries = sc.get_country_breakdown(limit=5)

    return {
        "traffic": traffic.to_dict(),
        "sources": [s.to_dict() for s in sources],
        "pages": [p.to_dict() for p in pages],
        "conversions": [e.to_dict() for e in conversion_events],
        "realtime": realtime.to_dict(),
        "daily": [m.to_dict() for m in daily],
        "search_queries": [q.to_dict() for q in queries],
        "devices": [d.to_dict() for d in devices],
        "countries": [c.to_dict() for c in countries],
    }


# ── ROI Attribution ───────────────────────────────────────────────────────────


@router.get("/roi")
async def roi_attribution(date_range: str = Query("LAST_30_DAYS")):
    """Cross-channel ROI report combining Ads spend + GA4 conversions."""
    report = generate_roi_report(date_range=date_range)
    return report.to_dict()
