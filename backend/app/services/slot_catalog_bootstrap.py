"""Ensure production slot catalog tables + seed data exist (dev + Render prod)."""

from __future__ import annotations

import structlog
from sqlalchemy import func, select, text

from app.database import async_session_factory, engine
from app.models.base import Base
from app.models.slot_catalog import (
    CanonicalSector,
    ProductionSlotDefinition,
    TenantSlotAssignment,
)

logger = structlog.get_logger()

_CATALOG_TABLES = [
    CanonicalSector.__table__,
    ProductionSlotDefinition.__table__,
    TenantSlotAssignment.__table__,
]

# create_all does not ADD columns on existing tables — keep these in sync with
# backend/migrations/0041_slot_catalog_owner_workspace.sql
_SCHEMA_DDL = (
    """
    ALTER TABLE production_slot_definitions
        ADD COLUMN IF NOT EXISTS owner_workspace_id UUID NULL
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_production_slot_definitions_owner_workspace
        ON production_slot_definitions (owner_workspace_id)
        WHERE owner_workspace_id IS NOT NULL
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_production_slot_definitions_sector_owner
        ON production_slot_definitions (sector_id, owner_workspace_id, status)
    """,
)


async def ensure_slot_catalog_schema() -> None:
    """Create catalog tables + apply additive column migrations (Render-safe)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=_CATALOG_TABLES)
        for statement in _SCHEMA_DDL:
            await conn.execute(text(statement))


async def ensure_slot_catalog_ready() -> None:
    """Create catalog schema and keep sector/slot seed current.

    `seed_slots` upserts — safe to re-run when the pack grows (e.g. new beach_club
    keys). Without this, prod keeps an old partial catalog forever after first boot.
    """
    await ensure_slot_catalog_schema()

    from app.data.production_slot_catalog_seed import SLOT_KEYS_BY_SECTOR
    from scripts.seed_production_slot_catalog import seed_sectors, seed_slots

    expected_global = sum(len(keys) for keys in SLOT_KEYS_BY_SECTOR.values())

    async with async_session_factory() as session:
        sector_count = await session.scalar(select(func.count()).select_from(CanonicalSector))
        slot_count = await session.scalar(
            select(func.count())
            .select_from(ProductionSlotDefinition)
            .where(ProductionSlotDefinition.owner_workspace_id.is_(None))
        )
        needs_seed = not sector_count or int(slot_count or 0) < expected_global
        if not needs_seed:
            logger.info(
                "slot_catalog_ready",
                sectors=int(sector_count or 0),
                global_slots=int(slot_count or 0),
                expected_global=expected_global,
            )
            return

        sectors = await seed_sectors(session)
        slots = await seed_slots(session)
        await session.commit()
        total = await session.scalar(select(func.count()).select_from(ProductionSlotDefinition))
        logger.info(
            "slot_catalog_seeded",
            sectors=sectors,
            slot_rows=slots,
            total_definitions=int(total or 0),
            expected_global=expected_global,
        )
