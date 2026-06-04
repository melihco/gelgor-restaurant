#!/usr/bin/env python3
"""
Reset subscription quota + Python daily usage for a tenant (dev/test).

Usage:
  python3 scripts/reset-tenant-quota.py
  python3 scripts/reset-tenant-quota.py 5feb36f7-def7-4b4a-834f-353457de57bf
"""
from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

KACTA_TENANT = "5feb36f7-def7-4b4a-834f-353457de57bf"
DEFAULT_DB = "postgresql+asyncpg://nexus:nexus_dev_2024@localhost:5432/nexus_db"


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


async def main() -> None:
    tenant_id = sys.argv[1] if len(sys.argv) > 1 else KACTA_TENANT
    try:
        UUID(tenant_id)
    except ValueError:
        print(f"Invalid tenant UUID: {tenant_id}")
        sys.exit(1)

    root = _repo_root()
    sys.path.insert(0, str(root / "backend"))
    try:
        from app.config import get_settings
        db_url = get_settings().database_url
    except Exception:
        db_url = DEFAULT_DB

    engine = create_async_engine(db_url, echo=False)
    async_session_factory = async_sessionmaker(engine, expire_on_commit=False)

    period_start = datetime.now(timezone.utc).date()
    period_end = period_start + timedelta(days=32)

    async with async_session_factory() as db:
        sub = await db.execute(
            text(
                """
                SELECT ts."Id", t."Name", p."Slug", ts."TasksUsedThisPeriod",
                       ts."CurrentPeriodStart", ts."CurrentPeriodEnd"
                FROM "TenantSubscriptions" ts
                JOIN "Tenants" t ON t."Id" = ts."TenantId"
                JOIN "PackageDefinitions" p ON p."Id" = ts."PackageId"
                WHERE ts."TenantId" = :tid
                  AND ts."Status" IN (0, 1)
                ORDER BY ts."CurrentPeriodEnd" DESC
                LIMIT 1
                """
            ),
            {"tid": tenant_id},
        )
        row = sub.mappings().first()
        if not row:
            print(f"No active/trial subscription for tenant {tenant_id}")
            sys.exit(1)

        print(f"Tenant: {row['Name']} ({tenant_id})")
        print(f"Package: {row['Slug']}")
        print(f"Before: tasks_used={row['TasksUsedThisPeriod']}, "
              f"period={row['CurrentPeriodStart']} → {row['CurrentPeriodEnd']}")

        await db.execute(
            text(
                """
                UPDATE "TenantSubscriptions"
                SET "TasksUsedThisPeriod" = 0,
                    "CurrentPeriodStart" = :start,
                    "CurrentPeriodEnd" = :end,
                    "UpdatedAt" = NOW()
                WHERE "Id" = :sid
                """
            ),
            {
                "sid": str(row["Id"]),
                "start": period_start,
                "end": period_end,
            },
        )

        usage = await db.execute(
            text(
                """
                DELETE FROM workspace_usage_daily
                WHERE workspace_id = :ws
                RETURNING usage_date, cost_usd, artifact_count
                """
            ),
            {"ws": tenant_id},
        )
        deleted = usage.mappings().all()

        jobs_before = await db.execute(
            text(
                """
                SELECT COUNT(*) AS c FROM "ExecutionJobs" ej
                JOIN "SuggestedActions" sa ON sa."Id" = ej."SuggestedActionId"
                WHERE sa."TenantId" = :tid
                """
            ),
            {"tid": tenant_id},
        )
        job_count = jobs_before.scalar() or 0

        artifacts = await db.execute(
            text('SELECT COUNT(*) FROM "OutputArtifacts" WHERE "TenantId" = :tid'),
            {"tid": tenant_id},
        )
        artifact_count = artifacts.scalar() or 0

        await db.commit()

    print(f"After:  tasks_used=0, period={period_start} → {period_end}")
    print(f"Deleted {len(deleted)} workspace_usage_daily row(s)")
    if deleted:
        total_cost = sum(float(r["cost_usd"] or 0) for r in deleted)
        print(f"  Cleared API cost sum: ${total_cost:.2f}")
    print(f"ExecutionJobs (kept): {job_count}")
    print(f"OutputArtifacts (kept for Feed): {artifact_count}")
    print("Done — new agent/provider/token counts start from today.")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
