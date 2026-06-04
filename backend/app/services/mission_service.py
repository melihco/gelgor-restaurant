"""
Mission Service — CRUD and factory helpers for the Mission orchestration layer.

Responsibilities:
  - Create / read / update Mission and MissionTaskNode rows
  - Factory: build a seasonal MissionCreate from a phase-change signal
  - Status transitions with side-effect guards (approved → in_flight, etc.)

The StrategistAgent (Task 4) will call create_mission() with fully dynamic
task graphs. Until then, create_seasonal_mission_from_phase_change() supplies
a sensible hardcoded graph so the phase-change detector (Task 3) produces
real, usable missions immediately.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.mission import Mission, MissionTaskNode
from app.schemas.mission import (
    MissionCreate,
    MissionPhase,
    MissionPriority,
    MissionStatus,
    MissionType,
    TaskNodeCreate,
    TaskNodeStatus,
    TaskNodeStatusUpdate,
)

logger = structlog.get_logger()


# ── Factory: seasonal campaign from phase change ──────────────────────────────

_INDUSTRY_GRAPH_PROFILES: dict[str, dict] = {
    "healthcare_clinic": {
        "post_count": 4, "reel_count": 2,
        "reel_brief_suffix": "eğitici kısa video, hasta deneyimi, bilgilendirme",
        "include_review": True, "calendar_days": 10,
    },
    "beauty_wellness": {
        "post_count": 5, "reel_count": 4,
        "reel_brief_suffix": "before/after, uygulama süreci, müşteri dönüşümü",
        "include_review": True, "calendar_days": 7,
    },
    "ecommerce_retail": {
        "post_count": 6, "reel_count": 3,
        "reel_brief_suffix": "ürün tanıtım, unboxing, kampanya duyurusu",
        "include_review": False, "calendar_days": 7,
    },
    "real_estate": {
        "post_count": 4, "reel_count": 2,
        "reel_brief_suffix": "proje tanıtım turu, lokasyon avantajları",
        "include_review": False, "calendar_days": 14,
    },
    "agency_services": {
        "post_count": 4, "reel_count": 2,
        "reel_brief_suffix": "süreç gösterimi, müşteri başarı hikayesi",
        "include_review": False, "calendar_days": 14,
    },
    "local_products_shop": {
        "post_count": 5, "reel_count": 3,
        "reel_brief_suffix": "ürün hikayesi, üretim süreci, tadım deneyimi",
        "include_review": True, "calendar_days": 7,
    },
}

_DEFAULT_GRAPH_PROFILE: dict = {
    "post_count": 5, "reel_count": 4,
    "reel_brief_suffix": "reel ve story formatı",
    "include_review": True, "calendar_days": 7,
}


def _seasonal_task_graph(
    phase_name: str,
    business_name: str,
    content_posture: str,
    business_type: str = "",
) -> list[TaskNodeCreate]:
    """
    Adaptive task graph for a seasonal campaign mission.
    Graph shape varies by business_type: node counts, calendar length,
    and whether review_analysis is included.
    """
    from app.crew.industry_playbooks import normalize_industry_id

    norm_type = normalize_industry_id(business_type) if business_type else ""
    profile = _INDUSTRY_GRAPH_PROFILES.get(norm_type, _DEFAULT_GRAPH_PROFILE)

    strategy_brief = (
        f"Mevcut sezon fazı: {phase_name}. "
        f"İçerik duruşu: {content_posture}. "
        f"İşletme tipi: {business_type or 'genel'}. "
        f"Bu faza ve sektöre özgü bir içerik stratejisi oluştur — genel evergreen değil, "
        f"sezonun getirdiği fırsatları ve aciliyeti yansıt."
    )

    nodes: list[TaskNodeCreate] = [
        TaskNodeCreate(
            node_key="content_strategy",
            phase_index=0,
            title=f"{phase_name} — İçerik Stratejisi",
            task_type="content_strategy",
            agent_role="content_strategy_agent",
            input_data={"time_period": phase_name},
            brief_override=strategy_brief,
            depends_on=[],
        ),
    ]

    phase0_keys = ["content_strategy"]

    if profile["include_review"]:
        nodes.append(TaskNodeCreate(
            node_key="review_analysis",
            phase_index=0,
            title="Yorum Durumu Analizi",
            task_type="review_analysis",
            agent_role="review_agent",
            input_data={},
            depends_on=[],
        ))
        phase0_keys.append("review_analysis")

    post_count = profile["post_count"]
    reel_count = profile["reel_count"]
    reel_suffix = profile["reel_brief_suffix"]

    nodes.append(TaskNodeCreate(
        node_key="post_ideation",
        phase_index=1,
        title=f"{phase_name} — Post Fikirleri ({post_count} konsept)",
        task_type="content_ideation",
        agent_role="content_agent",
        input_data={"count": post_count, "time_period": phase_name},
        depends_on=["content_strategy"],
    ))

    if reel_count > 0:
        nodes.append(TaskNodeCreate(
            node_key="reel_ideation",
            phase_index=1,
            title=f"{phase_name} — Reel/Story Fikirleri ({reel_count} konsept)",
            task_type="content_ideation",
            agent_role="content_agent",
            input_data={"count": reel_count, "time_period": f"{phase_name} - {reel_suffix}"},
            depends_on=["content_strategy"],
        ))

    cal_days = profile["calendar_days"]
    nodes.append(TaskNodeCreate(
        node_key="content_calendar",
        phase_index=2,
        title=f"{phase_name} — {cal_days} Günlük Yayın Takvimi",
        task_type="content_calendar",
        agent_role="content_agent",
        input_data={"duration_days": cal_days, "frequency": "daily"},
        depends_on=["post_ideation"],
    ))

    return nodes


def create_seasonal_mission_from_phase_change(
    workspace_id: uuid.UUID,
    business_name: str,
    old_phase: str | None,
    new_phase: str,
    phase_data: dict[str, Any],
    business_type: str = "",
) -> MissionCreate:
    """
    Build a MissionCreate from an industry calendar phase transition.

    Called by _detect_phase_transitions_job() when current_phase != last_known_phase.
    The resulting mission is persisted with status='proposed' — the operator
    approves or rejects it from the Mission Hub.

    phase_data: the current_phase dict from industry_calendar JSON, containing:
      - name, key_message, content_posture, urgency_level, days_until_next_phase
    """
    key_message    = phase_data.get("key_message", "")
    content_posture = phase_data.get("content_posture", "")
    urgency        = phase_data.get("urgency_level", "MEDIUM")
    days_left      = phase_data.get("days_until_next_phase")

    # Map urgency to mission priority
    priority_map = {"HIGH": MissionPriority.CRITICAL, "MEDIUM": MissionPriority.HIGH}
    priority = priority_map.get(urgency, MissionPriority.MEDIUM)

    # Confidence is high because it's driven by structured data, not LLM inference
    confidence = 0.90

    timeline_days = min(days_left, 21) if days_left else 14

    creative_brief = (
        f"SEZON GEÇIŞI: {old_phase or 'önceki faz'} → {new_phase}\n\n"
        f"Mevcut dönem mesajı: {key_message}\n"
        f"İçerik duruşu: {content_posture}\n\n"
        f"{business_name} için bu geçişi sahiple. Genel içerik değil — "
        f"bu sezonun getirdiği somut fırsat ve aciliyeti yansıtan içerikler üret. "
        f"Marka tonuna sadık kal, yeni fazın enerjisini içeri taşı."
    )

    transition_text = f"{old_phase or '—'} → {new_phase}"

    # Build task_nodes first — node_keys_set depends on it
    task_nodes = _seasonal_task_graph(new_phase, business_name, content_posture, business_type)

    node_keys_set = {n.node_key for n in task_nodes}

    phase0_keys = [k for k in ["content_strategy", "review_analysis"] if k in node_keys_set]
    phase1_keys = [k for k in ["post_ideation", "reel_ideation"] if k in node_keys_set]
    phase2_keys = [k for k in ["content_calendar"] if k in node_keys_set]

    phases = [
        MissionPhase(index=0, name="Strateji & Analiz",
                     description="İçerik stratejisi" + (" + yorum durumu" if "review_analysis" in node_keys_set else ""),
                     node_keys=phase0_keys),
        MissionPhase(index=1, name="İçerik Üretimi",
                     description="Sezona özel içerik fikirleri",
                     node_keys=phase1_keys),
        MissionPhase(index=2, name="Yayın Planı",
                     description="İçerik takvimi",
                     node_keys=phase2_keys),
    ]

    return MissionCreate(
        title=f"{new_phase} Kampanya Lansmanı — {business_name}",
        type=MissionType.SEASONAL,
        trigger_signal="industry_calendar.current_phase",
        trigger_evidence=transition_text,
        objective=(
            f"{new_phase} döneminde marka görünürlüğünü artır, "
            f"sezonsal içerik fırsatlarını değerlendir."
        ),
        timeline_days=timeline_days,
        creative_brief=creative_brief,
        phases=phases,
        assigned_agent_roles=[
            "content_strategy_agent", "content_agent", "review_agent"
        ],
        priority=priority,
        confidence=confidence,
        task_nodes=task_nodes,
    )


# ── Feed Art Director node (Mission Hub visibility) ───────────────────────────

def ensure_feed_cohesion_review_node(
    task_nodes: list[TaskNodeCreate],
) -> list[TaskNodeCreate]:
    """
    Strategist graphs often omit feed_cohesion_review. The production stack runs
    Feed Art Director inline after content_ideation; this placeholder node stores
    the report for Mission Hub (executor skips crew execution for this task_type).
    """
    if any(n.task_type == "feed_cohesion_review" for n in task_nodes):
        return task_nodes

    ideation_keys = [n.node_key for n in task_nodes if n.task_type == "content_ideation"]
    if not ideation_keys:
        return task_nodes

    max_phase = max(n.phase_index for n in task_nodes)
    return [
        *task_nodes,
        TaskNodeCreate(
            node_key="feed_cohesion_review",
            phase_index=max_phase + 1,
            title="Feed uyumu ve slot planı",
            task_type="feed_cohesion_review",
            agent_role="feed_art_director_agent",
            input_data={},
            depends_on=ideation_keys,
        ),
    ]


# ── CRUD ──────────────────────────────────────────────────────────────────────

async def create_mission(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    data: MissionCreate,
) -> Mission:
    """
    Persist a Mission and all its TaskNodes atomically.

    TaskNodes are inserted in phase_index order so the DB rows are
    naturally ordered for the executor's topological sort query.
    """
    mission = Mission(
        id=uuid.uuid4(),
        workspace_id=workspace_id,
        title=data.title,
        type=data.type.value if hasattr(data.type, "value") else data.type,
        trigger_signal=data.trigger_signal,
        trigger_evidence=data.trigger_evidence,
        objective=data.objective,
        timeline_days=data.timeline_days,
        creative_brief=data.creative_brief,
        phases=[p.model_dump() for p in data.phases] if data.phases else None,
        assigned_agent_roles=data.assigned_agent_roles,
        priority=data.priority.value if hasattr(data.priority, "value") else data.priority,
        confidence=data.confidence,
        status=MissionStatus.PROPOSED.value,
    )
    db.add(mission)
    await db.flush()  # get mission.id before inserting nodes

    normalized_nodes = ensure_feed_cohesion_review_node(list(data.task_nodes))

    for node_data in sorted(normalized_nodes, key=lambda n: n.phase_index):
        node = MissionTaskNode(
            id=uuid.uuid4(),
            mission_id=mission.id,
            workspace_id=workspace_id,
            node_key=node_data.node_key,
            phase_index=node_data.phase_index,
            title=node_data.title,
            task_type=node_data.task_type,
            agent_role=node_data.agent_role,
            input_data=node_data.input_data or {},
            brief_override=node_data.brief_override,
            depends_on=node_data.depends_on or [],
            status=TaskNodeStatus.PENDING.value,
            retry_count=0,
        )
        db.add(node)

    await db.commit()
    await db.refresh(mission)

    logger.info(
        "mission_created",
        mission_id=str(mission.id),
        workspace_id=str(workspace_id),
        type=mission.type,
        status=mission.status,
        nodes=len(normalized_nodes),
    )
    return mission


async def get_mission(
    db: AsyncSession,
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
) -> Mission | None:
    r = await db.execute(
        select(Mission)
        .options(selectinload(Mission.task_nodes))
        .where(Mission.id == mission_id, Mission.workspace_id == workspace_id)
    )
    return r.scalar_one_or_none()


async def list_missions(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    status: str | None = None,
    limit: int = 20,
) -> list[Mission]:
    # selectinload(task_nodes) eliminates N+1 — callers like list_workspace_missions
    # previously fired one query per mission to load nodes.
    q = (
        select(Mission)
        .options(selectinload(Mission.task_nodes))
        .where(Mission.workspace_id == workspace_id)
    )
    if status:
        q = q.where(Mission.status == status)
    q = q.order_by(Mission.created_at.desc()).limit(limit)
    r = await db.execute(q)
    return list(r.scalars().all())


async def approve_mission(
    db: AsyncSession,
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
    approved_by: str,
) -> Mission | None:
    mission = await get_mission(db, mission_id, workspace_id)
    if not mission or mission.status != MissionStatus.PROPOSED.value:
        return None
    mission.status = MissionStatus.APPROVED.value
    mission.approved_at = datetime.now(timezone.utc)
    mission.approved_by = approved_by
    await db.commit()
    logger.info("mission_approved", mission_id=str(mission_id), approved_by=approved_by)
    return mission


async def reject_mission(
    db: AsyncSession,
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
    reason: str | None = None,
) -> Mission | None:
    mission = await get_mission(db, mission_id, workspace_id)
    if not mission or mission.status not in (
        MissionStatus.PROPOSED.value, MissionStatus.APPROVED.value
    ):
        return None
    mission.status = MissionStatus.REJECTED.value
    mission.rejected_at = datetime.now(timezone.utc)
    mission.rejected_reason = reason
    await db.commit()
    logger.info("mission_rejected", mission_id=str(mission_id), reason=reason)
    return mission


async def update_node_status(
    db: AsyncSession,
    mission_id: uuid.UUID,
    node_key: str,
    update: TaskNodeStatusUpdate,
) -> MissionTaskNode | None:
    """Update a task node's status and output fields. Used by the TaskGraphExecutor."""
    r = await db.execute(
        select(MissionTaskNode).where(
            MissionTaskNode.mission_id == mission_id,
            MissionTaskNode.node_key == node_key,
        )
    )
    node = r.scalar_one_or_none()
    if not node:
        return None

    node.status = update.status.value
    if update.output_artifact_id:
        node.output_artifact_id = update.output_artifact_id
    if update.output_summary:
        node.output_summary = update.output_summary
    if update.error_message:
        node.error_message = update.error_message
    if update.status == TaskNodeStatus.RUNNING:
        node.started_at = datetime.now(timezone.utc)
    elif update.status in (TaskNodeStatus.COMPLETED, TaskNodeStatus.FAILED, TaskNodeStatus.SKIPPED):
        node.completed_at = datetime.now(timezone.utc)

    await db.commit()
    return node


async def get_ready_nodes(
    db: AsyncSession,
    mission_id: uuid.UUID,
) -> list[MissionTaskNode]:
    """
    Return all PENDING nodes whose every dependency has status='completed'.
    Called by the TaskGraphExecutor every tick to advance the graph.

    Two-phase approach to avoid asyncpg lazy-load issues with ARRAY columns:
    1. Column-level select → plain Row tuples (safe ARRAY access, fast)
    2. ORM select for only the ready node_keys → full objects for the executor
    """
    # Phase 1: lightweight column read — avoids ARRAY lazy-load on ORM objects
    r = await db.execute(
        select(
            MissionTaskNode.node_key,
            MissionTaskNode.status,
            MissionTaskNode.depends_on,
        ).where(MissionTaskNode.mission_id == mission_id)
    )
    rows = r.all()

    completed_keys = {row.node_key for row in rows if row.status == TaskNodeStatus.COMPLETED.value}
    ready_keys = [
        row.node_key for row in rows
        if row.status == TaskNodeStatus.PENDING.value
        and all(dep in completed_keys for dep in (row.depends_on or []))
    ]

    if not ready_keys:
        return []

    # Phase 2: load full ORM objects only for the ready nodes
    r2 = await db.execute(
        select(MissionTaskNode).where(
            MissionTaskNode.mission_id == mission_id,
            MissionTaskNode.node_key.in_(ready_keys),
        )
    )
    return list(r2.scalars().all())


async def get_completed_node_outputs(
    db: AsyncSession,
    mission_id: uuid.UUID,
) -> list[dict[str, Any]]:
    """
    Return lightweight output summaries for all completed nodes in a mission.
    Used by the TaskGraphExecutor to build MissionMemory before firing a node,
    so the executing agent knows what other agents have already produced.
    """
    r = await db.execute(
        select(
            MissionTaskNode.node_key,
            MissionTaskNode.title,
            MissionTaskNode.task_type,
            MissionTaskNode.phase_index,
            MissionTaskNode.output_summary,
            MissionTaskNode.status,
        )
        .where(
            MissionTaskNode.mission_id == mission_id,
            MissionTaskNode.status == TaskNodeStatus.COMPLETED.value,
        )
        .order_by(MissionTaskNode.phase_index, MissionTaskNode.node_key)
    )
    return [
        {
            "node_key":      row.node_key,
            "title":         row.title,
            "task_type":     row.task_type,
            "phase_index":   row.phase_index,
            "output_summary": row.output_summary or "",
        }
        for row in r.all()
    ]
