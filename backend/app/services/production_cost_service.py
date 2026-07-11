"""
Production cost SSOT — atomic cost_events + mission/slot rollups.

All writers (Python crew, Next auto-produce, telemetry) should land here.
Legacy mission_cost_ledger / artifact_cost_ledger remain for backward compatibility.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import structlog
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.production_cost import CostEvent, MissionCostRollup, MissionSlotCostRollup
from app.services.production_cost_categories import (
    MEASURED_PRICING_BASES,
    PRICING_CATALOG_ESTIMATE,
    PRICING_MEASURED_TOKENS,
    PRICING_PROVIDER_METERED,
    SCOPE_AMOUNT_FIELD,
    SCOPE_FEED_SLOT,
    SCOPE_GALLERY,
    SCOPE_INTEGRATION,
    SCOPE_MISSION_GRAPH,
    SCOPE_OTHER,
    VALID_PRICING_BASES,
    VALID_SCOPES,
)

logger = structlog.get_logger(__name__)


def _utc_today() -> date:
    return datetime.now(timezone.utc).date()


def _round_usd(value: float | Decimal) -> Decimal:
    return Decimal(str(round(float(value), 5)))


def build_slot_key(idea_index: int | None, slot_role: str | None) -> str | None:
    """Canonical feed slot key — matches TS `missionGallerySlotKey`."""
    if idea_index is None or not slot_role:
        return None
    return f"{idea_index}::{slot_role}"


def infer_pricing_basis(
    *,
    tokens_in: int | None = None,
    tokens_out: int | None = None,
    external_request_id: str | None = None,
    explicit: str | None = None,
) -> str:
    if explicit and explicit in VALID_PRICING_BASES:
        return explicit
    if (tokens_in or 0) > 0 or (tokens_out or 0) > 0:
        return PRICING_MEASURED_TOKENS
    if external_request_id:
        return PRICING_PROVIDER_METERED
    return PRICING_CATALOG_ESTIMATE


def infer_scope(
    *,
    scope: str | None = None,
    artifact_id: uuid.UUID | None = None,
    slot_key: str | None = None,
    call_type: str | None = None,
) -> str:
    if scope and scope in VALID_SCOPES:
        return scope
    if artifact_id or slot_key:
        return SCOPE_FEED_SLOT
    if call_type and "gallery" in call_type.lower():
        return SCOPE_GALLERY
    if call_type:
        ct = call_type.lower()
        if any(k in ct for k in ("apify", "instagram_scrape", "google_maps", "integration")):
            return SCOPE_INTEGRATION
    return SCOPE_MISSION_GRAPH if not artifact_id else SCOPE_FEED_SLOT


def _json_add_amount(bucket: dict, key: str, amount: float) -> dict:
    out = dict(bucket or {})
    out[key] = round(float(out.get(key, 0)) + amount, 5)
    return out


async def record_cost_event(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    category: str,
    amount_usd: float,
    mission_id: uuid.UUID | None = None,
    artifact_id: uuid.UUID | None = None,
    scope: str | None = None,
    call_type: str | None = None,
    slot_key: str | None = None,
    idea_index: int | None = None,
    slot_role: str | None = None,
    pipeline: str | None = None,
    attempt: int = 0,
    source_system: str = "unknown",
    source_ref: str | None = None,
    provider: str | None = None,
    model: str | None = None,
    pricing_basis: str | None = None,
    tokens_in: int | None = None,
    tokens_out: int | None = None,
    cached_tokens: int | None = None,
    external_request_id: str | None = None,
    idempotency_key: str | None = None,
    metadata: dict[str, Any] | None = None,
    usage_date: date | None = None,
) -> bool:
    """Insert one atomic cost event and refresh rollups. Returns True if inserted."""
    if amount_usd <= 0:
        return False

    resolved_slot_key = slot_key or build_slot_key(idea_index, slot_role)
    resolved_scope = infer_scope(
        scope=scope,
        artifact_id=artifact_id,
        slot_key=resolved_slot_key,
        call_type=call_type,
    )
    resolved_pricing = infer_pricing_basis(
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        external_request_id=external_request_id,
        explicit=pricing_basis,
    )
    now = datetime.now(timezone.utc)
    amt = _round_usd(amount_usd)

    values = dict(
        id=uuid.uuid4(),
        workspace_id=workspace_id,
        mission_id=mission_id,
        artifact_id=artifact_id,
        recorded_at=now,
        usage_date=usage_date or _utc_today(),
        scope=resolved_scope[:32],
        category=category[:64],
        call_type=(call_type[:64] if call_type else None),
        slot_key=(resolved_slot_key[:96] if resolved_slot_key else None),
        idea_index=idea_index,
        slot_role=(slot_role[:64] if slot_role else None),
        pipeline=(pipeline[:64] if pipeline else None),
        attempt=max(0, min(attempt, 32767)),
        source_system=source_system[:32],
        source_ref=(source_ref[:128] if source_ref else None),
        provider=(provider[:32] if provider else None),
        model=(model[:64] if model else None),
        pricing_basis=resolved_pricing[:32],
        amount_usd=amt,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        cached_tokens=cached_tokens,
        external_request_id=(external_request_id[:128] if external_request_id else None),
        idempotency_key=(idempotency_key[:192] if idempotency_key else None),
        extra=metadata or {},
    )

    if idempotency_key:
        stmt = insert(CostEvent).values(**values).on_conflict_do_nothing(
            index_elements=["idempotency_key"],
        )
        result = await db.execute(stmt)
        inserted = (result.rowcount or 0) > 0
    else:
        db.add(CostEvent(**values))
        inserted = True

    if not inserted:
        return False

    await db.commit()

    if mission_id:
        await _refresh_mission_rollups(
            db,
            workspace_id=workspace_id,
            mission_id=mission_id,
            scope=resolved_scope,
            category=category,
            call_type=call_type,
            provider=provider,
            pricing_basis=resolved_pricing,
            amount_usd=float(amt),
            slot_key=resolved_slot_key,
            idea_index=idea_index,
            slot_role=slot_role,
            pipeline=pipeline,
            artifact_id=artifact_id,
            recorded_at=now,
        )

    logger.info(
        "cost_event_recorded",
        workspace_id=str(workspace_id),
        mission_id=str(mission_id) if mission_id else None,
        scope=resolved_scope,
        category=category,
        amount_usd=round(amount_usd, 5),
        slot_key=resolved_slot_key,
        pricing_basis=resolved_pricing,
    )
    return True


async def _refresh_mission_rollups(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    scope: str,
    category: str,
    call_type: str | None,
    provider: str | None,
    pricing_basis: str,
    amount_usd: float,
    slot_key: str | None,
    idea_index: int | None,
    slot_role: str | None,
    pipeline: str | None,
    artifact_id: uuid.UUID | None,
    recorded_at: datetime,
) -> None:
    is_measured = pricing_basis in MEASURED_PRICING_BASES
    measured_delta = amount_usd if is_measured else 0.0
    estimated_delta = 0.0 if is_measured else amount_usd

    # --- mission-level rollup ---
    result = await db.execute(
        select(MissionCostRollup).where(MissionCostRollup.mission_id == mission_id),
    )
    mission_rollup = result.scalar_one_or_none()

    if mission_rollup is None:
        mission_rollup = MissionCostRollup(
            workspace_id=workspace_id,
            mission_id=mission_id,
            first_recorded_at=recorded_at,
        )
        db.add(mission_rollup)

    scope_field = SCOPE_AMOUNT_FIELD.get(scope, "other_usd")
    setattr(
        mission_rollup,
        scope_field,
        _round_usd(float(getattr(mission_rollup, scope_field)) + amount_usd),
    )
    mission_rollup.total_usd = _round_usd(float(mission_rollup.total_usd) + amount_usd)
    mission_rollup.measured_usd = _round_usd(float(mission_rollup.measured_usd) + measured_delta)
    mission_rollup.estimated_usd = _round_usd(float(mission_rollup.estimated_usd) + estimated_delta)
    mission_rollup.event_count += 1
    mission_rollup.last_recorded_at = recorded_at
    mission_rollup.updated_at = recorded_at
    if not mission_rollup.first_recorded_at:
        mission_rollup.first_recorded_at = recorded_at

    if scope == SCOPE_MISSION_GRAPH:
        mission_rollup.graph_by_category = _json_add_amount(
            mission_rollup.graph_by_category, category, amount_usd,
        )
    elif scope == SCOPE_FEED_SLOT:
        mission_rollup.feed_by_category = _json_add_amount(
            mission_rollup.feed_by_category, category, amount_usd,
        )
    if provider:
        mission_rollup.by_provider = _json_add_amount(
            mission_rollup.by_provider, provider, amount_usd,
        )

    # --- slot-level rollup ---
    if scope == SCOPE_FEED_SLOT and slot_key:
        slot_result = await db.execute(
            select(MissionSlotCostRollup).where(
                MissionSlotCostRollup.mission_id == mission_id,
                MissionSlotCostRollup.slot_key == slot_key,
            ),
        )
        slot_rollup = slot_result.scalar_one_or_none()
        if slot_rollup is None:
            slot_rollup = MissionSlotCostRollup(
                workspace_id=workspace_id,
                mission_id=mission_id,
                slot_key=slot_key,
                idea_index=idea_index,
                slot_role=slot_role,
                pipeline=pipeline,
                artifact_id=artifact_id,
                first_recorded_at=recorded_at,
            )
            db.add(slot_rollup)
            mission_rollup.slot_count += 1

        slot_rollup.total_usd = _round_usd(float(slot_rollup.total_usd) + amount_usd)
        slot_rollup.measured_usd = _round_usd(float(slot_rollup.measured_usd) + measured_delta)
        slot_rollup.estimated_usd = _round_usd(float(slot_rollup.estimated_usd) + estimated_delta)
        slot_rollup.line_count += 1
        slot_rollup.by_category = _json_add_amount(slot_rollup.by_category, category, amount_usd)
        if call_type:
            slot_rollup.by_call_type = _json_add_amount(
                slot_rollup.by_call_type, call_type, amount_usd,
            )
        if artifact_id and not slot_rollup.artifact_id:
            slot_rollup.artifact_id = artifact_id
        if pipeline and not slot_rollup.pipeline:
            slot_rollup.pipeline = pipeline
        slot_rollup.last_recorded_at = recorded_at
        slot_rollup.updated_at = recorded_at
        if not slot_rollup.first_recorded_at:
            slot_rollup.first_recorded_at = recorded_at

    await db.commit()


def _serialize_cost_event(row: CostEvent) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "workspace_id": str(row.workspace_id),
        "mission_id": str(row.mission_id) if row.mission_id else None,
        "artifact_id": str(row.artifact_id) if row.artifact_id else None,
        "recorded_at": row.recorded_at.isoformat() if row.recorded_at else None,
        "usage_date": row.usage_date.isoformat() if row.usage_date else None,
        "scope": row.scope,
        "category": row.category,
        "call_type": row.call_type,
        "slot_key": row.slot_key,
        "idea_index": row.idea_index,
        "slot_role": row.slot_role,
        "pipeline": row.pipeline,
        "attempt": row.attempt,
        "source_system": row.source_system,
        "source_ref": row.source_ref,
        "provider": row.provider,
        "model": row.model,
        "pricing_basis": row.pricing_basis,
        "amount_usd": float(row.amount_usd),
        "tokens_in": row.tokens_in,
        "tokens_out": row.tokens_out,
        "cached_tokens": row.cached_tokens,
        "external_request_id": row.external_request_id,
        "metadata": row.extra or {},
    }


def _serialize_slot_rollup(row: MissionSlotCostRollup) -> dict[str, Any]:
    return {
        "slot_key": row.slot_key,
        "idea_index": row.idea_index,
        "slot_role": row.slot_role,
        "pipeline": row.pipeline,
        "artifact_id": str(row.artifact_id) if row.artifact_id else None,
        "total_usd": float(row.total_usd),
        "measured_usd": float(row.measured_usd),
        "estimated_usd": float(row.estimated_usd),
        "line_count": row.line_count,
        "by_category": row.by_category or {},
        "by_call_type": row.by_call_type or {},
        "status": row.status,
        "first_recorded_at": row.first_recorded_at.isoformat() if row.first_recorded_at else None,
        "last_recorded_at": row.last_recorded_at.isoformat() if row.last_recorded_at else None,
    }


def _serialize_mission_rollup(row: MissionCostRollup | None) -> dict[str, Any] | None:
    if not row:
        return None
    return {
        "mission_graph_usd": float(row.mission_graph_usd),
        "feed_slot_usd": float(row.feed_slot_usd),
        "integration_usd": float(row.integration_usd),
        "gallery_usd": float(row.gallery_usd),
        "other_usd": float(row.other_usd),
        "total_usd": float(row.total_usd),
        "measured_usd": float(row.measured_usd),
        "estimated_usd": float(row.estimated_usd),
        "event_count": row.event_count,
        "slot_count": row.slot_count,
        "graph_by_category": row.graph_by_category or {},
        "feed_by_category": row.feed_by_category or {},
        "by_provider": row.by_provider or {},
        "first_recorded_at": row.first_recorded_at.isoformat() if row.first_recorded_at else None,
        "last_recorded_at": row.last_recorded_at.isoformat() if row.last_recorded_at else None,
    }


async def summarize_mission_production_cost(
    db: AsyncSession,
    mission_id: uuid.UUID,
) -> dict[str, Any]:
    """Admin-ready mission cost summary from rollups + recent events."""
    rollup_result = await db.execute(
        select(MissionCostRollup).where(MissionCostRollup.mission_id == mission_id),
    )
    mission_rollup = rollup_result.scalar_one_or_none()

    slot_rows = (
        await db.execute(
            select(MissionSlotCostRollup)
            .where(MissionSlotCostRollup.mission_id == mission_id)
            .order_by(MissionSlotCostRollup.idea_index.asc().nulls_last(), MissionSlotCostRollup.slot_key.asc()),
        )
    ).scalars().all()

    event_count_result = await db.execute(
        select(func.count()).select_from(CostEvent).where(CostEvent.mission_id == mission_id),
    )
    event_count = int(event_count_result.scalar_one() or 0)

    slots = [_serialize_slot_rollup(r) for r in slot_rows]
    rollup = _serialize_mission_rollup(mission_rollup)

    return {
        "mission_id": str(mission_id),
        "rollup": rollup,
        "slots": slots,
        "slot_count": len(slots),
        "event_count": event_count,
        "total_usd": rollup["total_usd"] if rollup else 0.0,
        "measured_usd": rollup["measured_usd"] if rollup else 0.0,
        "estimated_usd": rollup["estimated_usd"] if rollup else 0.0,
    }


async def list_mission_cost_events(
    db: AsyncSession,
    mission_id: uuid.UUID,
    *,
    limit: int = 200,
    offset: int = 0,
) -> dict[str, Any]:
    limit = max(1, min(limit, 500))
    offset = max(0, offset)

    rows = (
        await db.execute(
            select(CostEvent)
            .where(CostEvent.mission_id == mission_id)
            .order_by(CostEvent.recorded_at.desc())
            .limit(limit)
            .offset(offset),
        )
    ).scalars().all()

    total_result = await db.execute(
        select(func.count()).select_from(CostEvent).where(CostEvent.mission_id == mission_id),
    )
    total = int(total_result.scalar_one() or 0)

    return {
        "mission_id": str(mission_id),
        "events": [_serialize_cost_event(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


async def summarize_workspace_production_cost(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    days: int = 30,
) -> dict[str, Any]:
    """Workspace-level rollup for admin dashboard (recent missions + daily totals)."""
    days = max(1, min(days, 90))
    today = _utc_today()
    start = today - timedelta(days=days - 1)

    daily_rows = (
        await db.execute(
            select(
                CostEvent.usage_date,
                func.sum(CostEvent.amount_usd).label("total"),
                func.sum(
                    func.case(
                        (CostEvent.pricing_basis.in_(list(MEASURED_PRICING_BASES)), CostEvent.amount_usd),
                        else_=0,
                    ),
                ).label("measured"),
            )
            .where(
                CostEvent.workspace_id == workspace_id,
                CostEvent.usage_date >= start,
                CostEvent.usage_date <= today,
            )
            .group_by(CostEvent.usage_date)
            .order_by(CostEvent.usage_date.asc()),
        )
    ).all()

    by_date = {r.usage_date: r for r in daily_rows}
    daily_series: list[dict[str, Any]] = []
    period_total = 0.0
    period_measured = 0.0

    for i in range(days):
        d = start + timedelta(days=i)
        row = by_date.get(d)
        total = float(row.total) if row else 0.0
        measured = float(row.measured) if row else 0.0
        period_total += total
        period_measured += measured
        daily_series.append({
            "date": d.isoformat(),
            "total_usd": round(total, 5),
            "measured_usd": round(measured, 5),
            "estimated_usd": round(total - measured, 5),
        })

    scope_rows = (
        await db.execute(
            select(
                CostEvent.scope,
                func.sum(CostEvent.amount_usd).label("total"),
            )
            .where(
                CostEvent.workspace_id == workspace_id,
                CostEvent.usage_date >= start,
            )
            .group_by(CostEvent.scope),
        )
    ).all()
    by_scope = {r.scope: round(float(r.total), 5) for r in scope_rows}

    top_missions = (
        await db.execute(
            select(MissionCostRollup)
            .where(
                MissionCostRollup.workspace_id == workspace_id,
                MissionCostRollup.updated_at >= datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc),
            )
            .order_by(MissionCostRollup.total_usd.desc())
            .limit(20),
        )
    ).scalars().all()

    return {
        "workspace_id": str(workspace_id),
        "days": days,
        "period_total_usd": round(period_total, 5),
        "period_measured_usd": round(period_measured, 5),
        "period_estimated_usd": round(period_total - period_measured, 5),
        "by_scope": by_scope,
        "daily_series": daily_series,
        "top_missions": [
            {
                "mission_id": str(m.mission_id),
                "total_usd": float(m.total_usd),
                "measured_usd": float(m.measured_usd),
                "estimated_usd": float(m.estimated_usd),
                "slot_count": m.slot_count,
                "event_count": m.event_count,
                "last_recorded_at": m.last_recorded_at.isoformat() if m.last_recorded_at else None,
            }
            for m in top_missions
        ],
    }
