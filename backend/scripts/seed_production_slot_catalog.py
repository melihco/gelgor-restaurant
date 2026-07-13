#!/usr/bin/env python3
"""Seed canonical_sectors + production_slot_definitions from sector_slot_pack."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select

from app.data.production_slot_catalog_meta import (
    build_match_signals,
    humanize_slot_key,
    infer_design_template_type,
    infer_format,
    infer_library_slot_key,
    infer_pipeline,
    infer_slot_role,
)
from app.data.production_slot_catalog_seed import (
    OPTIONAL_TAGS_BY_SLOT,
    SECTOR_SEED,
    SLOT_INSTANCE_BY_KEY,
    SLOT_KEYS_BY_SECTOR,
)
from app.database import async_session_factory
from app.models.slot_catalog import CanonicalSector, ProductionSlotDefinition


async def seed_sectors(session) -> int:
    count = 0
    for row in SECTOR_SEED:
        existing = await session.get(CanonicalSector, row["sector_id"])
        if existing:
            existing.label_tr = row["label_tr"]
            existing.label_en = row["label_en"]
            existing.aliases = row.get("aliases", [])
            existing.is_active = True
            existing.sort_order = row.get("sort_order", 0)
        else:
            session.add(
                CanonicalSector(
                    sector_id=row["sector_id"],
                    label_tr=row["label_tr"],
                    label_en=row["label_en"],
                    aliases=row.get("aliases", []),
                    is_active=True,
                    sort_order=row.get("sort_order", 0),
                )
            )
        count += 1
    await session.flush()
    return count


async def seed_slots(session) -> int:
    count = 0
    for sector_id, keys in SLOT_KEYS_BY_SECTOR.items():
        for idx, slot_key in enumerate(keys):
            inst = SLOT_INSTANCE_BY_KEY.get(slot_key, {})
            fmt = infer_format(slot_key)
            design_type = inst.get("design_template_type") or infer_design_template_type(slot_key)
            pack_label_tr = inst.get("label_tr")
            pack_label_en = inst.get("label_en")
            if pack_label_tr and pack_label_en:
                label_tr, label_en = pack_label_tr, pack_label_en
            else:
                label_tr, label_en = humanize_slot_key(slot_key)
            existing = await session.get(ProductionSlotDefinition, slot_key)
            optional_tags = OPTIONAL_TAGS_BY_SLOT.get(slot_key, [])
            payload = {
                "sector_id": sector_id,
                "label_tr": label_tr,
                "label_en": label_en,
                "format": fmt,
                "pipeline": inst.get("pipeline") or infer_pipeline(fmt),
                "slot_role": inst.get("slot_role") or infer_slot_role(fmt),
                "design_template_type": design_type,
                "library_slot_key": infer_library_slot_key(slot_key, design_type),
                "tier": "premium" if "reel" in slot_key or "carousel" in slot_key else "standard",
                "match_signals": build_match_signals(slot_key, design_type),
                "prompt_pack": {
                    "scene_hint_template": f"{{brand_name}} — {label_en} content for {{content_brief}}",
                },
                "optional_tags": optional_tags,
                "enabled_by_default": True,
                "sort_order": (idx + 1) * 10,
                "status": "active",
            }
            if existing:
                for k, v in payload.items():
                    setattr(existing, k, v)
            else:
                session.add(ProductionSlotDefinition(slot_key=slot_key, **payload))
            count += 1
    await session.flush()
    return count


async def main() -> None:
    async with async_session_factory() as session:
        sectors = await seed_sectors(session)
        slots = await seed_slots(session)
        await session.commit()
        result = await session.execute(select(ProductionSlotDefinition))
        total = len(result.scalars().all())
        print(f"Seeded {sectors} sectors, {slots} slot rows (total definitions in DB: {total})")


if __name__ == "__main__":
    asyncio.run(main())
