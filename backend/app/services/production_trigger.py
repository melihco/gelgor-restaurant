"""Mission production trigger — the Next.js ``/api/auto-produce`` orchestration.

This module owns the implementation that was previously the 300-line private
``_trigger_auto_produce`` inside the 3k-line ``task_graph_executor``. Extracting
it here keeps the executor focused on graph execution and gives the durable
production factory a single, stable entry point (via :mod:`production_bridge`).

Executor-resident loaders (mission context, calendar/visual-design nodes,
failure recording) are reached through ``production_bridge`` so this module does
not depend on executor internals — preserving the seam established by b1.
"""

from __future__ import annotations

import uuid
from typing import Any

import structlog

from app.config import get_settings
from app.services import production_bridge as bridge

logger = structlog.get_logger()


async def trigger_auto_produce(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    node_key: str,
    output_summary: str,
    brand: Any,
    feed_director_report: dict | None = None,
    mission_ctx: dict[str, str] | None = None,
    *,
    skip_artifact_dedupe: bool = False,
    plan_only: bool = False,
    backfill_slot_keys: list[str] | None = None,
    enqueue_only: bool = False,
    factory_jobs: list[dict] | None = None,
    completion_pass: bool = False,
    gallery_slot_assignments: dict[str, dict] | None = None,
) -> dict | None:
    """
    Non-blocking call to Next.js /api/auto-produce after content_ideation completes.
    Parses the raw_output into ideas, attaches gallery analysis, and lets the BFF
    create pending_review artifacts in .NET.

    Durable Production Factory modes (reuse the exact same payload assembly):
    - ``plan_only=True``  → POST /api/auto-produce/plan and return ``{"slots": [...]}``
      (no rendering). Used at enqueue to build one production_jobs row per slot.
    - ``backfill_slot_keys`` → produce ONLY the given ``"ideaIndex:slot_role"`` slots
      (slotBackfillPass). Used by the drainer to produce one slot per claimed job.
    """
    import json as _json
    import re as _re

    import httpx

    settings = get_settings()
    nextjs_url = settings.nextjs_internal_url

    if not mission_ctx:
        mission_ctx = await bridge.load_mission_production_context(mission_id)

    try:
        # ── Parse ideas from output_summary ─────────────────────────────────
        from app.crew.canvas_output_parser import parse_ideation_output
        # Priority 0: merged weekly package JSON from _resolve_merged_ideation_summary
        # (calendar + ideation + ensure_weekly_format_coverage — TS parity).
        ideas: list = []
        stripped_summary = output_summary.strip()
        if stripped_summary.startswith("["):
            try:
                raw_list = _json.loads(stripped_summary)
                if isinstance(raw_list, list) and raw_list:
                    ideas = raw_list
            except Exception:
                ideas = []

        # Priority 1: extract JSON array from mixed output
        if not ideas:
            json_match = _re.search(r"\[.*\]", output_summary, _re.DOTALL)
            if json_match:
                try:
                    raw_list = _json.loads(json_match.group())
                    ideas = raw_list if isinstance(raw_list, list) else []
                except Exception:
                    ideas = []

        # Priority 2: canvas parser — only if raw parse failed or returned nothing
        if not ideas:
            canvas_ideas = parse_ideation_output(output_summary)
            if canvas_ideas:
                for c in canvas_ideas:
                    vb = c.get("visualBrief") or {}
                    ideas.append({
                        **c,
                        "concept_title":        c.get("ideaTitle") or c.get("headline", ""),
                        "caption_draft":        c.get("caption", ""),
                        "content_kind":         "instagram_" + c.get("format", "post").replace("feed", "post"),
                        "selected_gallery_url": vb.get("galleryUrl"),
                        # Preserve as much VPS as canvas output carries
                        "visual_production_spec": {
                            "treatment":            vb.get("treatment") or "pure_photo",
                            "selected_gallery_url": vb.get("galleryUrl"),
                            "image_edit_prompt":    vb.get("imageEditPrompt") or vb.get("editPrompt", ""),
                            "text_layers":          vb.get("textLayers") or {},
                            "reel_motion_spec":     vb.get("reelMotionSpec") or {},
                        },
                    })
                logger.info(
                    "canvas_output_parsed_for_auto_produce",
                    mission_id=str(mission_id),
                    idea_count=len(ideas),
                )
            else:
                logger.warning("auto_produce_skip_no_json", mission_id=str(mission_id), node_key=node_key)
                return

        if not ideas:
            return

        # Experimental Visual Production Director (opt-in — failures are non-fatal)
        try:
            from app.services.visual_production_director_service import (
                maybe_enrich_ideas_with_visual_director,
            )

            factory = bridge.get_session_factory()
            async with factory() as _vpd_db:
                ideas = await maybe_enrich_ideas_with_visual_director(
                    _vpd_db,
                    workspace_id,
                    brand,
                    ideas,
                    mission_ctx=mission_ctx,
                    feed_director_report=feed_director_report,
                )
        except Exception as _vpd_exc:
            logger.warning(
                "visual_production_director.hook_failed",
                mission_id=str(mission_id),
                error=str(_vpd_exc)[:200],
            )

        gallery = {}
        if brand and brand.gallery_analysis:
            try:
                gallery = _json.loads(brand.gallery_analysis)
            except Exception:
                pass

        # Auto-analyze gallery for new tenants: if reference photos exist but gallery
        # has never been analyzed, trigger background analysis so matching works correctly.
        # Fire-and-forget — doesn't block production.
        ref_urls_raw = brand.reference_image_urls if brand else None
        ref_count = 0
        if ref_urls_raw:
            try:
                ref_urls = _json.loads(ref_urls_raw) if isinstance(ref_urls_raw, str) else ref_urls_raw
                ref_count = len(ref_urls) if isinstance(ref_urls, list) else 0
            except Exception:
                pass
        if ref_count > 0 and not gallery:
            try:
                nextjs_url_for_analyze = (
                    getattr(settings, "nextjs_url", "http://localhost:3000").rstrip("/")
                    if hasattr(settings, "nextjs_url") else "http://localhost:3000"
                )
                async with httpx.AsyncClient(timeout=5.0) as _ac:
                    await _ac.post(
                        f"{nextjs_url_for_analyze}/api/gallery-intelligence/{workspace_id}/analyze-coverage",
                        json={"tier": "standard", "maxPhotos": 20},
                    )
                logger.info("auto_gallery_analysis_triggered", workspace_id=str(workspace_id))
            except Exception as _age:
                logger.warning("auto_gallery_analysis_trigger_failed",
                               workspace_id=str(workspace_id), error=str(_age)[:100])

        calendar_nodes = await bridge.load_content_calendar_nodes(mission_id)
        calendar_plans = bridge.parse_calendar_plans_from_nodes(calendar_nodes)

        # Calendar merge happens in Next.js auto-produce via calendarPlans payload.
        # Do not append additive calendar_production_ideas here — avoids duplicate jobs.

        from app.services.mission_visual_design_parse import (
            parse_visual_design_cards_from_nodes,
        )

        visual_design_nodes = await bridge.load_visual_design_nodes(mission_id)
        visual_design_cards = parse_visual_design_cards_from_nodes(visual_design_nodes)

        ctx = mission_ctx or {}
        payload = {
            "workspaceId": str(workspace_id),
            "missionId": str(mission_id),
            "nodeKey": node_key,
            "ideas": ideas,
            "galleryAnalysis": gallery,
            "brandName": brand.business_name if brand else "",
            "bundleCards": True,
            "missionType": ctx.get("mission_type") or None,
            "missionTitle": ctx.get("mission_title") or None,
            "creativeBrief": ctx.get("creative_brief") or None,
        }
        if calendar_plans:
            payload["calendarPlans"] = calendar_plans
        if visual_design_cards:
            payload["visualDesignCards"] = visual_design_cards
            logger.info(
                "auto_produce_visual_design_cards",
                mission_id=str(mission_id),
                card_count=len(visual_design_cards),
            )
        if feed_director_report:
            payload["feedDirectorReport"] = feed_director_report
        brand_theme = getattr(brand, "brand_theme", None) if brand else None
        if isinstance(brand_theme, dict) and brand_theme:
            payload["brandTheme"] = brand_theme
        pkg = (mission_ctx or {}).get("production_package")
        if not isinstance(pkg, str) or not pkg.strip():
            if feed_director_report:
                pkg = feed_director_report.get("production_package")
        if isinstance(pkg, str) and pkg.strip():
            payload["productionPackage"] = pkg.strip()
            if feed_director_report and isinstance(feed_director_report, dict):
                feed_director_report["production_package"] = pkg.strip()
        if skip_artifact_dedupe:
            payload["skipArtifactDedupe"] = True
        if gallery_slot_assignments:
            payload["gallerySlotAssignments"] = gallery_slot_assignments

        # ── Durable factory: slot planning (no render) ──────────────────────
        if plan_only and not completion_pass:
            internal_key = getattr(settings, "internal_api_key", None) or ""
            headers = {"X-Tenant-Id": str(workspace_id)}
            if internal_key:
                headers["X-Internal-Api-Key"] = internal_key
            _plan_timeout = httpx.Timeout(connect=15.0, read=120.0, write=30.0, pool=5.0)
            async with httpx.AsyncClient(timeout=_plan_timeout) as client:
                presp = await client.post(
                    f"{nextjs_url}/api/auto-produce/plan",
                    json=payload,
                    headers=headers or None,
                )
            if presp.status_code < 300:
                pdata = presp.json()
                logger.info(
                    "auto_produce_plan_ok",
                    mission_id=str(mission_id),
                    slot_count=pdata.get("slotCount"),
                )
                return pdata
            logger.warning(
                "auto_produce_plan_failed",
                mission_id=str(mission_id),
                status=presp.status_code,
                body=presp.text[:300],
            )
            return {"slots": [], "error": presp.text[:300]}

        # ── Durable factory: produce only specific backfill slots ───────────
        if backfill_slot_keys and not completion_pass:
            payload["slotBackfillPass"] = True
            payload["backfillSlotKeys"] = backfill_slot_keys
            # Do NOT blindly set skipArtifactDedupe — let the production loop's
            # own deduplication logic skip slots that already have publish-ready
            # artifacts. Only the explicit force=True path (operator reproduce)
            # should bypass dedupe.

        # ── BullMQ executor: enqueue the batch instead of producing inline ───
        # Python claims jobs + builds the payload, then hands execution to the
        # Next.js BullMQ worker. Jobs stay 'running' until the worker calls back
        # to /internal/v1/production-jobs/complete (stale-claim window reclaims on
        # worker death). This decouples Python drain from execution throughput.
        if enqueue_only and not completion_pass:
            internal_key = getattr(settings, "internal_api_key", None) or ""
            headers = {"X-Tenant-Id": str(workspace_id)}
            if internal_key:
                headers["X-Internal-Api-Key"] = internal_key
            enqueue_body = {
                "autoProduceBody": payload,
                "factoryJobs": factory_jobs or [],
                "missionId": str(mission_id),
                "workspaceId": str(workspace_id),
            }
            _eq_timeout = httpx.Timeout(connect=15.0, read=30.0, write=30.0, pool=5.0)
            async with httpx.AsyncClient(timeout=_eq_timeout) as client:
                eresp = await client.post(
                    f"{nextjs_url}/api/queue/enqueue",
                    json=enqueue_body,
                    headers=headers or None,
                )
            if eresp.status_code < 300:
                edata = eresp.json()
                logger.info(
                    "auto_produce_enqueued_bullmq",
                    mission_id=str(mission_id),
                    job_id=edata.get("jobId"),
                    slots=len(factory_jobs or []),
                )
                return {"reason": "enqueued_to_bullmq", "enqueued": len(factory_jobs or [])}
            logger.warning(
                "auto_produce_enqueue_failed",
                mission_id=str(mission_id),
                status=eresp.status_code,
                body=eresp.text[:300],
            )
            return {"reason": "enqueue_failed", "error": eresp.text[:300]}

        # 320s matches Next.js route maxDuration=300s plus startup buffer.
        # Runway reels can take 3+ minutes, so 30s was timing out before artifacts
        # were created. Fire-and-forget: caller ignores the timeout warning.
        internal_key = getattr(settings, "internal_api_key", None) or ""
        # X-Tenant-Id is always required — Nexus saves artifact under this tenant.
        headers: dict[str, str] = {"X-Tenant-Id": str(workspace_id)}
        if internal_key:
            headers["X-Internal-Api-Key"] = internal_key

        # connect_timeout: fast (local) — just confirm the POST is accepted.
        # read_timeout: generous (360s) — Runway reels + Remotion stories take 3-5 min.
        # RemoteProtocolError / ReadTimeout are treated as fire-and-forget below:
        # the Next.js route keeps running in background even if Python disconnects.
        _timeout = httpx.Timeout(connect=15.0, read=580.0, write=30.0, pool=5.0)
        produce_path = (
            f"{nextjs_url}/api/auto-produce/completion-pass"
            if completion_pass
            else f"{nextjs_url}/api/auto-produce"
        )
        async with httpx.AsyncClient(timeout=_timeout) as client:
            resp = await client.post(
                produce_path,
                json=payload,
                headers=headers or None,
            )

        if resp.status_code < 300:
            data = resp.json()
            logger.info(
                "auto_produce_success",
                mission_id=str(mission_id),
                node_key=node_key,
                produced=data.get("produced", 0),
                total=data.get("total", 0),
                idea_count=data.get("ideaCount", 0),
                pis_avg=(data.get("pis") or {}).get("avg"),
                pis_skipped=(data.get("pis") or {}).get("skipped"),
            )
            return data
        if resp.status_code == 409:
            logger.info(
                "auto_produce_deferred_conflict",
                mission_id=str(mission_id),
                node_key=node_key,
            )
            # region agent log
            try:
                from app.debug_session_log import debug_log as _debug_log

                _debug_log(
                    "H1",
                    "production_trigger.py:409",
                    "auto-produce conflict (production in flight)",
                    {
                        "mission_id": str(mission_id),
                        "backfill_slots": list(backfill_slot_keys or []),
                    },
                )
            except Exception:
                pass
            # endregion
            return {"produced": 0, "skipped": True, "reason": "production_in_flight"}
        else:
            err_body = resp.text[:500]
            logger.warning(
                "auto_produce_failed",
                mission_id=str(mission_id),
                status=resp.status_code,
                body=err_body,
            )
            try:
                err_json = resp.json()
                err_msg = str(err_json.get("error") or err_body)[:400]
            except Exception:
                err_msg = err_body[:400]
            await bridge.record_mission_production_failure(
                mission_id,
                status_code=resp.status_code,
                error=err_msg,
            )
    except Exception as exc:
        import httpx as _httpx
        # ReadTimeout / RemoteProtocolError = route is still running in the background
        # (fire-and-forget scenario: connection dropped but Next.js continues producing).
        # Do NOT record these as production failures — artifacts will appear later.
        _is_timeout = isinstance(exc, (_httpx.ReadTimeout, _httpx.ConnectTimeout))
        _is_disconnect = isinstance(exc, _httpx.RemoteProtocolError)
        if _is_timeout or _is_disconnect:
            logger.info(
                "auto_produce_fire_and_forget",
                mission_id=str(mission_id),
                reason="route_still_running",
                exc=str(exc)[:120],
            )
        else:
            logger.warning(
                "auto_produce_error",
                mission_id=str(mission_id),
                error=str(exc)[:300],
            )
            await bridge.record_mission_production_failure(
                mission_id,
                status_code=0,
                error=str(exc)[:400],
            )
    return None


async def trigger_mission_completion_pass(
    workspace_id: uuid.UUID,
    mission_id: uuid.UUID,
    node_key: str,
    output_summary: str,
    brand: Any,
    feed_director_report: dict | None = None,
    mission_ctx: dict[str, str] | None = None,
) -> dict | None:
    """Post→story + calendar slot backfill after factory drain stalls."""
    return await trigger_auto_produce(
        workspace_id=workspace_id,
        mission_id=mission_id,
        node_key=node_key,
        output_summary=output_summary,
        brand=brand,
        feed_director_report=feed_director_report,
        mission_ctx=mission_ctx,
        completion_pass=True,
    )
