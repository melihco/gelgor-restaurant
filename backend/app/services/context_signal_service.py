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


def _get_current_season(today: date, location: str = "") -> str:
    """Return the current season as a Turkish string."""
    m = today.month
    if m in (12, 1, 2):
        season = "Kış"
    elif m in (3, 4, 5):
        season = "İlkbahar"
    elif m in (6, 7, 8):
        season = "Yaz"
    else:
        season = "Sonbahar"
    return season


def _get_weekday_signal(today: date, business_type: str = "") -> str:
    """Return a weekday rhythm hint relevant to the business type."""
    day_names = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
    day_name = day_names[today.weekday()]
    day_no = today.weekday()  # 0=Mon … 6=Sun

    btype = (business_type or "").lower()

    if day_no == 0:
        return f"Bugün {day_name} — Hafta başlangıcı: motivasyonel ve hedef odaklı içerikler iyi performans gösterir."
    if day_no == 4:
        fomo = "restoran" in btype or "beach" in btype or "nightlife" in btype or "bar" in btype
        return (
            f"Bugün {day_name} — Haftasonu öncesi: rezervasyon ve etkinlik hatırlatma içerikleri yüksek dönüşüm sağlar."
            if fomo else
            f"Bugün {day_name} — Hafta sonu öncesi: hafif, eğlenceli içerikler dikkat çeker."
        )
    if day_no in (5, 6):
        return f"Bugün {day_name} — Haftasonu: görsel ağırlıklı, deneyim odaklı içerikler öne çıkar."
    return f"Bugün {day_name} — Haftanın ortası: eğitici ve değer sunan içerikler etkileşim alır."


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


def _sector_pack_signals(pack_id: str, today: date, btype: str) -> list[str]:
    """Emit sector-specific content hooks (mirrors TS sectorPackSignals)."""
    m = today.month
    is_summer = m in (6, 7, 8)
    is_spring = m in (3, 4, 5)
    is_weekend = today.weekday() in (5, 6)
    hints: list[str] = []

    if pack_id == "beach_hospitality":
        if is_summer:
            hints.append("Yaz zirvesi — plaj/havuz günü, serinletici kokteyl & meze içerikleri")
        if is_spring:
            hints.append("Sezon açılışı — yeni sezon duyurusu, ilk güneşli hafta sonu daveti")
        if is_weekend:
            hints.append("Gün batımı seansı — sunset DJ / golden hour manzara içeriği")
    elif pack_id == "nightlife":
        if is_weekend:
            hints.append("Hafta sonu lineup — DJ kadrosu, masa rezervasyon çağrısı")
    elif pack_id == "urban_restaurant":
        if today.weekday() == 6:
            hints.append("Pazar brunch menüsü daveti — aile masası, geç kahvaltı")
        if today.weekday() == 4:
            hints.append("Hafta sonu rezervasyon çağrısı — şefin özel menüsü")
        hints.append("Günün tabağı / şef önerisi — story/post fırsatı")
    elif pack_id == "hotel":
        if is_summer:
            hints.append("Yüksek sezon — son dakika konaklama, havuz & spa deneyimi")
        else:
            hints.append("Sezon dışı spa & wellness paketi — hafta sonu kaçamağı")
    elif pack_id == "wellness":
        if is_spring:
            hints.append("Bahara hazırlık bakım paketi — bahar cilt/vücut bakımı")
        if is_summer:
            hints.append("Yaza hazırlık — vücut bakımı, bronzlaşma bakım serisi")
    elif pack_id == "local_artisan":
        if is_spring or is_summer:
            hints.append("Sezon ürünleri — yeni hasat, taze stok, el yapımı koleksiyon tanıtımı")
        if is_weekend:
            hints.append("Hafta sonu yerel pazar — butik vitrin, sipariş al / kapıda teslim")
    elif pack_id == "professional_service":
        if is_weekend:
            hints.append("Sektöre özel haftalık bilgi paylaşımı — müşteri başarı hikayesi")
        if is_spring:
            hints.append("Yeni çeyrek / sezon strateji ipuçları")
    elif pack_id == "retail":
        if is_weekend:
            hints.append("Hafta sonu kampanyası — yeni koleksiyon vitrin")
    elif pack_id == "clinic":
        season = _get_current_season(today)
        hints.append(f"{season} dönemine özel sağlık tavsiyesi")

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


def _lunar_signal_lines(today: date, horizon_days: int = 14) -> list[str]:
    full = _next_full_moon(today)
    days_to_full = (full - today).days
    if days_to_full > horizon_days or days_to_full < -1:
        return []
    confidence = max(50, int((1 - abs(days_to_full) / (horizon_days + 1)) * 100))
    return [
        f"✓doğrulanmış [{confidence}%] Dolunay — {full.isoformat()} → "
        "Dolunay temalı gece etkinliği / sahil partisi / özel menü",
    ]


def _build_mandatory_angles_block(
    pack_id: str,
    today: date,
    location: str,
    btype: str,
) -> str:
    """Deterministic mandatory diversity angles (mirrors TS brand-dynamics.ts)."""
    lines: list[str] = []
    angles: list[str] = []
    m = today.month
    is_summer = m in (6, 7, 8)
    is_weekend = today.weekday() in (5, 6)
    coastal = any(k in (location or "").lower() for k in (
        "sahil", "plaj", "beach", "deniz", "coast", "marina", "bodrum", "antalya",
    ))

    lunar = _lunar_signal_lines(today)
    if lunar and pack_id in ("beach_hospitality", "nightlife", "hotel"):
        angles.append(lunar[0])

    if pack_id == "beach_hospitality":
        if is_summer:
            angles.append("~çıkarım [80%] Yaz zirvesi — plaj/havuz günü → Serinletici kokteyl & meze")
        if is_weekend:
            angles.append("~çıkarım [70%] Gün batımı seansı → Sunset DJ / altın saat manzara")
        if lunar and coastal:
            angles.append("~çıkarım [90%] Full moon beach party → Dolunay sahil konsepti")
    elif pack_id == "nightlife":
        if is_weekend:
            angles.append("~çıkarım [80%] Hafta sonu lineup → DJ kadrosu / masa rezervasyonu")
        if lunar:
            angles.append("~çıkarım [85%] Dolunay özel gece → Guest DJ / özel performans")
    elif pack_id == "urban_restaurant":
        if today.weekday() == 6:
            angles.append("~çıkarım [75%] Pazar brunch → Geç kahvaltı / aile masası")
        if today.weekday() == 4:
            angles.append("~çıkarım [70%] Hafta sonu rezervasyon → Şefin özel menüsü")
    elif pack_id == "hotel":
        if is_summer:
            angles.append("~çıkarım [75%] Yüksek sezon → Son dakika konaklama / havuz & spa")
        else:
            angles.append("~çıkarım [60%] Sezon dışı wellness → Hafta sonu kaçamağı")
    elif pack_id == "wellness":
        if is_summer:
            angles.append("~çıkarım [70%] Yaza hazırlık → Vücut bakımı serisi")
    elif pack_id == "local_artisan":
        if is_summer or m in (3, 4, 5):
            angles.append("~çıkarım [75%] Sezon ürünleri → Yeni hasat / taze stok")

    if not angles:
        return ""

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
    pack_id = _resolve_sector_pack(btype, description)
    mandatory = _build_mandatory_angles_block(pack_id, today, location, btype)
    parts = [base]
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

    lines: list[str] = [
        "=== BAĞLAM SİNYALLERİ (deterministik, gerçek tarih/astronomi) ===",
        f"Tarih: {today.isoformat()} | Sezon: {_get_current_season(today, location)}" +
        (f" | Lokasyon: {location}" if location else ""),
    ]

    # Weekday rhythm
    weekday_signal = _get_weekday_signal(today, btype)
    lines.append(f"✓doğrulanmış | Haftanın günü: {weekday_signal}")

    # Upcoming holidays
    holidays = _get_upcoming_holidays(today, horizon_days=21)
    if holidays:
        lines.append("✓doğrulanmış | Yaklaşan tatiller/bayramlar: " + " | ".join(holidays))
    else:
        lines.append("Yaklaşan 21 günde belirgin tatil/bayram yok.")

    # Lunar / full moon (astronomical — beach & nightlife sectors)
    lunar_lines = _lunar_signal_lines(today, horizon_days=14)
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
                lines.append(f"~çıkarım | Sektör takvimi aktif fazı: {phase_name}" + (f" (Aciliyet: {urgency})" if urgency else ""))
            if key_msg:
                lines.append(f"  Kilit mesaj: {key_msg}")
            if upcoming and isinstance(upcoming, list):
                next_triggers = [t.get("name") or str(t) for t in upcoming[:3] if t]
                if next_triggers:
                    lines.append("  Yaklaşan sektör tetikleyicileri: " + ", ".join(next_triggers))
        except Exception:
            pass

    # Sector-specific signals (new — mirrors TS sector-packs.ts)
    pack_id = _resolve_sector_pack(btype, description)
    sector_hints = _sector_pack_signals(pack_id, today, btype)
    if sector_hints:
        pack_labels = {
            "beach_hospitality": "Beach / Sahil",
            "nightlife": "Gece Hayatı",
            "urban_restaurant": "Restoran / Kafe",
            "hotel": "Otel / Resort",
            "wellness": "Wellness / Güzellik",
            "clinic": "Klinik / Sağlık",
            "retail": "Perakende",
            "local_artisan": "Yerel Ürünler / Butik",
            "professional_service": "Profesyonel Hizmet",
            "generic": "Genel",
        }
        lines.append(f"~çıkarım | Sektör paketi: {pack_labels.get(pack_id, pack_id)}")
        for hint in sector_hints:
            lines.append(f"  → {hint}")

    # Diversity directive (new — mirrors TS buildDiversityDirective)
    diversity = _build_diversity_directive(brand)
    if diversity:
        lines.append("")
        lines.append(diversity)

    lines.append("")
    lines.append("Bu sinyallere dayanarak misyon önerisini tarih ve sektör dinamiklerine göre özelleştir.")
    return "\n".join(lines)
