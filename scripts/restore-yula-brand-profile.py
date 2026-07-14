#!/usr/bin/env python3
"""Restore polluted Yula Bodrum tenant brand profile on Nexus + Python mirror.

Symptom: user logs in as info@yulabodrum.com but UI shows Karaman Datça branding.
Cause: cross-tenant production/onboarding wrote Karaman CompanyProfile into Yula workspace
       (d365f0e0-436e-402d-8f84-0c8fd7ab2022) before tenant isolation hardening.

Usage (production — requires DATABASE_URL with external host):
  DATABASE_URL='postgresql://...' python3 scripts/restore-yula-brand-profile.py
"""
from __future__ import annotations

import asyncio
import os
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

YULA_MAIN = "d365f0e0-436e-402d-8f84-0c8fd7ab2022"
YULA_ALT = "f00e3308-ebbe-4d75-8592-12d52e7ff1aa"

BRAND_NAME = "Yula Bodrum"
WEBSITE = "https://yulabodrum.com/"
IG = "yulabodrum"
LOCATION = "Bodrum"
LOGO = "https://yulabodrum.com/yula-bodrum-logo.png"
INDUSTRY = "beach_club"


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
        row = (
            await conn.execute(
                text(
                    """
                    UPDATE "CompanyProfiles" dst
                    SET
                      "BrandName" = :brand,
                      "Industry" = :industry,
                      "Location" = :location,
                      "WebsiteUrl" = :website,
                      "InstagramHandle" = :ig,
                      "LogoUrl" = :logo,
                      "BrandTone" = src."BrandTone",
                      "TargetAudience" = src."TargetAudience",
                      "VisualStyle" = src."VisualStyle",
                      "CampaignGoals" = src."CampaignGoals",
                      "Competitors" = src."Competitors",
                      "BrandColors" = src."BrandColors",
                      "AccentColors" = src."AccentColors",
                      "PrimaryFont" = src."PrimaryFont",
                      "SecondaryFont" = src."SecondaryFont",
                      "Description" = LEFT(src."Description", 8000),
                      "UpdatedAt" = NOW()
                    FROM "CompanyProfiles" src
                    WHERE dst."TenantId" = CAST(:dst AS uuid)
                      AND src."TenantId" = CAST(:src AS uuid)
                    RETURNING dst."BrandName", dst."WebsiteUrl", dst."InstagramHandle"
                    """
                ),
                {
                    "brand": BRAND_NAME,
                    "industry": INDUSTRY,
                    "location": LOCATION,
                    "website": WEBSITE,
                    "ig": IG,
                    "logo": LOGO,
                    "dst": YULA_MAIN,
                    "src": YULA_ALT,
                },
            )
        ).mappings().first()

        row2 = (
            await conn.execute(
                text(
                    """
                    UPDATE brand_contexts
                    SET business_name = :brand,
                        logo_url = :logo,
                        website_url = :website,
                        instagram_handle = :ig,
                        location = :location,
                        updated_at = NOW()
                    WHERE workspace_id = CAST(:ws AS uuid)
                    RETURNING business_name, instagram_handle, website_url
                    """
                ),
                {
                    "brand": BRAND_NAME,
                    "logo": LOGO,
                    "website": WEBSITE,
                    "ig": IG,
                    "location": LOCATION,
                    "ws": YULA_MAIN,
                },
            )
        ).mappings().first()

    await engine.dispose()
    print("CompanyProfiles:", dict(row) if row else "MISSING")
    print("brand_contexts:", dict(row2) if row2 else "MISSING")


if __name__ == "__main__":
    asyncio.run(main())
