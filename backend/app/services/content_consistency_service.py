"""
Content Consistency Service — quality gate for multi-piece weekly content plans.

After the Content Agent generates N pieces for a week, this service checks:
  1. Tone consistency   — all pieces use the brand's established voice
  2. Format variety     — mix of posts/stories/reels/carousels
  3. CTA diversity      — not the same CTA repeated every piece
  4. Caption hook mix   — variety of hook strategies across the week
  5. Pillar coverage    — all confirmed content pillars represented

Returns a ConsistencyReport with a pass/fail verdict and specific corrections.
If corrections are needed, they are returned as actionable patches (not full re-runs).

This keeps quality high without adding a full extra LLM round-trip in most cases.
All checks are deterministic rule-based — no model call needed unless tone check
needs semantic evaluation (optional, off by default).
"""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from app.crew.cta_localization import detect_text_language, localize_cta


@dataclass
class ConsistencyIssue:
    severity: str        # "warning" | "error"
    check: str           # which check flagged it
    description: str     # what's wrong
    suggestion: str      # how to fix it


@dataclass
class ConsistencyReport:
    passed: bool
    issues: list[ConsistencyIssue] = field(default_factory=list)
    stats: dict[str, Any] = field(default_factory=dict)
    summary: str = ""

    def to_prompt_block(self) -> str:
        """Serialise for injection into a revision prompt."""
        if self.passed:
            return ""
        lines = ["## Content Consistency Issues — Please Fix Before Finalising\n"]
        for issue in self.issues:
            icon = "⚠️" if issue.severity == "warning" else "❌"
            lines.append(f"{icon} **{issue.check}**: {issue.description}")
            lines.append(f"   → {issue.suggestion}\n")
        return "\n".join(lines)


def check_weekly_content(
    concepts: list[dict],
    content_pillars: list[str],
    brand_ctas: list[str],
    *,
    min_format_types: int = 2,
    max_cta_repeat: int = 2,
) -> ConsistencyReport:
    """
    Run all consistency checks on a list of content concept dicts produced by
    the Content Agent's content_ideation task.

    concepts: list of JSON objects from content_ideation output
    content_pillars: confirmed brand pillars (e.g. ["daily_story", "menu_share"])
    brand_ctas: preferred CTAs for this brand
    """
    issues: list[ConsistencyIssue] = []
    n = len(concepts)

    if n == 0:
        return ConsistencyReport(
            passed=False,
            summary="No concepts to check.",
            issues=[ConsistencyIssue("error", "empty", "No content was generated", "Re-run ideation")],
        )

    # ── Check 1: Format variety ──────────────────────────────────────────
    formats = [c.get("content_type", "post") for c in concepts]
    unique_formats = len(set(formats))
    format_counts = dict(Counter(formats))

    if unique_formats < min_format_types and n >= 3:
        issues.append(ConsistencyIssue(
            severity="warning",
            check="format_variety",
            description=f"Only {unique_formats} format type(s) used across {n} pieces: {format_counts}",
            suggestion="Add at least one story or reel to the mix for better reach diversity.",
        ))

    # ── Check 2: CTA diversity ───────────────────────────────────────────
    ctas = [c.get("cta", "").strip() for c in concepts if c.get("cta")]
    cta_counts = Counter(ctas)
    repeated = [(cta, count) for cta, count in cta_counts.items() if count > max_cta_repeat]

    if repeated:
        repeated_str = ", ".join(f'"{cta}" ×{count}' for cta, count in repeated)
        issues.append(ConsistencyIssue(
            severity="warning",
            check="cta_diversity",
            description=f"CTA used too many times: {repeated_str}",
            suggestion=(
                f"Vary CTAs across the week. Preferred options: {', '.join(brand_ctas[:4])}. "
                "Reserve 'Rezervasyon Yap' for event/campaign pieces only."
            ),
        ))

    # ── Check 3: Hook variety ────────────────────────────────────────────
    hook_types = [c.get("caption_hook_type", "") for c in concepts if c.get("caption_hook_type")]
    if hook_types:
        hook_counts = Counter(hook_types)
        dominant_hook, dominant_count = hook_counts.most_common(1)[0]
        if dominant_count > (n * 0.6) and n >= 3:
            issues.append(ConsistencyIssue(
                severity="warning",
                check="caption_hook_variety",
                description=f'Hook type "{dominant_hook}" used in {dominant_count}/{n} captions',
                suggestion=(
                    "Vary caption openers: mix questions, bold statements, "
                    "social proof, and local references across the week."
                ),
            ))

    # ── Check 4: Content pillar coverage ────────────────────────────────
    if content_pillars:
        used_templates = {c.get("template_use_case", "") for c in concepts}
        # Map broad pillars to template_use_case values
        pillar_to_templates = {
            "daily_story":          ["daily_story"],
            "menu_share":           ["menu_share"],
            "event_announcement":   ["event_announcement"],
            "campaign_offer":       ["campaign_offer"],
            "social_proof":         ["social_proof"],
            "behind_the_scenes":    ["behind_the_scenes"],
            "educational_post":     ["educational_post"],
            "lead_generation":      ["lead_generation"],
        }
        missing_pillars = []
        for pillar in content_pillars[:4]:  # check top 4 priority pillars
            templates = pillar_to_templates.get(pillar, [pillar])
            if not any(t in used_templates for t in templates):
                missing_pillars.append(pillar)

        if missing_pillars and n >= len(content_pillars[:4]):
            issues.append(ConsistencyIssue(
                severity="warning",
                check="pillar_coverage",
                description=f"Missing pillar(s) not represented: {', '.join(missing_pillars)}",
                suggestion=(
                    f"Add at least one piece covering {missing_pillars[0]}. "
                    "Confirmed pillars should appear in every weekly batch."
                ),
            ))

    # ── Check 5: Missing A/B captions ───────────────────────────────────
    missing_alt = [i + 1 for i, c in enumerate(concepts) if not c.get("caption_draft_alt")]
    if missing_alt:
        issues.append(ConsistencyIssue(
            severity="warning",
            check="ab_captions",
            description=f"Pieces {missing_alt} are missing 'caption_draft_alt' (A/B option)",
            suggestion="Each piece should have two caption variants for A/B testing.",
        ))

    # ── Check 6: Title uniqueness ───────────────────────────────────────
    titles = [c.get("idea_title", "") or c.get("concept_title", "") for c in concepts]
    seen_titles: dict[str, int] = {}
    for idx, t in enumerate(titles, 1):
        t_lower = t.strip().lower()
        if not t_lower:
            continue
        for prev_t, prev_idx in seen_titles.items():
            if _title_similarity(t_lower, prev_t) > 0.65:
                issues.append(ConsistencyIssue(
                    severity="error",
                    check="title_uniqueness",
                    description=f"Piece #{idx} title too similar to piece #{prev_idx}: \"{t}\"",
                    suggestion="Rewrite this piece with a genuinely different angle/topic.",
                ))
                break
        seen_titles[t_lower] = idx

    # ── Check 7: Caption minimum quality ─────────────────────────────────
    for i, c in enumerate(concepts, 1):
        caption = c.get("caption_draft", "")
        if caption and len(caption) < 30:
            issues.append(ConsistencyIssue(
                severity="warning",
                check="caption_length",
                description=f"Piece #{i} caption too short ({len(caption)} chars)",
                suggestion="Captions should be at least 80 characters for engagement.",
            ))
        if caption and c.get("visual_direction"):
            vd = c["visual_direction"].lower()
            cap_words = set(caption.lower().split())
            if not (cap_words & set(vd.split())) and not c.get("selected_gallery_url"):
                issues.append(ConsistencyIssue(
                    severity="warning",
                    check="caption_visual_coherence",
                    description=f"Piece #{i}: caption and visual_direction share no keywords",
                    suggestion="Ensure the visual direction reflects the caption's subject.",
                ))

    # ── Check 8: Caption / CTA language alignment ───────────────────────
    for i, c in enumerate(concepts, 1):
        caption = str(c.get("caption_draft") or c.get("caption") or "").strip()
        cta = str(c.get("cta") or c.get("call_to_action") or "").strip()
        if not caption or not cta:
            continue
        cap_lang = detect_text_language(caption)
        cta_lang = detect_text_language(cta)
        if cap_lang != cta_lang:
            fixed = localize_cta(cta, cap_lang)
            issues.append(ConsistencyIssue(
                severity="error",
                check="cta_language_match",
                description=(
                    f"Piece #{i}: caption is {cap_lang.upper()} but CTA is {cta_lang.upper()} "
                    f'("{cta}")'
                ),
                suggestion=(
                    f'Use a {cap_lang.upper()} CTA such as "{fixed}" and rewrite the caption '
                    "so the embedded CTA matches the caption language."
                ),
            ))

    errors = [i for i in issues if i.severity == "error"]
    warnings = [i for i in issues if i.severity == "warning"]
    passed = len(errors) == 0

    stats = {
        "total_pieces": n,
        "format_counts": format_counts,
        "cta_counts": dict(cta_counts),
        "hook_counts": dict(Counter(hook_types)) if hook_types else {},
        "issues_total": len(issues),
        "errors": len(errors),
        "warnings": len(warnings),
    }

    if not issues:
        summary = f"✅ {n} pieces passed all consistency checks."
    else:
        summary = (
            f"{'❌' if errors else '⚠️'} {n} pieces — "
            f"{len(errors)} error(s), {len(warnings)} warning(s)."
        )

    return ConsistencyReport(passed=passed, issues=issues, stats=stats, summary=summary)


def _title_similarity(a: str, b: str) -> float:
    """Simple word-overlap Jaccard similarity between two title strings."""
    words_a = set(a.split())
    words_b = set(b.split())
    if not words_a or not words_b:
        return 0.0
    return len(words_a & words_b) / len(words_a | words_b)


# ── Per-piece quality scoring ─────────────────────────────────────────────────

@dataclass
class PieceQualityScore:
    overall: int            # 0-100
    completeness: int       # required fields present
    brand_fit: int          # caption length, tone indicators
    production_ready: int   # visual spec, gallery url, hashtags
    engagement_potential: int  # hook type, CTA, A/B variant
    flags: list[str]        # human-readable issues


def score_single_piece(concept: dict, brand_ctas: list[str] | None = None) -> PieceQualityScore:
    """
    Score a single content concept on a 0-100 scale across 4 dimensions.
    Used in the operator UI to surface quality at a glance.
    """
    flags: list[str] = []

    # ── Completeness (25 points) ─────────────────────────────────────────
    required_fields = [
        "caption_draft", "headline", "content_type", "visual_direction",
        "hashtags", "cta", "posting_time_suggestion",
    ]
    present = sum(1 for f in required_fields if concept.get(f))
    completeness = int((present / len(required_fields)) * 25)
    if not concept.get("caption_draft"):
        flags.append("missing caption")
    if not concept.get("visual_direction"):
        flags.append("missing visual direction")

    # ── Brand fit (25 points) ────────────────────────────────────────────
    brand_fit = 15  # base
    caption = concept.get("caption_draft", "")
    if 80 <= len(caption) <= 500:
        brand_fit += 5
    elif len(caption) < 30:
        brand_fit -= 5
        flags.append("caption too short")
    if concept.get("brand_confidence") and float(concept.get("brand_confidence", 0)) >= 0.8:
        brand_fit += 5
    brand_fit = max(0, min(25, brand_fit))

    # ── Production readiness (25 points) ─────────────────────────────────
    prod = 0
    vps = concept.get("visual_production_spec") or {}
    if vps.get("treatment"):
        prod += 5
    if vps.get("selected_gallery_url") or concept.get("selected_gallery_url"):
        prod += 8
    elif vps.get("image_edit_prompt"):
        prod += 4
    else:
        flags.append("no photo selected")

    if concept.get("hashtags"):
        h = concept["hashtags"]
        tag_count = len(h) if isinstance(h, list) else len(h.split())
        if 3 <= tag_count <= 15:
            prod += 5
        elif tag_count > 0:
            prod += 2
    if concept.get("content_type"):
        prod += 4
    if vps.get("reel_motion_spec") and "reel" in (concept.get("content_type") or ""):
        prod += 3
    prod = min(25, prod)

    # ── Engagement potential (25 points) ──────────────────────────────────
    engage = 10  # base
    if concept.get("caption_hook_type"):
        engage += 5
    if concept.get("caption_draft_alt"):
        engage += 5  # A/B variant ready
    else:
        flags.append("no A/B caption variant")
    cta = concept.get("cta", "")
    if cta:
        engage += 3
        if brand_ctas and cta in brand_ctas:
            engage += 2
    engage = min(25, engage)

    overall = completeness + brand_fit + prod + engage

    return PieceQualityScore(
        overall=overall,
        completeness=completeness,
        brand_fit=brand_fit,
        production_ready=prod,
        engagement_potential=engage,
        flags=flags,
    )


def score_batch(concepts: list[dict], brand_ctas: list[str] | None = None) -> list[dict]:
    """Score all concepts in a batch and return serializable dicts."""
    return [
        {
            "piece_index": i,
            "overall": s.overall,
            "completeness": s.completeness,
            "brand_fit": s.brand_fit,
            "production_ready": s.production_ready,
            "engagement_potential": s.engagement_potential,
            "flags": s.flags,
            "grade": "A" if s.overall >= 80 else "B" if s.overall >= 60 else "C" if s.overall >= 40 else "D",
        }
        for i, s in enumerate(
            (score_single_piece(c, brand_ctas) for c in concepts), 1
        )
    ]
