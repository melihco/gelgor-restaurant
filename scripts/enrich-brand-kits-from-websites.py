#!/usr/bin/env python3
"""
Backfill Marka Detayı typography + colors from each brand's website.

Usage:
  cd backend && source .venv/bin/activate
  python3 ../scripts/enrich-brand-kits-from-websites.py
  python3 ../scripts/enrich-brand-kits-from-websites.py --workspace-id <uuid>
  python3 ../scripts/enrich-brand-kits-from-websites.py --force
"""

from __future__ import annotations

import argparse
import asyncio
import uuid

from sqlalchemy import select


async def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich brand kits from websites")
    parser.add_argument("--workspace-id", type=str, default="", help="Single tenant UUID")
    parser.add_argument("--force", action="store_true", help="Overwrite existing fonts/colors")
    parser.add_argument("--limit", type=int, default=50)
    args = parser.parse_args()

    from app.database import async_session_factory
    from app.models.brand_context import BrandContext
    from app.services import brand_context_service

    async with async_session_factory() as db:
        if args.workspace_id:
            ids = [uuid.UUID(args.workspace_id)]
        else:
            q = (
                select(BrandContext.workspace_id)
                .where(BrandContext.website_url.isnot(None))
                .where(BrandContext.website_url != "")
                .limit(args.limit)
            )
            rows = (await db.execute(q)).scalars().all()
            ids = list(rows)

        print(f"Enriching {len(ids)} brand(s)…")
        ok = 0
        for wid in ids:
            try:
                result = await brand_context_service.enrich_brand_kit_from_website(
                    db,
                    wid,
                    fill_empty_only=not args.force,
                )
                if result.get("ok"):
                    ok += 1
                    kit = result.get("kit") or {}
                    print(
                        f"  ✓ {wid}: {kit.get('heading_font')} / {kit.get('body_font')} "
                        f"{kit.get('primary_color')} {kit.get('accent_color')}"
                    )
                else:
                    print(f"  – {wid}: {result.get('error', 'skipped')}")
            except Exception as exc:
                print(f"  ✗ {wid}: {exc}")

        print(f"Done: {ok}/{len(ids)} enriched.")


if __name__ == "__main__":
    asyncio.run(main())
