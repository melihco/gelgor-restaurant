"""
Immutable AI cost ledger — mission graph + feed artifact line items.

Every USD charge should land here first; daily buckets and mission JSON
breakdowns are derived aggregates for fast UI reads.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

import structlog
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cost_ledger import ArtifactCostLedger, MissionCostLedger
from app.services.production_cost_categories import SCOPE_FEED_SLOT, SCOPE_MISSION_GRAPH
from app.services.production_cost_service import build_slot_key, record_cost_event

logger = structlog.get_logger(__name__)


def _utc_today() -> date:
    return datetime.now(timezone.utc).date()


def _round_usd(value: float | Decimal) -> Decimal:
    return Decimal(str(round(float(value), 5)))


async def record_mission_cost_line(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    category: str,
    amount_usd: float,
    source_system: str = "unknown",
    source_ref: str | None = None,
    provider: str | None = None,
    model: str | None = None,
    tokens_in: int | None = None,
    tokens_out: int | None = None,
    cached_tokens: int | None = None,
    idempotency_key: str | None = None,
    metadata: dict[str, Any] | None = None,
    usage_date: date | None = None,
) -> bool:
    """Insert one mission cost line. Returns True if inserted, False if duplicate."""
    if amount_usd <= 0:
        return False

    row = MissionCostLedger(
        id=uuid.uuid4(),
        workspace_id=workspace_id,
        mission_id=mission_id,
        usage_date=usage_date or _utc_today(),
        category=category[:64],
        source_system=source_system[:32],
        source_ref=(source_ref[:128] if source_ref else None),
        provider=(provider[:32] if provider else None),
        model=(model[:64] if model else None),
        amount_usd=_round_usd(amount_usd),
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        cached_tokens=cached_tokens,
        idempotency_key=(idempotency_key[:160] if idempotency_key else None),
        extra=metadata or {},
    )

    meta_payload = metadata or {}

    if idempotency_key:
        stmt = (
            insert(MissionCostLedger)
            .values(
                id=row.id,
                workspace_id=row.workspace_id,
                mission_id=row.mission_id,
                recorded_at=datetime.now(timezone.utc),
                usage_date=row.usage_date,
                category=row.category,
                source_system=row.source_system,
                source_ref=row.source_ref,
                provider=row.provider,
                model=row.model,
                amount_usd=row.amount_usd,
                tokens_in=row.tokens_in,
                tokens_out=row.tokens_out,
                cached_tokens=row.cached_tokens,
                idempotency_key=row.idempotency_key,
                extra=meta_payload,
            )
            .on_conflict_do_nothing(index_elements=["idempotency_key"])
        )
        result = await db.execute(stmt)
        await db.commit()
        inserted = (result.rowcount or 0) > 0
    else:
        db.add(row)
        await db.commit()
        inserted = True

    if inserted:
        logger.info(
            "mission_cost_ledger_line",
            mission_id=str(mission_id),
            category=category,
            amount_usd=round(amount_usd, 5),
            source_system=source_system,
        )
        try:
            await record_cost_event(
                db,
                workspace_id=workspace_id,
                mission_id=mission_id,
                category=category,
                amount_usd=amount_usd,
                scope=SCOPE_MISSION_GRAPH,
                source_system=source_system,
                source_ref=source_ref,
                provider=provider,
                model=model,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                cached_tokens=cached_tokens,
                idempotency_key=(
                    f"evt:{idempotency_key}" if idempotency_key else None
                ),
                metadata=metadata,
                usage_date=usage_date,
            )
        except Exception as exc:
            logger.warning(
                "cost_event_dual_write_failed",
                mission_id=str(mission_id),
                category=category,
                error=str(exc)[:200],
            )
    return inserted


async def record_artifact_cost_line(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    artifact_id: uuid.UUID,
    category: str,
    amount_usd: float,
    mission_id: uuid.UUID | None = None,
    call_type: str | None = None,
    source_system: str = "unknown",
    provider: str | None = None,
    model: str | None = None,
    slot_role: str | None = None,
    idea_index: int | None = None,
    pipeline: str | None = None,
    attempt: int = 0,
    idempotency_key: str | None = None,
    metadata: dict[str, Any] | None = None,
    usage_date: date | None = None,
) -> bool:
    """Insert one artifact cost line. Returns True if inserted."""
    if amount_usd <= 0:
        return False

    values = dict(
        id=uuid.uuid4(),
        workspace_id=workspace_id,
        mission_id=mission_id,
        artifact_id=artifact_id,
        recorded_at=datetime.now(timezone.utc),
        usage_date=usage_date or _utc_today(),
        category=category[:64],
        call_type=(call_type[:64] if call_type else None),
        source_system=source_system[:32],
        provider=(provider[:32] if provider else None),
        model=(model[:64] if model else None),
        amount_usd=_round_usd(amount_usd),
        slot_role=(slot_role[:64] if slot_role else None),
        idea_index=idea_index,
        pipeline=(pipeline[:64] if pipeline else None),
        attempt=max(0, min(attempt, 32767)),
        idempotency_key=(idempotency_key[:160] if idempotency_key else None),
        extra=metadata or {},
    )

    if idempotency_key:
        stmt = insert(ArtifactCostLedger).values(**values).on_conflict_do_nothing(
            index_elements=["idempotency_key"],
        )
        result = await db.execute(stmt)
        await db.commit()
        inserted = (result.rowcount or 0) > 0
    else:
        db.add(ArtifactCostLedger(**values))
        await db.commit()
        inserted = True

    if inserted:
        logger.info(
            "artifact_cost_ledger_line",
            artifact_id=str(artifact_id),
            mission_id=str(mission_id) if mission_id else None,
            category=category,
            amount_usd=round(amount_usd, 5),
            pipeline=pipeline,
        )
        try:
            meta = metadata or {}
            await record_cost_event(
                db,
                workspace_id=workspace_id,
                mission_id=mission_id,
                artifact_id=artifact_id,
                category=category,
                amount_usd=amount_usd,
                scope=SCOPE_FEED_SLOT,
                call_type=call_type,
                slot_key=build_slot_key(idea_index, slot_role),
                idea_index=idea_index,
                slot_role=slot_role,
                pipeline=pipeline,
                attempt=attempt,
                source_system=source_system,
                provider=provider,
                model=model,
                external_request_id=meta.get("fal_request_id") or meta.get("external_request_id"),
                idempotency_key=(
                    f"evt:{idempotency_key}" if idempotency_key else None
                ),
                metadata=metadata,
                usage_date=usage_date,
            )
        except Exception as exc:
            logger.warning(
                "cost_event_dual_write_failed",
                artifact_id=str(artifact_id),
                category=category,
                error=str(exc)[:200],
            )
    return inserted


async def summarize_mission_cost_ledger(
    db: AsyncSession,
    mission_id: uuid.UUID,
) -> dict[str, Any]:
    """Full cost breakdown for admin / Mission Hub (legacy ledger + rollups)."""
    from app.services.production_cost_service import summarize_mission_production_cost

    production_summary = await summarize_mission_production_cost(db, mission_id)
    mission_rows = (
        await db.execute(
            select(MissionCostLedger).where(MissionCostLedger.mission_id == mission_id)
            .order_by(MissionCostLedger.recorded_at.asc())
        )
    ).scalars().all()

    artifact_rows = (
        await db.execute(
            select(ArtifactCostLedger).where(ArtifactCostLedger.mission_id == mission_id)
            .order_by(ArtifactCostLedger.recorded_at.asc())
        )
    ).scalars().all()

    mission_by_cat: dict[str, float] = {}
    mission_lines: list[dict[str, Any]] = []
    mission_total = 0.0
    for row in mission_rows:
        amt = float(row.amount_usd)
        mission_total += amt
        mission_by_cat[row.category] = round(mission_by_cat.get(row.category, 0) + amt, 5)
        mission_lines.append(_serialize_mission_line(row))

    artifact_by_id: dict[str, dict[str, Any]] = {}
    artifact_by_cat: dict[str, float] = {}
    artifact_total = 0.0
    for row in artifact_rows:
        amt = float(row.amount_usd)
        artifact_total += amt
        artifact_by_cat[row.category] = round(artifact_by_cat.get(row.category, 0) + amt, 5)
        aid = str(row.artifact_id)
        if aid not in artifact_by_id:
            artifact_by_id[aid] = {
                "artifact_id": aid,
                "total_usd": 0.0,
                "slot_role": row.slot_role,
                "idea_index": row.idea_index,
                "pipeline": row.pipeline,
                "lines": [],
            }
        artifact_by_id[aid]["total_usd"] = round(artifact_by_id[aid]["total_usd"] + amt, 5)
        artifact_by_id[aid]["lines"].append(_serialize_artifact_line(row))

    combined_by_cat: dict[str, float] = {}
    for cat, amt in mission_by_cat.items():
        combined_by_cat[cat] = round(combined_by_cat.get(cat, 0) + amt, 5)
    for cat, amt in artifact_by_cat.items():
        combined_by_cat[cat] = round(combined_by_cat.get(cat, 0) + amt, 5)

    artifacts_sorted = sorted(
        artifact_by_id.values(),
        key=lambda a: (-a["total_usd"], a.get("idea_index") or 0),
    )

    rollup = production_summary.get("rollup") or {}
    rollup_total = float(rollup.get("total_usd") or 0)
    legacy_total = round(mission_total + artifact_total, 5)
    total_usd = rollup_total if rollup_total > 0 else legacy_total

    return {
        "mission_id": str(mission_id),
        "mission_graph_usd": round(
            float(rollup.get("mission_graph_usd") or mission_total), 5,
        ),
        "feed_artifacts_usd": round(
            float(rollup.get("feed_slot_usd") or artifact_total), 5,
        ),
        "total_usd": round(total_usd, 5),
        "measured_usd": float(rollup.get("measured_usd") or 0),
        "estimated_usd": float(rollup.get("estimated_usd") or 0),
        "by_category": combined_by_cat,
        "mission_graph_by_category": mission_by_cat,
        "feed_by_category": artifact_by_cat,
        "mission_lines": mission_lines,
        "artifacts": artifacts_sorted,
        "artifact_count": len(artifact_by_id),
        "line_count": len(mission_lines) + len(artifact_rows),
        "rollup": rollup,
        "slots": production_summary.get("slots") or [],
        "slot_count": production_summary.get("slot_count") or 0,
        "event_count": production_summary.get("event_count") or 0,
    }


def _serialize_mission_line(row: MissionCostLedger) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "recorded_at": row.recorded_at.isoformat() if row.recorded_at else None,
        "category": row.category,
        "amount_usd": float(row.amount_usd),
        "source_system": row.source_system,
        "source_ref": row.source_ref,
        "provider": row.provider,
        "model": row.model,
        "tokens_in": row.tokens_in,
        "tokens_out": row.tokens_out,
        "metadata": row.extra or {},
    }


def _serialize_artifact_line(row: ArtifactCostLedger) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "recorded_at": row.recorded_at.isoformat() if row.recorded_at else None,
        "category": row.category,
        "call_type": row.call_type,
        "amount_usd": float(row.amount_usd),
        "source_system": row.source_system,
        "provider": row.provider,
        "model": row.model,
        "slot_role": row.slot_role,
        "idea_index": row.idea_index,
        "pipeline": row.pipeline,
        "attempt": row.attempt,
        "metadata": row.extra or {},
    }


async def sum_artifact_cost(db: AsyncSession, artifact_id: uuid.UUID) -> float:
    result = await db.execute(
        select(func.coalesce(func.sum(ArtifactCostLedger.amount_usd), 0)).where(
            ArtifactCostLedger.artifact_id == artifact_id,
        ),
    )
    return round(float(result.scalar_one()), 5)
