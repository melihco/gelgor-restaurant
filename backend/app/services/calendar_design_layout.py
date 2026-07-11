"""Calendar design layout routing — TS parity for mission_ideation_merge enrichment."""

from __future__ import annotations

from typing import Any, TypedDict


class CalendarLayoutResult(TypedDict):
    canva_archetype_id: str
    layout_family_hint: str
    source: str


KNOWN_ARCHETYPES = frozenset({
    "cinematic_full_bleed",
    "product_hero_card",
    "split_feature_panel",
    "editorial_date_masthead",
    "event_ticket_stub",
    "neon_night_promo",
    "campaign_hero_block",
    "promo_price_stack",
    "diagonal_brand_split",
    "frosted_quote_card",
    "social_proof_banner",
    "magazine_cover_drop",
    "polaroid_memory",
    "graphic_shape_stack",
    "before_after_diptych",
    "location_pin_card",
})

CANVA_TO_REMOTION_LAYOUT: dict[str, str] = {
    "cinematic_full_bleed": "cinematic_center",
    "product_hero_card": "editorial_product_stage",
    "split_feature_panel": "split_panel",
    "magazine_cover_drop": "magazine_cover",
    "polaroid_memory": "polaroid_single",
    "editorial_date_masthead": "magazine_cover",
    "event_ticket_stub": "event_ticket",
    "campaign_hero_block": "campaign_hero",
    "promo_price_stack": "campaign_hero",
    "frosted_quote_card": "frosted_glass",
    "social_proof_banner": "quote_card",
    "diagonal_brand_split": "bold_impact",
    "neon_night_promo": "neon_night",
    "graphic_shape_stack": "bento_story",
    "before_after_diptych": "diptych_collage",
    "location_pin_card": "location_pin",
}

DEFAULT_CALENDAR_LAYOUT: dict[str, dict[str, str]] = {
    "product_reveal": {"story": "cinematic_full_bleed", "post": "product_hero_card"},
    "venue_showcase": {"story": "cinematic_full_bleed", "post": "split_feature_panel"},
    "behind_the_scenes": {"story": "polaroid_memory", "post": "magazine_cover_drop"},
    "event_teaser": {"story": "editorial_date_masthead", "post": "event_ticket_stub"},
    "offer_campaign": {"story": "campaign_hero_block", "post": "promo_price_stack"},
    "social_proof": {"story": "frosted_quote_card", "post": "social_proof_banner"},
}

SECTOR_CALENDAR_LAYOUT_OVERRIDES: dict[str, dict[str, dict[str, str]]] = {
    "beach_club": {
        "event_teaser": {"story": "neon_night_promo", "post": "diagonal_brand_split"},
        "product_reveal": {"story": "cinematic_full_bleed", "post": "product_hero_card"},
        "offer_campaign": {"story": "diagonal_brand_split", "post": "campaign_hero_block"},
    },
    "local_products_shop": {
        "product_reveal": {"story": "product_hero_card", "post": "graphic_shape_stack"},
        "behind_the_scenes": {"story": "polaroid_memory", "post": "before_after_diptych"},
        "social_proof": {"story": "frosted_quote_card", "post": "location_pin_card"},
    },
    "hotel_resort": {
        "event_teaser": {"story": "editorial_date_masthead", "post": "event_ticket_stub"},
        "venue_showcase": {"story": "cinematic_full_bleed", "post": "magazine_cover_drop"},
        "offer_campaign": {"story": "campaign_hero_block", "post": "promo_price_stack"},
    },
    "restaurant_cafe": {
        "product_reveal": {"story": "product_hero_card", "post": "split_feature_panel"},
        "offer_campaign": {"story": "campaign_hero_block", "post": "promo_price_stack"},
        "social_proof": {"story": "frosted_quote_card", "post": "social_proof_banner"},
    },
    "nightclub_lounge": {
        "event_teaser": {"story": "neon_night_promo", "post": "diagonal_brand_split"},
        "offer_campaign": {"story": "diagonal_brand_split", "post": "campaign_hero_block"},
    },
}


def _normalize_announcement_key(raw: str) -> str:
    return raw.strip().lower().replace(" ", "_")


def _normalize_sector(sector: str | None) -> str:
    return (sector or "").strip().lower().replace("-", "_")


def _layout_channel(fmt: str) -> str:
    return "story" if "story" in fmt.lower() else "post"


def resolve_calendar_design_layout(
    *,
    announcement_type: str,
    channel: str,
    sector: str | None = None,
    explicit_layout_family: str | None = None,
) -> CalendarLayoutResult:
    explicit = str(explicit_layout_family or "").strip()
    if explicit and explicit in KNOWN_ARCHETYPES:
        archetype = explicit
        source = "calendar:design_layout_family"
    else:
        key = _normalize_announcement_key(announcement_type)
        sector_key = _normalize_sector(sector) or "default"
        archetype = (
            SECTOR_CALENDAR_LAYOUT_OVERRIDES.get(sector_key, {})
            .get(key, {})
            .get(channel)
            or DEFAULT_CALENDAR_LAYOUT.get(key, {}).get(channel)
            or "split_feature_panel"
        )
        if sector_key != "default" and (
            SECTOR_CALENDAR_LAYOUT_OVERRIDES.get(sector_key, {}).get(key, {}).get(channel)
        ):
            source = f"sector_matrix:{sector_key}:{key}"
        elif key and DEFAULT_CALENDAR_LAYOUT.get(key, {}).get(channel):
            source = f"announcement_matrix:{key}"
        else:
            source = "default_split_feature_panel"

    return {
        "canva_archetype_id": archetype,
        "layout_family_hint": CANVA_TO_REMOTION_LAYOUT.get(archetype, "split_panel"),
        "source": source,
    }


def apply_calendar_design_layout_to_row(
    row: dict[str, Any],
    layout: CalendarLayoutResult,
) -> dict[str, Any]:
    vps = dict(row.get("visual_production_spec") or {}) if isinstance(row.get("visual_production_spec"), dict) else {}
    return {
        **row,
        "design_layout_family": layout["canva_archetype_id"],
        "design_layout_source": layout["source"],
        "design_layout_locked": layout["source"] == "calendar:design_layout_family",
        "layout_family_hint": layout["layout_family_hint"],
        "visual_production_spec": {
            **vps,
            "design_layout_family": layout["canva_archetype_id"],
            "canva_archetype": layout["canva_archetype_id"],
        },
    }


def normalize_calendar_plan_design_layout(
    plan: dict[str, Any],
    *,
    sector: str | None = None,
) -> dict[str, Any]:
    explicit = str(plan.get("design_layout_family") or plan.get("designLayoutFamily") or "").strip()
    if explicit:
        return {
            **plan,
            "design_layout_family": explicit,
            "design_layout_locked": True,
        }

    announcement = str(
        plan.get("announcement_type") or plan.get("type") or plan.get("template_use_case") or ""
    ).strip()
    fmt = str(plan.get("format") or "post")
    channel = _layout_channel(fmt)
    layout = resolve_calendar_design_layout(
        announcement_type=announcement,
        channel=channel,
        sector=sector,
    )
    return {
        **plan,
        "design_layout_family": layout["canva_archetype_id"],
        "design_layout_source": layout["source"],
    }
