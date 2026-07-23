"""
Slot catalog authoring — create/update/archive sectors & slot definitions.

Keeps the sector-bound catalog manageable for platform admin:
- Global sector slots (owner_workspace_id IS NULL)
- Brand-private custom slots (owner_workspace_id = tenant UUID)
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.production_slot_catalog_meta import (
    infer_design_template_type,
    infer_library_slot_key,
    infer_pipeline,
    infer_slot_role,
)
from app.models.slot_catalog import (
    CanonicalSector,
    ProductionSlotDefinition,
    TenantSlotAssignment,
)
from app.services.slot_catalog_service import LIBRARY_SHELF_SPECS, get_slot_definition

logger = structlog.get_logger()

SLOT_KEY_RX = re.compile(r"^[a-z][a-z0-9_]{2,127}$")
SECTOR_ID_RX = re.compile(r"^[a-z][a-z0-9_]{1,63}$")
SUFFIX_RX = re.compile(r"^[a-z][a-z0-9_]{1,80}$")

ALLOWED_SLOT_FORMATS = frozenset({"post", "story", "reel", "carousel"})
ALLOWED_SLOT_PIPELINES = frozenset({
    "fal_design",
    "fal_reel",
    "fal_story",
    "fal_only",
    "fal_only_story",
    "gallery_photo",
    "carousel_gallery",
    "premium_editorial",
    "organic",
})
ALLOWED_SLOT_ROLES = frozenset({
    "fal_designed_post",
    "fal_reel_motion",
    "campaign_story_motion",
    "organic_post",
    "organic_carousel",
    "organic_story",
    "gallery_photo",
    "designed_typography",
    "designed_post",
    "fal_only_post",
    "fal_only_story",
})
ALLOWED_DESIGN_TEMPLATE_TYPES = frozenset({
    "campaign_announcement",
    "event_special",
    "menu_highlight",
    "venue_showcase",
    "seasonal_promo",
    "social_proof",
    "daily_story",
    "announcement_formal",
    "reel_cover",
    "brand_identity",
})
ALLOWED_LIBRARY_SLOT_KEYS = frozenset(s["key"] for s in LIBRARY_SHELF_SPECS)
ALLOWED_TIERS = frozenset({"standard", "premium"})
ALLOWED_STATUSES = frozenset({"active", "archived"})


def normalize_slug(value: str) -> str:
    raw = (value or "").strip().lower().replace(" ", "_").replace("-", "_")
    raw = re.sub(r"[^a-z0-9_]+", "_", raw)
    return re.sub(r"_+", "_", raw).strip("_")


def validate_sector_id(sector_id: str) -> str:
    cleaned = normalize_slug(sector_id)
    if not SECTOR_ID_RX.match(cleaned):
        raise ValueError(
            "invalid_sector_id: use lowercase slug like beach_club or restaurant_cafe"
        )
    return cleaned


def validate_slot_key(slot_key: str) -> str:
    cleaned = normalize_slug(slot_key)
    if not SLOT_KEY_RX.match(cleaned):
        raise ValueError(
            "invalid_slot_key: use lowercase snake_case, 3–128 chars, start with a letter"
        )
    return cleaned


def validate_slot_suffix(suffix: str) -> str:
    cleaned = normalize_slug(suffix)
    if not SUFFIX_RX.match(cleaned):
        raise ValueError("invalid_slot_suffix: use lowercase snake_case like brunch_social_post")
    return cleaned


def build_catalog_slot_key(
    sector_id: str,
    suffix: str,
    *,
    owner_workspace_id: uuid.UUID | None = None,
) -> str:
    """Compose slot_key = {sector}_{suffix} or {sector}_brand_{short}_{suffix}."""
    sector = validate_sector_id(sector_id)
    clean_suffix = validate_slot_suffix(suffix)
    if owner_workspace_id is not None:
        short = str(owner_workspace_id).replace("-", "")[:8]
        return validate_slot_key(f"{sector}_brand_{short}_{clean_suffix}")
    return validate_slot_key(f"{sector}_{clean_suffix}")


def validate_slot_payload(data: dict[str, Any], *, partial: bool = False) -> dict[str, Any]:
    """Validate create/update fields. Raises ValueError with stable codes."""
    out: dict[str, Any] = {}

    if "format" in data or not partial:
        fmt = str(data.get("format") or "").strip().lower()
        if fmt not in ALLOWED_SLOT_FORMATS:
            raise ValueError(
                f"invalid_format: expected one of {sorted(ALLOWED_SLOT_FORMATS)}"
            )
        out["format"] = fmt

    if "pipeline" in data:
        pipeline = str(data.get("pipeline") or "").strip().lower()
        if pipeline and pipeline not in ALLOWED_SLOT_PIPELINES:
            raise ValueError(
                f"invalid_pipeline: expected one of {sorted(ALLOWED_SLOT_PIPELINES)}"
            )
        if pipeline:
            out["pipeline"] = pipeline
        elif not partial:
            out["pipeline"] = infer_pipeline(out["format"])
    elif not partial:
        out["pipeline"] = infer_pipeline(out["format"])

    if "slot_role" in data:
        role = str(data.get("slot_role") or "").strip().lower()
        if role and role not in ALLOWED_SLOT_ROLES:
            raise ValueError(
                f"invalid_slot_role: expected one of {sorted(ALLOWED_SLOT_ROLES)}"
            )
        if role:
            out["slot_role"] = role
        elif not partial:
            out["slot_role"] = infer_slot_role(out["format"])
    elif not partial:
        out["slot_role"] = infer_slot_role(out["format"])

    if "design_template_type" in data:
        dtype = str(data.get("design_template_type") or "").strip().lower()
        if dtype and dtype not in ALLOWED_DESIGN_TEMPLATE_TYPES:
            raise ValueError(
                "invalid_design_template_type: expected one of "
                f"{sorted(ALLOWED_DESIGN_TEMPLATE_TYPES)}"
            )
        if dtype:
            out["design_template_type"] = dtype
        elif not partial:
            out["design_template_type"] = "campaign_announcement"
    elif not partial:
        # Caller should pass slot_key for better inference; fallback campaign.
        out["design_template_type"] = "campaign_announcement"

    if "library_slot_key" in data:
        lib = data.get("library_slot_key")
        if lib is None or lib == "":
            out["library_slot_key"] = None
        else:
            lib_s = str(lib).strip().lower()
            if lib_s not in ALLOWED_LIBRARY_SLOT_KEYS:
                raise ValueError(
                    f"invalid_library_slot_key: expected one of {sorted(ALLOWED_LIBRARY_SLOT_KEYS)}"
                )
            out["library_slot_key"] = lib_s

    if "tier" in data or not partial:
        tier = str(data.get("tier") or "standard").strip().lower()
        if tier not in ALLOWED_TIERS:
            raise ValueError(f"invalid_tier: expected one of {sorted(ALLOWED_TIERS)}")
        out["tier"] = tier

    if "status" in data:
        status = str(data.get("status") or "").strip().lower()
        if status not in ALLOWED_STATUSES:
            raise ValueError(f"invalid_status: expected one of {sorted(ALLOWED_STATUSES)}")
        out["status"] = status

    for text_key in ("label_tr", "label_en"):
        if text_key in data or not partial:
            val = str(data.get(text_key) or "").strip()
            if not val:
                if not partial:
                    raise ValueError(f"missing_{text_key}")
            else:
                if len(val) > 160:
                    raise ValueError(f"{text_key}_too_long")
                out[text_key] = val

    if "match_signals" in data:
        signals = data.get("match_signals")
        if signals is not None and not isinstance(signals, dict):
            raise ValueError("invalid_match_signals: must be object")
        out["match_signals"] = dict(signals or {})

    if "prompt_pack" in data:
        pack = data.get("prompt_pack")
        if pack is not None and not isinstance(pack, dict):
            raise ValueError("invalid_prompt_pack: must be object")
        out["prompt_pack"] = dict(pack or {})

    if "optional_tags" in data:
        tags = data.get("optional_tags")
        if tags is not None and not isinstance(tags, list):
            raise ValueError("invalid_optional_tags: must be list")
        out["optional_tags"] = [str(t).strip() for t in (tags or []) if str(t).strip()]

    if "enabled_by_default" in data:
        out["enabled_by_default"] = bool(data.get("enabled_by_default"))

    if "sort_order" in data:
        out["sort_order"] = int(data.get("sort_order") or 0)

    return out


def slot_visible_to_workspace(
    slot: ProductionSlotDefinition,
    workspace_id: uuid.UUID | None,
) -> bool:
    """Global slots visible to all; brand-owned only to owner."""
    owner = getattr(slot, "owner_workspace_id", None)
    if owner is None:
        return True
    if workspace_id is None:
        return False
    return owner == workspace_id


async def create_sector(
    db: AsyncSession,
    payload: dict[str, Any],
) -> CanonicalSector:
    sector_id = validate_sector_id(str(payload.get("sector_id") or ""))
    existing = await db.get(CanonicalSector, sector_id)
    if existing:
        raise ValueError(f"sector_exists: {sector_id}")

    label_tr = str(payload.get("label_tr") or "").strip()
    label_en = str(payload.get("label_en") or "").strip()
    if not label_tr or not label_en:
        raise ValueError("missing_sector_labels")

    aliases_raw = payload.get("aliases") or []
    if not isinstance(aliases_raw, list):
        raise ValueError("invalid_aliases")
    aliases = [normalize_slug(str(a)) for a in aliases_raw if str(a).strip()]

    row = CanonicalSector(
        sector_id=sector_id,
        label_tr=label_tr[:120],
        label_en=label_en[:120],
        aliases=aliases,
        is_active=bool(payload.get("is_active", True)),
        sort_order=int(payload.get("sort_order") or 0),
    )
    db.add(row)
    await db.flush()
    logger.info("slot_catalog_sector_created", sector_id=sector_id)
    return row


async def update_sector(
    db: AsyncSession,
    sector_id: str,
    payload: dict[str, Any],
) -> CanonicalSector:
    row = await db.get(CanonicalSector, sector_id)
    if not row:
        raise ValueError(f"unknown_sector: {sector_id}")

    if "label_tr" in payload and str(payload["label_tr"]).strip():
        row.label_tr = str(payload["label_tr"]).strip()[:120]
    if "label_en" in payload and str(payload["label_en"]).strip():
        row.label_en = str(payload["label_en"]).strip()[:120]
    if "aliases" in payload:
        aliases_raw = payload.get("aliases") or []
        if not isinstance(aliases_raw, list):
            raise ValueError("invalid_aliases")
        row.aliases = [normalize_slug(str(a)) for a in aliases_raw if str(a).strip()]
    if "is_active" in payload:
        row.is_active = bool(payload["is_active"])
    if "sort_order" in payload:
        row.sort_order = int(payload["sort_order"] or 0)
    row.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return row


async def create_slot_definition(
    db: AsyncSession,
    payload: dict[str, Any],
    *,
    assign_to_owner: bool = True,
) -> ProductionSlotDefinition:
    sector_id = validate_sector_id(str(payload.get("sector_id") or ""))
    sector = await db.get(CanonicalSector, sector_id)
    if not sector:
        raise ValueError(f"unknown_sector: {sector_id}")

    owner_raw = payload.get("owner_workspace_id")
    owner_workspace_id: uuid.UUID | None = None
    if owner_raw:
        owner_workspace_id = uuid.UUID(str(owner_raw))

    if payload.get("slot_key"):
        slot_key = validate_slot_key(str(payload["slot_key"]))
    elif payload.get("suffix"):
        slot_key = build_catalog_slot_key(
            sector_id,
            str(payload["suffix"]),
            owner_workspace_id=owner_workspace_id,
        )
    else:
        raise ValueError("missing_slot_key_or_suffix")

    if not slot_key.startswith(f"{sector_id}_"):
        raise ValueError(f"slot_key_must_start_with_sector: {sector_id}_")

    existing = await get_slot_definition(db, slot_key)
    if existing:
        raise ValueError(f"slot_exists: {slot_key}")

    fields = validate_slot_payload(payload, partial=False)
    if "design_template_type" not in payload or not payload.get("design_template_type"):
        fields["design_template_type"] = infer_design_template_type(slot_key)
    if "library_slot_key" not in payload:
        fields["library_slot_key"] = infer_library_slot_key(
            slot_key, fields["design_template_type"],
        )
    if "pipeline" not in payload or not payload.get("pipeline"):
        fields["pipeline"] = infer_pipeline(fields["format"])
    if "slot_role" not in payload or not payload.get("slot_role"):
        fields["slot_role"] = infer_slot_role(fields["format"])

    # Brand-private slots default OFF for sector-wide bootstrap.
    enabled_by_default = fields.get("enabled_by_default", True)
    if owner_workspace_id is not None:
        enabled_by_default = bool(payload.get("enabled_by_default", False))

    row = ProductionSlotDefinition(
        slot_key=slot_key,
        sector_id=sector_id,
        label_tr=fields["label_tr"],
        label_en=fields["label_en"],
        format=fields["format"],
        pipeline=fields["pipeline"],
        slot_role=fields["slot_role"],
        design_template_type=fields["design_template_type"],
        library_slot_key=fields.get("library_slot_key"),
        tier=fields.get("tier", "standard"),
        match_signals=fields.get("match_signals") or {},
        prompt_pack=fields.get("prompt_pack") or {},
        optional_tags=fields.get("optional_tags") or [],
        enabled_by_default=enabled_by_default,
        sort_order=int(fields.get("sort_order") or 0),
        status=fields.get("status") or "active",
        owner_workspace_id=owner_workspace_id,
    )
    db.add(row)
    await db.flush()

    if owner_workspace_id is not None and assign_to_owner:
        db.add(
            TenantSlotAssignment(
                workspace_id=owner_workspace_id,
                slot_key=slot_key,
                enabled=True,
                priority=int(payload.get("priority") or 50),
                assignment_source="operator",
                notes=str(payload.get("notes") or "brand_custom_slot"),
            )
        )
        await db.flush()

    logger.info(
        "slot_catalog_slot_created",
        slot_key=slot_key,
        sector_id=sector_id,
        owner_workspace_id=str(owner_workspace_id) if owner_workspace_id else None,
    )
    return row


async def update_slot_definition(
    db: AsyncSession,
    slot_key: str,
    payload: dict[str, Any],
) -> ProductionSlotDefinition:
    row = await get_slot_definition(db, slot_key)
    if not row:
        raise ValueError(f"unknown_slot_key: {slot_key}")

    # sector_id / owner_workspace_id / slot_key are immutable after create.
    if "sector_id" in payload and str(payload["sector_id"]) != row.sector_id:
        raise ValueError("sector_id_immutable")
    if "owner_workspace_id" in payload:
        new_owner = payload.get("owner_workspace_id")
        current = row.owner_workspace_id
        if new_owner is None and current is not None:
            raise ValueError("owner_workspace_id_immutable")
        if new_owner is not None and (
            current is None or uuid.UUID(str(new_owner)) != current
        ):
            raise ValueError("owner_workspace_id_immutable")

    fields = validate_slot_payload(payload, partial=True)
    for key, value in fields.items():
        setattr(row, key, value)
    row.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return row


async def set_slot_status(
    db: AsyncSession,
    slot_key: str,
    status: str,
) -> ProductionSlotDefinition:
    status_n = str(status).strip().lower()
    if status_n not in ALLOWED_STATUSES:
        raise ValueError(f"invalid_status: expected one of {sorted(ALLOWED_STATUSES)}")
    row = await get_slot_definition(db, slot_key)
    if not row:
        raise ValueError(f"unknown_slot_key: {slot_key}")
    row.status = status_n
    row.updated_at = datetime.now(timezone.utc)
    await db.flush()
    logger.info("slot_catalog_slot_status", slot_key=slot_key, status=status_n)
    return row


async def clone_slot_definition(
    db: AsyncSession,
    source_slot_key: str,
    payload: dict[str, Any],
) -> ProductionSlotDefinition:
    source = await get_slot_definition(db, source_slot_key)
    if not source:
        raise ValueError(f"unknown_slot_key: {source_slot_key}")

    sector_id = str(payload.get("sector_id") or source.sector_id)
    owner_raw = payload.get("owner_workspace_id", source.owner_workspace_id)
    owner_workspace_id: uuid.UUID | None = None
    if owner_raw:
        owner_workspace_id = uuid.UUID(str(owner_raw))

    if payload.get("slot_key"):
        new_key = validate_slot_key(str(payload["slot_key"]))
    elif payload.get("suffix"):
        new_key = build_catalog_slot_key(
            sector_id,
            str(payload["suffix"]),
            owner_workspace_id=owner_workspace_id,
        )
    else:
        raise ValueError("missing_slot_key_or_suffix")

    create_payload = {
        "slot_key": new_key,
        "sector_id": sector_id,
        "label_tr": payload.get("label_tr") or f"{source.label_tr} (kopya)",
        "label_en": payload.get("label_en") or f"{source.label_en} (copy)",
        "format": payload.get("format") or source.format,
        "pipeline": payload.get("pipeline") or source.pipeline,
        "slot_role": payload.get("slot_role") or source.slot_role,
        "design_template_type": (
            payload.get("design_template_type") or source.design_template_type
        ),
        "library_slot_key": (
            payload["library_slot_key"]
            if "library_slot_key" in payload
            else source.library_slot_key
        ),
        "tier": payload.get("tier") or source.tier,
        "match_signals": payload.get("match_signals") or dict(source.match_signals or {}),
        "prompt_pack": payload.get("prompt_pack") or dict(source.prompt_pack or {}),
        "optional_tags": payload.get("optional_tags") or list(source.optional_tags or []),
        "enabled_by_default": payload.get(
            "enabled_by_default",
            False if owner_workspace_id else source.enabled_by_default,
        ),
        "sort_order": payload.get("sort_order", source.sort_order),
        "owner_workspace_id": owner_workspace_id,
        "priority": payload.get("priority"),
        "notes": payload.get("notes"),
    }
    return await create_slot_definition(
        db,
        create_payload,
        assign_to_owner=bool(payload.get("assign_to_owner", True)),
    )


async def list_slot_definitions_for_scope(
    db: AsyncSession,
    *,
    sector_id: str | None = None,
    workspace_id: uuid.UUID | None = None,
    active_only: bool = True,
    scope: str = "visible",
) -> list[ProductionSlotDefinition]:
    """
    scope:
      - visible: global + this workspace's brand slots (requires workspace_id for brand)
      - global: owner IS NULL only
      - brand: owner = workspace_id only
      - all: everything (admin sector browse)
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

    scope_n = (scope or "visible").strip().lower()
    if scope_n == "global":
        q = q.where(ProductionSlotDefinition.owner_workspace_id.is_(None))
    elif scope_n == "brand":
        if not workspace_id:
            raise ValueError("workspace_id_required_for_brand_scope")
        q = q.where(ProductionSlotDefinition.owner_workspace_id == workspace_id)
    elif scope_n == "all":
        pass
    else:  # visible
        if workspace_id:
            q = q.where(
                or_(
                    ProductionSlotDefinition.owner_workspace_id.is_(None),
                    ProductionSlotDefinition.owner_workspace_id == workspace_id,
                )
            )
        else:
            q = q.where(ProductionSlotDefinition.owner_workspace_id.is_(None))

    result = await db.execute(q)
    return list(result.scalars().all())
