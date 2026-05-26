from fastapi import APIRouter

from app.api.internal import orchestration

internal_router = APIRouter()
internal_router.include_router(
    orchestration.router,
    prefix="/orchestration",
    tags=["Internal Orchestration"],
)
