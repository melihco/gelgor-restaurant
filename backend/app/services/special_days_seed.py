"""
Seed data + idempotent loader for the ``special_days`` reference calendar.

Rows are keyed by (country_code, month, day, name) — re-running the loader
inserts only missing rows and refreshes mutable fields (theme_hint, category,
sectors, importance) on existing ones, so editing this file and restarting the
service keeps the calendar current without duplicating entries.

country_code:
  'INT'  → international / shared, applies to every brand (is_international=True)
  'TR'   → Türkiye-specific national holidays + locale family days
  'US'   → United States
  'GB'   → United Kingdom
"""

from __future__ import annotations

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models.brand_context import SpecialDay

logger = structlog.get_logger()


# Tuple shape: (month, day, name, name_en, category, theme_hint, sectors, importance)
_INTERNATIONAL: list[tuple] = [
    (1, 1, "Yılbaşı", "New Year's Day", "celebration",
     "new year celebration, fireworks, festive sparkle, gold accents, fresh start", [], 5),
    (2, 14, "Sevgililer Günü", "Valentine's Day", "romantic",
     "romantic dinner, couple, roses, candlelight, warm intimate mood, hearts", [], 5),
    (3, 8, "Dünya Kadınlar Günü", "International Women's Day", "celebration",
     "celebrating women, elegant floral, empowering, warm and graceful", [], 4),
    (10, 31, "Cadılar Bayramı", "Halloween", "seasonal",
     "halloween, playful spooky, pumpkin orange and black, festive night", [], 2),
    (12, 25, "Noel", "Christmas", "religious",
     "christmas warmth, pine and gold, cozy festive lights, gift moment", [], 3),
    (12, 31, "Yılbaşı Gecesi", "New Year's Eve", "celebration",
     "new year eve party, countdown, glamour, fireworks, gold and black", [], 5),
    # Sector-relevant world days
    (10, 1, "Dünya Kahve Günü", "International Coffee Day", "sector",
     "coffee craft, latte art, cozy cafe warmth, rich espresso tones",
     ["coffee_shop", "cafe_bakery", "restaurant_cafe", "restaurant"], 4),
    (10, 16, "Dünya Gıda Günü", "World Food Day", "sector",
     "fresh food, abundance, culinary craft, vibrant ingredients",
     ["restaurant_cafe", "restaurant", "cafe_bakery"], 3),
    (11, 17, "Dünya Cilt Bakımı Günü", "World Skincare Day", "sector",
     "glowing skin, calm spa, clean wellness aesthetic, soft light",
     ["beauty_wellness", "salon", "skincare"], 3),
    (6, 21, "Dünya Yoga Günü", "International Yoga Day", "sector",
     "serene yoga, calm natural light, mindful wellness, balance",
     ["yoga_wellness", "beauty_wellness"], 3),
]

_TURKEY: list[tuple] = [
    (4, 23, "23 Nisan Ulusal Egemenlik ve Çocuk Bayramı", "National Sovereignty and Children's Day", "national",
     "children festival, joyful, Turkish flags, playful celebration, red and white", [], 5),
    (5, 1, "1 Mayıs Emek ve Dayanışma Günü", "Labour and Solidarity Day", "national",
     "spring, solidarity, fresh outdoor energy, hopeful", [], 3),
    (5, 19, "19 Mayıs Gençlik ve Spor Bayramı", "Commemoration of Atatürk, Youth and Sports Day", "national",
     "youth, sport, energetic, Turkish flags, vibrant red and white", [], 4),
    (8, 30, "30 Ağustos Zafer Bayramı", "Victory Day", "national",
     "victory day, Turkish flags, proud national celebration, red and white", [], 5),
    (10, 29, "29 Ekim Cumhuriyet Bayramı", "Republic Day", "national",
     "republic day, Turkish flags, Atatürk, proud red and white celebration", [], 5),
    # Family days (TR observance dates — movable, fixed to a representative date)
    (5, 11, "Anneler Günü", "Mother's Day", "family",
     "mother and family, tender warm tones, flowers, heartfelt, soft light", [], 5),
    (6, 15, "Babalar Günü", "Father's Day", "family",
     "father and family, classic warm masculine tones, heartfelt", [], 5),
]

_USA: list[tuple] = [
    (7, 4, "Bağımsızlık Günü", "Independence Day", "national",
     "independence day, US flags, red white and blue, festive fireworks", [], 4),
    (11, 27, "Şükran Günü", "Thanksgiving", "family",
     "thanksgiving feast, autumn warmth, family gathering, gratitude", [], 4),
    (5, 11, "Anneler Günü", "Mother's Day", "family",
     "mother and family, tender warm tones, flowers, heartfelt", [], 5),
    (6, 15, "Babalar Günü", "Father's Day", "family",
     "father and family, classic warm masculine tones, heartfelt", [], 5),
]

_UK: list[tuple] = [
    (3, 30, "Anneler Günü", "Mothering Sunday", "family",
     "mother and family, tender warm tones, flowers, heartfelt", [], 5),
    (6, 15, "Babalar Günü", "Father's Day", "family",
     "father and family, classic warm masculine tones, heartfelt", [], 5),
    (11, 5, "Guy Fawkes Gecesi", "Bonfire Night", "celebration",
     "bonfire night, fireworks, autumn evening, festive glow", [], 2),
]

_SEED: dict[str, list[tuple]] = {
    "INT": _INTERNATIONAL,
    "TR": _TURKEY,
    "US": _USA,
    "GB": _UK,
}


async def _seed_with_session(db: AsyncSession) -> tuple[int, int]:
    inserted = 0
    refreshed = 0
    for country_code, rows in _SEED.items():
        is_intl = country_code == "INT"
        for (month, day, name, name_en, category, theme_hint, sectors, importance) in rows:
            existing = await db.execute(
                select(SpecialDay).where(
                    SpecialDay.country_code == country_code,
                    SpecialDay.month == month,
                    SpecialDay.day == day,
                    SpecialDay.name == name,
                )
            )
            row = existing.scalar_one_or_none()
            if row is None:
                db.add(SpecialDay(
                    country_code=country_code,
                    month=month,
                    day=day,
                    name=name,
                    name_en=name_en,
                    category=category,
                    theme_hint=theme_hint,
                    sectors=sectors,
                    importance=importance,
                    is_international=is_intl,
                    active=True,
                ))
                inserted += 1
            else:
                # Refresh mutable creative fields so edits to this file propagate.
                row.theme_hint = theme_hint
                row.category = category
                row.sectors = sectors
                row.importance = importance
                row.name_en = name_en
                refreshed += 1
    await db.commit()
    return inserted, refreshed


async def seed_special_days() -> None:
    """Idempotently load the special-days calendar. Safe to call every startup."""
    try:
        async with async_session_factory() as db:
            inserted, refreshed = await _seed_with_session(db)
        logger.info("special_days_seeded", inserted=inserted, refreshed=refreshed)
    except Exception as exc:  # never block startup on reference-data seeding
        logger.error("special_days_seed_failed", error=str(exc)[:300])
