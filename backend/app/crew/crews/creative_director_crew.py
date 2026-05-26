"""
Creative Director Crew — brand safety post-processor.

Called AFTER the main agent execution and BEFORE human review.
Evaluates the generated content against brand standards and returns
a structured verdict.

The caller (orchestration.py) uses the verdict to:
  - auto_approve (confidence > AUTO_APPROVE_THRESHOLD and no violations)
  - route to human review with pre-filled notes
  - never block content production (errors here are non-fatal)

Content preview length: 3000 chars — enough for full ideation JSON or review text.
"""

from __future__ import annotations

import json
import re
from typing import Any

import structlog
from crewai import Crew, LLM, Process, Task

from app.config import get_settings
from app.crew.agents.creative_director_agent import create_creative_director_agent
from app.crew.context import BrandInfo
from app.crew.prompts.creative_director_prompts import CREATIVE_DIRECTOR_TASK
from app.crew.token_usage import total_tokens_from_crew

logger = structlog.get_logger()

# Confidence threshold for auto-approval (skips human review queue)
AUTO_APPROVE_THRESHOLD = 0.85

# Task types that go through brand safety review
REVIEWABLE_TASK_TYPES = frozenset({
    "content_ideation",
    "content_calendar",
    "content_strategy",
    "single_review_response",
    "visual_design_cards",
    "ad_creative_generation",
})


def _build_task_description(
    brand: BrandInfo,
    raw_output: str,
    task_type: str,
    agent_role: str,
) -> str:
    """Build the evaluation task prompt with brand-specific context blocks."""

    # Content preview — first 3000 chars of the raw output
    content_preview = raw_output[:3000].strip()
    if len(raw_output) > 3000:
        content_preview += "\n... [truncated for brevity]"

    # Risk rules block
    if brand.risk_rules:
        items = "\n".join(f"   - {k}: {v}" for k, v in brand.risk_rules.items())
        risk_block = f"Aşağıdaki konular insan onayı gerektirir — bu konulara değinen içerik REDDEDİLMELİ:\n{items}"
    else:
        risk_block = "Risk kuralı tanımlanmamış."

    # CTAs block
    if brand.default_ctas:
        ctas_block = "Onaylı CTA'lar: " + " | ".join(f'"{c}"' for c in brand.default_ctas[:6])
    else:
        ctas_block = "Onaylı CTA listesi tanımlanmamış — genel değerlendirme yap."

    # Custom rules block
    custom_block = brand.custom_rules[:400].strip() if brand.custom_rules else "Özel kural tanımlanmamış."

    # Visual DNA note
    vdna_note = ""
    if brand.visual_dna:
        vdna_note = f"\n   Görsel DNA (mekan analizi): {brand.visual_dna[:200]}"

    # Mission narrative block
    mission_block = ""
    if brand.mission_memory is not None:
        mm = brand.mission_memory
        mission_block = (
            f"5. KAMPANYA SÜREKLİLİĞİ:\n"
            f"   Aktif kampanya: {mm.mission_title} ({mm.mission_type})\n"
            f"   Ortak brief: {(mm.creative_brief or '')[:200]}\n"
            f"   Bu içerik kampanya narratifiyle tutarlı mı?"
        )

    return CREATIVE_DIRECTOR_TASK.format(
        task_type=task_type,
        agent_role=agent_role,
        content_preview=content_preview,
        risk_rules_block=risk_block,
        brand_tone=brand.brand_tone or "professional",
        visual_style=brand.visual_style or "",
        visual_dna_note=vdna_note,
        ctas_block=ctas_block,
        custom_rules_block=custom_block,
        mission_block=mission_block,
    )


def run_brand_safety_review(
    brand: BrandInfo,
    raw_output: str,
    task_type: str,
    agent_role: str,
    llm: LLM | None = None,
) -> dict[str, Any]:
    """
    Run the CreativeDirectorAgent and return a structured brand safety verdict.

    Always returns a dict — never raises. If the crew itself fails, returns a
    safe fallback that routes to human review.

    Return shape:
      {
        "approved": bool,
        "confidence": float (0.0–1.0),
        "violations": list[str],
        "notes": str,
        "strengths": list[str],
        "suggestions": list[str],
        "auto_approved": bool,      ← True when confidence > AUTO_APPROVE_THRESHOLD
        "review_required": bool,    ← opposite of auto_approved
        "tokens_used": int,
        "error": str | None,        ← set if crew execution failed
      }
    """
    if not raw_output or not raw_output.strip():
        return _fallback_verdict(reason="empty_output")

    settings = get_settings()

    try:
        agent = create_creative_director_agent(brand, llm=llm)
        task_description = _build_task_description(brand, raw_output, task_type, agent_role)

        review_task = Task(
            description=task_description,
            expected_output=(
                "A valid JSON object with exactly these fields: "
                "approved (bool), confidence (0.0-1.0), violations (list), "
                "notes (string), strengths (list), suggestions (list). "
                "Return ONLY the JSON object, no prose."
            ),
            agent=agent,
        )

        crew = Crew(
            agents=[agent],
            tasks=[review_task],
            process=Process.sequential,
            verbose=settings.crew_verbose,
        )

        result = crew.kickoff()
        tokens = total_tokens_from_crew(crew)
        verdict = _parse_verdict(str(result), tokens)

        logger.info(
            "creative_director_verdict",
            task_type=task_type,
            approved=verdict["approved"],
            confidence=verdict["confidence"],
            violations=len(verdict["violations"]),
            auto_approved=verdict["auto_approved"],
        )
        return verdict

    except Exception as exc:
        logger.warning(
            "creative_director_crew_failed",
            task_type=task_type,
            error=str(exc)[:300],
        )
        return _fallback_verdict(reason=str(exc)[:200])


def _parse_verdict(raw: str, tokens_used: int = 0) -> dict[str, Any]:
    """Extract and normalise the JSON verdict from the agent's raw output."""
    obj: dict[str, Any] | None = None

    # Direct JSON parse
    try:
        obj = json.loads(raw.strip())
    except json.JSONDecodeError:
        pass

    # Extract from code block
    if not obj:
        m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
        if m:
            try:
                obj = json.loads(m.group(1))
            except json.JSONDecodeError:
                pass

    # Extract first {...} from prose
    if not obj:
        m = re.search(r"\{[^{}]*\}", raw, re.DOTALL)
        if m:
            try:
                obj = json.loads(m.group())
            except json.JSONDecodeError:
                pass

    if not obj:
        logger.warning("creative_director_parse_failed", raw_preview=raw[:200])
        return _fallback_verdict(reason="parse_failed")

    # Normalise fields
    try:
        approved   = bool(obj.get("approved", True))
        confidence = float(obj.get("confidence", 0.75))
        confidence = max(0.0, min(1.0, confidence))
        violations = [str(v) for v in (obj.get("violations") or [])][:10]
        notes      = str(obj.get("notes", ""))[:500]
        strengths  = [str(s) for s in (obj.get("strengths") or [])][:8]
        suggestions = [str(s) for s in (obj.get("suggestions") or [])][:5]

        # Critical violations always force human review
        if violations:
            approved = False
            confidence = min(confidence, 0.65)

        auto_approved = approved and confidence >= AUTO_APPROVE_THRESHOLD

        return {
            "approved":       approved,
            "confidence":     round(confidence, 3),
            "violations":     violations,
            "notes":          notes,
            "strengths":      strengths,
            "suggestions":    suggestions,
            "auto_approved":  auto_approved,
            "review_required": not auto_approved,
            "tokens_used":    tokens_used,
            "error":          None,
        }
    except Exception as exc:
        return _fallback_verdict(reason=f"normalise_failed: {exc}")


def _fallback_verdict(reason: str = "unknown") -> dict[str, Any]:
    """
    Safe fallback when the CreativeDirectorAgent fails or output can't be parsed.
    Routes to human review (review_required=True) but doesn't block production.
    """
    return {
        "approved":       True,     # don't block production
        "confidence":     0.60,     # below auto-approve threshold → human review
        "violations":     [],
        "notes":          f"Yaratıcı direktör değerlendirmesi tamamlanamadı ({reason}). İnsan incelemesi önerilir.",
        "strengths":      [],
        "suggestions":    [],
        "auto_approved":  False,
        "review_required": True,
        "tokens_used":    0,
        "error":          reason,
    }
