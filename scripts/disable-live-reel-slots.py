#!/usr/bin/env python3
"""
Disable all reel catalog slots for every brand (live or any DSN).

Applies backend/migrations/0044_disable_all_reel_catalog_slots.sql then prints counts.

Usage:
  export LIVE_DATABASE_URL='postgresql+asyncpg://...'
  python3 scripts/disable-live-reel-slots.py

  export RENDER_API_KEY=rnd_...
  python3 scripts/disable-live-reel-slots.py --live

  python3 scripts/disable-live-reel-slots.py --live --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

COUNTS_SQL = """
SELECT
  (SELECT count(*) FROM production_slot_definitions WHERE format = 'reel') AS reel_defs,
  (SELECT count(*) FROM production_slot_definitions
     WHERE format = 'reel' AND enabled_by_default) AS reel_defs_default_on,
  (SELECT count(*) FROM tenant_slot_assignments a
     JOIN production_slot_definitions d ON d.slot_key = a.slot_key
    WHERE d.format = 'reel' AND a.enabled) AS reel_assignments_on,
  (SELECT count(DISTINCT a.workspace_id) FROM tenant_slot_assignments a
     JOIN production_slot_definitions d ON d.slot_key = a.slot_key
    WHERE d.format = 'reel' AND a.enabled) AS brands_with_reel_on,
  (SELECT count(*) FROM tenant_slot_assignments a
     JOIN production_slot_definitions d ON d.slot_key = a.slot_key
    WHERE d.format = 'reel' AND NOT a.enabled) AS reel_assignments_off
"""

UPDATE_DEFS_SQL = """
UPDATE production_slot_definitions
SET enabled_by_default = false
WHERE format = 'reel'
  AND enabled_by_default IS DISTINCT FROM false
"""

UPDATE_ASSIGNMENTS_SQL = """
UPDATE tenant_slot_assignments AS a
SET
  enabled = false,
  notes = CASE
    WHEN a.notes IS NULL OR btrim(a.notes) = '' THEN 'disabled_reel_pause_2026_08'
    WHEN a.notes LIKE '%disabled_reel_pause_2026_08%' THEN a.notes
    ELSE a.notes || ' | disabled_reel_pause_2026_08'
  END
FROM production_slot_definitions AS d
WHERE a.slot_key = d.slot_key
  AND d.format = 'reel'
  AND a.enabled IS DISTINCT FROM false
"""


def _normalize_dsn(raw: str) -> str:
    dsn = raw.strip().strip('"').strip("'")
    if dsn.startswith("postgresql://") and "+asyncpg" not in dsn:
        dsn = dsn.replace("postgresql://", "postgresql+asyncpg://", 1)
    if "render.com" in dsn:
        dsn = dsn.replace("sslmode=require", "ssl=require")
        if "ssl=" not in dsn:
            dsn += "&ssl=require" if "?" in dsn else "?ssl=require"
    return dsn


def _live_url_from_render() -> str:
    api_key = os.environ.get("RENDER_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("RENDER_API_KEY required for --live (or set LIVE_DATABASE_URL)")
    pg_id = os.environ.get("RENDER_POSTGRES_ID", "dpg-d8gkt4f7f7vs73esgf00-a")
    req = urllib.request.Request(
        f"https://api.render.com/v1/postgres/{pg_id}/connection-info",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return str(json.load(resp)["externalConnectionString"])


def _load_dotenv_key(path: Path, key: str) -> str:
    if not path.exists():
        return ""
    for line in path.read_text(errors="ignore").splitlines():
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


async def run(dsn: str, *, dry_run: bool) -> None:
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    engine = create_async_engine(dsn, pool_pre_ping=True)
    async with engine.connect() as conn:
        before = (await conn.execute(text(COUNTS_SQL))).mappings().one()
        print("before:", dict(before))
        if dry_run:
            print("dry-run: migration not applied")
            await conn.rollback()
            await engine.dispose()
            return

        defs = await conn.execute(text(UPDATE_DEFS_SQL))
        assigns = await conn.execute(text(UPDATE_ASSIGNMENTS_SQL))
        print(f"updated definitions={defs.rowcount} assignments={assigns.rowcount}")
        await conn.commit()

        after = (await conn.execute(text(COUNTS_SQL))).mappings().one()
        print("after:", dict(after))
        await conn.rollback()
    await engine.dispose()
    print("ok: reel catalog slots disabled")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dsn", default="")
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    dsn = (args.dsn or os.environ.get("LIVE_DATABASE_URL") or "").strip()
    if args.live:
        for path in (
            ROOT / "apps" / "web" / ".env.local",
            ROOT / ".env",
            BACKEND / ".env",
        ):
            if not os.environ.get("RENDER_API_KEY"):
                key = _load_dotenv_key(path, "RENDER_API_KEY")
                if key:
                    os.environ["RENDER_API_KEY"] = key
            if not dsn:
                live = _load_dotenv_key(path, "LIVE_DATABASE_URL")
                if live:
                    dsn = live
        if not dsn:
            dsn = _live_url_from_render()
    if not dsn:
        dsn = os.environ.get("DATABASE_URL") or _load_dotenv_key(BACKEND / ".env", "DATABASE_URL")
    if not dsn:
        raise SystemExit("Pass --dsn, LIVE_DATABASE_URL, --live, or DATABASE_URL")

    asyncio.run(run(_normalize_dsn(dsn), dry_run=args.dry_run))


if __name__ == "__main__":
    main()
