"""
SmartAgency Crew Service – FastAPI application entry point.

This service now acts as the internal CrewAI orchestration layer.
The customer-facing application API lives in the .NET app and calls this
service over an internal service-to-service contract.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import engine
from app.middleware.correlation import correlation_id_middleware
from app.models.base import Base

logger = structlog.get_logger()
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    logger.info("starting_up", env=settings.app_env)

    # In development, auto-create tables (production uses Alembic migrations)
    if settings.is_development:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("database_tables_created")

        from app.seed import run_seed
        await run_seed()

        from app.services.special_days_seed import seed_special_days
        await seed_special_days()

    if settings.enable_public_api:
        logger.warning(
            "public_api_enabled",
            detail="Legacy /api/v1 Task/Suggestion approval routes are mounted separately from the Nexus DB approval source of truth.",
        )

    # ── Sprint C: CEO Intelligence Scheduler ────────────────────────────
    # In dev, SCHEDULER_ENABLED=false should also skip startup recovery; otherwise
    # heavy mission backfills can monopolize the event loop before the API responds.
    if settings.scheduler_enabled:
        from app.services.scheduler_service import start_scheduler, startup_warm_cache
        from app.services.task_graph_executor import recover_mission_graph_on_startup
        start_scheduler()
        await startup_warm_cache()
        # Do not block HTTP — recovery can trigger slow feed-production backfills.
        asyncio.create_task(
            recover_mission_graph_on_startup(),
            name="mission_graph_startup_recovery",
        )
    else:
        logger.info("scheduler_and_startup_recovery_disabled")

    yield

    # ── Cleanup ─────────────────────────────────────────────────────────
    from app.services.scheduler_service import stop_scheduler
    stop_scheduler()

    await engine.dispose()
    logger.info("shutdown_complete")


app = FastAPI(
    title="SmartAgency Crew Service",
    description="Internal CrewAI orchestration service for the SmartAgency app API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
)

if settings.enable_public_api:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.middleware("http")(correlation_id_middleware)

# ── Route registration ───────────────────────────────────
from app.api.internal.router import internal_router  # noqa: E402
from app.api.v1.router import api_router  # noqa: E402

if settings.enable_public_api:
    app.include_router(api_router, prefix="/api/v1")
app.include_router(internal_router, prefix="/internal/v1")


@app.get("/health")
async def health():
    from app.services.scheduler_service import get_scheduler_status
    return {
        "status": "ok",
        "version": "0.1.0",
        "public_api_enabled": settings.enable_public_api,
        "approval_source_of_truth": "nexus-db",
        "scheduler": get_scheduler_status(),
        "warnings": [
            "Legacy /api/v1 Task/Suggestion approval routes are enabled; keep them isolated from Nexus SuggestedAction approvals."
        ] if settings.enable_public_api else [],
    }
