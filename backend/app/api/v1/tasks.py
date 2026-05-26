from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.task import TaskRead, TaskDetail, SuggestionRead
from app.services.agent_execution_service import list_tasks, get_task_detail, list_suggestions

router = APIRouter()


@router.get("/{workspace_id}", response_model=dict)
async def get_workspace_tasks(
    workspace_id: uuid.UUID,
    status: str | None = Query(None),
    agent_role: str | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    tasks, total = await list_tasks(db, workspace_id, status, agent_role, limit, offset)
    return {
        "items": [TaskRead.model_validate(t) for t in tasks],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/detail/{task_id}", response_model=TaskDetail)
async def get_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    task = await get_task_detail(db, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    return task


@router.get("/suggestions/{workspace_id}", response_model=list[SuggestionRead])
async def get_workspace_suggestions(
    workspace_id: uuid.UUID,
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    return await list_suggestions(db, workspace_id, status, limit)
