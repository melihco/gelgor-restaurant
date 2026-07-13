#!/usr/bin/env python3
"""
Live ops — seed new catalog story slots, bootstrap Yula assignments, bind design templates.

Usage:
  export LIVE_DATABASE_URL='postgresql+asyncpg://...'
  python3 scripts/yula-live-catalog-story-ops.py

Or pass --dsn explicitly (Render external URL + ssl=require).
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import uuid
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

YULA_WORKSPACE = uuid.UUID("f00e3308-ebbe-4d75-8592-12d52e7ff1aa")
YULA_SECTOR = "restaurant_cafe"
NEW_STORY_SLOTS = (
    "restaurant_cafe_event_announcement_story",
    "restaurant_cafe_typography_poster_story",
)

# Active onboarding templates → catalog slot keys (design_template_type aligned).
TEMPLATE_CATALOG_BINDINGS: tuple[tuple[str, str], ...] = (
    # template_id, catalog_slot_key
    ("a3d2e724-0dfe-4ca4-a02d-f49d4ebc1778", "restaurant_cafe_event_announcement_story"),
    ("04e6104a-53d7-4bea-8bac-cbc2df340eb8", "restaurant_cafe_typography_poster_story"),
)


def _normalize_dsn(raw: str) -> str:
    dsn = raw.strip().strip('"').strip("'")
    if dsn.startswith("postgresql://") and "+asyncpg" not in dsn:
        dsn = dsn.replace("postgresql://", "postgresql+asyncpg://", 1)
    if "oregon-postgres.render.com" in dsn:
        dsn = dsn.replace("sslmode=require", "ssl=require")
        if "ssl=" not in dsn:
            dsn += "&ssl=require" if "?" in dsn else "?ssl=require"
    return dsn


async def seed_catalog(session) -> int:
    from scripts.seed_production_slot_catalog import seed_sectors, seed_slots

    sectors = await seed_sectors(session)
    slots = await seed_slots(session)
    return sectors + slots


async def bootstrap_yula(session) -> dict:
    from app.services.slot_catalog_service import bootstrap_tenant_slot_assignments

    return await bootstrap_tenant_slot_assignments(
        session,
        YULA_WORKSPACE,
        sector_id=YULA_SECTOR,
        assignment_source="live_ops_bootstrap",
    )


async def bind_templates(session) -> list[dict]:
    from sqlalchemy import text

    out: list[dict] = []
    for template_id, catalog_key in TEMPLATE_CATALOG_BINDINGS:
        row = await session.execute(
            text(
                """
                UPDATE brand_design_templates
                SET catalog_slot_key = :catalog_key,
                    updated_at = NOW()
                WHERE workspace_id = CAST(:workspace_id AS uuid)
                  AND id = CAST(:template_id AS uuid)
                  AND status = 'active'
                RETURNING id::text, template_type, template_name, catalog_slot_key
                """
            ),
            {
                "workspace_id": str(YULA_WORKSPACE),
                "template_id": template_id,
                "catalog_key": catalog_key,
            },
        )
        updated = row.mappings().first()
        if updated:
            out.append(dict(updated))
    return out


async def report_state(session) -> None:
    from sqlalchemy import text

    rows = await session.execute(
        text(
            """
            SELECT d.slot_key, d.label_tr, d.format, d.pipeline, d.slot_role,
                   COALESCE(a.enabled, false) AS tenant_enabled
            FROM production_slot_definitions d
            LEFT JOIN tenant_slot_assignments a
              ON a.slot_key = d.slot_key AND a.workspace_id = CAST(:ws AS uuid)
            WHERE d.sector_id = :sector
              AND d.slot_key = ANY(:keys)
            ORDER BY d.slot_key
            """
        ),
        {
            "ws": str(YULA_WORKSPACE),
            "sector": YULA_SECTOR,
            "keys": list(NEW_STORY_SLOTS),
        },
    )
    print("\n── New story slots (Yula) ──")
    for row in rows.mappings():
        print(dict(row))

    tpl = await session.execute(
        text(
            """
            SELECT id::text, template_type, template_name, catalog_slot_key, status,
                   thumbnail_url IS NOT NULL AS has_thumb
            FROM brand_design_templates
            WHERE workspace_id = CAST(:ws AS uuid)
              AND catalog_slot_key = ANY(:keys)
            ORDER BY catalog_slot_key
            """
        ),
        {"ws": str(YULA_WORKSPACE), "keys": list(NEW_STORY_SLOTS)},
    )
    print("\n── Bound design templates ──")
    for row in tpl.mappings():
        print(dict(row))

    enabled = await session.execute(
        text(
            """
            SELECT count(*) AS n
            FROM tenant_slot_assignments
            WHERE workspace_id = CAST(:ws AS uuid) AND enabled = true
            """
        ),
        {"ws": str(YULA_WORKSPACE)},
    )
    print("\n── Yula enabled assignments:", enabled.scalar(), "──")


async def main(dsn: str, *, skip_seed: bool = False) -> None:
    os.environ["DATABASE_URL"] = _normalize_dsn(dsn)

    from app.database import async_session_factory

    async with async_session_factory() as session:
        if not skip_seed:
            print("==> Seeding production slot catalog…")
            seeded = await seed_catalog(session)
            print(f"    touched rows: {seeded}")
        else:
            print("==> Skipping catalog seed (--skip-seed)")

        print("==> Bootstrapping Yula tenant slot assignments…")
        boot = await bootstrap_yula(session)
        print(f"    {boot}")

        print("==> Binding onboarding templates to catalog_slot_key…")
        bound = await bind_templates(session)
        for row in bound:
            print(f"    ✓ {row['template_name']} → {row['catalog_slot_key']}")

        await session.commit()
        await report_state(session)
        print("\nDone.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dsn",
        default=os.environ.get("LIVE_DATABASE_URL") or os.environ.get("DATABASE_URL_SYNC") or "",
        help="Live Postgres DSN (postgresql:// or postgresql+asyncpg://)",
    )
    parser.add_argument("--skip-seed", action="store_true", help="Skip full catalog seed (faster re-run)")
    args = parser.parse_args()
    if not args.dsn:
        raise SystemExit("Set LIVE_DATABASE_URL or pass --dsn")
    asyncio.run(main(args.dsn, skip_seed=args.skip_seed))
