from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.task import ApprovalCreate, ApprovalRead
from app.services.approval_service import approve_suggestion

router = APIRouter()


@router.post("/suggestions/{suggestion_id}/decide", response_model=ApprovalRead)
async def decide_on_suggestion(
    suggestion_id: uuid.UUID,
    data: ApprovalCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Approve, reject, or request revision for an agent suggestion.
    This is the human-in-the-loop checkpoint in the agent workflow.
    """
    try:
        return await approve_suggestion(
            db, suggestion_id, data.decision, data.reviewer_note, data.rejection_code
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
