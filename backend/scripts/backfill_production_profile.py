#!/usr/bin/env python3
"""
Backfill production design profile for keep-tenants (Sprint A).

Runs the onboarding-grade pipeline per workspace:
  1. service-profile/derive (merge-safe)
  2. production-design-profile derive + apply (visual_dna, pillars, theme layers)
  3. brand DNA synthesize (optional)

Usage:
  cd backend && source .venv/bin/activate
  PYTHONPATH=. python scripts/backfill_production_profile.py --workspace-id 431b2901-a2dc-4df6-abe3-3670d9844851
  PYTHONPATH=. python scripts/backfill_production_profile.py --all-keep-tenants
  PYTHONPATH=. python scripts/backfill_production_profile.py --all-keep-tenants --dry-run --skip-dna
"""

from __future__ import annotations

import argparse
import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from app.config import get_settings
from app.database import async_session_factory
from app.services import brand_context_service
from app.services.brand_dna_service import build_brand_dna
from app.services.production_design_profile_service import (
    apply_production_design_profile,
    derive_production_design_profile,
)

KEEP_TENANT_IDS: tuple[str, ...] = (
    "00000000-0000-0000-0000-000000000001",  # Sunu Event
    "431b2901-a2dc-4df6-abe3-3670d9844851",  # Sarnıç Beach
    "d365f0e0-436e-402d-8f84-0c8fd7ab2022",  # Yula Bodrum main
    "f00e3308-ebbe-4d75-8592-12d52e7ff1aa",  # Yula Drink & Chill
    "d6b187ab-0821-43bf-8381-25f3b17f24e4",  # Turunç Bodrum
    "327db521-ede2-48e0-8f06-4146ee458c50",  # karamandatca.com.tr
    "3be8dacc-0300-4e90-8438-4db8954bb76b",  # KARAMAN DATÇA
)


async def backfill_workspace(
    workspace_id: uuid.UUID,
    *,
    dry_run: bool = False,
    skip_dna: bool = False,
) -> dict[str, Any]:
    settings = get_settings()
    result: dict[str, Any] = {
        "workspace_id": str(workspace_id),
        "dry_run": dry_run,
        "steps": {},
    }

    async with async_session_factory() as db:
        ctx = await brand_context_service.get_brand_context(db, workspace_id)
        if ctx is None:
            result["error"] = "brand_context_not_found"
            return result

        result["business_name"] = ctx.business_name

        if dry_run:
            sp = ctx.brand_service_profile if isinstance(ctx.brand_service_profile, dict) else {}
            theme = ctx.brand_theme if isinstance(ctx.brand_theme, dict) else {}
            result["steps"]["service_profile"] = {"category": sp.get("category"), "would_derive": True}
            result["steps"]["production_design"] = {
                "visual_dna_len": len(str(ctx.visual_dna or "")),
                "would_derive": True,
            }
            result["steps"]["brand_dna"] = {"has_dna": bool(ctx.brand_dna), "would_synthesize": not skip_dna}
            result["steps"]["theme_layers"] = {
                "typography_design": bool(theme.get("typography_design")),
                "fal_design_intensity": bool(theme.get("fal_design_intensity")),
                "anti_patterns": len(theme.get("anti_patterns") or []),
            }
            return result

        ctx = await brand_context_service.persist_brand_service_profile(db, workspace_id)
        if ctx is None:
            result["error"] = "service_profile_failed"
            return result
        sp = ctx.brand_service_profile if isinstance(ctx.brand_service_profile, dict) else {}
        result["steps"]["service_profile"] = {
            "category": sp.get("category"),
            "offerings": len(sp.get("signature_offerings") or []),
            "guardrails": len(sp.get("content_guardrails") or []),
        }

        profile = derive_production_design_profile(ctx, openai_api_key=settings.openai_api_key or "")
        await apply_production_design_profile(db, ctx, profile)
        ctx = await brand_context_service.get_brand_context(db, workspace_id)
        theme = ctx.brand_theme if ctx and isinstance(ctx.brand_theme, dict) else {}
        result["steps"]["production_design"] = {
            "sector": profile.get("sector"),
            "source": profile.get("source"),
            "visual_dna_preview": (profile.get("visual_dna") or "")[:120],
            "pillars": profile.get("content_pillars"),
        }
        result["steps"]["theme_layers"] = {
            "typography_design": bool(theme.get("typography_design")),
            "fal_design_intensity": bool(theme.get("fal_design_intensity")),
            "anti_patterns": len(theme.get("anti_patterns") or []),
        }

        if not skip_dna and ctx is not None:
            brand = await brand_context_service.build_brand_info(db, workspace_id, skip_cache=True)
            if brand is not None:
                dna = await build_brand_dna(brand, openai_api_key=settings.openai_api_key or "")
                ctx.brand_dna = json.dumps(dna, ensure_ascii=False)
                ctx.brand_dna_updated_at = datetime.now(timezone.utc).isoformat()
                await db.commit()
                result["steps"]["brand_dna"] = {"synthesized": True, "essence": (dna.get("essence") or "")[:120]}
            else:
                result["steps"]["brand_dna"] = {"synthesized": False, "reason": "brand_info_unavailable"}

    return result


async def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill production design profile for keep-tenants")
    parser.add_argument("--workspace-id", type=uuid.UUID)
    parser.add_argument("--all-keep-tenants", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-dna", action="store_true", help="Skip brand DNA synthesize step")
    args = parser.parse_args()

    if args.all_keep_tenants:
        workspace_ids = [uuid.UUID(wid) for wid in KEEP_TENANT_IDS]
    elif args.workspace_id:
        workspace_ids = [args.workspace_id]
    else:
        parser.error("Provide --workspace-id or --all-keep-tenants")

    for wid in workspace_ids:
        out = await backfill_workspace(wid, dry_run=args.dry_run, skip_dna=args.skip_dna)
        print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
