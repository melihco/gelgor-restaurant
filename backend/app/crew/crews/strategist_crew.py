"""
Strategist Crew — produces MissionProposal[] from brand intelligence signals.

Input:  BrandInfo (carries all intelligence: brand_dna, competitor_pulse,
        market_opportunity_ideas, industry_calendar, social_signals, trend_brief,
        learning_context — all already injected from the Python DB)
Output: list[dict] — parsed MissionProposal objects, ready for mission_service.create_mission()

The output is validated against the MissionCreate schema before returning so
malformed LLM output never reaches the database.
"""

from __future__ import annotations

import json
import re
from typing import Any

import structlog
from crewai import Crew, LLM, Process, Task

from app.config import get_settings
from app.crew.agents.strategist_agent import create_strategist_agent
from app.crew.context import BrandInfo
from app.crew.prompts.strategist_prompts import STRATEGIST_TASK_PROMPT
from app.crew.token_usage import total_tokens_from_crew

logger = structlog.get_logger()


# ── Valid agent/task combinations (mirrors engine.py AGENT_ROLES) ────────────
_VALID_AGENT_TASKS: dict[str, list[str]] = {
    "review_agent":           ["review_analysis", "single_review_response"],
    "content_agent":          ["content_ideation", "content_calendar", "visual_design_cards"],
    "content_strategy_agent": ["content_strategy"],
    "ads_agent":              ["campaign_analysis", "ad_creative_generation",
                               "auto_budget_optimize", "ads_budget_optimization"],
    "analytics_agent":        ["traffic_analysis", "conversion_report", "weekly_performance"],
}
_VALID_MISSION_TYPES = {"seasonal", "opportunity", "competitive", "recovery", "manual"}
_VALID_PRIORITIES    = {"critical", "high", "medium", "low"}


# ── Signals summary builder ───────────────────────────────────────────────────

def _build_signals_summary(brand: BrandInfo) -> str:
    """
    Build a rich, multi-angle signal summary for the StrategistAgent.

    Structure:
      1. Recently done / anti-repeat context (from learning_context injected by strategist_service)
      2. Current intelligence signals (competitor, trends, opportunities, season)
      3. Gap analysis — what's MISSING or underdeveloped
      4. Brand health signals (Google rating, social mentions)
    """
    parts: list[str] = []

    # ── Recently done (injected by strategist_service._load_recent_mission_context) ──
    lc = brand.learning_context or ""
    if "SON ÖNERİLEN" in lc or "SON 3 HAFTADA" in lc:
        # Extract just the anti-repeat block (already formatted)
        recent_block = ""
        for section in lc.split("\n\n"):
            if "SON ÖNERİLEN" in section or "SON 3 HAFTADA" in section:
                recent_block += section + "\n\n"
        if recent_block:
            parts.append(recent_block.strip())

    # ── Competitor intelligence ────────────────────────────────────────────────
    if brand.competitor_pulse:
        has_real_data = (
            "no direct competitor" not in brand.competitor_pulse.lower() and
            "not available" not in brand.competitor_pulse.lower()
        )
        if has_real_data:
            parts.append(f"📊 RAKİP AKTİVİTESİ:\n{brand.competitor_pulse[:600]}")
        else:
            parts.append(
                "📊 RAKİP DURUMU: Henüz rakip hesapları tanımlanmamış. "
                "Bu bir AÇIK — rakiplerin yapmadığı içerik formatları için RAKIP_BOŞLUĞU misyonu öner."
            )
    else:
        parts.append("📊 RAKİP DURUMU: Veri yok — rakip boşluğu fırsatı varsay.")

    # ── Market opportunities ───────────────────────────────────────────────────
    if brand.market_opportunity_ideas:
        try:
            ideas = json.loads(brand.market_opportunity_ideas)
            if isinstance(ideas, list) and ideas:
                urgent = [i for i in ideas if isinstance(i, dict) and i.get("urgency") in ("today", "this_week")]
                if urgent:
                    parts.append("⚡ ACİL PAZAR FIRSATLARI:")
                    for i in urgent[:3]:
                        parts.append(f"  - [{i.get('urgency','').upper()}] {i.get('title','')} — {i.get('why_now','')[:100]}")
        except Exception:
            pass

    # ── Industry calendar ─────────────────────────────────────────────────────
    if brand.industry_calendar:
        try:
            cal = json.loads(brand.industry_calendar)
            phase = cal.get("current_phase", {})
            triggers = cal.get("upcoming_triggers", [])
            weekly = cal.get("weekly_rhythms", {})

            phase_name = phase.get("name", "")
            urgency    = phase.get("urgency_level", "LOW")
            key_msg    = phase.get("key_message", "")
            posture    = phase.get("content_posture", "")

            if phase_name:
                parts.append(
                    f"📅 SEKTÖR FAZASI: {phase_name} (aciliyet: {urgency})\n"
                    f"   Mesaj: {key_msg}\n"
                    f"   İçerik duruşu: {posture}"
                )

            if triggers:
                upcoming = [t for t in triggers[:4] if t.get("name")]
                if upcoming:
                    parts.append("🗓 YAKLAŞAN TETİKLEYİCİLER (önceden hazırlan):")
                    for t in upcoming:
                        lead = t.get("lead_time_days", "?")
                        opp  = t.get("content_opportunity", "")[:80]
                        parts.append(f"  - {t['name']} (hazırlık: {lead} gün) → {opp}")

            if weekly.get("best_posting_days"):
                parts.append(f"📆 En iyi yayın günleri: {', '.join(weekly['best_posting_days'])}")
        except Exception:
            pass

    # ── Trend intelligence ─────────────────────────────────────────────────────
    if brand.trend_brief:
        parts.append(f"📈 TREND BRIEF (bu hafta):\n{brand.trend_brief[:500]}")

    # ── Social listening ───────────────────────────────────────────────────────
    if brand.social_signals:
        try:
            ss = json.loads(brand.social_signals)
            mentions  = ss.get("total_mentions", 0)
            negatives = ss.get("negative_count", 0)
            positive  = ss.get("positive_count", 0)
            top_sources = ss.get("top_sources", [])
            if mentions or negatives:
                parts.append(
                    f"🔔 SOSYAL DİNLEME: {mentions} bahis (👍{positive} / 👎{negatives})"
                    + (f" — kaynak: {', '.join(top_sources[:3])}" if top_sources else "")
                )
        except Exception:
            pass

    # ── Brand health ───────────────────────────────────────────────────────────
    if brand.google_rating:
        rating = float(brand.google_rating)
        health = "iyi" if rating >= 4.2 else "geliştirilebilir" if rating >= 3.5 else "kritik"
        parts.append(
            f"⭐ GOOGLE SAĞLIĞI: {brand.google_rating}/5 ({brand.google_review_count or 0} yorum) — {health}"
        )
        if rating < 4.0:
            parts.append("   → SOSYAL_KANIT misyonu öncelikli: yorum yanıtlama + pozitif içerik")

    # ── Gap analysis ──────────────────────────────────────────────────────────
    gaps = []
    if not brand.competitor_pulse or "not available" in (brand.competitor_pulse or "").lower():
        gaps.append("rakip takibi yok (RAKIP_BOŞLUĞU açığı)")
    if brand.google_review_count and int(brand.google_review_count) > 0:
        # Check if we have unanswered reviews signal
        if brand.google_review_signals:
            unanswered = [r for r in brand.google_review_signals if r.get("stars", 5) <= 3]
            if unanswered:
                gaps.append(f"{len(unanswered)} düşük puanlı yorum yanıtsız (SOSYAL_KANIT açığı)")

    if not brand.content_pillars:
        gaps.append("içerik sütunları tanımlanmamış (İÇERİK_AÇIĞI)")

    if gaps:
        parts.append("🔍 TESPİT EDİLEN AÇIKLAR:\n" + "\n".join(f"  - {g}" for g in gaps))

    if not parts:
        # Build rich fallback from basic brand data so the agent has something to work with
        btype   = brand.business_type or "local_business"
        tone    = brand.brand_tone or "samimi"
        pillars = brand.content_pillars or []
        audience = brand.target_audience or "yerel müşteriler"
        location = brand.location or ""

        fallback = (
            f"Sinyal verisi henüz toplanmamış. Aşağıdaki marka bilgilerine dayanarak "
            f"3 somut misyon öner:\n\n"
            f"İşletme türü: {btype}\n"
            f"Konum: {location or 'belirtilmemiş'}\n"
            f"Hedef kitle: {audience}\n"
            f"Ton: {tone}\n"
        )
        if pillars:
            fallback += f"İçerik sütunları: {', '.join(pillars[:5])}\n"
        if brand.instagram_bio:
            fallback += f"Instagram bio: {brand.instagram_bio}\n"

        fallback += (
            "\nÖnerilen misyon çerçevesi:\n"
            "1. İÇERİK_MİSYONU — sosyal medya içerik üretimi ve marka bilinirliği\n"
            "2. DÖNÜŞÜM_MİSYONU — satış/ziyaretçi artırma odaklı kampanya\n"
            "3. SOSYAL_KANIT_MİSYONU — müşteri yorumları ve UGC içeriği\n"
            "\nHer misyon için somut task_nodes üret."
        )
        parts.append(fallback)

    return "\n".join(parts)


# ── Main crew runner ─────────────────────────────────────────────────────────

def run_mission_planning(
    brand: BrandInfo,
    llm: LLM | None = None,
) -> dict[str, Any]:
    """
    Run the StrategistAgent and return parsed MissionProposal dicts.

    Returns:
      {
        "crew_name": "strategist_crew",
        "task_type": "mission_planning",
        "status": "completed",
        "proposals": list[dict],   ← validated MissionProposal-shaped dicts
        "raw_output": str,
        "tokens_used": int,
      }
    """
    settings = get_settings()
    signals_summary = _build_signals_summary(brand)

    agent = create_strategist_agent(brand, llm=llm)

    from datetime import datetime, timezone as _tz
    _now = datetime.now(_tz.utc)
    _TR_MONTHS = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran",
                  "Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"]
    _TR_DAYS   = ["Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi","Pazar"]
    _current_date = (
        f"{_now.day} {_TR_MONTHS[_now.month-1]} {_now.year}, "
        f"{_TR_DAYS[_now.weekday()]} (ISO: {_now.strftime('%Y-%m-%d')})"
    )

    task_description = STRATEGIST_TASK_PROMPT.format(
        business_name=brand.business_name,
        signals_summary=signals_summary,
        current_date=_current_date,
    )

    planning_task = Task(
        description=task_description,
        expected_output=(
            "A JSON array of 2-3 MissionProposal objects. Each proposal must contain: "
            "title, type, trigger_signal, trigger_evidence, objective, timeline_days, "
            "creative_brief, phases (list), task_nodes (list with node_key, phase_index, "
            "title, task_type, agent_role, input_data, depends_on), assigned_agent_roles, "
            "priority, confidence, rationale, expected_outcome. "
            "Return ONLY the JSON array, no prose."
        ),
        agent=agent,
    )

    crew = Crew(
        agents=[agent],
        tasks=[planning_task],
        process=Process.sequential,
        verbose=settings.crew_verbose,
    )

    result = crew.kickoff()
    raw_output = str(result)

    proposals = _parse_proposals(raw_output)

    # ── Post-LLM diversity gate ──────────────────────────────────────────
    diversity_report = _check_proposal_diversity(proposals, brand)
    if diversity_report["duplicates_removed"] > 0:
        logger.warning(
            "mission_diversity_filtered",
            removed=diversity_report["duplicates_removed"],
            kept=len(proposals) - diversity_report["duplicates_removed"],
        )
    proposals = diversity_report["filtered_proposals"]

    logger.info(
        "mission_planning_complete",
        business=brand.business_name,
        proposals_count=len(proposals),
    )

    return {
        "crew_name":   "strategist_crew",
        "task_type":   "mission_planning",
        "status":      "completed",
        "proposals":   proposals,
        "raw_output":  raw_output,
        "tokens_used": total_tokens_from_crew(crew),
        "diversity_report": diversity_report,
    }


# ── Post-LLM diversity validation ─────────────────────────────────────────────

def _title_jaccard(a: str, b: str) -> float:
    """Word-overlap Jaccard similarity between two titles."""
    wa = set(a.lower().split())
    wb = set(b.lower().split())
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / len(wa | wb)


def _check_proposal_diversity(
    proposals: list[dict],
    brand: BrandInfo,
) -> dict:
    """
    Enforce diversity rules AFTER the LLM has produced proposals:

    1. Inter-proposal uniqueness: no two proposals share >50% title words
    2. Trigger signal variety: no two proposals use the same trigger_signal
    3. Anti-repeat vs recent missions: check learning_context for overlap

    Returns filtered proposals list + a report dict.
    """
    if len(proposals) <= 1:
        return {"filtered_proposals": proposals, "duplicates_removed": 0, "reasons": []}

    # Extract recent mission titles from learning_context
    recent_titles: list[str] = []
    lc = brand.learning_context or ""
    for line in lc.split("\n"):
        stripped = line.strip()
        if stripped.startswith("-") or stripped.startswith("•"):
            recent_titles.append(stripped.lstrip("-•").strip().lower())

    kept: list[dict] = []
    removed_reasons: list[str] = []
    seen_signals: set[str] = set()

    for p in proposals:
        title = p.get("title", "").strip()
        signal = p.get("trigger_signal", "").strip().lower()
        title_lower = title.lower()

        # Check against already-kept proposals
        too_similar = False
        for k in kept:
            if _title_jaccard(title_lower, k["title"].lower()) > 0.50:
                removed_reasons.append(f"Title too similar: '{title}' ≈ '{k['title']}'")
                too_similar = True
                break

        if too_similar:
            continue

        # Check against recent mission titles
        for rt in recent_titles:
            if _title_jaccard(title_lower, rt) > 0.45:
                removed_reasons.append(f"Repeats recent mission: '{title}' ≈ '{rt}'")
                too_similar = True
                break

        if too_similar:
            continue

        # Enforce trigger signal variety
        signal_base = signal.split(".")[0] if "." in signal else signal
        if signal_base in seen_signals and len(kept) >= 1:
            removed_reasons.append(f"Duplicate trigger signal '{signal_base}': '{title}'")
            continue

        kept.append(p)
        if signal_base:
            seen_signals.add(signal_base)

    return {
        "filtered_proposals": kept,
        "duplicates_removed": len(proposals) - len(kept),
        "reasons": removed_reasons,
    }


# ── Output parsing & validation ───────────────────────────────────────────────

def _parse_proposals(raw: str) -> list[dict]:
    """
    Extract and validate MissionProposal dicts from raw LLM output.

    Tries in order:
    1. Direct JSON parse (clean output)
    2. Extract from ```json ... ``` code block
    3. Find first [...] array in prose
    """
    # Try direct parse
    try:
        parsed = json.loads(raw.strip())
        if isinstance(parsed, list):
            return _validate_proposals(parsed)
    except json.JSONDecodeError:
        pass

    # Try code block extraction
    block_match = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", raw, re.DOTALL)
    if block_match:
        try:
            parsed = json.loads(block_match.group(1))
            if isinstance(parsed, list):
                return _validate_proposals(parsed)
        except json.JSONDecodeError:
            pass

    # Try finding any JSON array in the text
    array_match = re.search(r"\[.*\]", raw, re.DOTALL)
    if array_match:
        try:
            parsed = json.loads(array_match.group())
            if isinstance(parsed, list):
                return _validate_proposals(parsed)
        except json.JSONDecodeError:
            pass

    logger.warning("strategist_parse_failed", raw_preview=raw[:300])
    return []


def _validate_node(node: dict, existing_keys: set[str]) -> dict | None:
    """Validate and normalise a single task node dict."""
    node_key  = str(node.get("node_key", "")).strip()
    task_type = str(node.get("task_type", "")).strip()
    agent_role = str(node.get("agent_role", "")).strip()

    if not node_key:
        return None

    # Validate agent/task combination
    if agent_role not in _VALID_AGENT_TASKS:
        agent_role = "content_agent"
    valid_tasks = _VALID_AGENT_TASKS[agent_role]
    if task_type not in valid_tasks:
        task_type = valid_tasks[0]
        logger.warning("strategist_node_task_type_corrected",
                       node_key=node_key, corrected_to=task_type)

    # Validate depends_on: remove self-reference and unknown keys
    raw_deps = node.get("depends_on") or []
    if not isinstance(raw_deps, list):
        raw_deps = []
    depends_on = [d for d in raw_deps if d != node_key and d in existing_keys]

    phase_index = int(node.get("phase_index", 0))
    input_data  = node.get("input_data") or {}
    if not isinstance(input_data, dict):
        input_data = {"brief": str(input_data)}

    return {
        "node_key":    node_key,
        "phase_index": phase_index,
        "title":       str(node.get("title", node_key))[:500],
        "task_type":   task_type,
        "agent_role":  agent_role,
        "input_data":  input_data,
        "depends_on":  depends_on,
        "brief_override": node.get("brief_override"),
    }


def _validate_proposals(items: list) -> list[dict]:
    """Filter, validate, and normalise raw proposal dicts from the LLM."""
    valid = []

    for item in items:
        if not isinstance(item, dict):
            continue

        mission_type = str(item.get("type", "manual")).lower()
        if mission_type not in _VALID_MISSION_TYPES:
            mission_type = "manual"

        priority = str(item.get("priority", "high")).lower()
        if priority not in _VALID_PRIORITIES:
            priority = "high"

        title = str(item.get("title", "")).strip()
        if not title:
            continue

        objective      = str(item.get("objective",      ""))[:500]
        creative_brief = str(item.get("creative_brief", ""))[:1000]
        trigger_signal = str(item.get("trigger_signal", "intelligence"))[:200]
        trigger_evidence = str(item.get("trigger_evidence", ""))[:500]

        # Validate task nodes
        raw_nodes = item.get("task_nodes") or []
        if not isinstance(raw_nodes, list) or not raw_nodes:
            continue

        # First pass: collect all node_keys
        all_keys = {str(n.get("node_key", "")) for n in raw_nodes if isinstance(n, dict)}

        # Second pass: validate each node
        nodes = []
        for raw_node in raw_nodes:
            if not isinstance(raw_node, dict):
                continue
            validated = _validate_node(raw_node, all_keys)
            if validated:
                nodes.append(validated)

        if not nodes:
            continue

        # Validate/normalise phases
        raw_phases = item.get("phases") or []
        phases = []
        if isinstance(raw_phases, list):
            for p in raw_phases:
                if isinstance(p, dict):
                    phases.append({
                        "index":       int(p.get("index", len(phases))),
                        "name":        str(p.get("name", f"Faz {len(phases)}"))[:100],
                        "description": str(p.get("description", ""))[:300],
                        "node_keys":   [str(k) for k in (p.get("node_keys") or [])],
                    })

        # Assigned roles from nodes
        assigned_roles = list({n["agent_role"] for n in nodes})

        try:
            confidence = float(item.get("confidence", 0.8))
            confidence = max(0.0, min(1.0, confidence))
        except (TypeError, ValueError):
            confidence = 0.8

        try:
            timeline_days = int(item.get("timeline_days", 14))
            timeline_days = max(3, min(90, timeline_days))
        except (TypeError, ValueError):
            timeline_days = 14

        valid.append({
            "title":              title,
            "type":               mission_type,
            "trigger_signal":     trigger_signal,
            "trigger_evidence":   trigger_evidence,
            "objective":          objective,
            "timeline_days":      timeline_days,
            "creative_brief":     creative_brief,
            "phases":             phases,
            "task_nodes":         nodes,
            "assigned_agent_roles": assigned_roles,
            "priority":           priority,
            "confidence":         confidence,
            "rationale":          str(item.get("rationale",       ""))[:500],
            "expected_outcome":   str(item.get("expected_outcome", ""))[:300],
        })

        if len(valid) >= 3:
            break

    return valid
