#!/usr/bin/env python3
"""Repair cross-tenant polluted CompanyProfiles + brand_contexts on Nexus/Python mirror.

Symptom: any login shows Karaman Datça logo/name on non-Karaman tenants.
Cause: historical cross-tenant writes before tenant isolation hardening.

Usage:
  DATABASE_URL='postgresql://...' python3 scripts/repair-cross-tenant-brand-profiles.py
"""
from __future__ import annotations

import asyncio
import os
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

# workspace_id -> authoritative brand_context source (copy business_name from ctx website/handle)
REPAIRS = [
    {
        "tenant_id": "d365f0e0-436e-402d-8f84-0c8fd7ab2022",
        "brand_name": "Yula Bodrum",
        "website": "https://yulabodrum.com/",
        "instagram": "yulabodrum",
        "logo": "https://yulabodrum.com/yula-bodrum-logo.png",
        "location": "Bodrum",
        "industry": "beach_club",
    },
    {
        "tenant_id": "114b50bc-3cc7-45bc-8a5e-004e17673960",
        "brand_name": "Scorpios Bodrum",
        "website": "https://scorpios.com/bodrum",
        "instagram": "scorpios.bodrum",
        "logo": "https://scorpios.com/assets/Scorpios-Logotype-white.svg",
        "location": "Bodrum",
        "industry": "beach_club",
    },
    {
        "tenant_id": "431b2901-a2dc-4df6-abe3-3670d9844851",
        "brand_name": "Sarnıç Beach",
        "website": "https://www.sarnicbeach.com/",
        "instagram": "sarnicbeach",
        "logo": "https://www.sarnicbeach.com/images/logo.png",
        "location": "Bodrum",
        "industry": "beach_club",
    },
]


def async_url(url: str) -> str:
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


async def main() -> None:
    raw = os.environ.get("DATABASE_URL", "").strip()
    if not raw:
        print("ERROR: DATABASE_URL required", file=sys.stderr)
        sys.exit(1)

    url = async_url(raw)
    if "ssl=" not in url and "oregon-postgres.render.com" in url:
        url += "&ssl=require" if "?" in url else "?ssl=require"

    engine = create_async_engine(url)
    async with engine.begin() as conn:
        for row in REPAIRS:
            tid = row["tenant_id"]
            cp = (
                await conn.execute(
                    text(
                        """
                        UPDATE "CompanyProfiles"
                        SET "BrandName" = :brand,
                            "Industry" = :industry,
                            "Location" = :location,
                            "WebsiteUrl" = :website,
                            "InstagramHandle" = :instagram,
                            "LogoUrl" = :logo,
                            "UpdatedAt" = NOW()
                        WHERE "TenantId" = CAST(:tid AS uuid)
                        RETURNING "BrandName", "LogoUrl"
                        """
                    ),
                    row | {"tid": tid},
                )
            ).mappings().first()

            bc = (
                await conn.execute(
                    text(
                        """
                        UPDATE brand_contexts
                        SET business_name = :brand,
                            logo_url = :logo,
                            website_url = :website,
                            instagram_handle = :instagram,
                            location = :location,
                            updated_at = NOW()
                        WHERE workspace_id = CAST(:tid AS uuid)
                        RETURNING business_name, logo_url, instagram_handle
                        """
                    ),
                    row | {"tid": tid},
                )
            ).mappings().first()

            print(f"\n== {tid} ==")
            print("CompanyProfiles:", dict(cp) if cp else "MISSING")
            print("brand_contexts:", dict(bc) if bc else "MISSING")

    await engine.dispose()
    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
