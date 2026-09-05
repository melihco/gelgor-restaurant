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
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from app.crew.cta_localization import detect_text_language, localize_cta, resolve_language_code, resolve_output_language


# Words that only exist between us and the studio. The slot brief has to name
# the deliverable ("Tipografi poster story") for the idea to be written for the
# right slot, and the model occasionally answers in that vocabulary instead of
# the brand's. Deliberately narrow: "story", "post" and "reel" are excluded
# because brands do say them to customers, and "afiş" is legitimate Turkish for
# an event poster the venue is actually promoting.
_CRAFT_WORDS: tuple[str, ...] = (
    "tipografi",
    "typography",
    "poster",
    "şablon",
    "sablon",
    "template",
    "mockup",
    "placeholder",
    "lorem ipsum",
    "carousel",
    "karusel",
    "slot",
    "cta",
)

# Turkish agglutinates, so the stem has to be allowed to carry suffixes:
# anchoring on a closing word boundary would catch "Tipografi ile Huzur" and
# miss "Tipografimiz". None of these stems prefix an unrelated Turkish word.
_CRAFT_PATTERN = re.compile(
    r"(?<![\wğüşıöçĞÜŞİÖÇ])(" + "|".join(_CRAFT_WORDS) + r")[\wğüşıöçĞÜŞİÖÇ]*",
    re.IGNORECASE,
)


def find_production_craft_words(text: str) -> list[str]:
    """Studio vocabulary that leaked into a line meant for customers.

    Returns the offending stems, so the message stays stable whatever suffix
    the model attached.
    """
    if not text or not text.strip():
        return []
    seen: list[str] = []
    for match in _CRAFT_PATTERN.finditer(text):
        word = match.group(1).lower()
        if word not in seen:
            seen.append(word)
    return seen


# Format and craft words describe how a slot is made, not what it is about, so
# they carry no subject. A slot left with nothing else — "Tipografi poster
# story", "Premium Editorial Campaign" — is defined by treatment and is exempt
# from any subject test.
_SLOT_FORMAT_WORDS: frozenset[str] = frozenset({
    "post", "posts", "story", "stories", "reel", "reels", "carousel", "karusel",
    "gönderi", "gonderi", "video", "afiş", "afis",
})

_SLOT_GENERIC_WORDS: frozenset[str] = frozenset({
    "ve", "ile", "için", "icin", "bir", "öne", "one", "çıkan", "cikan", "günü",
    "gunu", "premium", "editorial", "campaign", "duyuru",
})


def _fold_tr(text: str) -> str:
    # Dotted capital İ has to be folded before lowercasing: Python lowercases it
    # to "i" plus a combining dot, which then survives as its own character.
    folded = (text or "").replace("İ", "i").replace("I", "ı").lower()
    for src, dst in (("ı", "i"), ("ş", "s"), ("ğ", "g"),
                     ("ü", "u"), ("ö", "o"), ("ç", "c")):
        folded = folded.replace(src, dst)
    return folded


def slot_subject_tokens(label: str, slot_key: str = "") -> list[str]:
    """The words that say what a slot is about, stripped of how it is built.

    Read off the human label, which is written in the same language as the copy
    being checked. The key is only a fallback: its sector prefix is shared by
    every slot in a plan, so tokenising it would give each slot a subject the
    others also claim, and would keep a treatment-only slot from being exempt.
    """
    blob = label.strip() or slot_key
    raw = re.split(r"[^0-9A-Za-zğüşıöçĞÜŞİÖÇ]+", blob)
    out: list[str] = []
    for word in raw:
        if len(word) < 3:
            continue
        folded = _fold_tr(word)
        if folded in {_fold_tr(w) for w in _SLOT_FORMAT_WORDS}:
            continue
        if folded in {_fold_tr(w) for w in _SLOT_GENERIC_WORDS}:
            continue
        if folded in {_fold_tr(w) for w in _CRAFT_WORDS}:
            continue
        if folded not in out:
            out.append(folded)
    from app.services.slot_purpose import slot_purpose_tokens
    for extra in slot_purpose_tokens(slot_key):
        if extra not in out:
            out.append(extra)
    return out


def _copy_hits_tokens(copy_blob: str, tokens: list[str]) -> list[str]:
    """Which subject tokens the copy actually says.

    Turkish agglutinates, so a token is matched as a word-initial stem: "menü"
    has to be found inside "menümüzde". Short tokens are required to stand as
    whole words, because a three-letter prefix hits too much.
    """
    folded = _fold_tr(copy_blob)
    hits: list[str] = []
    for token in tokens:
        if len(token) >= 4:
            pattern = rf"(?<![0-9a-z])({re.escape(token)})[a-z]*"
        else:
            pattern = rf"(?<![0-9a-z])({re.escape(token)})(?![0-9a-z])"
        if re.search(pattern, folded) and token not in hits:
            hits.append(token)
    return hits


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
    brand_languages: str | None = None,
    min_format_types: int = 2,
    max_cta_repeat: int = 2,
    catalog_slot_plan: list[dict[str, str]] | None = None,
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

    # ── Check 4: Content pillar coverage (Marka Anayasası contentNeeds) ─
    if content_pillars:
        from app.services.pillar_coverage_service import find_missing_pillars, normalize_pillars

        confirmed = normalize_pillars(content_pillars)
        missing_pillars = find_missing_pillars(concepts, confirmed)

        if missing_pillars:
            severity = "error" if n >= len(confirmed) else "warning"
            issues.append(ConsistencyIssue(
                severity=severity,
                check="pillar_coverage",
                description=(
                    f"Confirmed pillar(s) missing from template_use_case: {', '.join(missing_pillars)}. "
                    f"Covered: {', '.join(p for p in confirmed if p not in missing_pillars) or 'none'}."
                ),
                suggestion=(
                    "Assign exactly one concept per missing pillar with template_use_case equal to that pillar id. "
                    "Required when listed: campaign_offer (promo/trial), event_announcement (launch/webinar/demo). "
                    "Do not substitute product_highlight or service_intro unless they are in the contract list."
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

    # ── Check 9: Brand output language (tenant setting) ───────────────────
    if brand_languages:
        target = resolve_language_code(brand_languages)
        target_label = resolve_output_language(brand_languages)
        text_fields = (
            "caption_draft", "caption_draft_alt", "caption",
            "headline", "concept_title", "idea_title", "subline",
        )
        for i, c in enumerate(concepts, 1):
            mismatches: list[str] = []
            for field in text_fields:
                text = str(c.get(field) or "").strip()
                if not text or len(text) < 8:
                    continue
                if detect_text_language(text) != target:
                    mismatches.append(field)
            if mismatches:
                issues.append(ConsistencyIssue(
                    severity="error",
                    check="brand_output_language",
                    description=(
                        f"Piece #{i}: text fields {', '.join(mismatches)} are not in "
                        f"{target_label} (brand language is {target})"
                    ),
                    suggestion=(
                        f"Rewrite ALL copy fields natively in {target_label}. "
                        "Do not translate word-by-word — write as a native copywriter would."
                    ),
                ))

    # ── Check 5: Free trial headline cap ───────────────────────────────────
    trial_count = 0
    for c in concepts:
        blob = " ".join(
            str(c.get(f) or "")
            for f in ("headline", "concept_title", "idea_title", "caption_draft")
        )
        if re.search(r"ücretsiz\s*deneme|free\s*trial|deneme\s*fırsat", blob, re.I):
            trial_count += 1
    if trial_count > 1:
        issues.append(ConsistencyIssue(
            severity="error",
            check="free_trial_headline_cap",
            description=f"ücretsiz deneme / free trial hook used in {trial_count}/{n} pieces (max 1)",
            suggestion=(
                "Only ONE concept may lead with ücretsiz deneme or free trial. "
                "Rotate others to social_proof, educational_post, or behind_the_scenes."
            ),
        ))

    # ── Check 6: SaaS strategist use-case mix (weekly missions) ──────────
    if n >= 7:
        use_cases = {
            str(c.get("template_use_case") or "").lower()
            for c in concepts
        }
        required_saas = ("lead_generation", "social_proof", "educational_post", "behind_the_scenes")
        missing_saas = [uc for uc in required_saas if uc not in use_cases]
        if len(missing_saas) >= 3:
            issues.append(ConsistencyIssue(
                severity="warning",
                check="saas_use_case_mix",
                description=f"Missing strategist use cases: {', '.join(missing_saas)}",
                suggestion=(
                    "SaaS/agency weekly mix needs lead_generation, social_proof, "
                    "educational_post, and behind_the_scenes — at least one each."
                ),
            ))

    # ── Check 7: Season the calendar cannot support ──────────────────────
    # A weekly package sits inside one season, so a spring headline in September
    # is a factual error rather than a variety choice.
    from app.services.context_signal_service import find_out_of_season_words

    out_of_season: list[str] = []
    for c in concepts:
        copy_blob = " ".join(
            str(c.get(k) or "")
            for k in ("headline", "concept_title", "caption_draft", "caption",
                      "visual_direction", "hook")
        )
        for word in find_out_of_season_words(copy_blob):
            title = str(c.get("headline") or c.get("concept_title") or "?")[:60]
            out_of_season.append(f"{title} → “{word}”")

    if out_of_season:
        issues.append(ConsistencyIssue(
            severity="error",
            check="out_of_season",
            description=(
                f"{len(out_of_season)} piece(s) name a season this week cannot be in: "
                + "; ".join(out_of_season[:4])
            ),
            suggestion=(
                "Rewrite in the current season. Season is not a variety dimension — "
                "vary sub-product, daypart, customer segment, or content angle instead."
            ),
        ))

    # ── Check 8: Production craft words in publishable copy ──────────────
    # The slot brief names each deliverable in production language, and the
    # model sometimes answers with that language instead of the brand's: a live
    # Gel Gör idea for the "Tipografi poster story" slot carried the headline
    # "Tipografi ile Huzur!". No customer-facing line calls itself a poster.
    craft_hits: list[str] = []
    for c in concepts:
        line = " ".join(
            str(c.get(k) or "") for k in ("headline", "concept_title", "subline")
        )
        for word in find_production_craft_words(line):
            title = str(c.get("headline") or c.get("concept_title") or "?")[:60]
            craft_hits.append(f"{title} → “{word}”")

    if craft_hits:
        issues.append(ConsistencyIssue(
            severity="error",
            check="craft_word_leak",
            description=(
                f"{len(craft_hits)} headline(s) print production vocabulary: "
                + "; ".join(craft_hits[:4])
            ),
            suggestion=(
                "Say the slot's subject in the brand's voice. The slot name "
                "describes the deliverable to the studio, never to the customer."
            ),
        ))

    # ── Check 9: Holiday the calendar cannot reach ───────────────────────
    from app.services.holiday_date_gate import find_out_of_window_holidays

    stale_holidays: list[str] = []
    for c in concepts:
        copy_blob = " ".join(
            str(c.get(k) or "")
            for k in ("headline", "concept_title", "subline", "caption_draft",
                      "caption", "hook")
        )
        for name in find_out_of_window_holidays(copy_blob):
            title = str(c.get("headline") or c.get("concept_title") or "?")[:60]
            stale_holidays.append(f"{title} → “{name}”")

    if stale_holidays:
        issues.append(ConsistencyIssue(
            severity="error",
            check="holiday_out_of_window",
            description=(
                f"{len(stale_holidays)} piece(s) invoke a holiday this week cannot "
                "reach: " + "; ".join(stale_holidays[:4])
            ),
            suggestion=(
                "Drop the holiday and write to what is actually happening this "
                "week. Only holidays in the verified upcoming list may be named."
            ),
        ))

    # ── Check 10: Copy written for the wrong slot ────────────────────────
    # Ideation now claims a slot per idea and the claims no longer collide, but
    # nothing checked that the copy belongs to the slot it claimed. One live Gel
    # Gör batch put "Yeni menümüzde neler var?" in the "Masa hazır" slot and
    # "Çiftlikten sofraya!" in "Hafta sonu rezervasyon".
    #
    # Two signals, deliberately separated by confidence. A swap is unambiguous:
    # the copy misses its own subject and lands on another planned slot's. A
    # bare miss is only a warning, because the subject vocabulary comes from
    # slot labels and cannot know every synonym a brand uses for it.
    subjects: dict[str, list[str]] = {}
    for slot in (catalog_slot_plan or []):
        if not isinstance(slot, dict):
            continue
        key = str(slot.get("slot_key") or "").strip()
        if not key:
            continue
        tokens = slot_subject_tokens(
            str(slot.get("label_tr") or slot.get("label") or ""), key,
        )
        if tokens:
            subjects[key] = tokens

    swaps: list[str] = []
    misses: list[str] = []
    for c in concepts:
        claimed = str(c.get("catalog_slot_key") or c.get("catalogSlotKey") or "").strip()
        own = subjects.get(claimed)
        if not own:
            continue
        copy_blob = " ".join(
            str(c.get(k) or "")
            for k in ("headline", "concept_title", "subline", "caption_draft", "caption")
        )
        title = str(c.get("headline") or c.get("concept_title") or "?")[:52]
        if _copy_hits_tokens(copy_blob, own):
            continue

        rival, rival_hits = "", 0
        for other_key, other_tokens in subjects.items():
            if other_key == claimed:
                continue
            hits = len(_copy_hits_tokens(copy_blob, other_tokens))
            if hits > rival_hits:
                rival, rival_hits = other_key, hits

        if rival_hits >= 1:
            swaps.append(f"{title} → {claimed} yerine {rival}")
        else:
            misses.append(f"{title} → {claimed}")

    if swaps:
        issues.append(ConsistencyIssue(
            severity="error",
            check="slot_copy_swapped",
            description=(
                f"{len(swaps)} piece(s) were written for a different slot than they "
                "claim: " + "; ".join(swaps[:4])
            ),
            suggestion=(
                "Rewrite each line for the slot it claims, or move it to the slot "
                "it actually serves. The Nth idea belongs to the Nth slot."
            ),
        ))

    if misses:
        issues.append(ConsistencyIssue(
            severity="warning",
            check="slot_copy_off_subject",
            description=(
                f"{len(misses)} piece(s) never touch their slot's subject: "
                + "; ".join(misses[:4])
            ),
            suggestion=(
                "Name the slot's subject in the brand's own words — a review slot "
                "quotes a guest, a reservation slot asks for the booking."
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
