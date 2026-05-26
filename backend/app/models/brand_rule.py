"""
BrandRule model — auto-promoted rules derived from tenant approval history.

When the learning promoter detects a pattern in the approval data that meets
the promotion threshold (e.g., a CTA used in 5+ approved pieces, a content
format with ≥80% approval rate over 3+ data points), it creates a BrandRule
row with status='under_review'.

The operator sees pending rules in the Brand Hub and approves or rejects them.
On approval, the rule is applied to the authoritative BrandContext fields
(content_pillars, default_ctas, custom_rules, risk_rules) so all future agent
prompts reflect the brand's lived experience — not just the initial setup.

Rule types
──────────
  content_pillar    — a content format/type confirmed as preferred (→ content_pillars)
  cta               — a call-to-action seen in 5+ approved pieces (→ default_ctas)
  hook_pattern      — a caption hook type that works for this brand (→ custom_rules note)
  format_preference — a suggestion_type with ≥80% approval rate (→ content_pillars note)
  format_avoidance  — a suggestion_type with ≤30% approval rate (→ risk_rules)

Source
──────
  learning          — auto-detected from approval history
  manual            — operator created directly
  brand_discovery   — inferred during brand analysis
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel

if TYPE_CHECKING:
    from app.models.workspace import Workspace


class BrandRule(BaseModel):
    __tablename__ = "brand_rules"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Rule identity ─────────────────────────────────────────────────────
    # Type: content_pillar | cta | hook_pattern | format_preference | format_avoidance
    rule_type: Mapped[str] = mapped_column(String(50), nullable=False)

    # The actual value being proposed as a rule.
    # For cta: "Rezervasyon Yap"
    # For content_pillar/format: "daily_story"
    # For hook_pattern: "question"
    # For format_avoidance: "carousel"
    rule_key: Mapped[str] = mapped_column(String(200), nullable=False)

    # Human-readable description for the operator review UI.
    rule_value: Mapped[str | None] = mapped_column(Text)

    # ── Evidence strength ─────────────────────────────────────────────────
    # How many times this pattern was observed (approval count or weighted count)
    confirmation_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Approval rate when this rule_key was used (0.0–1.0); NULL for CTAs (count-based)
    approval_rate: Mapped[float | None] = mapped_column(Float)
    # Overall confidence in this promotion (0.0–1.0)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.7)
    # Short human-readable evidence for the operator ("Used in 7 approved posts, 85% rate")
    evidence_summary: Mapped[str | None] = mapped_column(Text)

    # ── Lifecycle ─────────────────────────────────────────────────────────
    # under_review → active   (operator approved, applied to BrandContext)
    # under_review → rejected (operator rejected, won't be re-proposed)
    # active → deprecated     (operator archived — no longer applied to prompts)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="under_review", index=True
    )

    # ── Provenance ────────────────────────────────────────────────────────
    # Where this rule came from: learning | manual | brand_discovery
    source: Mapped[str] = mapped_column(String(30), nullable=False, default="learning")

    # ── Promotion timestamps ──────────────────────────────────────────────
    promoted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    promoted_by: Mapped[str | None] = mapped_column(String(255))  # user_id or "auto"
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
