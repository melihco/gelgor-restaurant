"""
Celery content tasks — heavy per-tenant LLM work on the dedicated ``content`` queue.

Brand DNA synthesis is LLM-heavy and runs per workspace; fanning it out as
individual Celery tasks lets the content worker pool process tenants in parallel
(bounded by worker concurrency) instead of one sequential loop. Each per-workspace
synthesis takes the per-tenant content lock so it never collides with a live
content_agent crew for the same tenant.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import structlog

from app.celery_app import celery_app, run_async

logger = structlog.get_logger()


@celery_app.task(name="app.tasks.content_tasks.synthesize_brand_dna_all")
def synthesize_brand_dna_all() -> dict:
    """Fan out one ``synthesize_brand_dna_workspace`` task per workspace."""
    return run_async(_synthesize_brand_dna_all_async())


async def _synthesize_brand_dna_all_async() -> dict:
    from sqlalchemy import select

    from app.database import async_session_factory
    from app.models.brand_context import BrandContext

    async with async_session_factory() as db:
        rows = await db.execute(select(BrandContext.workspace_id))
        workspace_ids = [str(w) for (w,) in rows.all()]

    for wid in workspace_ids:
        synthesize_brand_dna_workspace.apply_async(args=[wid], queue="content")

    logger.info("celery.brand_dna_fanout", workspaces=len(workspace_ids))
    return {"dispatched": len(workspace_ids)}


@celery_app.task(
    name="app.tasks.content_tasks.synthesize_brand_dna_workspace",
    bind=True,
    acks_late=True,
    max_retries=1,
    default_retry_delay=120,
)
def synthesize_brand_dna_workspace(self, workspace_id: str) -> dict:
    """Synthesize and persist brand DNA for a single workspace."""
    return run_async(_synthesize_brand_dna_workspace_async(workspace_id))


async def _synthesize_brand_dna_workspace_async(workspace_id: str) -> dict:
    import json

    from sqlalchemy import select

    from app.config import get_settings
    from app.database import async_session_factory
    from app.models.brand_context import BrandContext
    from app.services.brand_context_service import build_brand_info
    from app.services.brand_dna_service import build_brand_dna
    from app.services.execution_locks import content_agent_lock

    settings = get_settings()
    wid = uuid.UUID(workspace_id)

    async with content_agent_lock(workspace_id):
        async with async_session_factory() as db:
            ctx = (
                await db.execute(
                    select(BrandContext).where(BrandContext.workspace_id == wid)
                )
            ).scalar_one_or_none()
            if ctx is None:
                return {"workspace_id": workspace_id, "skipped": "no_context"}

            brand = await build_brand_info(db, wid)
            if not brand:
                return {"workspace_id": workspace_id, "skipped": "no_brand"}

            dna = await build_brand_dna(brand, openai_api_key=settings.openai_api_key or "")
            ctx.brand_dna = json.dumps(dna, ensure_ascii=False)
            ctx.brand_dna_updated_at = datetime.now(timezone.utc).isoformat()
            db.add(ctx)
            await db.commit()

    logger.info("celery.brand_dna_synthesised", workspace_id=workspace_id)
    return {"workspace_id": workspace_id, "ok": True}
