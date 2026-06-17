"""
Brand DNA Service — synthesises ALL available brand intelligence into a single,
evolving, structured document injected into every agent.

The "Brand DNA" is not a one-time analysis. It is a LIVING DOCUMENT that gets
richer every week as agents collect more signals:
  - What content has been approved / rejected (tenant learning)
  - What performs best on Instagram (performance feedback)
  - How competitors are positioning (competitor intelligence)
  - What the industry calendar says (seasonal context)
  - What customers say in reviews (Google signals)
  - What the website and Instagram communicate (discovery data)
  - What trends are emerging (market intelligence)

Result: every agent knows the brand deeply — not from the day of onboarding,
but from continuous learning. The DNA gets smarter every week.

Cadence: refreshed every Sunday so Monday Gram Master runs with fresh context.
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


async def _gpt_synthesise(prompt: str, api_key: str, model: str = "gpt-4o") -> str:
    if not api_key:
        return ""
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            r = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are a senior brand strategist. You synthesise brand intelligence "
                                "into clear, actionable insights for content and marketing agents. "
                                "Respond ONLY with valid JSON. No prose before or after."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "max_tokens": 3000,
                    "temperature": 0.2,
                },
            )
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        logger.warning("brand_dna_gpt_failed", error=str(exc))
        return ""


def _safe_json(text: str | None) -> Any:
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        return None


def _build_gallery_scene_catalog(gallery_analysis_raw: str) -> list[dict[str, Any]]:
    """Compact per-photo inventory for Brand DNA synthesis (caption↔image pairing)."""
    data = _safe_json(gallery_analysis_raw)
    if not isinstance(data, dict) or not data:
        return []

    scenes: list[dict[str, Any]] = []
    for url, meta in data.items():
        if not isinstance(meta, dict):
            continue
        tags = meta.get("contentTags") or []
        if not tags and not meta.get("usageContext") and not meta.get("description"):
            continue
        scenes.append({
            "url": str(url)[:120],
            "tags": (tags[:8] if isinstance(tags, list) else []),
            "mood": str(meta.get("mood") or ""),
            "usage": str(meta.get("usageContext") or "")[:160],
            "description": str(meta.get("description") or "")[:200],
            "caption_hooks": (meta.get("captionHooks") or [])[:6],
            "pairing_keywords": (meta.get("pairingKeywords") or [])[:10],
            "best_for": (meta.get("bestFor") or [])[:4],
        })
    scenes.sort(key=lambda s: len(s.get("tags") or []), reverse=True)
    return scenes[:24]


async def build_brand_dna(brand: BrandInfo, openai_api_key: str = "") -> dict[str, Any]:
    """
    Synthesise all available signals about a brand into a structured DNA document.

    This is the master intelligence layer that all agents read.
    Each field answers a specific question agents need to produce professional output.
    """
    now = datetime.now(timezone.utc)

    # ── Collect all available signals ─────────────────────────────────────
    signals: dict[str, Any] = {
        "brand_name": brand.business_name,
        "business_type": brand.business_type,
        "location": brand.location,
        "description": brand.description,
        "brand_tone": brand.brand_tone,
        "target_audience": brand.target_audience,
        "languages": brand.languages,
        "campaign_goals": brand.campaign_goals,
        "custom_rules": brand.custom_rules,
        "keywords": brand.keywords,
        "website_summary": brand.website_summary[:400] if brand.website_summary else "",
        "instagram_bio": brand.instagram_bio,
        "instagram_top_hashtags": brand.instagram_top_hashtags,
        "google_rating": brand.google_rating,
        "google_review_count": brand.google_review_count,
        "google_review_signals": brand.google_review_signals[:5] if brand.google_review_signals else [],
        "visual_dna": brand.visual_dna[:600] if brand.visual_dna else "",
        "content_pillars": brand.content_pillars,
        "default_ctas": brand.default_ctas,
        "competitor_brief": brand.competitor_brief[:500] if brand.competitor_brief else "",
        "trend_brief": brand.trend_brief[:500] if brand.trend_brief else "",
        "competitor_pulse": brand.competitor_pulse[:400] if brand.competitor_pulse else "",
        "market_opportunity_ideas": _safe_json(brand.market_opportunity_ideas) or [],
        "industry_calendar_current_phase": None,
        "learning_context": brand.learning_context[:600] if brand.learning_context else "",
        "gallery_scene_catalog": _build_gallery_scene_catalog(brand.gallery_analysis or ""),
    }

    # Extract current phase from industry calendar if available
    if brand.industry_calendar:
        try:
            cal = json.loads(brand.industry_calendar)
            signals["industry_calendar_current_phase"] = cal.get("current_phase", {})
            signals["upcoming_triggers"] = cal.get("upcoming_triggers", [])[:3]
        except Exception:
            pass

    # Skip synthesis if we have very little data
    has_meaningful_data = bool(
        signals["website_summary"] or signals["instagram_bio"] or
        signals["competitor_brief"] or signals["learning_context"] or
        signals["visual_dna"] or signals["gallery_scene_catalog"]
    )

    if not has_meaningful_data or not openai_api_key:
        return _minimal_dna(brand, now)

    # ── Build synthesis prompt ─────────────────────────────────────────────
    signals_text = json.dumps(signals, ensure_ascii=False, indent=2)

    prompt = f"""
You are synthesising brand intelligence for {brand.business_name} ({brand.business_type} in {brand.location or 'Turkey'}).

Here is ALL available data about this brand collected from multiple sources:

{signals_text}

Synthesise this into a structured Brand DNA document that will be injected into
every AI agent's context. Each section must be SPECIFIC to this brand — not generic.
Agents will use this to make content, strategy, and creative decisions.

Return a JSON object with EXACTLY these fields:

{{
  "brand_essence": "2-3 sentence core identity — what makes this brand unique, who it serves, what it stands for. Agents must never contradict this.",

  "proven_content_patterns": [
    "pattern 1 — what works for this brand based on approved content and performance",
    "pattern 2",
    "pattern 3"
  ],

  "audience_intelligence": {{
    "primary": "primary audience description — specific, not generic",
    "secondary": "secondary audience if relevant",
    "what_they_want": "top 3 things this audience wants from this brand",
    "what_triggers_them": "what motivates them to engage/purchase/visit"
  }},

  "competitive_position": "How this brand sits vs competitors — what's the differentiation, what territory it owns",

  "content_do_list": [
    "always do this in content",
    "always do this",
    "always include this"
  ],

  "content_dont_list": [
    "never do this",
    "avoid this",
    "this has been rejected before"
  ],

  "brand_voice_guide": {{
    "tone": "specific tone description",
    "language_style": "how it speaks — formal/casual/witty/authoritative",
    "signature_phrases": ["phrases this brand uses", "and this"],
    "avoid_phrases": ["phrases to avoid"]
  }},

  "current_strategic_priority": "What should ALL agents focus on this week/month based on the current season, trends, and opportunities. This is the #1 business goal right now.",

  "high_value_content_opportunities": [
    {{
      "opportunity": "specific content opportunity",
      "why_now": "timing reason",
      "format": "post/story/reel/carousel",
      "urgency": "immediate/this_week/this_month"
    }}
  ],

  "customer_intelligence": {{
    "what_they_love": "based on reviews and engagement — what customers genuinely appreciate",
    "pain_points_to_address": "concerns or gaps to address in content",
    "loyalty_triggers": "what makes them come back / recommend"
  }},

  "sales_strategy_context": "Content strategy aligned with sales funnel — what moves people from awareness to purchase/visit/booking for this specific business",

  "agency_recommendation": "If you were a senior account manager at a premium agency, what ONE strategic recommendation would you make to this brand this week?",

  "gallery_content_pairing_guide": [
    {{
      "scene_or_product": "what the photo shows",
      "ideal_caption_angle": "how to write captions when using this visual",
      "avoid_in_caption": "what NOT to claim when this photo is used",
      "example_hook_tr": "short Turkish caption hook"
    }}
  ]
}}

Use gallery_scene_catalog to fill gallery_content_pairing_guide with REAL scenes from analyzed photos.
Be SPECIFIC. Use actual data from the signals. If data is missing for a field, make the best inference from what's available. Never write 'not available' — always provide the best possible intelligence.
"""

    raw = await _gpt_synthesise(prompt, openai_api_key)
    if not raw:
        return _minimal_dna(brand, now)

    try:
        json_match = re.search(r"\{[\s\S]*\}", raw)
        dna = json.loads(json_match.group() if json_match else raw)
        dna["synthesised_at"] = now.isoformat()
        dna["data_richness"] = _score_data_richness(signals)
        return dna
    except Exception as exc:
        logger.warning("brand_dna_parse_failed", error=str(exc))
        return _minimal_dna(brand, now)


def _score_data_richness(signals: dict) -> str:
    """Score how much data we have about this brand."""
    score = 0
    if signals.get("website_summary"): score += 2
    if signals.get("instagram_bio"): score += 2
    if signals.get("google_review_signals"): score += 2
    if signals.get("visual_dna"): score += 2
    if signals.get("gallery_scene_catalog"): score += 3
    if signals.get("competitor_brief"): score += 1
    if signals.get("learning_context"): score += 3
    if signals.get("industry_calendar_current_phase"): score += 2
    if signals.get("trend_brief"): score += 1
    if score >= 10: return "rich"
    if score >= 5: return "moderate"
    return "sparse"


def _minimal_dna(brand: BrandInfo, now: datetime) -> dict[str, Any]:
    return {
        "brand_essence": f"{brand.business_name} — {brand.business_type} in {brand.location or 'Turkey'}",
        "proven_content_patterns": ["Authentic venue photography", "Local audience focus"],
        "audience_intelligence": {
            "primary": brand.target_audience or "Local customers",
            "what_they_want": "Quality experience",
            "what_triggers_them": "Social proof and visual appeal",
        },
        "competitive_position": "Local competitor",
        "content_do_list": ["Use real venue photos", "Include clear CTA"],
        "content_dont_list": ["Generic stock imagery"],
        "brand_voice_guide": {"tone": brand.brand_tone or "professional"},
        "current_strategic_priority": "Consistent brand presence",
        "high_value_content_opportunities": [],
        "customer_intelligence": {"what_they_love": "Quality", "pain_points_to_address": ""},
        "sales_strategy_context": "Build awareness and drive conversions",
        "agency_recommendation": "Run brand analysis first to get tailored recommendations",
        "synthesised_at": now.isoformat(),
        "data_richness": "sparse",
    }


def build_brand_dna_prompt(dna: dict[str, Any]) -> str:
    """
    Convert Brand DNA into the prompt block injected at the TOP of every agent context.
    This is the most important context block — agents read this first.
    """
    if not dna:
        return ""

    richness = dna.get("data_richness", "sparse")
    synthesised_at = dna.get("synthesised_at", "")

    lines = [
        "## 🧬 Brand DNA (synthesised intelligence — read this first)",
        f"*Richness: {richness} | Updated: {synthesised_at[:10] if synthesised_at else 'unknown'}*\n",
    ]

    if dna.get("brand_essence"):
        lines += [f"**Brand Essence**: {dna['brand_essence']}", ""]

    # Current strategic priority — most actionable
    if dna.get("current_strategic_priority"):
        lines += [
            "### 🎯 Strategic Priority (this week)",
            dna["current_strategic_priority"],
            "",
        ]

    # Agency recommendation
    if dna.get("agency_recommendation"):
        lines += [
            "### 💡 Agency Recommendation",
            dna["agency_recommendation"],
            "",
        ]

    # Content rules
    dos = dna.get("content_do_list", [])
    donts = dna.get("content_dont_list", [])
    if dos or donts:
        lines.append("### ✅ Content Rules")
        for d in dos[:4]:
            lines.append(f"✓ {d}")
        for d in donts[:3]:
            lines.append(f"✗ {d}")
        lines.append("")

    # Proven patterns
    patterns = dna.get("proven_content_patterns", [])
    if patterns:
        lines.append("### 📊 Proven Patterns (what works for THIS brand)")
        for p in patterns[:4]:
            lines.append(f"- {p}")
        lines.append("")

    # Audience intelligence
    aud = dna.get("audience_intelligence", {})
    if aud.get("primary") or aud.get("what_triggers_them"):
        lines.append("### 👥 Audience Intelligence")
        if aud.get("primary"):
            lines.append(f"**Primary**: {aud['primary']}")
        if aud.get("what_triggers_them"):
            lines.append(f"**What triggers them**: {aud['what_triggers_them']}")
        lines.append("")

    # High-value opportunities
    opps = dna.get("high_value_content_opportunities", [])
    if opps:
        lines.append("### ⚡ High-Value Opportunities (act now)")
        for opp in opps[:3]:
            urgency = opp.get("urgency", "")
            lines.append(
                f"- **[{urgency.upper()}]** {opp.get('opportunity', '')} "
                f"({opp.get('format', 'post')}) — {opp.get('why_now', '')}"
            )
        lines.append("")

    pairing = dna.get("gallery_content_pairing_guide", [])
    if isinstance(pairing, list) and pairing:
        lines.append("### 🖼 Gallery ↔ Caption Pairing (use real photos only)")
        for item in pairing[:8]:
            if not isinstance(item, dict):
                continue
            scene = item.get("scene_or_product", "")
            angle = item.get("ideal_caption_angle", "")
            avoid = item.get("avoid_in_caption", "")
            hook = item.get("example_hook_tr", "")
            line = f"- **{scene}**: {angle}"
            if hook:
                line += f' (örnek: "{hook}")'
            if avoid:
                line += f" — Kaçın: {avoid}"
            lines.append(line)
        lines.append("")

    # Brand voice
    voice = dna.get("brand_voice_guide", {})
    if voice.get("tone") or voice.get("signature_phrases"):
        lines.append("### 🎙 Brand Voice")
        if voice.get("tone"):
            lines.append(f"Tone: {voice['tone']}")
        if voice.get("signature_phrases"):
            lines.append(f"Use: {', '.join(voice['signature_phrases'][:3])}")
        if voice.get("avoid_phrases"):
            lines.append(f"Avoid: {', '.join(voice['avoid_phrases'][:3])}")
        lines.append("")

    # Competitive position
    if dna.get("competitive_position"):
        lines.append(f"**Competitive position**: {dna['competitive_position']}")
        lines.append("")

    lines.append(
        "⚠️ **MANDATORY**: Every output must reflect this Brand DNA. "
        "Generic content that ignores brand essence, audience intelligence, or strategic priority is unacceptable."
    )

    return "\n".join(lines)
