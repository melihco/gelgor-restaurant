from __future__ import annotations

import argparse
import asyncio
from collections import Counter
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Backfill mission_task_nodes.output_payload from legacy output_summary.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=500,
        help="Maximum number of nodes to inspect in one run.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Inspect and report without writing to the database.",
    )
    return parser


async def run(limit: int, dry_run: bool) -> None:
    from sqlalchemy import select

    from app.database import async_session_factory
    from app.models.mission import MissionTaskNode
    from app.services.output_summary_parser import extract_structured_payload_from_output_summary

    async with async_session_factory() as db:
        stmt = (
            select(MissionTaskNode)
            .where(
                MissionTaskNode.output_payload.is_(None),
                MissionTaskNode.output_summary.is_not(None),
            )
            .order_by(MissionTaskNode.created_at.asc())
            .limit(max(1, limit))
        )
        rows = (await db.execute(stmt)).scalars().all()

        inspected = 0
        parsed = 0
        updated = 0
        task_type_counts: Counter[str] = Counter()

        for node in rows:
            inspected += 1
            payload = extract_structured_payload_from_output_summary(node.output_summary)
            if payload is None:
                continue

            parsed += 1
            task_type_counts[str(node.task_type)] += 1

            if not dry_run:
                node.output_payload = payload
                updated += 1

        if not dry_run:
            await db.commit()
        else:
            await db.rollback()

    print(f"Inspected: {inspected}")
    print(f"Parseable: {parsed}")
    print(f"Updated: {updated if not dry_run else 0}")
    if task_type_counts:
        print("By task_type:")
        for task_type, count in sorted(task_type_counts.items()):
            print(f"  - {task_type}: {count}")
    if dry_run:
        print("Dry run only; no rows were written.")


def main() -> None:
    args = build_parser().parse_args()
    asyncio.run(run(limit=args.limit, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
