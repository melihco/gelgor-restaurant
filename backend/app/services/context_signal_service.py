"""
Python-side context signal generator.

Mirrors the TypeScript Context Signal Engine used by the frontend when the
scheduler runs proposals autonomously (no browser session available).

Covers:
  - Turkish public holidays (deterministic, no API needed)
  - Current season (date + hemisphere-aware)
  - Weekday rhythm signals
  - Industry calendar phase (from persisted brand context)
"""

from __future__ import annotations

import re
from datetime import datetime, timezone, date, timedelta
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.crew.context import BrandInfo


# ── Turkish public holidays (fixed dates only) ───────────────────────────────
# Format: (month, day) → name
_TR_FIXED_HOLIDAYS: dict[tuple[int, int], str] = {
    (1, 1): "Yılbaşı",
    (4, 23): "Ulusal Egemenlik ve Çocuk Bayramı",
    (5, 1): "Emek ve Dayanışma Günü",
    (5, 19): "Atatürk'ü Anma / Gençlik ve Spor Bayramı",
    (7, 15): "Demokrasi ve Millî Birlik Günü",
    (8, 30): "Zafer Bayramı",
    (10, 29): "Cumhuriyet Bayramı",
}

# Religious holidays shift annually — approximate fixed ranges for major years
# These are good-enough for content planning (±1 day is fine)
_TR_RELIGIOUS_2025: list[tuple[date, str]] = [
    (date(2025, 3, 30), "Ramazan Bayramı Arifesi"),
    (date(2025, 3, 31), "Ramazan Bayramı 1. Günü"),
    (date(2025, 4, 1), "Ramazan Bayramı 2. Günü"),
    (date(2025, 4, 2), "Ramazan Bayramı 3. Günü"),
    (date(2025, 6, 6), "Kurban Bayramı Arifesi"),
    (date(2025, 6, 7), "Kurban Bayramı 1. Günü"),
    (date(2025, 6, 8), "Kurban Bayramı 2. Günü"),
    (date(2025, 6, 9), "Kurban Bayramı 3. Günü"),
    (date(2025, 6, 10), "Kurban Bayramı 4. Günü"),
    (date(2025, 2, 28), "Ramazan Başlangıcı"),
]

_TR_RELIGIOUS_2026: list[tuple[date, str]] = [
    (date(2026, 3, 20), "Ramazan Bayramı Arifesi"),
    (date(2026, 3, 21), "Ramazan Bayramı 1. Günü"),
    (date(2026, 3, 22), "Ramazan Bayramı 2. Günü"),
    (date(2026, 3, 23), "Ramazan Bayramı 3. Günü"),
    (date(2026, 5, 26), "Kurban Bayramı Arifesi"),
    (date(2026, 5, 27), "Kurban Bayramı 1. Günü"),
    (date(2026, 5, 28), "Kurban Bayramı 2. Günü"),
    (date(2026, 5, 29), "Kurban Bayramı 3. Günü"),
    (date(2026, 5, 30), "Kurban Bayramı 4. Günü"),
    (date(2026, 2, 17), "Ramazan Başlangıcı"),
]


def _get_upcoming_holidays(today: date, horizon_days: int = 21) -> list[str]:
    """Return Turkish holidays within the next `horizon_days` days."""
    hits: list[tuple[int, str]] = []

    # Fixed holidays
    for (m, d), name in _TR_FIXED_HOLIDAYS.items():
        candidate = date(today.year, m, d)
        delta = (candidate - today).days
        if 0 <= delta <= horizon_days:
            hits.append((delta, name))
        # Also check year+1 wrap-around
        candidate_next = date(today.year + 1, m, d)
        delta_next = (candidate_next - today).days
        if 0 <= delta_next <= horizon_days:
            hits.append((delta_next, name))

    # Religious holidays
    religious = _TR_RELIGIOUS_2025 + _TR_RELIGIOUS_2026
    for d_obj, name in religious:
        delta = (d_obj - today).days
        if 0 <= delta <= horizon_days:
            hits.append((delta, name))

    hits.sort(key=lambda x: x[0])
    return [f"{name} ({delta} gün sonra)" for delta, name in hits]


def _resolve_signal_language(brand: "BrandInfo | None" = None, languages: str | None = None) -> str:
    """Brand content language for signal copy — mirrors TS resolveSignalLanguage."""
    from app.crew.cta_localization import resolve_language_code

    raw = languages
    if raw is None and brand is not None:
        raw = getattr(brand, "languages", None)
    code = resolve_language_code(raw)
    return "en" if code == "en" else "tr"


def _get_current_season(today: date, location: str = "", language: str = "tr") -> str:
    """Return the current season label in the brand content language."""
    m = today.month
    if m in (12, 1, 2):
        key = "winter"
    elif m in (3, 4, 5):
        key = "spring"
    elif m in (6, 7, 8):
        key = "summer"
    else:
        key = "autumn"
    labels = {
        "winter": ("Kış", "Winter"),
        "spring": ("İlkbahar", "Spring"),
        "summer": ("Yaz", "Summer"),
        "autumn": ("Sonbahar", "Autumn"),
    }
    tr, en = labels[key]
    return en if language == "en" else tr


_BREAKFAST_RX = re.compile(
    r"kahvalt|serpme|breakfast|brunch|sabah\s*servis|köy\s*kahvalt|yöresel\s*kahvalt",
    re.I,
)
_NIGHTLIFE_RX = re.compile(
    r"nightclub|gece\s*kul|night\s*club|nightlife|after\s*dark|\bdj\b|gece\s*açık|gece\s*servis",
    re.I,
)
_DAYTIME_ONLY_RX = re.compile(
    r"sadece\s*(kahvalt|sabah)|kahvaltı\s*ağır|breakfast\s*only|akşam\s*kapalı|gece\s*kapalı|gece\s*açık\s*değil",
    re.I,
)


def _resolve_operating_profile(business_type: str, description: str = "") -> dict[str, bool]:
    """Mirrors TS resolveBrandOperatingProfile — tenant data only."""
    btype = (business_type or "").lower()
    blob = f"{btype} {description or ''}"
    has_breakfast = bool(_BREAKFAST_RX.search(blob))
    has_nightlife = bool(_NIGHTLIFE_RX.search(blob))
    explicit_daytime = bool(_DAYTIME_ONLY_RX.search(blob))
    nightlife_sectors = ("nightclub", "night_club", "bar", "lounge_bar", "beach_club", "beach_bar")
    is_nightlife_sector = any(btype == s or btype.startswith(f"{s}_") for s in nightlife_sectors)

    rejects_night = False
    prefers_breakfast = False
    if is_nightlife_sector or (has_nightlife and not has_breakfast):
        pass
    elif has_breakfast and (explicit_daytime or not has_nightlife):
        rejects_night = True
        prefers_breakfast = True
    return {"rejects_nightlife": rejects_night, "prefers_breakfast": prefers_breakfast}


def _operating_model_directive(profile: dict[str, bool], language: str = "tr") -> str:
    if not profile.get("rejects_nightlife"):
        return ""
    if language == "en":
        return (
            "=== BRAND OPERATING MODEL (deterministic) ===\n"
            "This venue is breakfast / daytime focused — do NOT use nightlife, DJ, or night-peak themes.\n"
            "Prefer morning, spread breakfast, garden, family table, weekend brunch angles."
        )
    return (
        "=== MARKA İŞLETİM MODELİ (deterministik) ===\n"
        "Bu mekan kahvaltı / gündüz odaklı — gece hayatı, DJ veya gece yoğunluğu temaları KULLANMA.\n"
        "Sabah, serpme kahvaltı, bahçe, aile masası, hafta sonu brunch açıları tercih et."
    )


def _get_weekday_signal(
    today: date,
    business_type: str = "",
    description: str = "",
    language: str = "tr",
) -> str:
    """Return a weekday rhythm hint relevant to the business type."""
    day_names_tr = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
    day_names_en = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    day_name = (day_names_en if language == "en" else day_names_tr)[today.weekday()]
    day_no = today.weekday()  # 0=Mon … 6=Sun
    en = language == "en"

    btype = (business_type or "").lower()
    profile = _resolve_operating_profile(btype, description)

    if day_no == 0:
        return (
            f"Today is {day_name} — week start: motivational, goal-focused content performs well."
            if en else
            f"Bugün {day_name} — Hafta başlangıcı: motivasyonel ve hedef odaklı içerikler iyi performans gösterir."
        )
    if day_no == 4:
        if profile.get("prefers_breakfast"):
            return (
                f"Today is {day_name} — pre-weekend: Saturday/Sunday breakfast and reservation invites."
                if en else
                f"Bugün {day_name} — Hafta sonu öncesi: Cumartesi/Pazar kahvaltı ve rezervasyon daveti içerikleri."
            )
        fomo = "restoran" in btype or "beach" in btype or "nightlife" in btype or "bar" in btype
        if en:
            return (
                f"Today is {day_name} — pre-weekend: reservation and event reminders convert well."
                if fomo else
                f"Today is {day_name} — pre-weekend: light, fun content draws attention."
            )
        return (
            f"Bugün {day_name} — Haftasonu öncesi: rezervasyon ve etkinlik hatırlatma içerikleri yüksek dönüşüm sağlar."
            if fomo else
            f"Bugün {day_name} — Hafta sonu öncesi: hafif, eğlenceli içerikler dikkat çeker."
        )
    if day_no == 5:
        if profile.get("rejects_nightlife"):
            return (
                f"Today is {day_name} — weekend breakfast: spread breakfast invite, garden table, family content."
                if en else
                f"Bugün {day_name} — Hafta sonu kahvaltı: serpme kahvaltı daveti, bahçe masası, aile içeriği."
            )
        return (
            f"Today is {day_name} — weekend: visual, experience-led content stands out."
            if en else
            f"Bugün {day_name} — Haftasonu: görsel ağırlıklı, deneyim odaklı içerikler öne çıkar."
        )
    if day_no == 6:
        if profile.get("prefers_breakfast"):
            return (
                f"Today is {day_name} — Sunday brunch / late breakfast invites perform best."
                if en else
                f"Bugün {day_name} — Pazar brunch / geç kahvaltı daveti içerikleri optimal."
            )
        return (
            f"Today is {day_name} — weekend: visual, experience-led content stands out."
            if en else
            f"Bugün {day_name} — Haftasonu: görsel ağırlıklı, deneyim odaklı içerikler öne çıkar."
        )
    return (
        f"Today is {day_name} — mid-week: educational, value-first content drives engagement."
        if en else
        f"Bugün {day_name} — Haftanın ortası: eğitici ve değer sunan içerikler etkileşim alır."
    )


def _resolve_sector_pack(business_type: str, description: str = "") -> str:
    """Map business_type to a sector pack ID (mirrors TS resolveSectorPack)."""
    bt = business_type.lower().strip()
    exact: dict[str, str] = {
        "beach_club": "beach_hospitality", "beach_resort": "beach_hospitality",
        "beach_bar": "beach_hospitality",
        "nightclub": "nightlife", "night_club": "nightlife", "bar": "nightlife",
        "lounge_bar": "nightlife",
        "restaurant": "urban_restaurant", "restaurant_cafe": "urban_restaurant",
        "cafe": "urban_restaurant", "coffee_shop": "urban_restaurant", "bistro": "urban_restaurant",
        "hotel": "hotel", "boutique_hotel": "hotel", "resort": "hotel",
        "beauty_salon": "wellness", "hair_salon": "wellness", "spa": "wellness",
        "gym": "wellness", "fitness": "wellness",
        "clinic": "clinic", "healthcare_clinic": "clinic", "dental_clinic": "clinic",
        "local_products_shop": "local_artisan", "local_products": "local_artisan",
        "artisan": "local_artisan", "local_food": "local_artisan",
        "local_service_business": "professional_service", "consulting": "professional_service",
        "retail": "retail", "ecommerce": "retail", "fashion": "retail",
    }
    for slug, pack_id in exact.items():
        if bt == slug or bt.startswith(slug + "_"):
            return pack_id
    combined = f"{business_type} {description}".lower()
    if any(k in combined for k in ("beach", "sahil", "plaj", "coastal")):
        return "beach_hospitality"
    if any(k in combined for k in ("nightclub", "gece")):
        return "nightlife"
    if any(k in combined for k in ("hotel", "otel", "resort")):
        return "hotel"
    if any(k in combined for k in ("restoran", "restaurant", "cafe", "kafe", "coffee")):
        return "urban_restaurant"
    if any(k in combined for k in ("beauty", "güzellik", "kuaför", "spa", "wellness")):
        return "wellness"
    if any(k in combined for k in ("clinic", "klinik", "sağlık", "dental")):
        return "clinic"
    if any(k in combined for k in ("yöresel", "yoresel", "artisan", "handcraft", "local_products")):
        return "local_artisan"
    if any(k in combined for k in ("consulting", "hizmet", "agency", "danışmanlık")):
        return "professional_service"
    return "generic"


def _sector_pack_signals(pack_id: str, today: date, btype: str, language: str = "tr") -> list[str]:
    """Emit sector-specific content hooks (mirrors TS sectorPackSignals)."""
    m = today.month
    is_summer = m in (6, 7, 8)
    is_spring = m in (3, 4, 5)
    is_weekend = today.weekday() in (5, 6)
    en = language == "en"
    hints: list[str] = []

    if pack_id == "beach_hospitality":
        if is_summer:
            hints.append(
                "Summer peak — beach/pool day, refreshing cocktails & meze"
                if en else
                "Yaz zirvesi — plaj/havuz günü, serinletici kokteyl & meze içerikleri"
            )
        if is_spring:
            hints.append(
                "Season opening — new season announcement, first sunny weekend invite"
                if en else
                "Sezon açılışı — yeni sezon duyurusu, ilk güneşli hafta sonu daveti"
            )
        if is_weekend:
            hints.append(
                "Sunset session — sunset DJ / golden-hour view content"
                if en else
                "Gün batımı seansı — sunset DJ / golden hour manzara içeriği"
            )
    elif pack_id == "nightlife":
        if is_weekend:
            hints.append(
                "Weekend lineup — DJ roster, table reservation CTA"
                if en else
                "Hafta sonu lineup — DJ kadrosu, masa rezervasyon çağrısı"
            )
    elif pack_id == "urban_restaurant":
        if today.weekday() == 6:
            hints.append(
                "Sunday brunch menu invite — family table, late breakfast"
                if en else
                "Pazar brunch menüsü daveti — aile masası, geç kahvaltı"
            )
        if today.weekday() == 4:
            hints.append(
                "Weekend reservation CTA — chef's special menu"
                if en else
                "Hafta sonu rezervasyon çağrısı — şefin özel menüsü"
            )
        hints.append(
            "Dish of the day / chef's pick — story/post opportunity"
            if en else
            "Günün tabağı / şef önerisi — story/post fırsatı"
        )
    elif pack_id == "hotel":
        if is_summer:
            hints.append(
                "Peak season — last-minute stay, pool & spa experience"
                if en else
                "Yüksek sezon — son dakika konaklama, havuz & spa deneyimi"
            )
        else:
            hints.append(
                "Off-season spa & wellness package — weekend getaway"
                if en else
                "Sezon dışı spa & wellness paketi — hafta sonu kaçamağı"
            )
    elif pack_id == "wellness":
        if is_spring:
            hints.append(
                "Spring-prep care package — spring skin/body care"
                if en else
                "Bahara hazırlık bakım paketi — bahar cilt/vücut bakımı"
            )
        if is_summer:
            hints.append(
                "Summer ready — body care, sun-prep series"
                if en else
                "Yaza hazırlık — vücut bakımı, bronzlaşma bakım serisi"
            )
    elif pack_id == "local_artisan":
        if is_spring or is_summer:
            hints.append(
                "Seasonal products — new harvest, fresh stock, handmade collection"
                if en else
                "Sezon ürünleri — yeni hasat, taze stok, el yapımı koleksiyon tanıtımı"
            )
        if is_weekend:
            hints.append(
                "Weekend local market — boutique display, order / pickup"
                if en else
                "Hafta sonu yerel pazar — butik vitrin, sipariş al / kapıda teslim"
            )
    elif pack_id == "professional_service":
        if is_weekend:
            hints.append(
                "Sector weekly tip — customer success story"
                if en else
                "Sektöre özel haftalık bilgi paylaşımı — müşteri başarı hikayesi"
            )
        if is_spring:
            hints.append(
                "New quarter / season strategy tips"
                if en else
                "Yeni çeyrek / sezon strateji ipuçları"
            )
    elif pack_id == "retail":
        if is_weekend:
            hints.append(
                "Weekend campaign — new collection showcase"
                if en else
                "Hafta sonu kampanyası — yeni koleksiyon vitrin"
            )
    elif pack_id == "clinic":
        season = _get_current_season(today, language=language)
        hints.append(
            f"Seasonal health advice for {season}"
            if en else
            f"{season} dönemine özel sağlık tavsiyesi"
        )

    return hints


# ── Lunar phase (mirrors TS lunar.ts) ────────────────────────────────────────

_SYNODIC_MONTH = 29.530588853
_NEW_MOON_EPOCH = datetime(2000, 1, 6, 18, 14, tzinfo=timezone.utc)


def _moon_age_days(when: date) -> float:
    dt = datetime(when.year, when.month, when.day, 12, 0, tzinfo=timezone.utc)
    days = (dt - _NEW_MOON_EPOCH).total_seconds() / 86_400
    age = days % _SYNODIC_MONTH
    return age + _SYNODIC_MONTH if age < 0 else age


def _next_full_moon(from_date: date) -> date:
    age = _moon_age_days(from_date)
    full_age = 0.5 * _SYNODIC_MONTH
    days_ahead = full_age - age
    if days_ahead < -0.5:
        days_ahead += _SYNODIC_MONTH
    return from_date + timedelta(days=days_ahead)


def _lunar_signal_lines(today: date, horizon_days: int = 14, language: str = "tr") -> list[str]:
    full = _next_full_moon(today)
    days_to_full = (full - today).days
    if days_to_full > horizon_days or days_to_full < -1:
        return []
    confidence = max(50, int((1 - abs(days_to_full) / (horizon_days + 1)) * 100))
    if language == "en":
        return [
            f"✓verified [{confidence}%] Full moon — {full.isoformat()} → "
            "Full-moon night event / beach party / special menu",
        ]
    return [
        f"✓doğrulanmış [{confidence}%] Dolunay — {full.isoformat()} → "
        "Dolunay temalı gece etkinliği / sahil partisi / özel menü",
    ]


def _build_mandatory_angles_block(
    pack_id: str,
    today: date,
    location: str,
    btype: str,
    profile: dict[str, bool] | None = None,
    language: str = "tr",
) -> str:
    """Deterministic mandatory diversity angles (mirrors TS brand-dynamics.ts)."""
    profile = profile or _resolve_operating_profile(btype, "")
    lines: list[str] = []
    angles: list[str] = []
    m = today.month
    is_summer = m in (6, 7, 8)
    is_weekend = today.weekday() in (5, 6)
    en = language == "en"
    coastal = any(k in (location or "").lower() for k in (
        "sahil", "plaj", "beach", "deniz", "coast", "marina", "bodrum", "antalya",
    ))

    lunar = _lunar_signal_lines(today, language=language)
    if lunar and pack_id in ("beach_hospitality", "nightlife", "hotel") and not profile.get("rejects_nightlife"):
        angles.append(lunar[0])

    if pack_id == "beach_hospitality" and not profile.get("rejects_nightlife"):
        if is_summer:
            angles.append(
                "~inferred [80%] Summer peak — beach/pool day → Refreshing cocktails & meze"
                if en else
                "~çıkarım [80%] Yaz zirvesi — plaj/havuz günü → Serinletici kokteyl & meze"
            )
        if is_weekend:
            angles.append(
                "~inferred [70%] Sunset session → Sunset DJ / golden-hour view"
                if en else
                "~çıkarım [70%] Gün batımı seansı → Sunset DJ / altın saat manzara"
            )
        if lunar and coastal:
            angles.append(
                "~inferred [90%] Full moon beach party → Full-moon beach concept"
                if en else
                "~çıkarım [90%] Full moon beach party → Dolunay sahil konsepti"
            )
    elif pack_id == "nightlife" and not profile.get("rejects_nightlife"):
        if is_weekend:
            angles.append(
                "~inferred [80%] Weekend lineup → DJ roster / table reservation"
                if en else
                "~çıkarım [80%] Hafta sonu lineup → DJ kadrosu / masa rezervasyonu"
            )
        if lunar:
            angles.append(
                "~inferred [85%] Full moon special night → Guest DJ / special performance"
                if en else
                "~çıkarım [85%] Dolunay özel gece → Guest DJ / özel performans"
            )
    elif pack_id == "urban_restaurant":
        if today.weekday() == 5 and profile.get("prefers_breakfast"):
            angles.append(
                "~inferred [75%] Saturday breakfast → Spread breakfast / garden table"
                if en else
                "~çıkarım [75%] Cumartesi kahvaltı → Serpme kahvaltı / bahçe masası"
            )
        elif today.weekday() == 6:
            angles.append(
                "~inferred [75%] Sunday brunch → Late breakfast / family table"
                if en else
                "~çıkarım [75%] Pazar brunch → Geç kahvaltı / aile masası"
            )
        if today.weekday() == 4 and not profile.get("rejects_nightlife"):
            angles.append(
                "~inferred [70%] Weekend reservation → Chef's special menu"
                if en else
                "~çıkarım [70%] Hafta sonu rezervasyon → Şefin özel menüsü"
            )
    elif pack_id == "hotel":
        if is_summer:
            angles.append(
                "~inferred [75%] Peak season → Last-minute stay / pool & spa"
                if en else
                "~çıkarım [75%] Yüksek sezon → Son dakika konaklama / havuz & spa"
            )
        else:
            angles.append(
                "~inferred [60%] Off-season wellness → Weekend getaway"
                if en else
                "~çıkarım [60%] Sezon dışı wellness → Hafta sonu kaçamağı"
            )
    elif pack_id == "wellness":
        if is_summer:
            angles.append(
                "~inferred [70%] Summer ready → Body care series"
                if en else
                "~çıkarım [70%] Yaza hazırlık → Vücut bakımı serisi"
            )
    elif pack_id == "local_artisan":
        if is_summer or m in (3, 4, 5):
            angles.append(
                "~inferred [75%] Seasonal products → New harvest / fresh stock"
                if en else
                "~çıkarım [75%] Sezon ürünleri → Yeni hasat / taze stok"
            )

    if not angles:
        return ""

    if en:
        lines.append("=== BRAND DYNAMICS — MANDATORY DIVERSITY ANGLES ===")
        lines.append("At least ONE of the following angles must be a primary theme this week:")
        for i, a in enumerate(angles[:3], 1):
            lines.append(f"{i}. {a}")
        lines.append(
            "→ trigger_signal and creative_brief must rest on one of these; "
            "DJ+seafood repetition is not accepted. Write all titles/hooks in English."
        )
    else:
        lines.append("=== MARKA DİNAMİKLERİ — ZORUNLU ÇEŞİTLİLİK AÇILARI ===")
        lines.append("Bu haftanın misyon önerisinde aşağıdaki açılardan EN AZ BİRİ ana tema olmalıdır:")
        for i, a in enumerate(angles[:3], 1):
            lines.append(f"{i}. {a}")
        lines.append("→ trigger_signal ve creative_brief bu açılardan birine dayanmalı; DJ+deniz ürünü tekrarı kabul edilmez.")
    return "\n".join(lines)


def build_brand_dynamics_block(brand: "BrandInfo") -> str:
    """
    Full brand-dynamics block for Strategist / content ideation injection.
    Combines context signals + mandatory angles + diversity directive.
    """
    base = build_python_context_signals(brand)
    now = datetime.now(timezone.utc)
    today = now.date()
    location = getattr(brand, "location", None) or getattr(brand, "city", None) or ""
    btype = brand.business_type or ""
    description = getattr(brand, "description", "") or ""
    language = _resolve_signal_language(brand)
    pack_id = _resolve_sector_pack(btype, description)
    profile = _resolve_operating_profile(btype, description)
    mandatory = _build_mandatory_angles_block(
        pack_id, today, location, btype, profile, language=language,
    )
    parts = [base]
    operating = _operating_model_directive(profile, language=language)
    if operating:
        parts.append(operating)
    if mandatory:
        parts.append(mandatory)
    diversity = _build_diversity_directive(brand)
    if diversity:
        parts.append(diversity)
    return "\n\n".join(p for p in parts if p.strip())


def _build_diversity_directive(brand: "BrandInfo") -> str:
    """
    Build diversity directive from recent missions (mirrors TS buildDiversityDirective).
    Ensures scheduler paths get the same anti-repeat guidance as Hub proposals.
    """
    recent_missions = getattr(brand, "_recent_mission_titles", None) or []
    if not recent_missions:
        return ""
    lines = [
        "=== ÇEŞİTLİLİK DİREKTİFİ ===",
        "Son/aktif misyonlar (tekrarlamaktan kaçın, farklı format & stratejik açı seç):",
    ]
    for title in recent_missions[:8]:
        lines.append(f"- {title}")
    lines.append("Yeni öneriler bu açılardan FARKLI olmalı; format ve içerik türünü çeşitlendir.")
    return "\n".join(lines)


def build_python_context_signals(brand: "BrandInfo") -> str:
    """
    Build a context-signals markdown block for use in scheduler auto-proposals.

    This is the Python counterpart of the TypeScript Context Signal Engine.
    Called from `_semi_auto_proposal_job` when no frontend session is available.

    Sprint N: Now includes sector-specific signals and diversity directive
    to reach parity with the TS engine used in browser sessions.
    """
    import json as _json

    now = datetime.now(timezone.utc)
    today = now.date()
    location = getattr(brand, "location", None) or getattr(brand, "city", None) or ""
    btype = brand.business_type or ""
    description = getattr(brand, "description", "") or ""
    language = _resolve_signal_language(brand)
    en = language == "en"
    season = _get_current_season(today, location, language=language)

    if en:
        lines = [
            "=== CONTEXT SIGNALS (deterministic, real date/astronomy) ===",
            f"Date: {today.isoformat()} | Season: {season}"
            + (f" | Location: {location}" if location else ""),
            "CRITICAL: All mission titles, headlines, captions, and hooks MUST be written in English.",
        ]
    else:
        lines = [
            "=== BAĞLAM SİNYALLERİ (deterministik, gerçek tarih/astronomi) ===",
            f"Tarih: {today.isoformat()} | Sezon: {season}"
            + (f" | Lokasyon: {location}" if location else ""),
        ]

    # Weekday rhythm
    weekday_signal = _get_weekday_signal(today, btype, description, language=language)
    lines.append(
        (f"✓verified | Day of week: {weekday_signal}" if en else f"✓doğrulanmış | Haftanın günü: {weekday_signal}")
    )

    operating = _operating_model_directive(
        _resolve_operating_profile(btype, description),
        language=language,
    )
    if operating:
        lines.append("")
        lines.append(operating)

    # Upcoming holidays (names stay TR for TR region — factual; EN brands get English framing)
    holidays = _get_upcoming_holidays(today, horizon_days=21)
    if holidays:
        lines.append(
            ("✓verified | Upcoming holidays: " if en else "✓doğrulanmış | Yaklaşan tatiller/bayramlar: ")
            + " | ".join(holidays)
        )
    else:
        lines.append(
            "No major holidays in the next 21 days."
            if en else
            "Yaklaşan 21 günde belirgin tatil/bayram yok."
        )

    # Lunar / full moon (astronomical — beach & nightlife sectors)
    lunar_lines = _lunar_signal_lines(today, horizon_days=14, language=language)
    for ll in lunar_lines:
        lines.append(ll)

    # Industry calendar phase
    industry_cal = getattr(brand, "industry_calendar", None)
    if industry_cal:
        try:
            cal = _json.loads(industry_cal) if isinstance(industry_cal, str) else industry_cal
            phase = cal.get("current_phase") or {}
            phase_name = phase.get("name") or phase.get("phase_name") or ""
            urgency = phase.get("urgency_level") or phase.get("urgency") or ""
            key_msg = phase.get("key_message") or phase.get("content_theme") or ""
            upcoming = cal.get("upcoming_triggers") or []
            if phase_name:
                prefix = "~inferred | Active industry phase: " if en else "~çıkarım | Sektör takvimi aktif fazı: "
                urgency_label = f" (Urgency: {urgency})" if urgency and en else (f" (Aciliyet: {urgency})" if urgency else "")
                lines.append(f"{prefix}{phase_name}{urgency_label}")
            if key_msg:
                lines.append(("  Key message: " if en else "  Kilit mesaj: ") + key_msg)
            if upcoming and isinstance(upcoming, list):
                next_triggers = [t.get("name") or str(t) for t in upcoming[:3] if t]
                if next_triggers:
                    lines.append(
                        ("  Upcoming sector triggers: " if en else "  Yaklaşan sektör tetikleyicileri: ")
                        + ", ".join(next_triggers)
                    )
        except Exception:
            pass

    # Sector-specific signals (new — mirrors TS sector-packs.ts)
    pack_id = _resolve_sector_pack(btype, description)
    sector_hints = _sector_pack_signals(pack_id, today, btype, language=language)
    if sector_hints:
        pack_labels = {
            "beach_hospitality": "Beach / Coastal",
            "nightlife": "Nightlife" if en else "Gece Hayatı",
            "urban_restaurant": "Restaurant / Cafe",
            "hotel": "Hotel / Resort",
            "wellness": "Wellness / Beauty",
            "clinic": "Clinic / Health",
            "retail": "Retail",
            "local_artisan": "Local Products / Boutique",
            "professional_service": "Professional Service",
            "generic": "General",
        }
        lines.append(
            ("~inferred | Sector pack: " if en else "~çıkarım | Sektör paketi: ")
            + pack_labels.get(pack_id, pack_id)
        )
        for hint in sector_hints:
            lines.append(f"  → {hint}")

    # Diversity directive (new — mirrors TS buildDiversityDirective)
    diversity = _build_diversity_directive(brand)
    if diversity:
        lines.append("")
        lines.append(diversity)

    lines.append("")
    lines.append(
        "Ground the mission proposal in these date and sector dynamics. Write all copy in English."
        if en else
        "Bu sinyallere dayanarak misyon önerisini tarih ve sektör dinamiklerine göre özelleştir."
    )
    return "\n".join(lines)
