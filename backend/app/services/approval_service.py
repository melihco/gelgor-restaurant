"""
Legacy approval service – handles the Python Suggestion review workflow.

Every agent suggestion goes through human approval before becoming
an action. This service manages the approve/reject/revise cycle.

The production Nexus UI reviews .NET SuggestedAction rows instead; this
service applies only to /api/v1 legacy public routes.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Suggestion, Approval, ActionLog

VALID_DECISIONS = {"approved", "rejected", "revision_requested"}


async def approve_suggestion(
    db: AsyncSession,
    suggestion_id: uuid.UUID,
    decision: str,
    reviewer_note: str | None = None,
    rejection_code: str | None = None,
) -> Approval:
    if decision not in VALID_DECISIONS:
        raise ValueError(f"Decision must be one of: {VALID_DECISIONS}")

    result = await db.execute(
        select(Suggestion).where(Suggestion.id == suggestion_id)
    )
    suggestion = result.scalar_one_or_none()
    if not suggestion:
        raise ValueError("Suggestion not found")

    if suggestion.status != "pending":
        raise ValueError(f"Suggestion is already '{suggestion.status}', cannot review")

    suggestion.status = decision

    approval = Approval(
        suggestion_id=suggestion_id,
        decision=decision,
        reviewer_note=reviewer_note,
        # Only store rejection_code when actually rejecting — silently drop for approvals.
        rejection_code=rejection_code if decision == "rejected" else None,
        reviewed_at=datetime.now(timezone.utc),
    )
    db.add(approval)

    log = ActionLog(
        task_id=suggestion.task_id,
        workspace_id=suggestion.workspace_id,
        agent_role=suggestion.agent_role,
        action=f"suggestion_{decision}",
        details_json=(
            f'{{"suggestion_id": "{suggestion_id}", '
            f'"note": "{reviewer_note or ""}", '
            f'"rejection_code": "{rejection_code or ""}"}}'
        ),
    )
    db.add(log)

    await db.flush()
    return approval
