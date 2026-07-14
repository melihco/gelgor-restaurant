#!/usr/bin/env python3
"""
Backfill `brand_design_templates.catalog_slot_key` for a workspace so production
can hard-pin templates to their catalog slot (1A). Format-aware: a `post`
template is never keyed to a `story` slot (fixes the Yula "Kampanya Duyurusu"
mismatch where a post poster was keyed to `..._typography_poster_story`).

Tenant/sector-agnostic — pass any workspace + sector. Yula is the documented
example default (validation only), consistent with the multi-tenant rule that
pilot UUIDs live in scripts/ops, never in product code.

Usage:
  export LIVE_DATABASE_URL='postgresql+asyncpg://...'
  python3 scripts/backfill-design-template-catalog-keys.py \
      --workspace f00e3308-ebbe-4d75-8592-12d52e7ff1aa --sector restaurant_cafe

  # Preview without writing:
  python3 scripts/backfill-design-template-catalog-keys.py --dry-run
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

# Yula Bodrum — pilot validation default (restaurant_cafe).
DEFAULT_WORKSPACE = "f00e3308-ebbe-4d75-8592-12d52e7ff1aa"
DEFAULT_SECTOR = "restaurant_cafe"


def _normalize_dsn(raw: str) -> str:
    dsn = raw.strip().strip('"').strip("'")
    if dsn.startswith("postgresql://") and "+asyncpg" not in dsn:
        dsn = dsn.replace("postgresql://", "postgresql+asyncpg://", 1)
    if "oregon-postgres.render.com" in dsn:
        dsn = dsn.replace("sslmode=require", "ssl=require")
        if "ssl=" not in dsn:
            dsn += "&ssl=require" if "?" in dsn else "?ssl=require"
    return dsn


def _template_format_matches_slot(template_format: str, slot_format: str) -> bool:
    """Design-template format ↔ catalog-slot format compatibility."""
    tf = (template_format or "").lower()
    sf = (slot_format or "").lower()
    if sf == "story":
        return tf == "story"
    if sf == "reel":
        return tf in ("reel_cover", "reel")
    if sf == "carousel":
        return tf in ("carousel", "post")
    # post / feed
    return tf in ("post", "feed")


async def _load_slots(session, workspace: str, sector: str) -> list[dict]:
    from sqlalchemy import text

    rows = await session.execute(
        text(
            """
            SELECT d.slot_key,
                   d.design_template_type,
                   d.format,
                   d.sort_order,
                   COALESCE(a.enabled, d.enabled_by_default) AS enabled
            FROM production_slot_definitions d
            LEFT JOIN tenant_slot_assignments a
              ON a.slot_key = d.slot_key AND a.workspace_id = CAST(:ws AS uuid)
            WHERE d.sector_id = :sector AND d.status = 'active'
            ORDER BY d.sort_order
            """
        ),
        {"ws": workspace, "sector": sector},
    )
    return [dict(r) for r in rows.mappings()]


async def _load_templates(session, workspace: str) -> list[dict]:
    from sqlalchemy import text

    rows = await session.execute(
        text(
            """
            SELECT id::text AS id,
                   template_name,
                   template_type,
                   format,
                   catalog_slot_key,
                   design_spec->'specialDay'->>'mmdd' AS special_mmdd
            FROM brand_design_templates
            WHERE workspace_id = CAST(:ws AS uuid)
              AND status IN ('active', 'approved')
            ORDER BY created_at
            """
        ),
        {"ws": workspace},
    )
    return [dict(r) for r in rows.mappings()]


def _plan_backfill(templates: list[dict], slots: list[dict]) -> list[dict]:
    """
    Returns a list of {id, template_name, old_key, new_key, reason}.
    Prefers enabled slots, exact design_template_type match, then format-only.
    Each catalog slot is claimed once.
    """
    slot_by_key = {s["slot_key"]: s for s in slots}
    # Prefer enabled slots first, then remaining, preserving sort order.
    ordered_slots = [s for s in slots if s["enabled"]] + [s for s in slots if not s["enabled"]]

    claimed: set[str] = set()

    # Pass 0 — keep already-valid keys (present, known slot, format compatible).
    for t in templates:
        key = t.get("catalog_slot_key")
        if not key:
            continue
        slot = slot_by_key.get(key)
        if slot and _template_format_matches_slot(t["format"], slot["format"]):
            claimed.add(key)

    plan: list[dict] = []

    def pick_slot(template: dict) -> tuple[str, str] | None:
        # exact type + format
        for s in ordered_slots:
            if s["slot_key"] in claimed:
                continue
            if s["design_template_type"] != template["template_type"]:
                continue
            if not _template_format_matches_slot(template["format"], s["format"]):
                continue
            return s["slot_key"], "type+format"
        # format-only fallback
        for s in ordered_slots:
            if s["slot_key"] in claimed:
                continue
            if not _template_format_matches_slot(template["format"], s["format"]):
                continue
            return s["slot_key"], "format-only"
        return None

    for t in templates:
        key = t.get("catalog_slot_key")
        slot = slot_by_key.get(key) if key else None
        valid = bool(slot) and _template_format_matches_slot(t["format"], slot["format"])
        if valid:
            continue  # already good (claimed in pass 0)

        # Fixed-date special-day posters (Noel, 29 Ekim, …) stay orphan: they should
        # only fire in-season via the soft proximity match, never hard-pinned to an
        # unrelated everyday slot. A generic event template (no mmdd) is still keyed.
        if t.get("special_mmdd"):
            plan.append({
                "id": t["id"],
                "template_name": t["template_name"],
                "old_key": key or "—",
                "new_key": None,
                "reason": "special-day → left orphan (in-season proximity match)",
            })
            continue

        picked = pick_slot(t)
        if not picked:
            plan.append({
                "id": t["id"],
                "template_name": t["template_name"],
                "old_key": key or "—",
                "new_key": None,
                "reason": "no compatible slot",
            })
            continue

        new_key, how = picked
        claimed.add(new_key)
        reason = "backfill (empty)" if not key else f"re-key (format mismatch: {key})"
        plan.append({
            "id": t["id"],
            "template_name": t["template_name"],
            "old_key": key or "—",
            "new_key": new_key,
            "reason": f"{reason} · {how}",
        })

    return plan


async def _apply(session, workspace: str, plan: list[dict]) -> int:
    from sqlalchemy import text

    n = 0
    for row in plan:
        if not row["new_key"]:
            continue
        await session.execute(
            text(
                """
                UPDATE brand_design_templates
                SET catalog_slot_key = :key, updated_at = NOW()
                WHERE workspace_id = CAST(:ws AS uuid)
                  AND id = CAST(:id AS uuid)
                """
            ),
            {"ws": workspace, "id": row["id"], "key": row["new_key"]},
        )
        n += 1
    return n


async def main(dsn: str, workspace: str, sector: str, *, dry_run: bool) -> None:
    os.environ["DATABASE_URL"] = _normalize_dsn(dsn)
    uuid.UUID(workspace)  # validate

    from app.database import async_session_factory

    async with async_session_factory() as session:
        slots = await _load_slots(session, workspace, sector)
        templates = await _load_templates(session, workspace)
        print(f"==> {len(templates)} active templates · {len(slots)} sector slots ({sector})")

        plan = _plan_backfill(templates, slots)
        changes = [p for p in plan if p["new_key"]]
        skips = [p for p in plan if not p["new_key"]]
        already_ok = len(templates) - len(plan)

        print(f"\n── Plan: {len(changes)} update(s), {already_ok} already valid, {len(skips)} unresolved ──")
        for p in plan:
            arrow = p["new_key"] or "‹none›"
            print(f"  {p['template_name'][:32]:32} {p['old_key']:44} → {arrow:44} [{p['reason']}]")

        if dry_run:
            print("\n(dry-run) no changes written.")
            return

        applied = await _apply(session, workspace, changes)
        await session.commit()
        print(f"\n✓ Applied {applied} catalog_slot_key update(s).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dsn",
        default=os.environ.get("LIVE_DATABASE_URL") or os.environ.get("DATABASE_URL_SYNC") or "",
        help="Live Postgres DSN (postgresql:// or postgresql+asyncpg://)",
    )
    parser.add_argument("--workspace", default=DEFAULT_WORKSPACE, help="Tenant/workspace UUID")
    parser.add_argument("--sector", default=DEFAULT_SECTOR, help="Sector id (business_type)")
    parser.add_argument("--dry-run", action="store_true", help="Preview only; do not write")
    args = parser.parse_args()
    if not args.dsn:
        raise SystemExit("Set LIVE_DATABASE_URL or pass --dsn")
    asyncio.run(main(args.dsn, args.workspace, args.sector, dry_run=args.dry_run))
