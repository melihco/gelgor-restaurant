"""
TaskGraph Executor — the autonomous campaign engine.

Advances mission task graphs by finding ready nodes (pending + all deps completed)
and firing engine.execute() for each one in an asyncio task.

Execution model
───────────────
1. APScheduler calls advance_all_active_missions() every 5 minutes (safety net).
2. Each time a node completes (or fails permanently), the completion handler
   immediately calls advance_mission() again — no waiting for the next tick.
   This means a 5-node, 3-wave mission can complete in ~15 min even if the
   scheduler tick is 5 min.

Node lifecycle
──────────────
  pending  →  running  →  completed
                        ↘  failed (retry_count < MAX_RETRIES)  → pending (retry)
                        ↘  failed (retry_count ≥ MAX_RETRIES)  → failed (permanent)
                        ↘  skipped (hard dep failed)

Mission lifecycle
─────────────────
  approved  →  in_flight (first node starts running)
  in_flight →  completed (all nodes terminal: completed/failed/skipped)

Brief injection (Mission Memory layer)
───────────────────────────────────────
Each node receives the mission creative_brief as its `input_data["brief"]`
unless the node already has a `brief_override`. This is the shared context
that ties all agent outputs in the campaign together narratively.

Content agent serialization
────────────────────────────
content_agent cannot run two crews for the same tenant simultaneously.
We acquire the per-tenant lock from execution_locks.py before calling
engine.execute() — the same lock used by the HTTP orchestration path.
"""

from __future__ import annotations

import asyncio
import os
import uuid
import json
from datetime import datetime, timezone, timedelta
from typing import Any

import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.crew.engine import get_crew_engine
from app.models.mission import Mission, MissionTaskNode
from app.schemas.mission import MissionStatus, TaskNodeStatus
from app.services.brand_context_service import build_brand_info, get_brand_context
from app.services.trend_intelligence_service import ensure_fresh_trend_brief_for_propose
from app.services.execution_locks import content_agent_lock
from app.services.mission_service import (
    ensure_feed_cohesion_review_persisted_node,
    get_ready_nodes,
)
from app.services.output_summary_parser import extract_structured_payload_from_output_summary
from app.services.brand_execution_context import (
    LEARNING_TASK_TYPES,
    apply_gallery_usage,
    apply_learning_context,
)

logger = structlog.get_logger()

MAX_NODE_RETRIES = 3  # 4 total attempts (0 + 3 retries) — LLM calls can be flaky


def _sanitize_node_error(error_msg: str, task_type: str | None = None) -> str:
    """Store operator-readable errors — CrewAI dumps the full task prompt otherwise."""
    msg = (error_msg or "").strip()
    if not msg:
        return "Bilinmeyen görev hatası"

    lower = msg.lower()
    if "execution timed out after" in lower:
        return msg[:500]
    if "maximum execution time" in lower or "max execution time" in lower:
        if task_type == "content_ideation":
            return (
                "İçerik fikirleri üretimi zaman aşımına uğradı "
                "(büyük haftalık paket — otomatik yeniden denenecek)."
            )
        return msg[:500]

    if msg.startswith("Task '") or msg.startswith("The task '"):
        if task_type == "content_ideation":
            return "İçerik fikirleri üretilemedi (LLM görevi tamamlanamadı)."
        return "Görev tamamlanamadı (LLM hatası)."

    return msg[:500]

# Nodes with a live asyncio task in this process — used to detect DB "running" orphans
# after uvicorn reload or crash (in-memory task gone, DB row still running).
_active_node_executions: set[uuid.UUID] = set()
ORPHAN_NODE_MIN_ELAPSED_SECONDS = 45


def _node_stale_threshold_seconds(
    task_type: str,
    input_data: dict | None,
    *,
    is_orphan: bool,
) -> float:
    """Per-task stale window — content_ideation can run 10+ min; 45s orphan kills it."""
    settings = get_settings()
    if task_type == "content_ideation":
        from app.services.package_weekly_geometry import (
            resolve_content_ideation_executor_timeout_seconds,
        )

        count = int((input_data or {}).get("count") or 10)
        iterations = int((input_data or {}).get("iterations") or 1)
        full = float(
            resolve_content_ideation_executor_timeout_seconds(count, iterations)
        )
        return full * (1.15 if is_orphan else 1.5)
    if task_type in ("content_calendar", "visual_design_cards", "feed_cohesion_review"):
        base = float(settings.crew_execution_timeout_seconds) * 2.0
        return base * (1.0 if is_orphan else 1.5)
    if is_orphan:
        return float(ORPHAN_NODE_MIN_ELAPSED_SECONDS)
    return float(settings.crew_execution_timeout_seconds) * 1.5


async def _requeue_orphaned_running_nodes_on_startup() -> int:
    """Reset DB ``running`` rows after process restart — no retry budget burn."""
    factory = _get_session_factory()
    async with factory() as db:
        res = await db.execute(
            update(MissionTaskNode)
            .where(MissionTaskNode.status == TaskNodeStatus.RUNNING.value)
            .execution_options(synchronize_session=False)
            .values(
                status=TaskNodeStatus.PENDING.value,
                started_at=None,
                error_message="[Startup recovery] Re-queued after process restart.",
            )
            .returning(MissionTaskNode.id)
        )
        rows = res.fetchall()
        await db.commit()
    if rows:
        logger.info("startup_requeue_orphan_running_nodes", count=len(rows))
    return len(rows)

# Debounced Feed ensure — coalesce feed_cohesion / mission-complete / calendar triggers.
_scheduled_ensure_tasks: dict[str, asyncio.Task] = {}

# Task types that require per-tenant serialization (content_agent crews).
# content_strategy uses a DIFFERENT agent (content_strategy_agent) with its own
# tools (Perplexity, Apify) and does NOT share CrewAI runtime state — no lock needed.
_SERIALIZED_TASK_TYPES = frozenset({
    "content_ideation", "content_calendar",
    "visual_design_cards",
})

# Task types that benefit from tenant learning context injection.
# Shared with the internal orchestrator via the canonical constant.
_LEARNING_TASK_TYPES = LEARNING_TASK_TYPES


# ── Session factory helper ─────────────────────────────────────────────────────

def _get_session_factory():
    """Return the async session factory (imported lazily to avoid circular imports)."""
    from app.database import async_session_factory
    return async_session_factory


# ── Mission status helpers ─────────────────────────────────────────────────────

async def _mark_mission_in_flight(db: AsyncSession, mission_id: uuid.UUID) -> None:
    """Transition mission from approved → in_flight when the first node starts."""
    await db.execute(
        update(Mission)
        .where(Mission.id == mission_id, Mission.status == MissionStatus.APPROVED.value)
        .execution_options(synchronize_session=False)
        .values(
            status=MissionStatus.IN_FLIGHT.value,
            started_at=datetime.now(timezone.utc),
        )
    )
    await db.commit()


async def _check_and_complete_mission(
    db: AsyncSession,
    mission_id: uuid.UUID,
) -> bool:
    """
    If all task nodes are terminal (completed/failed/skipped), mark the mission
    as completed and write a performance_summary.

    Uses column-level select (not full ORM objects) to avoid asyncpg lazy-load
    issues with ARRAY columns.

    Returns True if the mission was just completed.
    """
    # Column-level select — returns Row namedtuples, no ORM lazy-load risk
    r = await db.execute(
        select(MissionTaskNode.node_key, MissionTaskNode.status)
        .where(MissionTaskNode.mission_id == mission_id)
    )
    rows = r.all()
    if not rows:
        return False

    terminal = {
        TaskNodeStatus.COMPLETED.value,
        TaskNodeStatus.FAILED.value,
        TaskNodeStatus.SKIPPED.value,
    }
    all_terminal = all(row.status in terminal for row in rows)
    if not all_terminal:
        return False

    total     = len(rows)
    completed = sum(1 for row in rows if row.status == TaskNodeStatus.COMPLETED.value)
    failed    = sum(1 for row in rows if row.status == TaskNodeStatus.FAILED.value)
    skipped   = sum(1 for row in rows if row.status == TaskNodeStatus.SKIPPED.value)

    r = await db.execute(
        select(Mission.performance_summary, Mission.status).where(Mission.id == mission_id)
    )
    prev_row = r.one_or_none()
    prev = dict(prev_row[0] or {}) if prev_row else {}
    current_status = prev_row[1] if prev_row else None

    # Defer mission completion while the durable production factory still has open slots.
    from app.services import production_job_service as jobs

    job_summary = await jobs.mission_job_summary(mission_id)
    if job_summary["total"] > 0 and not job_summary.get("complete"):
        production_state = "draining" if job_summary["active"] > 0 else "queued"
        if int(job_summary.get("failed") or 0) >= job_summary["total"]:
            production_state = "exhausted"

        _TRANSIENT_KEYS = {"production_status", "feed_production_lock"}
        summary = {k: v for k, v in prev.items() if k not in _TRANSIENT_KEYS}
        summary.update({
            "total_nodes":     total,
            "completed_nodes": completed,
            "failed_nodes":    failed,
            "skipped_nodes":   skipped,
            "completion_rate": round(completed / total, 2) if total else 0,
            "production_state": production_state,
            "slots_ready":     job_summary["ready"],
            "slots_total":     job_summary["total"],
        })

        await db.execute(
            update(Mission)
            .where(Mission.id == mission_id)
            .execution_options(synchronize_session=False)
            .values(
                status=MissionStatus.IN_FLIGHT.value,
                completed_at=None,
                performance_summary=summary,
            )
        )
        await db.commit()

        logger.info(
            "mission_completion_deferred_factory",
            mission_id=str(mission_id),
            slots_ready=job_summary["ready"],
            slots_total=job_summary["total"],
            active=job_summary["active"],
            prior_status=current_status,
        )
        return False

    # Faz 4.3 — completion must MERGE, not replace. Previously this wiped the whole
    # summary (keeping only production_error), losing ai_cost_breakdown, last_feed_produce,
    # production_path, last_production_telemetry, production_profile_tier, etc. — so cost
    # visibility vanished the moment a mission completed. Preserve all durable keys; only
    # drop the transient ones that no longer make sense on a completed mission.
    _TRANSIENT_KEYS = {"production_status", "feed_production_lock"}
    summary = {k: v for k, v in prev.items() if k not in _TRANSIENT_KEYS}
    summary.update({
        "total_nodes":     total,
        "completed_nodes": completed,
        "failed_nodes":    failed,
        "skipped_nodes":   skipped,
        "completion_rate": round(completed / total, 2) if total else 0,
    })

    await db.execute(
        update(Mission)
        .where(Mission.id == mission_id)
        .execution_options(synchronize_session=False)
        .values(
            status=MissionStatus.COMPLETED.value,
            completed_at=datetime.now(timezone.utc),
            performance_summary=summary,
        )
    )
    await db.commit()

    logger.info(
        "mission_completed",
        mission_id=str(mission_id),
        completed=completed,
        failed=failed,
        skipped=skipped,
    )
    return True


async def try_complete_mission_when_factory_done(mission_id: uuid.UUID) -> bool:
    """Mark mission completed when DAG nodes and production factory are both done."""
    factory = _get_session_factory()
    async with factory() as db:
        done = await _check_and_complete_mission(db, mission_id)
        if not done:
            return False
        r = await db.execute(
            select(Mission.workspace_id).where(Mission.id == mission_id)
        )
        row = r.first()
        workspace_id = row[0] if row else None

    if workspace_id:
        _schedule_ensure_mission_feed(mission_id, workspace_id, delay_sec=10)
    return True


async def _skip_blocked_nodes(
    db: AsyncSession,
    mission_id: uuid.UUID,
    failed_node_key: str,
) -> list[str]:
    """
    Mark as 'skipped' any pending node whose depends_on chain includes a failed node.
    Uses a simple BFS: if a dep is failed or skipped, the node is blocked.

    Uses column-level select to avoid asyncpg lazy-load issues with ARRAY columns.
    """
    # Select only the columns we need — Row namedtuples, no ORM lazy-load risk
    r = await db.execute(
        select(
            MissionTaskNode.node_key,
            MissionTaskNode.status,
            MissionTaskNode.depends_on,
        ).where(MissionTaskNode.mission_id == mission_id)
    )
    rows = r.all()
    # Build a plain dict: node_key → (status, depends_on_list)
    all_nodes: dict[str, tuple[str, list[str]]] = {
        row.node_key: (row.status, row.depends_on or [])
        for row in rows
    }

    # Collect all permanently blocked keys (failed + skipped)
    blocked: set[str] = {
        k for k, (status, _) in all_nodes.items()
        if status in (TaskNodeStatus.FAILED.value, TaskNodeStatus.SKIPPED.value)
    }

    skipped_now: list[str] = []
    changed = True
    while changed:
        changed = False
        for key, (status, deps) in all_nodes.items():
            if status != TaskNodeStatus.PENDING.value:
                continue
            if key in blocked:          # already queued — skip to prevent infinite loop
                continue
            if any(dep in blocked for dep in deps):
                blocked.add(key)
                skipped_now.append(key)
                changed = True

    if skipped_now:
        await db.execute(
            update(MissionTaskNode)
            .where(
                MissionTaskNode.mission_id == mission_id,
                MissionTaskNode.node_key.in_(skipped_now),
            )
            .execution_options(synchronize_session=False)
            .values(
                status=TaskNodeStatus.SKIPPED.value,
                completed_at=datetime.now(timezone.utc),
                error_message=f"Skipped: upstream node '{failed_node_key}' failed",
            )
        )
        await db.commit()
        logger.info(
            "nodes_skipped",
            mission_id=str(mission_id),
            skipped=skipped_now,
            cause=failed_node_key,
        )

    return skipped_now


# ── Node execution ─────────────────────────────────────────────────────────────

async def _execute_node(
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
    node_key: str,
    task_type: str,
    agent_role: str,
    input_data: dict[str, Any],
    mission_brief: str | None,
    node_id: uuid.UUID,
    node_title: str = "",
    node_phase_index: int = 0,
) -> None:
    """
    Execute a single task node end-to-end:
      1. Mark node running + mission in_flight
      2. Load brand intelligence
      3. Acquire content lock if needed
      4. engine.execute() in thread
      5. Update node status (completed / retry / failed)
      6. Skip downstream blocked nodes
      7. Immediately advance the mission graph
    """
    factory = _get_session_factory()
    settings = get_settings()
    engine   = get_crew_engine()
    ws_str   = str(workspace_id)

    # ── Step 1: Mark running ──────────────────────────────────────────────────
    async with factory() as db:
        await db.execute(
            update(MissionTaskNode)
            .where(MissionTaskNode.id == node_id)
            .execution_options(synchronize_session=False)
            .values(
                status=TaskNodeStatus.RUNNING.value,
                started_at=datetime.now(timezone.utc),
            )
        )
        await db.commit()
        await _mark_mission_in_flight(db, mission_id)

    logger.info(
        "node_execution_start",
        mission_id=str(mission_id),
        node_key=node_key,
        task_type=task_type,
        agent_role=agent_role,
    )

    _active_node_executions.add(node_id)
    try:
        await _execute_node_body(
            mission_id=mission_id,
            workspace_id=workspace_id,
            node_key=node_key,
            task_type=task_type,
            agent_role=agent_role,
            input_data=input_data,
            mission_brief=mission_brief,
            node_id=node_id,
            node_title=node_title,
            node_phase_index=node_phase_index,
            factory=factory,
            settings=settings,
            engine=engine,
            ws_str=ws_str,
        )
    finally:
        _active_node_executions.discard(node_id)


async def _execute_node_body(
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
    node_key: str,
    task_type: str,
    agent_role: str,
    input_data: dict[str, Any],
    mission_brief: str | None,
    node_id: uuid.UUID,
    node_title: str,
    node_phase_index: int,
    factory,
    settings,
    engine,
    ws_str: str,
) -> None:
    # Feed Art Director — real execution via engine.execute().
    # Loads merged ideation output, builds input_data, and runs FD LLM crew.
    # Once completed, production pipeline reads the persisted output_summary directly.
    if task_type == "feed_cohesion_review":
        async with factory() as db:
            await ensure_feed_cohesion_review_persisted_node(db, mission_id, workspace_id)

        # Build FD input from completed ideation + calendar nodes
        merged_summary = await _resolve_merged_ideation_summary(mission_id, "")
        if not merged_summary or len(merged_summary.strip()) < 10:
            await _fail_node(
                factory, mission_id, workspace_id, node_id, node_key,
                "No content ideation output available for Feed Art Director",
                current_retry=0,
            )
            return

        mission_ctx = await _load_mission_production_context(mission_id)
        ctx = mission_ctx or {}
        from app.crew.tasks.feed_art_director_tasks import FD_CONTENT_IDEAS_INPUT_MAX_CHARS

        weekly_theme = ""
        try:
            import json as _fd_json
            clean = merged_summary.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
            ideas = _fd_json.loads(clean) if clean.startswith("[") else []
            if ideas:
                weekly_theme = str(ideas[0].get("strategic_purpose", "") or "")[:100]
        except Exception:
            pass
        brief = (ctx.get("creative_brief") or "").strip()
        title = (ctx.get("mission_title") or "").strip()
        if brief and brief not in weekly_theme:
            weekly_theme = f"{weekly_theme} | {brief[:120]}".strip(" |")

        input_data = {
            **(input_data or {}),
            "content_ideas_json": merged_summary[:FD_CONTENT_IDEAS_INPUT_MAX_CHARS],
            "weekly_theme": weekly_theme,
            "mission_type": ctx.get("mission_type") or "",
            "mission_title": title,
            "creative_brief": brief,
            "production_package": ctx.get("production_package") or None,
            "production_profile": ctx.get("production_profile") or None,
        }
        # Fall through to standard execution path (Step 2+)

    # ── Step 2: Load brand + inject learning context ───────────────────────────
    async with factory() as db:
        brand = await build_brand_info(db, workspace_id)
        if not brand:
            await _fail_node(
                factory, mission_id, workspace_id, node_id, node_key,
                "No brand context configured for this workspace",
                current_retry=0,
            )
            return

        if task_type in _LEARNING_TASK_TYPES:
            try:
                await apply_learning_context(db, brand, ws_str)
            except Exception as lc_exc:
                logger.warning("node_learning_load_failed", node_key=node_key,
                               error=str(lc_exc)[:200])

        if task_type == "content_ideation":
            try:
                await apply_gallery_usage(brand, ws_str)
            except Exception as gu_exc:
                logger.warning("node_gallery_usage_load_failed", node_key=node_key,
                               error=str(gu_exc)[:200])

            # Enrich with operating policy (gallery/AI capability blocks).
            # Previously only called from orchestration.py; adding here ensures
            # mission content_ideation nodes also respect the brand's production policy.
            try:
                from app.services.brand_context_service import enrich_brand_operating_policy
                brand = enrich_brand_operating_policy(brand)
            except Exception as op_exc:
                logger.warning("node_operating_policy_enrich_failed", node_key=node_key,
                               error=str(op_exc)[:200])

    # ── Step 2b: Build MissionMemory (Task 7 — campaign narrative continuity) ────
    # Loads mission metadata + already-completed node outputs, builds a
    # MissionMemory object and attaches it to brand.mission_memory.
    # build_brand_context_prompt() will append the Mission Context block.
    # Failures here are non-fatal — agent still runs, just without campaign context.
    resolved_profile_tier: str | None = None
    resolved_subscription_plan_slug: str | None = None
    try:
        from app.services.subscription_plan_service import resolve_workspace_plan_slug

        resolved_subscription_plan_slug = await resolve_workspace_plan_slug(ws_str)
    except Exception:
        resolved_subscription_plan_slug = None

    try:
        async with factory() as db:
            from sqlalchemy import select as _select
            from app.models.mission import Mission as _Mission
            from app.services.mission_service import get_completed_node_outputs
            from app.crew.mission_memory import MissionMemory

            r_m = await db.execute(_select(_Mission).where(_Mission.id == mission_id))
            _mission = r_m.scalar_one_or_none()
            if _mission:
                # Faz 2.1 — resolve production tier (economy/agency/premium) for
                # tier-aware behaviour (e.g. content_ideation iterations).
                try:
                    from app.services.production_profile_service import (
                        resolve_production_profile_tier,
                    )

                    _summary = dict(getattr(_mission, "performance_summary", None) or {})
                    resolved_profile_tier = resolve_production_profile_tier(
                        package_slug=resolved_subscription_plan_slug,
                        profile_tier_override=str(_summary.get("production_profile_tier") or "") or None,
                    )
                except Exception:
                    resolved_profile_tier = None

                completed_outputs = await get_completed_node_outputs(db, mission_id)

                # Derive phases metadata for current_phase name
                phases = _mission.phases or []
                current_phase = next(
                    (p for p in phases if p.get("index") == node_phase_index),
                    phases[0] if phases else {}
                ) if phases else {}

                brand.mission_memory = MissionMemory(
                    mission_id=str(mission_id),
                    mission_title=_mission.title,
                    mission_type=_mission.type,
                    creative_brief=_mission.creative_brief or mission_brief or "",
                    trigger_evidence=_mission.trigger_evidence or "",
                    phase_name=current_phase.get("name", f"Faz {node_phase_index + 1}"),
                    phase_index=node_phase_index,
                    total_phases=len(phases) if phases else 1,
                    current_node_key=node_key,
                    current_node_title=node_title,
                    completed_outputs=completed_outputs,
                )
                logger.info(
                    "mission_memory_built",
                    mission_id=str(mission_id),
                    node_key=node_key,
                    completed_outputs=len(completed_outputs),
                )
    except Exception as mm_exc:
        logger.warning("mission_memory_build_failed", node_key=node_key,
                       error=str(mm_exc)[:200])

    # ── Step 3: Build effective input (inject mission brief + strategy output) ──
    effective_input = dict(input_data or {})
    if mission_brief and not effective_input.get("brief"):
        effective_input["brief"] = mission_brief

    # Pass mission_id so content ideation can inject a run-unique variation seed.
    if task_type == "content_ideation" and "mission_id" not in effective_input:
        effective_input["mission_id"] = str(mission_id)

    # Package-aware ideation count + CREWAI_CONTENT_ITERATIONS parity.
    if task_type == "content_ideation":
        from app.services.package_weekly_geometry import (
            format_mix_label,
            resolve_content_ideation_iterations,
            resolve_weekly_package_geometry,
        )

        weekly_geo = resolve_weekly_package_geometry(resolved_subscription_plan_slug)
        effective_input["count"] = weekly_geo["total"]
        effective_input.setdefault("format_mix", format_mix_label(weekly_geo))
        if "iterations" not in effective_input:
            effective_input["iterations"] = resolve_content_ideation_iterations(
                resolved_subscription_plan_slug,
            )
        node_retry = await _get_retry_count(factory, node_id)
        if node_retry >= 1:
            # After a timeout, drop to single iteration so the node can complete.
            effective_input["iterations"] = 1
        logger.info(
            "content_ideation_package_geometry",
            node_key=node_key,
            plan_slug=resolved_subscription_plan_slug,
            count=weekly_geo["total"],
            iterations=effective_input["iterations"],
            node_retry=node_retry,
        )

    # Inject recently used weekly_themes into content_strategy so it avoids repeating them.
    if task_type == "content_strategy":
        async with factory() as _theme_db:
            recent_themes = await _load_recent_weekly_themes(_theme_db, workspace_id)
        if recent_themes:
            theme_block = (
                "=== DAHA ÖNCE KULLANILAN HAFTALIK TEMALAR (BUNLARI TEKRAR ETME) ===\n"
                + "\n".join(f"- {t}" for t in recent_themes)
                + "\n→ Bu hafta için TAMAMEN FARKLI bir tema seç."
            )
            effective_input["context_signals"] = (
                (effective_input.get("context_signals") or "").rstrip() + "\n\n" + theme_block
            ).strip()
            logger.info(
                "recent_weekly_themes_injected",
                node_key=node_key,
                count=len(recent_themes),
            )

    # Brand dynamics — mandatory date/sector/location angles for ideation & calendar.
    if task_type in ("content_ideation", "content_calendar", "content_strategy"):
        try:
            from app.services.context_signal_service import build_brand_dynamics_block
            dynamics_block = build_brand_dynamics_block(brand)
            if dynamics_block.strip():
                effective_input["context_signals"] = (
                    (effective_input.get("context_signals") or "").rstrip()
                    + "\n\n"
                    + dynamics_block.strip()
                ).strip()
                logger.info(
                    "brand_dynamics_injected",
                    node_key=node_key,
                    task_type=task_type,
                    chars=len(dynamics_block),
                )
        except Exception as bd_exc:
            logger.warning(
                "brand_dynamics_inject_failed",
                node_key=node_key,
                error=str(bd_exc)[:200],
            )

    # Wire strategy → ideation/calendar: inject content_strategy output into brief
    # so the ideation agent sees the weekly theme, pillar_mix and format targets.
    if task_type in ("content_ideation", "content_calendar"):
        mm = getattr(brand, "mission_memory", None)
        if mm:
            strategy_outputs = [
                o for o in (mm.completed_outputs or [])
                if o.get("task_type") == "content_strategy" and o.get("output_summary")
            ]
            if strategy_outputs:
                from app.services.content_strategy_brief import build_strategy_brief_for_downstream

                strategy_brief = build_strategy_brief_for_downstream(
                    strategy_outputs[-1]["output_summary"],
                )
                existing_brief = effective_input.get("brief", "")
                effective_input["brief"] = (
                    "=== CONTENT STRATEGY (read first — weekly theme, pillar mix, format targets) ===\n"
                    f"{strategy_brief}\n\n"
                    "=== MISSION BRIEF ===\n"
                    f"{existing_brief}"
                ).strip()
                logger.info(
                    "strategy_brief_injected",
                    node_key=node_key,
                    task_type=task_type,
                    strategy_chars=len(strategy_brief),
                )

    # ── Step 4: Execute (with per-tenant lock for content_agent) ──────────────
    timeout = float(settings.crew_execution_timeout_seconds)
    if task_type == "content_ideation":
        from app.services.package_weekly_geometry import (
            resolve_content_ideation_executor_timeout_seconds,
        )

        timeout = float(
            resolve_content_ideation_executor_timeout_seconds(
                int(effective_input.get("count") or 10),
                int(effective_input.get("iterations") or 1),
            )
        )

    try:
        if task_type in _SERIALIZED_TASK_TYPES:
            async with content_agent_lock(ws_str):
                result = await asyncio.wait_for(
                    asyncio.to_thread(engine.execute, agent_role, task_type, brand, effective_input),
                    timeout=timeout,
                )
        else:
            result = await asyncio.wait_for(
                asyncio.to_thread(engine.execute, agent_role, task_type, brand, effective_input),
                timeout=timeout,
            )

    except asyncio.TimeoutError:
        await _fail_node(
            factory, mission_id, workspace_id, node_id, node_key,
            f"Execution timed out after {timeout}s",
            current_retry=await _get_retry_count(factory, node_id),
        )
        await _advance_after_node(mission_id, workspace_id)
        return

    except Exception as exc:
        await _fail_node(
            factory, mission_id, workspace_id, node_id, node_key,
            _sanitize_node_error(str(exc), task_type),
            current_retry=await _get_retry_count(factory, node_id),
            task_type=task_type,
        )
        await _advance_after_node(mission_id, workspace_id)
        return

    # ── Step 5: Success — mark completed ──────────────────────────────────────
    output_artifact_id: str | None = None
    output_summary: str | None = None
    output_payload: dict[str, Any] | list[dict[str, Any]] | None = None

    if result.get("status") == "completed":
        # Extract artifact ID if present in result (content/review/ads outputs)
        output_artifact_id = (
            result.get("artifact_id") or
            result.get("suggestion_id") or
            result.get("task_id")
        )
        if output_artifact_id:
            output_artifact_id = str(output_artifact_id)

        raw = result.get("raw_output") or ""
        output_summary = raw if raw else None  # store full output — column is TEXT (unlimited)
        output_payload = (
            extract_structured_payload_from_output_summary(output_summary)
            if output_summary else None
        ) or None

        async with factory() as db:
            await db.execute(
                update(MissionTaskNode)
                .where(MissionTaskNode.id == node_id)
                .execution_options(synchronize_session=False)
                .values(
                    status=TaskNodeStatus.COMPLETED.value,
                    completed_at=datetime.now(timezone.utc),
                    output_artifact_id=output_artifact_id,
                    output_summary=output_summary,
                    output_payload=output_payload,
                )
            )
            await db.commit()

        logger.info(
            "node_execution_complete",
            mission_id=str(mission_id),
            node_key=node_key,
            task_type=task_type,
            has_artifact=bool(output_artifact_id),
        )

        if task_type in ("content_strategy", "content_ideation", "feed_cohesion_review"):
            try:
                from app.services.ai_cost_service import record_mission_task_ai_cost

                _tokens = int(result.get("tokens_used") or 0)
                _model = str(result.get("model", "") or "")
                async with factory() as cost_db:
                    await record_mission_task_ai_cost(
                        cost_db, workspace_id, mission_id, task_type,
                        tokens_used=_tokens, model=_model,
                    )
            except Exception as cost_exc:
                logger.warning(
                    "mission_task_cost_record_failed",
                    mission_id=str(mission_id),
                    task_type=task_type,
                    error=str(cost_exc)[:200],
                )

        # Feed production runs once via feed_cohesion_review completion.
        # When FD completes as a real node, kick the production pipeline immediately.
        if task_type == "feed_cohesion_review" and output_summary:
            logger.info(
                "feed_cohesion_review_complete_trigger_production",
                mission_id=str(mission_id),
                node_key=node_key,
            )
            _schedule_ensure_mission_feed(mission_id, workspace_id, delay_sec=5)

        if task_type == "visual_design_cards" and output_summary:
            _schedule_ensure_mission_feed(mission_id, workspace_id, delay_sec=45)

        # ── content_calendar: schedule debounced ensure after calendar lands ──
        if task_type == "content_calendar" and output_summary:
            logger.info(
                "content_calendar_ready_for_feed",
                mission_id=str(mission_id),
                node_key=node_key,
            )
            _schedule_ensure_mission_feed(mission_id, workspace_id, delay_sec=45)
    else:
        # Crew returned status != "completed"
        error_msg = result.get("error", "Crew returned non-completed status")
        await _fail_node(
            factory, mission_id, workspace_id, node_id, node_key,
            _sanitize_node_error(str(error_msg), task_type),
            current_retry=await _get_retry_count(factory, node_id),
            task_type=task_type,
        )

    # ── Step 6+7: Advance the graph ───────────────────────────────────────────
    await _advance_after_node(mission_id, workspace_id)


async def _get_retry_count(factory, node_id: uuid.UUID) -> int:
    async with factory() as db:
        r = await db.execute(
            select(MissionTaskNode.retry_count).where(MissionTaskNode.id == node_id)
        )
        row = r.first()
        return row[0] if row else 0


async def _fail_node(
    factory,
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
    node_id: uuid.UUID,
    node_key: str,
    error_msg: str,
    current_retry: int,
    task_type: str | None = None,
) -> None:
    """Increment retry count. If under limit → reset to pending. Else → permanent failure."""
    error_msg = _sanitize_node_error(error_msg, task_type)
    new_retry = current_retry + 1

    if new_retry <= MAX_NODE_RETRIES:
        # Retry: reset to pending so the next tick picks it up
        async with factory() as db:
            await db.execute(
                update(MissionTaskNode)
                .where(MissionTaskNode.id == node_id)
                .execution_options(synchronize_session=False)
                .values(
                    status=TaskNodeStatus.PENDING.value,
                    retry_count=new_retry,
                    error_message=f"[Attempt {new_retry}] {error_msg}",
                    started_at=None,
                )
            )
            await db.commit()
        logger.warning(
            "node_execution_retry",
            mission_id=str(mission_id),
            node_key=node_key,
            attempt=new_retry,
            error=error_msg[:200],
        )
    else:
        # Permanent failure
        async with factory() as db:
            await db.execute(
                update(MissionTaskNode)
                .where(MissionTaskNode.id == node_id)
                .execution_options(synchronize_session=False)
                .values(
                    status=TaskNodeStatus.FAILED.value,
                    completed_at=datetime.now(timezone.utc),
                    retry_count=new_retry,
                    error_message=f"[Final] {error_msg}",
                )
            )
            await db.commit()

            # Skip any nodes that depended on this one
            await _skip_blocked_nodes(db, mission_id, node_key)
            await _check_and_complete_mission(db, mission_id)

        logger.error(
            "node_execution_failed_permanent",
            mission_id=str(mission_id),
            node_key=node_key,
            attempts=new_retry,
            error=error_msg[:200],
        )


async def _advance_after_node(mission_id: uuid.UUID, workspace_id: uuid.UUID) -> None:
    """Called after any node completion or permanent failure — advances the graph immediately."""
    factory = _get_session_factory()
    async with factory() as db:
        # Check if mission is already terminal
        r = await db.execute(
            select(Mission.status).where(Mission.id == mission_id)
        )
        row = r.first()
        if not row:
            return
        if row[0] in (
            MissionStatus.COMPLETED.value,
            MissionStatus.REJECTED.value,
            MissionStatus.CANCELLED.value,
        ):
            return

        # Check completion
        done = await _check_and_complete_mission(db, mission_id)
        if done:
            _schedule_ensure_mission_feed(mission_id, workspace_id, delay_sec=10)
            return

    # Not done — advance to next wave
    await advance_mission(mission_id, workspace_id)


# ── Graph advancement ──────────────────────────────────────────────────────────

def trigger_advance_mission(
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
    *,
    delay_sec: float = 0.0,
) -> None:
    """Fire-and-forget mission advance, routed by orchestrator.

    Celery mode: dispatch to the durable ``advance`` queue (runs on a worker).
    APScheduler mode: schedule an in-process asyncio task on the app loop.
    """
    from app.config import get_settings

    if get_settings().use_celery_orchestrator:
        try:
            from app.tasks.advance_tasks import advance_mission as _advance_task

            _advance_task.apply_async(
                args=[str(mission_id), str(workspace_id)],
                countdown=max(0.0, float(delay_sec)),
                queue="advance",
            )
            return
        except Exception as exc:  # pragma: no cover - fall back if broker down
            logger.warning(
                "trigger_advance.celery_dispatch_failed_fallback_asyncio",
                mission_id=str(mission_id),
                error=str(exc)[:200],
            )

    asyncio.create_task(
        advance_mission(mission_id, workspace_id),
        name=f"advance_mission_{mission_id}",
    )


async def advance_mission(
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
) -> int:
    """
    Find all ready nodes for a mission and fire them as asyncio tasks.

    A node is "ready" when:
      - status = pending
      - all node_keys in depends_on have status = completed

    Returns the number of nodes launched.
    """
    factory = _get_session_factory()

    async with factory() as db:
        # Guard: only advance approved/in_flight missions
        r = await db.execute(
            select(Mission).where(
                Mission.id == mission_id,
                Mission.workspace_id == workspace_id,
            )
        )
        mission = r.scalar_one_or_none()
        if not mission:
            return 0
        if mission.status not in (
            MissionStatus.APPROVED.value,
            MissionStatus.IN_FLIGHT.value,
        ):
            return 0

        ready_nodes = await get_ready_nodes(db, mission_id)
        if not ready_nodes:
            # No ready nodes — either all running/waiting or all terminal
            await _check_and_complete_mission(db, mission_id)
            return 0

        mission_brief = mission.creative_brief

    # Under Celery, _execute_node must run to completion within this task's event
    # loop (run_until_complete) — fire-and-forget create_task would be orphaned.
    # The completion chain (_execute_node → _advance_after_node → advance_mission)
    # is awaited, so gathering the first wave drains the whole subtree. In the
    # in-process (APScheduler) path we keep fire-and-forget so callers return fast.
    from app.config import get_settings

    gather_nodes = get_settings().use_celery_orchestrator

    launched = 0
    node_coros = []
    for node in ready_nodes:
        logger.info(
            "node_scheduling",
            mission_id=str(mission_id),
            node_key=node.node_key,
            task_type=node.task_type,
        )
        coro = _execute_node(
            mission_id=mission_id,
            workspace_id=workspace_id,
            node_key=node.node_key,
            task_type=node.task_type,
            agent_role=node.agent_role,
            input_data=dict(node.input_data or {}),
            mission_brief=mission_brief,
            node_id=node.id,
            node_title=node.title,
            node_phase_index=node.phase_index,
        )
        if gather_nodes:
            node_coros.append(coro)
        else:
            asyncio.create_task(coro, name=f"node_{mission_id}_{node.node_key}")
        launched += 1

    if gather_nodes and node_coros:
        await asyncio.gather(*node_coros, return_exceptions=True)

    logger.info(
        "mission_advanced",
        mission_id=str(mission_id),
        nodes_launched=launched,
    )
    return launched


async def _recover_stale_running_nodes() -> int:
    """
    Detect and recover nodes stuck in 'running' state beyond the timeout.

    This handles the case where:
    - OpenAI quota/API errors cause silent hangs
    - Server restarts lose in-memory asyncio tasks
    - CrewAI internal retries loop indefinitely

    Nodes running > 2x the timeout are either retried or permanently failed.
    """
    factory = _get_session_factory()
    # Recover stale nodes after task-type-aware timeout (see _node_stale_threshold_seconds).

    recovered = 0
    async with factory() as db:
        r = await db.execute(
            select(
                MissionTaskNode.id,
                MissionTaskNode.node_key,
                MissionTaskNode.title,
                MissionTaskNode.task_type,
                MissionTaskNode.input_data,
                MissionTaskNode.started_at,
                MissionTaskNode.retry_count,
                MissionTaskNode.mission_id,
                Mission.status.label("mission_status"),
                Mission.workspace_id,
            )
            .join(Mission, Mission.id == MissionTaskNode.mission_id)
            .where(
                MissionTaskNode.status == TaskNodeStatus.RUNNING.value,
                MissionTaskNode.started_at.isnot(None),
            )
        )
        stale_rows = r.all()

        now = datetime.now(timezone.utc)
        for row in stale_rows:
            if not row.started_at:
                continue
            started = row.started_at.replace(tzinfo=timezone.utc) if row.started_at.tzinfo is None else row.started_at
            elapsed = (now - started).total_seconds()

            is_orphan = row.id not in _active_node_executions
            input_data = row.input_data if isinstance(row.input_data, dict) else {}
            stale_threshold_seconds = _node_stale_threshold_seconds(
                str(row.task_type or ""),
                input_data,
                is_orphan=is_orphan,
            )
            if elapsed < stale_threshold_seconds:
                continue

            mission_status = row.mission_status
            retry_count = row.retry_count or 0

            if mission_status in (MissionStatus.CANCELLED.value, MissionStatus.REJECTED.value):
                await db.execute(
                    update(MissionTaskNode)
                    .where(MissionTaskNode.id == row.id)
                    .execution_options(synchronize_session=False)
                    .values(
                        status=TaskNodeStatus.FAILED.value,
                        completed_at=now,
                        error_message=f"Orphaned: mission was {mission_status} while task was running ({int(elapsed)}s elapsed)",
                    )
                )
                logger.info("stale_node_orphan_cleaned", node_key=row.node_key, elapsed_s=int(elapsed))
                recovered += 1

            elif retry_count < MAX_NODE_RETRIES:
                await db.execute(
                    update(MissionTaskNode)
                    .where(MissionTaskNode.id == row.id)
                    .execution_options(synchronize_session=False)
                    .values(
                        status=TaskNodeStatus.PENDING.value,
                        started_at=None,
                        retry_count=retry_count + 1,
                        error_message=(
                            f"[Orphan recovery] Task lost after server restart ({int(elapsed)}s). "
                            f"Retry {retry_count + 1}/{MAX_NODE_RETRIES}"
                            if is_orphan
                            else f"[Auto-recovery] LLM call exceeded {int(stale_threshold_seconds)}s. "
                                 f"Retry {retry_count + 1}/{MAX_NODE_RETRIES}"
                        ),
                    )
                )
                log_event = "orphan_node_auto_retry" if is_orphan else "stale_node_auto_retry"
                logger.warning(log_event, node_key=row.node_key, elapsed_s=int(elapsed), attempt=retry_count + 1)
                recovered += 1

            else:
                await db.execute(
                    update(MissionTaskNode)
                    .where(MissionTaskNode.id == row.id)
                    .execution_options(synchronize_session=False)
                    .values(
                        status=TaskNodeStatus.FAILED.value,
                        completed_at=now,
                        retry_count=retry_count + 1,
                        error_message=(
                            "İçerik üretimi yarıda kesildi (sunucu yeniden yüklendi veya görev "
                            f"zaman aşımı — {int(elapsed)} sn). Deneme hakkı tükendi; "
                            "'Hatalı görevleri yeniden başlat' ile devam edin."
                        ),
                    )
                )
                await _skip_blocked_nodes(db, row.mission_id, row.node_key)
                logger.error("stale_node_permanent_fail", node_key=row.node_key, elapsed_s=int(elapsed))
                recovered += 1

        if recovered:
            await db.commit()

    if recovered:
        logger.info("stale_node_recovery_complete", recovered=recovered)
    return recovered


async def advance_all_active_missions() -> dict[str, int]:
    """
    Scheduler entry point — called every 5 minutes.

    Finds all approved/in_flight missions across all workspaces and calls
    advance_mission() for each. This serves as:
      1. The initial trigger when a mission is approved
      2. A recovery mechanism when nodes complete between ticks
      3. A restart safety net after server restarts
      4. Staleness detector for nodes stuck in 'running' too long

    Returns a summary dict for logging.
    """
    factory = _get_session_factory()

    stale_recovered = 0
    try:
        stale_recovered = await _recover_stale_running_nodes()
    except Exception as exc:
        logger.error("stale_recovery_failed", error=str(exc)[:300])

    async with factory() as db:
        r = await db.execute(
            select(Mission).where(
                Mission.status.in_([
                    MissionStatus.APPROVED.value,
                    MissionStatus.IN_FLIGHT.value,
                ])
            )
        )
        active_missions = r.scalars().all()

    if not active_missions:
        return {"checked": 0, "launched_total": 0, "stale_recovered": stale_recovered}

    total_launched = 0
    for mission in active_missions:
        try:
            n = await advance_mission(mission.id, mission.workspace_id)
            total_launched += n
        except Exception as exc:
            logger.error(
                "advance_mission_failed",
                mission_id=str(mission.id),
                workspace_id=str(mission.workspace_id),
                error=str(exc)[:300],
            )

    reconciled_feed = 0
    from app.services.production_automation import auto_feed_production_allowed

    if auto_feed_production_allowed():
        try:
            reconciled_feed = await _reconcile_completed_missions_missing_feed()
        except Exception as exc:
            logger.warning("reconcile_missing_feed_failed", error=str(exc)[:200])

    # Durable Production Factory — resume draining any mission with runnable jobs
    # (restart-safe: claimed-but-orphaned jobs are reclaimed via the stale window),
    # then re-enqueue manifest gaps for completed missions (guaranteed 16/16).
    # Always tick factory queues — AUTO_FEED only gates *starting* new feed production.
    drained_factory = 0
    reconciled_factory = 0
    try:
        from app.services.production_factory_service import drain_all_open_missions

        drained_factory = await drain_all_open_missions()
    except Exception as exc:
        logger.warning("production_factory_tick_failed", error=str(exc)[:200])
    try:
        reconciled_factory = await _reconcile_production_factory_gaps()
    except Exception as exc:
        logger.warning("production_factory_reconcile_failed", error=str(exc)[:200])

    logger.info(
        "advance_all_complete",
        missions_checked=len(active_missions),
        nodes_launched=total_launched,
        stale_recovered=stale_recovered,
        reconciled_feed=reconciled_feed,
        drained_factory=drained_factory,
        reconciled_factory=reconciled_factory,
    )
    return {
        "checked":          len(active_missions),
        "launched_total":    total_launched,
        "stale_recovered":   stale_recovered,
        "reconciled_feed":   reconciled_feed,
        "drained_factory":   drained_factory,
        "reconciled_factory": reconciled_factory,
    }


async def recover_mission_graph_on_startup() -> None:
    """
    After uvicorn reload, in-memory asyncio tasks are gone but DB nodes may
    still be 'running'. Re-queue them without burning retries, then advance.
    """
    try:
        requeued = await _requeue_orphaned_running_nodes_on_startup()
        result = await advance_all_active_missions()
        result["startup_requeued"] = requeued
        logger.info("mission_graph_startup_recovery", **result)
    except Exception as exc:
        logger.error("mission_graph_startup_recovery_failed", error=str(exc)[:300])


# ── Auto-produce: fire-and-forget notification to Next.js BFF ──────────────

async def _trigger_announcement_cards(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    node_key: str,
    output_summary: str,
    brand: Any,
) -> None:
    """
    After content_calendar completes, parse announcement card concepts and generate
    event cards via Next.js /api/generate-event-card for each slot.
    Each card goes to Nexus as a pending_review artifact (story or post format).
    """
    import json as _json
    import re as _re
    import httpx

    settings = get_settings()
    nextjs_url = settings.nextjs_internal_url

    try:
        # Parse JSON array from output
        m = _re.search(r"\[.*\]", output_summary, _re.S)
        if not m:
            return
        slots = _json.loads(m.group(0))
        if not isinstance(slots, list) or not slots:
            return

        # Pick best gallery photo (non-logo)
        gallery_urls: list[str] = []
        if brand and brand.reference_image_urls:
            raw = brand.reference_image_urls
            urls = _json.loads(raw) if isinstance(raw, str) else raw
            gallery_urls = [u for u in (urls or []) if u and "logo" not in u.lower()][:10]

        brand_name = brand.business_name if brand else ""
        location = brand.location if brand else ""

        # Resolve brand theme / vibe profile for colors
        vibe_profile: dict | None = None
        if brand and brand.brand_vibe_profile:
            vp = brand.brand_vibe_profile
            vibe_profile = (_json.loads(vp) if isinstance(vp, str) else vp)

        nexus_api = (settings.nexus_api_url if hasattr(settings, "nexus_api_url") else "http://127.0.0.1:5050")
        internal_key = settings.internal_api_key if hasattr(settings, "internal_api_key") else "smartagency-internal-dev-key"

        produced = 0
        async with httpx.AsyncClient(timeout=120.0) as client:
            for i, slot in enumerate(slots[:5]):  # max 5 cards per calendar run
                if not isinstance(slot, dict):
                    continue
                event_name = slot.get("event_name") or slot.get("theme") or ""
                if not event_name:
                    continue
                tagline = slot.get("tagline") or slot.get("content_brief", "")[:80]
                fmt = slot.get("format", "story")
                content_type = "story" if "story" in fmt.lower() else "post"
                photo_url = gallery_urls[i % len(gallery_urls)] if gallery_urls else None
                if not photo_url:
                    continue

                # Call generate-event-card
                body: dict = {
                    "photoUrl": photo_url,
                    "contentType": content_type,
                    "brandName": brand_name,
                    "location": location,
                    "workspaceId": str(workspace_id),
                    "eventName": event_name,
                    "tagline": tagline,
                    "date": slot.get("date") or "",
                    "time": slot.get("time") or "",
                    "venueArea": slot.get("venue_area") or "",
                    "enhancePhoto": False,
                    "vibeProfile": {
                        "grading": (vibe_profile or {}).get("grading"),
                        "palette": (vibe_profile or {}).get("palette"),
                    } if vibe_profile else None,
                }
                try:
                    r = await client.post(f"{nextjs_url}/api/generate-event-card",
                        headers={"Content-Type": "application/json"}, json=body)
                    if not r.is_success:
                        continue
                    data = r.json()
                    image_url = data.get("imageUrl")
                    if not image_url:
                        continue

                    # Save to Nexus
                    artifact = {
                        "title": f"{event_name} — {brand_name}",
                        "contentUrl": image_url,
                        "content": _json.dumps({
                            "kind": f"instagram_{content_type}",
                            "imageUrl": image_url,
                            "headline": event_name,
                            "caption": tagline,
                            "source": "announcement_calendar",
                            "announcement_type": slot.get("announcement_type", ""),
                            "mission_id": str(mission_id),
                            "node_key": node_key,
                        }),
                        "platform": "instagram",
                        "contentType": f"instagram_{content_type}",
                        "metadata": {
                            "auto_produced": True,
                            "source": "announcement_calendar",
                            "announcement_type": slot.get("announcement_type", ""),
                            "headline": event_name,
                            "mission_id": str(mission_id),
                        },
                    }
                    save_r = await client.post(f"{nexus_api}/api/artifacts/creative",
                        headers={"Content-Type": "application/json",
                                 "X-Tenant-Id": str(workspace_id),
                                 "X-Internal-Api-Key": internal_key},
                        json=artifact)
                    if save_r.is_success:
                        produced += 1
                except Exception:
                    continue

        logger.info("announcement_cards_produced",
                    mission_id=str(mission_id), node_key=node_key, produced=produced)

    except Exception as exc:
        logger.warning("announcement_cards_error",
                        mission_id=str(mission_id), error=str(exc)[:300])


async def _load_recent_weekly_themes(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    limit: int = 6,
) -> list[str]:
    """Return weekly_theme values from recently completed content_strategy nodes."""
    import re as _re
    from datetime import datetime, timedelta, timezone as _tz
    from sqlalchemy import select as _select
    from app.models.mission import Mission as _Mission, MissionTaskNode as _Node

    cutoff = datetime.now(_tz.utc) - timedelta(days=30)
    try:
        r = await db.execute(
            _select(_Node.output_summary)
            .join(_Mission, _Mission.id == _Node.mission_id)
            .where(
                _Mission.workspace_id == workspace_id,
                _Node.task_type == "content_strategy",
                _Node.status == "completed",
                _Node.completed_at >= cutoff,
            )
            .order_by(_Node.completed_at.desc())
            .limit(limit)
        )
        themes: list[str] = []
        for (summary,) in r.all():
            if not summary:
                continue
            m = _re.search(r'"weekly_theme"\s*:\s*"([^"]{5,120})"', summary)
            if m:
                themes.append(m.group(1))
        return themes
    except Exception:
        return []


async def _load_mission_production_context(
    mission_id: uuid.UUID,
) -> dict[str, str]:
    """Title, brief, strategist type for manifest + Feed Art Director."""
    factory = _get_session_factory()
    try:
        from sqlalchemy import select as _select
        from app.models.mission import Mission as _Mission

        async with factory() as db:
            r = await db.execute(_select(_Mission).where(_Mission.id == mission_id))
            m = r.scalar_one_or_none()
            if not m:
                return {}
            summary = dict(getattr(m, "performance_summary", None) or {})
            hub_pkg = str(summary.get("hub_production_package") or "").strip()
            profile_tier = str(summary.get("production_profile_tier") or "").strip()
            ctx = {
                "mission_type": str(getattr(m, "type", "") or ""),
                "mission_title": str(getattr(m, "title", "") or "")[:200],
                "creative_brief": str(getattr(m, "creative_brief", "") or "")[:800],
            }
            if hub_pkg:
                ctx["production_package"] = hub_pkg
            if profile_tier:
                ctx["production_profile"] = profile_tier
            return ctx
    except Exception:
        return {}


async def _load_content_ideation_nodes(mission_id: uuid.UUID) -> list[dict[str, Any]]:
    """All content_ideation nodes for merge / defer logic."""
    factory = _get_session_factory()
    async with factory() as db:
        r = await db.execute(
            select(
                MissionTaskNode.node_key,
                MissionTaskNode.status,
                MissionTaskNode.output_summary,
                MissionTaskNode.output_payload,
                MissionTaskNode.task_type,
            ).where(
                MissionTaskNode.mission_id == mission_id,
                MissionTaskNode.task_type == "content_ideation",
            )
        )
        rows = r.all()
    return [
        {
            "node_key": row[0],
            "status": row[1],
            "output_summary": row[2] or "",
            "output_payload": row[3],
            "task_type": row[4],
        }
        for row in rows
    ]


async def _load_visual_design_nodes(mission_id: uuid.UUID) -> list[dict[str, Any]]:
    """All visual_design_cards nodes for feed production gating."""
    factory = _get_session_factory()
    async with factory() as db:
        r = await db.execute(
            select(
                MissionTaskNode.node_key,
                MissionTaskNode.status,
                MissionTaskNode.output_summary,
                MissionTaskNode.output_payload,
                MissionTaskNode.task_type,
            ).where(
                MissionTaskNode.mission_id == mission_id,
                MissionTaskNode.task_type == "visual_design_cards",
            )
        )
        rows = r.all()
    return [
        {
            "node_key": row[0],
            "status": row[1],
            "output_summary": row[2] or "",
            "output_payload": row[3],
            "task_type": row[4],
        }
        for row in rows
    ]


async def _other_ideation_nodes_pending(
    mission_id: uuid.UUID,
    completed_node_key: str,
) -> bool:
    """True when another content_ideation node is not completed yet."""
    nodes = await _load_content_ideation_nodes(mission_id)
    if len(nodes) <= 1:
        return False
    for n in nodes:
        if n["node_key"] == completed_node_key:
            continue
        if n["status"] != TaskNodeStatus.COMPLETED.value:
            return True
    return False


async def _load_content_calendar_nodes(mission_id: uuid.UUID) -> list[dict[str, Any]]:
    """All content_calendar nodes for feed production gating."""
    factory = _get_session_factory()
    async with factory() as db:
        r = await db.execute(
            select(
                MissionTaskNode.node_key,
                MissionTaskNode.status,
                MissionTaskNode.output_summary,
                MissionTaskNode.output_payload,
                MissionTaskNode.task_type,
            ).where(
                MissionTaskNode.mission_id == mission_id,
                MissionTaskNode.task_type == "content_calendar",
            )
        )
        rows = r.all()
    return [
        {
            "node_key": row[0],
            "status": row[1],
            "output_summary": row[2] or "",
            "output_payload": row[3],
            "task_type": row[4],
        }
        for row in rows
    ]


def _parse_calendar_plans_from_nodes(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    import json as _json
    import re as _re

    plans: list[dict[str, Any]] = []
    for node in nodes:
        if node.get("status") != TaskNodeStatus.COMPLETED.value:
            continue
        raw = str(node.get("output_summary") or "").strip()
        if len(raw) < 10:
            continue
        trimmed = raw.replace("```json", "").replace("```", "").strip()
        try:
            parsed = _json.loads(trimmed)
        except Exception:
            match = _re.search(r"\[[\s\S]*\]", trimmed)
            if not match:
                continue
            try:
                parsed = _json.loads(match.group())
            except Exception:
                continue
        if isinstance(parsed, list):
            for item in parsed:
                if isinstance(item, dict):
                    plans.append(item)
        elif isinstance(parsed, dict):
            for key in ("plans", "calendar", "items", "content_calendar", "schedule"):
                arr = parsed.get(key)
                if isinstance(arr, list):
                    for item in arr:
                        if isinstance(item, dict):
                            plans.append(item)
                    break
    # Keep parity with the Next.js planner: calendar-backed missions may add
    # orphan rows beyond the legacy 16-slot weekly geometry.
    return plans[:32]


async def _calendar_nodes_pending(mission_id: uuid.UUID) -> bool:
    """
    True when the mission includes content_calendar and at least one calendar node
    is not completed yet. Missions without the node should not be blocked.
    """
    nodes = await _load_content_calendar_nodes(mission_id)
    if not nodes:
        return False
    for n in nodes:
        if (
            n["status"] != TaskNodeStatus.COMPLETED.value
            or not str(n.get("output_summary") or "").strip()
        ):
            return True
    return False


async def _visual_design_nodes_pending(mission_id: uuid.UUID) -> bool:
    """
    True when the mission includes visual_design_cards and at least one card node
    is not completed yet. Missions without the node should not be blocked.
    """
    nodes = await _load_visual_design_nodes(mission_id)
    if not nodes:
        return False
    for n in nodes:
        if (
            n["status"] != TaskNodeStatus.COMPLETED.value
            or not str(n.get("output_summary") or "").strip()
        ):
            return True
    return False


async def _load_mission_type(mission_id: uuid.UUID) -> str:
    factory = _get_session_factory()
    async with factory() as db:
        r = await db.execute(select(Mission.type).where(Mission.id == mission_id))
        row = r.one_or_none()
    return str(row[0] or "").strip() if row else ""


async def _resolve_merged_ideation_summary(
    mission_id: uuid.UUID,
    fallback_summary: str,
) -> str:
    from app.services.mission_ideation_merge import merge_mission_production_ideas_from_nodes
    from app.services.subscription_plan_service import resolve_workspace_plan_slug

    mission_type = await _load_mission_type(mission_id)
    ideation_nodes = await _load_content_ideation_nodes(mission_id)
    calendar_nodes = await _load_content_calendar_nodes(mission_id)
    nodes = [*ideation_nodes, *calendar_nodes]

    factory = _get_session_factory()
    async with factory() as db:
        r = await db.execute(select(Mission.workspace_id).where(Mission.id == mission_id))
        row = r.one_or_none()
    workspace_id = str(row[0]) if row else ""
    plan_slug = await resolve_workspace_plan_slug(workspace_id) if workspace_id else None

    pool_json, ideas = merge_mission_production_ideas_from_nodes(
        nodes,
        mission_type=mission_type or None,
        subscription_plan_slug=plan_slug,
    )
    if ideas:
        logger.info(
            "mission_idea_pool_combined",
            mission_id=str(mission_id),
            idea_count=len(ideas),
            ideation_count=sum(1 for i in ideas if i.get("source_node") == "content_ideation"),
            calendar_count=sum(1 for i in ideas if i.get("source_node") == "content_calendar"),
        )
        return pool_json
    return fallback_summary


def _mission_feed_produced_count(perf: dict) -> int:
    last = perf.get("last_feed_produce") or {}
    return int(last.get("produced") or 0)


def _mission_feed_publish_ready_count(perf: dict) -> int:
    last = perf.get("last_feed_produce") or {}
    if "publish_ready" in last or "publishReady" in last:
        return int(last.get("publish_ready") or last.get("publishReady") or 0)
    return int(last.get("produced") or 0)


async def _resolve_mission_production_package_total(
    mission_id: uuid.UUID,
    *,
    workspace_id: uuid.UUID,
    mission_type: str,
    perf: dict,
) -> int:
    """Merged ideation+calendar row count when calendar exists; else weekly package cap."""
    from app.services.mission_ideation_merge import (
        merge_mission_production_ideas_from_nodes,
        resolve_mission_production_target,
    )
    from app.services.subscription_plan_service import resolve_workspace_plan_slug

    ideation_nodes = await _load_content_ideation_nodes(mission_id)
    calendar_nodes = await _load_content_calendar_nodes(mission_id)
    _, ideas = merge_mission_production_ideas_from_nodes(
        [*ideation_nodes, *calendar_nodes],
        mission_type=mission_type or None,
        subscription_plan_slug=await resolve_workspace_plan_slug(str(workspace_id)),
    )
    return resolve_mission_production_target(
        len(ideas),
        has_calendar=bool(calendar_nodes),
        mission_type=mission_type or None,
        hub_production_package=str(perf.get("hub_production_package") or ""),
        subscription_plan_slug=await resolve_workspace_plan_slug(str(workspace_id)),
    )


def _mission_feed_package_complete(perf: dict, *, package_total: int) -> bool:
    """True when publish-ready slots meet package target and nothing is still rendering."""
    from app.services.mission_ideation_merge import MISSION_FEED_PACKAGE_TOTAL

    expected = package_total if package_total > 0 else MISSION_FEED_PACKAGE_TOTAL
    last = perf.get("last_feed_produce") or {}
    publish_ready = int(last.get("publish_ready") or last.get("publishReady") or 0)
    rendering = int(last.get("rendering") or 0)
    if rendering > 0:
        return False
    manifest_ready = int(last.get("manifest_ready") or last.get("manifestReady") or 0)
    required_total = int(last.get("required_total") or last.get("requiredTotal") or expected)
    target = required_total if required_total > 0 else expected
    if target > 0 and manifest_ready >= target:
        return True
    if publish_ready >= target:
        return True
    # Legacy rows (pre publishReady telemetry)
    if "publish_ready" not in last and "publishReady" not in last:
        return int(last.get("produced") or 0) >= target
    return False


_FEED_PRODUCTION_LOCK_TTL_SEC = 900  # 15 min — prevents duplicate FD + auto-produce


def _feed_production_lock_active(summary: dict) -> bool:
    lock = summary.get("feed_production_lock") or {}
    at_raw = str(lock.get("at") or "").strip()
    if not at_raw:
        return False
    try:
        at = datetime.fromisoformat(at_raw.replace("Z", "+00:00"))
        if at.tzinfo is None:
            at = at.replace(tzinfo=timezone.utc)
    except Exception:
        return False
    age = (datetime.now(timezone.utc) - at).total_seconds()
    return age < _FEED_PRODUCTION_LOCK_TTL_SEC


async def _acquire_feed_production_lock(
    mission_id: uuid.UUID,
    *,
    force: bool = False,
) -> bool:
    """Per-mission mutex — duplicate ensure/kick/ideation paths share one production run."""
    factory = _get_session_factory()
    async with factory() as db:
        r = await db.execute(
            select(Mission.performance_summary).where(Mission.id == mission_id)
        )
        row = r.one_or_none()
        summary = dict(row[0] or {}) if row else {}
        if not force and _feed_production_lock_active(summary):
            return False
        summary["feed_production_lock"] = {
            "at": datetime.now(timezone.utc).isoformat(),
        }
        await db.execute(
            update(Mission)
            .where(Mission.id == mission_id)
            .execution_options(synchronize_session=False)
            .values(performance_summary=summary),
        )
        await db.commit()
    return True


async def _release_feed_production_lock(mission_id: uuid.UUID) -> None:
    factory = _get_session_factory()
    async with factory() as db:
        r = await db.execute(
            select(Mission.performance_summary).where(Mission.id == mission_id)
        )
        row = r.one_or_none()
        if not row:
            return
        summary = dict(row[0] or {})
        summary.pop("feed_production_lock", None)
        await db.execute(
            update(Mission)
            .where(Mission.id == mission_id)
            .execution_options(synchronize_session=False)
            .values(performance_summary=summary),
        )
        await db.commit()


async def _delayed_ensure_mission_feed(
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
    *,
    delay_sec: float = 120,
) -> None:
    """Retry Feed package after sibling ideation nodes may have finished."""
    await asyncio.sleep(delay_sec)
    await _ensure_mission_feed_production(mission_id, workspace_id)


def _schedule_ensure_mission_feed(
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
    *,
    delay_sec: float = 20,
    operator_initiated: bool = False,
) -> None:
    """
    Coalesce duplicate Feed production triggers into one debounced ensure run.
    Prevents content_ideation + calendar + feed_cohesion from racing (409 / cut-off).
    """
    from app.services.production_automation import auto_feed_production_allowed

    if not auto_feed_production_allowed(operator_initiated=operator_initiated):
        logger.info(
            "auto_feed_production_skipped",
            mission_id=str(mission_id),
            reason="auto_feed_production_disabled",
            operator_initiated=operator_initiated,
        )
        return

    from app.debug_session_log import debug_log

    key = str(mission_id)
    existing = _scheduled_ensure_tasks.get(key)
    skipped = existing is not None and not existing.done()
    debug_log(
        "H1",
        "task_graph_executor.py:_schedule_ensure_mission_feed",
        "schedule ensure",
        {
            "mission_id": str(mission_id),
            "delay_sec": delay_sec,
            "skipped_duplicate": skipped,
        },
    )
    if skipped:
        # Calendar / feed_cohesion often land after a short ideation-triggered ensure.
        # Schedule a follow-up with the longer delay so merged calendar rows still enqueue.
        if delay_sec >= 30:
            from app.config import get_settings

            if get_settings().use_celery_orchestrator:
                try:
                    from app.tasks.advance_tasks import ensure_mission_feed

                    ensure_mission_feed.apply_async(
                        args=[str(mission_id), str(workspace_id)],
                        countdown=max(0.0, float(delay_sec)),
                        queue="advance",
                    )
                except Exception:
                    pass
        return

    # Celery mode: dispatch to the durable ``advance`` queue (cross-replica) instead
    # of an in-process asyncio task that would be orphaned when run under a Celery
    # worker's run_until_complete loop.
    from app.config import get_settings

    if get_settings().use_celery_orchestrator:
        try:
            from app.tasks.advance_tasks import ensure_mission_feed

            ensure_mission_feed.apply_async(
                args=[str(mission_id), str(workspace_id)],
                countdown=max(0.0, float(delay_sec)),
                queue="advance",
            )
            return
        except Exception as exc:  # pragma: no cover - fall back if broker down
            logger.warning(
                "schedule_ensure_feed.celery_dispatch_failed_fallback_asyncio",
                mission_id=str(mission_id),
                error=str(exc)[:200],
            )

    async def _run() -> None:
        try:
            if delay_sec > 0:
                await asyncio.sleep(delay_sec)
            await _ensure_mission_feed_production(
                mission_id,
                workspace_id,
                operator_initiated=operator_initiated,
            )
        finally:
            _scheduled_ensure_tasks.pop(key, None)

    _scheduled_ensure_tasks[key] = asyncio.create_task(
        _run(),
        name=f"sched_ensure_feed_{mission_id}",
    )


async def _ensure_mission_feed_production(
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
    *,
    operator_initiated: bool = False,
) -> None:
    """Delegate to Sprint 2 mission feed orchestrator (lazy import avoids cycles)."""
    from app.services.production_automation import auto_feed_production_allowed

    if not auto_feed_production_allowed(operator_initiated=operator_initiated):
        logger.info(
            "auto_feed_production_skipped",
            mission_id=str(mission_id),
            reason="auto_feed_production_disabled",
            operator_initiated=operator_initiated,
        )
        return

    from app.services.mission_feed_production_service import ensure_mission_feed_production

    await ensure_mission_feed_production(
        mission_id,
        workspace_id,
        operator_initiated=operator_initiated,
    )


async def _reconcile_completed_missions_missing_feed() -> int:
    """Safety net: completed missions with ideation but incomplete Feed package."""
    factory = _get_session_factory()
    reconciled = 0
    async with factory() as db:
        r = await db.execute(
            select(Mission.id, Mission.workspace_id, Mission.performance_summary, Mission.type).where(
                Mission.status == MissionStatus.COMPLETED.value,
            )
        )
        rows = r.all()

    for mission_id, workspace_id, perf_raw, mission_type in rows:
        perf = dict(perf_raw or {})
        package_total = await _resolve_mission_production_package_total(
            mission_id,
            workspace_id=workspace_id,
            mission_type=str(mission_type or ""),
            perf=perf,
        )
        if _mission_feed_package_complete(perf, package_total=package_total):
            continue
        # Factory already owns this mission — drain/resume only, never re-run ensure pipeline.
        from app.services import production_job_service as pj

        job_summary = await pj.mission_job_summary(mission_id)
        if int(job_summary.get("total") or 0) > 0:
            continue
        nodes = await _load_content_ideation_nodes(mission_id)
        if not any(
            n["status"] == TaskNodeStatus.COMPLETED.value
            and len(str(n.get("output_summary") or "").strip()) > 20
            for n in nodes
        ):
            continue
        await _ensure_mission_feed_production(mission_id, workspace_id)
        reconciled += 1
        if reconciled >= 3:
            break

    if reconciled:
        logger.info("reconcile_missions_missing_feed", count=reconciled)
    return reconciled


async def _reconcile_production_factory_gaps() -> int:
    """Bounded guaranteed-fill: requeue exhausted slots at most once per 6h per mission.

    Prevents scheduler ticks from repeatedly hammering fal.ai on missions that already
    failed all slot attempts. Operators can still use POST requeue-factory-jobs."""
    from app.services.production_automation import auto_feed_production_allowed

    if not auto_feed_production_allowed():
        return 0

    from datetime import datetime, timedelta, timezone

    from sqlalchemy import select, update

    from app.models.mission import Mission
    from app.services import production_job_service as pj
    from app.services.production_factory_service import schedule_drain

    missions = await pj.list_missions_with_exhausted_incomplete(limit=10)
    count = 0
    factory = _get_session_factory()
    cooldown = timedelta(hours=6)
    now = datetime.now(timezone.utc)

    for mission_id_s, workspace_id_s in missions:
        try:
            mission_id = uuid.UUID(mission_id_s)
            async with factory() as db:
                r = await db.execute(
                    select(Mission.performance_summary).where(Mission.id == mission_id)
                )
                row = r.first()
                perf = dict(row[0] or {}) if row else {}
            last_at_raw = (perf.get("factory_reconcile_at") or {}).get("at")
            if last_at_raw:
                try:
                    last_at = datetime.fromisoformat(str(last_at_raw).replace("Z", "+00:00"))
                    if last_at.tzinfo is None:
                        last_at = last_at.replace(tzinfo=timezone.utc)
                    if now - last_at < cooldown:
                        continue
                except ValueError:
                    pass

            requeued = await pj.requeue_exhausted(mission_id)
            if requeued:
                async with factory() as db:
                    perf["factory_reconcile_at"] = {"at": now.isoformat(), "requeued": requeued}
                    await db.execute(
                        update(Mission)
                        .where(Mission.id == mission_id)
                        .values(performance_summary=perf)
                    )
                    await db.commit()
                schedule_drain(mission_id, uuid.UUID(workspace_id_s), delay_sec=0.0, force=True)
                count += 1
                if count >= 2:
                    break
        except Exception as exc:
            logger.warning(
                "production_factory_requeue_failed",
                mission_id=mission_id_s,
                error=str(exc)[:200],
            )
    return count


async def _trigger_content_production_pipeline(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    node_key: str,
    output_summary: str,
    brand: Any,
    *,
    force: bool = False,
    operator_initiated: bool = False,
) -> dict | None:
    """
    Production Stack entry point: Feed Art Director review FIRST, then auto-produce
    with the report so layout rotation, hero reel, and flagged ideas apply.
    """
    from app.services.production_automation import auto_feed_production_allowed

    if not force and not auto_feed_production_allowed(operator_initiated=operator_initiated):
        logger.info(
            "auto_produce_skipped",
            mission_id=str(mission_id),
            reason="auto_feed_production_disabled",
        )
        return {"produced": 0, "skipped": True, "reason": "auto_feed_production_disabled"}

    if not force and await _other_ideation_nodes_pending(mission_id, node_key):
        from app.debug_session_log import debug_log

        debug_log(
            "H4",
            "task_graph_executor.py:_trigger_content_production_pipeline",
            "deferred",
            {"mission_id": str(mission_id), "reason": "awaiting_other_ideation", "node_key": node_key},
        )
        await _reset_feed_cohesion_review_pending(
            mission_id,
            workspace_id,
            error_message="Awaiting other content ideation nodes",
        )
        await _record_production_blocked(mission_id, reason="awaiting_other_ideation")
        logger.info(
            "auto_produce_deferred",
            mission_id=str(mission_id),
            node_key=node_key,
            reason="awaiting_other_content_ideation",
        )
        return {"produced": 0, "skipped": True, "reason": "awaiting_other_ideation"}

    if not force and await _visual_design_nodes_pending(mission_id):
        await _reset_feed_cohesion_review_pending(
            mission_id,
            workspace_id,
            error_message="Awaiting visual_design_cards",
        )
        await _record_production_blocked(mission_id, reason="awaiting_visual_design_cards")
        logger.info(
            "auto_produce_deferred",
            mission_id=str(mission_id),
            node_key=node_key,
            reason="awaiting_visual_design_cards",
        )
        return {
            "produced": 0,
            "skipped": True,
            "reason": "awaiting_visual_design_cards",
        }

    if not force and await _calendar_nodes_pending(mission_id):
        await _reset_feed_cohesion_review_pending(
            mission_id,
            workspace_id,
            error_message="Awaiting content_calendar",
        )
        await _record_production_blocked(mission_id, reason="awaiting_content_calendar")
        logger.info(
            "auto_produce_deferred",
            mission_id=str(mission_id),
            node_key=node_key,
            reason="awaiting_content_calendar",
        )
        return {
            "produced": 0,
            "skipped": True,
            "reason": "awaiting_content_calendar",
        }

    output_summary = await _resolve_merged_ideation_summary(mission_id, output_summary)

    factory = _get_session_factory()
    async with factory() as db:
        r = await db.execute(
            select(Mission.performance_summary, Mission.type).where(Mission.id == mission_id)
        )
        row = r.one_or_none()
        perf = dict(row[0] or {}) if row else {}
        mission_type = str(row[1] or "").strip() if row else ""
    package_total = await _resolve_mission_production_package_total(
        mission_id,
        workspace_id=workspace_id,
        mission_type=mission_type,
        perf=perf,
    )
    if not force and _recent_feed_produce_skip(perf, package_total=package_total):
        logger.info(
            "auto_produce_skip_recent",
            mission_id=str(mission_id),
            last=perf.get("last_feed_produce"),
        )
        return {"produced": int((perf.get("last_feed_produce") or {}).get("produced") or 0), "skipped": True}

    if not await _acquire_feed_production_lock(mission_id, force=force):
        from app.debug_session_log import debug_log

        debug_log(
            "H5",
            "task_graph_executor.py:_trigger_content_production_pipeline",
            "skip in flight",
            {"mission_id": str(mission_id), "node_key": node_key},
        )
        logger.info(
            "auto_produce_skip_in_flight",
            mission_id=str(mission_id),
            node_key=node_key,
        )
        return {"produced": 0, "skipped": True, "reason": "production_in_flight"}

    try:
        return await _run_content_production_pipeline_locked(
            workspace_id=workspace_id,
            mission_id=mission_id,
            node_key=node_key,
            output_summary=output_summary,
            brand=brand,
            force=force,
            operator_initiated=operator_initiated,
        )
    finally:
        await _release_feed_production_lock(mission_id)


async def _run_content_production_pipeline_locked(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    node_key: str,
    output_summary: str,
    brand: Any,
    *,
    force: bool = False,
    operator_initiated: bool = False,
) -> dict | None:
    mission_ctx = await _load_mission_production_context(mission_id)
    await _refresh_trend_brief_if_stale(workspace_id, brand)
    await _refresh_extended_intel_if_stale(workspace_id, brand)
    report: dict = {}

    # P2: FD now runs as a real graph node — report is persisted on feed_cohesion_review
    # node output_summary. Read it directly instead of re-running the LLM crew.
    cached = None if force else await _load_cached_feed_director_report(mission_id)
    hub_pkg = str((mission_ctx or {}).get("production_package") or "").strip().lower()
    if cached and hub_pkg:
        cached_pkg = str(cached.get("production_package") or "").strip().lower()
        if cached_pkg and cached_pkg != hub_pkg:
            logger.info(
                "feed_director_cache_package_mismatch",
                mission_id=str(mission_id),
                cached=cached_pkg,
                hub=hub_pkg,
            )
            cached = None
    if cached:
        report = cached
        logger.info(
            "feed_director_cache_hit",
            mission_id=str(mission_id),
            assignments=len(cached.get("production_assignments") or []),
        )
    else:
        # Fallback: if FD node hasn't completed yet (e.g. reproduce-feed before FD ran),
        # run inline (legacy path). This should be rare after P2.
        try:
            report = await _run_feed_art_director_report(
                workspace_id=workspace_id,
                mission_id=mission_id,
                output_summary=output_summary,
                brand=brand,
                mission_ctx=mission_ctx,
            )
        except Exception as exc:
            logger.warning(
                "production_stack_feed_director_failed",
                mission_id=str(mission_id),
                error=str(exc)[:200],
            )
            await _mark_feed_cohesion_review_failed(
                mission_id,
                workspace_id,
                str(exc),
            )

    if report.get("_fallback"):
        logger.warning(
            "feed_art_director_fallback_used",
            mission_id=str(mission_id),
            fallback_reason=str(report.get("_fallback_reason", ""))[:200],
            production_package=str(report.get("production_package", "")),
            assignments_generated=len(report.get("production_assignments") or []),
        )

    # ── Durable Production Factory ──────────────────────────────────────────
    # Instead of one blocking /api/auto-produce that best-effort renders all 10
    # slots (and silently drops carousel/reel on failure), plan the manifest into
    # durable per-slot jobs and drain them one slot at a time. The feed is fed
    # incrementally and the manifest is guaranteed to reach 16/16 via retries +
    # the reconciler. Restart-safe: claimed jobs resume on the next scheduler tick.
    produce_data: dict | None = None
    try:
        from app.services.production_factory_service import (
            enqueue_mission_jobs,
            schedule_drain,
        )

        enqueued = await enqueue_mission_jobs(
            workspace_id=workspace_id,
            mission_id=mission_id,
            node_key=node_key,
            output_summary=output_summary,
            brand=brand,
            feed_director_report=report or None,
            mission_ctx=mission_ctx,
        )
        from app.services import production_job_service as _pj

        job_summary = await _pj.mission_job_summary(mission_id)
        factory_total = int(job_summary.get("total") or 0)
        if enqueued <= 0 and factory_total <= 0:
            raise RuntimeError(
                "production_factory.enqueue_empty — plan succeeded but no durable jobs"
            )
        schedule_drain(
            mission_id,
            workspace_id,
            delay_sec=2.0,
            force=True,
        )
        produce_data = {
            "produced": 0,
            "enqueued": enqueued,
            "skipped": True,
            "reason": "enqueued_to_factory",
            "factory": True,
        }
        logger.info(
            "production_factory.dispatch",
            mission_id=str(mission_id),
            node_key=node_key,
            enqueued=enqueued,
            factory_total=factory_total,
        )
        await _record_production_path(mission_id, path="factory")
    except Exception as exc:
        # When PRODUCTION_FACTORY_REQUIRE is set, the durable factory is the only
        # sanctioned path: an enqueue failure must surface loudly instead of silently
        # degrading to the legacy single-shot renderer. Default (unset/false) keeps the
        # current behaviour — fall back to legacy inline production — so this flag is a
        # zero-impact opt-in until operators are ready to retire the legacy path.
        _require_factory = os.getenv("PRODUCTION_FACTORY_REQUIRE", "").strip().lower() in (
            "1",
            "true",
            "yes",
            "on",
        )
        if _require_factory:
            logger.error(
                "production_factory.enqueue_failed_require_mode",
                mission_id=str(mission_id),
                error=str(exc)[:200],
            )
            await _record_production_path(
                mission_id, path="factory_failed", detail=str(exc)
            )
            await _record_mission_production_failure(
                mission_id,
                status_code=500,
                error=f"Üretim fabrikası kuyruğa alamadı: {str(exc)[:160]}",
            )
            produce_data = None
        else:
            # Fallback to the legacy single-shot path if the factory fails to enqueue.
            logger.warning(
                "production_factory.enqueue_failed_fallback_inline",
                mission_id=str(mission_id),
                error=str(exc)[:200],
            )
            await _record_production_path(
                mission_id, path="legacy_fallback", detail=str(exc)
            )
            produce_data = await _trigger_auto_produce(
                workspace_id=workspace_id,
                mission_id=mission_id,
                node_key=node_key,
                output_summary=output_summary,
                brand=brand,
                feed_director_report=report or None,
                mission_ctx=mission_ctx,
                skip_artifact_dedupe=force,
            )
    if produce_data and report:
        pis = produce_data.get("pis")
        if pis:
            report["production_pis"] = pis
            await _persist_feed_cohesion_report(mission_id, workspace_id, report)

    produced_n = int((produce_data or {}).get("produced") or 0)
    from app.debug_session_log import debug_log

    debug_log(
        "H4",
        "task_graph_executor.py:_run_content_production_pipeline_locked",
        "auto-produce finished",
        {
            "mission_id": str(mission_id),
            "produced": produced_n,
            "withheld": int((produce_data or {}).get("withheld") or 0),
            "rendering": int((produce_data or {}).get("rendering") or 0),
            "fd_fallback": bool(report.get("_fallback")),
            "fd_assignments": len(report.get("production_assignments") or []),
        },
    )
    publish_ready_n = int((produce_data or {}).get("publishReady") or 0)
    rendering_n = int((produce_data or {}).get("rendering") or 0)
    manifest_obj = (produce_data or {}).get("manifest") or {}
    manifest_ready_n = int(
        manifest_obj.get("filledRequired")
        or manifest_obj.get("filled_required")
        or publish_ready_n
        or 0
    )
    required_total_n = int(
        manifest_obj.get("requiredSlots")
        or manifest_obj.get("required_slots")
        or (produce_data or {}).get("total")
        or 0
    )
    if produced_n > 0 or publish_ready_n > 0 or rendering_n > 0:
        await _record_mission_feed_produce_success(
            mission_id,
            produced=produced_n,
            publish_ready=publish_ready_n,
            rendering=rendering_n,
            manifest_ready=manifest_ready_n,
            required_total=required_total_n,
            enhance_trace=produce_data.get("enhanceTrace") if produce_data else None,
        )
        if rendering_n > 0:
            _schedule_ensure_mission_feed(
                mission_id=mission_id,
                workspace_id=workspace_id,
                delay_sec=180,
            )

    cost_est = float((produce_data or {}).get("costEstimate") or 0)
    if cost_est > 0:
        try:
            from app.services.ai_cost_service import append_mission_ai_cost

            factory = _get_session_factory()
            async with factory() as cost_db:
                await append_mission_ai_cost(
                    cost_db, mission_id, "auto_produce", cost_est,
                    source_system="next_auto_produce",
                    source_ref=f"produced={produced_n},rendering={rendering_n}",
                    idempotency_key=(
                        f"auto_produce_batch:{mission_id}:{produced_n}:"
                        f"{publish_ready_n}:{round(cost_est, 4)}"
                    ),
                )
        except Exception as cost_exc:
            logger.warning(
                "mission_auto_produce_cost_append_failed",
                mission_id=str(mission_id),
                error=str(cost_exc)[:200],
            )

    return produce_data


async def _ideation_dep_keys_for_mission(db: AsyncSession, mission_id: uuid.UUID) -> list[str]:
    r = await db.execute(
        select(MissionTaskNode.node_key).where(
            MissionTaskNode.mission_id == mission_id,
            MissionTaskNode.task_type == "content_ideation",
        )
    )
    keys = [row[0] for row in r.all()]
    return keys or ["content_ideation"]


async def _upsert_feed_cohesion_review_output(
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
    report_json: str,
) -> None:
    """
    Persist Feed Art Director report on a mission node for Mission Hub.
    Creates a completed node when strategist graphs omit feed_cohesion_review.
    """
    payload = extract_structured_payload_from_output_summary(report_json)
    factory = _get_session_factory()
    async with factory() as db:
        existing_node = await ensure_feed_cohesion_review_persisted_node(
            db,
            mission_id,
            workspace_id,
        )
        now = datetime.now(timezone.utc)

        if existing_node:
            await db.execute(
                update(MissionTaskNode)
                .where(MissionTaskNode.id == existing_node.id)
                .execution_options(synchronize_session=False)
                .values(
                    status=TaskNodeStatus.COMPLETED.value,
                    completed_at=now,
                    error_message=None,
                    output_summary=report_json,
                    output_payload=payload,
                )
            )
        await db.commit()
    await _advance_after_node(mission_id, workspace_id)


async def _load_cached_feed_director_report(
    mission_id: uuid.UUID,
) -> dict | None:
    """Reuse completed feed_cohesion_review output — avoids duplicate Crew LLM cost."""
    import json as _json

    factory = _get_session_factory()
    async with factory() as db:
        r = await db.execute(
            select(MissionTaskNode.output_payload, MissionTaskNode.output_summary).where(
                MissionTaskNode.mission_id == mission_id,
                MissionTaskNode.task_type == "feed_cohesion_review",
                MissionTaskNode.status == TaskNodeStatus.COMPLETED.value,
            )
        )
        row = r.first()
    payload = row[0] if row else None
    raw = (row[1] if row else None) or ""
    if isinstance(payload, dict) and payload.get("production_assignments"):
        return payload
    if len(raw.strip()) < 40:
        return None
    cleaned = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
    try:
        parsed = _json.loads(cleaned)
        if isinstance(parsed, dict) and parsed.get("production_assignments"):
            return parsed
    except Exception:
        pass
    try:
        match = __import__("re").search(r"\{[\s\S]*\}", cleaned)
        if match:
            parsed = _json.loads(match.group())
            if isinstance(parsed, dict) and parsed.get("production_assignments"):
                return parsed
    except Exception:
        return None
    return None


async def _run_feed_art_director_report(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    output_summary: str,
    brand: Any,
    mission_ctx: dict[str, str] | None = None,
) -> dict:
    """Run Feed Art Director crew and persist report node. Returns report dict."""
    import asyncio
    import json as _json

    from app.crew.crews.feed_art_director_crew import run_feed_art_director

    factory = _get_session_factory()
    async with factory() as db:
        node = await ensure_feed_cohesion_review_persisted_node(db, mission_id, workspace_id)
        if node:
            await db.execute(
                update(MissionTaskNode)
                .where(MissionTaskNode.id == node.id)
                .execution_options(synchronize_session=False)
                .values(
                    status=TaskNodeStatus.RUNNING.value,
                    started_at=datetime.now(timezone.utc),
                    completed_at=None,
                    error_message=None,
                )
            )
            await db.commit()

    ctx = mission_ctx or {}
    weekly_theme = ""
    try:
        clean = output_summary.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        ideas = _json.loads(clean) if clean.startswith("[") else []
        if ideas:
            weekly_theme = str(ideas[0].get("strategic_purpose", "") or "")[:100]
    except Exception:
        pass
    brief = (ctx.get("creative_brief") or "").strip()
    title = (ctx.get("mission_title") or "").strip()
    if brief and brief not in weekly_theme:
        weekly_theme = f"{weekly_theme} | {brief[:120]}".strip(" |")

    from app.crew.tasks.feed_art_director_tasks import FD_CONTENT_IDEAS_INPUT_MAX_CHARS

    report = await asyncio.to_thread(
        run_feed_art_director,
        brand=brand,
        content_ideas_json=output_summary[:FD_CONTENT_IDEAS_INPUT_MAX_CHARS],
        weekly_theme=weekly_theme,
        mission_type=ctx.get("mission_type") or "",
        mission_title=title,
        creative_brief=brief,
        production_package=ctx.get("production_package") or None,
        production_profile=ctx.get("production_profile") or None,
    )

    report_json = _json.dumps(report, ensure_ascii=False, indent=2)

    logger.info(
        "feed_art_director_complete",
        mission_id=str(mission_id),
        feed_score=report.get("feed_score"),
        hero_reel=report.get("hero_reel_index"),
        verdict=str(report.get("art_director_verdict", ""))[:80],
    )

    await _upsert_feed_cohesion_review_output(mission_id, workspace_id, report_json)

    try:
        from app.services.ai_cost_service import record_mission_category_cost

        factory = _get_session_factory()
        async with factory() as cost_db:
            await record_mission_category_cost(
                cost_db,
                workspace_id,
                mission_id,
                "feed_art_director",
            )
    except Exception as cost_exc:
        logger.warning(
            "feed_art_director_cost_record_failed",
            mission_id=str(mission_id),
            error=str(cost_exc)[:200],
        )

    return report


async def _mark_feed_cohesion_review_failed(
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
    error: str,
) -> None:
    factory = _get_session_factory()
    async with factory() as db:
        node = await ensure_feed_cohesion_review_persisted_node(db, mission_id, workspace_id)
        if not node:
            return
        await db.execute(
            update(MissionTaskNode)
            .where(MissionTaskNode.id == node.id)
            .execution_options(synchronize_session=False)
            .values(
                status=TaskNodeStatus.FAILED.value,
                completed_at=datetime.now(timezone.utc),
                error_message=error[:500],
            )
        )
        await db.commit()
    await _advance_after_node(mission_id, workspace_id)


async def _reset_feed_cohesion_review_pending(
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
    *,
    error_message: str | None = None,
) -> None:
    factory = _get_session_factory()
    async with factory() as db:
        node = await ensure_feed_cohesion_review_persisted_node(db, mission_id, workspace_id)
        if not node:
            return
        await db.execute(
            update(MissionTaskNode)
            .where(MissionTaskNode.id == node.id)
            .execution_options(synchronize_session=False)
            .values(
                status=TaskNodeStatus.PENDING.value,
                started_at=None,
                completed_at=None,
                error_message=(error_message[:500] if error_message else None),
            )
        )
        await db.commit()


async def _persist_feed_cohesion_report(
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
    report: dict,
) -> None:
    """Merge production_pis (and FD fields) into feed_cohesion_review node output."""
    import json as _json

    await _upsert_feed_cohesion_review_output(
        mission_id,
        workspace_id,
        _json.dumps(report, ensure_ascii=False, indent=2),
    )


def _recent_feed_produce_skip(summary: dict, *, package_total: int) -> bool:
    """Skip duplicate auto-produce when the mission package is publish-ready."""
    if not _mission_feed_package_complete(summary, package_total=package_total):
        return False
    last = summary.get("last_feed_produce") or {}
    at_raw = str(last.get("at") or "").strip()
    if not at_raw:
        return False
    try:
        at = datetime.fromisoformat(at_raw.replace("Z", "+00:00"))
        if at.tzinfo is None:
            at = at.replace(tzinfo=timezone.utc)
    except Exception:
        return False
    age_h = (datetime.now(timezone.utc) - at).total_seconds() / 3600
    return age_h < 6


async def _record_mission_feed_produce_success(
    mission_id: uuid.UUID,
    *,
    produced: int,
    publish_ready: int = 0,
    rendering: int = 0,
    manifest_ready: int = 0,
    required_total: int = 0,
    enhance_trace: list | None = None,
) -> None:
    factory = _get_session_factory()
    async with factory() as db:
        r = await db.execute(
            select(Mission.performance_summary).where(Mission.id == mission_id)
        )
        row = r.one_or_none()
        summary = dict(row[0] or {}) if row else {}
        last_feed: dict = {
            "produced": produced,
            "publish_ready": publish_ready,
            "publishReady": publish_ready,
            "rendering": rendering,
            "manifest_ready": manifest_ready,
            "manifestReady": manifest_ready,
            "required_total": required_total,
            "requiredTotal": required_total,
            "at": datetime.now(timezone.utc).isoformat(),
        }
        if enhance_trace:
            last_feed["enhance_trace"] = enhance_trace
        summary["last_feed_produce"] = last_feed
        summary.pop("production_error", None)
        summary.pop("production_status", None)
        await db.execute(
            update(Mission)
            .where(Mission.id == mission_id)
            .execution_options(synchronize_session=False)
            .values(performance_summary=summary),
        )
        await db.commit()


# Machine reason → operator-facing awaiting-node labels (Mission Hub banner).
_PRODUCTION_BLOCK_LABELS: dict[str, str] = {
    "awaiting_other_ideation": "İçerik fikirleri (content_ideation)",
    "awaiting_visual_design_cards": "Görsel tasarım kartları (visual_design_cards)",
    "awaiting_content_calendar": "İçerik takvimi (content_calendar)",
}


async def _record_production_blocked(
    mission_id: uuid.UUID,
    *,
    reason: str,
) -> None:
    """Surface *why* feed production is waiting so Mission Hub can explain the delay.

    Writes ``performance_summary.production_status`` with a machine ``reason`` and a
    human-readable ``awaiting_nodes`` list. Cleared on the next successful produce.
    """
    label = _PRODUCTION_BLOCK_LABELS.get(reason)
    factory = _get_session_factory()
    async with factory() as db:
        r = await db.execute(
            select(Mission.performance_summary).where(Mission.id == mission_id)
        )
        row = r.one_or_none()
        summary = dict(row[0] or {}) if row else {}
        summary["production_status"] = {
            "state": "awaiting_dependencies",
            "reason": reason,
            "awaiting_nodes": [label] if label else [],
            "at": datetime.now(timezone.utc).isoformat(),
        }
        await db.execute(
            update(Mission)
            .where(Mission.id == mission_id)
            .execution_options(synchronize_session=False)
            .values(performance_summary=summary),
        )
        await db.commit()


async def _record_production_path(
    mission_id: uuid.UUID,
    *,
    path: str,
    detail: str | None = None,
) -> None:
    """Record which production path actually ran (durable factory vs legacy inline).

    Purely additive observability: writes ``performance_summary.production_path``
    without touching control flow. ``path='factory'`` is the healthy case;
    ``path='legacy_fallback'`` means the durable factory enqueue raised and we
    degraded to the single-shot path — the ``detail`` carries the truncated error.
    This is the signal operators need before the legacy path can be retired.
    """
    factory = _get_session_factory()
    try:
        async with factory() as db:
            r = await db.execute(
                select(Mission.performance_summary).where(Mission.id == mission_id)
            )
            row = r.one_or_none()
            summary = dict(row[0] or {}) if row else {}
            summary["production_path"] = {
                "path": path,
                "detail": (detail or "")[:200] or None,
                "at": datetime.now(timezone.utc).isoformat(),
            }
            await db.execute(
                update(Mission)
                .where(Mission.id == mission_id)
                .execution_options(synchronize_session=False)
                .values(performance_summary=summary),
            )
            await db.commit()
    except Exception as exc:  # telemetry must never break production
        logger.warning(
            "production_factory.record_path_failed",
            mission_id=str(mission_id),
            error=str(exc)[:200],
        )


async def _record_mission_production_failure(
    mission_id: uuid.UUID,
    *,
    status_code: int,
    error: str,
) -> None:
    """Surface auto-produce blocks (budget 429, etc.) on the mission for Mission Hub."""
    factory = _get_session_factory()
    async with factory() as db:
        r = await db.execute(
            select(Mission.performance_summary).where(Mission.id == mission_id)
        )
        row = r.one_or_none()
        summary = dict(row[0] or {}) if row else {}
        summary["production_error"] = {
            "message": error,
            "status_code": status_code,
            "at": datetime.now(timezone.utc).isoformat(),
        }
        await db.execute(
            update(Mission)
            .where(Mission.id == mission_id)
            .execution_options(synchronize_session=False)
            .values(performance_summary=summary),
        )
        await db.commit()


async def _trigger_auto_produce(*args: Any, **kwargs: Any) -> dict | None:
    """Backward-compatible shim — implementation moved to ``production_trigger`` (b1b).

    Kept so the legacy inline-fallback call site in this module (and any lazy
    importers) keep working while the orchestration logic lives in its own
    module behind :mod:`production_bridge`.
    """
    from app.services.production_trigger import trigger_auto_produce as _impl

    return await _impl(*args, **kwargs)


# ── Intel auto-refresh helpers ─────────────────────────────────────────────────

async def _refresh_trend_brief_if_stale(workspace_id: uuid.UUID, brand: Any) -> None:
    """
    Non-blocking trend brief refresh before mission production.
    Opens its own DB session, calls ensure_fresh_trend_brief_for_propose with
    a 72-hour staleness window (less urgent than the 48h propose SLA), and
    updates brand.trend_brief in-place if a fresh brief was produced.
    All exceptions are swallowed — this must never block mission production.
    """
    try:
        factory = _get_session_factory()
        async with factory() as db:
            brief_text, was_refreshed = await ensure_fresh_trend_brief_for_propose(
                db,
                workspace_id,
                max_age_hours=72,
            )
        if was_refreshed and brief_text:
            brand.trend_brief = brief_text
            logger.info(
                "mission_production_trend_brief_refreshed",
                workspace_id=str(workspace_id),
            )
        else:
            logger.debug(
                "mission_production_trend_brief_fresh",
                workspace_id=str(workspace_id),
                was_refreshed=was_refreshed,
            )
    except Exception as exc:
        logger.warning(
            "mission_production_trend_brief_refresh_failed",
            workspace_id=str(workspace_id),
            error=str(exc)[:200],
        )


async def _refresh_extended_intel_if_stale(workspace_id: uuid.UUID, brand: Any) -> None:
    """
    Non-blocking refresh of TripAdvisor reviews, Instagram location posts, and
    Google Trends stored on BrandContext. Skips if data was updated within the
    last 14 days. Fetches TripAdvisor and location posts in parallel.
    Updates brand fields in-place. All exceptions are swallowed — non-fatal.
    """
    try:
        from app.crew.apify_scraper import fetch_tripadvisor_reviews, fetch_instagram_location_posts

        settings = get_settings()
        apify_key = settings.apify_api_key or ""
        if not apify_key:
            logger.debug(
                "extended_intel_refresh_skipped_no_apify_key",
                workspace_id=str(workspace_id),
            )
            return

        factory = _get_session_factory()
        async with factory() as db:
            ctx = await get_brand_context(db, workspace_id)
            if not ctx:
                return

            updated_at = getattr(ctx, "extended_intelligence_updated_at", None)
            if updated_at:
                try:
                    last = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
                    if (datetime.now(timezone.utc) - last) < timedelta(days=14):
                        logger.debug(
                            "extended_intel_refresh_skipped_fresh",
                            workspace_id=str(workspace_id),
                        )
                        return
                except (ValueError, AttributeError):
                    pass

            brand_name = getattr(ctx, "business_name", None) or ""
            location = getattr(ctx, "location", None) or ""

            ta_task = None
            loc_task = None
            if brand_name and location:
                ta_task = asyncio.ensure_future(
                    fetch_tripadvisor_reviews(brand_name, location, apify_key, timeout=60, max_reviews=10)
                )
            if location:
                loc_task = asyncio.ensure_future(
                    fetch_instagram_location_posts(location, apify_key, timeout=60, max_posts=15)
                )

            ta_data = None
            loc_data = None
            if ta_task is not None:
                try:
                    ta_data = await ta_task
                except Exception as exc:
                    logger.debug("tripadvisor_fetch_failed", error=str(exc)[:200])
            if loc_task is not None:
                try:
                    loc_data = await loc_task
                except Exception as exc:
                    logger.debug("location_posts_fetch_failed", error=str(exc)[:200])

            updated = False
            if ta_data:
                ctx.tripadvisor_reviews = json.dumps(ta_data)
                brand.tripadvisor_reviews = ctx.tripadvisor_reviews
                updated = True
            if loc_data:
                ctx.location_posts = json.dumps(loc_data)
                brand.location_posts = ctx.location_posts
                updated = True

            if updated:
                ctx.extended_intelligence_updated_at = datetime.now(timezone.utc).isoformat()
                await db.commit()
                logger.info(
                    "extended_intel_refreshed",
                    workspace_id=str(workspace_id),
                    tripadvisor=bool(ta_data),
                    location_posts=bool(loc_data),
                )
            else:
                logger.debug(
                    "extended_intel_refresh_no_new_data",
                    workspace_id=str(workspace_id),
                )
    except Exception as exc:
        logger.warning(
            "extended_intel_refresh_failed",
            workspace_id=str(workspace_id),
            error=str(exc)[:200],
        )
