"""
Industry Intelligence Service — generates sector-specific seasonal and contextual
intelligence for any tenant, regardless of industry.

This service does NOT hardcode industry rules. Instead it uses:
  1. GPT-4o to understand the industry's inherent rhythms and dynamics
  2. Perplexity to research current real-world context for this specific sector + location

The result is a structured IndustryCalendar that gets injected into every agent's
brand context prompt, making all agents aware of:
  - What "season" this business is in RIGHT NOW
  - Upcoming high-opportunity moments (holidays, events, demand spikes)
  - What content strategy fits this phase
  - What the business should be pushing / protecting

Works for: beach clubs, dental clinics, law firms, bakeries, olive oil producers,
hotels, gyms, restaurants — any sector in any location.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog

from app.crew.context import BrandInfo

logger = structlog.get_logger()

_PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions"


async def _perplexity_search(query: str, api_key: str, model: str = "sonar") -> str:
    """Run a Perplexity search and return the answer text."""
    if not api_key:
        return ""
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                _PERPLEXITY_API_URL,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": query}],
                    "max_tokens": 600,
                },
            )
            r.raise_for_status()
            data = r.json()
            return data["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        logger.warning("perplexity_search_failed", query=query[:60], error=str(exc))
        return ""


async def _gpt_generate(prompt: str, api_key: str, model: str = "gpt-4o-mini") -> str:
    """Call OpenAI chat completions for structured analysis."""
    if not api_key:
        return ""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are an expert business strategist and content marketing specialist. "
                                "Respond ONLY with valid JSON. No prose before or after."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "max_tokens": 2000,
                    "temperature": 0.3,
                },
            )
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        logger.warning("gpt_generate_failed", error=str(exc))
        return ""


async def build_industry_calendar(
    brand: BrandInfo,
    openai_api_key: str = "",
    perplexity_api_key: str = "",
    perplexity_model: str = "sonar",
    tavily_api_key: str = "",
    brave_api_key: str = "",
) -> dict[str, Any]:
    """
    Generate a structured industry intelligence calendar for any sector.

    Returns a dict with:
    - industry_type: detected/confirmed industry classification
    - season_phases: list of seasonal phases with content strategy per phase
    - current_phase: what phase the business is in RIGHT NOW
    - upcoming_triggers: high-opportunity moments in next 60 days
    - recurring_annual_triggers: predictable annual moments (holidays, events, seasons)
    - weekly_rhythms: day-of-week patterns relevant for this business
    - content_posture: what the brand should be doing/saying right now
    - perplexity_context: real-time local/sector intelligence
    """
    now = datetime.now(timezone.utc)
    current_month = now.strftime("%B")
    current_date = now.strftime("%B %d, %Y")
    location = brand.location or "Turkey"
    business_type = brand.business_type or "business"
    business_name = brand.business_name

    # ── Step 1: Real-world context from Perplexity ────────────────────────
    perplexity_context = ""
    if tavily_api_key or brave_api_key or perplexity_api_key:
        from app.services.web_search_service import web_search_summary
        query = (
            f"Most important seasonal patterns, upcoming events, holidays "
            f"and business opportunities for {business_type} in {location} "
            f"in {current_month} 2026. Peak/slow seasons, local events, cultural moments."
        )
        perplexity_context = await web_search_summary(
            query,
            tavily_api_key=tavily_api_key,
            brave_api_key=brave_api_key,
            perplexity_api_key=perplexity_api_key,
        )
        logger.info("industry_intelligence_web_done", chars=len(perplexity_context))

    # ── Step 2: Structured calendar from GPT-4o ───────────────────────────
    prompt = f"""
Today is {current_date}.
Business: {business_name}
Type: {business_type}
Location: {location}
Description: {brand.description or 'No additional description'}

{f'Real-time market context from web research:{chr(10)}{perplexity_context[:1200]}' if perplexity_context else ''}

Generate a comprehensive industry intelligence calendar for this specific business type in this location.
Do NOT use generic advice — tailor everything to the ACTUAL dynamics of {business_type} businesses in {location}.

Return a JSON object with exactly these fields:

{{
  "industry_type": "detected industry category (e.g. 'coastal hospitality - beach club', 'food production - olive oil', 'professional services - dental')",

  "season_phases": [
    {{
      "name": "phase name (e.g. 'Peak Season', 'Shoulder Season', 'Off Season', 'Pre-Launch')",
      "months": [list of month numbers when this phase applies],
      "description": "what characterizes this phase for this specific business",
      "demand_level": "high|medium|low",
      "content_focus": "what content themes/topics work best in this phase",
      "cta_focus": "what the primary call-to-action should be",
      "tone": "urgency/aspiration level — e.g. 'high urgency, FOMO', 'relaxed aspiration', 'value-driven'"
    }}
  ],

  "current_phase": {{
    "name": "current phase name",
    "days_until_next_phase": estimated number of days,
    "key_message": "the ONE most important message this business should be communicating RIGHT NOW",
    "content_posture": "what stance the brand should take this week (e.g. 'Build anticipation for summer opening', 'Convert lookers to bookers — peak weeks are filling', 'Off-season loyalty — keep audience warm')",
    "urgency_level": "high|medium|low"
  }},

  "upcoming_triggers": [
    {{
      "name": "event/occasion name",
      "date_range": "approximate date range",
      "relevance": "why this matters for THIS specific business",
      "content_opportunity": "specific content idea triggered by this",
      "lead_time_days": days before event to start content,
      "verified": true or false — true ONLY for national holidays, religious observances, or confirmed annual events (e.g. Bayram, Anneler Günü, Yılbaşı). false for local events you are inferring/estimating.
    }}
  ],
  IMPORTANT for upcoming_triggers: Only include national/religious holidays and confirmed annual recurring events as "verified: true".
  For local festivals, concerts, sports events — only include if confirmed by the real-time context above.
  Do NOT hallucinate local events. If no real local events are confirmed, return an empty array for upcoming_triggers.

  "recurring_annual_triggers": [
    {{
      "name": "trigger name",
      "timing": "when it occurs (month/period)",
      "business_impact": "how it affects this business type",
      "content_strategy": "how to approach it in content"
    }}
  ],

  "weekly_rhythms": {{
    "best_posting_days": ["day names that work best for this industry"],
    "avoid_days": ["days to avoid or post minimally"],
    "reasoning": "why these days work for this specific business type"
  }},

  "content_mix_this_phase": {{
    "awareness": percentage as integer,
    "engagement": percentage as integer,
    "conversion": percentage as integer,
    "retention": percentage as integer
  }},

  "competitor_watch": "what competitors in this sector typically do in the current season — what to do differently"
}}

Be SPECIFIC to {business_type} in {location}. Generic seasonal advice is useless.
Examples of the specificity required:
- For a beach club in Bodrum: know that July-August is peak, June/September are shoulder, the venue opens around May
- For a dental clinic: know back-to-school (September) drives check-ups, New Year drives cosmetic consultations
- For a bakery: know Ramadan/Eid drives pastry demand 3x, Valentine's and Mother's Day are key dates
- For an olive oil producer: know harvest season (October-November), gift season (December), healthy eating resolution season (January)

Return ONLY the JSON. No text before or after.
"""

    raw = await _gpt_generate(prompt, openai_api_key)
    if not raw:
        return _fallback_calendar(brand, current_month)

    try:
        json_match = re.search(r"\{[\s\S]*\}", raw)
        calendar = json.loads(json_match.group() if json_match else raw)
        calendar["perplexity_context"] = perplexity_context[:800] if perplexity_context else ""
        calendar["generated_at"] = now.isoformat()
        calendar["business_month"] = current_month
        return calendar
    except Exception as exc:
        logger.warning("industry_calendar_parse_failed", error=str(exc))
        return _fallback_calendar(brand, current_month)


def _fallback_calendar(brand: BrandInfo, current_month: str) -> dict[str, Any]:
    return {
        "industry_type": brand.business_type or "general business",
        "current_phase": {
            "name": "Standard Operating Period",
            "key_message": f"Showcase what makes {brand.business_name} unique",
            "content_posture": "Consistent brand presence — share value, build community",
            "urgency_level": "medium",
        },
        "season_phases": [],
        "upcoming_triggers": [],
        "recurring_annual_triggers": [],
        "weekly_rhythms": {"best_posting_days": ["Tuesday", "Thursday", "Saturday"], "avoid_days": [], "reasoning": "General best practice"},
        "content_mix_this_phase": {"awareness": 30, "engagement": 40, "conversion": 20, "retention": 10},
        "perplexity_context": "",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "business_month": current_month,
    }


def build_industry_context_prompt(calendar: dict[str, Any]) -> str:
    """
    Convert the industry calendar into a prompt block injected into every agent context.
    This is the critical bridge: structured data → agent instructions.
    """
    if not calendar:
        return ""

    lines = ["## 📅 Industry Intelligence (sector-specific, auto-updated)\n"]

    industry_type = calendar.get("industry_type", "")
    if industry_type:
        lines.append(f"**Industry**: {industry_type}\n")

    # Current phase — most actionable for agents
    cp = calendar.get("current_phase", {})
    if cp:
        lines.append("### 🎯 Current Business Phase")
        lines.append(f"**Phase**: {cp.get('name', 'N/A')}")
        lines.append(f"**Urgency**: {cp.get('urgency_level', 'medium').upper()}")
        lines.append(f"**Key message RIGHT NOW**: {cp.get('key_message', '')}")
        lines.append(f"**Content posture**: {cp.get('content_posture', '')}")
        if cp.get("days_until_next_phase"):
            lines.append(f"**Days until next phase**: {cp['days_until_next_phase']}")
        lines.append("")

    # Content mix
    mix = calendar.get("content_mix_this_phase", {})
    if mix:
        lines.append("### 📊 Content Mix This Phase")
        parts = [f"{k.title()}: {v}%" for k, v in mix.items() if v]
        lines.append(" | ".join(parts))
        lines.append("")

    # Upcoming triggers — split verified (holidays/seasons) vs AI-inferred (local events)
    # IMPORTANT: filter out triggers whose date has already passed.
    triggers_raw = calendar.get("upcoming_triggers", [])
    now_utc = datetime.now(timezone.utc)
    current_year = now_utc.year

    def _trigger_is_future(t: dict) -> bool:
        """Return True if the trigger date is today or in the future."""
        date_range = (t.get("date_range") or "").lower().strip()
        if not date_range:
            return True  # unknown date → keep, let Strategist decide
        # Try to parse month+day from strings like "19 mayıs", "may 19", "1 mayis"
        MONTH_TR = {
            "ocak": 1, "şubat": 2, "mart": 3, "nisan": 4, "mayıs": 5, "haziran": 6,
            "temmuz": 7, "ağustos": 8, "eylül": 9, "ekim": 10, "kasım": 11, "aralık": 12,
            "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
            "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
        }
        import re as _re
        # Match patterns like "1 mayıs", "19 may", "may 19", "23 nisan"
        for month_name, month_num in MONTH_TR.items():
            if month_name in date_range:
                day_match = _re.search(r"\b(\d{1,2})\b", date_range)
                if day_match:
                    day = int(day_match.group(1))
                    try:
                        from datetime import date as _date
                        candidate = _date(current_year, month_num, day)
                        # Allow up to 2 days in the past (for "starting soon" events)
                        today = _date(now_utc.year, now_utc.month, now_utc.day)
                        if candidate < today - __import__('datetime').timedelta(days=2):
                            return False  # past — skip
                    except ValueError:
                        pass
        return True

    triggers = [t for t in triggers_raw if _trigger_is_future(t)]

    # Verified triggers: national/religious holidays and seasonal transitions only
    VERIFIED_KEYWORDS = [
        "ramazan", "bayram", "kurban", "yılbaşı", "new year", "eid",
        "anneler günü", "babalar günü", "mothers day", "fathers day",
        "sevgililer günü", "valentine", "cumhuriyet", "zafer", "republic",
        "23 nisan", "19 mayıs", "halloween", "new year's", "christmas",
        "sezon açılışı", "season opening", "shoulder season", "peak season",
    ]
    verified = [t for t in triggers if any(kw in (t.get("name","") + t.get("date_range","")).lower() for kw in VERIFIED_KEYWORDS)]
    ai_inferred = [t for t in triggers if t not in verified]

    if verified:
        lines.append("### ⚡ Kesin Tarihler (doğrulanmış fırsatlar)")
        for t in verified[:3]:
            name = t.get("name", "")
            date = t.get("date_range", "")
            opp = t.get("content_opportunity", "")
            lead = t.get("lead_time_days", "")
            lead_str = f" — {lead} gün önceden hazırlan" if lead else ""
            lines.append(f"- **{name}** ({date}){lead_str}: {opp}")
        lines.append("")

    if ai_inferred:
        lines.append("### 💡 Tahmini Fırsatlar (doğrulanmamış — operatör teyit etmeli)")
        lines.append("⚠️ Aşağıdaki olaylar AI tarafından tahmin edilmiştir. Gerçek tarih/varlık doğrulanmadan kampanya üretme. Yerel etkinlik ise kullan, değilse yoksay.")
        for t in ai_inferred[:3]:
            name = t.get("name", "")
            date = t.get("date_range", "")
            opp = t.get("content_opportunity", "")
            lines.append(f"- **{name}** ({date}): {opp}")
        lines.append("")

    # Weekly rhythms
    rhythms = calendar.get("weekly_rhythms", {})
    if rhythms.get("best_posting_days"):
        best = ", ".join(rhythms["best_posting_days"])
        lines.append(f"**Best posting days**: {best}")
        if rhythms.get("reasoning"):
            lines.append(f"*Why: {rhythms['reasoning']}*")
        lines.append("")

    # Competitor posture
    comp = calendar.get("competitor_watch", "")
    if comp:
        lines.append(f"**Competitor watch**: {comp}")
        lines.append("")

    # Perplexity real-time context
    perp = calendar.get("perplexity_context", "")
    if perp:
        lines.append("### 🌐 Real-Time Market Context")
        lines.append(perp[:600])
        lines.append("")

    lines.append(
        "⚡ **USE THIS INTELLIGENCE**: Every content idea must reflect the current phase, "
        "urgency level, and upcoming triggers above. Generic seasonal content is NOT acceptable."
    )

    return "\n".join(lines)
