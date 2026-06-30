#!/usr/bin/env python3
"""Check critical production schema objects for live readiness.

The project currently uses manual SQL migrations (no Alembic version table).
Instead of pretending to know migration history, this script verifies that the
critical tables/columns introduced by recent migrations exist in the connected
database.
"""

from __future__ import annotations

import asyncio
import sys
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import text


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.database import async_session_factory  # noqa: E402


@dataclass(frozen=True)
class ColumnCheck:
    table: str
    column: str
    migration: str
    expected_type: str | None = None


@dataclass(frozen=True)
class TableCheck:
    table: str
    migration: str


TABLE_CHECKS = (
    TableCheck("missions", "0010_missions.sql"),
    TableCheck("mission_task_nodes", "0010_missions.sql"),
    TableCheck("workspace_usage_daily", "0015_workspace_usage_daily.sql"),
    TableCheck("brand_post_templates", "0023_brand_post_templates.sql"),
    TableCheck("production_jobs", "0023_production_jobs.sql"),
    TableCheck("brand_scheduled_templates", "0025_brand_scheduled_templates.sql"),
)

COLUMN_CHECKS = (
    ColumnCheck("brand_contexts", "chatbot_profile", "0022_brand_chatbot_profile.sql"),
    ColumnCheck("production_jobs", "priority", "0024_production_jobs_priority.sql", "integer"),
    ColumnCheck("brand_scheduled_templates", "media_items", "0025_brand_scheduled_templates.sql", "jsonb"),
    ColumnCheck("brand_scheduled_templates", "schedule_days", "0025_brand_scheduled_templates.sql", "jsonb"),
    ColumnCheck("brand_scheduled_templates", "schedule_time", "0025_brand_scheduled_templates.sql"),
    ColumnCheck("brand_scheduled_templates", "schedule_end_time", "0025_brand_scheduled_templates.sql"),
)


async def table_exists(db, table: str) -> bool:
    result = await db.execute(
        text(
            """
            SELECT EXISTS (
              SELECT 1
              FROM information_schema.tables
              WHERE table_schema = current_schema()
                AND table_name = :table
            )
            """
        ),
        {"table": table},
    )
    return bool(result.scalar())


async def column_info(db, table: str, column: str) -> tuple[bool, str | None]:
    result = await db.execute(
        text(
            """
            SELECT data_type, udt_name
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = :table
              AND column_name = :column
            """
        ),
        {"table": table, "column": column},
    )
    row = result.one_or_none()
    if not row:
        return False, None
    data_type = str(row[0])
    udt_name = str(row[1])
    normalized = "jsonb" if udt_name == "jsonb" else data_type
    return True, normalized


async def run() -> int:
    failures: list[str] = []
    async with async_session_factory() as db:
        for check in TABLE_CHECKS:
            if not await table_exists(db, check.table):
                failures.append(f"missing table {check.table} ({check.migration})")

        for check in COLUMN_CHECKS:
            exists, actual_type = await column_info(db, check.table, check.column)
            if not exists:
                failures.append(f"missing column {check.table}.{check.column} ({check.migration})")
                continue
            if check.expected_type and actual_type != check.expected_type:
                failures.append(
                    f"wrong type {check.table}.{check.column}: expected {check.expected_type}, got {actual_type}"
                )

    print("Migration/schema health check")
    if failures:
        print("Failures:")
        for failure in failures:
            print(f"  - {failure}")
        return 1

    print(f"OK: {len(TABLE_CHECKS)} tables and {len(COLUMN_CHECKS)} columns verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run()))
