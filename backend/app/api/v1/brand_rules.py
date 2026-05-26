"""
Brand Rules API — operator review of auto-promoted learning patterns.

Endpoints:
  GET  /{workspace_id}                      → list all rules (filter by status)
  GET  /{workspace_id}/pending              → shortcut: status=under_review
  POST /{workspace_id}/scan                 → trigger a manual promoter scan
  PUT  /{workspace_id}/{rule_id}/approve    → approve + apply to BrandContext
  PUT  /{workspace_id}/{rule_id}/reject     → reject (won't be re-proposed)
  DELETE /{workspace_id}/{rule_id}          → hard delete (cleanup only)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.brand_rule import BrandRule
from app.services.learning_promoter_service import (
    apply_rule_to_brand_context,
    run_promoter_for_workspace,
)

logger = structlog.get_logger()
router = APIRouter()


# ── Response schemas (inline) ─────────────────────────────────────────────────

class BrandRuleRead(BaseModel):
    id: str
    workspace_id: str
    rule_type: str
    rule_key: str
    rule_value: str | None
    confirmation_count: int
    approval_rate: float | None
    confidence: float
    evidence_summary: str | None
    status: str
    source: str
    promoted_at: datetime | None
    promoted_by: str | None
    rejected_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ApproveRuleRequest(BaseModel):
    approved_by: str = "operator"


class ScanResponse(BaseModel):
    workspace_id: str
    candidates_found: int
    already_known: int
    created: int
    message: str


def _to_read(rule: BrandRule) -> BrandRuleRead:
    return BrandRuleRead(
        id=str(rule.id),
        workspace_id=str(rule.workspace_id),
        rule_type=rule.rule_type,
        rule_key=rule.rule_key,
        rule_value=rule.rule_value,
        confirmation_count=rule.confirmation_count,
        approval_rate=rule.approval_rate,
        confidence=rule.confidence,
        evidence_summary=rule.evidence_summary,
        status=rule.status,
        source=rule.source,
        promoted_at=rule.promoted_at,
        promoted_by=rule.promoted_by,
        rejected_at=rule.rejected_at,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


async def _load_rule_or_404(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    rule_id: uuid.UUID,
) -> BrandRule:
    r = await db.execute(
        select(BrandRule).where(
            BrandRule.id == rule_id,
            BrandRule.workspace_id == workspace_id,
        )
    )
    rule = r.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Brand rule not found")
    return rule


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{workspace_id}", response_model=list[BrandRuleRead])
async def list_brand_rules(
    workspace_id: uuid.UUID,
    status: str | None = Query(None, description="Filter: under_review | active | rejected | deprecated"),
    rule_type: str | None = Query(None, description="Filter: cta | format_preference | format_avoidance | hook_pattern | content_pillar"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """
    List brand rules for a workspace.
    Default returns all rules; use ?status=under_review for pending approvals.
    """
    q = select(BrandRule).where(BrandRule.workspace_id == workspace_id)
    if status:
        q = q.where(BrandRule.status == status)
    if rule_type:
        q = q.where(BrandRule.rule_type == rule_type)
    q = q.order_by(BrandRule.confidence.desc(), BrandRule.created_at.desc()).limit(limit)

    result = await db.execute(q)
    rules = result.scalars().all()
    return [_to_read(r) for r in rules]


@router.get("/{workspace_id}/pending", response_model=list[BrandRuleRead])
async def list_pending_rules(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Shortcut: rules awaiting operator review (status=under_review), sorted by confidence.
    These are the promotion candidates the Brand Hub shows for one-tap approve/reject.
    """
    result = await db.execute(
        select(BrandRule)
        .where(BrandRule.workspace_id == workspace_id, BrandRule.status == "under_review")
        .order_by(BrandRule.confidence.desc())
    )
    return [_to_read(r) for r in result.scalars().all()]


@router.post("/{workspace_id}/scan", response_model=ScanResponse)
async def trigger_promoter_scan(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger a manual learning promoter scan for this workspace.

    Scans the last 90 days of approval history, finds patterns meeting
    promotion thresholds, and creates new BrandRule rows (status=under_review).

    The weekly scheduler runs this automatically; this endpoint is for
    on-demand refresh from the Brand Hub.
    """
    try:
        result = await run_promoter_for_workspace(db, workspace_id)
    except Exception as exc:
        logger.error("promoter_scan_error", workspace_id=str(workspace_id), error=str(exc))
        raise HTTPException(500, f"Promoter scan failed: {exc}") from exc

    created = result["created"]
    return ScanResponse(
        workspace_id=str(workspace_id),
        **result,
        message=(
            f"{created} yeni kural önerisi oluşturuldu. Brand Hub'dan inceleyebilirsiniz."
            if created else
            "Yeni öneri bulunamadı — mevcut onay geçmişi eşikleri karşılamıyor."
        ),
    )


@router.put("/{workspace_id}/{rule_id}/approve")
async def approve_brand_rule(
    workspace_id: uuid.UUID,
    rule_id: uuid.UUID,
    data: ApproveRuleRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Approve a brand rule and apply it to the workspace's BrandContext.

    Applying the rule immediately updates the authoritative BrandContext fields
    (content_pillars, default_ctas, custom_rules, risk_rules) so all future
    agent executions reflect this confirmed brand pattern.
    """
    rule = await _load_rule_or_404(db, workspace_id, rule_id)

    if rule.status == "active":
        raise HTTPException(400, "Rule is already active.")
    if rule.status == "rejected":
        raise HTTPException(400, "Rejected rules cannot be approved. Delete and re-scan.")

    rule.status = "active"
    rule.promoted_at = datetime.now(timezone.utc)
    rule.promoted_by = data.approved_by
    await db.commit()

    # Apply to BrandContext
    applied = await apply_rule_to_brand_context(db, rule)

    logger.info(
        "brand_rule_approved",
        workspace_id=str(workspace_id),
        rule_id=str(rule_id),
        rule_type=rule.rule_type,
        rule_key=rule.rule_key,
        applied_to_context=applied,
    )

    return {
        "id":                  str(rule.id),
        "rule_type":           rule.rule_type,
        "rule_key":            rule.rule_key,
        "status":              rule.status,
        "promoted_at":         rule.promoted_at.isoformat(),
        "applied_to_context":  applied,
        "message": (
            f"Kural onaylandı ve marka bağlamına eklendi: {rule.rule_key}"
            if applied else
            f"Kural onaylandı ancak marka bağlamı güncellenemedi (tekrar deneyin)."
        ),
    }


@router.put("/{workspace_id}/{rule_id}/reject")
async def reject_brand_rule(
    workspace_id: uuid.UUID,
    rule_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Reject a brand rule proposal.

    Rejected rules are excluded from future promoter scans for this workspace —
    the operator's decision is respected until the rule is deleted.
    """
    rule = await _load_rule_or_404(db, workspace_id, rule_id)

    if rule.status not in ("under_review", "active"):
        raise HTTPException(400, f"Cannot reject a rule with status '{rule.status}'.")

    rule.status = "rejected"
    rule.rejected_at = datetime.now(timezone.utc)
    await db.commit()

    logger.info("brand_rule_rejected", workspace_id=str(workspace_id),
                rule_type=rule.rule_type, rule_key=rule.rule_key)

    return {
        "id":          str(rule.id),
        "rule_type":   rule.rule_type,
        "rule_key":    rule.rule_key,
        "status":      "rejected",
        "rejected_at": rule.rejected_at.isoformat(),
        "message":     f"Kural reddedildi: {rule.rule_key}. Bir daha önerilmeyecek.",
    }


@router.delete("/{workspace_id}/{rule_id}", status_code=204)
async def delete_brand_rule(
    workspace_id: uuid.UUID,
    rule_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Hard delete a brand rule (cleanup only — use reject to suppress re-proposals)."""
    rule = await _load_rule_or_404(db, workspace_id, rule_id)
    await db.delete(rule)
    await db.commit()
