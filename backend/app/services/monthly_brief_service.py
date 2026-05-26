"""
Monthly Brief Service — generates a comprehensive 30-day strategic brief.

Unlike the weekly trend brief (tactical, "what's trending this week"),
the monthly brief is STRATEGIC:
  - What happened last month (content themes, competitor moves, market shifts)
  - What the next 30 days demand from this business
  - Long-term pattern recognition (what keeps working, what to drop)
  - Concrete campaign recommendations for the month ahead

Input: ALL available brand signals synthesised together:
  - brand_dna (master intelligence)
  - industry_calendar (sector seasonality)
  - competitor_brief + competitor_pulse (competitive landscape)
  - trend_brief (recent market movements)
  - learning_context (what this brand's audience actually responds to)
  - google_review_signals (what customers say)
  - market_opportunity_ideas (urgent opportunities)

The result is the kind of brief a senior agency account manager
would write before a monthly strategy review with the client.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx
import structlog

from app.crew.context import BrandInfo

logger = structlog.get_logger()


async def _gpt_brief(prompt: str, api_key: str) -> str:
    if not api_key:
        return ""
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            r = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": "gpt-4o",
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are a senior account strategist at a premium digital marketing agency. "
                                "You write monthly strategic briefs for clients based on data and market intelligence. "
                                "Your briefs are specific, actionable, and grounded in real signals — never generic. "
                                "Write in clear sections with markdown headers. Be direct and opinionated."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "max_tokens": 2500,
                    "temperature": 0.3,
                },
            )
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        logger.warning("monthly_brief_gpt_failed", error=str(exc))
        return ""


async def build_monthly_brief(brand: BrandInfo, openai_api_key: str = "") -> dict[str, Any]:
    """
    Generate a comprehensive monthly strategic brief for any brand/sector.
    Returns: {brief_text, data_sources_used, generated_at, month}
    """
    now = datetime.now(timezone.utc)
    current_month = now.strftime("%B %Y")
    next_month = (now.replace(day=1) + timedelta(days=32)).strftime("%B %Y")

    # Collect all available signals with source tracking
    sources_used: list[str] = []
    signal_blocks: list[str] = []

    if brand.brand_dna:
        try:
            dna = json.loads(brand.brand_dna)
            signal_blocks.append(f"""
## Brand Intelligence (synthesised DNA)
- Essence: {dna.get('brand_essence', 'N/A')}
- Current strategic priority: {dna.get('current_strategic_priority', 'N/A')}
- Proven patterns: {'; '.join(dna.get('proven_content_patterns', [])[:3])}
- Audience: {dna.get('audience_intelligence', {}).get('primary', 'N/A')}
- What triggers them: {dna.get('audience_intelligence', {}).get('what_triggers_them', 'N/A')}
- Data richness: {dna.get('data_richness', 'sparse')}
""")
            sources_used.append("Brand DNA")
        except Exception:
            pass

    if brand.industry_calendar:
        try:
            cal = json.loads(brand.industry_calendar)
            cp = cal.get("current_phase", {})
            triggers = cal.get("upcoming_triggers", [])
            signal_blocks.append(f"""
## Industry & Seasonality
- Industry type: {cal.get('industry_type', 'N/A')}
- Current phase: {cp.get('name', 'N/A')} (urgency: {cp.get('urgency_level', 'N/A')})
- Phase message: {cp.get('key_message', 'N/A')}
- Content posture: {cp.get('content_posture', 'N/A')}
- Upcoming triggers next 30-60 days: {'; '.join([t.get('name', '') + ' (' + t.get('date_range', '') + ')' for t in triggers[:5]])}
- Competitor watch: {cal.get('competitor_watch', 'N/A')}
""")
            sources_used.append("Industry Calendar")
        except Exception:
            pass

    if brand.competitor_brief:
        signal_blocks.append(f"""
## Competitor Landscape
{brand.competitor_brief[:600]}
""")
        sources_used.append("Competitor Intelligence")

    if brand.competitor_pulse:
        signal_blocks.append(f"""
## Recent Competitor Activity (last 7 days)
{brand.competitor_pulse[:400]}
""")
        sources_used.append("Competitor Pulse")

    if brand.trend_brief:
        signal_blocks.append(f"""
## Market Trends (weekly signal)
{brand.trend_brief[:500]}
""")
        sources_used.append("Weekly Trends")

    if brand.google_review_signals:
        positives = [r.get("text", "") for r in brand.google_review_signals if r.get("stars", 0) >= 4][:3]
        negatives = [r.get("text", "") for r in brand.google_review_signals if r.get("stars", 0) <= 3][:2]
        if positives or negatives:
            signal_blocks.append(f"""
## Customer Voice (Google Reviews — {brand.google_rating}/5, {brand.google_review_count} reviews)
Positives: {'; '.join(positives[:3])}
Concerns: {'; '.join(negatives[:2]) if negatives else 'none flagged'}
""")
            sources_used.append("Google Reviews")

    if brand.learning_context:
        signal_blocks.append(f"""
## What This Brand's Audience Has Responded To
{brand.learning_context[:500]}
""")
        sources_used.append("Tenant Learning")

    if brand.market_opportunity_ideas:
        try:
            ideas = json.loads(brand.market_opportunity_ideas)
            if ideas:
                signal_blocks.append(f"""
## Recent Market Opportunities Identified
{'; '.join([i.get('title', '') + ' (' + i.get('urgency', '') + ')' for i in ideas[:5]])}
""")
                sources_used.append("Market Intelligence")
        except Exception:
            pass

    if not signal_blocks:
        return {
            "brief_text": "Insufficient data for monthly brief. Run brand analysis first (Visual DNA, Competitor Analysis, Sector Analysis).",
            "data_sources_used": [],
            "generated_at": now.isoformat(),
            "month": current_month,
            "richness": "insufficient",
        }

    signals_text = "\n".join(signal_blocks)

    prompt = f"""
You are writing the {current_month} Monthly Strategy Brief for **{brand.business_name}**
({brand.business_type} in {brand.location or 'Turkey'}).

This brief will be read by the brand owner and used to guide ALL content, campaigns,
and marketing decisions for {next_month}.

Here is the full intelligence available about this brand:

{signals_text}

Write a comprehensive monthly strategic brief with these sections:

## 📊 {current_month} — Situation Assessment
What is the overall state of this brand's market position RIGHT NOW?
Where is it strong, where is it vulnerable? Be specific, reference the data above.

## 🎯 Strategic Priority for {next_month}
What is the single most important thing this brand must accomplish next month?
WHY is this the priority (reference season, competitors, customer signals)?

## 🏆 Competitive Position
What are competitors doing that we should respond to?
What territory is unclaimed that we should move into?
Be specific about the gap.

## 📅 Campaign Plan for {next_month}
Propose 2-3 specific campaign themes for next month.
For each:
- Theme name and 1-line rationale
- Target audience segment
- Content formats recommended (post/story/reel ratio)
- Key dates to activate around
- Primary CTA

## 💬 Brand Voice Direction
Based on what's working for this audience, what tone/style should dominate next month?
What should we consciously STOP saying?

## 📈 Success Metrics to Track
What 3 KPIs should this brand focus on next month and why?

## ⚠️ Risks & Watchpoints
What could go wrong? What competitive moves or market shifts need monitoring?

---
IMPORTANT: Every recommendation must be grounded in the intelligence data provided.
Do not give generic marketing advice. If you reference a competitor, name it.
If you reference a season or event, be specific.
This brand is in {brand.location or 'Turkey'} in the {brand.business_type} sector.
"""

    brief_text = await _gpt_brief(prompt, openai_api_key)

    if not brief_text:
        brief_text = "Brief generation failed. Check OpenAI API key and retry."

    return {
        "brief_text": brief_text,
        "data_sources_used": sources_used,
        "generated_at": now.isoformat(),
        "month": current_month,
        "richness": "rich" if len(sources_used) >= 4 else "moderate" if len(sources_used) >= 2 else "sparse",
    }
