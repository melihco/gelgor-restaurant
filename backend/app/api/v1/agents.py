"""
Legacy public Agent API routes.

Provides endpoints for:
- Listing available agent roles (system-wide catalog)
- Listing agent instances for a workspace (what's active)
- Triggering agent execution into Python Task/Suggestion persistence

The production Nexus app uses the .NET API and /internal/v1/orchestration
instead. Keep this route family isolated if enable_public_api is turned on.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db, get_tenant_id
from app.crew.engine import AGENT_ROLES
from app.models.agent_config import AgentDefinition, AgentInstance
from app.schemas.agent import (
    AgentDefinitionRead,
    AgentExecutionRequest,
    AgentExecutionResponse,
    AgentInstanceRead,
)
from app.services.agent_execution_service import execute_agent, ExecutionError

router = APIRouter()


@router.get("/roles", response_model=dict)
async def list_agent_roles():
    """List all available agent roles and their capabilities."""
    return AGENT_ROLES


@router.get("/definitions", response_model=list[AgentDefinitionRead])
async def list_agent_definitions(db: AsyncSession = Depends(get_db)):
    """List all registered agent definitions."""
    result = await db.execute(
        select(AgentDefinition).where(AgentDefinition.is_active == True)
    )
    return result.scalars().all()


@router.get("/instances/{workspace_id}", response_model=list[AgentInstanceRead])
async def list_workspace_agents(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """List active agent instances for a workspace (determined by package)."""
    result = await db.execute(
        select(AgentInstance)
        .options(selectinload(AgentInstance.definition))
        .where(
            AgentInstance.workspace_id == workspace_id,
            AgentInstance.is_enabled == True,
        )
    )
    return result.scalars().all()


@router.post("/execute", response_model=AgentExecutionResponse)
async def execute_agent_endpoint(
    request: AgentExecutionRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger an agent execution for a workspace.

    This is the primary action endpoint. It:
    1. Validates the workspace has access to the requested agent
    2. Builds brand context
    3. Runs the CrewAI crew
    4. Persists results as a Task + Suggestion

    The Suggestion then enters the approval workflow.
    """
    try:
        task = await execute_agent(
            db=db,
            workspace_id=request.workspace_id,
            agent_role=request.agent_role,
            task_type=request.task_type,
            input_data=request.input_data,
            priority=request.priority,
        )
        return AgentExecutionResponse(
            task_id=task.id,
            status=task.status,
            message=f"Agent execution {'completed' if task.status == 'completed' else 'failed'}",
        )
    except ExecutionError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Agent execution failed: {str(e)}")
