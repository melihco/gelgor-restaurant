"""
Durable burned mission themes — written on reject, read by strategist diversity.

Uses brand_rules with rule_type='burned_theme' and status='active' so burns
survive title-regex misses and outlive a single 60d lookback window when
operators keep rejecting the same angle family.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.brand_rule import BrandRule

logger = structlog.get_logger(__name__)

RULE_TYPE_BURNED_THEME = "burned_theme"
SOURCE_MISSION_REJECT = "mission_reject"


async def persist_burned_themes_for_mission(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    mission_title: str,
    mission_id: uuid.UUID | None = None,
    reason: str | None = None,
) -> list[str]:
    """Upsert active burned_theme rules from a rejected mission title."""
    from app.services.strategist_service import _detect_mission_theme_labels

    labels = _detect_mission_theme_labels(mission_title or "")
    if not labels:
        # Fall back to a normalized title slug so exact clones still burn.
        slug = " ".join((mission_title or "").strip().lower().split())
        if len(slug) >= 8:
            labels = [slug[:180]]
    if not labels:
        return []

    now = datetime.now(timezone.utc)
    persisted: list[str] = []
    for label in labels:
        key = label.strip()[:200]
        if not key:
            continue
        existing = await db.execute(
            select(BrandRule).where(
                BrandRule.workspace_id == workspace_id,
                BrandRule.rule_type == RULE_TYPE_BURNED_THEME,
                BrandRule.rule_key == key,
                BrandRule.status != "rejected",
            )
        )
        rule = existing.scalar_one_or_none()
        evidence = (
            f"Rejected mission theme. title={((mission_title or '')[:120])}"
            + (f" reason={reason[:120]}" if reason else "")
            + (f" mission_id={mission_id}" if mission_id else "")
        )
        if rule:
            rule.status = "active"
            rule.confirmation_count = int(rule.confirmation_count or 0) + 1
            rule.evidence_summary = evidence
            rule.updated_at = now
            if not rule.promoted_at:
                rule.promoted_at = now
                rule.promoted_by = "mission_reject"
            db.add(rule)
        else:
            db.add(
                BrandRule(
                    workspace_id=workspace_id,
                    rule_type=RULE_TYPE_BURNED_THEME,
                    rule_key=key,
                    rule_value=f"Do not re-propose campaigns about: {key}",
                    confirmation_count=1,
                    confidence=0.9,
                    evidence_summary=evidence,
                    status="active",
                    source=SOURCE_MISSION_REJECT,
                    promoted_at=now,
                    promoted_by="mission_reject",
                )
            )
        persisted.append(key)

    await db.commit()
    logger.info(
        "mission_themes_burned",
        workspace_id=str(workspace_id),
        mission_id=str(mission_id) if mission_id else None,
        labels=persisted,
    )
    return persisted


async def list_active_burned_theme_labels(
    db: AsyncSession,
    workspace_id: uuid.UUID,
) -> list[str]:
    result = await db.execute(
        select(BrandRule.rule_key)
        .where(
            BrandRule.workspace_id == workspace_id,
            BrandRule.rule_type == RULE_TYPE_BURNED_THEME,
            BrandRule.status == "active",
        )
        .order_by(BrandRule.confirmation_count.desc(), BrandRule.updated_at.desc())
        .limit(40)
    )
    out: list[str] = []
    for (key,) in result.all():
        k = str(key or "").strip()
        if k and k not in out:
            out.append(k)
    return out
