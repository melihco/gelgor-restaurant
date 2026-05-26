"""
Strategist Service — application-layer wrapper for the StrategistAgent crew.

Bridges the gap between:
  - intelligence layer (BrandInfo with all signals)
  - mission orchestration layer (Mission DB rows + TaskNodes)

Flow:
  1. Load BrandInfo for the workspace (all intelligence signals already merged)
  2. Call run_mission_planning() via the CrewEngine
  3. Parse the MissionProposal[] output
  4. Persist each proposal as a Mission row with status='proposed'
  5. Return the created Mission objects

Called by:
  - POST /api/missions/{workspace_id}/propose  (Task 5 — Mission API)
  - _daily_strategist_job() in scheduler (future enhancement)

Error handling: partial success is acceptable — if 2 of 3 proposals parse
correctly, persist the 2 and log the failure for the 3rd.
"""

from __future__ import annotations

import uuid
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.crew.context import BrandInfo
from app.crew.crews.strategist_crew import run_mission_planning
from app.crew.engine import get_crew_engine
from app.schemas.mission import (
    MissionCreate,
    MissionPhase,
    MissionPriority,
    MissionType,
    TaskNodeCreate,
)
from app.services.brand_context_service import build_brand_info
from app.services.mission_service import create_mission, list_missions
from app.services.tenant_learning_service import (
    build_tenant_learning_snapshot,
    build_learning_context_prompt,
)

logger = structlog.get_logger()


def _proposal_dict_to_mission_create(proposal: dict[str, Any]) -> MissionCreate | None:
    """
    Convert a validated proposal dict (from strategist_crew._validate_proposals)
    into a MissionCreate schema object.

    Returns None if the proposal is structurally invalid (missing nodes, etc).
    """
    try:
        # Phases
        phases = [
            MissionPhase(
                index=p["index"],
                name=p["name"],
                description=p.get("description", ""),
                node_keys=p.get("node_keys", []),
            )
            for p in (proposal.get("phases") or [])
        ]

        # Task nodes
        task_nodes = [
            TaskNodeCreate(
                node_key=n["node_key"],
                phase_index=n["phase_index"],
                title=n["title"],
                task_type=n["task_type"],
                agent_role=n["agent_role"],
                input_data=n.get("input_data") or {},
                brief_override=n.get("brief_override"),
                depends_on=n.get("depends_on") or [],
            )
            for n in (proposal.get("task_nodes") or [])
        ]

        if not task_nodes:
            return None

        mission_type = proposal.get("type", "manual")
        priority_str = proposal.get("priority", "high")

        return MissionCreate(
            title=proposal["title"],
            type=MissionType(mission_type) if mission_type in MissionType._value2member_map_ else MissionType.MANUAL,
            trigger_signal=proposal.get("trigger_signal"),
            trigger_evidence=proposal.get("trigger_evidence"),
            objective=proposal.get("objective"),
            timeline_days=proposal.get("timeline_days", 14),
            creative_brief=proposal.get("creative_brief"),
            phases=phases,
            task_nodes=task_nodes,
            assigned_agent_roles=proposal.get("assigned_agent_roles"),
            priority=MissionPriority(priority_str) if priority_str in MissionPriority._value2member_map_ else MissionPriority.HIGH,
            confidence=proposal.get("confidence", 0.8),
        )

    except Exception as exc:
        logger.warning("proposal_conversion_failed", error=str(exc)[:200],
                       title=proposal.get("title", "?"))
        return None


async def _load_recent_mission_context(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    lookback_days: int = 60,
) -> str:
    """
    Build a 'recently done' block for the StrategistAgent so it never proposes
    the same angle twice.  Includes:
    - Completed + in-flight missions (what's been executed)
    - Proposed/approved missions still pending (what's been queued)
    - Recently produced content titles (from suggestions table)
    """
    from sqlalchemy import select as _select
    from datetime import datetime, timedelta, timezone as _tz
    from app.models.mission import Mission as _Mission

    lines: list[str] = []
    cutoff = datetime.now(_tz.utc) - timedelta(days=lookback_days)

    # Recent missions (all statuses except rejected/cancelled)
    r = await db.execute(
        _select(_Mission.title, _Mission.type, _Mission.status, _Mission.trigger_signal)
        .where(
            _Mission.workspace_id == workspace_id,
            _Mission.created_at >= cutoff,
            _Mission.status.notin_(["rejected", "cancelled"]),
        )
        .order_by(_Mission.created_at.desc())
        .limit(15)
    )
    missions = r.all()
    if missions:
        lines.append("### SON ÖNERILEN / ÇALIŞAN MİSYONLAR (BUNLARI TEKRAR ÖNERME):")
        for m in missions:
            lines.append(f"- [{m[2].upper()}] {m[0]} (tür: {m[1]}, sinyal: {m[3] or 'manuel'})")
        lines.append("")

    # Recently produced content (last 3 weeks) — from suggestions table
    try:
        from app.models.task import Suggestion
        r2 = await db.execute(
            _select(Suggestion.title, Suggestion.suggestion_type, Suggestion.status)
            .where(
                Suggestion.workspace_id == workspace_id,
                Suggestion.agent_role == "content_agent",
                Suggestion.created_at >= datetime.now(_tz.utc) - timedelta(days=21),
                Suggestion.title.isnot(None),
            )
            .order_by(Suggestion.created_at.desc())
            .limit(20)
        )
        recent_content = r2.all()
        if recent_content:
            lines.append("### SON 3 HAFTADA ÜRETİLEN İÇERİKLER (TEKRAR ETME):")
            for c in recent_content:
                lines.append(f"- {c[0]} ({c[1]}, {c[2]})")
            lines.append("")
    except Exception:
        pass

    return "\n".join(lines)


async def propose_missions_for_workspace(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    force: bool = False,
) -> list[dict[str, Any]]:
    """
    Run the StrategistAgent for a workspace and persist resulting proposals.

    Returns a list of created mission dicts (id + title + status + proposal metadata).
    Skips LLM call when active/proposed missions already exist (unless force=True).
    """
    # ── Debounce: don't re-run expensive StrategistAgent if pipeline is busy ──
    if not force:
        existing_missions = await list_missions(db, workspace_id, limit=30)
        blocking_statuses = {"proposed", "in_flight", "approved"}
        blocking = [m for m in existing_missions if m.status in blocking_statuses]
        if blocking:
            logger.info(
                "propose_missions_skipped_active",
                workspace_id=str(workspace_id),
                blocking_count=len(blocking),
                statuses=[m.status for m in blocking[:5]],
            )
            return []

    # ── Load brand intelligence ───────────────────────────────────────────
    brand: BrandInfo | None = await build_brand_info(db, workspace_id)
    if not brand:
        logger.warning("propose_missions_no_brand", workspace_id=str(workspace_id))
        return []

    # Inject learning context (approved/rejected history) into BrandInfo
    try:
        snapshot   = await build_tenant_learning_snapshot(db, str(workspace_id))
        lc         = build_learning_context_prompt(snapshot)
        if lc:
            brand.learning_context = lc
    except Exception as exc:
        logger.warning("propose_missions_learning_load_failed", error=str(exc)[:200])

    # ── Inject "recently done" context to prevent repetition ─────────────
    try:
        recent_context = await _load_recent_mission_context(db, workspace_id)
        if recent_context:
            brand.learning_context = (brand.learning_context or "") + "\n\n" + recent_context
    except Exception as exc:
        logger.warning("recent_mission_context_failed", error=str(exc)[:200])

    # ── Performance feedback: inject real engagement patterns ────────────
    try:
        from app.services.performance_feedback_service import refresh_learning_context_with_performance
        ig_handle = brand.instagram_handle or ""
        settings = get_settings()
        if ig_handle and settings.apify_api_key:
            brand.learning_context = await refresh_learning_context_with_performance(
                brand_name=brand.business_name,
                instagram_handle=ig_handle,
                existing_learning_context=brand.learning_context or "",
                api_key=settings.apify_api_key,
                timeout=30,
            )
    except Exception as exc:
        logger.warning("strategist_performance_feedback_failed", error=str(exc)[:200])

    # ── Run StrategistAgent ───────────────────────────────────────────────
    import asyncio
    engine = get_crew_engine()

    try:
        result = await asyncio.to_thread(
            engine.execute,
            "strategic_agent",
            "mission_planning",
            brand,
            {},
        )
    except Exception as exc:
        err_str = str(exc)
        logger.error("propose_missions_crew_failed",
                     workspace_id=str(workspace_id), error=err_str[:400])
        # Surface quota/auth errors so the API layer can return a meaningful message
        if "insufficient_quota" in err_str or "429" in err_str:
            raise RuntimeError(
                "OpenAI API kotası tükenmiş (429). Lütfen OpenAI hesabınıza kredi ekleyin."
            ) from exc
        if "401" in err_str or "Unauthorized" in err_str:
            raise RuntimeError("OpenAI API key geçersiz (401). Lütfen key'i kontrol edin.") from exc
        raise

    proposals: list[dict] = result.get("proposals") or []
    if not proposals:
        logger.warning("propose_missions_no_proposals",
                       workspace_id=str(workspace_id),
                       raw_preview=result.get("raw_output", "")[:200])
        await _record_propose_mission_cost(db, workspace_id, created_count=0)
        return []

    # ── Persist each valid proposal ───────────────────────────────────────
    created: list[dict[str, Any]] = []
    for proposal in proposals:
        mission_create = _proposal_dict_to_mission_create(proposal)
        if not mission_create:
            continue
        try:
            mission = await create_mission(db, workspace_id, mission_create)
            created.append({
                "id":               str(mission.id),
                "title":            mission.title,
                "type":             mission.type,
                "status":           mission.status,
                "priority":         mission.priority,
                "confidence":       mission.confidence,
                "timeline_days":    mission.timeline_days,
                "rationale":        proposal.get("rationale", ""),
                "expected_outcome": proposal.get("expected_outcome", ""),
            })
            logger.info(
                "mission_proposal_persisted",
                workspace_id=str(workspace_id),
                mission_id=str(mission.id),
                title=mission.title,
                nodes=len(mission_create.task_nodes),
            )
        except Exception as exc:
            logger.error("mission_proposal_save_failed",
                         title=mission_create.title, error=str(exc)[:300])

    logger.info(
        "propose_missions_complete",
        workspace_id=str(workspace_id),
        total_proposals=len(proposals),
        persisted=len(created),
    )

    await _record_propose_mission_cost(db, workspace_id, created_count=len(created))
    return created


async def _record_propose_mission_cost(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    created_count: int,
) -> None:
    """Record estimated StrategistAgent LLM cost."""
    try:
        from app.services.usage_cost_service import (
            CATEGORY_MISSION_PROPOSE,
            check_budget,
            record_cost,
        )
        estimate = 0.22 if created_count > 0 else 0.12
        budget = await check_budget(db, workspace_id, estimate)
        if budget["allowed"]:
            await record_cost(
                db,
                workspace_id,
                estimate,
                CATEGORY_MISSION_PROPOSE,
                mission_count=created_count,
            )
    except Exception as exc:
        logger.warning("propose_missions_cost_record_failed", error=str(exc)[:200])
