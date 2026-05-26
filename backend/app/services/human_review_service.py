"""
Human Review Service — Enterprise quality gate.

When enabled, generated content goes through a human review step
before being delivered to the client. A senior account manager
reviews, edits if needed, and approves/rejects.

This is the "an expert reviewed this" layer that:
1. Catches AI errors (factual, tone, brand violations)
2. Adds human creativity touch
3. Signals to clients that outputs are quality-controlled
4. Builds trust at the Enterprise tier

Review flow:
  Agent generates content
      ↓
  [if human_review_enabled for this workspace]
  Content enters "pending_review" queue
      ↓
  Reviewer gets notified (email / in-app)
      ↓
  Reviewer approves / edits / rejects with notes
      ↓
  Client sees reviewed content
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import select, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()


async def create_review_request(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    content: dict[str, Any],
    suggestion_id: str | None = None,
    artifact_id: str | None = None,
    reviewer_email: str | None = None,
) -> dict[str, Any]:
    """
    Create a human review request for generated content.
    Returns the review record.
    """
    from sqlalchemy import text

    review_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    await db.execute(
        text("""
            INSERT INTO content_reviews
            (id, workspace_id, suggestion_id, artifact_id, reviewer_email, status, requested_at)
            VALUES (:id, :ws, :sid, :aid, :email, 'pending', :now)
        """),
        {
            "id": review_id,
            "ws": workspace_id,
            "sid": uuid.UUID(suggestion_id) if suggestion_id else None,
            "aid": uuid.UUID(artifact_id) if artifact_id else None,
            "email": reviewer_email,
            "now": now,
        },
    )
    await db.commit()

    logger.info(
        "review_request_created",
        review_id=str(review_id),
        workspace_id=str(workspace_id),
    )

    return {"review_id": str(review_id), "status": "pending", "requested_at": now.isoformat()}


async def get_pending_reviews(db: AsyncSession, workspace_id: uuid.UUID) -> list[dict]:
    """Get all pending review requests for a workspace."""
    from sqlalchemy import text

    rows = await db.execute(
        text("""
            SELECT id, suggestion_id, artifact_id, reviewer_email, status,
                   notes, requested_at, reviewed_at
            FROM content_reviews
            WHERE workspace_id = :ws AND status = 'pending'
            ORDER BY requested_at DESC
            LIMIT 50
        """),
        {"ws": workspace_id},
    )
    return [
        {
            "review_id": str(r[0]),
            "suggestion_id": str(r[1]) if r[1] else None,
            "artifact_id": str(r[2]) if r[2] else None,
            "reviewer_email": r[3],
            "status": r[4],
            "notes": r[5],
            "requested_at": r[6].isoformat() if r[6] else None,
            "reviewed_at": r[7].isoformat() if r[7] else None,
        }
        for r in rows
    ]


async def submit_review(
    db: AsyncSession,
    review_id: str,
    status: str,  # "approved" | "rejected" | "edited"
    notes: str | None = None,
    edited_content: str | None = None,
    reviewer_name: str | None = None,
) -> dict:
    """Submit a review decision."""
    from sqlalchemy import text

    now = datetime.now(timezone.utc)
    await db.execute(
        text("""
            UPDATE content_reviews
            SET status = :status,
                notes = :notes,
                edited_content = :edited,
                reviewer_name = :name,
                reviewed_at = :now
            WHERE id = :id
        """),
        {
            "id": uuid.UUID(review_id),
            "status": status,
            "notes": notes,
            "edited": edited_content,
            "name": reviewer_name,
            "now": now,
        },
    )
    await db.commit()

    logger.info("review_submitted", review_id=review_id, status=status)
    return {"review_id": review_id, "status": status, "reviewed_at": now.isoformat()}


async def get_review_stats(db: AsyncSession, workspace_id: uuid.UUID) -> dict:
    """Get review statistics for a workspace."""
    from sqlalchemy import text

    rows = await db.execute(
        text("""
            SELECT status, COUNT(*) as count
            FROM content_reviews
            WHERE workspace_id = :ws
            GROUP BY status
        """),
        {"ws": workspace_id},
    )
    stats = {r[0]: r[1] for r in rows}
    total = sum(stats.values())
    approved = stats.get("approved", 0)

    return {
        "total": total,
        "pending": stats.get("pending", 0),
        "approved": approved,
        "rejected": stats.get("rejected", 0),
        "edited": stats.get("edited", 0),
        "approval_rate": round(approved / total, 2) if total > 0 else 0,
    }
