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
) -> dict | None:
    from app.services.task_graph_executor import _trigger_content_production_pipeline

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


async def kick_feed_production(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    body: MissionFeedProductionRequest | None = None,
) -> dict[str, Any]:
    """Non-blocking: schedule background ensure pipeline."""

    _, _, nodes = await prepare_feed_production(
        db, workspace_id, mission_id, body,
    )
    ideation_nodes = [n for n in nodes if n.task_type == "content_ideation"]
    has_ideation_output = any(
        n.status == TaskNodeStatus.COMPLETED.value and node_has_output(n)
        for n in ideation_nodes
    )
    if not has_ideation_output:
        raise FeedProductionError(
            400,
            "İçerik fikirleri henüz hazır değil — görev tamamlanınca Feed otomatik üretilir.",
        )

    from app.services.task_graph_executor import _schedule_ensure_mission_feed

    _schedule_ensure_mission_feed(mission_id, workspace_id, delay_sec=5)
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
    )

    produced = int((produce_data or {}).get("produced") or 0)
    logger.info(
        "mission_reproduce_feed_via_api",
        mission_id=str(mission_id),
        produced=produced,
    )
    return {
        "id": str(mission_id),
        "status": mission.status,
        "produced": produced,
        "publishReady": int((produce_data or {}).get("publishReady") or 0),
        "rendering": int((produce_data or {}).get("rendering") or 0),
        "total": int((produce_data or {}).get("total") or len(ideas)),
        "results": (produce_data or {}).get("results"),
        "pis": (produce_data or {}).get("pis"),
        "message": (
            f"{produced} içerik Feed'e eklendi (onay bekliyor)."
            if produced > 0
            else "Üretim tamamlandı ancak Feed'e kaydedilen içerik yok. "
            "Next.js, galeri veya günlük bütçe kapısını kontrol edin."
        ),
    }


async def ensure_mission_feed_production(
    mission_id: uuid.UUID,
    workspace_id: uuid.UUID,
) -> None:
    """
    After mission graph completes: guarantee Feed auto-produce runs if package incomplete.
    """
    from app.services.mission_ideation_merge import (
        merge_mission_production_ideas_from_nodes,
        resolve_feed_package_total,
    )
    from app.services.task_graph_executor import (
        _load_content_calendar_nodes,
        _load_content_ideation_nodes,
        _mission_feed_package_complete,
        _mission_feed_publish_ready_count,
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
    from app.services.mission_ideation_merge import resolve_feed_package_total

    package_total = resolve_feed_package_total(
        mission_type,
        hub_production_package=str(perf.get("hub_production_package") or ""),
    )
    if _mission_feed_package_complete(perf, package_total=package_total):
        return

    ideation_raw = await _load_content_ideation_nodes(mission_id)
    calendar_raw = await _load_content_calendar_nodes(mission_id)
    nodes_raw = [*ideation_raw, *calendar_raw]
    merged_json, ideas = merge_mission_production_ideas_from_nodes(
        nodes_raw,
        mission_type=mission_type or None,
    )
    if not ideas:
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
        )
        if produce_data and produce_data.get("skipped"):
            reason = str(produce_data.get("reason") or "")
            if reason == "production_in_flight":
                from app.services.task_graph_executor import _schedule_ensure_mission_feed

                _schedule_ensure_mission_feed(
                    mission_id, workspace_id, delay_sec=90,
                )
            elif reason in (
                "awaiting_other_ideation",
                "awaiting_visual_design_cards",
                "awaiting_content_calendar",
            ):
                from app.services.task_graph_executor import _schedule_ensure_mission_feed

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
    from app.services.task_graph_executor import _get_session_factory as get_factory

    return get_factory()
