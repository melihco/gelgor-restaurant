"""
Mission API — autonomous campaign orchestration endpoints.

Endpoints:
  GET  /{workspace_id}                        → list missions (filter by status)
  POST /{workspace_id}/propose                → run StrategistAgent → persist proposals
  GET  /{workspace_id}/{mission_id}           → full mission detail + all task nodes
  GET  /{workspace_id}/{mission_id}/progress  → DAG progress (node-by-node status)
  PUT  /{workspace_id}/{mission_id}/approve   → approve a proposed mission
  PUT  /{workspace_id}/{mission_id}/reject    → reject a proposed mission
  PUT  /{workspace_id}/{mission_id}/cancel    → cancel an in-flight mission

All routes are workspace-scoped — a mission can only be read/mutated by
the workspace that owns it (enforced via workspace_id FK check in service layer).
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.mission import Mission, MissionTaskNode
from app.schemas.mission import (
    MissionApprove,
    MissionReject,
    MissionStatus,
    TaskNodeStatus,
)
from app.services.mission_service import (
    approve_mission,
    get_ready_nodes,
    list_blocking_missions,
    list_missions,
    list_missions_for_hub,
    normalize_hub_production_package,
    persist_hub_production_package,
    reject_mission,
)
from app.services.mission_feed_production_service import (
    FeedProductionError,
    MissionFeedProductionRequest,
    kick_feed_production as kick_feed_production_service,
    reproduce_feed_production as reproduce_feed_production_service,
)
from app.services.strategist_service import propose_missions_for_workspace

logger = structlog.get_logger()
router = APIRouter()


def _feed_production_http_error(exc: FeedProductionError) -> HTTPException:
    return HTTPException(exc.status_code, exc.detail)


# ── Response models (inline — keeps this file self-contained) ─────────────────

class NodeProgressItem(BaseModel):
    node_key: str
    title: str
    phase_index: int
    task_type: str
    agent_role: str
    depends_on: list[str]
    status: str
    is_ready: bool          # pending + all deps completed → ready to run
    output_artifact_id: str | None
    output_summary: str | None  # full agent output for UI display (up to 8000 chars)
    output_payload: dict[str, Any] | list[dict[str, Any]] | None = None
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str | None
    retry_count: int


class MissionProgressResponse(BaseModel):
    mission_id: str
    title: str
    status: str
    priority: str
    confidence: float
    timeline_days: int | None
    total_nodes: int
    completed_nodes: int
    running_nodes: int
    failed_nodes: int
    pending_nodes: int
    skipped_nodes: int
    completion_pct: float       # completed / total * 100
    nodes: list[NodeProgressItem]
    created_at: datetime
    approved_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    performance_summary: dict[str, Any] | None = None


class MissionSummaryItem(BaseModel):
    id: str
    title: str
    type: str
    trigger_signal: str | None
    objective: str | None
    timeline_days: int | None
    priority: str
    confidence: float
    status: str
    assigned_agent_roles: list[str] | None
    total_nodes: int
    completed_nodes: int
    failed_nodes: int
    completion_pct: float
    created_at: datetime
    approved_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None


class MissionDetailResponse(MissionSummaryItem):
    trigger_evidence: str | None
    creative_brief: str | None
    phases: list[dict[str, Any]] | None
    performance_summary: dict[str, Any] | None
    rejected_at: datetime | None
    rejected_reason: str | None
    approved_by: str | None
    nodes: list[NodeProgressItem]


class ProposeMissionsResponse(BaseModel):
    workspace_id: str
    proposals_created: int
    missions: list[dict[str, Any]]
    message: str
    skip_reason: str | None = None


class ProposeMissionsRequest(BaseModel):
    """Optional propose-time context. `context_signals` is a deterministic
    markdown block (season, full moon, holidays, weekly rhythm, sector triggers)
    produced by the TS Context Signal Engine and injected into the Strategist."""
    context_signals: str | None = None
    production_package: str | None = None


class HubProductionPackageRequest(BaseModel):
    production_package: str
    production_profile_tier: str | None = None
    last_production_telemetry: dict | None = None


# MissionFeedProductionRequest lives in mission_feed_production_service (Sprint 2).


# ── Helpers ───────────────────────────────────────────────────────────────────

def _compute_node_items(
    nodes: list[MissionTaskNode],
    ready_keys: set[str],
    *,
    include_payload: bool = False,
    summary_max_chars: int | None = 12_000,
) -> list[NodeProgressItem]:
    def _summary(value: str | None) -> str | None:
        if value is None or summary_max_chars is None or summary_max_chars <= 0:
            return value
        return value[:summary_max_chars]

    return [
        NodeProgressItem(
            node_key=n.node_key,
            title=n.title,
            phase_index=n.phase_index,
            task_type=n.task_type,
            agent_role=n.agent_role,
            depends_on=n.depends_on or [],
            status=n.status,
            is_ready=n.node_key in ready_keys,
            output_artifact_id=n.output_artifact_id,
            output_summary=_summary(n.output_summary),
            output_payload=n.output_payload if include_payload else None,
            started_at=n.started_at,
            completed_at=n.completed_at,
            error_message=n.error_message,
            retry_count=n.retry_count,
        )
        for n in sorted(nodes, key=lambda x: (x.phase_index, x.node_key))
    ]


def _build_progress(
    mission: Mission,
    nodes: list[MissionTaskNode],
    ready_keys: set[str],
    *,
    include_payload: bool = False,
    summary_max_chars: int | None = 12_000,
) -> MissionProgressResponse:
    total     = len(nodes)
    completed = sum(1 for n in nodes if n.status == TaskNodeStatus.COMPLETED.value)
    running   = sum(1 for n in nodes if n.status == TaskNodeStatus.RUNNING.value)
    failed    = sum(1 for n in nodes if n.status == TaskNodeStatus.FAILED.value)
    skipped   = sum(1 for n in nodes if n.status == TaskNodeStatus.SKIPPED.value)
    pending   = total - completed - running - failed - skipped
    pct       = round((completed / total * 100) if total else 0.0, 1)

    return MissionProgressResponse(
        mission_id=str(mission.id),
        title=mission.title,
        status=mission.status,
        priority=mission.priority,
        confidence=mission.confidence,
        timeline_days=mission.timeline_days,
        total_nodes=total,
        completed_nodes=completed,
        running_nodes=running,
        failed_nodes=failed,
        pending_nodes=pending,
        skipped_nodes=skipped,
        completion_pct=pct,
        nodes=_compute_node_items(
            nodes,
            ready_keys,
            include_payload=include_payload,
            summary_max_chars=summary_max_chars,
        ),
        created_at=mission.created_at,
        approved_at=mission.approved_at,
        started_at=mission.started_at,
        completed_at=mission.completed_at,
        performance_summary=mission.performance_summary,
    )


async def _load_mission_or_404(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
) -> Mission:
    r = await db.execute(
        select(Mission).where(
            Mission.id == mission_id,
            Mission.workspace_id == workspace_id,
        )
    )
    mission = r.scalar_one_or_none()
    if not mission:
        raise HTTPException(404, "Mission not found")
    return mission


async def _load_nodes(
    db: AsyncSession, mission_id: uuid.UUID
) -> list[MissionTaskNode]:
    r = await db.execute(
        select(MissionTaskNode)
        .where(MissionTaskNode.mission_id == mission_id)
        .order_by(MissionTaskNode.phase_index, MissionTaskNode.node_key)
    )
    return list(r.scalars().all())


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{workspace_id}", response_model=list[MissionSummaryItem])
async def list_workspace_missions(
    workspace_id: uuid.UUID,
    status: str | None = Query(None, description="Filter by status (proposed/approved/in_flight/completed/rejected)"),
    limit: int = Query(20, ge=1, le=100),
    hub: bool = Query(False, description="Mission Hub: always include blocking (proposed/approved/in_flight) missions"),
    db: AsyncSession = Depends(get_db),
):
    """
    List missions for a workspace, newest first.
    Includes per-mission node completion counts for the Mission Hub cards.
    """
    if hub and not status:
        missions = await list_missions_for_hub(db, workspace_id, limit=limit)
    else:
        missions = await list_missions(db, workspace_id, status=status, limit=limit)

    items = []
    for m in missions:
        # Use eagerly-loaded task_nodes (selectinload in list_missions) — avoids N+1.
        # Sort to match _load_nodes() ordering for backward-compat output.
        nodes = sorted(
            m.task_nodes or [],
            key=lambda n: (n.phase_index, n.node_key),
        )
        total     = len(nodes)
        completed = sum(1 for n in nodes if n.status == TaskNodeStatus.COMPLETED.value)
        failed    = sum(1 for n in nodes if n.status == TaskNodeStatus.FAILED.value)
        pct = round((completed / total * 100) if total else 0.0, 1)

        items.append(MissionSummaryItem(
            id=str(m.id),
            title=m.title,
            type=m.type,
            trigger_signal=m.trigger_signal,
            objective=m.objective,
            timeline_days=m.timeline_days,
            priority=m.priority,
            confidence=m.confidence,
            status=m.status,
            assigned_agent_roles=m.assigned_agent_roles,
            total_nodes=total,
            completed_nodes=completed,
            failed_nodes=failed,
            completion_pct=pct,
            created_at=m.created_at,
            approved_at=m.approved_at,
            started_at=m.started_at,
            completed_at=m.completed_at,
        ))

    return items


@router.post("/{workspace_id}/propose", response_model=ProposeMissionsResponse)
async def propose_missions(
    workspace_id: uuid.UUID,
    body: ProposeMissionsRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Run the StrategistAgent and persist the resulting MissionProposal[] as proposed missions.

    The agent reads all available intelligence signals (competitor_pulse,
    market_opportunity_ideas, industry_calendar, trend_brief, social_signals,
    learning_context) and generates 2-3 coordinated campaign missions with
    full TaskGraphs.

    Each proposal is persisted with status='proposed' — the operator
    approves or rejects from the Mission Hub.

    NOTE: This call runs a CrewAI agent and may take 30-90 seconds.
    The frontend should show a loading/progress indicator.
    """
    logger.info("propose_missions_requested", workspace_id=str(workspace_id))
    context_signals = (body.context_signals if body else None) or None
    production_package = normalize_hub_production_package(
        body.production_package if body else None,
    )

    blocking = await list_blocking_missions(db, workspace_id)
    if blocking:
        sample = " · ".join(f"{m.title[:36]}" for m in blocking[:2])
        logger.info(
            "propose_missions_blocked",
            workspace_id=str(workspace_id),
            blocking_count=len(blocking),
        )
        return ProposeMissionsResponse(
            workspace_id=str(workspace_id),
            proposals_created=0,
            missions=[],
            skip_reason="blocking_missions",
            message=(
                f"Yeni öneri için önce mevcut misyonları bitirin veya reddedin "
                f"({len(blocking)} bekleyen/aktif). "
                f"{sample}"
            ),
        )

    try:
        created = await propose_missions_for_workspace(
            db, workspace_id, context_signals=context_signals, force=True,
        )
    except RuntimeError as exc:
        # Human-readable LLM/quota errors — return 402 so frontend can display them
        err_msg = str(exc)
        logger.warning("propose_missions_quota_error",
                       workspace_id=str(workspace_id), error=err_msg)
        raise HTTPException(402, err_msg) from exc
    except Exception as exc:
        logger.error("propose_missions_endpoint_failed",
                     workspace_id=str(workspace_id), error=str(exc)[:400])
        raise HTTPException(500, f"Mission proposal generation failed: {exc}") from exc

    if created:
        msg = (
            f"{len(created)} yeni misyon önerisi oluşturuldu. "
            "Mission Hub'dan inceleyip onaylayabilirsiniz."
        )
        skip_reason = None
    else:
        skip_reason = "strategist_empty"
        msg = (
            "StrategistAgent geçerli misyon üretemedi. "
            "Marka Anayasası (açıklama, hedef kitle, konum), galeri analizi ve "
            "sektör sinyallerini kontrol edip birkaç dakika sonra tekrar deneyin."
        )

    return ProposeMissionsResponse(
        workspace_id=str(workspace_id),
        proposals_created=len(created),
        missions=created,
        message=msg,
        skip_reason=skip_reason,
    )


@router.get("/{workspace_id}/agent-stats")
async def get_workspace_agent_stats(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Returns per-agent-role execution statistics derived from task nodes.
    Used by the Agents (Keşfet) screen to populate stats for agents that
    run via the Python mission pipeline (content_strategy_agent, content_agent,
    review_agent) which are not tracked in the Nexus AgentRuns table.
    Must be declared BEFORE /{workspace_id}/{mission_id} to avoid UUID parse clash.
    """
    from sqlalchemy import func, case

    rows = await db.execute(
        select(
            MissionTaskNode.agent_role,
            MissionTaskNode.task_type,
            func.count(MissionTaskNode.id).label("total"),
            func.sum(
                case((MissionTaskNode.status == TaskNodeStatus.COMPLETED.value, 1), else_=0)
            ).label("completed"),
            func.sum(
                case((MissionTaskNode.status == TaskNodeStatus.FAILED.value, 1), else_=0)
            ).label("failed"),
            func.max(MissionTaskNode.completed_at).label("last_run_at"),
        )
        .join(Mission, MissionTaskNode.mission_id == Mission.id)
        .where(Mission.workspace_id == workspace_id)
        .group_by(MissionTaskNode.agent_role, MissionTaskNode.task_type)
    )

    stats: dict[str, dict] = {}
    for row in rows.all():
        role = row.agent_role or "unknown"
        if role not in stats:
            stats[role] = {
                "agent_role": role,
                "total": 0,
                "completed": 0,
                "failed": 0,
                "last_run_at": None,
                "task_types": [],
            }
        stats[role]["total"] += row.total or 0
        stats[role]["completed"] += row.completed or 0
        stats[role]["failed"] += row.failed or 0
        stats[role]["task_types"].append(row.task_type)
        if row.last_run_at:
            new_val = row.last_run_at.isoformat() if hasattr(row.last_run_at, "isoformat") else str(row.last_run_at)
            existing = stats[role]["last_run_at"]
            if existing is None or new_val > existing:
                stats[role]["last_run_at"] = new_val

    return {"workspace_id": str(workspace_id), "agent_stats": list(stats.values())}


@router.get("/{workspace_id}/{mission_id}", response_model=MissionDetailResponse)
async def get_mission_detail(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Full mission detail — includes creative brief, phases, and all task nodes with status."""
    mission = await _load_mission_or_404(db, workspace_id, mission_id)
    nodes   = await _load_nodes(db, mission_id)

    ready_nodes = await get_ready_nodes(db, mission_id)
    ready_keys  = {n.node_key for n in ready_nodes}

    total     = len(nodes)
    completed = sum(1 for n in nodes if n.status == TaskNodeStatus.COMPLETED.value)
    failed    = sum(1 for n in nodes if n.status == TaskNodeStatus.FAILED.value)
    pct = round((completed / total * 100) if total else 0.0, 1)

    return MissionDetailResponse(
        id=str(mission.id),
        title=mission.title,
        type=mission.type,
        trigger_signal=mission.trigger_signal,
        trigger_evidence=mission.trigger_evidence,
        objective=mission.objective,
        timeline_days=mission.timeline_days,
        priority=mission.priority,
        confidence=mission.confidence,
        status=mission.status,
        assigned_agent_roles=mission.assigned_agent_roles,
        creative_brief=mission.creative_brief,
        phases=mission.phases,
        performance_summary=mission.performance_summary,
        total_nodes=total,
        completed_nodes=completed,
        failed_nodes=failed,
        completion_pct=pct,
        created_at=mission.created_at,
        approved_at=mission.approved_at,
        started_at=mission.started_at,
        completed_at=mission.completed_at,
        rejected_at=mission.rejected_at,
        rejected_reason=mission.rejected_reason,
        approved_by=mission.approved_by,
        nodes=_compute_node_items(nodes, ready_keys),
    )


@router.get("/{workspace_id}/{mission_id}/progress", response_model=MissionProgressResponse)
async def get_mission_progress(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    include_payload: bool = Query(False, description="Include full node output_payload fields"),
    summary_max_chars: int = Query(12000, ge=0, le=200000),
    db: AsyncSession = Depends(get_db),
):
    """
    Real-time DAG progress — returns each node's current status plus which
    nodes are ready to run (deps completed, status still pending).

    The Mission Hub polls this every 5-10 seconds while a mission is in_flight.
    The TaskGraphExecutor (Task 6) uses the same ready_nodes logic.
    """
    mission     = await _load_mission_or_404(db, workspace_id, mission_id)
    nodes       = await _load_nodes(db, mission_id)
    ready_nodes = await get_ready_nodes(db, mission_id)
    ready_keys  = {n.node_key for n in ready_nodes}

    return _build_progress(
        mission,
        nodes,
        ready_keys,
        include_payload=include_payload,
        summary_max_chars=summary_max_chars,
    )


@router.get("/{workspace_id}/{mission_id}/production-jobs")
async def get_mission_production_jobs(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Durable Production Factory rollup for the Mission Hub.

    Returns per-slot job status (X/10, queued/producing/ready/failed) so the Hub can
    show factory progress directly from the production_jobs queue (source of truth).
    """
    from app.services.production_job_service import mission_job_summary

    await _load_mission_or_404(db, workspace_id, mission_id)
    return await mission_job_summary(mission_id)


@router.post("/{workspace_id}/{mission_id}/requeue-factory-jobs")
async def requeue_mission_factory_jobs(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Re-queue exhausted factory slots (e.g. fal no_artifact) and kick the drainer."""
    from app.services import production_job_service as pj
    from app.services.production_factory_service import schedule_drain

    await _load_mission_or_404(db, workspace_id, mission_id)
    requeued = await pj.requeue_exhausted(mission_id)
    if requeued or await pj.has_open_jobs(mission_id):
        schedule_drain(mission_id, workspace_id, delay_sec=0.0, force=True, bypass_throttle=True)
    summary = await pj.mission_job_summary(mission_id)
    return {"requeued": requeued, **summary}


@router.put("/{workspace_id}/{mission_id}/approve")
async def approve_workspace_mission(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    data: MissionApprove,
    db: AsyncSession = Depends(get_db),
):
    """
    Approve a proposed mission.

    Transitions status: proposed → approved.
    The TaskGraphExecutor picks up approved missions on the next tick (Task 6)
    and starts scheduling task nodes in dependency order.

    Returns the updated mission summary.
    """
    mission = await approve_mission(db, mission_id, workspace_id, data.approved_by)
    if not mission:
        raise HTTPException(
            400,
            "Mission not found or not in 'proposed' status. "
            "Only proposed missions can be approved."
        )

    nodes = await _load_nodes(db, mission_id)
    total     = len(nodes)
    completed = sum(1 for n in nodes if n.status == TaskNodeStatus.COMPLETED.value)
    pct = round((completed / total * 100) if total else 0.0, 1)

    logger.info("mission_approved_via_api",
                mission_id=str(mission_id), approved_by=data.approved_by)

    # ── Immediately advance the mission graph — no waiting for scheduler tick ──
    # Fire-and-forget: launch ready nodes right now so the operator sees progress
    # within seconds rather than waiting up to 5 minutes for the scheduler.
    try:
        from app.services.task_graph_executor import trigger_advance_mission
        trigger_advance_mission(mission_id, workspace_id)
    except Exception as _e:
        logger.warning("immediate_advance_failed", error=str(_e)[:200])

    return {
        "id":           str(mission.id),
        "title":        mission.title,
        "status":       mission.status,
        "approved_at":  mission.approved_at.isoformat() if mission.approved_at else None,
        "approved_by":  mission.approved_by,
        "total_nodes":  total,
        "completion_pct": pct,
        "message": f"Misyon onaylandı. {total} görev başlatılıyor...",
    }


@router.put("/{workspace_id}/{mission_id}/reject")
async def reject_workspace_mission(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    data: MissionReject,
    db: AsyncSession = Depends(get_db),
):
    """
    Reject a proposed or approved mission.

    Transitions status: proposed|approved → rejected.
    In-flight missions cannot be rejected — cancel them instead.
    """
    mission = await reject_mission(db, mission_id, workspace_id, data.reason)
    if not mission:
        raise HTTPException(
            400,
            "Mission not found or cannot be rejected. "
            "In-flight missions must be cancelled, not rejected."
        )

    logger.info("mission_rejected_via_api",
                mission_id=str(mission_id), reason=data.reason)

    return {
        "id":          str(mission.id),
        "title":       mission.title,
        "status":      mission.status,
        "rejected_at": mission.rejected_at.isoformat() if mission.rejected_at else None,
        "reason":      mission.rejected_reason,
        "message":     "Misyon reddedildi.",
    }


@router.put("/{workspace_id}/{mission_id}/cancel")
async def cancel_workspace_mission(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Cancel an in-flight or approved mission.

    Transitions status: approved|in_flight → cancelled.
    Pending task nodes are left as-is; the TaskGraphExecutor
    checks mission status before scheduling new nodes.
    """
    mission = await _load_mission_or_404(db, workspace_id, mission_id)

    cancellable = {MissionStatus.APPROVED.value, MissionStatus.IN_FLIGHT.value}
    if mission.status not in cancellable:
        raise HTTPException(
            400,
            f"Mission has status '{mission.status}' and cannot be cancelled. "
            "Only approved or in_flight missions can be cancelled."
        )

    from datetime import datetime, timezone
    from sqlalchemy import update

    await db.execute(
        update(Mission)
        .where(Mission.id == mission_id)
        .values(status=MissionStatus.CANCELLED.value,
                rejected_at=datetime.now(timezone.utc))
    )
    await db.commit()

    logger.info("mission_cancelled_via_api", mission_id=str(mission_id))

    return {
        "id":      str(mission_id),
        "status":  MissionStatus.CANCELLED.value,
        "message": "Misyon iptal edildi.",
    }


@router.put("/{workspace_id}/{mission_id}/restart")
async def restart_workspace_mission(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Restart a stalled, failed-partial, or cancelled mission.

    - Resets mission status → in_progress
    - Resets failed/skipped/blocked task nodes → pending
    - Completed nodes are left untouched (partial work preserved)
    - EXCEPT `feed_cohesion_review`, which is always reset because it is a
      derived placeholder node for the latest production pass
    - The TaskGraphExecutor picks it up on the next scheduler tick
    """
    from datetime import datetime, timezone
    from sqlalchemy import update

    mission = await _load_mission_or_404(db, workspace_id, mission_id)

    restartable = {
        MissionStatus.IN_FLIGHT.value,
        MissionStatus.APPROVED.value,
        MissionStatus.CANCELLED.value,
        "completed",   # allow restart of partially-completed missions
    }
    if mission.status not in restartable:
        raise HTTPException(
            400,
            f"Mission has status '{mission.status}' and cannot be restarted."
        )

    # Reset mission
    await db.execute(
        update(Mission)
        .where(Mission.id == mission_id)
        .values(
            status=MissionStatus.IN_FLIGHT.value,
            completed_at=None,
            rejected_at=None,
            rejected_reason=None,
        )
    )

    # Reset failed/skipped/blocked/running nodes — keep completed ones.
    # Running is included so a stuck in_flight node can be manually restarted.
    await db.execute(
        update(MissionTaskNode)
        .where(
            MissionTaskNode.mission_id == mission_id,
            MissionTaskNode.status.in_(["failed", "skipped", "blocked", "running"]),
        )
        .values(
            status=TaskNodeStatus.PENDING.value,
            output_summary=None,
            output_payload=None,
            error_message=None,
            started_at=None,
            completed_at=None,
            retry_count=0,
        )
    )

    # Feed Director node is a placeholder for the latest production/orchestration
    # pass, not durable mission work. Always reset it on restart so the next run
    # recomputes slot assignments and report state from fresh ideation outputs.
    await db.execute(
        update(MissionTaskNode)
        .where(
            MissionTaskNode.mission_id == mission_id,
            MissionTaskNode.task_type == "feed_cohesion_review",
        )
        .values(
            status=TaskNodeStatus.PENDING.value,
            output_summary=None,
            output_payload=None,
            error_message=None,
            started_at=None,
            completed_at=None,
            retry_count=0,
        )
    )

    await db.commit()

    logger.info("mission_restarted_via_api", mission_id=str(mission_id))

    try:
        from app.services.task_graph_executor import trigger_advance_mission
        trigger_advance_mission(mission_id, workspace_id)
    except Exception as _e:
        logger.warning("immediate_advance_on_restart_failed", error=str(_e)[:200])

    return {
        "id":      str(mission_id),
        "status":  MissionStatus.IN_FLIGHT.value,
        "message": "Misyon yeniden başlatıldı.",
    }


@router.patch("/{workspace_id}/{mission_id}/hub-production-package")
async def patch_hub_production_package(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    body: HubProductionPackageRequest,
    db: AsyncSession = Depends(get_db),
):
    """Persist Mission Hub production package on mission.performance_summary."""
    await _load_mission_or_404(db, workspace_id, mission_id)
    pkg = normalize_hub_production_package(body.production_package)
    if not pkg:
        raise HTTPException(
            400,
            "production_package must be weekly_content, campaign, event, or ads_focus",
        )
    tier = str(body.production_profile_tier or "").strip().lower()
    if tier and tier not in {"economy", "agency", "premium"}:
        tier = ""
    ok = await persist_hub_production_package(
        db,
        mission_id,
        pkg,
        production_profile_tier=tier or None,
        last_production_telemetry=body.last_production_telemetry,
    )
    if not ok:
        raise HTTPException(500, "Failed to persist production package")
    return {
        "mission_id": str(mission_id),
        "hub_production_package": pkg,
        "message": "Üretim paketi kaydedildi.",
    }


@router.put("/{workspace_id}/{mission_id}/kick-feed-production")
async def kick_feed_production(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    body: MissionFeedProductionRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Start Feed auto-produce in the background (non-blocking).
    Returns immediately; artifacts appear in Feed as each slot completes.
    """
    try:
        return await kick_feed_production_service(
            db, workspace_id, mission_id, body,
        )
    except FeedProductionError as exc:
        raise _feed_production_http_error(exc) from exc


@router.post("/{workspace_id}/{mission_id}/reset-production")
async def reset_mission_production(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Operator: wipe factory jobs + mission artifacts before a clean 16-slot reproduce."""
    from app.services.mission_production_reset_service import reset_mission_production_state

    await _load_mission_or_404(db, workspace_id, mission_id)
    summary = await reset_mission_production_state(
        db, workspace_id=workspace_id, mission_id=mission_id,
    )
    return {"ok": True, **summary}


@router.put("/{workspace_id}/{mission_id}/reproduce-feed")
async def reproduce_mission_feed(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    body: MissionFeedProductionRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Re-run Feed Art Director + auto-produce from existing content_ideation output.
    Use when ideation succeeded but Feed artifacts were never created (budget, timeout).
    Operator action — does not re-run Strategist or Crew ideation.
    """
    try:
        return await reproduce_feed_production_service(
            db, workspace_id, mission_id, body,
        )
    except FeedProductionError as exc:
        raise _feed_production_http_error(exc) from exc


@router.get("/{workspace_id}/{mission_id}/performance")
async def get_mission_performance(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Node execution duration metrics for a single mission.

    Returns per-node timing so operators can identify slow agents / prompts.
    """
    from app.models.mission import MissionTaskNode
    from sqlalchemy import select as sel

    mission = await _load_mission_or_404(db, workspace_id, mission_id)
    rows = await db.execute(
        sel(
            MissionTaskNode.node_key,
            MissionTaskNode.task_type,
            MissionTaskNode.status,
            MissionTaskNode.started_at,
            MissionTaskNode.completed_at,
            MissionTaskNode.retry_count,
        ).where(MissionTaskNode.mission_id == mission.id)
    )
    nodes = []
    total_duration_ms = 0
    for row in rows.all():
        duration_ms = None
        if row.started_at and row.completed_at:
            duration_ms = int((row.completed_at - row.started_at).total_seconds() * 1000)
            total_duration_ms += duration_ms
        nodes.append({
            "node_key": row.node_key,
            "task_type": row.task_type,
            "status": row.status,
            "started_at": row.started_at.isoformat() if row.started_at else None,
            "completed_at": row.completed_at.isoformat() if row.completed_at else None,
            "duration_ms": duration_ms,
            "retries": row.retry_count,
        })
    nodes.sort(key=lambda n: n["duration_ms"] or 0, reverse=True)
    return {
        "mission_id": str(mission_id),
        "total_pipeline_ms": total_duration_ms,
        "nodes": nodes,
        "slowest_node": nodes[0]["node_key"] if nodes else None,
    }
