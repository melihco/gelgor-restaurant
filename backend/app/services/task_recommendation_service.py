"""
Task Recommendation Service — CEO Intelligence orchestrator with DB persistence.

Sprint C additions:
  - DB-backed cache (survives restarts)
  - `get_all_workspace_ids()` for the scheduler
  - `refresh_stale_workspaces()` for startup warm-up
  - Stale threshold configurable via RECOMMENDATION_STALE_HOURS
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any

import structlog
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.crew.context import BrandInfo
from app.crew.crews.intelligence_crew import run_intelligence_analysis
from app.crew.engine import get_llm
from app.crew.tools.workspace_health import build_health_snapshot
from app.models.brand_context import BrandContext
from app.models.task import Suggestion, Task
from app.models.workspace import Workspace
from app.services.brand_context_service import build_brand_info

logger = structlog.get_logger()

# In-process hot cache (< 1 min, avoids repeated DB reads)
_hot_cache: dict[str, dict] = {}
_HOT_CACHE_TTL_MINUTES = 10


def _hot_cache_valid(ws_str: str) -> bool:
    entry = _hot_cache.get(ws_str)
    if not entry:
        return False
    return (datetime.now(timezone.utc) - entry["at"]) < timedelta(minutes=_HOT_CACHE_TTL_MINUTES)


# ── DB read/write ──────────────────────────────────────────────────────────

async def _read_db_cache(
    db: AsyncSession, workspace_id: uuid.UUID, stale_hours: int = 8
) -> list[dict] | None:
    """Read recommendations from DB. Returns None if missing or stale."""
    result = await db.execute(
        select(BrandContext.cached_recommendations, BrandContext.recommendations_cached_at)
        .where(BrandContext.workspace_id == workspace_id)
    )
    row = result.first()
    if not row or not row[0]:
        return None

    cached_at = row[1]
    if cached_at:
        age = datetime.now(timezone.utc) - cached_at.replace(tzinfo=timezone.utc)
        if age > timedelta(hours=stale_hours):
            return None  # stale

    try:
        recs = json.loads(row[0])
        return recs if isinstance(recs, list) else None
    except (json.JSONDecodeError, TypeError):
        return None


async def _write_db_cache(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    recommendations: list[dict],
) -> None:
    """Persist recommendations to DB."""
    result = await db.execute(
        select(BrandContext).where(BrandContext.workspace_id == workspace_id)
    )
    ctx = result.scalar_one_or_none()
    if ctx:
        ctx.cached_recommendations = json.dumps(recommendations, ensure_ascii=False)
        ctx.recommendations_cached_at = datetime.now(timezone.utc)
        await db.flush()


# ── Task stats loader ──────────────────────────────────────────────────────

async def _load_task_stats(
    db: AsyncSession, workspace_id: uuid.UUID
) -> tuple[list[dict], int, int, int]:
    result = await db.execute(
        select(Task).where(Task.workspace_id == workspace_id)
        .order_by(Task.created_at.desc()).limit(20)
    )
    tasks = result.scalars().all()
    recent_tasks = [
        {"task_type": t.task_type, "status": t.status,
         "created_at": t.created_at.isoformat() if t.created_at else None}
        for t in tasks
    ]

    pend = (await db.execute(select(func.count()).where(
        Suggestion.workspace_id == workspace_id, Suggestion.status == "pending"
    ))).scalar_one() or 0

    approved = (await db.execute(select(func.count()).where(
        Suggestion.workspace_id == workspace_id, Suggestion.status == "approved"
    ))).scalar_one() or 0

    rejected = (await db.execute(select(func.count()).where(
        Suggestion.workspace_id == workspace_id, Suggestion.status == "rejected"
    ))).scalar_one() or 0

    return recent_tasks, pend, approved, rejected


# ── Main entry point ───────────────────────────────────────────────────────

async def get_recommendations(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    force_refresh: bool = False,
    stale_hours: int = 8,
) -> dict[str, Any]:
    """
    Returns task recommendations for the workspace.

    Cache hierarchy (fastest to slowest):
      1. Hot in-process cache (< 10 min)     → < 1 ms
      2. DB persisted cache (< stale_hours)  → < 10 ms
      3. CEO Intelligence Agent (LLM call)   → 30-60 s

    After scheduler runs daily, users always hit layer 1 or 2.
    """
    ws_str = str(workspace_id)
    now_iso = datetime.now(timezone.utc).isoformat()

    # 1. Hot cache
    if not force_refresh and _hot_cache_valid(ws_str):
        logger.debug("recommendations_hot_cache_hit", workspace_id=ws_str)
        entry = _hot_cache[ws_str]
        return {
            "recommendations": entry["recommendations"],
            "business_name": entry.get("business_name", ""),
            "cached": True,
            "generated_at": entry["generated_at"],
        }

    # 2. DB cache
    if not force_refresh:
        db_recs = await _read_db_cache(db, workspace_id, stale_hours)
        if db_recs is not None:
            brand = await build_brand_info(db, workspace_id)
            bname = brand.business_name if brand else ""
            # Warm hot cache
            _hot_cache[ws_str] = {"recommendations": db_recs, "business_name": bname,
                                   "generated_at": now_iso, "at": datetime.now(timezone.utc)}
            logger.info("recommendations_db_cache_hit", workspace_id=ws_str, count=len(db_recs))
            return {"recommendations": db_recs, "business_name": bname,
                    "cached": True, "generated_at": now_iso}

    # 3. Generate fresh
    brand = await build_brand_info(db, workspace_id)
    if not brand:
        logger.warning("recommendations_no_brand_context", workspace_id=ws_str)
        return {"recommendations": _fallback_recommendations(), "business_name": "Unknown",
                "cached": False, "generated_at": now_iso}

    recent_tasks, pending_count, approved_count, rejected_count = await _load_task_stats(db, workspace_id)
    health = build_health_snapshot(brand=brand, recent_tasks=recent_tasks,
                                   pending_suggestions=pending_count,
                                   approved_count=approved_count, rejected_count=rejected_count)

    logger.info("recommendations_generating", workspace_id=ws_str, business=brand.business_name)

    try:
        llm = get_llm(task_type="content_strategy")
        result = await _run_in_thread(brand, health, llm)
        recommendations = result.get("recommendations", [])
    except Exception as exc:
        logger.error("recommendations_agent_failed", workspace_id=ws_str, error=str(exc))
        recommendations = _fallback_recommendations_from_health(brand, health)

    # Persist to DB + warm hot cache
    try:
        await _write_db_cache(db, workspace_id, recommendations)
        await db.commit()
    except Exception as exc:
        logger.warning("recommendations_db_write_failed", error=str(exc))

    _hot_cache[ws_str] = {"recommendations": recommendations, "business_name": brand.business_name,
                           "generated_at": now_iso, "at": datetime.now(timezone.utc)}

    return {"recommendations": recommendations, "business_name": brand.business_name,
            "health_snapshot": health, "cached": False, "generated_at": now_iso}


async def _run_in_thread(brand: BrandInfo, health: dict, llm: Any) -> dict:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, lambda: run_intelligence_analysis(brand, health, llm=llm)
    )


# ── Workspace discovery (for scheduler) ───────────────────────────────────

async def get_all_workspace_ids(db: AsyncSession) -> list[uuid.UUID]:
    """Return all workspace IDs that have a brand context (active tenants)."""
    result = await db.execute(select(BrandContext.workspace_id))
    return [row[0] for row in result.fetchall()]


async def refresh_stale_workspaces(
    db: AsyncSession,
    *,
    stale_hours: int = 8,
    max_concurrent: int = 3,
) -> dict[str, Any]:
    """
    Refresh recommendations for all workspaces where the cache is stale.
    Called by the scheduler daily and on server startup.

    max_concurrent: how many workspaces to refresh simultaneously
    (Apify free tier: 1-2 concurrent actors; we process workspaces sequentially
     within each batch to avoid memory limits).
    """
    workspace_ids = await get_all_workspace_ids(db)
    logger.info("scheduler_refresh_start", workspace_count=len(workspace_ids))

    refreshed = 0
    skipped = 0
    failed = 0

    for ws_id in workspace_ids:
        ws_str = str(ws_id)

        # Check if already fresh
        if _hot_cache_valid(ws_str):
            skipped += 1
            continue

        db_recs = await _read_db_cache(db, ws_id, stale_hours)
        if db_recs is not None:
            skipped += 1
            continue

        # Needs refresh
        try:
            await get_recommendations(db, ws_id, force_refresh=True, stale_hours=stale_hours)
            refreshed += 1
            logger.info("scheduler_workspace_refreshed", workspace_id=ws_str)
            # Small delay between workspaces to avoid Apify free-tier memory limits
            await asyncio.sleep(2)
        except Exception as exc:
            failed += 1
            logger.error("scheduler_workspace_failed", workspace_id=ws_str, error=str(exc))

    result = {"refreshed": refreshed, "skipped": skipped, "failed": failed,
              "total": len(workspace_ids)}
    logger.info("scheduler_refresh_complete", **result)
    return result


# ── Fallback generators ────────────────────────────────────────────────────

def _fallback_recommendations() -> list[dict]:
    return [{
        "priority": "high", "agent_role": "content_agent",
        "task_type": "content_ideation",
        "title": "Haftalık Instagram içerik planı oluştur",
        "reason": "Henüz marka profili tamamlanmamış. Temel içerik planıyla başla.",
        "brief": "Bu hafta için 5 Instagram içerik fikri üret.",
        "estimated_impact": "Sosyal medya varlığı başlar.",
        "input_data": {"brief": "Bu hafta için 5 Instagram içerik fikri.", "count": 5},
    }]


def _fallback_recommendations_from_health(brand: BrandInfo, health: dict) -> list[dict]:
    """Rule-based fallback — no LLM needed."""
    recs = []
    google = health.get("google", {})
    content = health.get("content", {})

    if google.get("review_urgency") in ("critical", "high"):
        recs.append({
            "priority": "critical" if google.get("review_urgency") == "critical" else "high",
            "agent_role": "review_agent", "task_type": "review_analysis",
            "title": "Google yorumlarını analiz et ve yanıt taslakları üret",
            "reason": f"{brand.business_name} Google puanı {google.get('rating', '?')}/5.",
            "brief": f"{brand.business_name} için son Google yorumlarını analiz et. Olumsuz yorumlara yanıt üret.",
            "estimated_impact": "Google puanı yükselir.",
            "input_data": {"brief": "Google yorumlarını analiz et."},
        })

    days_since = content.get("days_since_last_content")
    if days_since is None or days_since > 5:
        pillars = ", ".join(content.get("confirmed_pillars", ["menu_share", "daily_story"])[:3])
        recs.append({
            "priority": "high" if days_since is None else "medium",
            "agent_role": "content_agent", "task_type": "content_ideation",
            "title": "Bu haftaki Instagram içerik planını oluştur",
            "reason": f"{'İçerik üretilmemiş' if days_since is None else f'{days_since} gündür içerik yok'}. Pillar'lar: {pillars}.",
            "brief": f"{brand.business_name} için bu hafta 5 Instagram içerik fikri. Pillar'lar: {pillars}.",
            "estimated_impact": "Etkileşim ve organik erişim artar.",
            "input_data": {"brief": f"{brand.business_name} için 5 içerik.", "count": 5,
                           "content_pillars": content.get("confirmed_pillars", []), "autonomy_mode": True},
        })

    recs.append({
        "priority": "medium", "agent_role": "analytics_agent",
        "task_type": "weekly_performance",
        "title": "Haftalık performans raporu üret",
        "reason": "Düzenli analiz, hangi kanalın değer ürettiğini gösterir.",
        "brief": f"{brand.business_name} için son 7 günün dijital performansını analiz et.",
        "estimated_impact": "Veri odaklı karar almak kolaylaşır.",
        "input_data": {"brief": "Haftalık performans raporu."},
    })

    return recs[:4]
