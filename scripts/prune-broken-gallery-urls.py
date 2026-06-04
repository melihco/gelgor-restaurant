#!/usr/bin/env python3
"""Remove unreachable Unsplash / bad URLs from brand_contexts.reference_image_urls."""

from __future__ import annotations

import argparse
import asyncio
import json
import uuid

import httpx
from sqlalchemy import select

from app.database import async_session_factory
from app.models.brand_context import BrandContext


async def probe(url: str, client: httpx.AsyncClient) -> bool:
    if not url.startswith("http"):
        return False
    try:
        r = await client.head(url, follow_redirects=True, timeout=12.0)
        if r.status_code < 400:
            return True
        if r.status_code in (403, 405):
            r2 = await client.get(url, headers={"Range": "bytes=0-512"}, follow_redirects=True, timeout=12.0)
            return r2.status_code < 400
    except Exception:
        return False
    return False


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace-id", type=str, default="")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    async with async_session_factory() as db:
        if args.workspace_id:
            wid = uuid.UUID(args.workspace_id)
            ctx = (await db.execute(select(BrandContext).where(BrandContext.workspace_id == wid))).scalar_one_or_none()
            rows = [ctx] if ctx else []
        else:
            rows = (await db.execute(select(BrandContext))).scalars().all()

        async with httpx.AsyncClient() as client:
            for ctx in rows:
                if not ctx:
                    continue
                try:
                    refs = json.loads(ctx.reference_image_urls or "[]")
                except json.JSONDecodeError:
                    continue
                if not isinstance(refs, list):
                    continue
                good: list[str] = []
                removed = 0
                for u in refs:
                    if not isinstance(u, str) or not u.startswith("http"):
                        continue
                    if await probe(u, client):
                        good.append(u)
                    else:
                        removed += 1
                if removed == 0:
                    continue
                print(f"{ctx.workspace_id} ({ctx.business_name}): removed {removed}, kept {len(good)}")
                if not args.dry_run:
                    ctx.reference_image_urls = json.dumps(good, ensure_ascii=False)
            if not args.dry_run:
                await db.commit()
                print("Committed.")


if __name__ == "__main__":
    asyncio.run(main())
