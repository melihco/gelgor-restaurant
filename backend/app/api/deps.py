"""
Shared FastAPI dependencies.

Public app routes can still use tenant-aware DB access in development,
but internal orchestration routes use a dedicated service-to-service API key.
This keeps the CrewAI process callable by .NET without exposing it directly
to browsers or customer-facing clients.
"""

from __future__ import annotations

import uuid

from fastapi import Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db as _get_db

SEED_TENANT_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
settings = get_settings()


async def get_db() -> AsyncSession:  # type: ignore[misc]
    async for session in _get_db():
        yield session


async def get_tenant_id(
    x_tenant_id: str | None = Header(None),
) -> uuid.UUID:
    """
    Extract tenant ID from request header.
    In production this would come from JWT claims.
    For development, falls back to the seed tenant.
    """
    if x_tenant_id:
        try:
            return uuid.UUID(x_tenant_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid tenant ID format")
    return SEED_TENANT_ID


async def verify_internal_api_key(
    x_internal_api_key: str | None = Header(None),
) -> None:
    """
    Validate the shared service token used by the .NET application API
    when calling this internal orchestration service.
    """
    if x_internal_api_key != settings.internal_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal API key",
        )


def verify_workspace_access(workspace_id_param: str = "workspace_id"):
    """
    Dependency factory: ensures the workspace_id in the URL path matches
    the authenticated tenant in X-Tenant-Id. Prevents IDOR via URL guessing.

    Usage:
        # Per-endpoint:
        @router.get("/x/{workspace_id}", dependencies=[Depends(verify_workspace_access())])
        # Router-level (auto no-op for routes without workspace_id):
        api_router.include_router(r, dependencies=[Depends(verify_workspace_access())])

    Behaviour:
    - workspace_id NOT in route → no-op (skip check, allows global endpoints)
    - workspace_id in route + matching X-Tenant-Id header → allow
    - workspace_id in route + mismatching/missing header in production → 403/401
    - workspace_id in route + missing header in development → allow (seed tenant)
    """
    import os as _os
    is_prod = _os.environ.get("PYTHON_ENV", "").lower() == "production"

    async def _check(
        request: Request,
        x_tenant_id: str | None = Header(None),
    ) -> None:
        workspace_id = request.path_params.get(workspace_id_param)
        # No workspace_id in path — global endpoint, skip check.
        if not workspace_id:
            return
        # No header — fall back to dev behaviour (seed tenant accepted).
        if not x_tenant_id:
            if not is_prod:
                return
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing tenant context",
            )
        # Header present — must match URL path.
        try:
            header_uuid = uuid.UUID(x_tenant_id)
            path_uuid = uuid.UUID(workspace_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid tenant/workspace id")
        if header_uuid != path_uuid:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Workspace access denied",
            )

    return _check
