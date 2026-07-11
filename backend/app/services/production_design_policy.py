"""
Production design policy — sector-driven Fal / Remotion defaults (multi-tenant).

Mirrors apps/web/src/lib/production-design-policy.ts.
No tenant UUID branches — behavior from sector + service profile + visual signals.
"""

from __future__ import annotations

import re
from typing import Any

from app.crew.industry_playbooks import get_industry_playbook, merge_playbook_content_needs, normalize_industry_id

TYPOGRAPHY_VIBES = frozenset({
    "bubble_3d", "chrome_gradient", "neon_glow", "editorial_serif", "street_bold",
    "handwritten", "retro_poster", "minimal_modern", "warm_coastal",
})

TEXT_EFFECTS = frozenset({
    "extrude_3d", "neon_3d", "editorial_outline", "gradient_stack", "soft_shadow",
})

BACKGROUND_STYLES = frozenset({"photo_overlay", "solid_brand", "gradient_mesh", "transparent"})

LOGO_TREATMENTS = frozenset({"watermark", "badge", "inline", "none"})

FAL_INTENSITY_LEVELS = frozenset({
    "photo_first", "elegant_light", "balanced", "designed", "bold_editorial",
})

PREMIUM_VENUE_SECTORS = frozenset({
    "beach_club", "hotel_resort", "hospitality", "hospitality_entertainment",
    "nightclub_lounge", "fine_dining", "restaurant_cafe",
})

HOSPITALITY_SECTORS = PREMIUM_VENUE_SECTORS | frozenset({"bar", "nightclub"})

BEAUTY_LEANING_PILLARS = frozenset({
    "service_intro", "educational_post", "lead_generation", "post_service_client_result",
})

_WELLNESS_RX = re.compile(
    r"\b(spa|wellness|masaj|cilt|skincare|skin\s*care|iyileştir|iyilestir|ferahlatıcı|ferahlatici)\b",
    re.IGNORECASE,
)


def is_premium_venue_sector(sector: str) -> bool:
    key = normalize_industry_id(sector or "")
    return key in PREMIUM_VENUE_SECTORS or any(k in key for k in ("beach", "hotel", "resort", "club", "fine_dining"))


def is_hospitality_sector(sector: str) -> bool:
    key = normalize_industry_id(sector or "")
    return key in HOSPITALITY_SECTORS or any(k in key for k in ("beach", "hotel", "resort", "club", "bar"))


def _read_service_profile(ctx: Any) -> dict[str, Any]:
    raw = getattr(ctx, "brand_service_profile", None)
    return raw if isinstance(raw, dict) else {}


def _infer_vibe_from_visual_dna(visual_dna: str) -> str | None:
    text = (visual_dna or "").lower()
    rules: list[tuple[str, str]] = [
        (r"\b(bohemian|cycladic|aegean|coastal|beach|marina|sun.?bleach|turquoise)\b", "warm_coastal"),
        (r"\b(luxury|lüks|premium|elegant|refined|sophisticated|quiet)\b", "editorial_serif"),
        (r"\b(artisan|organic|natural|hand.?craft|wellness|spa|warm|samimi)\b", "handwritten"),
        (r"\b(craft|coffee|roast|vintage|nostalg|rustic|bakery)\b", "retro_poster"),
        (r"\b(minimal|clean|modern|contemporary|sleek|understated)\b", "minimal_modern"),
        (r"\b(neon|nightlife|club|dj|electric|after.?dark)\b", "neon_glow"),
        (r"\b(bold|urban|street|energy|dynamic|impact)\b", "street_bold"),
    ]
    for pattern, vibe in rules:
        if re.search(pattern, text):
            return vibe
    return None


def default_typography_vibe_for_sector(sector: str) -> str:
    key = normalize_industry_id(sector or "")
    if any(k in key for k in ("beach", "marina", "yacht", "coastal")):
        return "warm_coastal"
    if any(k in key for k in ("night", "club", "bar", "lounge")):
        return "neon_glow"
    if any(k in key for k in ("cafe", "bakery", "restaurant", "food")):
        return "retro_poster"
    if any(k in key for k in ("beauty", "spa", "wellness")):
        return "handwritten"
    if any(k in key for k in ("fashion", "retail", "boutique")):
        return "street_bold"
    if any(k in key for k in ("hotel", "resort", "fine_dining", "luxury")):
        return "editorial_serif"
    if any(k in key for k in ("tech", "saas", "agency")):
        return "minimal_modern"
    if "local_products" in key:
        return "retro_poster"
    return "retro_poster"


def resolve_typography_vibe(sector: str, visual_dna: str = "", service_profile: dict | None = None) -> str:
    sp = service_profile or {}
    guardrails = " ".join(str(g) for g in (sp.get("content_guardrails") or []))
    sector_default = default_typography_vibe_for_sector(sector)
    from_dna = _infer_vibe_from_visual_dna(f"{visual_dna}\n{guardrails}")
    sector_key = normalize_industry_id(sector or "")
    if "local_products" in sector_key:
        return sector_default
    if is_premium_venue_sector(sector) and from_dna in ("neon_glow", "street_bold", "bubble_3d"):
        return sector_default if sector_default != "neon_glow" else "editorial_serif"
    return from_dna or sector_default


def resolve_fal_design_intensity(sector: str, text_overlay_density: str = "minimal") -> dict[str, str]:
    key = normalize_industry_id(sector or "")
    if is_premium_venue_sector(key):
        return {"story": "photo_first", "reel": "elegant_light", "post": "elegant_light"}
    if "beauty" in key or "wellness" in key:
        return {"story": "elegant_light", "reel": "balanced", "post": "designed"}
    if "local_products" in key:
        return {"story": "photo_first", "reel": "photo_first", "post": "elegant_light"}
    if text_overlay_density == "dense":
        return {"story": "designed", "reel": "designed", "post": "bold_editorial"}
    if text_overlay_density == "medium":
        return {"story": "balanced", "reel": "balanced", "post": "balanced"}
    return {"story": "elegant_light", "reel": "balanced", "post": "elegant_light"}


def sector_anti_patterns(sector: str) -> list[str]:
    key = normalize_industry_id(sector or "")
    if is_premium_venue_sector(key):
        return [
            "neon glow typography",
            "EDM / nightclub flyer layouts",
            "dense promo sticker grids",
            "gold chrome luxury cliché",
            "uppercase shout headlines",
            "generic beach party stock energy",
        ]
    if "local_products" in key:
        return [
            "neon discount stickers",
            "fake organic certification badges",
            "stock supermarket packaging",
        ]
    if "beauty" in key or "wellness" in key:
        return [
            "before/after medical claims",
            "unverified health cure language",
            "DJ nightlife flyer layouts",
        ]
    return [
        "generic stock photo overlays",
        "unreadable tiny text blocks",
        "off-brand neon color blocks",
    ]


def resolve_typography_design(
    sector: str,
    visual_dna: str = "",
    service_profile: dict | None = None,
    accent_color: str | None = None,
) -> dict[str, str]:
    vibe = resolve_typography_vibe(sector, visual_dna, service_profile)
    text_effect = "soft_shadow"
    if vibe in ("neon_glow", "street_bold", "bubble_3d"):
        text_effect = "neon_3d" if vibe == "neon_glow" else "extrude_3d"
    elif vibe == "editorial_serif":
        text_effect = "editorial_outline"
    elif vibe == "minimal_modern":
        text_effect = "gradient_stack"
    out: dict[str, str] = {
        "vibe": vibe,
        "text_effect": text_effect,
        "background_style": "photo_overlay",
        "logo_treatment": "watermark",
    }
    if accent_color:
        out["accent_color"] = accent_color
    return out


def resolve_caption_voice_rules(sector: str, languages: str = "tr") -> list[str]:
    lang = (languages or "tr").split(",")[0].strip().lower()
    if is_premium_venue_sector(sector):
        if lang.startswith("en"):
            return [
                "English-first, sensual and communal — never corporate tourism brochure",
                "Invite to ritual and gathering, not hard sell",
                "Short poetic lines; avoid calendar/season label headlines",
            ]
        return [
            "Samimi ama seçkin — turizm broşürü dili kullanma",
            "Ritüel ve buluşmaya davet et, sert satış yapma",
            "Kısa, şiirsel satırlar; takvim/mevsim etiketi başlık olmasın",
        ]
    if "local_products" in normalize_industry_id(sector):
        return [
            "Doğallık ve üretici hikayesi ön planda",
            "Abartılı sağlık iddiası yok",
        ]
    return []


def pillars_need_realignment(sector: str, content_pillars: list[str] | None) -> bool:
    if not content_pillars:
        return True
    if not is_hospitality_sector(sector):
        return False
    beauty_hits = sum(1 for p in content_pillars if p in BEAUTY_LEANING_PILLARS)
    playbook = get_industry_playbook(sector)
    playbook_hits = sum(1 for p in content_pillars if p in playbook.default_content_needs)
    return beauty_hits >= 2 and beauty_hits > playbook_hits


def resolve_content_pillars(sector: str, content_pillars: list[str] | None) -> list[str]:
    playbook = get_industry_playbook(sector)
    inferred = [str(p).strip() for p in (content_pillars or []) if str(p).strip()]
    if pillars_need_realignment(sector, inferred):
        return list(playbook.default_content_needs)[:8]
    merged = merge_playbook_content_needs(sector, inferred)
    return merged[:8]


def apply_production_layers_to_theme_dict(
    theme_dict: dict[str, Any],
    *,
    sector: str,
    visual_dna: str = "",
    service_profile: dict | None = None,
    languages: str = "tr",
) -> dict[str, Any]:
    """Merge typography_design, fal_design_intensity, anti_patterns into a theme dict."""
    merged = dict(theme_dict)
    typo_block = merged.get("typography") or {}
    density = str(typo_block.get("text_overlay_density") or "minimal")
    palette = merged.get("palette") or {}
    accent = palette.get("accent") if isinstance(palette, dict) else None

    sp = service_profile or {}
    policy_anti = sector_anti_patterns(sector)
    guardrails = [str(g).strip() for g in (sp.get("content_guardrails") or []) if str(g).strip()]
    existing_anti = merged.get("anti_patterns") if isinstance(merged.get("anti_patterns"), list) else []
    existing_typo = merged.get("typography_design")
    derived_typo = resolve_typography_design(sector, visual_dna, sp, accent)
    if isinstance(existing_typo, dict) and existing_typo.get("confirmed_at"):
        merged_typo = {**derived_typo, **existing_typo}
        merged["typography_design"] = merged_typo
    else:
        merged["typography_design"] = {**derived_typo, "source": "derived"}
    merged["fal_design_intensity"] = resolve_fal_design_intensity(sector, density)
    merged["anti_patterns"] = list(dict.fromkeys([*existing_anti, *policy_anti, *guardrails]))[:12]

    voice = resolve_caption_voice_rules(sector, languages)
    if voice:
        existing_voice = merged.get("caption_voice_rules") if isinstance(merged.get("caption_voice_rules"), list) else []
        merged["caption_voice_rules"] = list(dict.fromkeys([*existing_voice, *voice]))[:8]

    motion = merged.get("motion_profile")
    if isinstance(motion, dict) and not motion.get("operator_override"):
        lang = (languages or "tr").split(",")[0].strip().lower() or "tr"
        motion = {**motion, "locale": lang, "text_transform": "sentence" if lang.startswith("en") else motion.get("text_transform", "sentence")}
        if is_premium_venue_sector(sector):
            motion["text_density"] = "minimal"
            motion["prefer_pure_photo_stories"] = max(float(motion.get("prefer_pure_photo_stories") or 0.72), 0.78)
        merged["motion_profile"] = motion

    merged["production_design_policy_version"] = 1
    return merged


def align_industry_calendar_type(calendar: dict[str, Any], sector: str, service_profile: dict | None = None) -> dict[str, Any]:
    """Ensure industry_calendar.industry_type matches authoritative sector."""
    out = dict(calendar)
    sp = service_profile or {}
    category = str(sp.get("category") or "").strip()
    sector_key = normalize_industry_id(sector or category or out.get("industry_type") or "")
    if category.startswith("beach_club") or sector_key == "beach_club":
        out["industry_type"] = "beach_club"
    elif category.startswith("hotel") or sector_key == "hotel_resort":
        out["industry_type"] = "hotel_resort"
    elif "beauty" in category or sector_key == "beauty_wellness":
        out["industry_type"] = "beauty_wellness"
    elif "local_products" in category or sector_key == "local_products_shop":
        out["industry_type"] = "local_products_shop"
    else:
        out["industry_type"] = sector_key
    return out
