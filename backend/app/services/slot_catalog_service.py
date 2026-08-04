"""Production slot catalog — read/write service."""

from __future__ import annotations

import json
import uuid
from typing import Any

import structlog
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.crew.industry_playbooks import normalize_industry_id
from app.services.brand_service_profile_service import canonical_sector_from_category
from app.models.brand_context import BrandContext
from app.models.slot_catalog import (
    CanonicalSector,
    ProductionSlotDefinition,
    TenantSlotAssignment,
)

logger = structlog.get_logger()

_DEFAULT_SLOT_FACILITIES: dict[str, bool] = {
    "pool": True,
    "dj_stage": True,
    "full_menu": True,
    "spa": True,
    "outdoor_terrace": True,
    "private_events": True,
    "live_music": True,
    "classes": True,
    "kids_area": True,
    "delivery": True,
    # Opt-in service surface — OFF until brand enables
    "hiring": False,
    "events_calendar": False,
    "wedding_photography": False,
    # Cocktail / happy-hour — OFF by default (kahvaltı venues must not get wine creatives)
    "bar": False,
}

_OPT_IN_FACILITIES = frozenset({"hiring", "events_calendar", "wedding_photography", "bar"})

_FACILITY_LABELS_TR: dict[str, str] = {
    "pool": "Havuz",
    "dj_stage": "DJ sahnesi",
    "full_menu": "Tam menü",
    "spa": "Spa",
    "outdoor_terrace": "Açık teras",
    "private_events": "Özel etkinlik",
    "live_music": "Canlı müzik",
    "classes": "Grup dersi",
    "kids_area": "Çocuk alanı",
    "delivery": "Teslimat",
    "hiring": "İş ilanı / kariyer",
    "events_calendar": "Etkinlik takvimi",
    "wedding_photography": "Düğün fotoğraf / video",
    "bar": "Bar / kokteyl / happy hour",
}

_FACILITY_HINTS_TR: dict[str, str] = {
    "pool": "Havuz yoksa kapatabilirsiniz",
    "dj_stage": "DJ sahnesi yoksa kapatabilirsiniz",
    "full_menu": "Tam menü yoksa kapatabilirsiniz",
    "spa": "Spa yoksa kapatabilirsiniz",
    "outdoor_terrace": "Açık teras yoksa kapatabilirsiniz",
    "private_events": "Özel etkinlik alanı yoksa kapatabilirsiniz",
    "live_music": "Canlı müzik yoksa kapatabilirsiniz",
    "classes": "Grup dersi yoksa kapatabilirsiniz",
    "kids_area": "Çocuk alanı yoksa kapatabilirsiniz",
    "delivery": "Teslimat yoksa kapatabilirsiniz",
    "hiring": "İş ilanı içerikleri için açın",
    "events_calendar": "Etkinlik takvimi / program duyuruları için açın",
    "wedding_photography": "Düğün fotoğraf / video stüdyosu slotları için açın",
    "bar": "Kokteyl, şarap veya happy hour servisi varsa açın",
}

_WEDDING_PHOTOGRAPHY_CATEGORIES = frozenset({
    "wedding_photography",
    "wedding_photographer",
})


def is_wedding_photography_surface(*, category: str | None = None) -> bool:
    """True when tenant is a wedding photography/videography studio under wedding_event."""
    return (category or "").strip().lower() in _WEDDING_PHOTOGRAPHY_CATEGORIES


def photography_wedding_facility_defaults() -> dict[str, bool]:
    """Venue amenities off; photography opt-in on — for studio tenants on wedding_event."""
    facilities = dict(_DEFAULT_SLOT_FACILITIES)
    facilities.update({
        "wedding_photography": True,
        "outdoor_terrace": False,
        "dj_stage": False,
        "live_music": False,
        "pool": False,
        "spa": False,
        "full_menu": False,
        "kids_area": False,
        "delivery": False,
        "classes": False,
        "private_events": True,
    })
    return facilities


# Fixed 7 shelves — mirrors apps/web brand-template-library BRAND_LIBRARY_SLOT_SPECS keys.
LIBRARY_SHELF_SPECS: list[dict[str, Any]] = [
    {"key": "daily_story", "label_tr": "Günlük Story", "label_en": "Daily Story", "format": "story", "sort_order": 1},
    {"key": "event_story", "label_tr": "Etkinlik Story", "label_en": "Event Story", "format": "story", "sort_order": 2},
    {"key": "campaign_post", "label_tr": "Kampanya Post", "label_en": "Campaign Post", "format": "post", "sort_order": 3},
    {"key": "editorial_story", "label_tr": "Editorial Story", "label_en": "Editorial Story", "format": "story", "sort_order": 4},
    {"key": "social_proof", "label_tr": "Sosyal Kanıt", "label_en": "Social Proof", "format": "story", "sort_order": 5},
    {"key": "social_proof_post", "label_tr": "Sosyal Kanıt Post", "label_en": "Social Proof Post", "format": "post", "sort_order": 6},
    {"key": "ad_creative_post", "label_tr": "Reklam Kreatifi", "label_en": "Ad Creative", "format": "post", "sort_order": 7},
]


def default_slot_facilities() -> dict[str, bool]:
    return dict(_DEFAULT_SLOT_FACILITIES)


def list_library_shelves() -> list[dict[str, Any]]:
    return [dict(row) for row in LIBRARY_SHELF_SPECS]


def resolve_facilities_dict(raw: dict[str, Any] | None = None) -> dict[str, bool]:
    facilities = dict(_DEFAULT_SLOT_FACILITIES)
    if not isinstance(raw, dict):
        return facilities
    for key, value in raw.items():
        if key in facilities and isinstance(value, bool):
            facilities[key] = value
    return facilities


def facility_options(facilities: dict[str, bool]) -> list[dict[str, Any]]:
    return [
        {
            "key": key,
            "enabled": bool(facilities.get(key, _DEFAULT_SLOT_FACILITIES[key])),
            "label_tr": _FACILITY_LABELS_TR.get(key, key),
            "hint_tr": _FACILITY_HINTS_TR.get(key, ""),
            "opt_in": key in _OPT_IN_FACILITIES,
        }
        for key in _DEFAULT_SLOT_FACILITIES
    ]


def _parse_facility_from_tag(tag: str) -> str | None:
    if not tag.startswith("requires:"):
        return None
    key = tag[len("requires:"):]
    return key if key in _DEFAULT_SLOT_FACILITIES else None


def required_facilities_from_tags(optional_tags: list | None) -> list[str]:
    out: list[str] = []
    for tag in optional_tags or []:
        facility = _parse_facility_from_tag(str(tag))
        if facility and facility not in out:
            out.append(facility)
    return out


def _slot_enabled_by_facilities(optional_tags: list | None, facilities: dict[str, bool]) -> bool:
    if not optional_tags:
        return True
    for tag in optional_tags:
        facility = _parse_facility_from_tag(str(tag))
        if facility and facilities.get(facility) is False:
            return False
    return True


def validate_format_coverage(formats: list[str]) -> dict[str, Any]:
    """Require at least one post-like and one story format among effective slots."""
    normalized = {(f or "").strip().lower() for f in formats}
    has_post = bool(normalized & {"post", "carousel"})
    has_story = "story" in normalized
    errors: list[str] = []
    if not has_post:
        errors.append("at_least_one_post_required")
    if not has_story:
        errors.append("at_least_one_story_required")
    return {
        "effective_enabled_count": len(formats),
        "has_post": has_post,
        "has_story": has_story,
        "ok": not errors,
        "errors": errors,
    }


async def _load_brand_context(
    db: AsyncSession, workspace_id: uuid.UUID,
) -> BrandContext | None:
    result = await db.execute(
        select(BrandContext).where(BrandContext.workspace_id == workspace_id)
    )
    return result.scalar_one_or_none()


async def load_brand_slot_facilities(db: AsyncSession, workspace_id: uuid.UUID) -> dict[str, bool]:
    """Read brand_theme.slot_facilities — venue keys default ON; opt-in keys default OFF."""
    result = await db.execute(
        select(BrandContext.brand_theme).where(BrandContext.workspace_id == workspace_id)
    )
    row = result.scalar_one_or_none()
    if not isinstance(row, dict):
        return default_slot_facilities()
    raw = row.get("slot_facilities") or row.get("slotFacilities")
    return resolve_facilities_dict(raw if isinstance(raw, dict) else None)


# Back-compat alias for feed_director / bootstrap callers.
_load_brand_slot_facilities = load_brand_slot_facilities


# Playbook keys → slot-pack sector_id (pack SSOT). Keep aligned with
# apps/web sector-production-profile SECTOR_ALIASES / sector-slot-pack.
_PLAYBOOK_TO_PACK_SECTOR: dict[str, str] = {
    "fitness": "fitness_gym",
    "nightclub_lounge": "nightclub",
    "fashion_retail": "fashion_boutique",
    # bakery playbook key cafe_bakery — pack is bakery_patisserie (coffee stays coffee_shop)
    "bakery": "bakery_patisserie",
    "patisserie": "bakery_patisserie",
    "pastane": "bakery_patisserie",
    "wedding_photography": "wedding_event",
    "wedding_photographer": "wedding_event",
    "hotel_resort": "hospitality",
    "hotel": "hospitality",
    "jewelry": "jewelry_accessories",
    "jewellery": "jewelry_accessories",
    "photography": "agency_services",
    "photo_studio": "agency_services",
}


def _normalize_sector_slug(value: str | None) -> str:
    """Normalize to canonical *slot pack* sector_id (not playbook key)."""
    raw = (value or "").strip().lower().replace(" ", "_").replace("&", "_")
    if not raw:
        return ""
    if raw in _PLAYBOOK_TO_PACK_SECTOR:
        return _PLAYBOOK_TO_PACK_SECTOR[raw]
    # Prefer direct pack id when already canonical
    from app.data.sector_slot_pack import SLOT_KEYS_BY_SECTOR

    if raw in SLOT_KEYS_BY_SECTOR:
        return raw
    playbook = normalize_industry_id(raw)
    if playbook in _PLAYBOOK_TO_PACK_SECTOR:
        return _PLAYBOOK_TO_PACK_SECTOR[playbook]
    if playbook in SLOT_KEYS_BY_SECTOR:
        return playbook
    return playbook


async def resolve_workspace_sector_id(db: AsyncSession, workspace_id: uuid.UUID) -> str | None:
    """Resolve canonical sector_id from brand_service_profile.category or business_type."""
    result = await db.execute(
        select(BrandContext.brand_service_profile, BrandContext.business_type).where(
            BrandContext.workspace_id == workspace_id
        )
    )
    row = result.one_or_none()
    if not row:
        return None

    profile, business_type = row
    category = None
    if isinstance(profile, dict):
        category = profile.get("category")
    elif isinstance(profile, str) and profile.strip():
        try:
            parsed = json.loads(profile)
            if isinstance(parsed, dict):
                category = parsed.get("category")
        except json.JSONDecodeError:
            category = None

    if category:
        candidate = _normalize_sector_slug(canonical_sector_from_category(str(category)))
    else:
        candidate = _normalize_sector_slug(str(business_type or ""))
    if not candidate:
        return None

    sector = await db.get(CanonicalSector, candidate)
    if sector:
        return sector.sector_id

    # Alias lookup
    result = await db.execute(
        select(CanonicalSector).where(CanonicalSector.is_active.is_(True))
    )
    for item in result.scalars().all():
        aliases = [str(a).lower() for a in (item.aliases or [])]
        if candidate in aliases or candidate == item.sector_id:
            return item.sector_id
    return candidate


async def list_sectors(db: AsyncSession, *, active_only: bool = True) -> list[CanonicalSector]:
    q = select(CanonicalSector).order_by(CanonicalSector.sort_order, CanonicalSector.sector_id)
    if active_only:
        q = q.where(CanonicalSector.is_active.is_(True))
    result = await db.execute(q)
    return list(result.scalars().all())


async def list_slot_definitions(
    db: AsyncSession,
    *,
    sector_id: str | None = None,
    active_only: bool = True,
    workspace_id: uuid.UUID | None = None,
    include_brand_owned: bool = False,
) -> list[ProductionSlotDefinition]:
    """List catalog slots.

    By default returns sector-global rows only (owner_workspace_id IS NULL).
    Pass workspace_id to also include that brand's private custom slots.
    Pass include_brand_owned=True with no workspace to return all rows (admin).
    """
    q = select(ProductionSlotDefinition).order_by(
        ProductionSlotDefinition.sector_id,
        ProductionSlotDefinition.sort_order,
        ProductionSlotDefinition.slot_key,
    )
    if sector_id:
        q = q.where(ProductionSlotDefinition.sector_id == sector_id)
    if active_only:
        q = q.where(ProductionSlotDefinition.status == "active")

    if workspace_id is not None:
        q = q.where(
            or_(
                ProductionSlotDefinition.owner_workspace_id.is_(None),
                ProductionSlotDefinition.owner_workspace_id == workspace_id,
            )
        )
    elif not include_brand_owned:
        # Column may be missing until migration 0041 — getattr-safe filter via IS NULL.
        q = q.where(ProductionSlotDefinition.owner_workspace_id.is_(None))

    result = await db.execute(q)
    return list(result.scalars().all())


async def get_slot_definition(
    db: AsyncSession, slot_key: str,
) -> ProductionSlotDefinition | None:
    return await db.get(ProductionSlotDefinition, slot_key)


async def list_tenant_assignments(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    enabled_only: bool = False,
) -> list[TenantSlotAssignment]:
    q = (
        select(TenantSlotAssignment)
        .where(TenantSlotAssignment.workspace_id == workspace_id)
        .order_by(TenantSlotAssignment.priority, TenantSlotAssignment.slot_key)
    )
    if enabled_only:
        q = q.where(TenantSlotAssignment.enabled.is_(True))
    result = await db.execute(q)
    return list(result.scalars().all())


async def list_tenant_enabled_slots(
    db: AsyncSession,
    workspace_id: uuid.UUID,
) -> list[dict[str, Any]]:
    """Return enabled assignments joined with slot definitions."""
    assignments = await list_tenant_assignments(db, workspace_id, enabled_only=True)
    if not assignments:
        return []

    keys = [a.slot_key for a in assignments]
    slots_result = await db.execute(
        select(ProductionSlotDefinition).where(ProductionSlotDefinition.slot_key.in_(keys))
    )
    slot_by_key = {s.slot_key: s for s in slots_result.scalars().all()}

    out: list[dict[str, Any]] = []
    for assignment in assignments:
        slot = slot_by_key.get(assignment.slot_key)
        if not slot or slot.status != "active":
            continue
        out.append({
            "assignment": assignment,
            "slot": slot,
        })
    out.sort(key=lambda row: (row["assignment"].priority, row["slot"].sort_order))
    return out


async def bootstrap_tenant_slot_assignments(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    sector_id: str | None = None,
    assignment_source: str = "auto_default",
) -> dict[str, Any]:
    """Copy sector enabled_by_default slots into tenant_slot_assignments."""
    resolved_sector = sector_id or await resolve_workspace_sector_id(db, workspace_id)
    if not resolved_sector:
        raise ValueError("workspace sector could not be resolved")

    # Bootstrap only sector-global defaults — never other brands' private slots.
    defaults = await list_slot_definitions(
        db,
        sector_id=resolved_sector,
        active_only=True,
        workspace_id=None,
        include_brand_owned=False,
    )
    facilities = await _load_brand_slot_facilities(db, workspace_id)
    defaults = [
        s for s in defaults
        if s.enabled_by_default
        and getattr(s, "owner_workspace_id", None) is None
        and _slot_enabled_by_facilities(s.optional_tags, facilities)
    ]
    if not defaults:
        raise ValueError(f"no default slots for sector {resolved_sector}")

    existing_result = await db.execute(
        select(TenantSlotAssignment).where(TenantSlotAssignment.workspace_id == workspace_id)
    )
    existing = {row.slot_key: row for row in existing_result.scalars().all()}

    created = 0
    updated = 0
    for idx, slot in enumerate(defaults):
        priority = (idx + 1) * 10
        current = existing.get(slot.slot_key)
        if current:
            if current.assignment_source == "operator":
                continue
            current.enabled = True
            current.priority = priority
            current.assignment_source = assignment_source
            updated += 1
        else:
            db.add(
                TenantSlotAssignment(
                    workspace_id=workspace_id,
                    slot_key=slot.slot_key,
                    enabled=True,
                    priority=priority,
                    assignment_source=assignment_source,
                )
            )
            created += 1

    await db.flush()
    enabled_count = len([s for s in defaults])
    logger.info(
        "tenant_slot_bootstrap",
        workspace_id=str(workspace_id),
        sector_id=resolved_sector,
        created=created,
        updated=updated,
        enabled_count=enabled_count,
    )
    return {
        "workspace_id": workspace_id,
        "sector_id": resolved_sector,
        "created": created,
        "updated": updated,
        "enabled_count": enabled_count,
    }


async def upsert_tenant_assignments(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    assignments: list[dict[str, Any]],
    *,
    validate_coverage: bool = False,
) -> list[TenantSlotAssignment]:
    """Bulk upsert operator/onboarding slot assignments.

    Coverage checks stay opt-in so existing gallery/onboarding writers are unchanged.
    Admin UIs should call preview/overview before persist, or pass validate_coverage.
    """
    out: list[TenantSlotAssignment] = []
    for item in assignments:
        slot_key = str(item["slot_key"])
        slot = await get_slot_definition(db, slot_key)
        if not slot:
            raise ValueError(f"unknown slot_key: {slot_key}")

        result = await db.execute(
            select(TenantSlotAssignment).where(
                TenantSlotAssignment.workspace_id == workspace_id,
                TenantSlotAssignment.slot_key == slot_key,
            )
        )
        row = result.scalar_one_or_none()
        if row:
            row.enabled = bool(item.get("enabled", True))
            row.priority = int(item.get("priority", row.priority))
            row.assignment_source = str(item.get("assignment_source", "operator"))
            if "notes" in item:
                row.notes = item.get("notes")
            if "customization" in item and item.get("customization") is not None:
                pack = item.get("customization")
                if not isinstance(pack, dict):
                    raise ValueError(f"invalid_customization for {slot_key}: must be object")
                row.customization = dict(pack)
            out.append(row)
        else:
            customization = item.get("customization")
            if customization is not None and not isinstance(customization, dict):
                raise ValueError(f"invalid_customization for {slot_key}: must be object")
            row = TenantSlotAssignment(
                workspace_id=workspace_id,
                slot_key=slot_key,
                enabled=bool(item.get("enabled", True)),
                priority=int(item.get("priority", 100)),
                assignment_source=str(item.get("assignment_source", "operator")),
                notes=item.get("notes"),
                customization=dict(customization or {}),
            )
            db.add(row)
            out.append(row)
    await db.flush()

    if validate_coverage:
        overview = await build_tenant_slot_overview(db, workspace_id)
        if not overview["coverage"]["ok"]:
            raise ValueError(
                "coverage_validation_failed:"
                + ",".join(overview["coverage"]["errors"])
            )
    return out


async def update_brand_slot_facilities(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    patch: dict[str, bool],
    *,
    sync_assignments: bool = False,
) -> dict[str, Any]:
    """Persist brand_theme.slot_facilities (partial patch)."""
    ctx = await _load_brand_context(db, workspace_id)
    if not ctx:
        raise ValueError("brand_context not found for workspace")

    unknown = [k for k in patch if k not in _DEFAULT_SLOT_FACILITIES]
    if unknown:
        raise ValueError(f"unknown facility keys: {', '.join(sorted(unknown))}")

    theme = dict(ctx.brand_theme) if isinstance(ctx.brand_theme, dict) else {}
    current = resolve_facilities_dict(
        theme.get("slot_facilities")
        if isinstance(theme.get("slot_facilities"), dict)
        else theme.get("slotFacilities") if isinstance(theme.get("slotFacilities"), dict) else None
    )
    for key, value in patch.items():
        if isinstance(value, bool):
            current[key] = value

    theme["slot_facilities"] = current
    theme.pop("slotFacilities", None)
    ctx.brand_theme = theme
    flag_modified(ctx, "brand_theme")
    await db.flush()

    synced_disabled = 0
    if sync_assignments:
        sync_result = await sync_facilities_to_assignments(db, workspace_id)
        synced_disabled = int(sync_result["disabled"])

    sector_id = await resolve_workspace_sector_id(db, workspace_id)
    overview = await build_tenant_slot_overview(db, workspace_id)
    return {
        "workspace_id": workspace_id,
        "sector_id": sector_id,
        "facilities": current,
        "options": facility_options(current),
        "synced_disabled": synced_disabled,
        "coverage_ok": overview["coverage"]["ok"],
        "coverage_errors": list(overview["coverage"]["errors"]),
    }


async def sync_facilities_to_assignments(
    db: AsyncSession,
    workspace_id: uuid.UUID,
) -> dict[str, Any]:
    """Sync facility gates ↔ assignments: disable blocked, enable/create unblocked defaults."""
    facilities = await _load_brand_slot_facilities(db, workspace_id)
    assignments = await list_tenant_assignments(db, workspace_id)
    assignment_map = {a.slot_key: a for a in assignments}
    disabled_keys: list[str] = []
    enabled_keys: list[str] = []

    for assignment in assignments:
        if not assignment.enabled:
            continue
        slot = await get_slot_definition(db, assignment.slot_key)
        if not slot:
            continue
        if _slot_enabled_by_facilities(slot.optional_tags, facilities):
            continue
        assignment.enabled = False
        if assignment.assignment_source != "operator":
            assignment.assignment_source = "facility_sync"
        disabled_keys.append(assignment.slot_key)

    sector_id = await resolve_workspace_sector_id(db, workspace_id)
    if sector_id:
        sector_slots = await list_slot_definitions(
            db, sector_id=sector_id, active_only=True,
        )
        for idx, slot in enumerate(sector_slots):
            req = required_facilities_from_tags(slot.optional_tags)
            if not req:
                continue
            if not slot.enabled_by_default:
                continue
            if not _slot_enabled_by_facilities(slot.optional_tags, facilities):
                continue
            current = assignment_map.get(slot.slot_key)
            if current:
                if current.assignment_source == "operator" and not current.enabled:
                    continue
                if not current.enabled:
                    current.enabled = True
                    if current.assignment_source != "operator":
                        current.assignment_source = "facility_sync"
                    enabled_keys.append(slot.slot_key)
            else:
                db.add(
                    TenantSlotAssignment(
                        workspace_id=workspace_id,
                        slot_key=slot.slot_key,
                        enabled=True,
                        priority=(idx + 1) * 10,
                        assignment_source="facility_sync",
                    )
                )
                enabled_keys.append(slot.slot_key)

    await db.flush()
    overview = await build_tenant_slot_overview(db, workspace_id)
    sector_id = overview.get("sector_id")
    logger.info(
        "tenant_slot_facility_sync",
        workspace_id=str(workspace_id),
        disabled=len(disabled_keys),
        enabled=len(enabled_keys),
    )
    return {
        "workspace_id": workspace_id,
        "sector_id": sector_id,
        "disabled": len(disabled_keys),
        "disabled_slot_keys": disabled_keys,
        "enabled": len(enabled_keys),
        "enabled_slot_keys": enabled_keys,
        "coverage": overview["coverage"],
    }


def _compute_effective_rows(
    *,
    sector_slots: list[ProductionSlotDefinition],
    assignments: list[TenantSlotAssignment] | list[dict[str, Any]],
    facilities: dict[str, bool],
) -> list[dict[str, Any]]:
    """
    Effective semantics mirror production:
    - with assignment rows: effective = assignment.enabled (facility is advisory)
    - without rows: effective = enabled_by_default ∩ facilities ∩ active
    """
    assignment_map: dict[str, Any] = {}
    for row in assignments:
        if isinstance(row, dict):
            assignment_map[str(row["slot_key"])] = row
        else:
            assignment_map[str(getattr(row, "slot_key"))] = row

    using_defaults = len(assignment_map) == 0
    out: list[dict[str, Any]] = []

    for slot in sector_slots:
        req = required_facilities_from_tags(slot.optional_tags)
        facility_blocked = not _slot_enabled_by_facilities(slot.optional_tags, facilities)
        assigned_row = assignment_map.get(slot.slot_key)

        if using_defaults:
            if slot.status != "active":
                effective = False
                blocked_by: str | None = "inactive"
            elif not slot.enabled_by_default:
                effective = False
                blocked_by = "not_default"
            elif facility_blocked:
                effective = False
                blocked_by = "facility"
            else:
                effective = True
                blocked_by = None
            out.append({
                "slot_key": slot.slot_key,
                "slot": slot,
                "assigned": False,
                "assignment_enabled": None,
                "assignment_source": None,
                "priority": None,
                "facility_blocked": facility_blocked,
                "required_facilities": req,
                "effective_enabled": effective,
                "blocked_by": blocked_by,
            })
            continue

        if assigned_row is None:
            # Unassigned catalog keys are not in the production active set.
            out.append({
                "slot_key": slot.slot_key,
                "slot": slot,
                "assigned": False,
                "assignment_enabled": None,
                "assignment_source": None,
                "priority": None,
                "facility_blocked": facility_blocked,
                "required_facilities": req,
                "effective_enabled": False,
                "blocked_by": "not_default",
            })
            continue

        if isinstance(assigned_row, dict):
            assignment_enabled = bool(assigned_row.get("enabled", True))
            assignment_source = str(assigned_row.get("assignment_source") or "operator")
            priority = int(assigned_row.get("priority") or 100)
        else:
            assignment_enabled = bool(getattr(assigned_row, "enabled", True))
            assignment_source = str(getattr(assigned_row, "assignment_source", None) or "operator")
            priority = int(getattr(assigned_row, "priority", 100) or 100)

        if slot.status != "active":
            effective = False
            blocked_by = "inactive"
        elif not assignment_enabled:
            effective = False
            blocked_by = "assignment"
        else:
            effective = True
            blocked_by = None

        out.append({
            "slot_key": slot.slot_key,
            "slot": slot,
            "assigned": True,
            "assignment_enabled": assignment_enabled,
            "assignment_source": assignment_source,
            "priority": priority,
            "facility_blocked": facility_blocked,
            "required_facilities": req,
            "effective_enabled": effective,
            "blocked_by": blocked_by,
        })

    out.sort(key=lambda r: (r["slot"].sort_order, r["slot_key"]))
    return out


def _build_shelf_summaries(effective_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    shelves: list[dict[str, Any]] = []
    for spec in LIBRARY_SHELF_SPECS:
        key = spec["key"]
        related = [r for r in effective_rows if (r["slot"].library_slot_key or None) == key]
        shelves.append({
            **spec,
            "catalog_count": len(related),
            "assigned_count": sum(1 for r in related if r["assigned"]),
            "assignment_enabled_count": sum(
                1 for r in related if r.get("assignment_enabled") is True
            ),
            "effective_count": sum(1 for r in related if r["effective_enabled"]),
            "facility_blocked_count": sum(1 for r in related if r["facility_blocked"]),
        })
    return shelves


def _coverage_from_effective(effective_rows: list[dict[str, Any]]) -> dict[str, Any]:
    formats = [
        str(r["slot"].format)
        for r in effective_rows
        if r["effective_enabled"]
    ]
    return validate_format_coverage(formats)


async def build_tenant_slot_overview(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    facilities_override: dict[str, bool] | None = None,
    assignments_override: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    sector_id = await resolve_workspace_sector_id(db, workspace_id)
    facilities = (
        resolve_facilities_dict(facilities_override)
        if facilities_override is not None
        else await _load_brand_slot_facilities(db, workspace_id)
    )

    sector_slots = (
        await list_slot_definitions(
            db,
            sector_id=sector_id,
            active_only=False,
            workspace_id=workspace_id,
        )
        if sector_id
        else []
    )
    # Prefer active; keep inactive for admin visibility when assigned.
    active_slots = [s for s in sector_slots if s.status == "active"]
    inactive_by_key = {s.slot_key: s for s in sector_slots if s.status != "active"}

    if assignments_override is not None:
        # Merge override onto existing so preview can be partial.
        existing = await list_tenant_assignments(db, workspace_id)
        merged: dict[str, Any] = {
            a.slot_key: {
                "slot_key": a.slot_key,
                "enabled": a.enabled,
                "priority": a.priority,
                "assignment_source": a.assignment_source,
            }
            for a in existing
        }
        for item in assignments_override:
            merged[str(item["slot_key"])] = {
                "slot_key": str(item["slot_key"]),
                "enabled": bool(item.get("enabled", True)),
                "priority": int(item.get("priority", 100)),
                "assignment_source": str(item.get("assignment_source") or "operator"),
            }
        assignments: list[Any] = list(merged.values())
        # Include inactive slots referenced by assignments for completeness.
        slot_list = list(active_slots)
        known = {s.slot_key for s in slot_list}
        for key in merged:
            if key not in known and key in inactive_by_key:
                slot_list.append(inactive_by_key[key])
                known.add(key)
    else:
        existing_assignments = await list_tenant_assignments(db, workspace_id)
        assignments = list(existing_assignments)
        slot_list = list(active_slots)
        known = {s.slot_key for s in slot_list}
        for a in existing_assignments:
            if a.slot_key not in known and a.slot_key in inactive_by_key:
                slot_list.append(inactive_by_key[a.slot_key])
                known.add(a.slot_key)

    effective_rows = _compute_effective_rows(
        sector_slots=slot_list,
        assignments=assignments,
        facilities=facilities,
    )
    coverage = _coverage_from_effective(effective_rows)
    return {
        "workspace_id": workspace_id,
        "sector_id": sector_id,
        "facilities": facilities,
        "facility_options": facility_options(facilities),
        "shelves": _build_shelf_summaries(effective_rows),
        "slots": effective_rows,
        "coverage": coverage,
        "assignment_row_count": len(assignments),
        "using_sector_defaults": len(assignments) == 0,
    }


async def preview_tenant_slot_changes(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    facilities_patch: dict[str, bool] | None = None,
    assignments_override: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    current = await build_tenant_slot_overview(db, workspace_id)
    current_facilities = dict(current["facilities"])
    proposed_facilities = dict(current_facilities)
    if facilities_patch:
        unknown = [k for k in facilities_patch if k not in _DEFAULT_SLOT_FACILITIES]
        if unknown:
            raise ValueError(f"unknown facility keys: {', '.join(sorted(unknown))}")
        for key, value in facilities_patch.items():
            if isinstance(value, bool):
                proposed_facilities[key] = value

    proposed = await build_tenant_slot_overview(
        db,
        workspace_id,
        facilities_override=proposed_facilities,
        assignments_override=assignments_override,
    )

    current_effective = {
        r["slot_key"] for r in current["slots"] if r["effective_enabled"]
    }
    proposed_effective = {
        r["slot_key"] for r in proposed["slots"] if r["effective_enabled"]
    }
    would_enable = sorted(proposed_effective - current_effective)
    would_disable = sorted(current_effective - proposed_effective)

    would_disable_by_assignment: list[str] = []
    would_disable_by_facility: list[str] = []
    for key in would_disable:
        row = next((r for r in proposed["slots"] if r["slot_key"] == key), None)
        if not row:
            would_disable_by_assignment.append(key)
            continue
        if row.get("blocked_by") == "facility":
            would_disable_by_facility.append(key)
        else:
            would_disable_by_assignment.append(key)

    recommended_disable_by_facility = sorted(
        r["slot_key"]
        for r in proposed["slots"]
        if r["facility_blocked"] and r.get("assignment_enabled") is True
    )

    return {
        "workspace_id": workspace_id,
        "sector_id": proposed["sector_id"],
        "facilities": proposed_facilities,
        "shelves": proposed["shelves"],
        "slots": proposed["slots"],
        "coverage": proposed["coverage"],
        "would_enable": would_enable,
        "would_disable_by_assignment": would_disable_by_assignment,
        "would_disable_by_facility": would_disable_by_facility,
        "recommended_disable_by_facility": recommended_disable_by_facility,
        "using_sector_defaults": proposed["using_sector_defaults"],
    }


async def reset_tenant_slot_defaults(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    sector_id: str | None = None,
    reset_facilities: bool = True,
    reset_assignments: bool = True,
    force_operator: bool = True,
    facility_overrides: dict[str, bool] | None = None,
) -> dict[str, Any]:
    """Reset facilities to sector-aware defaults and/or re-bootstrap sector default assignments."""
    resolved_sector = sector_id or await resolve_workspace_sector_id(db, workspace_id)
    if not resolved_sector:
        raise ValueError("workspace sector could not be resolved")

    facilities = await _load_brand_slot_facilities(db, workspace_id)
    facilities_reset = False
    if reset_facilities:
        target_facilities = dict(facility_overrides) if facility_overrides else dict(_DEFAULT_SLOT_FACILITIES)
        if facility_overrides is None:
            # Photography studio under wedding_event: venue amenities off, photo slots on.
            ctx = await _load_brand_context(db, workspace_id)
            sp = getattr(ctx, "brand_service_profile", None) if ctx else None
            category = ""
            if isinstance(sp, dict):
                category = str(sp.get("category") or "")
            elif isinstance(sp, str) and sp.strip():
                try:
                    parsed = json.loads(sp)
                    if isinstance(parsed, dict):
                        category = str(parsed.get("category") or "")
                except Exception:
                    category = ""
            if resolved_sector == "wedding_event" and is_wedding_photography_surface(category=category):
                target_facilities = photography_wedding_facility_defaults()
        update = await update_brand_slot_facilities(
            db,
            workspace_id,
            target_facilities,
            sync_assignments=False,
        )
        facilities = update["facilities"]
        facilities_reset = True

    created = 0
    updated = 0
    disabled = 0
    enabled_count = 0

    if reset_assignments:
        defaults = await list_slot_definitions(db, sector_id=resolved_sector, active_only=True)
        default_keys = {
            s.slot_key
            for s in defaults
            if s.enabled_by_default and _slot_enabled_by_facilities(s.optional_tags, facilities)
        }
        if not default_keys:
            raise ValueError(f"no default slots for sector {resolved_sector}")

        existing_result = await db.execute(
            select(TenantSlotAssignment).where(
                TenantSlotAssignment.workspace_id == workspace_id
            )
        )
        existing = {row.slot_key: row for row in existing_result.scalars().all()}

        for idx, slot in enumerate(
            [s for s in defaults if s.slot_key in default_keys],
            start=1,
        ):
            priority = idx * 10
            current = existing.get(slot.slot_key)
            if current:
                if current.assignment_source == "operator" and not force_operator:
                    continue
                current.enabled = True
                current.priority = priority
                current.assignment_source = "auto_default"
                updated += 1
            else:
                db.add(
                    TenantSlotAssignment(
                        workspace_id=workspace_id,
                        slot_key=slot.slot_key,
                        enabled=True,
                        priority=priority,
                        assignment_source="auto_default",
                    )
                )
                created += 1

        for slot_key, row in existing.items():
            if slot_key in default_keys:
                continue
            if row.assignment_source == "operator" and not force_operator:
                continue
            if row.enabled:
                row.enabled = False
                disabled += 1
            if force_operator or row.assignment_source != "operator":
                row.assignment_source = "auto_default"

        await db.flush()
        enabled_count = len(default_keys)

    logger.info(
        "tenant_slot_reset_defaults",
        workspace_id=str(workspace_id),
        sector_id=resolved_sector,
        facilities_reset=facilities_reset,
        created=created,
        updated=updated,
        disabled=disabled,
    )
    return {
        "workspace_id": workspace_id,
        "sector_id": resolved_sector,
        "facilities_reset": facilities_reset,
        "created": created,
        "updated": updated,
        "disabled": disabled,
        "enabled_count": enabled_count,
        "facilities": facilities,
    }
