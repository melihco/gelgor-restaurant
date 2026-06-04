"""
Content Crew – orchestrates Instagram content strategy and creation.

Composes the Content Agent with tasks for ideation, calendar planning,
and content package preparation. All outputs go through the approval
workflow before any publishing action.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from crewai import Crew, LLM, Process

from app.config import get_settings

logger = logging.getLogger(__name__)
from app.crew.agents.content_agent import create_content_agent
from app.crew.context import BrandInfo
from app.crew.token_usage import total_tokens_from_crew
from app.crew.tasks.content_tasks import (
    create_content_ideation_task,
    create_content_calendar_task,
)
from app.services.content_consistency_service import check_weekly_content, score_batch
from app.services.pillar_coverage_service import (
    enforce_confirmed_pillar_coverage,
    pillar_coverage_stats,
)
from app.crew.cta_localization import harmonize_content_concepts, resolve_output_language

# Field length caps for synthesised Canva copy (mirror autofill limits).
_CANVA_HEADLINE_MAX = 47
_CANVA_CTA_MAX = 23
_CANVA_SUBTITLE_MAX = 89


def _enforce_idea_completeness(concepts: list, brand: BrandInfo) -> list:
    """
    Deterministic post-ideation normalisation (Sprint 9 / foundation).

    The LLM is inconsistent about emitting `selected_gallery_url`,
    `canva_field_copy` and `asset_intent`. This guarantees every concept is
    complete at the SOURCE (so ICS = 100 without relying on downstream
    matcher/fallback). Pure/deterministic — never calls an LLM.

    - selected_gallery_url: assign an unused gallery photo (per content_type)
      when the agent left it null/empty.
    - canva_field_copy: synthesise {headline, cta, subtitle} from concept copy.
    - asset_intent: infer a sensible default from template_use_case.
    """
    gallery = [u for u in (brand.reference_image_urls or []) if isinstance(u, str) and u.strip()]
    used_by_type: dict[str, set[str]] = {}

    def pick_gallery(content_type: str) -> str | None:
        if not gallery:
            return None
        used = used_by_type.setdefault(content_type, set())
        for url in gallery:
            if url not in used:
                used.add(url)
                return url
        # All used for this type → reuse the first (better than null).
        return gallery[0]

    for item in concepts:
        if not isinstance(item, dict):
            continue
        content_type = str(item.get("content_type") or item.get("content_kind") or "post")

        # 0. template_use_case fallback (required for renderer routing + ICS)
        if not str(item.get("template_use_case") or "").strip():
            if "story" in content_type:
                item["template_use_case"] = "daily_story"
            elif "reel" in content_type:
                item["template_use_case"] = "tasting_experience"
            else:
                item["template_use_case"] = "product_highlight"

        # 1. visual_production_spec.selected_gallery_url
        vps = item.get("visual_production_spec")
        if not isinstance(vps, dict):
            vps = {}
            item["visual_production_spec"] = vps
        sel = vps.get("selected_gallery_url")
        if (not sel or not str(sel).strip()) and gallery:
            vps["selected_gallery_url"] = pick_gallery(content_type)
        elif isinstance(sel, str) and sel.strip():
            used_by_type.setdefault(content_type, set()).add(sel.strip())
        if not vps.get("treatment"):
            vps["treatment"] = "pure_photo"

        # ── event_details: enforce for story_event / event_announcement ────────
        treatment = vps.get("treatment", "")
        if treatment in ("story_event", "event_announcement", "campaign_offer"):
            ed = item.get("event_details")
            if not isinstance(ed, dict):
                ed = {}
            # Derive from text_layers or top-level fields when agent skipped event_details
            tl = vps.get("text_layers") if isinstance(vps.get("text_layers"), dict) else {}
            # Fill missing event detail fields with sensible fallbacks
            if not ed.get("venue_name"):
                ed["venue_name"] = brand.business_name
            if not ed.get("venue_area"):
                ed["venue_area"] = getattr(brand, "location", "") or ""
            if not ed.get("date") and tl.get("event_date"):
                ed["date"] = str(tl["event_date"])
            if not ed.get("tagline") and tl.get("subtitle"):
                ed["tagline"] = str(tl["subtitle"])[:40]
            if not ed.get("cta_text"):
                cta = str(item.get("cta") or tl.get("cta") or "").strip()
                if cta:
                    ed["cta_text"] = cta[:25]
                else:
                    from app.crew.cta_localization import resolve_language_code
                    lang = resolve_language_code(getattr(brand, "languages", None))
                    default_ctas = getattr(brand, "default_ctas", None) or []
                    if isinstance(default_ctas, str):
                        try:
                            import json as _json
                            default_ctas = _json.loads(default_ctas)
                        except Exception:
                            default_ctas = []
                    if isinstance(default_ctas, list) and default_ctas:
                        ed["cta_text"] = str(default_ctas[0])[:25]
                    elif lang == "en":
                        ed["cta_text"] = "Learn More"
                    else:
                        ed["cta_text"] = "Daha Fazla"
            # audio_mood: derive from idea mood if missing
            if not ed.get("audio_mood"):
                mood_val = str(item.get("mood") or item.get("tone") or "").lower()
                if any(x in mood_val for x in ("dj", "night", "party", "club", "dance")):
                    ed["audio_mood"] = "deep house"
                elif any(x in mood_val for x in ("jazz", "live", "band", "acoustic")):
                    ed["audio_mood"] = "lounge jazz"
                elif any(x in mood_val for x in ("beach", "summer", "tropical", "latin")):
                    ed["audio_mood"] = "beach pop"
                elif any(x in mood_val for x in ("chill", "relax", "ambient", "calm")):
                    ed["audio_mood"] = "ambient chill"
                else:
                    ed["audio_mood"] = "upbeat commercial"
            # category_label from VPS or derive from treatment
            if not ed.get("category_label"):
                cat = str(vps.get("category_label") or tl.get("category", "") or "").strip().upper()
                if not cat:
                    from app.crew.cta_localization import resolve_language_code
                    lang = resolve_language_code(getattr(brand, "languages", None))
                    if lang == "en":
                        cat = "EVENT" if treatment == "story_event" else "CAMPAIGN" if treatment == "campaign_offer" else "ANNOUNCEMENT"
                    else:
                        cat = "EVENT" if treatment == "story_event" else "KAMPANYA" if treatment == "campaign_offer" else "DUYURU"
                ed["category_label"] = cat
            item["event_details"] = ed
            # Mirror top-level cta from event_details for easy access
            if not item.get("cta") and ed.get("cta_text"):
                item["cta"] = ed["cta_text"]
            # Auto-populate cta_url from brand website when CTA implies booking/reservation
            if not ed.get("cta_url"):
                cta_lower = ed.get("cta_text", "").lower()
                booking_keywords = ("rezerv", "bilet", "kayıt", "reserve", "book", "ticket", "register", "katıl", "join")
                if any(k in cta_lower for k in booking_keywords):
                    website = getattr(brand, "website_url", "") or ""
                    ed["cta_url"] = website
            item["event_details"] = ed

        # image_edit_prompt — content-type aware fallback for better visual direction
        if not str(vps.get("image_edit_prompt") or "").strip():
            vd = str(item.get("visual_direction") or item.get("image_prompt") or "").strip()
            content_t = content_type.lower()
            if "reel" in content_t:
                fallback_prompt = (
                    f"Cinematic color grade for {brand.business_name} reel: "
                    "warm golden tones, lift shadows, maintain venue atmosphere. "
                    "Shot on cinema lens, brand-true palette. No text."
                )
            elif "story" in content_t:
                fallback_prompt = (
                    f"Editorial story enhancement for {brand.business_name}: "
                    "rich saturation, soft vignette, brand color harmony. "
                    "9:16 optimized composition. No text overlay."
                )
            else:
                fallback_prompt = (
                    f"Editorial enhancement for {brand.business_name}: natural color grade, "
                    "lift shadows, brand-true tones. No text overlay."
                )
            vps["image_edit_prompt"] = vd or fallback_prompt

        # reel_motion_spec: normalize and mirror to top level for auto-produce
        if "reel" in content_type.lower():
            reel_spec = vps.get("reel_motion_spec")
            # Validate camera_movement is from the unified enum
            _VALID_MOTIONS = frozenset({
                "static", "slow_pan", "dolly_in", "dolly_out",
                "orbit", "tracking", "handheld", "tilt_up", "tilt_down",
            })
            if isinstance(reel_spec, dict) and reel_spec.get("camera_movement"):
                raw_cam = str(reel_spec["camera_movement"]).lower().replace(" ", "_").replace("-", "_")
                # Map legacy values → unified enum
                _LEGACY_MAP = {
                    "slow_zoom_in": "dolly_in", "zoom_in": "dolly_in", "push_in": "dolly_in",
                    "drift_left": "slow_pan", "drift_right": "slow_pan",
                    "aerial": "tilt_up", "pan": "slow_pan", "zoom": "dolly_in",
                    "slow_dolly_in": "dolly_in", "slow_push_in": "dolly_in",
                }
                cam = _LEGACY_MAP.get(raw_cam, raw_cam)
                reel_spec["camera_movement"] = cam if cam in _VALID_MOTIONS else "dolly_in"

            if not isinstance(reel_spec, dict) or not reel_spec or "camera_movement" not in reel_spec:
                # ── Sector + mood based decision tree ──────────────────────────
                mood_val = str(item.get("mood") or item.get("tone") or "").lower()
                sector = str(getattr(brand, "business_type", "") or "").lower()
                template_use = str(item.get("template_use_case") or "").lower()

                # Camera motion by sector archetype
                if any(x in sector for x in ("hotel", "resort", "boutique")):
                    cam = "dolly_in"
                    pace = "slow"
                    audio = "ambient hotel"
                elif any(x in sector for x in ("beach", "sea", "marina", "yacht")):
                    cam = "slow_pan"
                    pace = "slow"
                    audio = "deep_house 100bpm"
                elif any(x in sector for x in ("cafe", "coffee", "bakery", "food")):
                    cam = "orbit"
                    pace = "slow"
                    audio = "acoustic_chill 85bpm"
                elif any(x in sector for x in ("fitness", "sport", "gym", "wellness")):
                    cam = "tracking"
                    pace = "dynamic"
                    audio = "energetic 130bpm"
                elif any(x in sector for x in ("artisan", "local", "craft", "market")):
                    cam = "dolly_in"
                    pace = "slow"
                    audio = "organic_folk 90bpm"
                elif any(x in sector for x in ("night", "club", "bar", "event")):
                    cam = "tracking"
                    pace = "dynamic"
                    audio = "electronic 120bpm"
                else:
                    cam = "dolly_in"
                    pace = "medium"
                    audio = "ambient"

                # Mood overrides sector (more specific signal)
                if any(x in mood_val for x in ("sunset", "golden", "sky", "horizon")):
                    cam = "slow_pan"
                    pace = "slow"
                elif any(x in mood_val for x in ("event", "party", "crowd", "festive")):
                    cam = "tracking"
                    pace = "dynamic"
                elif any(x in mood_val for x in ("product", "detail", "close")):
                    cam = "orbit"
                    pace = "slow"
                elif any(x in mood_val for x in ("luxury", "elegant", "premium", "sophisticated")):
                    cam = "dolly_in"
                    pace = "slow"

                # Template use case override
                if "event" in template_use or "announcement" in template_use:
                    cam = "dolly_in"

                vps["reel_motion_spec"] = {
                    "camera_movement": cam,
                    "pace": pace,
                    "transition_style": "smooth_dissolve" if pace == "slow" else "cut",
                    "audio_mood": audio,
                }
            # Mirror at top level so auto-produce can read either location
            item["reel_motion_spec"] = vps["reel_motion_spec"]

        # 2. canva_field_copy — synthesise when missing/empty
        cfc = item.get("canva_field_copy")
        if not isinstance(cfc, dict) or not any(
            isinstance(v, str) and v.strip() for v in cfc.values()
        ):
            headline = str(item.get("headline") or item.get("concept_title") or item.get("title") or "").strip()
            if not headline:
                # Derive a short headline from the caption's first words (stories
                # often omit an explicit headline but ICS/Canva still need one).
                caption = str(item.get("caption_draft") or item.get("caption") or "").strip()
                words = caption.split()
                headline = " ".join(words[:6]).rstrip(".,!?:;") if words else ""
            cta = str(item.get("cta") or "").strip()
            subtitle = str(item.get("strategic_purpose") or "").strip()
            synthesised: dict[str, str] = {}
            if headline:
                synthesised["headline"] = headline[:_CANVA_HEADLINE_MAX]
            if cta:
                synthesised["cta"] = cta[:_CANVA_CTA_MAX]
            if subtitle:
                synthesised["subtitle"] = subtitle[:_CANVA_SUBTITLE_MAX]
            if synthesised:
                item["canva_field_copy"] = synthesised

        # 3. asset_intent default
        if not str(item.get("asset_intent") or "").strip():
            tuc = str(item.get("template_use_case") or "").lower()
            if "event" in tuc or "announce" in tuc:
                item["asset_intent"] = "event_photo"
            elif "product" in tuc or "menu" in tuc or "drink" in tuc or "food" in tuc:
                item["asset_intent"] = "product_image"
            else:
                item["asset_intent"] = "venue_reference"

    return concepts


def _run_revision_pass(
    brand: BrandInfo,
    original_output: str,
    revision_prompt: str,
    llm: Any,
) -> tuple[str | None, int]:
    """
    Run a targeted revision pass. Instead of a full CrewAI re-run (expensive),
    we use a single LLM call with the original output + error report to produce
    a corrected version. Cost: ~1/3 of a full ideation run.
    """
    from openai import OpenAI
    from app.config import get_settings

    settings = get_settings()
    try:
        client = OpenAI(api_key=settings.openai_api_key)
        system_msg = (
            "You are a content quality reviewer. You receive a JSON array of content ideas "
            "and a quality report listing issues. Fix ONLY the flagged issues — do not change "
            "pieces that passed. Return the corrected JSON array only, no explanation."
        )
        lang_label = resolve_output_language(brand.languages)
        user_msg = (
            f"## Required output language: {lang_label}\n"
            f"ALL text fields (headline, caption_draft, caption_draft_alt, cta, subline) "
            f"MUST be native {lang_label}. Never leave Turkish copy when {lang_label} is required.\n\n"
            f"## Original output:\n```json\n{original_output[:8000]}\n```\n\n"
            f"## Quality issues found:\n{revision_prompt}\n\n"
            f"Brand: {brand.business_name} ({brand.business_type})\n"
            f"Fix the issues and return the corrected JSON array."
        )
        response = client.chat.completions.create(
            model=settings.openai_lite_model or "gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.4,
            max_tokens=4000,
        )
        revised = response.choices[0].message.content or ""
        tokens = (response.usage.total_tokens if response.usage else 0)
        return revised, tokens
    except Exception:
        return None, 0


def _run_single_ideation(
    brand: BrandInfo,
    count: int,
    time_period: str,
    brief: str,
    content_pillars: list[str] | None,
    autonomy_mode: bool,
    llm: Any,
) -> tuple[str, int]:
    """Single ideation run — returns (raw_output, tokens_used)."""
    content_agent = create_content_agent(brand, llm=llm, for_ideation=True)
    ideation_task = create_content_ideation_task(
        content_agent, brand, count, time_period,
        brief=brief, content_pillars=content_pillars, autonomy_mode=autonomy_mode,
    )
    crew = Crew(
        agents=[content_agent], tasks=[ideation_task],
        process=Process.sequential, verbose=get_settings().crew_verbose,
    )
    result = crew.kickoff()
    return str(result), total_tokens_from_crew(crew)


def _pick_better_output(output_a: str, output_b: str, brand: BrandInfo) -> str:
    """
    Compare two ideation outputs and return the better one.
    Uses consistency check scores + concept count as quality signal.
    """
    def score(raw: str) -> float:
        s = 0.0
        try:
            m = re.search(r"\[.*\]", raw, re.DOTALL)
            if not m:
                return 0.0
            concepts = json.loads(m.group())
            s += len(concepts) * 2  # more valid concepts = better
            # Check diversity of hook types
            hooks = {c.get("caption_hook_type", "") for c in concepts if c.get("caption_hook_type")}
            s += len(hooks) * 3
            # Check visual_production_spec presence
            has_vps = sum(1 for c in concepts if c.get("visual_production_spec"))
            s += has_vps * 2
            # Penalise missing required fields
            for c in concepts:
                if not c.get("caption_draft"):
                    s -= 3
                if not c.get("hashtags"):
                    s -= 1
        except Exception:
            pass
        return s

    return output_a if score(output_a) >= score(output_b) else output_b


def run_content_ideation(
    brand: BrandInfo,
    count: int = 7,
    time_period: str = "next week",
    brief: str = "",
    content_pillars: list[str] | None = None,
    autonomy_mode: bool = False,
    strategy_action_id: str = "",
    llm: LLM | None = None,
    iterations: int = 1,
) -> dict[str, Any]:
    """
    Generate content concepts for a brand.

    iterations=2 → runs twice, picks the better output (higher quality, ~2x cost).
    iterations=1 → single run (default, backward compatible).
    """
    settings = get_settings()

    raw_output_a, tokens_a = _run_single_ideation(
        brand, count, time_period, brief, content_pillars, autonomy_mode, llm
    )
    total_tokens = tokens_a

    if iterations >= 2:
        raw_output_b, tokens_b = _run_single_ideation(
            brand, count, time_period, brief, content_pillars, autonomy_mode, llm
        )
        total_tokens += tokens_b
        raw_output = _pick_better_output(raw_output_a, raw_output_b, brand)
        iteration_used = 2
    else:
        raw_output = raw_output_a
        iteration_used = 1

    # ── Hard quality gate with auto-revision ────────────────────────────
    consistency_report = None
    revision_used = False
    try:
        json_match = re.search(r"\[.*\]", raw_output, re.DOTALL)
        if json_match:
            concepts = json.loads(json_match.group())
            concepts = harmonize_content_concepts(concepts, brand.languages)
            concepts = _enforce_idea_completeness(concepts, brand)
            pillars_for_batch = content_pillars or brand.content_pillars
            concepts, pillars_filled = enforce_confirmed_pillar_coverage(
                concepts, pillars_for_batch,
            )
            if pillars_filled:
                logger.info(
                    "pillar_coverage_enforced",
                    filled=pillars_filled,
                    tenant=getattr(brand, "tenant_id", "unknown"),
                )
            raw_output = json.dumps(concepts, ensure_ascii=False)
            report = check_weekly_content(
                concepts=concepts,
                content_pillars=pillars_for_batch,
                brand_ctas=brand.default_ctas,
                brand_languages=brand.languages,
            )

            has_errors = any(i.severity == "error" for i in report.issues)
            has_lang_errors = any(
                i.severity == "error" and i.check == "brand_output_language"
                for i in report.issues
            )

            if has_errors and (count >= 3 or has_lang_errors):
                revision_prompt = report.to_prompt_block()
                revised_output, revision_tokens = _run_revision_pass(
                    brand, raw_output, revision_prompt, llm,
                )
                total_tokens += revision_tokens

                if revised_output:
                    revised_match = re.search(r"\[.*\]", revised_output, re.DOTALL)
                    if revised_match:
                        revised_concepts = json.loads(revised_match.group())
                        revised_concepts = harmonize_content_concepts(revised_concepts, brand.languages)
                        revised_concepts = _enforce_idea_completeness(revised_concepts, brand)
                        revised_concepts, _ = enforce_confirmed_pillar_coverage(
                            revised_concepts, pillars_for_batch,
                        )
                        revised_output = json.dumps(revised_concepts, ensure_ascii=False)
                        revised_report = check_weekly_content(
                            concepts=revised_concepts,
                            content_pillars=pillars_for_batch,
                            brand_ctas=brand.default_ctas,
                            brand_languages=brand.languages,
                        )
                        if revised_report.passed or len(revised_report.issues) < len(report.issues):
                            raw_output = revised_output
                            report = revised_report
                            revision_used = True

            # Per-piece quality scores
            quality_scores = score_batch(concepts, brand.default_ctas)
            avg_score = sum(s["overall"] for s in quality_scores) / len(quality_scores) if quality_scores else 0

            consistency_report = {
                "passed": report.passed,
                "summary": report.summary,
                "stats": {
                    **report.stats,
                    "pillar_coverage": pillar_coverage_stats(concepts, pillars_for_batch),
                    "pillars_filled_by_enforcement": pillars_filled,
                },
                "issues": [
                    {"severity": i.severity, "check": i.check, "description": i.description, "suggestion": i.suggestion}
                    for i in report.issues
                ],
                "revision_applied": revision_used,
                "quality_scores": quality_scores,
                "avg_quality_score": round(avg_score, 1),
                "batch_grade": "A" if avg_score >= 80 else "B" if avg_score >= 60 else "C" if avg_score >= 40 else "D",
            }
    except Exception as _qe:
        logger.warning(
            "content_quality_gate_failed",
            error=str(_qe)[:300],
            tenant=getattr(brand, "tenant_id", "unknown"),
        )

    return {
        "crew_name": "content_crew",
        "task_type": "content_ideation",
        "status": "completed",
        "raw_output": raw_output,
        "agent_role": "content_agent",
        "consistency_report": consistency_report,
        "parameters": {
            "count": count,
            "time_period": time_period,
            "brief": brief,
            "content_pillars": content_pillars or [],
            "autonomy_mode": autonomy_mode,
            "strategy_action_id": strategy_action_id,
            "iterations": iteration_used,
        },
        "iterations_used": iteration_used,
        "revision_used": revision_used,
        "tokens_used": total_tokens,
    }


def run_content_calendar(
    brand: BrandInfo,
    duration_days: int = 7,
    frequency: str = "daily",
    llm: LLM | None = None,
) -> dict[str, Any]:
    """Generate a content calendar for a brand."""
    content_agent = create_content_agent(brand, llm=llm, for_calendar=True)
    calendar_task = create_content_calendar_task(content_agent, brand, duration_days, frequency)

    crew = Crew(
        agents=[content_agent],
        tasks=[calendar_task],
        process=Process.sequential,
        verbose=get_settings().crew_verbose,
    )

    result = crew.kickoff()

    return {
        "crew_name": "content_crew",
        "task_type": "content_calendar",
        "status": "completed",
        "raw_output": str(result),
        "agent_role": "content_agent",
        "parameters": {"duration_days": duration_days, "frequency": frequency},
        "tokens_used": total_tokens_from_crew(crew),
    }
