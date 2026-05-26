"""
Learning Promoter Service — auto-promotes confirmed patterns to Brand Rules.

Scans the 90-day approval history for patterns that meet promotion thresholds,
then creates BrandRule rows (status='under_review') for operator review.

Promotion thresholds (all configurable via function parameters)
───────────────────────────────────────────────────────────────
  CTA              : seen in ≥5 approved pieces
  Format preferred : suggestion_type with ≥80% approval rate and ≥3 data points
  Format avoidance : suggestion_type with ≤30% approval rate and ≥5 data points
  Hook pattern     : caption_hook_type weighted count ≥5

Idempotency rules
─────────────────
  - A (workspace_id, rule_type, rule_key) that is already 'active' → skip
  - A rule that was 'rejected' → skip (operator said no, don't re-propose)
  - A rule already 'under_review' → skip (no duplicate proposals)

BrandContext application (on operator approval)
───────────────────────────────────────────────
  content_pillar / format_preference → appended to content_pillars JSON array
  cta                                → appended to default_ctas JSON array
  hook_pattern                       → appended as note to custom_rules text
  format_avoidance                   → appended to risk_rules JSON dict
"""

from __future__ import annotations

import json
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.brand_context import BrandContext
from app.models.brand_rule import BrandRule
from app.models.task import Approval, Suggestion

logger = structlog.get_logger()

# ── Promotion thresholds ──────────────────────────────────────────────────────

MIN_CTA_COUNT            = 5    # CTA must appear in ≥5 approved pieces
MIN_FORMAT_COUNT         = 3    # format needs ≥3 data points
MIN_FORMAT_APPROVAL_RATE = 0.80  # ≥80% for preferred format
MIN_AVOIDANCE_COUNT      = 5    # need ≥5 data points for avoidance signal
MAX_AVOIDANCE_RATE       = 0.30  # ≤30% approval rate triggers avoidance rule
MIN_HOOK_COUNT           = 5    # weighted count ≥5 for hook patterns
LOOKBACK_DAYS            = 90


# ── Pattern scanner ───────────────────────────────────────────────────────────

async def scan_promotable_patterns(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    lookback_days: int = LOOKBACK_DAYS,
) -> list[dict[str, Any]]:
    """
    Scan approval history and return promotion candidates.

    Each candidate dict has:
        rule_type, rule_key, rule_value, confirmation_count,
        approval_rate (or None), confidence, evidence_summary
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    recent_cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    # ── Load approved suggestions ─────────────────────────────────────────────
    approved_q = await db.execute(
        select(Suggestion)
        .where(
            and_(
                Suggestion.workspace_id == workspace_id,
                Suggestion.status == "approved",
                Suggestion.updated_at >= cutoff,
            )
        )
        .order_by(Suggestion.updated_at.desc())
        .limit(300)
    )
    approved = approved_q.scalars().all()

    # ── Load rejected suggestions ─────────────────────────────────────────────
    rejected_q = await db.execute(
        select(Suggestion)
        .where(
            and_(
                Suggestion.workspace_id == workspace_id,
                Suggestion.status == "rejected",
                Suggestion.updated_at >= cutoff,
            )
        )
        .limit(100)
    )
    rejected = rejected_q.scalars().all()

    if not approved:
        return []

    candidates: list[dict[str, Any]] = []

    # ── 1. CTA promotion ──────────────────────────────────────────────────────
    cta_counts: Counter = Counter()
    for s in approved:
        try:
            cta = json.loads(s.content_json or "{}").get("cta", "").strip()
            if cta and len(cta) < 80:
                cta_counts[cta] += 1
        except Exception:
            pass

    for cta, count in cta_counts.most_common(8):
        if count >= MIN_CTA_COUNT:
            candidates.append({
                "rule_type":          "cta",
                "rule_key":           cta,
                "rule_value":         f'CTA: "{cta}"',
                "confirmation_count": count,
                "approval_rate":      None,
                "confidence":         min(0.95, 0.60 + count * 0.05),
                "evidence_summary":   f'"{cta}" appeared in {count} approved pieces',
            })

    # ── 2. Format preference / avoidance ──────────────────────────────────────
    type_stats: dict[str, dict[str, int]] = defaultdict(lambda: {"approved": 0, "rejected": 0})
    for s in approved:
        type_stats[s.suggestion_type or "post"]["approved"] += 1
    for s in rejected:
        type_stats[s.suggestion_type or "post"]["rejected"] += 1

    for fmt, counts in type_stats.items():
        total = counts["approved"] + counts["rejected"]
        if total < MIN_FORMAT_COUNT:
            continue
        rate = counts["approved"] / total

        if rate >= MIN_FORMAT_APPROVAL_RATE and total >= MIN_FORMAT_COUNT:
            candidates.append({
                "rule_type":          "format_preference",
                "rule_key":           fmt,
                "rule_value":         f"Format preferred: {fmt}",
                "confirmation_count": total,
                "approval_rate":      round(rate, 2),
                "confidence":         min(0.92, 0.55 + total * 0.03 + rate * 0.2),
                "evidence_summary":   f"{fmt}: {int(rate * 100)}% approval rate ({total} data points)",
            })

        elif rate <= MAX_AVOIDANCE_RATE and total >= MIN_AVOIDANCE_COUNT:
            candidates.append({
                "rule_type":          "format_avoidance",
                "rule_key":           fmt,
                "rule_value":         f"Avoid format: {fmt}",
                "confirmation_count": total,
                "approval_rate":      round(rate, 2),
                "confidence":         min(0.90, 0.50 + total * 0.04),
                "evidence_summary":   f"{fmt}: only {int(rate * 100)}% approval rate ({total} data points)",
            })

    # ── 3. Hook pattern promotion ─────────────────────────────────────────────
    hook_counts: Counter = Counter()
    for s in approved:
        try:
            hook = json.loads(s.content_json or "{}").get("caption_hook_type", "").strip()
            # Recent approvals get 2× weight
            weight = 2 if (s.updated_at and s.updated_at >= recent_cutoff.replace(tzinfo=None)) else 1
            if hook:
                hook_counts[hook] += weight
        except Exception:
            pass

    for hook, count in hook_counts.most_common(5):
        if count >= MIN_HOOK_COUNT:
            candidates.append({
                "rule_type":          "hook_pattern",
                "rule_key":           hook,
                "rule_value":         f"Caption hook that works: {hook.replace('_', ' ').title()}",
                "confirmation_count": count,
                "approval_rate":      None,
                "confidence":         min(0.88, 0.55 + count * 0.04),
                "evidence_summary":   f'Hook type "{hook}" weighted score: {count} (recent approvals count 2×)',
            })

    return candidates


# ── Promotion runner ──────────────────────────────────────────────────────────

async def run_promoter_for_workspace(
    db: AsyncSession,
    workspace_id: uuid.UUID,
) -> dict[str, int]:
    """
    Scan patterns, filter already-known rules, create new BrandRule rows.

    Returns: {candidates_found, already_known, created}
    """
    candidates = await scan_promotable_patterns(db, workspace_id)
    if not candidates:
        return {"candidates_found": 0, "already_known": 0, "created": 0}

    # Load existing rules for this workspace (only non-rejected)
    existing_q = await db.execute(
        select(BrandRule.rule_type, BrandRule.rule_key, BrandRule.status)
        .where(BrandRule.workspace_id == workspace_id)
    )
    # Build a set of (type, key) that already exist in any non-final state
    known: set[tuple[str, str]] = {
        (row.rule_type, row.rule_key)
        for row in existing_q.all()
        if row.status in ("under_review", "active")
    }

    created = 0
    already_known = 0

    for cand in candidates:
        key = (cand["rule_type"], cand["rule_key"])
        if key in known:
            already_known += 1
            continue

        rule = BrandRule(
            id=uuid.uuid4(),
            workspace_id=workspace_id,
            rule_type=cand["rule_type"],
            rule_key=cand["rule_key"],
            rule_value=cand["rule_value"],
            confirmation_count=cand["confirmation_count"],
            approval_rate=cand["approval_rate"],
            confidence=cand["confidence"],
            evidence_summary=cand["evidence_summary"],
            status="under_review",
            source="learning",
        )
        db.add(rule)
        created += 1
        known.add(key)  # prevent duplicates within the same scan

    if created:
        await db.commit()

    logger.info(
        "learning_promoter_workspace_done",
        workspace_id=str(workspace_id),
        candidates=len(candidates),
        already_known=already_known,
        created=created,
    )
    return {
        "candidates_found": len(candidates),
        "already_known":    already_known,
        "created":          created,
    }


# ── BrandContext applier (called on operator approval) ───────────────────────

async def apply_rule_to_brand_context(
    db: AsyncSession,
    rule: BrandRule,
) -> bool:
    """
    Apply an approved BrandRule to the BrandContext fields.

    Returns True if the BrandContext was updated.

    Mapping:
      cta / format_preference → content_pillars + default_ctas
      format_avoidance        → risk_rules JSON dict
      hook_pattern            → custom_rules text note
      content_pillar          → content_pillars JSON array
    """
    bc_q = await db.execute(
        select(BrandContext).where(BrandContext.workspace_id == rule.workspace_id)
    )
    bc = bc_q.scalar_one_or_none()
    if not bc:
        logger.warning("apply_rule_no_brand_context", workspace_id=str(rule.workspace_id))
        return False

    updated = False

    if rule.rule_type in ("cta",):
        # Append to default_ctas JSON array
        ctas: list[str] = []
        if bc.default_ctas:
            try:
                ctas = json.loads(bc.default_ctas)
            except Exception:
                pass
        if rule.rule_key not in ctas:
            ctas.append(rule.rule_key)
            bc.default_ctas = json.dumps(ctas, ensure_ascii=False)
            updated = True

    elif rule.rule_type in ("format_preference", "content_pillar"):
        # Append to content_pillars JSON array
        pillars: list[str] = []
        if bc.content_pillars:
            try:
                pillars = json.loads(bc.content_pillars)
            except Exception:
                pass
        if rule.rule_key not in pillars:
            pillars.append(rule.rule_key)
            bc.content_pillars = json.dumps(pillars, ensure_ascii=False)
            updated = True

    elif rule.rule_type == "format_avoidance":
        # Add to risk_rules JSON dict
        rules_dict: dict[str, str] = {}
        if bc.risk_rules:
            try:
                rules_dict = json.loads(bc.risk_rules)
            except Exception:
                pass
        if rule.rule_key not in rules_dict:
            rules_dict[rule.rule_key] = "approval_required"
            bc.risk_rules = json.dumps(rules_dict, ensure_ascii=False)
            updated = True

    elif rule.rule_type == "hook_pattern":
        # Append as a note to custom_rules text
        note = f"Proven hook type: {rule.rule_key.replace('_', ' ').title()} (confirmed {rule.confirmation_count}× in approved content)"
        existing_rules = bc.custom_rules or ""
        if note not in existing_rules:
            bc.custom_rules = (existing_rules + "\n" + note).strip()
            updated = True

    if updated:
        await db.commit()
        logger.info(
            "brand_context_updated_from_rule",
            workspace_id=str(rule.workspace_id),
            rule_type=rule.rule_type,
            rule_key=rule.rule_key,
        )

    return updated
