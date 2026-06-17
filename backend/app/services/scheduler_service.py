"""
Scheduler Service — APScheduler integration for autonomous daily health checks.

Sprint C: Activates the APScheduler that was installed (requirements.txt) but
never used. Runs one daily job that refreshes CEO Intelligence recommendations
for all active workspaces so users always see fresh recommendations on login.

Schedule:
  - Daily at 06:00 UTC: full refresh of all workspaces
  - On startup: refresh any workspace where recommendations are > STALE_HOURS old

Design:
  - AsyncIOScheduler: works with FastAPI's asyncio event loop
  - Workspaces processed sequentially (not parallel) to respect Apify free-tier
    memory limits (~8 GB total; each actor uses 2-4 GB)
  - Max runtime per job: 30 minutes (configurable)
  - Graceful: job failures are logged but never crash the server
  - Idempotent: calling refresh twice is safe (cached result returned)
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import get_settings

logger = structlog.get_logger()

# Module-level scheduler instance — started/stopped in lifespan
_scheduler: AsyncIOScheduler | None = None


async def _weekly_brand_dna_synthesis_job() -> None:
    """
    Weekly Brand DNA synthesis — runs every Sunday night.
    Reads ALL available signals and synthesises into a rich brand brief
    that all agents read on Monday morning.
    """
    from app.database import async_session_factory
    from app.models.brand_context import BrandContext
    from app.services.brand_context_service import build_brand_info
    from app.services.brand_dna_service import build_brand_dna
    from app.config import get_settings
    from sqlalchemy import select
    import asyncio as _asyncio
    import json

    settings = get_settings()
    logger.info("brand_dna_synthesis_start")

    try:
        async with async_session_factory() as db:
            rows = await db.execute(select(BrandContext))
            contexts = rows.scalars().all()

        for ctx in contexts:
            try:
                async with async_session_factory() as db:
                    brand = await build_brand_info(db, ctx.workspace_id)
                    if not brand:
                        continue

                    dna = await build_brand_dna(
                        brand,
                        openai_api_key=settings.openai_api_key or "",
                    )

                    ctx.brand_dna = json.dumps(dna, ensure_ascii=False)
                    ctx.brand_dna_updated_at = datetime.now(timezone.utc).isoformat()
                    db.add(ctx)
                    await db.commit()

                    logger.info(
                        "brand_dna_synthesised",
                        workspace_id=str(ctx.workspace_id),
                        richness=dna.get("data_richness", ""),
                        priority=dna.get("current_strategic_priority", "")[:60],
                    )

                await _asyncio.sleep(5)

            except Exception as exc:
                logger.error("brand_dna_synthesis_failed", workspace_id=str(ctx.workspace_id), error=str(exc)[:200])

    except Exception as exc:
        logger.error("brand_dna_job_failed", error=str(exc))


async def _refresh_industry_intelligence_job() -> None:
    """
    Refreshes industry intelligence calendar for all workspaces.
    Runs monthly — sector dynamics don't change daily.
    Also runs on-demand via Brand Hub "Sektör Analizi" button.
    """
    from app.database import async_session_factory
    from app.models.brand_context import BrandContext
    from app.services.brand_context_service import build_brand_info
    from app.services.industry_intelligence_service import build_industry_calendar
    from app.config import get_settings
    from sqlalchemy import select
    import asyncio as _asyncio
    import json

    settings = get_settings()
    logger.info("industry_intelligence_refresh_start")

    try:
        async with async_session_factory() as db:
            rows = await db.execute(select(BrandContext))
            contexts = rows.scalars().all()

        for ctx in contexts:
            try:
                async with async_session_factory() as db:
                    brand = await build_brand_info(db, ctx.workspace_id)
                    if not brand or not brand.business_type:
                        continue

                    calendar = await build_industry_calendar(
                        brand,
                        openai_api_key=settings.openai_api_key or "",
                        perplexity_api_key=settings.perplexity_api_key or "",
                        perplexity_model=settings.perplexity_model,
                        tavily_api_key=getattr(settings, "tavily_api_key", "") or "",
                        brave_api_key=getattr(settings, "brave_search_api_key", "") or "",
                    )

                    ctx.industry_calendar = json.dumps(calendar, ensure_ascii=False)
                    ctx.industry_intelligence_updated_at = datetime.now(timezone.utc).isoformat()
                    db.add(ctx)
                    await db.commit()

                    logger.info(
                        "industry_intelligence_saved",
                        workspace_id=str(ctx.workspace_id),
                        industry=calendar.get("industry_type", ""),
                        current_phase=calendar.get("current_phase", {}).get("name", ""),
                    )

                await _asyncio.sleep(3)
            except Exception as exc:
                logger.error("industry_intelligence_failed", workspace_id=str(ctx.workspace_id), error=str(exc)[:200])

    except Exception as exc:
        logger.error("industry_intelligence_job_failed", error=str(exc))


async def _process_scheduled_posts_job() -> None:
    """Process and publish all due scheduled posts."""
    from app.database import async_session_factory
    from app.services.post_scheduler_service import process_due_posts

    try:
        async with async_session_factory() as db:
            result = await process_due_posts(db)
            if result["processed"] > 0:
                logger.info("scheduled_posts_processed", **result)
    except Exception as exc:
        logger.error("scheduled_posts_job_failed", error=str(exc))


async def _daily_social_listening_job() -> None:
    """
    Daily social listening scan — runs at 06:30 UTC.
    Collects brand mentions, hashtag trends, competitor web activity.
    """
    from app.database import async_session_factory
    from app.models.brand_context import BrandContext
    from app.services.brand_context_service import build_brand_info
    from app.services.social_listening_service import run_social_listening
    from app.config import get_settings
    from sqlalchemy import select
    import asyncio as _asyncio
    import json

    settings = get_settings()
    logger.info("social_listening_job_start")

    try:
        async with async_session_factory() as db:
            rows = await db.execute(select(BrandContext))
            contexts = rows.scalars().all()

        for ctx in contexts:
            try:
                async with async_session_factory() as db:
                    brand = await build_brand_info(db, ctx.workspace_id)
                    if not brand:
                        continue

                    signals = await run_social_listening(
                        brand,
                        openai_api_key=settings.openai_api_key or "",
                        perplexity_api_key=settings.perplexity_api_key or "",
                        apify_api_key=settings.apify_api_key or "",
                        brand24_api_key=settings.brand24_api_key or "",
                        tavily_api_key=getattr(settings, "tavily_api_key", "") or "",
                        brave_api_key=getattr(settings, "brave_search_api_key", "") or "",
                    )

                    ctx.social_signals = json.dumps(signals, ensure_ascii=False)
                    ctx.social_signals_updated_at = datetime.now(timezone.utc).isoformat()
                    db.add(ctx)
                    await db.commit()

                    logger.info(
                        "social_listening_saved",
                        workspace_id=str(ctx.workspace_id),
                        has_brand24=bool(signals.get("brand_mentions")),
                        hashtags=len(signals.get("hashtag_trends", {})),
                    )

                await _asyncio.sleep(5)

            except Exception as exc:
                logger.error("social_listening_workspace_failed",
                             workspace_id=str(ctx.workspace_id), error=str(exc)[:200])

    except Exception as exc:
        logger.error("social_listening_job_failed", error=str(exc))


async def _daily_market_intelligence_job() -> None:
    """
    Runs Market Intelligence Agent for all active workspaces.
    Refreshes trend_brief, competitor_pulse, and market_opportunity_ideas.
    Scheduled 1 hour after health check so CEO recs are ready first.
    """
    from app.database import async_session_factory
    from app.models.brand_context import BrandContext
    from app.services.brand_context_service import build_brand_info
    from app.crew.crews.market_intelligence_crew import run_market_intelligence
    from sqlalchemy import select
    import asyncio as _asyncio
    import json

    logger.info("market_intelligence_job_start")
    start = datetime.now(timezone.utc)

    try:
        async with async_session_factory() as db:
            rows = await db.execute(select(BrandContext))
            contexts = rows.scalars().all()

        for ctx in contexts:
            try:
                async with async_session_factory() as db:
                    brand = await build_brand_info(db, ctx.workspace_id)
                    if not brand:
                        continue

                    logger.info("market_intelligence_running", workspace_id=str(ctx.workspace_id))
                    result = await _asyncio.to_thread(run_market_intelligence, brand)

                    ctx.trend_brief = result.get("trend_brief") or ctx.trend_brief
                    ctx.competitor_pulse = result.get("competitor_pulse") or ""
                    ctx.market_opportunity_ideas = json.dumps(
                        result.get("urgent_content_ideas") or [], ensure_ascii=False
                    )
                    ctx.trend_brief_updated_at = result.get("refreshed_at")
                    ctx.market_intelligence_updated_at = result.get("refreshed_at")

                    db.add(ctx)
                    await db.commit()

                    try:
                        from app.services.usage_cost_service import (
                            CATEGORY_MARKET_INTELLIGENCE,
                            check_budget,
                            record_cost,
                        )
                        est = 0.12
                        if (await check_budget(db, ctx.workspace_id, est))["allowed"]:
                            await record_cost(
                                db, ctx.workspace_id, est, CATEGORY_MARKET_INTELLIGENCE,
                            )
                    except Exception as cost_exc:
                        logger.warning(
                            "market_intelligence_cost_record_failed",
                            error=str(cost_exc)[:200],
                        )

                    logger.info(
                        "market_intelligence_saved",
                        workspace_id=str(ctx.workspace_id),
                        has_trend=bool(ctx.trend_brief),
                        has_pulse=bool(ctx.competitor_pulse),
                    )

                # Sequential execution — Apify free tier can't handle parallel runs
                await _asyncio.sleep(5)

            except Exception as exc:
                logger.error(
                    "market_intelligence_workspace_failed",
                    workspace_id=str(ctx.workspace_id),
                    error=str(exc)[:300],
                )

        elapsed = (datetime.now(timezone.utc) - start).total_seconds()
        logger.info("market_intelligence_job_complete", elapsed_seconds=elapsed, workspaces=len(contexts))

        # Backfill: seed intelligence for workspaces that still have NULL signals
        await _backfill_missing_intelligence_signals()

    except Exception as exc:
        logger.error("market_intelligence_job_failed", error=str(exc))


async def _advance_task_graphs_job() -> None:
    """
    Advance all active mission task graphs — runs every 5 minutes.

    Finds all approved/in_flight missions and calls advance_mission() for each.
    This serves as:
      1. The initial trigger for newly approved missions
      2. A recovery net when the server restarts mid-campaign
      3. A safety fallback if the immediate post-node-completion advance fails

    Node completions also trigger advance_mission() directly (not waiting for this
    tick), so missions progress continuously rather than in 5-minute jumps.
    """
    from app.services.task_graph_executor import advance_all_active_missions
    try:
        result = await advance_all_active_missions()
        if result["checked"] > 0:
            logger.info("task_graph_tick_complete", **result)
    except Exception as exc:
        logger.error("task_graph_job_failed", error=str(exc)[:300])


async def _learning_promoter_job() -> None:
    """
    Weekly learning promoter — runs every Monday at 09:00 UTC.

    Scans every workspace's 90-day approval history for patterns meeting
    the promotion thresholds (confirmed CTAs, preferred formats, hook types,
    avoidance signals) and creates BrandRule rows (status='under_review').

    Operators review the proposals in the Brand Hub and approve or reject them.
    Approved rules are immediately applied to BrandContext so future agents
    receive updated content_pillars, default_ctas, custom_rules, risk_rules.
    """
    from app.database import async_session_factory
    from app.models.brand_context import BrandContext
    from app.services.learning_promoter_service import run_promoter_for_workspace
    from sqlalchemy import select
    import asyncio as _asyncio

    logger.info("learning_promoter_job_start")
    total_created = 0
    workspaces_scanned = 0

    try:
        async with async_session_factory() as db:
            rows = await db.execute(select(BrandContext))
            contexts = rows.scalars().all()

        for ctx in contexts:
            try:
                async with async_session_factory() as db:
                    result = await run_promoter_for_workspace(db, ctx.workspace_id)
                    total_created += result["created"]
                    workspaces_scanned += 1

                await _asyncio.sleep(1)   # rate-limit DB load

            except Exception as exc:
                logger.error(
                    "learning_promoter_workspace_failed",
                    workspace_id=str(ctx.workspace_id),
                    error=str(exc)[:200],
                )

        logger.info(
            "learning_promoter_job_complete",
            workspaces_scanned=workspaces_scanned,
            total_rules_created=total_created,
        )

    except Exception as exc:
        logger.error("learning_promoter_job_failed", error=str(exc))


async def _opportunity_scanner_job() -> None:
    """
    Market opportunity scanner — her 4 saatte bir çalışır.

    Her workspace'in market_opportunity_ideas alanını tarar.
    urgency = "today" veya "this_week" olan fırsatlar bulunursa ve
    son 24 saatte aynı workspace için "opportunity" tipinde misyon
    oluşturulmamışsa → otomatik olarak MissionProposal (type=opportunity) oluşturur.

    Bu, pasif bilgi (market_opportunity_ideas) ile aktif aksiyon (mission)
    arasındaki bağı kurar. Operatör sabah Mission Hub'da hazır misyon önerileri görür.
    """
    from app.database import async_session_factory
    from app.models.brand_context import BrandContext
    from app.models.mission import Mission
    from app.services.mission_service import create_mission
    from app.schemas.mission import (
        MissionCreate, MissionType, MissionPriority,
        MissionPhase, TaskNodeCreate,
    )
    from sqlalchemy import select, and_
    from datetime import datetime, timedelta, timezone as tz
    import asyncio as _asyncio
    import json as _json
    import uuid as _uuid

    logger.info("opportunity_scanner_start")
    created_count = 0

    try:
        async with async_session_factory() as db:
            rows = await db.execute(select(BrandContext))
            contexts = rows.scalars().all()

        for ctx in contexts:
            try:
                if not ctx.market_opportunity_ideas:
                    continue

                try:
                    ideas = _json.loads(ctx.market_opportunity_ideas)
                except Exception:
                    continue

                if not isinstance(ideas, list) or not ideas:
                    continue

                # Filter to urgent opportunities
                urgent = [
                    idea for idea in ideas
                    if isinstance(idea, dict)
                    and idea.get("urgency") in ("today", "this_week")
                ]
                if not urgent:
                    continue

                # Check if an opportunity mission was already created in last 24h
                since = datetime.now(tz.utc) - timedelta(hours=24)
                async with async_session_factory() as db:
                    existing_q = await db.execute(
                        select(Mission).where(
                            and_(
                                Mission.workspace_id == ctx.workspace_id,
                                Mission.type == MissionType.OPPORTUNITY.value,
                                Mission.created_at >= since,
                            )
                        )
                    )
                    recent_opportunity = existing_q.scalar_one_or_none()

                if recent_opportunity:
                    continue  # Already proposed today — skip

                # Build mission from top urgent idea(s)
                top_ideas = urgent[:3]
                primary = top_ideas[0]
                title_idea = primary.get("title", "Fırsat")
                why_now    = primary.get("why_now", "")
                fmt        = primary.get("format", "post")

                # Build creative brief from all urgent ideas
                brief_lines = [
                    f"⚡ Pazar fırsatı tespiti: {len(top_ideas)} acil içerik fırsatı bulundu.",
                    "",
                ]
                for i, idea in enumerate(top_ideas, 1):
                    brief_lines.append(
                        f"{i}. {idea.get('title','?')} ({idea.get('format','post')}) "
                        f"— {idea.get('why_now','')}"
                    )

                creative_brief = "\n".join(brief_lines)
                trigger_evidence = f"{title_idea} — {why_now}"

                # Minimal 2-phase task graph for opportunity missions
                task_nodes = [
                    TaskNodeCreate(
                        node_key="content_strategy",
                        phase_index=0,
                        title="Fırsat İçerik Stratejisi",
                        task_type="content_strategy",
                        agent_role="content_strategy_agent",
                        input_data={"brief": f"Pazar fırsatı: {title_idea}. {why_now}"},
                        depends_on=[],
                    ),
                    TaskNodeCreate(
                        node_key="opportunity_content",
                        phase_index=1,
                        title=f"Fırsat İçeriği ({fmt}) — {len(top_ideas)} konsept",
                        task_type="content_ideation",
                        agent_role="content_agent",
                        input_data={
                            "count": min(len(top_ideas) + 2, 5),
                            "time_period": "bugün/bu hafta",
                            "brief": creative_brief,
                        },
                        depends_on=["content_strategy"],
                    ),
                ]

                phases = [
                    MissionPhase(index=0, name="Strateji",
                                 description="Fırsat içerik stratejisi",
                                 node_keys=["content_strategy"]),
                    MissionPhase(index=1, name="Üretim",
                                 description="Fırsat içerik fikirleri",
                                 node_keys=["opportunity_content"]),
                ]

                mc = MissionCreate(
                    title=f"Pazar Fırsatı — {title_idea[:60]}",
                    type=MissionType.OPPORTUNITY,
                    trigger_signal="market_opportunity_ideas",
                    trigger_evidence=trigger_evidence,
                    objective=(
                        f"{len(urgent)} acil fırsatı değerlendir, "
                        f"bugün/bu hafta yayınlanabilecek içerik üret."
                    ),
                    timeline_days=3,
                    creative_brief=creative_brief,
                    phases=phases,
                    task_nodes=task_nodes,
                    assigned_agent_roles=["content_strategy_agent", "content_agent"],
                    priority=MissionPriority.HIGH if primary.get("urgency") == "today" else MissionPriority.MEDIUM,
                    confidence=0.82,
                )

                async with async_session_factory() as db:
                    await create_mission(db, ctx.workspace_id, mc)

                created_count += 1
                logger.info(
                    "opportunity_mission_proposed",
                    workspace_id=str(ctx.workspace_id),
                    title=mc.title,
                    urgent_count=len(urgent),
                )

                await _asyncio.sleep(1)

            except Exception as exc:
                logger.error(
                    "opportunity_scanner_workspace_failed",
                    workspace_id=str(ctx.workspace_id),
                    error=str(exc)[:300],
                )

        logger.info("opportunity_scanner_complete", missions_created=created_count)

    except Exception as exc:
        logger.error("opportunity_scanner_job_failed", error=str(exc))


async def _detect_phase_transitions_job() -> None:
    """
    Günlük faz geçiş dedektörü — her sabah 08:00 UTC'de çalışır.

    Her workspace için industry_calendar'daki current_phase.name değerini
    brand_context.last_known_phase ile karşılaştırır.

    Faz değiştiyse:
      1. Otomatik olarak type='seasonal', status='proposed' bir Mission oluşturur.
      2. Mission içinde hazır bir TaskGraph koyar (3 faz, 5 node).
      3. last_known_phase'i günceller (aynı geçiş ikinci kez tetiklenmesin).

    Faz değişmediyse → sessizce geçer, hiçbir şey oluşturmaz.

    Oluşturulan mission 'proposed' durumda bekler — operatör Mission Hub'dan
    tek tıkla onaylar veya reddeder.
    """
    from app.database import async_session_factory
    from app.models.brand_context import BrandContext
    from app.services.mission_service import (
        create_mission,
        create_seasonal_mission_from_phase_change,
    )
    from sqlalchemy import select
    import asyncio as _asyncio

    logger.info("phase_transition_detector_start")
    created_count = 0
    checked_count = 0

    try:
        async with async_session_factory() as db:
            rows = await db.execute(select(BrandContext))
            contexts = rows.scalars().all()

        for ctx in contexts:
            checked_count += 1
            try:
                # Industry calendar must exist and have a current_phase
                if not ctx.industry_calendar:
                    continue

                try:
                    import json as _json
                    calendar = _json.loads(ctx.industry_calendar)
                except Exception:
                    continue

                current_phase_data = calendar.get("current_phase") or {}
                current_phase_name = current_phase_data.get("name", "").strip()

                if not current_phase_name:
                    continue

                last_known = (ctx.last_known_phase or "").strip()

                # No change — skip silently
                if last_known == current_phase_name:
                    continue

                logger.info(
                    "phase_transition_detected",
                    workspace_id=str(ctx.workspace_id),
                    old_phase=last_known or "(none)",
                    new_phase=current_phase_name,
                )

                # Build MissionCreate from the phase change signal
                mission_create = create_seasonal_mission_from_phase_change(
                    workspace_id=ctx.workspace_id,
                    business_name=ctx.business_name or "Marka",
                    old_phase=last_known or None,
                    new_phase=current_phase_name,
                    phase_data=current_phase_data,
                    business_type=ctx.business_type or "",
                )

                async with async_session_factory() as db:
                    await create_mission(db, ctx.workspace_id, mission_create)

                    # Update last_known_phase so this transition doesn't re-fire
                    await db.execute(
                        __import__("sqlalchemy").update(BrandContext)
                        .where(BrandContext.workspace_id == ctx.workspace_id)
                        .values(last_known_phase=current_phase_name)
                    )
                    await db.commit()

                created_count += 1
                logger.info(
                    "seasonal_mission_proposed",
                    workspace_id=str(ctx.workspace_id),
                    mission_title=mission_create.title,
                    timeline_days=mission_create.timeline_days,
                )

                # Sequential — respect DB and LLM rate limits
                await _asyncio.sleep(1)

            except Exception as exc:
                logger.error(
                    "phase_transition_workspace_failed",
                    workspace_id=str(ctx.workspace_id),
                    error=str(exc)[:300],
                )

        logger.info(
            "phase_transition_detector_complete",
            checked=checked_count,
            missions_created=created_count,
        )

    except Exception as exc:
        logger.error("phase_transition_job_failed", error=str(exc))


def _pick_diverse_proposal(
    proposals: list[dict],
    workspace_id: "uuid.UUID",
) -> dict:
    """
    Instead of always picking proposals[0], rotate based on workspace hash + day.
    This ensures different proposal types get a chance across consecutive runs.
    """
    if len(proposals) <= 1:
        return proposals[0]

    import hashlib
    day_seed = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    seed = hashlib.md5(f"{workspace_id}:{day_seed}".encode()).hexdigest()
    idx = int(seed, 16) % len(proposals)

    picked = proposals[idx]
    logger.info(
        "auto_content_diverse_pick",
        workspace_id=str(workspace_id),
        total_proposals=len(proposals),
        picked_index=idx,
        picked_type=picked.get("type", ""),
        picked_title=picked.get("title", "")[:60],
    )
    return picked


async def _daily_auto_content_job() -> None:
    """
    Fully autonomous content loop — propose + approve + execute one mission per workspace per day.

    For each workspace with a BrandContext:
      1. Skip if an approved or in_flight mission already exists (avoid overlap)
      2. Skip if a mission was already completed today (daily limit)
      3. Propose missions via StrategistAgent (creates proposed missions)
      4. Auto-approve the first (highest-priority) proposed mission
      5. Kick off execution immediately (task graph executor takes over)

    After content_ideation completes, the existing _trigger_auto_produce pipeline
    pushes gallery-matched artifacts to Feed as pending_review.
    """
    from app.database import async_session_factory
    from app.models.brand_context import BrandContext
    from app.models.mission import Mission
    from app.services.strategist_service import propose_missions_for_workspace
    from app.services.mission_service import approve_mission
    from app.services.task_graph_executor import advance_mission
    from sqlalchemy import select, and_
    import asyncio as _asyncio
    import uuid as _uuid

    settings = get_settings()
    if not settings.auto_content_enabled:
        return

    max_daily = settings.auto_content_max_daily
    logger.info("auto_content_job_start", max_daily=max_daily)
    proposed_count = 0
    approved_count = 0

    try:
        async with async_session_factory() as db:
            rows = await db.execute(select(BrandContext))
            contexts = rows.scalars().all()

        for ctx in contexts:
            ws_id = ctx.workspace_id
            try:
                async with async_session_factory() as db:
                    # Guard: skip if there's already an active mission
                    active_q = await db.execute(
                        select(Mission).where(
                            and_(
                                Mission.workspace_id == ws_id,
                                Mission.status.in_(["approved", "in_flight"]),
                            )
                        )
                    )
                    if active_q.scalar_one_or_none():
                        continue

                    # Guard: skip if already completed a mission today
                    today_start = datetime.now(timezone.utc).replace(
                        hour=0, minute=0, second=0, microsecond=0,
                    )
                    completed_today_q = await db.execute(
                        select(Mission).where(
                            and_(
                                Mission.workspace_id == ws_id,
                                Mission.status == "completed",
                                Mission.completed_at >= today_start,
                            )
                        ).limit(max_daily)
                    )
                    if len(completed_today_q.scalars().all()) >= max_daily:
                        continue

                    from app.services.usage_cost_service import check_budget
                    budget = await check_budget(db, ws_id, 0.22)
                    if not budget["allowed"]:
                        logger.info(
                            "auto_content_budget_skip",
                            workspace_id=str(ws_id),
                            spent=budget["spent_today_usd"],
                        )
                        continue

                # Propose missions (calls StrategistAgent via CrewAI)
                async with async_session_factory() as db:
                    proposals = await propose_missions_for_workspace(db, ws_id)

                if not proposals:
                    logger.info("auto_content_no_proposals", workspace_id=str(ws_id))
                    continue

                proposed_count += len(proposals)

                # Diversity rotation: pick a different proposal type each run
                # instead of always approving proposals[0]. Prefer proposals
                # whose type/angle hasn't been executed recently.
                picked = _pick_diverse_proposal(proposals, ws_id)
                mission_id = _uuid.UUID(picked["id"])

                async with async_session_factory() as db:
                    approved = await approve_mission(
                        db, mission_id, ws_id, approved_by="auto-scheduler",
                    )

                if approved:
                    approved_count += 1
                    _asyncio.create_task(
                        advance_mission(mission_id, ws_id),
                        name=f"auto_content_advance_{mission_id}",
                    )
                    logger.info(
                        "auto_content_mission_started",
                        workspace_id=str(ws_id),
                        mission_id=str(mission_id),
                        title=picked.get("title", ""),
                        pick_index=proposals.index(picked),
                    )

                await _asyncio.sleep(2)

            except Exception as exc:
                logger.error(
                    "auto_content_workspace_failed",
                    workspace_id=str(ws_id),
                    error=str(exc)[:300],
                )

        logger.info(
            "auto_content_job_complete",
            workspaces=len(contexts),
            proposed=proposed_count,
            approved=approved_count,
        )

    except Exception as exc:
        logger.error("auto_content_job_failed", error=str(exc))


async def _daily_health_job() -> None:
    """
    Refreshes CEO Intelligence recommendations for all active workspaces.
    Runs as a background job — errors logged but never propagated.
    """
    from app.database import async_session_factory
    from app.services.task_recommendation_service import refresh_stale_workspaces

    settings = get_settings()
    stale_hours = settings.recommendation_stale_hours

    logger.info("scheduler_daily_job_start", stale_hours=stale_hours)
    start = datetime.now(timezone.utc)

    try:
        async with async_session_factory() as db:
            result = await refresh_stale_workspaces(db, stale_hours=stale_hours)
        elapsed = (datetime.now(timezone.utc) - start).total_seconds()
        logger.info("scheduler_daily_job_complete", elapsed_seconds=elapsed, **result)
    except Exception as exc:
        elapsed = (datetime.now(timezone.utc) - start).total_seconds()
        logger.error("scheduler_daily_job_failed", error=str(exc), elapsed_seconds=elapsed)


async def _backfill_missing_intelligence_signals() -> None:
    """
    Find all confirmed brand contexts that have NULL intelligence signals and
    run bootstrap_brand_intelligence for each.  Called at the end of every
    _daily_market_intelligence_job so the first run after onboarding always
    fills any gaps left by new brands.
    """
    from app.database import async_session_factory
    from app.models.brand_context import BrandContext
    from app.services.brand_context_service import bootstrap_brand_intelligence
    from sqlalchemy import select
    import asyncio as _asyncio

    try:
        async with async_session_factory() as db:
            rows = await db.execute(
                select(BrandContext).where(
                    BrandContext.brand_constitution_confirmed_at.isnot(None),
                    (BrandContext.industry_calendar == None)  # noqa: E711
                    | (BrandContext.trend_brief == None)  # noqa: E711
                    | (BrandContext.competitor_pulse == None),  # noqa: E711
                )
            )
            missing = rows.scalars().all()

        logger.info("intelligence_backfill_start", workspaces_missing=len(missing))

        for ctx in missing:
            try:
                async with async_session_factory() as db:
                    result = await bootstrap_brand_intelligence(db, ctx.workspace_id)
                    logger.info(
                        "intelligence_backfill_done",
                        workspace_id=str(ctx.workspace_id),
                        result=result,
                    )
                await _asyncio.sleep(3)
            except Exception as exc:
                logger.warning(
                    "intelligence_backfill_workspace_failed",
                    workspace_id=str(ctx.workspace_id),
                    error=str(exc)[:200],
                )
    except Exception as exc:
        logger.error("intelligence_backfill_job_failed", error=str(exc)[:300])


async def _semi_auto_proposal_job() -> None:
    """
    Runs Monday + Thursday at 07:00 UTC.

    Proposes missions for workspaces that have a confirmed brand context and no
    active/proposed missions in the last 7 days.  Does NOT auto-approve — the
    operator reviews and approves via Mission Hub.  Ensures intelligence signals
    are fresh before proposing; triggers bootstrap if signals are missing.
    """
    from app.database import async_session_factory
    from app.models.brand_context import BrandContext
    from app.models.mission import Mission
    from app.services.brand_context_service import bootstrap_brand_intelligence, build_brand_info as build_brand_info_fn
    from app.services.strategist_service import propose_missions_for_workspace
    from sqlalchemy import select, func
    import asyncio as _asyncio

    logger.info("semi_auto_proposal_job_start")
    start = datetime.now(timezone.utc)
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    proposed_count = 0

    try:
        async with async_session_factory() as db:
            # All confirmed brand contexts
            rows = await db.execute(
                select(BrandContext).where(
                    BrandContext.brand_constitution_confirmed_at.isnot(None)
                )
            )
            contexts = rows.scalars().all()

        for ctx in contexts:
            ws_id = ctx.workspace_id
            try:
                async with async_session_factory() as db:
                    # Skip if there's an active/proposed mission in the last 7 days
                    recent = await db.execute(
                        select(func.count()).select_from(Mission).where(
                            Mission.workspace_id == ws_id,
                            Mission.status.in_(["proposed", "approved", "in_progress"]),
                            Mission.created_at >= cutoff,
                        )
                    )
                    if recent.scalar() > 0:
                        continue

                    # Bootstrap if signals are still empty
                    needs_bootstrap = not ctx.industry_calendar or not ctx.trend_brief or not ctx.competitor_pulse
                    if needs_bootstrap:
                        await bootstrap_brand_intelligence(db, ws_id)
                        logger.info("semi_auto_proposal_bootstrap_triggered", workspace_id=str(ws_id))
                        # Give it one more cycle to settle; skip proposal this run
                        continue

                    # Build context signals from Python (no frontend session available)
                    from app.services.context_signal_service import build_python_context_signals
                    brand_for_signals = await build_brand_info_fn(db, ws_id)
                    context_signals_str: str | None = None
                    if brand_for_signals:
                        context_signals_str = build_python_context_signals(brand_for_signals)

                    missions = await propose_missions_for_workspace(
                        db, ws_id,
                        context_signals=context_signals_str,
                        force=False,
                    )
                    if missions:
                        proposed_count += len(missions) if isinstance(missions, list) else 1
                        logger.info(
                            "semi_auto_proposal_created",
                            workspace_id=str(ws_id),
                            count=proposed_count,
                        )

                await _asyncio.sleep(2)

            except Exception as exc:
                logger.error(
                    "semi_auto_proposal_workspace_failed",
                    workspace_id=str(ws_id),
                    error=str(exc)[:300],
                )

        elapsed = (datetime.now(timezone.utc) - start).total_seconds()
        logger.info("semi_auto_proposal_job_complete", elapsed_seconds=elapsed, proposed=proposed_count)

    except Exception as exc:
        logger.error("semi_auto_proposal_job_failed", error=str(exc)[:300])


async def startup_warm_cache() -> None:
    """
    Called once on server startup. Refreshes stale workspaces in the background
    so that when the first user hits the dashboard, recommendations are ready.
    Runs as a fire-and-forget task so it doesn't block server startup.
    """
    settings = get_settings()
    if not settings.scheduler_startup_warm_cache:
        return

    async def _warm() -> None:
        # Small delay so DB connections are ready
        await asyncio.sleep(5)
        await _daily_health_job()

    asyncio.create_task(_warm())
    logger.info("scheduler_startup_warm_cache_scheduled")


def start_scheduler() -> AsyncIOScheduler:
    """
    Start the AsyncIOScheduler with the daily health check job.
    Returns the scheduler instance (stored as module-level singleton).
    """
    global _scheduler

    settings = get_settings()
    if not settings.scheduler_enabled:
        logger.info("scheduler_disabled", reason="SCHEDULER_ENABLED=false")
        return None

    _scheduler = AsyncIOScheduler(timezone="UTC")

    # 06:00 UTC — CEO health check + recommendations
    _scheduler.add_job(
        _daily_health_job,
        trigger=CronTrigger(hour=settings.scheduler_daily_hour, minute=0, timezone="UTC"),
        id="daily_health_check",
        name="Daily Workspace Health Check",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=3600,
    )

    # Every 5 minutes — Process scheduled posts (publish due content)
    _scheduler.add_job(
        _process_scheduled_posts_job,
        trigger="interval",
        minutes=5,
        id="scheduled_posts_processor",
        name="Scheduled Posts Publisher",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=120,
    )

    # 06:30 UTC — Social Listening (brand mentions, hashtags, competitor web)
    _scheduler.add_job(
        _daily_social_listening_job,
        trigger=CronTrigger(hour=settings.scheduler_daily_hour, minute=30, timezone="UTC"),
        id="daily_social_listening",
        name="Daily Social Listening Scan",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=3600,
    )

    # 07:00 UTC — Market Intelligence (trends + competitors)
    _scheduler.add_job(
        _daily_market_intelligence_job,
        trigger=CronTrigger(hour=settings.scheduler_daily_hour + 1, minute=0, timezone="UTC"),
        id="daily_market_intelligence",
        name="Daily Market Intelligence Scan",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=3600,
    )

    # Every 5 minutes — advance active mission task graphs
    _scheduler.add_job(
        _advance_task_graphs_job,
        trigger="interval",
        minutes=5,
        id="task_graph_executor",
        name="Mission TaskGraph Executor",
        replace_existing=True,
        max_instances=1,        # never run two ticks concurrently
        misfire_grace_time=60,
    )

    # Every Monday 09:00 UTC — Learning promoter (scans patterns, creates BrandRule proposals)
    _scheduler.add_job(
        _learning_promoter_job,
        trigger=CronTrigger(day_of_week="mon", hour=9, minute=0, timezone="UTC"),
        id="learning_promoter",
        name="Weekly Learning Promoter",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=7200,
    )

    # Every 4 hours — Opportunity scanner (market_opportunity_ideas → MissionProposal)
    _scheduler.add_job(
        _opportunity_scanner_job,
        trigger="interval",
        hours=4,
        id="opportunity_scanner",
        name="Market Opportunity Scanner",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=1800,
    )

    # 08:00 UTC — Phase change detector (fires after industry intelligence at 05:30)
    # Compares current_phase vs last_known_phase; creates seasonal MissionProposals.
    _scheduler.add_job(
        _detect_phase_transitions_job,
        trigger=CronTrigger(hour=8, minute=0, timezone="UTC"),
        id="phase_transition_detector",
        name="Daily Phase Transition Detector",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=3600,
    )

    # Every Sunday 23:00 UTC — Brand DNA synthesis (ready for Monday)
    _scheduler.add_job(
        _weekly_brand_dna_synthesis_job,
        trigger=CronTrigger(day_of_week="sun", hour=23, minute=0, timezone="UTC"),
        id="weekly_brand_dna_synthesis",
        name="Weekly Brand DNA Synthesis",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=7200,
    )

    # Every Monday 05:30 UTC — Industry Intelligence Calendar refresh
    # Weekly cadence: current_phase and upcoming_triggers stay fresh
    _scheduler.add_job(
        _refresh_industry_intelligence_job,
        trigger=CronTrigger(day_of_week="mon", hour=5, minute=30, timezone="UTC"),
        id="weekly_industry_intelligence",
        name="Weekly Industry Intelligence Refresh",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=7200,
    )

    # Autonomous content — runs every 6 h (TR 09:00 / 15:00 / 21:00 / 03:00).
    # Guards inside _daily_auto_content_job prevent overlap with in-flight missions
    # and cap completions at auto_content_max_daily (default 3) per workspace per day.
    if settings.auto_content_enabled:
        _scheduler.add_job(
            _daily_auto_content_job,
            trigger=CronTrigger(hour="0,6,12,18", minute=0, timezone="UTC"),
            id="daily_auto_content",
            name="Autonomous Content Generation (every 6h)",
            replace_existing=True,
            max_instances=1,
            misfire_grace_time=3600,
        )

    # Semi-autonomous proposal — proposes only, operator approves via Mission Hub
    # Runs Monday + Thursday 07:00 UTC (before the morning health check)
    _scheduler.add_job(
        _semi_auto_proposal_job,
        trigger=CronTrigger(day_of_week="mon,thu", hour=7, minute=0, timezone="UTC"),
        id="semi_auto_proposal",
        name="Semi-Autonomous Mission Proposal (Mon+Thu)",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=7200,
    )

    _scheduler.start()
    logger.info(
        "scheduler_started",
        daily_hour_utc=settings.scheduler_daily_hour,
        jobs=[j.id for j in _scheduler.get_jobs()],
    )
    return _scheduler


def stop_scheduler() -> None:
    """Gracefully shut down the scheduler on server stop."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("scheduler_stopped")
    _scheduler = None


def get_scheduler_status() -> dict:
    """Return scheduler state for the /health endpoint."""
    if _scheduler is None:
        return {"running": False, "enabled": False}

    jobs = []
    for job in _scheduler.get_jobs():
        next_run = job.next_run_time
        jobs.append({
            "id": job.id,
            "name": job.name,
            "next_run_utc": next_run.isoformat() if next_run else None,
        })

    return {
        "running": _scheduler.running,
        "enabled": True,
        "jobs": jobs,
    }
