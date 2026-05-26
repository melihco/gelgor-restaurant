"""
Tenant Learning Service — the intelligence that makes agents learn per-tenant.

Every time a user approves, rejects or publishes content, this service
captures that signal and builds a growing "tenant intelligence profile"
that gets injected into agent prompts.

The result: agents produce content that is increasingly aligned with
what THIS specific tenant actually approves and publishes — not generic AI output.

Key signals captured:
1. Approved content → what the tenant likes (tone, format, length, CTAs)
2. Rejected content → what to avoid (with rejection reason)
3. GA4 + Instagram performance → what actually works in the real world
4. Approval patterns → which content types get approved fast vs rejected
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta
from enum import Enum
from typing import Any

import structlog
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.models.task import Suggestion, Approval

logger = structlog.get_logger()
settings = get_settings()


class RejectionReason(str, Enum):
    """
    Structured taxonomy for why a suggestion was rejected.

    Supplying a code (instead of free-text only) lets the learning service
    build precise, actionable "do NOT do this" directives for agents — rather
    than trying to infer intent from unstructured notes.

    Frontend should present these as a picker when the reviewer selects "Reject".
    The reviewer can additionally add a free-text reviewer_note for nuance.
    """
    TONE_MISMATCH           = "tone_mismatch"           # Voice / tone doesn't fit the brand
    TOO_GENERIC             = "too_generic"             # Lacks brand specificity
    VISUAL_OFF_BRAND        = "visual_off_brand"        # Visual direction doesn't match aesthetic
    BRAND_SAFETY_VIOLATION  = "brand_safety_violation"  # Violates brand safety or compliance
    COMPETITOR_OVERLAP      = "competitor_overlap"      # Too similar to a competitor's content
    FACTUAL_ERROR           = "factual_error"           # Contains inaccuracies
    CULTURAL_INSENSITIVITY  = "cultural_insensitivity"  # Cultural concern
    DUPLICATE_CONCEPT       = "duplicate_concept"       # Already produced a similar piece
    WRONG_CTA               = "wrong_cta"               # CTA doesn't match brand strategy
    WRONG_FORMAT            = "wrong_format"            # Format not suitable
    CAPTION_TOO_LONG        = "caption_too_long"        # Caption exceeds brand preference
    CAPTION_TOO_SHORT       = "caption_too_short"       # Caption lacks substance
    WRONG_HASHTAGS          = "wrong_hashtags"          # Hashtags don't match strategy
    OPERATOR_PREFERENCE     = "operator_preference"     # Operator personal / contextual choice
    OTHER                   = "other"                   # Catch-all; reviewer_note required


# Human-readable labels injected into agent prompts.
_REJECTION_LABELS: dict[str, str] = {
    RejectionReason.TONE_MISMATCH:           "Tone/voice doesn't match brand identity",
    RejectionReason.TOO_GENERIC:             "Content is too generic — not brand-specific enough",
    RejectionReason.VISUAL_OFF_BRAND:        "Visual direction doesn't match brand aesthetic",
    RejectionReason.BRAND_SAFETY_VIOLATION:  "Brand safety or compliance issue",
    RejectionReason.COMPETITOR_OVERLAP:      "Content too similar to a competitor's post",
    RejectionReason.FACTUAL_ERROR:           "Contains factual inaccuracies",
    RejectionReason.CULTURAL_INSENSITIVITY:  "Cultural sensitivity concern",
    RejectionReason.DUPLICATE_CONCEPT:       "Concept already produced recently — needs fresh angle",
    RejectionReason.WRONG_CTA:               "Wrong call-to-action for this brand",
    RejectionReason.WRONG_FORMAT:            "Wrong content format for this channel",
    RejectionReason.CAPTION_TOO_LONG:        "Caption too long — brand prefers concise copy",
    RejectionReason.CAPTION_TOO_SHORT:       "Caption too short — brand prefers more substance",
    RejectionReason.WRONG_HASHTAGS:          "Hashtags don't match brand hashtag strategy",
    RejectionReason.OPERATOR_PREFERENCE:     "Operator preference (see notes for detail)",
    RejectionReason.OTHER:                   "Rejected by operator (see notes for detail)",
}


# ── Learning snapshot ─────────────────────────────────────────────────────────

class TenantLearningSnapshot:
    """
    A structured snapshot of what an agent should know about a tenant
    based on past approved/rejected content and performance data.

    Weighted memory: patterns approved multiple times get higher priority.
    Recent approvals weighted 2x over older ones (recency bias).
    """

    def __init__(self, tenant_id: str):
        self.tenant_id = tenant_id
        self.approved_examples: list[dict] = []
        self.rejected_patterns: list[dict] = []
        self.top_performing_types: list[str] = []
        self.approval_rate_by_type: dict[str, float] = {}
        self.common_successful_ctas: list[str] = []
        self.successful_caption_traits: list[str] = []
        self.avoid_patterns: list[str] = []
        self.content_velocity: str = ""
        self.last_approved_at: str | None = None
        self.recent_produced_titles: list[str] = []
        # Weighted pattern memory — patterns with count > 1 are "confirmed habits"
        self.confirmed_patterns: list[dict] = []   # [{pattern, count, strength}]
        self.confirmed_ctas: list[dict] = []        # [{cta, count}]
        self.confirmed_formats: list[dict] = []     # [{format, approval_rate, count}]


def _build_cold_start_block(snapshot: TenantLearningSnapshot) -> str:
    """
    Generate bootstrapped guidance for new tenants with zero history.
    Uses industry playbook defaults so agents don't produce generic output.
    """
    try:
        from app.crew.industry_playbooks import normalize_industry_id, get_industry_playbook
    except ImportError:
        return ""

    ws_id = snapshot.tenant_id
    if not ws_id:
        return ""

    lines = ["## 🆕 New Brand — Initial Guidance (no approval history yet)\n"]
    lines.append(
        "This brand has no approved/rejected content yet. "
        "Follow these industry-based defaults until real feedback accumulates.\n"
    )

    lines.append("### Production Guidelines:")
    lines.append("- Start conservative: match the brand tone described in brand context exactly")
    lines.append("- Prioritize brand-safe, factual content over creative experimentation")
    lines.append("- Use ONLY information confirmed in brand description, website intelligence, and gallery")
    lines.append("- Avoid assumptions about products/services not explicitly mentioned")
    lines.append("- Keep captions moderate length (150-250 chars) until preferences are learned")
    lines.append("- Include 1 clear CTA from the brand's default_ctas list")
    lines.append("- Use a mix of content types from the brand's content_pillars")
    lines.append("")

    lines.append("### Quality Bar:")
    lines.append("- Every post must be publishable without edits — assume the owner will see it immediately")
    lines.append("- Double-check all factual claims against brand context data")
    lines.append("- When in doubt about a detail, omit it rather than hallucinate")
    lines.append("")

    return "\n".join(lines)


def build_learning_context_prompt(snapshot: TenantLearningSnapshot) -> str:
    """
    Convert a TenantLearningSnapshot into a structured prompt block
    injected into every agent backstory.

    The goal is concrete, actionable guidance — not vague "adapt to the brand."
    """
    has_content = (
        snapshot.approved_examples
        or snapshot.rejected_patterns
        or snapshot.recent_produced_titles
    )
    if not has_content:
        return _build_cold_start_block(snapshot)

    lines = ["## Tenant Learning Intelligence (from approved/rejected history)\n"]

    # Anti-repeat: inject recently produced titles so the agent actively avoids them
    if snapshot.recent_produced_titles:
        lines.append("### 🚫 ALREADY PRODUCED — DO NOT REPEAT these concepts (last 3 weeks):")
        lines.append("These topics/formats have already been generated. Produce DIFFERENT ideas.")
        lines.append("Even if the topic is good, find a fresh angle, different format, or new hook.\n")
        for title in snapshot.recent_produced_titles[:25]:
            lines.append(f"- {title}")
        lines.append("")

    # Confirmed habits — highest priority, seen 2+ times
    if snapshot.confirmed_patterns or snapshot.confirmed_ctas or snapshot.confirmed_formats:
        lines.append("### 🧠 CONFIRMED BRAND HABITS (seen 2+ times — follow these first)")
        lines.append("These are not suggestions — they are PROVEN patterns for this specific brand.\n")

        for p in snapshot.confirmed_patterns[:5]:
            strength = p.get("strength", "confirmed")
            count = p.get("count", 2)
            lines.append(f"- [{strength.upper()}] {p['pattern']} (approved {count}× )")

        if snapshot.confirmed_ctas:
            cta_list = " | ".join(f"\"{c['cta']}\" ({c['count']}×)" for c in snapshot.confirmed_ctas[:4])
            lines.append(f"- Proven CTAs: {cta_list}")

        for f in snapshot.confirmed_formats[:3]:
            if f["verdict"] == "preferred":
                lines.append(f"- Format [{f['format']}]: {int(f['approval_rate']*100)}% approval rate ({f['count']} posts)")
            elif f["verdict"] == "avoid":
                lines.append(f"- ⚠ Format [{f['format']}]: only {int(f['approval_rate']*100)}% approval — use sparingly")

        lines.append("")

    if snapshot.approved_examples:
        lines.append("### ✅ Examples of content this tenant APPROVES:")
        lines.append("Study these carefully — replicate the tone, length and structure.\n")
        for i, ex in enumerate(snapshot.approved_examples[:5], 1):
            lines.append(f"**Example {i}** ({ex.get('content_type', 'post')} · {ex.get('approved_at', '')}):")
            if ex.get("caption_excerpt"):
                lines.append(f"Caption: \"{ex['caption_excerpt']}\"")
            if ex.get("cta"):
                lines.append(f"CTA used: {ex['cta']}")
            if ex.get("hashtag_count"):
                lines.append(f"Hashtags: {ex['hashtag_count']} tags")
            if ex.get("estimated_engagement"):
                lines.append(f"Engagement signal: {ex['estimated_engagement']}")
            lines.append("")

    if snapshot.successful_caption_traits:
        lines.append("### Caption patterns that get approved:")
        for trait in snapshot.successful_caption_traits:
            lines.append(f"- {trait}")
        lines.append("")

    if snapshot.common_successful_ctas:
        lines.append(f"### CTAs this tenant uses: {', '.join(snapshot.common_successful_ctas)}")
        lines.append("")

    if snapshot.rejected_patterns:
        # Detect scope markers so the agent understands narrow revision requests.
        # Frontend prepends these to revision feedback when the operator selects
        # "Sadece Caption" / "Sadece Görsel" instead of full regeneration.
        marker_hits: list[str] = []
        for pattern in snapshot.rejected_patterns[:5]:
            desc = pattern.get("description", "") or ""
            if "[REVISE_CAPTION_ONLY]" in desc:
                marker_hits.append("caption")
            if "[REVISE_IMAGE_ONLY]" in desc:
                marker_hits.append("image")

        if marker_hits:
            lines.append("### 🎯 NARROW REVISION REQUESTS — pay close attention:")
            if "caption" in marker_hits:
                lines.append(
                    "- [REVISE_CAPTION_ONLY] markers mean the operator wants the CAPTION rewritten only. "
                    "KEEP the existing visual direction, asset choice, and overall concept. "
                    "Apply the listed notes (e.g. 'luxury', 'simpler') ONLY to the caption text."
                )
            if "image" in marker_hits:
                lines.append(
                    "- [REVISE_IMAGE_ONLY] markers mean the operator wants the VISUAL changed only. "
                    "KEEP the caption, hashtags, and CTA exactly as-is. "
                    "Apply the listed notes (e.g. 'renk değiştir') ONLY to the image/visual direction."
                )
            lines.append("")

        lines.append("### ❌ Patterns this tenant REJECTS — NEVER produce content that:")
        for pattern in snapshot.rejected_patterns[:5]:
            code = pattern.get("code")
            desc = pattern.get("description", "")
            # Prefix with category marker for structural clarity in LLM attention
            if code and code != "other":
                category = code.replace("_", " ").upper()
                lines.append(f"- [{category}] {desc}")
            else:
                lines.append(f"- {desc}")
        lines.append("")

    if snapshot.avoid_patterns:
        lines.append("### Additional patterns to avoid:")
        for p in snapshot.avoid_patterns:
            lines.append(f"- {p}")
        lines.append("")

    if snapshot.top_performing_types:
        lines.append(f"### Content types with highest approval rate: {', '.join(snapshot.top_performing_types)}")
        lines.append("")

    if snapshot.approval_rate_by_type:
        lines.append("### Approval rates by content type:")
        for ctype, rate in sorted(snapshot.approval_rate_by_type.items(), key=lambda x: -x[1]):
            lines.append(f"- {ctype}: {rate:.0%} approved")
        lines.append("")

    if snapshot.content_velocity:
        lines.append(f"### Content velocity: {snapshot.content_velocity}")
        lines.append("")

    lines.append(
        "**CRITICAL**: Use the approved examples above as your quality benchmark. "
        "If your output doesn't match the tone, format and length of those examples, revise it.\n"
    )

    return "\n".join(lines)


# ── Database query helpers ─────────────────────────────────────────────────────

async def build_tenant_learning_snapshot(
    db: AsyncSession,
    workspace_id: str,
    lookback_days: int = 90,
) -> TenantLearningSnapshot:
    """
    Query Suggestion + Approval tables for approved/rejected content and
    build a TenantLearningSnapshot for prompt injection.

    Uses workspace_id since the Python backend is workspace-scoped.
    Called before every agent execution that produces content.
    """
    snapshot = TenantLearningSnapshot(workspace_id)

    if not settings.tenant_learning_enabled:
        return snapshot

    cutoff = datetime.utcnow() - timedelta(days=lookback_days)

    try:
        import uuid as uuid_mod
        try:
            ws_uuid = uuid_mod.UUID(workspace_id)
        except (ValueError, AttributeError):
            return snapshot  # invalid UUID, skip learning

        # Approved suggestions — what the tenant likes
        approved_q = await db.execute(
            select(Suggestion)
            .where(
                and_(
                    Suggestion.workspace_id == ws_uuid,
                    Suggestion.status == "approved",
                    Suggestion.updated_at >= cutoff,
                )
            )
            .order_by(Suggestion.updated_at.desc())
            .limit(settings.tenant_learning_max_examples * 2)
        )
        approved = approved_q.scalars().all()

        # Rejected suggestions — what to avoid.
        # selectinload fetches the Approval row in a second query so that
        # suggestion.approval.rejection_code and .reviewer_note are available
        # without an explicit JOIN (avoids duplicate-row issues with outer joins).
        rejected_q = await db.execute(
            select(Suggestion)
            .options(selectinload(Suggestion.approval))
            .where(
                and_(
                    Suggestion.workspace_id == ws_uuid,
                    Suggestion.status == "rejected",
                    Suggestion.updated_at >= cutoff,
                )
            )
            .order_by(Suggestion.updated_at.desc())
            .limit(20)
        )
        rejected = rejected_q.scalars().all()

        # Build snapshot from suggestions
        snapshot.approved_examples = _extract_approved_examples(approved)
        snapshot.rejected_patterns = _extract_rejection_patterns(rejected)
        snapshot.successful_caption_traits = _infer_caption_traits(approved)
        snapshot.common_successful_ctas = _extract_common_ctas(approved)
        snapshot.avoid_patterns = _extract_avoid_patterns(rejected)
        snapshot.approval_rate_by_type = _calculate_approval_rates(approved, rejected)
        snapshot.top_performing_types = [
            k for k, v in sorted(
                snapshot.approval_rate_by_type.items(), key=lambda x: -x[1]
            )[:3]
        ]
        # Weighted memory — identify confirmed habits (seen 2+ times)
        snapshot.confirmed_patterns = _extract_confirmed_patterns(approved)
        snapshot.confirmed_ctas = _extract_confirmed_ctas(approved)
        snapshot.confirmed_formats = _extract_confirmed_formats(approved, rejected)

        if approved:
            weeks = max(1, lookback_days / 7)
            snapshot.content_velocity = f"{len(approved) / weeks:.1f} pieces approved per week"
            snapshot.last_approved_at = (
                approved[0].updated_at.isoformat() if approved[0].updated_at else None
            )

        # All recently produced titles (regardless of status) — to prevent repetition
        recent_cutoff = datetime.utcnow() - timedelta(days=21)
        recent_q = await db.execute(
            select(Suggestion.title, Suggestion.suggestion_type)
            .where(
                and_(
                    Suggestion.workspace_id == ws_uuid,
                    Suggestion.agent_role == "content_agent",
                    Suggestion.created_at >= recent_cutoff,
                    Suggestion.title.isnot(None),
                )
            )
            .order_by(Suggestion.created_at.desc())
            .limit(40)
        )
        snapshot.recent_produced_titles = [
            f"{r[0]} ({r[1]})" if r[1] else r[0]
            for r in recent_q.all()
            if r[0]
        ]

        logger.info(
            "tenant_learning_snapshot_built",
            workspace_id=workspace_id,
            approved_count=len(approved),
            rejected_count=len(rejected),
            examples_captured=len(snapshot.approved_examples),
        )

    except Exception as exc:
        logger.warning("tenant_learning_snapshot_failed", workspace_id=workspace_id, error=str(exc))

    return snapshot


# ── Signal capture — called on approval/rejection events ─────────────────────

async def record_rejection_with_reason(
    db: AsyncSession,
    suggestion_id: str,
    reason: str,
    code: RejectionReason | None = None,
) -> None:
    """
    Attach or update a rejection reason on an existing Approval record.

    Use this when the rejection decision was already stored but the structured
    reason is captured separately (e.g. from a follow-up UI action).
    For new rejections, prefer passing rejection_code directly to approve_suggestion().
    """
    logger.info(
        "recording_rejection_reason",
        suggestion_id=suggestion_id,
        reason=reason,
        code=code.value if code else None,
    )
    try:
        import uuid as uuid_mod
        result = await db.execute(
            select(Approval).where(Approval.suggestion_id == uuid_mod.UUID(suggestion_id))
        )
        approval = result.scalar_one_or_none()
        if approval:
            approval.reviewer_note = reason         # fixed: was reviewer_notes (typo)
            if code is not None:
                approval.rejection_code = code.value
            await db.flush()
    except Exception as exc:
        logger.warning("rejection_reason_save_failed", error=str(exc))


# ── Private helpers ───────────────────────────────────────────────────────────

def _safe_content(suggestion: Suggestion) -> str:
    """Safely get content from a Suggestion."""
    return suggestion.content_json or suggestion.summary or ""


def _extract_approved_examples(suggestions: list[Suggestion]) -> list[dict]:
    """Extract the most useful approved examples for prompt injection."""
    examples = []
    for s in suggestions[:5]:
        content = _safe_content(s)
        caption_excerpt = ""

        try:
            parsed = json.loads(content)
            caption_excerpt = (
                parsed.get("caption_draft") or
                parsed.get("caption") or
                parsed.get("content") or
                s.summary or ""
            )[:250]
        except Exception:
            caption_excerpt = (s.summary or content)[:250]

        if not caption_excerpt:
            continue

        cta = ""
        try:
            parsed = json.loads(content)
            cta = parsed.get("cta") or parsed.get("call_to_action", "")
        except Exception:
            pass

        examples.append({
            "content_type": s.suggestion_type or "post",
            "caption_excerpt": caption_excerpt.strip(),
            "cta": cta,
            "approved_at": s.updated_at.strftime("%Y-%m-%d") if s.updated_at else "",
        })

    return examples


def _extract_rejection_patterns(suggestions: list[Suggestion]) -> list[dict]:
    """
    Extract actionable rejection patterns from rejected suggestions.

    Priority order for each suggestion:
    1. Structured rejection_code from Approval (most reliable signal)
    2. Free-text reviewer_note from Approval (explicit but unstructured)
    3. Content-length inference (last resort — lowest signal quality)

    The resulting descriptions are injected verbatim into agent prompts as
    "NEVER do this" directives, so precision matters.
    """
    patterns: list[dict] = []
    seen_keys: set[str] = set()

    for s in suggestions:
        content = _safe_content(s)

        # Pull code and note from the eagerly-loaded Approval relationship.
        # Both will be None if no Approval row exists (shouldn't happen for
        # status == "rejected" but safe to guard).
        approval = s.approval  # loaded via selectinload in build_tenant_learning_snapshot
        rejection_code: str | None = getattr(approval, "rejection_code", None) if approval else None
        reviewer_note: str | None = getattr(approval, "reviewer_note", None) if approval else None

        # ── Priority 1: structured code ───────────────────────────────────
        if rejection_code and rejection_code not in seen_keys:
            seen_keys.add(rejection_code)
            label = _REJECTION_LABELS.get(rejection_code, rejection_code.replace("_", " ").title())
            note_suffix = f" (operator note: \"{reviewer_note}\")" if reviewer_note else ""
            patterns.append({
                "description": label + note_suffix,
                "reason": rejection_code,
                "code": rejection_code,
            })

        # ── Priority 2: free-text note (no code supplied) ─────────────────
        elif reviewer_note and reviewer_note not in seen_keys:
            seen_keys.add(reviewer_note)
            patterns.append({
                "description": reviewer_note,
                "reason": reviewer_note,
                "code": None,
            })

        # ── Priority 3: infer from caption length ─────────────────────────
        elif not rejection_code and not reviewer_note:
            try:
                parsed = json.loads(content)
                caption = parsed.get("caption_draft") or parsed.get("caption", "")
                if len(caption) > 500 and "caption_too_long" not in seen_keys:
                    seen_keys.add("caption_too_long")
                    patterns.append({
                        "description": "Caption too long (500+ chars) — brand prefers concise copy",
                        "reason": "inferred from rejected content length",
                        "code": "caption_too_long",
                    })
            except Exception:
                pass

        if len(patterns) >= 5:
            break

    return patterns


def _infer_caption_traits(suggestions: list[Suggestion]) -> list[str]:
    """Infer caption characteristics from approved suggestions."""
    traits: list[str] = []
    lengths: list[int] = []
    has_emoji = 0
    has_question = 0
    total = 0

    for s in suggestions:
        content = _safe_content(s)
        try:
            parsed = json.loads(content)
            caption = parsed.get("caption_draft") or parsed.get("caption", "")
        except Exception:
            caption = s.summary or content

        if not caption:
            continue

        total += 1
        lengths.append(len(caption))
        if any(ord(c) > 127 for c in caption):
            has_emoji += 1
        if "?" in caption:
            has_question += 1

    if total == 0:
        return traits

    avg = sum(lengths) / len(lengths) if lengths else 0
    if avg < 150:
        traits.append("Short captions (under 150 chars) preferred")
    elif avg < 300:
        traits.append("Medium-length captions (150-300 chars) work well")
    else:
        traits.append("Longer storytelling captions (300+ chars) preferred")

    if has_emoji / total > 0.6:
        traits.append("Emojis are common in approved content")
    elif has_emoji / total < 0.2:
        traits.append("Minimal emojis — clean text preferred")

    if has_question / total > 0.4:
        traits.append("Questions drive engagement for this tenant")

    return traits


def _extract_common_ctas(suggestions: list[Suggestion]) -> list[str]:
    """Find the most common CTAs in approved content."""
    cta_counts: dict[str, int] = {}
    for s in suggestions:
        try:
            parsed = json.loads(_safe_content(s))
            cta = parsed.get("cta", "")
            if cta and len(cta) < 50:
                cta_counts[cta] = cta_counts.get(cta, 0) + 1
        except Exception:
            pass
    return [cta for cta, _ in sorted(cta_counts.items(), key=lambda x: -x[1])[:4]]


def _extract_avoid_patterns(suggestions: list[Suggestion]) -> list[str]:
    """Infer what to avoid from rejected content."""
    patterns: set[str] = set()
    for s in suggestions:
        content = _safe_content(s)
        try:
            parsed = json.loads(content)
            caption = parsed.get("caption_draft") or parsed.get("caption", "")
            if len(caption) > 500:
                patterns.add("Overly long captions")
        except Exception:
            pass
    return list(patterns)[:6]


def _calculate_approval_rates(
    approved: list[Suggestion],
    rejected: list[Suggestion],
) -> dict[str, float]:
    """Calculate approval rate per suggestion type."""
    type_counts: dict[str, dict[str, int]] = {}

    for s in approved:
        t = s.suggestion_type or "post"
        if t not in type_counts:
            type_counts[t] = {"approved": 0, "rejected": 0}
        type_counts[t]["approved"] += 1

    for s in rejected:
        t = s.suggestion_type or "post"
        if t not in type_counts:
            type_counts[t] = {"approved": 0, "rejected": 0}
        type_counts[t]["rejected"] += 1

    rates = {}
    for t, counts in type_counts.items():
        total = counts["approved"] + counts["rejected"]
        if total > 0:
            rates[t] = counts["approved"] / total

    return rates


# ── Weighted memory helpers ────────────────────────────────────────────────────

def _extract_confirmed_patterns(approved: list[Suggestion]) -> list[dict]:
    """
    Find content patterns approved 2+ times — these are CONFIRMED brand habits.
    Patterns seen once = preference. Patterns seen 3+ times = rule.
    Weight by: frequency × recency (recent approvals count double).
    """
    from collections import Counter
    from datetime import datetime, timedelta

    now = datetime.utcnow()
    recent_cutoff = now - timedelta(days=30)

    hook_counts: Counter = Counter()
    tone_counts: Counter = Counter()
    format_counts: Counter = Counter()

    for s in approved:
        try:
            parsed = json.loads(_safe_content(s))
            hook = parsed.get("caption_hook_type", "")
            content_type = parsed.get("content_type", "")
            tone_hint = parsed.get("brand_tone_applied", "")

            # Recent approvals get 2x weight
            weight = 2 if (s.updated_at and s.updated_at >= recent_cutoff) else 1

            if hook:
                hook_counts[hook] += weight
            if content_type:
                format_counts[content_type] += weight
            if tone_hint:
                tone_counts[tone_hint] += weight
        except Exception:
            pass

    patterns = []
    strength_labels = {1: "emerging", 2: "confirmed", 3: "strong habit", 4: "brand rule"}

    for hook, count in hook_counts.most_common(5):
        if count >= 2:
            strength = strength_labels.get(min(count, 4), "brand rule")
            patterns.append({"pattern": f"Hook type: {hook}", "count": count, "strength": strength})

    for fmt, count in format_counts.most_common(3):
        if count >= 2:
            strength = strength_labels.get(min(count, 4), "brand rule")
            patterns.append({"pattern": f"Format preference: {fmt}", "count": count, "strength": strength})

    return patterns


def _extract_confirmed_ctas(approved: list[Suggestion]) -> list[dict]:
    """CTAs that appear 2+ times in approved content = this brand's proven CTAs."""
    from collections import Counter
    cta_counts: Counter = Counter()

    for s in approved:
        try:
            parsed = json.loads(_safe_content(s))
            cta = parsed.get("cta", "").strip()
            if cta and len(cta) < 60:
                cta_counts[cta] += 1
        except Exception:
            pass

    return [
        {"cta": cta, "count": count}
        for cta, count in cta_counts.most_common(5)
        if count >= 2
    ]


def _extract_confirmed_formats(
    approved: list[Suggestion], rejected: list[Suggestion]
) -> list[dict]:
    """Format types with approval rate > 70% and 3+ data points."""
    from collections import defaultdict
    stats: dict[str, dict[str, int]] = defaultdict(lambda: {"approved": 0, "rejected": 0})

    for s in approved:
        t = s.suggestion_type or "post"
        stats[t]["approved"] += 1
    for s in rejected:
        t = s.suggestion_type or "post"
        stats[t]["rejected"] += 1

    result = []
    for fmt, counts in stats.items():
        total = counts["approved"] + counts["rejected"]
        if total < 3:
            continue
        rate = counts["approved"] / total
        result.append({
            "format": fmt,
            "approval_rate": round(rate, 2),
            "count": total,
            "verdict": "preferred" if rate >= 0.7 else "neutral" if rate >= 0.4 else "avoid",
        })

    return sorted(result, key=lambda x: -x["approval_rate"])
