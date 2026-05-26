"""
Agent execution service – the critical bridge between API and CrewAI.

Legacy public API path: this service handles the full lifecycle of an
agent execution when /api/v1 routes are enabled. The production Nexus UI
uses the .NET API as the persistence and approval source of truth, calling
Python through /internal/v1/orchestration instead.

This service handles the full lifecycle of a legacy public agent execution:
1. Validates the request (workspace exists, agent role is active, within limits)
2. Creates a Task record in the database
3. Builds brand context from the workspace
4. Calls the CrewAI engine
5. Persists results as Suggestions
6. Logs actions

Do not mix the Task/Suggestion rows created here with Nexus OutputArtifact
and SuggestedAction approvals for the same workflow.
"""

from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timezone

import structlog
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.crew.engine import get_crew_engine, AGENT_ROLES
from app.models.agent_config import AgentInstance, AgentDefinition
from app.models.task import Task, Suggestion, ActionLog
from app.services.brand_context_service import build_brand_info
from app.services.tenant_learning_service import (
    build_tenant_learning_snapshot,
    build_learning_context_prompt,
)

logger = structlog.get_logger()


class ExecutionError(Exception):
    pass


async def validate_agent_access(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    agent_role: str,
) -> AgentInstance:
    """
    Verify that the workspace has an active agent instance for the requested role.
    This enforces package-based access control.
    """
    result = await db.execute(
        select(AgentInstance)
        .join(AgentDefinition)
        .where(
            AgentInstance.workspace_id == workspace_id,
            AgentDefinition.role_key == agent_role,
            AgentInstance.is_enabled == True,
        )
    )
    instance = result.scalar_one_or_none()
    if not instance:
        raise ExecutionError(
            f"Agent role '{agent_role}' is not available for this workspace. "
            f"Check that the workspace's package includes this agent."
        )
    return instance


async def execute_agent(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    agent_role: str,
    task_type: str,
    input_data: dict | None = None,
    priority: str = "normal",
) -> Task:
    """
    Execute an agent crew and persist results.

    This is the main entry point for all agent executions.
    It coordinates validation, execution, and persistence.
    """
    input_data = input_data or {}

    agent_instance = await validate_agent_access(db, workspace_id, agent_role)

    engine = get_crew_engine()
    if not engine.is_valid_execution(agent_role, task_type):
        raise ExecutionError(f"Invalid task type '{task_type}' for agent '{agent_role}'")

    role_info = AGENT_ROLES.get(agent_role, {})
    task = Task(
        workspace_id=workspace_id,
        agent_role=agent_role,
        crew_name=f"{agent_role.replace('_agent', '')}_crew",
        task_type=task_type,
        title=f"{role_info.get('display_name', agent_role)}: {task_type.replace('_', ' ').title()}",
        description=json.dumps(input_data) if input_data else None,
        status="running",
        priority=priority,
        input_json=json.dumps(input_data) if input_data else None,
        started_at=datetime.now(timezone.utc),
    )
    db.add(task)
    await db.flush()

    await _log_action(db, workspace_id, task.id, agent_role, "execution_started", {
        "task_type": task_type,
        "input_summary": str(input_data)[:200],
    })

    brand = await build_brand_info(db, workspace_id)
    if not brand:
        task.status = "failed"
        task.error_message = "No brand context configured for this workspace"
        task.completed_at = datetime.now(timezone.utc)
        await db.flush()
        raise ExecutionError("Brand context must be configured before running agents")

    # ── Inject tenant learning context ──────────────────────────────────────
    # Build a snapshot of approved/rejected content history and inject it
    # into brand context so agents learn from past feedback.
    # Content-producing tasks benefit most; skip for analytics/ads.
    content_tasks = {"content_ideation", "content_calendar", "content_strategy",
                     "single_review_response", "review_analysis"}
    if task_type in content_tasks:
        tenant_id = str(workspace_id)  # adjust if tenant_id differs from workspace_id
        learning_snapshot = await build_tenant_learning_snapshot(db, tenant_id)
        brand.learning_context = build_learning_context_prompt(learning_snapshot)
        logger.info(
            "tenant_learning_injected",
            workspace_id=str(workspace_id),
            task_type=task_type,
            has_examples=bool(learning_snapshot.approved_examples),
            example_count=len(learning_snapshot.approved_examples),
        )

    start_time = time.time()
    try:
        result = engine.execute(agent_role, task_type, brand, input_data)
    except Exception as e:
        task.status = "failed"
        task.error_message = str(e)
        task.completed_at = datetime.now(timezone.utc)
        task.execution_time_ms = int((time.time() - start_time) * 1000)
        await db.flush()
        raise

    elapsed_ms = int((time.time() - start_time) * 1000)

    if result.get("status") == "failed":
        task.status = "failed"
        task.error_message = result.get("error", "Unknown error")
    else:
        task.status = "completed"

    task.output_json = json.dumps(result)
    task.completed_at = datetime.now(timezone.utc)
    task.execution_time_ms = elapsed_ms
    await db.flush()

    if task.status == "completed":
        await _create_suggestion_from_result(db, task, result)

    agent_instance.total_executions += 1
    await db.flush()

    await _log_action(db, workspace_id, task.id, agent_role, "execution_completed", {
        "status": task.status,
        "execution_time_ms": elapsed_ms,
    })

    return task


async def _create_suggestion_from_result(
    db: AsyncSession,
    task: Task,
    result: dict,
) -> Suggestion:
    """Convert a crew execution result into a Suggestion for the approval workflow."""
    suggestion = Suggestion(
        task_id=task.id,
        workspace_id=task.workspace_id,
        agent_role=task.agent_role,
        suggestion_type=task.task_type,
        title=task.title,
        summary=result.get("raw_output", "")[:500] if result.get("raw_output") else None,
        content_json=json.dumps(result),
        status="pending",
    )
    db.add(suggestion)
    await db.flush()
    return suggestion


async def _log_action(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    task_id: uuid.UUID | None,
    agent_role: str,
    action: str,
    details: dict,
) -> None:
    log = ActionLog(
        task_id=task_id,
        workspace_id=workspace_id,
        agent_role=agent_role,
        action=action,
        details_json=json.dumps(details),
    )
    db.add(log)
    await db.flush()


async def list_tasks(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    status: str | None = None,
    agent_role: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Task], int]:
    """List tasks for a workspace with optional filters."""
    query = select(Task).where(Task.workspace_id == workspace_id)
    count_query = select(func.count(Task.id)).where(Task.workspace_id == workspace_id)

    if status:
        query = query.where(Task.status == status)
        count_query = count_query.where(Task.status == status)
    if agent_role:
        query = query.where(Task.agent_role == agent_role)
        count_query = count_query.where(Task.agent_role == agent_role)

    query = query.order_by(Task.created_at.desc()).limit(limit).offset(offset)

    result = await db.execute(query)
    tasks = list(result.scalars().all())

    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    return tasks, total


async def get_task_detail(db: AsyncSession, task_id: uuid.UUID) -> Task | None:
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Task)
        .options(selectinload(Task.suggestions))
        .where(Task.id == task_id)
    )
    return result.scalar_one_or_none()


async def list_suggestions(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    status: str | None = None,
    limit: int = 50,
) -> list[Suggestion]:
    query = (
        select(Suggestion)
        .where(Suggestion.workspace_id == workspace_id)
        .order_by(Suggestion.created_at.desc())
        .limit(limit)
    )
    if status:
        query = query.where(Suggestion.status == status)

    result = await db.execute(query)
    return list(result.scalars().all())
