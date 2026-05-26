"""
Event Intelligence Service — fetches real upcoming events from Eventbrite API
and Biletix (via web search fallback) and injects them into Industry Calendar.

Enables urgency scoring: "Bu hafta sonu Bodrum'da 3 konser var → içerik aciliyeti HIGH"

Priority order:
  1. Eventbrite API — structured JSON, filterable by city + category + date
  2. Web search (Tavily/Brave/Perplexity) — finds Biletix listings + local event pages
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import structlog

logger = structlog.get_logger()

_EVENTBRITE_API = "https://www.eventbriteapi.com/v3"

# City name → Eventbrite location text (used in queries)
_CITY_MAP: dict[str, str] = {
    "bodrum": "Bodrum",
    "istanbul": "Istanbul",
    "izmir": "Izmir",
    "ankara": "Ankara",
    "antalya": "Antalya",
    "muğla": "Mugla",
    "fethiye": "Fethiye",
}

# Eventbrite category IDs relevant to hospitality / events
_RELEVANT_CATEGORIES = {
    "103": "Music",
    "104": "Film & Media",
    "105": "Performing Arts",
    "106": "Fashion",
    "108": "Sports",
    "109": "Travel & Outdoor",
    "110": "Food & Drink",
    "113": "Community & Culture",
    "115": "Nightlife",
    "116": "Charity & Causes",
}


async def fetch_eventbrite_events(
    location: str,
    api_key: str,
    days_ahead: int = 14,
) -> list[dict[str, Any]]:
    """
    Fetch upcoming events from Eventbrite for a city.
    Returns list of {name, date, venue, category, url, attendees_capacity}.
    """
    if not api_key:
        return []

    city = location.split(",")[0].strip().lower()
    city_name = _CITY_MAP.get(city, location.split(",")[0].strip())

    now = datetime.now(timezone.utc)
    end = now + timedelta(days=days_ahead)

    events: list[dict[str, Any]] = []
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(
                f"{_EVENTBRITE_API}/events/search/",
                headers={"Authorization": f"Bearer {api_key}"},
                params={
                    "location.address": city_name,
                    "location.within": "50km",
                    "start_date.range_start": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "start_date.range_end": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "expand": "venue,category",
                    "page_size": 20,
                    "sort_by": "date",
                },
            )
            if not r.is_success:
                logger.warning("eventbrite_api_failed", status=r.status_code, city=city_name)
                return []

            data = r.json()
            for ev in data.get("events", []):
                start = ev.get("start", {}).get("local", "")
                cat = ev.get("category", {}).get("name", "") if ev.get("category") else ""
                venue = ev.get("venue", {})
                events.append({
                    "name": ev.get("name", {}).get("text", ""),
                    "date": start[:16] if start else "",
                    "venue_name": venue.get("name", "") if venue else "",
                    "city": city_name,
                    "category": cat,
                    "url": ev.get("url", ""),
                    "is_free": ev.get("is_free", False),
                    "capacity": ev.get("capacity"),
                    "source": "eventbrite",
                })

        logger.info("eventbrite_events_fetched", city=city_name, count=len(events))
    except Exception as exc:
        logger.warning("eventbrite_fetch_failed", error=str(exc))

    return events


async def fetch_biletix_via_search(
    location: str,
    days_ahead: int = 14,
    tavily_api_key: str = "",
    brave_api_key: str = "",
    perplexity_api_key: str = "",
) -> list[dict[str, Any]]:
    """
    Discover Biletix and local event listings via web search.
    Returns structured event list extracted from search results.
    """
    has_search = tavily_api_key or brave_api_key or perplexity_api_key
    if not has_search:
        return []

    from app.services.web_search_service import web_search_summary

    city = location.split(",")[0].strip()
    now = datetime.now(timezone.utc)
    end = (now + timedelta(days=days_ahead)).strftime("%B %d")

    query = (
        f"site:biletix.com OR site:eventbrite.com/e yaklaşan etkinlikler "
        f"{city} {now.strftime('%B %Y')} konser festival gece etkinlik"
    )

    raw = await web_search_summary(
        query,
        tavily_api_key=tavily_api_key,
        brave_api_key=brave_api_key,
        perplexity_api_key=perplexity_api_key,
    )

    if not raw:
        return []

    # Parse event names and dates from free-text web search output
    events: list[dict[str, Any]] = []
    for line in raw.split("\n"):
        line = line.strip("- •*").strip()
        if not line or len(line) < 10:
            continue
        date_match = re.search(r"\b(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?|\w+ \d{1,2}(?:,? \d{4})?)\b", line)
        date_str = date_match.group() if date_match else ""
        events.append({
            "name": line[:120],
            "date": date_str,
            "city": city,
            "category": "Event",
            "url": "",
            "is_free": False,
            "source": "web_search",
        })

    return events[:10]


def score_event_urgency(
    events: list[dict[str, Any]],
    location: str,
) -> dict[str, Any]:
    """
    Analyse upcoming events and return urgency signals.

    Returns:
    - urgency_level: HIGH | MEDIUM | LOW
    - this_weekend_count: events this Fri-Sun
    - top_events: top 5 most relevant events
    - content_opportunity: actionable content brief
    """
    now = datetime.now(timezone.utc)
    city = location.split(",")[0].strip().lower()

    this_weekend: list[dict] = []
    next_week: list[dict] = []

    # Weekend window: this Fri 18:00 → Sun 23:59
    days_to_friday = (4 - now.weekday()) % 7
    if days_to_friday == 0 and now.hour >= 18:
        days_to_friday = 7
    friday = now + timedelta(days=days_to_friday)
    sunday = friday + timedelta(days=2)

    for ev in events:
        date_str = ev.get("date", "")
        if not date_str:
            continue
        try:
            # Parse common formats
            for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
                try:
                    ev_dt = datetime.strptime(date_str[:16], fmt)
                    break
                except ValueError:
                    continue
            else:
                continue

            ev_dt = ev_dt.replace(tzinfo=timezone.utc)
            if friday <= ev_dt <= sunday + timedelta(hours=23):
                this_weekend.append(ev)
            elif now < ev_dt <= now + timedelta(days=7):
                next_week.append(ev)
        except Exception:
            continue

    weekend_count = len(this_weekend)
    urgency = "HIGH" if weekend_count >= 2 else ("MEDIUM" if weekend_count >= 1 or len(next_week) >= 3 else "LOW")

    # Content opportunity brief
    if this_weekend:
        event_names = ", ".join(ev["name"][:40] for ev in this_weekend[:3])
        opp = (
            f"Bu hafta sonu {city.title()}'da {weekend_count} etkinlik var ({event_names}). "
            f"Venue/mekan sahipleri için story ve reels paylaşım aciliyeti YÜKSEK. "
            f"'Bodrum'da hafta sonu' içerikleri, etkinlik sahiplerini + misafirleri hedefler."
        )
    elif next_week:
        event_names = ", ".join(ev["name"][:40] for ev in next_week[:3])
        opp = (
            f"Önümüzdeki hafta {city.title()}'da {len(next_week)} etkinlik. "
            f"Erken rezervasyon ve 'hafta sonu planları' içerikleri için iyi zaman. ({event_names})"
        )
    else:
        opp = f"{city.title()}'da önümüzdeki 2 haftada dikkat çekici etkinlik bulunamadı."

    top = (this_weekend + next_week + events)[:5]
    return {
        "urgency_level": urgency,
        "this_weekend_count": weekend_count,
        "next_week_count": len(next_week),
        "total_found": len(events),
        "top_events": top,
        "content_opportunity": opp,
        "city": city.title(),
    }


async def build_event_intelligence(
    location: str,
    eventbrite_api_key: str = "",
    tavily_api_key: str = "",
    brave_api_key: str = "",
    perplexity_api_key: str = "",
    days_ahead: int = 14,
) -> dict[str, Any]:
    """
    Main entry point: fetch events from all sources, score urgency, return brief.
    """
    import asyncio

    eb_task = fetch_eventbrite_events(location, eventbrite_api_key, days_ahead)
    ws_task = fetch_biletix_via_search(location, days_ahead, tavily_api_key, brave_api_key, perplexity_api_key)

    eb_events, ws_events = await asyncio.gather(eb_task, ws_task)

    # Merge and deduplicate by name similarity
    all_events = eb_events + ws_events
    seen: set[str] = set()
    unique_events: list[dict] = []
    for ev in all_events:
        key = re.sub(r"\W+", "", ev.get("name", "").lower())[:30]
        if key and key not in seen:
            seen.add(key)
            unique_events.append(ev)

    urgency = score_event_urgency(unique_events, location)

    return {
        "available": bool(unique_events),
        "total_events": len(unique_events),
        "urgency_level": urgency["urgency_level"],
        "this_weekend_count": urgency["this_weekend_count"],
        "next_week_count": urgency["next_week_count"],
        "top_events": urgency["top_events"],
        "content_opportunity": urgency["content_opportunity"],
        "city": urgency["city"],
        "sources": list({ev["source"] for ev in unique_events}),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def build_event_intelligence_prompt(data: dict[str, Any]) -> str:
    """Convert event intelligence into a prompt block for agents."""
    if not data or not data.get("available"):
        return ""

    lines = [f"## 🎟️ Live Event Intelligence — {data.get('city', 'Bölge')}\n"]

    urgency = data.get("urgency_level", "LOW")
    urgency_emoji = {"HIGH": "🔴", "MEDIUM": "🟡", "LOW": "🟢"}.get(urgency, "⚪")
    lines.append(f"**İçerik Aciliyeti**: {urgency_emoji} {urgency}")
    lines.append(f"**Bu Hafta Sonu**: {data.get('this_weekend_count', 0)} etkinlik")
    lines.append(f"**Önümüzdeki Hafta**: {data.get('next_week_count', 0)} etkinlik\n")

    opp = data.get("content_opportunity", "")
    if opp:
        lines.append(f"**Fırsat**: {opp}\n")

    top = data.get("top_events", [])[:4]
    if top:
        lines.append("**Öne Çıkan Etkinlikler**:")
        for ev in top:
            date = ev.get("date", "")[:10]
            name = ev.get("name", "")[:60]
            cat = ev.get("category", "")
            cat_str = f" [{cat}]" if cat else ""
            lines.append(f"  - {name}{cat_str} — {date}")
        lines.append("")

    if urgency == "HIGH":
        lines.append(
            "⚡ **ACİL**: Bölgede hafta sonu yoğun etkinlik var. "
            "Story ve reels içeriklerini bu etkinliklerle ilişkilendir — "
            "'Bodrum'da hafta sonu nerede?' arayanları yakala."
        )

    return "\n".join(lines)
