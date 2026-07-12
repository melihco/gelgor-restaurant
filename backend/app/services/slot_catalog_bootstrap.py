"""Ensure production slot catalog tables + seed data exist (dev + Render prod)."""

from __future__ import annotations

import structlog
from sqlalchemy import func, select

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


async def ensure_slot_catalog_ready() -> None:
    """Create catalog tables if missing and seed sector/slot rows when empty."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=_CATALOG_TABLES)

    async with async_session_factory() as session:
        count = await session.scalar(select(func.count()).select_from(CanonicalSector))
        if count and count > 0:
            logger.info("slot_catalog_ready", sectors=int(count))
            return

    from scripts.seed_production_slot_catalog import seed_sectors, seed_slots

    async with async_session_factory() as session:
        sectors = await seed_sectors(session)
        slots = await seed_slots(session)
        await session.commit()
        total = await session.scalar(select(func.count()).select_from(ProductionSlotDefinition))
        logger.info(
            "slot_catalog_seeded",
            sectors=sectors,
            slot_rows=slots,
            total_definitions=int(total or 0),
        )
