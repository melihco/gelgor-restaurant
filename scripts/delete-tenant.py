#!/usr/bin/env python3
"""Delete a tenant + workspace mirror from Nexus (.NET) and Python DB."""
from __future__ import annotations

import asyncio
import sys
import uuid

from sqlalchemy import text

from app.database import async_session_factory


async def delete_tenant(tenant_id: uuid.UUID) -> None:
    tid = str(tenant_id)
    async with async_session_factory() as db:
        async def exec_sql(sql: str, params: dict | None = None) -> None:
            await db.execute(text(sql), params or {"t": tid})

        # ── Python / Crew tables ─────────────────────────────────────────────
        for sql in [
            "DELETE FROM suggestions WHERE workspace_id = :t",
            "DELETE FROM production_jobs WHERE workspace_id = :t",
            "DELETE FROM mission_task_nodes WHERE workspace_id = :t",
            "DELETE FROM missions WHERE workspace_id = :t",
            "DELETE FROM tasks WHERE workspace_id = :t",
            "DELETE FROM brand_rules WHERE workspace_id = :t",
            "DELETE FROM brand_post_templates WHERE workspace_id = :t",
            "DELETE FROM brand_scheduled_templates WHERE workspace_id = :t",
            """DELETE FROM brand_assets WHERE brand_context_id IN (
                 SELECT id FROM brand_contexts WHERE workspace_id = :t)""",
            "DELETE FROM brand_contexts WHERE workspace_id = :t",
            "DELETE FROM agent_instances WHERE workspace_id = :t",
            "DELETE FROM action_logs WHERE workspace_id = :t",
            "DELETE FROM content_assets WHERE workspace_id = :t",
            "DELETE FROM integration_connections WHERE workspace_id = :t",
            "DELETE FROM prompt_profiles WHERE workspace_id = :t",
            "DELETE FROM workspace_usage_daily WHERE workspace_id = :t",
            "DELETE FROM workspaces WHERE id = :t",
            "DELETE FROM tenants WHERE id = :t",
        ]:
            try:
                await exec_sql(sql)
            except Exception as exc:
                print(f"  [py skip] {exc}")

        # ── Nexus (.NET) tables ────────────────────────────────────────────────
        for sql in [
            'DELETE FROM "OutputArtifacts" WHERE "TenantId" = :t',
            'DELETE FROM "TaskItems" WHERE "TenantId" = :t',
            'DELETE FROM "Briefs" WHERE "TenantId" = :t',
            'DELETE FROM "AgentRuns" WHERE "TenantId" = :t',
            'DELETE FROM "AgentMemoryReferences" WHERE "TenantId" = :t',
            'DELETE FROM "BrandMemoryDocuments" WHERE "TenantId" = :t',
            'DELETE FROM "CompanyProfiles" WHERE "TenantId" = :t',
            'DELETE FROM "IntegrationConnections" WHERE "TenantId" = :t',
            'DELETE FROM "Notifications" WHERE "TenantId" = :t',
            'DELETE FROM "AuditLogs" WHERE "TenantId" = :t',
            """DELETE FROM "TenantMediaAssets" WHERE "OfficeId" IN (
                 SELECT "Id" FROM "Offices" WHERE "TenantId" = :t)""",
            """DELETE FROM "CanvaTemplateAssignments" WHERE "OfficeId" IN (
                 SELECT "Id" FROM "Offices" WHERE "TenantId" = :t)""",
            """DELETE FROM "OfficeBrandProfiles" WHERE "OfficeId" IN (
                 SELECT "Id" FROM "Offices" WHERE "TenantId" = :t)""",
            'DELETE FROM "Agents" WHERE "TenantId" = :t',
            """DELETE FROM "OfficeZones" WHERE "OfficeId" IN (
                 SELECT "Id" FROM "Offices" WHERE "TenantId" = :t)""",
            'DELETE FROM "TenantSubscriptions" WHERE "TenantId" = :t',
            'DELETE FROM "Users" WHERE "TenantId" = :t',
            'DELETE FROM "Offices" WHERE "TenantId" = :t',
            'DELETE FROM "Tenants" WHERE "Id" = :t',
        ]:
            try:
                await exec_sql(sql)
            except Exception as exc:
                print(f"  [nx skip] {exc}")

        await db.commit()
        print(f"Deleted tenant {tid}")


async def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/delete-tenant.py <tenant-uuid> [tenant-uuid...]")
        sys.exit(1)
    for raw in sys.argv[1:]:
        await delete_tenant(uuid.UUID(raw))


if __name__ == "__main__":
    asyncio.run(main())
