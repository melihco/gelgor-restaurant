"""Shared brand-execution enrichment steps.

Single home for the brand-context enrichment that the three execution
entrypoints previously duplicated inline:

  * internal orchestration  (app/api/internal/orchestration.py)
  * mission task-graph node  (app/services/task_graph_executor.py)
  * direct agent execution   (app/services/agent_execution_service.py)

Only the *shared logic* (tenant-learning snapshot + gallery-usage application)
lives here. Task-type gating, structured logging and error handling intentionally
stay at each call site — they differ on purpose (e.g. agent_execution_service
overwrites even an empty learning block; the executor only applies gallery usage
for content_ideation). Keeping those decisions local avoids changing behavior
while removing the duplicated snapshot/usage plumbing.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.services.tenant_learning_service import (
    build_learning_context_prompt,
    build_tenant_learning_snapshot,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.crew.context import BrandInfo
    from app.services.tenant_learning_service import TenantLearningSnapshot

# Task types whose agents benefit from approved/rejected learning history.
# Matches the internal orchestrator and the mission task-graph executor exactly.
# NOTE: agent_execution_service uses a narrower set (no visual_design_cards) — it
# keeps its own local set on purpose; do not switch it to this constant.
LEARNING_TASK_TYPES: frozenset[str] = frozenset(
    {
        "content_ideation",
        "content_calendar",
        "content_strategy",
        "single_review_response",
        "review_analysis",
        "visual_design_cards",
    }
)


async def apply_learning_context(
    db: AsyncSession,
    brand: BrandInfo,
    tenant_id: str,
    *,
    set_when_empty: bool = False,
) -> TenantLearningSnapshot:
    """Build the tenant-learning snapshot and inject it into ``brand``.

    Returns the snapshot so callers can log example counts. Does not catch
    exceptions — callers wrap as they each did before (orchestrator/executor
    swallow with a warning; agent_execution lets it propagate to fail the task).

    By default the prompt is only assigned when non-empty (orchestrator/executor
    semantics). Pass ``set_when_empty=True`` to always assign (agent_execution).
    """
    snapshot = await build_tenant_learning_snapshot(db, tenant_id)
    text = build_learning_context_prompt(snapshot)
    if text or set_when_empty:
        brand.learning_context = text
    return snapshot


async def apply_gallery_usage(brand: BrandInfo, tenant_id: str) -> None:
    """Fetch per-type gallery usage and apply it to ``brand``.

    Pure plumbing — callers keep their own try/except + log key.
    """
    from app.services.gallery_usage_service import (
        apply_gallery_usage_to_brand,
        fetch_gallery_usage_by_type,
    )

    usage = await fetch_gallery_usage_by_type(tenant_id)
    apply_gallery_usage_to_brand(brand, usage)
