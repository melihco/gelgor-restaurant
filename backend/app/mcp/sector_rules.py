"""
Sector visual rules for Smart Agency design MCP tools.
Mirrors web production policy (SaaS digital_ui vs physical venue).
"""

from __future__ import annotations

import re

NON_VENUE_SECTORS = frozenset({
    "agency_services",
    "ecommerce_retail",
    "production_company",
    "mental_health_clinic",
})

NON_VENUE_HINT = re.compile(
    r"saas|software|yazılım|yazilim|platform|b2b|tech_company|agency_services|"
    r"professional_service|berber.*panel|kuafor.*panel|rezervasyon.*yazilim|"
    r"appointment.*software|online.*randevu|barber.*software|salon.*software",
    re.I,
)

PHYSICAL_VENUE_HINT = re.compile(
    r"barber|berber|salon|restaurant|cafe|hotel|beach|club|spa|clinic|dental|gym|venue|resort",
    re.I,
)

LOGISTICS_HINT = re.compile(
    r"nakliyat|nakliye|lojistik|logistics|freight|taşımac|tasimac|transport|kargo",
    re.I,
)

SAAS_HINT = re.compile(
    r"saas|yazılım|yazilim|software|platform|panel|dashboard|b2b|randevu.*yazilim|appointment",
    re.I,
)


def normalize_sector(sector: str) -> str:
    return (sector or "general_business").lower().replace(" ", "_").replace("-", "_").strip() or "general_business"


def is_non_venue_sector(sector: str) -> bool:
    key = normalize_sector(sector)
    if key in NON_VENUE_SECTORS:
        return True
    return bool(NON_VENUE_HINT.search(key))


def resolve_visual_subject(business_type: str, caption: str = "") -> str:
    """venue_ambiance | product_hero | digital_ui"""
    bt = normalize_sector(business_type)
    cap = (caption or "").lower()
    combined = f"{bt} {cap}"

    if is_non_venue_sector(bt) or SAAS_HINT.search(combined):
        return "digital_ui"
    if PHYSICAL_VENUE_HINT.search(bt):
        return "venue_ambiance"
    if re.search(r"food|gıda|product|retail|e-commerce|skincare|cosmetic|packaged", bt, re.I):
        return "product_hero"
    return "venue_ambiance"


def get_sector_visual_rules(business_type: str) -> dict:
    sector = normalize_sector(business_type)
    non_venue = is_non_venue_sector(sector)
    logistics = bool(LOGISTICS_HINT.search(sector))

    rules = {
        "sector": sector,
        "is_non_venue": non_venue,
        "visual_subject_default": resolve_visual_subject(sector),
        "forbidden_elements": [],
        "recommended_layouts": ["editorial_date", "restaurant_feature"],
        "cta_hints": ["Detayları İncele", "Ücretsiz Dene", "Demo Al"],
        "enhance_policy": "skip_gpt_enhance" if non_venue else "gallery_or_remotion",
    }

    if non_venue:
        rules["forbidden_elements"] = [
            "physical shop storefront or street scene",
            "barber salon exterior unless caption explicitly about a partner salon",
            "logistics fleet / warehouse unless caption requires it",
            "invented gibberish signage on buildings",
            "GPT venue replacement of UI screenshots",
        ]
        rules["recommended_layouts"] = ["editorial_date"]
        rules["scene_guidance"] = (
            "Dashboard UI, appointment calendar, mobile app mockup, or abstract tech workspace. "
            "Photo leads; typography supports product benefit."
        )
        rules["cta_hints"] = ["Ücretsiz Dene", "Demo Al", "Hemen Başla", "Detayları İncele"]
    elif logistics:
        rules["forbidden_elements"] = [
            "promo_split without % or indirim in copy",
            "flat beige template block",
            "generic CTA İletişime Geç",
        ]
        rules["recommended_layouts"] = ["editorial_date", "restaurant_feature"]
        rules["cta_hints"] = ["Teklif Al", "Planla", "Hemen Başla"]
        rules["scene_guidance"] = "Photo-dominant logistics hero — fleet, route, warehouse cues from caption."
    else:
        rules["scene_guidance"] = "Preserve real venue/product photos; brand layer via Remotion."

    return rules


def recommend_poster_layout(sector: str, headline: str, caption: str = "") -> dict:
    rules = get_sector_visual_rules(sector)
    text = f"{headline} {caption}".lower()
    hard_promo = bool(re.search(r"%|indirim|kampanya|fırsat|firsat", text, re.I))
    has_discount = bool(re.search(r"%|indirim", text, re.I))

    layout = rules["recommended_layouts"][0]
    rationale = "Default sector layout"

    if is_non_venue_sector(sector):
        layout = "editorial_date"
        rationale = "B2B SaaS — editorial_date with UI/tech hero, not promo_split"
    elif hard_promo and has_discount:
        layout = "promo_split"
        rationale = "Hard promo copy with discount signal"
    elif LOGISTICS_HINT.search(sector):
        layout = "editorial_date" if not has_discount else "promo_split"
        rationale = "Logistics — photo-dominant unless real discount promo"

    return {
        "layout_family": layout,
        "category_label_hint": "PANEL" if is_non_venue_sector(sector) else "ROTA" if LOGISTICS_HINT.search(sector) else "YENİ",
        "display_headline_max_chars": 32,
        "rationale": rationale,
        "forbidden": rules["forbidden_elements"][:4],
    }


def validate_visual_brief(
    business_type: str,
    headline: str,
    caption: str,
    image_edit_prompt: str = "",
) -> dict:
    """QA: business model vs visual brief alignment."""
    non_venue = is_non_venue_sector(business_type)
    # Check copy only — image_edit_prompt may mention forbidden terms in NEVER clauses
    blob = f"{headline} {caption}".lower()
    issues: list[str] = []

    venue_signals = ["storefront", "street scene", "shop exterior", "berber dükkan", "salon exterior", "vitrin"]
    logistics_signals = ["kapıdan kapıya", "nakliyat", "lojistik", "fleet", "warehouse", "kamyon"]

    if non_venue:
        for sig in venue_signals:
            if sig in blob:
                issues.append(f"SaaS brand but brief mentions physical venue: '{sig}'")
        for sig in logistics_signals:
            if sig in blob:
                issues.append(f"SaaS brand but brief has logistics copy: '{sig}'")

    headline_trim = (headline or "").strip()
    if re.search(r"^bu hafta$", headline_trim, re.I):
        issues.append("Generic fallback headline 'BU HAFTA' — use VDC or caption hook")

    return {
        "pass": len(issues) == 0,
        "issues": issues,
        "visual_subject_recommended": resolve_visual_subject(business_type, caption),
        "enhance_recommended": not non_venue,
    }
