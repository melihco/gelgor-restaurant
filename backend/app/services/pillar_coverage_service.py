"""
Marka Anayasası contentNeeds (content_pillars) — ideation coverage enforcement.

Ensures each confirmed pillar appears in at least one concept's template_use_case
before auto-produce / Feed Art Director routing.
"""

from __future__ import annotations

from typing import Any

# template_use_case values that satisfy a pillar id
PILLAR_TEMPLATE_ALIASES: dict[str, list[str]] = {
    "lead_generation": ["lead_generation", "demo_cta", "invitation"],
    "social_proof": ["social_proof", "review_response", "testimonial"],
    "educational_post": ["educational_post", "how_to", "tips"],
    "campaign_offer": ["campaign_offer", "promo", "flash_sale"],
    "event_announcement": ["event_announcement", "story_event"],
    "daily_story": ["daily_story", "behind_the_scenes"],
    "menu_share": ["menu_share"],
    "product_highlight": ["product_highlight", "product_spotlight"],
    "service_intro": ["service_intro", "service_introduction"],
    "behind_the_scenes": ["behind_the_scenes", "bts"],
    "brand_awareness": ["brand_awareness"],
    "post_service_client_result": ["post_service_client_result", "social_proof"],
}

# May be reassigned to fill a missing confirmed pillar (lowest brand-contract priority)
REASSIGNABLE_USE_CASES: frozenset[str] = frozenset({
    "product_highlight",
    "service_intro",
    "daily_story",
    "behind_the_scenes",
    "menu_share",
    "brand_awareness",
    "product_spotlight",
})

PILLAR_DEFAULT_TREATMENT: dict[str, str] = {
    "campaign_offer": "campaign_offer",
    "event_announcement": "story_event",
    "lead_generation": "feed_text_overlay",
    "social_proof": "pure_photo",
    "educational_post": "feed_text_overlay",
}


def normalize_pillars(pillars: list[str] | None) -> list[str]:
    if not pillars:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for raw in pillars:
        p = str(raw or "").strip().lower().replace(" ", "_")
        if p and p not in seen:
            seen.add(p)
            out.append(p)
    return out


def concept_matches_pillar(concept: dict[str, Any], pillar: str) -> bool:
    uc = str(concept.get("template_use_case") or "").strip().lower()
    aliases = PILLAR_TEMPLATE_ALIASES.get(pillar, [pillar])
    return uc in aliases or uc == pillar


def find_missing_pillars(
    concepts: list[dict[str, Any]],
    pillars: list[str] | None,
) -> list[str]:
    confirmed = normalize_pillars(pillars)
    if not confirmed:
        return []
    missing: list[str] = []
    for pillar in confirmed:
        if not any(concept_matches_pillar(c, pillar) for c in concepts if isinstance(c, dict)):
            missing.append(pillar)
    return missing


def build_pillar_coverage_prompt_block(pillars: list[str] | None, count: int) -> str:
    confirmed = normalize_pillars(pillars)
    if not confirmed:
        return ""
    pillar_list = ", ".join(confirmed)
    n = len(confirmed)
    lines = [
        "",
        "⚠️ CONFIRMED CONTENT PILLARS — MANDATORY (Marka Anayasası / contentNeeds):",
        f"Contract list: {pillar_list}",
        f"You MUST assign at least ONE concept per pillar with template_use_case set to that exact pillar id.",
    ]
    if count >= n:
        lines.append(
            f"With {count} concepts and {n} pillars: dedicate the FIRST {n} concepts — "
            f"one per pillar in list order — before any extra angles."
        )
    lines.extend([
        "Rules:",
        "- template_use_case MUST use the pillar id exactly (e.g. campaign_offer, event_announcement).",
        "- Do NOT replace a listed pillar with product_highlight or service_intro unless that id is in the contract list.",
        "- campaign_offer: software/service promo, trial, or limited offer — NOT restaurant menu.",
        "- event_announcement: webinar, launch, live demo, seasonal campaign; use visual_production_spec.treatment story_event or event_announcement when dated.",
        "- lead_generation: demo request, signup, free trial, booking the product.",
        "- social_proof: customer results, reviews, case studies.",
        "- educational_post: how-to, tips, product education.",
    ])
    if "campaign_offer" in confirmed:
        lines.append("- REQUIRED: at least 1 concept with template_use_case campaign_offer.")
    if "event_announcement" in confirmed:
        lines.append("- REQUIRED: at least 1 concept with template_use_case event_announcement.")
    return "\n".join(lines)


def _apply_pillar_to_concept(concept: dict[str, Any], pillar: str) -> None:
    concept["template_use_case"] = pillar
    vps = concept.get("visual_production_spec")
    if not isinstance(vps, dict):
        vps = {}
        concept["visual_production_spec"] = vps
    treatment = PILLAR_DEFAULT_TREATMENT.get(pillar)
    if treatment:
        vps["treatment"] = treatment
    if pillar == "event_announcement":
        ed = concept.get("event_details")
        if not isinstance(ed, dict):
            ed = {}
            concept["event_details"] = ed
        ed.setdefault("tagline", str(concept.get("headline") or "")[:40])


def enforce_confirmed_pillar_coverage(
    concepts: list[dict[str, Any]],
    pillars: list[str] | None,
) -> tuple[list[dict[str, Any]], list[str]]:
    """
    Deterministic fill: reassign substitutable concepts so every confirmed pillar is represented.
    Returns (concepts, pillars_filled_by_enforcement).
    """
    confirmed = normalize_pillars(pillars)
    if not confirmed or not concepts:
        return concepts, []

    filled: list[str] = []
    for pillar in confirmed:
        if any(concept_matches_pillar(c, pillar) for c in concepts if isinstance(c, dict)):
            continue
        for concept in concepts:
            if not isinstance(concept, dict):
                continue
            uc = str(concept.get("template_use_case") or "").strip().lower()
            if uc in REASSIGNABLE_USE_CASES or (uc and uc not in confirmed):
                _apply_pillar_to_concept(concept, pillar)
                filled.append(pillar)
                break
    return concepts, filled


def pillar_coverage_stats(
    concepts: list[dict[str, Any]],
    pillars: list[str] | None,
) -> dict[str, Any]:
    confirmed = normalize_pillars(pillars)
    missing = find_missing_pillars(concepts, confirmed)
    covered = [p for p in confirmed if p not in missing]
    return {
        "confirmed_pillars": confirmed,
        "covered": covered,
        "missing": missing,
        "coverage_pct": round(100 * len(covered) / len(confirmed), 1) if confirmed else 100.0,
    }
