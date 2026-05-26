"""
Trend Intelligence Service — weekly location + seasonal context for content agents.

Builds a 'trend_brief' that tells the Content Strategy Agent:
  1. What season/period it is and what that means for this venue type
  2. What's trending in the location (Bodrum, İstanbul, etc.) via Apify hashtag scraping
  3. Local events or date-relevant context (summer peak, holidays, etc.)

The brief is injected into the content strategy task so the weekly content plan
reflects what's actually relevant *this week*, not just generic brand content.

Refreshed: weekly (stored in brand_contexts.trend_brief, stale after 7 days).
"""

from __future__ import annotations

import re
import json
from collections import Counter
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx
import structlog

logger = structlog.get_logger()


# ── Google Trends helper ───────────────────────────────────────────────────

async def _fetch_google_trends_signals(
    keywords: list[str],
    api_key: str,
    geo: str = "TR",
    timeout: int = 60,
) -> str:
    """
    Fetch Google Trends interest for brand keywords.
    Returns a formatted string for prompt injection, or "" on failure.
    """
    if not keywords or not api_key:
        return ""
    try:
        from app.crew.apify_scraper import fetch_google_trends
        items = await fetch_google_trends(keywords[:5], api_key, geo=geo, timeout=timeout)
        if not items:
            return ""
        lines = ["**Google Trends (son 30 gün):**"]
        for item in items[:5]:
            kw = item.get("keyword") or item.get("term") or ""
            # Interest value — some actors return a list, some a single int
            interest = item.get("interestOverTime") or item.get("value") or []
            if isinstance(interest, list) and interest:
                avg = int(sum(v for v in interest if isinstance(v, (int, float))) / max(len(interest), 1))
                trend_str = f"{avg}/100"
            elif isinstance(interest, (int, float)):
                trend_str = f"{int(interest)}/100"
            else:
                trend_str = "?"
            related = item.get("relatedQueries") or []
            related_str = (", ".join(str(r.get("query") or r) for r in related[:3])) if related else ""
            line = f"- **{kw}**: ilgi {trend_str}"
            if related_str:
                line += f" | ilgili aramalar: {related_str}"
            lines.append(line)
        return "\n".join(lines)
    except Exception as exc:
        logger.debug("google_trends_fetch_failed", error=str(exc))
        return ""


# ── Hashtag health helper ──────────────────────────────────────────────────

async def _fetch_hashtag_health(
    hashtags: list[str],
    api_key: str,
    timeout: int = 60,
) -> str:
    """
    Check hashtag post counts and discover related tags.
    Returns a formatted string for prompt injection, or "" on failure.
    """
    if not hashtags or not api_key:
        return ""
    try:
        from app.crew.apify_scraper import fetch_hashtag_analytics
        items = await fetch_hashtag_analytics(hashtags[:8], api_key, timeout=timeout)
        if not items:
            return ""
        lines = ["**Hashtag Sağlık Analizi:**"]
        for item in items:
            tag = item.get("hashtag", "")
            count = item.get("postCount") or 0
            per_day = item.get("postsPerDay") or 0
            related = item.get("relatedHashtags") or []
            related_str = ", ".join(str(r.get("name") or r) for r in related[:3]) if related else ""
            if count > 1_000_000:
                size_label = "çok büyük (rekabetçi)"
            elif count > 100_000:
                size_label = "orta (dengeli)"
            elif count > 10_000:
                size_label = "niş (odaklı)"
            else:
                size_label = "küçük (düşük görünürlük)"
            line = f"- {tag}: {count:,} post, {per_day:.0f}/gün → {size_label}"
            if related_str:
                line += f" | öneri: {related_str}"
            lines.append(line)
        return "\n".join(lines)
    except Exception as exc:
        logger.debug("hashtag_analytics_failed", error=str(exc))
        return ""

# ── Seasonal context helpers ───────────────────────────────────────────────

_BODRUM_SEASONAL = {
    12: ("kış sezonu dışı",  "Kış döneminde yerel müşterilere odaklan. Ulaşılabilirlik ve sakin atmosfer vurgula."),
    1:  ("kış sezonu dışı",  "Ocak: Yılbaşı sonrası yerel ziyaretçiler. 'Sakin Bodrum' anlatısı çalışır."),
    2:  ("erken ilkbahar",   "Şubat: İlk güneşli günler. Rezervasyon yap mesajları tatil planlamacılara ulaşır."),
    3:  ("erken ilkbahar",   "Mart: İlkbahar hazırlığı. Sezon öncesi içerikler — 'ilk gidenlerden ol' açısı."),
    4:  ("sezon öncesi",     "Nisan: Erken sezon başlıyor. Ekstra düşük yoğunluk = kaliteli deneyim vurgusu."),
    5:  ("sezon açılışı",    "Mayıs: Tam sezon başlangıcı. Kapasiteyi doldurma, rezervasyon aciliyeti, hava harika."),
    6:  ("yaz zirvesi",      "Haziran: Yoğun sezon. Anlık doluluğu yansıt, gerçek atmosfer içerikleri çok paylaşılır."),
    7:  ("yaz zirvesi",      "Temmuz: En yoğun ay. Yabancı ziyaretçiler peak. İngilizce caption alternatifi ekle."),
    8:  ("yaz zirvesi",      "Ağustos: Zirve yoğunluk. Son yaz anıları, 'kaçırma' aciliyeti çalışır."),
    9:  ("yaz sonu",         "Eylül: Yaz biterken erken ayrılık duygusu. 'Son daldışlar, son günbatımları' içerikleri."),
    10: ("sezon kapanışı",   "Ekim: Yavaşlama. Lokal ve doğa içerikleri, 'sessiz Bodrum' keşfedilmemiş hissi."),
    11: ("kış öncesi",       "Kasım: Kış kapanışı. Gelecek sezon teaser içerikleri ve 2026 rezervasyon açılışı."),
}

_GENERIC_SEASONAL = {
    12: "Kış: Sıcaklık ve içeriden bakış içerikleri iyi performans gösterir.",
    1:  "Ocak: Yeni yıl başlangıcı. 'Yeni sezon, yeni başlangıç' mesajları rezonans yaratır.",
    2:  "Şubat: Sevgililer Günü (14 Şubat) ve kış. Romantik veya partner içerikleri.",
    3:  "Mart: Bahar başlangıcı, tazelenme. 'Yenilendi, hazır' içerikleri.",
    4:  "Nisan: Bahar pik. Outdoor ve doğa içerikleri en çok paylaşılır.",
    5:  "Mayıs: Uzun hafta sonları, seyahat yoğunluğu artar. Kapasite yaratma içerikleri.",
    6:  "Haziran: Yaz başlangıcı. Enerji ve heyecan içerikleri viralize olur.",
    7:  "Temmuz: Tatil pik. Anı ve atmosfer içerikleri en çok etkileşim alır.",
    8:  "Ağustos: Yaz biterken nostalji. 'Bu yaz anıları' trend.",
    9:  "Eylül: Okul başlangıcı, rutin dönüşü. 'Kendinize zaman ayırın' mesajı.",
    10: "Ekim: Sonbahar. Renk ve değişim içerikleri trend.",
    11: "Kasım: Kış hazırlığı. İçeriden sıcaklık ve konfor içerikleri.",
}


def _get_seasonal_context(location: str, month: int) -> tuple[str, str]:
    """Return (season_label, seasonal_tip) for the given location and month."""
    loc_lower = location.lower()
    if any(w in loc_lower for w in ["bodrum", "muğla", "marmaris", "fethiye", "antalya"]):
        return _BODRUM_SEASONAL.get(month, ("dönem", ""))
    return (f"ay {month}", _GENERIC_SEASONAL.get(month, ""))


# ── Apify: trending hashtags for a location ──────────────────────────────

async def _fetch_location_hashtags(
    location_tag: str,
    api_key: str,
    timeout: int = 60,
    max_posts: int = 20,
) -> list[str]:
    """
    Fetch top hashtags from recent Instagram posts tagged with a location term.
    Uses apify~instagram-scraper with a hashtag search.
    Returns top 10 hashtags found in recent posts.
    """
    url = "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items"
    try:
        async with httpx.AsyncClient(timeout=timeout + 10) as client:
            resp = await client.post(
                url,
                params={"token": api_key},
                json={
                    "directUrls": [f"https://www.instagram.com/explore/tags/{location_tag}/"],
                    "resultsType": "posts",
                    "resultsLimit": max_posts,
                },
                timeout=timeout,
            )
            if resp.status_code in (200, 201):
                items = resp.json()
                all_tags: list[str] = []
                for post in items:
                    caption = (post.get("caption") or "").lower()
                    all_tags.extend(re.findall(r"#\w+", caption))
                counts = Counter(all_tags)
                return [tag for tag, _ in counts.most_common(10)]
    except Exception as exc:
        logger.debug("hashtag_fetch_failed", location=location_tag, error=str(exc))
    return []


# ── Main builder ──────────────────────────────────────────────────────────

async def build_trend_brief(
    brand_name: str,
    location: str,
    content_pillars: list[str],
    api_key: str,
    *,
    timeout: int = 60,
    keywords: list[str] | None = None,
    top_hashtags: list[str] | None = None,
    geo: str = "TR",
) -> str:
    """
    Build a weekly trend brief combining:
      - Seasonal context for the location
      - Trending hashtags from Instagram location tags
      - Date-specific hooks (upcoming holidays, weekends)

    Returns a markdown string ready for Content Strategy Agent injection.
    """
    now = datetime.now(timezone.utc)
    month = now.month
    weekday = now.strftime("%A")
    week_num = now.isocalendar()[1]
    date_str = now.strftime("%d %B %Y")

    season_label, season_tip = _get_seasonal_context(location, month)

    # Derive location hashtag from location string
    loc_clean = location.lower().split(",")[0].strip()
    loc_tag = re.sub(r"[^a-z0-9]", "", loc_clean)

    # Fetch trending hashtags + Google Trends + hashtag health in parallel
    trending_tags: list[str] = []
    google_trends_str = ""
    hashtag_health_str = ""

    import asyncio as _asyncio
    trend_tasks = []
    if api_key and loc_tag:
        trend_tasks.append(_fetch_location_hashtags(loc_tag, api_key, timeout))
    else:
        trend_tasks.append(_asyncio.sleep(0, result=[]))

    kw_list = (keywords or [])[:5] or [brand_name]
    trend_tasks.append(_fetch_google_trends_signals(kw_list, api_key, geo=geo, timeout=timeout))
    trend_tasks.append(_fetch_hashtag_health(top_hashtags or [], api_key, timeout=timeout))

    results = await _asyncio.gather(*trend_tasks, return_exceptions=True)
    trending_tags = results[0] if isinstance(results[0], list) else []
    google_trends_str = results[1] if isinstance(results[1], str) else ""
    hashtag_health_str = results[2] if isinstance(results[2], str) else ""

    # Upcoming weekend signal
    days_to_weekend = (5 - now.weekday()) % 7  # days until Saturday
    weekend_note = ""
    if days_to_weekend == 0:
        weekend_note = "Bugün Cumartesi — hafta sonu yoğunluğu. Anlık atmosfer ve 'hâlâ yer var' içerikleri."
    elif days_to_weekend == 1:
        weekend_note = "Yarın Cumartesi — hafta sonu öncesi rezervasyon hatırlatma içerikleri optimal."
    elif days_to_weekend <= 3:
        weekend_note = f"Hafta sonu {days_to_weekend} gün sonra — hafta sonu öncesi teaser içerikleri."

    lines = [
        f"## Haftalık Trend Bağlamı — {date_str}",
        f"**Dönem**: {season_label} (Hafta {week_num}, {weekday})",
        f"**Lokasyon**: {location}",
        "",
        f"**Mevsimsel ipucu**: {season_tip}" if season_tip else "",
        f"**Hafta sonu**: {weekend_note}" if weekend_note else "",
    ]

    if trending_tags:
        lines += [
            "",
            f"**#{loc_clean.capitalize()} hashtag trendi** (son Instagram postlarından):",
            " ".join(trending_tags[:8]),
            "Bu hashtaglerin en az 3'ünü bu hafta içeriklerinde kullan.",
        ]

    if google_trends_str:
        lines += ["", google_trends_str]

    if hashtag_health_str:
        lines += ["", hashtag_health_str]

    lines += [
        "",
        f"**İçerik aksiyonu**: {brand_name} için bu hafta öne çıkarılacak pillar'lar: "
        + ", ".join(content_pillars[:3]) + ".",
    ]

    result = "\n".join(l for l in lines if l is not None)

    logger.info(
        "trend_brief_built",
        brand=brand_name,
        season=season_label,
        trending_tags=len(trending_tags),
    )
    return result


def is_trend_brief_stale(last_updated_iso: str | None, max_age_days: int = 7) -> bool:
    """Return True if the trend brief should be refreshed."""
    if not last_updated_iso:
        return True
    try:
        last = datetime.fromisoformat(last_updated_iso.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - last) > timedelta(days=max_age_days)
    except (ValueError, AttributeError):
        return True
