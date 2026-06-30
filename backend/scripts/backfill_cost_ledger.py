#!/usr/bin/env python3
"""
Backfill mission_cost_ledger + artifact_cost_ledger from existing mission data.

Usage:
  cd backend && source .venv/bin/activate
  python scripts/backfill_cost_ledger.py --mission-id 4d033224-c08c-43b6-abdc-54e2e74ab9be
  python scripts/backfill_cost_ledger.py --workspace-id 431b2901-a2dc-4df6-abe3-3670d9844851 --all-missions
"""

from __future__ import annotations

import argparse
import asyncio
import json
import uuid
from pathlib import Path

from sqlalchemy import select

from app.database import async_session_factory
from app.models.mission import Mission
from app.services.cost_ledger_service import (
    record_artifact_cost_line,
    record_mission_cost_line,
    summarize_mission_cost_ledger,
)


async def backfill_mission_from_performance(
    db,
    mission: Mission,
    *,
    dry_run: bool = False,
) -> dict:
    perf = dict(mission.performance_summary or {})
    breakdown = dict(perf.get("ai_cost_breakdown") or {})
    inserted = 0

    for category, raw in breakdown.items():
        if category in ("total_usd", "updated_at"):
            continue
        amount = float(raw or 0)
        if amount <= 0:
            continue
        key = f"backfill:graph:{mission.id}:{category}"
        if dry_run:
            inserted += 1
            continue
        ok = await record_mission_cost_line(
            db,
            workspace_id=mission.workspace_id,
            mission_id=mission.id,
            category=str(category),
            amount_usd=amount,
            source_system="backfill",
            source_ref="performance_summary.ai_cost_breakdown",
            idempotency_key=key,
            metadata={"backfill": True},
        )
        if ok:
            inserted += 1

    auto_total = float(breakdown.get("auto_produce") or 0)
    return {"mission_id": str(mission.id), "graph_lines": inserted, "auto_produce_usd": auto_total}


async def backfill_artifacts_from_json(
    db,
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
    artifacts_path: Path,
    *,
    dry_run: bool = False,
) -> dict:
    if not artifacts_path.exists():
        return {"artifact_lines": 0, "skipped": "file_not_found"}

    raw = json.loads(artifacts_path.read_text())
    mid = str(mission_id)
    inserted = 0
    runway_unit = 0.25
    remotion_render_unit = 0.03

    for art in raw:
        blob = json.dumps(art)
        if mid not in blob:
            continue
        meta = art.get("metadata") or {}
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except json.JSONDecodeError:
                meta = {}

        artifact_id = art.get("id")
        if not artifact_id:
            continue

        recorded = float(meta.get("cost_usd_estimate") or meta.get("production_cost_usd") or 0)
        pipeline = str(meta.get("pipeline") or meta.get("production_role") or "")
        slot_role = str(meta.get("production_role") or "")
        idea_index = meta.get("idea_index")

        lines: list[tuple[str, float, str]] = []
        if recorded > 0:
            lines.append((pipeline or "auto_produce", recorded, "metadata"))
        elif "runway" in pipeline and _has_video(art):
            lines.append(("video_runway", runway_unit, "estimate"))
        elif pipeline == "remotion_story" and _has_video(art):
            lines.append(("remotion_story", remotion_render_unit, "estimate"))

        for category, amount, source in lines:
            key = f"backfill:artifact:{artifact_id}:{category}:{source}"
            if dry_run:
                inserted += 1
                continue
            ok = await record_artifact_cost_line(
                db,
                workspace_id=workspace_id,
                artifact_id=uuid.UUID(str(artifact_id)),
                mission_id=mission_id,
                category=category,
                amount_usd=amount,
                call_type=category,
                source_system="backfill",
                slot_role=slot_role or None,
                idea_index=int(idea_index) if idea_index is not None else None,
                pipeline=pipeline or None,
                idempotency_key=key,
                metadata={"backfill": True, "source": source},
            )
            if ok:
                inserted += 1

    return {"artifact_lines": inserted}


def _has_video(art: dict) -> bool:
    content = art.get("content") or {}
    if isinstance(content, str):
        try:
            content = json.loads(content)
        except json.JSONDecodeError:
            content = {}
    meta = art.get("metadata") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except json.JSONDecodeError:
            meta = {}
    video = str(content.get("videoUrl") or meta.get("videoUrl") or "")
    return bool(video and any(video.lower().endswith(ext) for ext in (".mp4", ".mov", ".webm")))


async def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill AI cost ledger tables")
    parser.add_argument("--mission-id", type=uuid.UUID)
    parser.add_argument("--workspace-id", type=uuid.UUID)
    parser.add_argument("--all-missions", action="store_true")
    parser.add_argument("--artifacts-json", type=Path, default=Path("/tmp/sarnic-mission-artifacts.json"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    async with async_session_factory() as db:
        missions: list[Mission] = []
        if args.mission_id:
            row = await db.execute(select(Mission).where(Mission.id == args.mission_id))
            m = row.scalar_one_or_none()
            if m:
                missions.append(m)
        elif args.workspace_id and args.all_missions:
            row = await db.execute(
                select(Mission).where(Mission.workspace_id == args.workspace_id).order_by(Mission.created_at.desc())
            )
            missions = list(row.scalars().all())
        else:
            parser.error("Provide --mission-id or --workspace-id with --all-missions")

        for mission in missions:
            graph = await backfill_mission_from_performance(db, mission, dry_run=args.dry_run)
            artifacts = await backfill_artifacts_from_json(
                db,
                mission.id,
                mission.workspace_id,
                args.artifacts_json,
                dry_run=args.dry_run,
            )
            summary = None if args.dry_run else await summarize_mission_cost_ledger(db, mission.id)
            print(json.dumps({
                "title": mission.title,
                "graph_backfill": graph,
                "artifact_backfill": artifacts,
                "ledger_summary": summary,
            }, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
