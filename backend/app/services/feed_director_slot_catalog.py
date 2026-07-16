"""Feed Art Director — tenant-enabled production slot catalog for prompt injection."""

from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.slot_catalog_service import (
    _load_brand_slot_facilities,
    _slot_enabled_by_facilities,
    list_slot_definitions,
    list_tenant_enabled_slots,
    resolve_workspace_sector_id,
)

# Cap prompt size — FD only needs format/pipeline/role routing hints.
FD_CATALOG_SLOTS_PROMPT_MAX = 48

WEEKLY_FORMAT_TARGETS_AGENCY: dict[str, int] = {
    "post": 6,
    "story": 7,
    "reel": 2,
    "carousel": 1,
}
WEEKLY_MISSION_SLOT_TOTAL = 16


def weekly_format_targets_from_catalog(
    catalog_slots: list[dict[str, str]],
    production_profile: str | None = None,
) -> dict[str, int]:
    """Cap weekly geometry by what the tenant catalog actually enables."""
    tier = (production_profile or "").strip().lower()
    base = dict(WEEKLY_FORMAT_TARGETS_AGENCY)
    if tier == "economy":
        base = {"post": 6, "story": 6, "reel": 2, "carousel": 0}
    available: dict[str, int] = {"post": 0, "story": 0, "reel": 0, "carousel": 0}
    for slot in catalog_slots:
        fmt = str(slot.get("format") or "post")
        if fmt in available:
            available[fmt] += 1
    return {fmt: min(base.get(fmt, 0), available.get(fmt, 0)) for fmt in base}


def build_weekly_catalog_assignment_plan(
    catalog_slots: list[dict[str, str]],
    production_profile: str | None = None,
    total: int = WEEKLY_MISSION_SLOT_TOTAL,
) -> list[dict[str, str]]:
    """Ordered catalog rows for a weekly mission — format mix capped by enabled slots."""
    if not catalog_slots:
        return []
    targets = weekly_format_targets_from_catalog(catalog_slots, production_profile)
    by_format: dict[str, list[dict[str, str]]] = {}
    for slot in catalog_slots:
        fmt = str(slot.get("format") or "post")
        by_format.setdefault(fmt, []).append(slot)
    for fmt in by_format:
        by_format[fmt].sort(key=lambda s: str(s.get("slot_key") or ""))

    plan: list[dict[str, str]] = []
    used: set[str] = set()

    def take(fmt: str, count: int) -> None:
        pool = by_format.get(fmt) or []
        if not pool or count <= 0:
            return
        for i in range(count):
            unused = [s for s in pool if str(s.get("slot_key") or "") not in used]
            pick_from = unused if unused else pool
            slot = pick_from[i % len(pick_from)]
            key = str(slot.get("slot_key") or "")
            if key:
                used.add(key)
            plan.append(slot)

    for fmt, count in targets.items():
        take(fmt, count)

    guard = 0
    while len(plan) < total and guard < total * 4:
        guard += 1
        remaining = [
            s for s in catalog_slots if str(s.get("slot_key") or "") not in used
        ]
        if remaining:
            slot = remaining[0]
            key = str(slot.get("slot_key") or "")
            if key:
                used.add(key)
            plan.append(slot)
        else:
            plan.append(catalog_slots[len(plan) % len(catalog_slots)])
    return plan[:total]


def slot_definition_to_fd_dict(slot: Any) -> dict[str, str]:
    return {
        "slot_key": str(slot.slot_key),
        "label_tr": str(slot.label_tr or ""),
        "format": str(slot.format or "post"),
        "pipeline": str(slot.pipeline or ""),
        "slot_role": str(slot.slot_role or ""),
        "design_template_type": str(slot.design_template_type or ""),
    }


async def load_feed_director_catalog_slots(
    db: AsyncSession,
    workspace_id: uuid.UUID,
) -> list[dict[str, str]]:
    """Enabled tenant slots joined with definitions; sector defaults if unassigned."""
    rows = await list_tenant_enabled_slots(db, workspace_id)
    if not rows:
        sector = await resolve_workspace_sector_id(db, workspace_id)
        if not sector:
            return []
        facilities = await _load_brand_slot_facilities(db, workspace_id)
        defaults = await list_slot_definitions(db, sector_id=sector, active_only=True)
        rows = [
            {"assignment": None, "slot": slot}
            for slot in defaults
            if slot.enabled_by_default
            and _slot_enabled_by_facilities(slot.optional_tags, facilities)
        ]

    out = [slot_definition_to_fd_dict(row["slot"]) for row in rows]
    out.sort(key=lambda s: (s["format"], s["slot_key"]))
    return out[:FD_CATALOG_SLOTS_PROMPT_MAX]


def format_catalog_slots_for_prompt(catalog_slots: list[dict[str, str]] | None) -> str:
    if not catalog_slots:
        return (
            "### Brand catalog slots\n"
            "No tenant slot catalog loaded — omit `catalog_slot_key` on assignments "
            "(production will heuristic-match at render time).\n"
        )
    compact = catalog_slots[:FD_CATALOG_SLOTS_PROMPT_MAX]
    lines = [
        "### Brand catalog slots (MANDATORY for Fal/designed assignments)",
        "Pick `catalog_slot_key` ONLY from this enabled list. Keys lock the brand's onboarding template.",
        f"```json\n{json.dumps(compact, ensure_ascii=False, indent=2)}\n```",
        "Rules:",
        "- `catalog_slot_key` format MUST match assignment format (post/story/reel/carousel).",
        "- Fal/designed slots (fal_design, fal_story, fal_only_*, designed_*) MUST include `catalog_slot_key`.",
        "- `organic_post` / `organic_carousel` / `organic_story_still` MAY omit `catalog_slot_key` (gallery-only).",
        "- Do NOT repeat the same `catalog_slot_key` twice in one mission when alternatives exist.",
        "- Do NOT use legacy Remotion names (`campaign_post`, `daily_story`, `event_story`) — use `slot_key` above.",
    ]
    return "\n".join(lines) + "\n"


def target_format_for_assignment(role: str, pipeline: str) -> str | None:
    """Expected catalog `format` for a production assignment; None = optional."""
    role_l = (role or "").strip().lower()
    pipeline_l = (pipeline or "").strip().lower()
    if pipeline_l == "gallery_photo" and role_l == "organic_post":
        return None
    if pipeline_l == "story_still" or role_l == "organic_story_still":
        return None
    if pipeline_l == "carousel_gallery" or role_l == "organic_carousel":
        return "carousel"
    if "reel" in role_l or pipeline_l in ("fal_reel", "fal_only_reel"):
        return "reel"
    if "story" in role_l or pipeline_l in ("fal_story", "fal_only_story"):
        return "story"
    if role_l in (
        "designed_post",
        "designed_typography",
        "fal_designed_post",
        "fal_only_post",
    ) or pipeline_l in ("fal_design", "fal_only_post"):
        return "post"
    return None


def catalog_slot_key_valid(
    key: str,
    role: str,
    pipeline: str,
    catalog_slots: list[dict[str, str]],
) -> bool:
    if not key or not catalog_slots:
        return False
    by_key = {s["slot_key"]: s for s in catalog_slots}
    slot = by_key.get(key)
    if not slot:
        return False
    target = target_format_for_assignment(role, pipeline)
    if target is None:
        return True
    return str(slot.get("format") or "") == target


def pick_catalog_slot_key(
    role: str,
    pipeline: str,
    catalog_slots: list[dict[str, str]],
    used_keys: set[str],
) -> str | None:
    target = target_format_for_assignment(role, pipeline)
    if target is None or not catalog_slots:
        return None
    candidates = [
        s for s in catalog_slots if str(s.get("format") or "") == target
    ]
    role_l = (role or "").strip().lower()
    pipeline_l = (pipeline or "").strip().lower()
    role_aligned = [
        s
        for s in candidates
        if str(s.get("slot_role") or "").strip().lower() == role_l
        or str(s.get("pipeline") or "").strip().lower() == pipeline_l
    ]
    if role_aligned:
        candidates = role_aligned
    for slot in candidates:
        key = str(slot.get("slot_key") or "")
        if key and key not in used_keys:
            return key
    return str(candidates[0]["slot_key"]) if candidates else None


def resolve_catalog_slot_key(
    entry: dict[str, Any],
    catalog_slots: list[dict[str, str]] | None,
    used_keys: set[str],
) -> str | None:
    if not catalog_slots:
        return None
    role = str(entry.get("slot_role") or "")
    pipeline = str(entry.get("pipeline") or "")
    existing = str(entry.get("catalog_slot_key") or "").strip()
    if existing and catalog_slot_key_valid(existing, role, pipeline, catalog_slots):
        return existing
    return pick_catalog_slot_key(role, pipeline, catalog_slots, used_keys)


def apply_catalog_slot_to_entry(
    entry: dict[str, Any],
    catalog_slots: list[dict[str, str]] | None,
    used_keys: set[str],
) -> None:
    key = resolve_catalog_slot_key(entry, catalog_slots, used_keys)
    if key:
        entry["catalog_slot_key"] = key
        used_keys.add(key)
        if catalog_slots:
            by_key = {str(s.get("slot_key") or ""): s for s in catalog_slots}
            label = str((by_key.get(key) or {}).get("label_tr") or "").strip()
            if label:
                entry["catalog_slot_label"] = label
    else:
        entry.pop("catalog_slot_key", None)
        entry.pop("catalog_slot_label", None)
