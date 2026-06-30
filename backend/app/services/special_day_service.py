"""
Special-day query service (DB-backed).

Resolves a brand's country and returns the relevant upcoming special days by
unioning international (``INT``) rows with the brand's country rows, filtering by
sector and sorting by proximity. Used by:
  - the onboarding design-template engine (via the special-days API) to
    pre-generate brand-consistent `event_special` templates per occasion, and
  - the special-day mission scheduler to auto-propose campaigns ~7 days ahead.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.brand_context import SpecialDay

# Map free-text country / city / locale signals → ISO-3166 alpha-2 codes.
_COUNTRY_NAME_TO_CODE: dict[str, str] = {
    "turkey": "TR", "türkiye": "TR", "turkiye": "TR", "turkei": "TR",
    "united states": "US", "usa": "US", "america": "US", "u.s.": "US",
    "united kingdom": "GB", "uk": "GB", "england": "GB", "britain": "GB",
    "germany": "DE", "deutschland": "DE", "almanya": "DE",
    "france": "FR", "fransa": "FR",
}

_TR_CITIES = (
    "istanbul", "ankara", "izmir", "bursa", "antalya", "bodrum", "bebek",
    "kadıköy", "kadikoy", "beşiktaş", "besiktas", "şişli", "sisli", "türkiye", "turkiye",
)

_LOCALE_TO_COUNTRY: dict[str, str] = {
    "tr": "TR", "en": "GB", "de": "DE", "fr": "FR",
}

# Countries we hold a dedicated calendar for; others fall back to INT-only.
_SUPPORTED_COUNTRIES = {"TR", "US", "GB"}
_DEFAULT_COUNTRY = "TR"


@dataclass(frozen=True)
class ResolvedSpecialDay:
    name: str
    name_en: str | None
    category: str
    theme_hint: str
    month: int
    day: int
    importance: int
    days_until: int
    country_code: str

    @property
    def mmdd(self) -> str:
        return f"{self.month:02d}-{self.day:02d}"


def resolve_country_code(
    *,
    country_code: str | None = None,
    location: str | None = None,
    languages: str | None = None,
) -> str:
    """Resolve an ISO country code from an explicit code, location or locale.

    Falls back to TR (the platform's primary market) when no signal resolves.
    """
    if country_code:
        cc = country_code.strip().upper()
        if len(cc) == 2:
            return cc

    loc = (location or "").lower()
    for name, code in _COUNTRY_NAME_TO_CODE.items():
        if name in loc:
            return code
    if any(city in loc for city in _TR_CITIES):
        return "TR"

    lang = (languages or "").lower().split(",")[0].split("-")[0].split("_")[0].strip()
    if lang in _LOCALE_TO_COUNTRY:
        return _LOCALE_TO_COUNTRY[lang]

    return _DEFAULT_COUNTRY


def _days_until(month: int, day: int, frm: date) -> int:
    try:
        target = date(frm.year, month, day)
    except ValueError:
        return 10**9
    if target < frm:
        try:
            target = date(frm.year + 1, month, day)
        except ValueError:
            return 10**9
    return (target - frm).days


def _sector_matches(row_sectors: list | None, sector: str) -> bool:
    if not row_sectors:
        return True
    s = (sector or "").lower()
    return any(str(rs).lower() in s or s in str(rs).lower() for rs in row_sectors)


async def get_special_days(
    db: AsyncSession,
    *,
    country_code: str,
    sector: str = "",
    within_days: int | None = None,
    frm: date | None = None,
    limit: int | None = None,
) -> list[ResolvedSpecialDay]:
    """Return upcoming special days for a country (INT + country rows).

    Filtered by sector relevance and sorted by proximity. ``within_days`` caps
    the horizon; ``limit`` caps the count of returned occasions.
    """
    cc = (country_code or _DEFAULT_COUNTRY).upper()
    countries = ["INT", cc] if cc in _SUPPORTED_COUNTRIES else ["INT"]
    today = frm or date.today()

    result = await db.execute(
        select(SpecialDay).where(
            SpecialDay.active.is_(True),
            SpecialDay.country_code.in_(countries),
        )
    )
    rows = result.scalars().all()

    out: list[ResolvedSpecialDay] = []
    seen: set[tuple[int, int, str]] = set()
    for row in rows:
        if not _sector_matches(row.sectors, sector):
            continue
        key = (row.month, row.day, row.name)
        if key in seen:
            continue
        seen.add(key)
        d = _days_until(row.month, row.day, today)
        if within_days is not None and d > within_days:
            continue
        out.append(ResolvedSpecialDay(
            name=row.name,
            name_en=row.name_en,
            category=row.category,
            theme_hint=row.theme_hint,
            month=row.month,
            day=row.day,
            importance=row.importance,
            days_until=d,
            country_code=row.country_code,
        ))

    # Closest first; ties broken by higher importance.
    out.sort(key=lambda r: (r.days_until, -r.importance))
    if limit is not None:
        out = out[:limit]
    return out
