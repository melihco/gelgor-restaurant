from fastapi import APIRouter

from app.api.internal import orchestration, production_jobs

internal_router = APIRouter()
internal_router.include_router(
    orchestration.router,
    prefix="/orchestration",
    tags=["Internal Orchestration"],
)
internal_router.include_router(
    production_jobs.router,
    prefix="/production-jobs",
    tags=["Internal Production Jobs"],
)
