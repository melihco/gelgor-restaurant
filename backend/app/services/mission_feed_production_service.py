"""
Mission Hub → Feed production orchestrator (Sprint 2).

Single entry for:
- background kick (non-blocking)
- synchronous reproduce (operator retry)
- post-mission ensure (scheduler / graph completion safety net)
"""

from __future__ import annotations

import json
import uuid
from typing import Any

import structlog
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mission import Mission, MissionTaskNode
from app.schemas.mission import TaskNodeStatus
from app.services.brand_context_service import build_production_brand_context
from app.services.mission_service import (
    ensure_feed_cohesion_review_persisted_node,
    normalize_hub_production_package,
    persist_hub_production_package,
)

logger = structlog.get_logger()


class MissionFeedProductionRequest(BaseModel):
    production_package: str | None = None
    production_profile_tier: str | None = None
    force: bool = False
    operator_override: bool = False
    """Wipe factory jobs + mission artifacts before enqueue (default on force reproduce)."""
    clean_slate: bool = False


class FeedProductionError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail


def node_has_output(node: MissionTaskNode) -> bool:
    return bool((node.output_summary or "").strip()) or bool(node.output_payload)


def node_output_text(node: MissionTaskNode) -> str:
    if (node.output_summary or "").strip():
        return (node.output_summary or "").strip()
    if node.output_payload is None:
        return ""
    try:
        return json.dumps(node.output_payload, ensure_ascii=False)
    except Exception:
        return ""


def node_to_merge_dict(node: MissionTaskNode | dict[str, Any]) -> dict[str, Any]:
    if isinstance(node, dict):
        return node
    return {
        "node_key": node.node_key,
        "status": node.status,
        "output_summary": node.output_summary or "",
        "output_payload": node.output_payload,
        "task_type": node.task_type,
    }


async def load_mission_for_workspace(
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
        raise FeedProductionError(404, "Mission not found")
    return mission


async def load_mission_nodes(
    db: AsyncSession,
    mission_id: uuid.UUID,
) -> list[MissionTaskNode]:
    r = await db.execute(
        select(MissionTaskNode).where(MissionTaskNode.mission_id == mission_id)
    )
    return list(r.scalars().all())


async def persist_optional_hub_production_package(
    db: AsyncSession,
    mission_id: uuid.UUID,
    production_package: str | None,
    production_profile_tier: str | None = None,
) -> None:
    pkg = normalize_hub_production_package(production_package)
    if not pkg:
        return
    tier = str(production_profile_tier or "").strip().lower()
    if tier and tier not in {"economy", "agency", "premium"}:
        tier = ""
    await persist_hub_production_package(
        db,
        mission_id,
        pkg,
        production_profile_tier=tier or None,
    )


async def prepare_feed_production(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    body: MissionFeedProductionRequest | None = None,
) -> tuple[Mission, MissionFeedProductionRequest, list[MissionTaskNode]]:
    mission = await load_mission_for_workspace(db, workspace_id, mission_id)
    req = body or MissionFeedProductionRequest()
    await persist_optional_hub_production_package(
        db,
        mission_id,
        req.production_package,
        req.production_profile_tier,
    )
    nodes = await load_mission_nodes(db, mission_id)
    ideation_nodes = [n for n in nodes if n.task_type == "content_ideation"]
    if not ideation_nodes:
        raise FeedProductionError(400, "Bu misyonda content_ideation görevi yok.")
    await ensure_feed_cohesion_review_persisted_node(db, mission_id, workspace_id)
    # Reload after ensure — rollback on duplicate insert invalidates cached node rows.
    nodes = await load_mission_nodes(db, mission_id)
    return mission, req, nodes


def resolve_ideation_for_production(
    nodes: list[MissionTaskNode],
    *,
    mission_type: str | None = None,
) -> tuple[str, MissionTaskNode, list[dict[str, Any]]]:
    """Return (merged_summary_json, primary_node, ideas). Raises FeedProductionError on invalid state."""
    from app.services.mission_ideation_merge import merge_mission_production_ideas_from_nodes

    ideation_nodes = [n for n in nodes if n.task_type == "content_ideation"]
    if not ideation_nodes:
        raise FeedProductionError(400, "Bu misyonda content_ideation görevi yok.")

    pending = [
        n for n in ideation_nodes
        if n.status != TaskNodeStatus.COMPLETED.value or not node_has_output(n)
    ]
    if pending and len(pending) < len(ideation_nodes):
        raise FeedProductionError(
            409,
            "Tüm içerik fikirleri görevleri bitmeden Feed üretilemez.",
        )

    merge_nodes = [node_to_merge_dict(n) for n in nodes]
    merged_json, ideas = merge_mission_production_ideas_from_nodes(
        merge_nodes,
        mission_type=mission_type,
    )
    if ideas:
        primary = max(ideation_nodes, key=lambda n: len(node_output_text(n)))
        return merged_json, primary, ideas

    primary = max(ideation_nodes, key=lambda n: len(node_output_text(n)))
    if primary.status != TaskNodeStatus.COMPLETED.value:
        raise FeedProductionError(
            400,
            "İçerik fikirleri henüz tamamlanmadı — önce ↺ Yeniden başlat ile görevleri çalıştırın.",
        )
    summary = node_output_text(primary)
    if not summary or "[" not in summary:
        raise FeedProductionError(
            400,
            "İçerik fikirleri çıktısı boş — misyonu yeniden başlatın veya yeni kampanya oluşturun.",
        )
    return summary, primary, []


async def run_feed_production_pipeline(
    *,
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    node_key: str,
    output_summary: str,
    force: bool = False,
    operator_initiated: bool = False,
) -> dict | None:
    from app.services.production_bridge import (
        trigger_content_production_pipeline as _trigger_content_production_pipeline,
    )

    factory = _get_session_factory()
    async with factory() as db:
        brand = await build_production_brand_context(db, workspace_id)
    if not brand:
        raise FeedProductionError(404, "Brand context not found")

    try:
        return await _trigger_content_production_pipeline(
            workspace_id=workspace_id,
            mission_id=mission_id,
            node_key=node_key,
            output_summary=output_summary,
            brand=brand,
            force=force,
            operator_initiated=operator_initiated,
        )
    except FeedProductionError:
        raise
    except Exception as exc:
        logger.error(
            "mission_feed_production_failed",
            mission_id=str(mission_id),
            error=str(exc)[:300],
        )
        raise FeedProductionError(502, f"Feed üretimi başarısız: {exc}") from exc


async def _resolve_mission_production_package_total(
    mission_id: uuid.UUID,
    *,
    workspace_id: uuid.UUID,
    mission_type: str,
    perf: dict[str, Any],
) -> int:
    from app.services.mission_ideation_merge import (
        merge_mission_production_ideas_from_nodes,
        resolve_mission_production_target,
    )
    from app.services.production_bridge import (
        load_content_calendar_nodes as _load_content_calendar_nodes,
        load_content_ideation_nodes as _load_content_ideation_nodes,
    )
    from app.services.subscription_plan_service import resolve_workspace_plan_slug

    plan_slug = await resolve_workspace_plan_slug(str(workspace_id))
    ideation_raw = await _load_content_ideation_nodes(mission_id)
    calendar_raw = await _load_content_calendar_nodes(mission_id)
    _, ideas = merge_mission_production_ideas_from_nodes(
        [*ideation_raw, *calendar_raw],
        mission_type=mission_type or None,
        subscription_plan_slug=plan_slug,
    )
    return resolve_mission_production_target(
        len(ideas),
        has_calendar=bool(calendar_raw),
        mission_type=mission_type or None,
        hub_production_package=str(perf.get("hub_production_package") or ""),
        subscription_plan_slug=plan_slug,
    )


async def kick_feed_production(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    body: MissionFeedProductionRequest | None = None,
) -> dict[str, Any]:
    """Non-blocking: schedule background ensure pipeline."""
    from app.debug_session_log import debug_log
    from app.services.production_bridge import (
        mission_feed_package_complete as _mission_feed_package_complete,
    )

    req = body or MissionFeedProductionRequest()
    package_total = 0

    # Hard gate: never re-produce a mission whose feed package is already complete.
    # Operator can bypass with operator_override=true for intentional re-runs.
    r = await db.execute(
        select(Mission.performance_summary, Mission.type).where(Mission.id == mission_id)
    )
    row = r.one_or_none()
    if row:
        perf = dict(row[0] or {})
        mission_type = str(row[1] or "").strip()
        package_total = await _resolve_mission_production_package_total(
            mission_id,
            workspace_id=workspace_id,
            mission_type=mission_type,
            perf=perf,
        )
        if _mission_feed_package_complete(perf, package_total=package_total):
            if not req.operator_override:
                logger.info(
                    "kick_feed_production_skipped_complete",
                    mission_id=str(mission_id),
                )
                return {
                    "accepted": True,
                    "mission_id": str(mission_id),
                    "action": "skipped_complete",
                    "message": "Feed paketi zaten tamamlanmış — tekrar üretim yapılmadı.",
                }

    _, _, nodes = await prepare_feed_production(
        db, workspace_id, mission_id, body,
    )
    ideation_nodes = [n for n in nodes if n.task_type == "content_ideation"]
    has_ideation_output = any(
        n.status == TaskNodeStatus.COMPLETED.value and node_has_output(n)
        for n in ideation_nodes
    )
    debug_log(
        "H3",
        "mission_feed_production_service.py:kick_feed_production",
        "kick prepared",
        {
            "mission_id": str(mission_id),
            "workspace_id": str(workspace_id),
            "ideation_count": len(ideation_nodes),
            "has_ideation_output": has_ideation_output,
            "node_keys": [n.node_key for n in nodes],
        },
    )
    if not has_ideation_output:
        raise FeedProductionError(
            400,
            "İçerik fikirleri henüz hazır değil — planlama tamamlanınca Feed'i manuel üretin.",
        )

    from app.services import production_job_service as pj
    from app.services.production_factory_service import schedule_drain
    from app.services.production_bridge import (
        schedule_ensure_mission_feed as _schedule_ensure_mission_feed,
    )
    from app.config import get_settings

    settings = get_settings()
    op_priority = settings.production_operator_job_priority
    await pj.boost_mission_job_priority(mission_id, priority=op_priority)

    # Operator kick resumes stalled factory drains (e.g. dev reload dropped the
    # asyncio task while jobs stayed in running/claimed). Do NOT release the
    # feed production lock here — that causes parallel auto-produce → fal.ai storms.
    if settings.use_bullmq_executor:
        # BullMQ marks jobs running at enqueue; recycle all in-flight on operator kick.
        reclaimed = await pj.reclaim_inflight_jobs(mission_id)
    else:
        reclaimed = await pj.reclaim_stale_jobs(mission_id)
    summary = await pj.mission_job_summary(mission_id)
    factory_total = int(summary.get("total") or 0)
    factory_complete = bool(summary.get("complete"))
    # Additive merge can raise package_total above an older factory queue (e.g. 13 → 23).
    # Must fall through to ensure_mission_feed so missing slots are planned + upserted —
    # never "resume" the undersized queue as if it were complete.
    needs_delta_enqueue = (
        factory_total > 0
        and not factory_complete
        and package_total > 0
        and factory_total < package_total
    )

    if factory_total > 0 and not factory_complete and not needs_delta_enqueue:
        if await pj.has_open_jobs(mission_id):
            schedule_drain(mission_id, workspace_id, delay_sec=0.0, force=True, bypass_throttle=True)
            logger.info(
                "kick_feed_production_factory_resume",
                mission_id=str(mission_id),
                reclaimed=reclaimed,
                ready=summary.get("ready"),
                total=factory_total,
            )
            return {
                "accepted": True,
                "mission_id": str(mission_id),
                "resumed_factory": True,
                "reclaimed": reclaimed,
                "factory_ready": int(summary.get("ready") or 0),
                "factory_total": factory_total,
                "message": (
                    "Eksik slot üretimi devam ediyor. Gönderiler hazır oldukça Feed'e düşer."
                ),
            }

        # Operator kick: exhausted slots should re-enter the factory queue automatically
        # (same behaviour as POST requeue-factory-jobs — never expose internal endpoints in UI).
        requeued = await pj.requeue_exhausted(mission_id)
        requeued += await pj.requeue_failed(mission_id)
        if requeued or await pj.has_open_jobs(mission_id):
            schedule_drain(mission_id, workspace_id, delay_sec=0.0, force=True, bypass_throttle=True)
            from app.services.production_factory_service import schedule_completion_pass

            schedule_completion_pass(mission_id, workspace_id, delay_sec=45.0)
            summary = await pj.mission_job_summary(mission_id)
            logger.info(
                "kick_feed_production_factory_requeued",
                mission_id=str(mission_id),
                requeued=requeued,
                ready=summary.get("ready"),
                total=factory_total,
            )
            return {
                "accepted": True,
                "mission_id": str(mission_id),
                "resumed_factory": True,
                "requeued": requeued,
                "factory_ready": int(summary.get("ready") or 0),
                "factory_total": factory_total,
                "message": (
                    "Eksik slotlar kuyruğa alındı. Gönderiler hazır oldukça Feed'e düşer."
                ),
            }

        return {
            "accepted": True,
            "mission_id": str(mission_id),
            "resumed_factory": False,
            "factory_ready": int(summary.get("ready") or 0),
            "factory_total": factory_total,
            "needs_reset": True,
            "message": (
                "Bazı slotlar maksimum deneme sayısına ulaştı. "
                "«Eksik içerikleri üret» ile paketi sıfırlayıp yeniden deneyin."
            ),
        }

    if needs_delta_enqueue:
        logger.info(
            "kick_feed_production_delta_enqueue",
            mission_id=str(mission_id),
            factory_total=factory_total,
            package_total=package_total,
        )

    _schedule_ensure_mission_feed(
        mission_id,
        workspace_id,
        delay_sec=5,
        operator_initiated=True,
    )
    logger.info("kick_feed_production", mission_id=str(mission_id))
    return {
        "accepted": True,
        "mission_id": str(mission_id),
        "message": "Feed üretimi arka planda başlatıldı. Gönderiler hazır oldukça Feed'e düşer.",
    }


async def reproduce_feed_production(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    body: MissionFeedProductionRequest | None = None,
) -> dict[str, Any]:
    """Blocking: run Feed Art Director + auto-produce inline."""
    mission, req, nodes = await prepare_feed_production(
        db, workspace_id, mission_id, body,
    )

    reset_summary: dict[str, Any] | None = None
    if req.force or req.clean_slate:
        from app.services.mission_production_reset_service import (
            reset_mission_production_state,
        )

        reset_summary = await reset_mission_production_state(
            db,
            workspace_id=workspace_id,
            mission_id=mission_id,
        )

    summary, primary, ideas = resolve_ideation_for_production(
        nodes,
        mission_type=str(getattr(mission, "type", "") or "") or None,
    )

    produce_data = await run_feed_production_pipeline(
        workspace_id=workspace_id,
        mission_id=mission_id,
        node_key=primary.node_key,
        output_summary=summary,
        force=req.force,
        operator_initiated=True,
    )

    produced = int((produce_data or {}).get("produced") or 0)
    publish_ready = int((produce_data or {}).get("publishReady") or 0)
    rendering = int((produce_data or {}).get("rendering") or 0)
    enqueued = int((produce_data or {}).get("enqueued") or 0)
    factory_dispatched = bool((produce_data or {}).get("factory")) or (
        str((produce_data or {}).get("reason") or "") == "enqueued_to_factory"
    )
    # Factory path intentionally returns produced=0 until drain finishes — do not
    # treat durable enqueue as "empty feed".
    if factory_dispatched and rendering <= 0 and enqueued > 0:
        rendering = enqueued
    logger.info(
        "mission_reproduce_feed_via_api",
        mission_id=str(mission_id),
        produced=produced,
        enqueued=enqueued,
        factory=factory_dispatched,
    )
    total = int((produce_data or {}).get("total") or len(ideas))
    if produced > 0:
        message = f"{produced} içerik Feed'e eklendi (onay bekliyor)."
    elif factory_dispatched or enqueued > 0 or rendering > 0:
        message = (
            f"{max(enqueued, rendering, total)} slot fabrikaya alındı. "
            "Gönderiler hazır oldukça Feed'e düşer."
        )
    else:
        message = (
            "Üretim tamamlandı ancak Feed'e kaydedilen içerik yok. "
            "Next.js, galeri veya günlük bütçe kapısını kontrol edin."
        )
    return {
        "id": str(mission_id),
        "status": mission.status,
        "produced": produced,
        "publishReady": publish_ready,
        "rendering": rendering,
        "enqueued": enqueued,
        "total": total,
        "results": (produce_data or {}).get("results"),
        "pis": (produce_data or {}).get("pis"),
        "clean_slate": reset_summary,
        "message": message,
    }


async def ensure_mission_feed_production(
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
    *,
    operator_initiated: bool = False,
) -> None:
    """
    After mission graph completes: guarantee Feed auto-produce runs if package incomplete.
    Skipped when AUTO_FEED_PRODUCTION_ENABLED=false unless operator_initiated.
    """
    from app.services.production_automation import auto_feed_production_allowed

    if not auto_feed_production_allowed(operator_initiated=operator_initiated):
        logger.info(
            "ensure_mission_feed_skipped",
            mission_id=str(mission_id),
            reason="auto_feed_production_disabled",
        )
        return

    from app.services.mission_ideation_merge import (
        merge_mission_production_ideas_from_nodes,
        resolve_feed_package_total,
    )
    from app.services.production_bridge import (
        load_content_calendar_nodes as _load_content_calendar_nodes,
        load_content_ideation_nodes as _load_content_ideation_nodes,
        mission_feed_package_complete as _mission_feed_package_complete,
        mission_feed_publish_ready_count as _mission_feed_publish_ready_count,
    )

    factory = _get_session_factory()
    async with factory() as db:
        r = await db.execute(
            select(Mission.performance_summary, Mission.type).where(Mission.id == mission_id)
        )
        row = r.one_or_none()
        if not row:
            return
        perf = dict(row[0] or {})
        mission_type = str(row[1] or "").strip()
    from app.services.subscription_plan_service import resolve_workspace_plan_slug
    from app.services.mission_ideation_merge import resolve_mission_production_target

    plan_slug = await resolve_workspace_plan_slug(str(workspace_id))

    ideation_raw = await _load_content_ideation_nodes(mission_id)
    calendar_raw = await _load_content_calendar_nodes(mission_id)
    nodes_raw = [*ideation_raw, *calendar_raw]
    merged_json, ideas = merge_mission_production_ideas_from_nodes(
        nodes_raw,
        mission_type=mission_type or None,
    )
    has_calendar = bool(calendar_raw)
    package_total = resolve_mission_production_target(
        len(ideas),
        has_calendar=has_calendar,
        mission_type=mission_type or None,
        hub_production_package=str(perf.get("hub_production_package") or ""),
        subscription_plan_slug=plan_slug,
    )
    from app.debug_session_log import debug_log

    package_complete = _mission_feed_package_complete(perf, package_total=package_total)
    debug_log(
        "H2",
        "mission_feed_production_service.py:ensure_mission_feed_production",
        "ensure entry",
        {
            "mission_id": str(mission_id),
            "package_complete": package_complete,
            "package_total": package_total,
            "prior_produced": _mission_feed_publish_ready_count(perf),
            "hub_package": str(perf.get("hub_production_package") or ""),
        },
    )
    from app.services import production_job_service as pj
    from app.services.production_factory_service import schedule_drain

    if package_complete:
        return

    # Cross-check: factory jobs may indicate completeness even if perf summary
    # is stale (e.g. mission completed before telemetry wrote back).
    job_summary = await pj.mission_job_summary(mission_id)
    factory_total = int(job_summary.get("total") or 0)
    factory_ready = int(job_summary.get("ready") or 0)
    factory_active = int(job_summary.get("active") or 0)
    if (
        factory_total > 0
        and factory_ready >= factory_total
        and factory_active == 0
        and factory_total >= package_total
    ):
        logger.info(
            "ensure_mission_feed_skip_factory_complete",
            mission_id=str(mission_id),
            factory_ready=factory_ready,
            factory_total=factory_total,
            package_total=package_total,
        )
        return

    needs_delta_enqueue = factory_total > 0 and factory_total < package_total

    # Fast path: durable factory jobs already exist — resume drain only (never re-enqueue).
    if factory_total > 0 and not job_summary.get("complete") and not needs_delta_enqueue:
        await pj.reclaim_stale_jobs(mission_id)
        if await pj.has_open_jobs(mission_id):
            schedule_drain(mission_id, workspace_id, delay_sec=0.0, force=True, bypass_throttle=True)
            debug_log(
                "H2",
                "mission_feed_production_service.py:ensure_mission_feed_production",
                "factory drain resumed",
                {
                    "mission_id": str(mission_id),
                    "ready": job_summary.get("ready"),
                    "total": job_summary.get("total"),
                },
            )
            return

    if not ideas:
        debug_log(
            "H3",
            "mission_feed_production_service.py:ensure_mission_feed_production",
            "skip no ideas",
            {
                "mission_id": str(mission_id),
                "ideation_nodes": len(ideation_raw),
                "calendar_nodes": len(calendar_raw),
            },
        )
        logger.warning(
            "ensure_mission_feed_skip_no_ideation",
            mission_id=str(mission_id),
        )
        return

    node_key = ideation_raw[-1]["node_key"] if ideation_raw else "content_ideation"
    summary = merged_json or str(ideation_raw[-1].get("output_summary") or "")

    logger.info(
        "ensure_mission_feed_start",
        mission_id=str(mission_id),
        idea_count=len(ideas),
        prior_produced=_mission_feed_publish_ready_count(perf),
    )

    try:
        produce_data = await run_feed_production_pipeline(
            workspace_id=workspace_id,
            mission_id=mission_id,
            node_key=node_key,
            output_summary=summary,
            force=False,
            operator_initiated=operator_initiated,
        )
        debug_log(
            "H4",
            "mission_feed_production_service.py:ensure_mission_feed_production",
            "pipeline result",
            {
                "mission_id": str(mission_id),
                "produced": int((produce_data or {}).get("produced") or 0),
                "skipped": bool((produce_data or {}).get("skipped")),
                "reason": str((produce_data or {}).get("reason") or ""),
                "withheld": int((produce_data or {}).get("withheld") or 0),
            },
        )
        if produce_data and produce_data.get("skipped"):
            reason = str(produce_data.get("reason") or "")
            if reason == "production_in_flight":
                from app.services.production_bridge import (
        schedule_ensure_mission_feed as _schedule_ensure_mission_feed,
    )

                _schedule_ensure_mission_feed(
                    mission_id, workspace_id, delay_sec=90,
                )
            elif reason in (
                "awaiting_other_ideation",
                "awaiting_visual_design_cards",
                "awaiting_content_calendar",
            ):
                from app.services.production_bridge import (
        schedule_ensure_mission_feed as _schedule_ensure_mission_feed,
    )

                _schedule_ensure_mission_feed(
                    mission_id, workspace_id, delay_sec=120,
                )
    except FeedProductionError as exc:
        logger.warning(
            "ensure_mission_feed_failed",
            mission_id=str(mission_id),
            error=exc.detail[:200],
        )
    except Exception as exc:
        logger.warning(
            "ensure_mission_feed_failed",
            mission_id=str(mission_id),
            error=str(exc)[:200],
        )


def _get_session_factory():
    from app.services.production_bridge import get_session_factory

    return get_session_factory()
