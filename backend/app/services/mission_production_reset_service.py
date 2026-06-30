"""Reset mission production state before a clean reproduce run.

Standard: operator force-reproduce must start from exactly N manifest slots — never
stack new factory jobs on top of legacy calendar/additive rows or keep duplicate
artifacts from prior retry storms.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()

_PERF_KEYS_TO_CLEAR = (
    "last_feed_produce",
    "production_path",
    "feed_production_lock",
    "production_error",
    "production_status",
    "slots_ready",
    "slots_total",
    "last_drain_at",
)


async def reset_mission_production_state(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    archive_artifacts: bool = True,
    clear_jobs: bool = True,
    clear_perf_snapshot: bool = True,
) -> dict[str, Any]:
    """Wipe durable factory queue + mission artifacts so the next enqueue is N/16 not N/26."""
    ws = str(workspace_id)
    mid = str(mission_id)
    summary: dict[str, Any] = {
        "mission_id": mid,
        "workspace_id": ws,
        "jobs_deleted": 0,
        "artifacts_archived": 0,
        "perf_cleared": False,
    }

    if clear_jobs:
        res = await db.execute(
            text(
                """
                DELETE FROM production_jobs
                WHERE mission_id = CAST(:mission_id AS UUID)
                RETURNING id
                """
            ),
            {"mission_id": mid},
        )
        summary["jobs_deleted"] = len(res.fetchall())

    if archive_artifacts:
        res = await db.execute(
            text(
                """
                UPDATE "OutputArtifacts"
                SET "IsDeleted" = true,
                    "DeletedAt" = COALESCE("DeletedAt", now()),
                    "UpdatedAt" = now()
                WHERE "TenantId" = CAST(:tenant_id AS UUID)
                  AND "IsDeleted" = false
                  AND (
                    "Metadata"->>'mission_id' = :mission_id
                    OR "Metadata"->>'missionId' = :mission_id
                  )
                RETURNING "Id"
                """
            ),
            {
                "tenant_id": ws,
                "mission_id": mid,
            },
        )
        summary["artifacts_archived"] = len(res.fetchall())

    if clear_perf_snapshot:
        r = await db.execute(
            text(
                """
                SELECT performance_summary FROM missions
                WHERE id = CAST(:mission_id AS UUID)
                  AND workspace_id = CAST(:workspace_id AS UUID)
                """
            ),
            {"mission_id": mid, "workspace_id": ws},
        )
        row = r.one_or_none()
        if row:
            perf = dict(row[0] or {})
            changed = False
            for key in _PERF_KEYS_TO_CLEAR:
                if key in perf:
                    perf.pop(key, None)
                    changed = True
            if changed:
                await db.execute(
                    text(
                        """
                        UPDATE missions
                        SET performance_summary = CAST(:perf AS jsonb),
                            updated_at = :now
                        WHERE id = CAST(:mission_id AS UUID)
                        """
                    ),
                    {
                        "mission_id": mid,
                        "perf": json.dumps(perf),
                        "now": datetime.now(timezone.utc),
                    },
                )
            summary["perf_cleared"] = changed

    await db.commit()

    try:
        from app.services.task_graph_executor import _release_feed_production_lock

        await _release_feed_production_lock(mission_id)
    except Exception as exc:
        logger.debug("reset_release_lock_skipped", error=str(exc)[:120])

    logger.info("mission_production_reset", **summary)
    return summary
