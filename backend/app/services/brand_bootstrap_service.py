"""Post-constitution bootstrap: fire-and-forget brand setup tasks.

Extracted from the confirm-constitution endpoint to keep the controller thin
(SRP). Each task opens its own DB session and is best-effort — failures are
logged and swallowed so a bootstrap hiccup never fails the constitution confirm.
"""
from __future__ import annotations

import asyncio
import uuid

import structlog

logger = structlog.get_logger()


async def _bootstrap_theme(workspace_id: uuid.UUID) -> None:
    try:
        from app.database import async_session_factory
        from app.services import brand_context_service
        from app.services.brand_theme_service import derive_brand_theme, save_brand_theme

        async with async_session_factory() as _db:
            _ctx = await brand_context_service.get_brand_context(_db, workspace_id)
            if _ctx:
                theme = await derive_brand_theme(_ctx)
                await save_brand_theme(_ctx, theme, _db)
                logger.info(
                    "brand_theme_bootstrapped_on_constitution",
                    workspace_id=str(workspace_id),
                    source=theme.source,
                )
    except Exception as _e:
        logger.warning(
            "brand_theme_bootstrap_failed", workspace_id=str(workspace_id), error=str(_e)[:200]
        )


async def _bootstrap_intelligence(workspace_id: uuid.UUID) -> None:
    try:
        from app.database import async_session_factory
        from app.services.brand_context_service import bootstrap_brand_intelligence

        async with async_session_factory() as _db:
            result = await bootstrap_brand_intelligence(_db, workspace_id)
            logger.info(
                "brand_intelligence_bootstrapped_on_constitution",
                workspace_id=str(workspace_id),
                result=result,
            )
    except Exception as _e:
        logger.warning(
            "brand_intelligence_bootstrap_failed",
            workspace_id=str(workspace_id),
            error=str(_e)[:200],
        )


async def _bootstrap_service_profile(workspace_id: uuid.UUID) -> None:
    try:
        from app.database import async_session_factory
        from app.services import brand_context_service

        async with async_session_factory() as _db:
            await brand_context_service.persist_brand_service_profile(_db, workspace_id)
            logger.info("brand_service_profile_bootstrapped", workspace_id=str(workspace_id))
    except Exception as _e:
        logger.warning(
            "brand_service_profile_bootstrap_failed",
            workspace_id=str(workspace_id),
            error=str(_e)[:200],
        )


def schedule_post_constitution_bootstrap(workspace_id: uuid.UUID) -> list[asyncio.Task]:
    """Fire-and-forget the theme + intelligence + service-profile bootstrap.

    Must be called from within a running event loop (e.g. a FastAPI handler).
    Returns the created tasks (useful for tests / shutdown tracking).
    """
    return [
        asyncio.create_task(_bootstrap_theme(workspace_id)),
        asyncio.create_task(_bootstrap_intelligence(workspace_id)),
        asyncio.create_task(_bootstrap_service_profile(workspace_id)),
    ]
