"""
Action Extractor — raw LLM output → structured action payload.

Each agent produces free-form text from the LLM. This module parses
that output and builds a typed, executable action payload per agent/task
combination. The payload is what gets stored as SuggestedAction on the
.NET side and eventually executed against a real provider.

Design decisions:
- Always try JSON parse first (LLMs often produce JSON when asked)
- Fall back to wrapping prose in a typed payload
- Never lose the original content — raw_output is always preserved
- Each action_type maps 1:1 to a provider integration
"""

from __future__ import annotations

import json
import re
from typing import Any


def _try_parse_json(text: str) -> dict | list | None:
    """
    Try to extract JSON from free-form text.
    LLMs often produce JSON inside markdown code blocks or mixed with prose.
    """
    if not text:
        return None

    # Try direct parse first
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass

    # Try to extract JSON block from markdown ```json ... ```
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Try to find first { ... } block
    match = re.search(r"(\{[\s\S]*\})", text)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass

    return None


def extract_review_response_action(
    raw_output: str,
    review_context: dict | None = None,
) -> dict[str, Any]:
    """
    Parse review agent output into a reply_to_google_review action.

    Expected LLM output (from draft_response_task):
    {
        "draft_response": "...",
        "response_strategy": "...",
        "alternative_response": "...",
        "suggested_internal_action": "...",
        "confidence_score": 0.9
    }
    """
    parsed = _try_parse_json(raw_output)

    if isinstance(parsed, dict):
        reply_text = (
            parsed.get("draft_response")
            or parsed.get("response")
            or parsed.get("reply")
            or raw_output
        )
        strategy = parsed.get("response_strategy", "")
        alternative = parsed.get("alternative_response", "")
        internal_action = parsed.get("suggested_internal_action", "")
        confidence = parsed.get("confidence_score", 0.8)
    else:
        # Prose output — treat whole thing as the reply text
        reply_text = raw_output
        strategy = "Direct response"
        alternative = ""
        internal_action = ""
        confidence = 0.7

    return {
        "action_type": "reply_to_google_review",
        "provider": "google_business",
        "approval_required": True,
        "payload": {
            "reply_text": reply_text,
            "alternative_text": alternative,
            "response_strategy": strategy,
            "internal_action": internal_action,
            "confidence_score": confidence,
            "review_context": review_context or {},
        },
        "human_readable": reply_text,
    }


def extract_review_analysis_action(raw_output: str) -> dict[str, Any]:
    """Parse review analysis output into a structured analysis payload."""
    parsed = _try_parse_json(raw_output)

    if isinstance(parsed, dict):
        sentiment = parsed.get("sentiment", "neutral")
        urgency = parsed.get("urgency", "medium")
        topics = parsed.get("key_topics", [])
        escalate = parsed.get("requires_escalation", False)
    elif isinstance(parsed, list) and len(parsed) > 0:
        first = parsed[0] if isinstance(parsed[0], dict) else {}
        sentiment = first.get("sentiment", "neutral")
        urgency = first.get("urgency", "medium")
        topics = first.get("key_topics", [])
        escalate = first.get("requires_escalation", False)
    else:
        sentiment = "neutral"
        urgency = "medium"
        topics = []
        escalate = False

    return {
        "action_type": "log_review_analysis",
        "provider": "system",
        "approval_required": False,  # analysis = no approval needed, just log
        "payload": {
            "sentiment": sentiment,
            "urgency": urgency,
            "key_topics": topics,
            "requires_escalation": escalate,
            "raw_analysis": raw_output,
        },
        "human_readable": f"Analiz tamamlandı: {sentiment} duygu, {urgency} öncelik.",
    }


def _normalize_canva_field_copy(item: dict) -> dict[str, str] | None:
    raw = item.get("canva_field_copy") or item.get("canvaFieldCopy") or item.get("canva_fields")
    if not isinstance(raw, dict):
        return None
    out: dict[str, str] = {}
    for k, v in raw.items():
        if isinstance(v, str) and v.strip():
            out[str(k)] = v.strip()
    return out or None


def _normalize_visual_production_spec(item: dict) -> dict | None:
    """Pass through the Media Specialist visual_production_spec (treatment +
    gallery selection + edit prompt) so renderers downstream are not starved."""
    raw = item.get("visual_production_spec") or item.get("visualProductionSpec")
    if not isinstance(raw, dict):
        return None
    treatment = raw.get("treatment")
    valid = {"pure_photo", "story_event", "feed_text_overlay", "event_announcement"}
    spec: dict = {
        "treatment": treatment if treatment in valid else "pure_photo",
        "selected_gallery_url": raw.get("selected_gallery_url") or raw.get("selectedGalleryUrl") or "",
        "image_edit_prompt": raw.get("image_edit_prompt") or raw.get("imageEditPrompt") or "",
    }
    text_layers = raw.get("text_layers") or raw.get("textLayers")
    if isinstance(text_layers, dict):
        spec["text_layers"] = text_layers
    reel_motion = raw.get("reel_motion_spec") or raw.get("reelMotionSpec")
    if isinstance(reel_motion, dict):
        spec["reel_motion_spec"] = reel_motion
    return spec


def _normalize_idea(item: dict) -> dict:
    """
    Normalize a single content idea to a consistent field schema.

    Handles both old-style fields (title/caption/type) and
    new-style LLM output (concept_title/caption_draft/content_type/hashtags as csv).
    """
    if not isinstance(item, dict):
        return {"title": str(item), "caption": "", "content_type": "post", "hashtags": []}

    # Normalize title
    title = item.get("concept_title") or item.get("title") or "İçerik Önerisi"

    # Normalize caption
    caption = item.get("caption_draft") or item.get("caption") or ""

    # Normalize content type
    content_type = item.get("content_type") or item.get("type") or "post"
    content_kind = item.get("content_kind") or _content_kind_from_type(content_type)

    # Normalize visual direction / image prompt
    visual_direction = item.get("visual_direction") or item.get("image_prompt") or ""
    caption_blob = f"{title} {caption} {visual_direction} {item.get('strategic_purpose') or item.get('purpose') or ''}"
    template_use_case = item.get("template_use_case") or _infer_template_use_case(caption_blob, content_type)
    headline = item.get("headline") or item.get("hook") or title
    event_date = item.get("event_date") or item.get("date") or item.get("date_suggestion") or ""
    location = item.get("location") or item.get("venue_name") or item.get("venue") or ""
    cta = item.get("cta") or item.get("call_to_action") or _infer_default_cta(caption_blob)
    asset_intent = item.get("asset_intent") or _infer_asset_intent(caption_blob, template_use_case)

    # Normalize hashtags: can be csv string or list
    raw_hashtags = item.get("hashtags") or []
    if isinstance(raw_hashtags, str):
        hashtags = [t.strip() for t in raw_hashtags.replace("\n", ",").split(",") if t.strip()]
    elif isinstance(raw_hashtags, list):
        hashtags = [str(t).strip() for t in raw_hashtags if str(t).strip()]
    else:
        hashtags = []

    # Make sure hashtags start with #
    hashtags = [t if t.startswith("#") else f"#{t}" for t in hashtags]

    return {
        "content_type": content_type,
        "content_kind": content_kind,
        "template_use_case": template_use_case,
        "headline": headline,
        "event_date": event_date,
        "location": location,
        "cta": cta,
        "asset_intent": asset_intent,
        "title": title,
        "caption_draft": caption,
        "visual_direction": visual_direction,
        "hashtags": hashtags,
        "posting_time_suggestion": item.get("posting_time_suggestion") or item.get("best_time") or "",
        "estimated_engagement": item.get("estimated_engagement") or "",
        "strategic_purpose": item.get("strategic_purpose") or item.get("purpose") or "",
        "asset_recommendation": item.get("asset_recommendation") or "",
        "production_notes": item.get("production_notes") or "",
        "missing_questions": _normalize_missing_questions(item.get("missing_questions") or item.get("missing_question")),
        "canva_field_copy": _normalize_canva_field_copy(item),
        "visual_production_spec": _normalize_visual_production_spec(item),
    }


def _normalize_missing_questions(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()][:1]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _content_kind_from_type(content_type: str) -> str:
    normalized = str(content_type or "").lower()
    if "story" in normalized:
        return "instagram_story"
    if "reel" in normalized or "video" in normalized:
        return "instagram_reel"
    return "instagram_post"


def _infer_template_use_case(blob: str, content_type: str) -> str:
    text = f"{blob} {content_type}".lower()
    if any(token in text for token in ["event", "etkinlik", "dj", "workshop", "lansman", "konser", "show"]):
        return "event_announcement"
    if any(token in text for token in ["indirim", "kampanya", "offer", "discount", "rezervasyon", "reservation"]):
        return "offer_campaign"
    if any(token in text for token in ["ürün", "product", "menu", "menü", "koleksiyon", "collection", "coffee", "kahve"]):
        return "product_showcase"
    if any(token in text for token in ["behind", "sahne arkası", "atölye", "mutfak", "hazırlık", "production", "prodüksiyon"]):
        return "behind_the_scenes"
    if any(token in text for token in ["yorum", "review", "müşteri", "testimonial"]):
        return "social_proof"
    if any(token in text for token in ["nasıl", "ipucu", "guide", "eğitim", "öğren"]):
        return "educational_post"
    if "calendar" in text or "plan" in text:
        return "weekly_plan"
    return "daily_story" if "story" in str(content_type).lower() else "product_showcase"


def _infer_default_cta(blob: str) -> str:
    text = blob.lower()
    if any(token in text for token in ["reservation", "rezervasyon", "booking"]):
        return "Rezervasyon Yap"
    if any(token in text for token in ["shop", "satın", "ürün", "product", "order", "sipariş"]):
        return "Hemen İncele"
    if any(token in text for token in ["event", "etkinlik", "workshop", "show"]):
        return "Detayları Gör"
    return "İletişime Geç"


def _infer_asset_intent(blob: str, template_use_case: str) -> str:
    text = f"{blob} {template_use_case}".lower()
    if any(token in text for token in ["artist", "sanatçı", "dj", "konuk"]):
        return "artist_photo"
    if template_use_case == "product_showcase":
        return "product_image"
    if template_use_case == "behind_the_scenes":
        return "team_or_process_photo"
    if any(token in text for token in ["venue", "mekan", "location", "plaj", "restaurant", "cafe"]):
        return "venue_photo"
    return "brand_background"


def extract_content_ideation_action(
    raw_output: str,
    parameters: dict | None = None,
) -> dict[str, Any]:
    """
    Parse content agent output into a create_instagram_content_plan action.

    Handles LLM output in multiple formats:
    - Direct JSON array: [{content_type, concept_title, caption_draft, hashtags, ...}, ...]
    - Object with ideas key: {"ideas": [...]}
    - Old-style: {"ideas": [{"title", "caption", "type", ...}]}
    - Prose fallback
    """
    parsed = _try_parse_json(raw_output)
    params = parameters or {}

    raw_ideas: list = []

    if isinstance(parsed, list):
        # Direct array from LLM
        raw_ideas = parsed
    elif isinstance(parsed, dict):
        # Try common wrapper keys
        for key in ("ideas", "content_ideas", "posts", "content", "items"):
            if isinstance(parsed.get(key), list):
                raw_ideas = parsed[key]
                break
        if not raw_ideas:
            # Single object — treat as one idea
            raw_ideas = [parsed]
    else:
        # Prose — single fallback idea
        raw_ideas = [{"title": "AI İçerik Önerisi", "caption_draft": raw_output, "content_type": "post"}]

    # Normalize all ideas to consistent schema
    ideas = [_normalize_idea(item) for item in raw_ideas if item]

    return {
        "action_type": "create_instagram_content_plan",
        "provider": "instagram",
        "approval_required": True,
        "payload": {
            "ideas": ideas,
            "time_period": params.get("time_period", "next week"),
            "count": len(ideas),
            "autonomy": _build_content_autonomy_summary(ideas, params),
            "strategy_action_id": params.get("strategy_action_id") or params.get("strategyActionId") or "",
        },
        "human_readable": f"{len(ideas)} içerik fikri üretildi — '{params.get('time_period', 'hafta')}' için.",
    }


def _build_content_autonomy_summary(ideas: list[dict], params: dict) -> dict[str, Any]:
    first_question = ""
    for idea in ideas:
        questions = idea.get("missing_questions") or []
        if questions:
            first_question = str(questions[0])
            break

    return {
        "enabled": bool(params.get("autonomy_mode") or params.get("autonomyMode")),
        "ready": not first_question,
        "single_question": first_question,
        "content_pillars": params.get("content_pillars") or params.get("contentPillars") or [],
        "next_step": "ask_single_question" if first_question else "generate_canva_designs_for_approval",
    }


def extract_content_calendar_action(
    raw_output: str,
    parameters: dict | None = None,
) -> dict[str, Any]:
    """Parse content calendar output."""
    parsed = _try_parse_json(raw_output)
    params = parameters or {}

    if isinstance(parsed, dict):
        posts = (
            parsed.get("posts")
            or parsed.get("schedule")
            or parsed.get("calendar")
            or []
        )
    elif isinstance(parsed, list):
        posts = parsed
    else:
        posts = [{"content": raw_output}]

    # Mirror calendar slots into ideation-shaped records so UIs that read `ideas` stay aligned.
    calendar_ideas: list[dict] = []
    for entry in posts:
        if not isinstance(entry, dict):
            continue
        day = entry.get("day")
        date_s = entry.get("date_suggestion") or entry.get("date") or ""
        slot_time = entry.get("posting_time_suggestion") or date_s or (f"Gün {day}" if day is not None else "")
        calendar_ideas.append(
            _normalize_idea(
                {
                    "concept_title": entry.get("theme") or entry.get("concept_title") or entry.get("title"),
                    "caption_draft": entry.get("brief")
                    or entry.get("caption_draft")
                    or entry.get("caption")
                    or entry.get("body")
                    or entry.get("copy")
                    or "",
                    "content_type": entry.get("content_type") or entry.get("type") or "post",
                    "content_kind": entry.get("content_kind"),
                    "template_use_case": entry.get("template_use_case"),
                    "headline": entry.get("headline"),
                    "event_date": entry.get("event_date") or entry.get("date_suggestion") or entry.get("date"),
                    "location": entry.get("location") or entry.get("venue"),
                    "cta": entry.get("cta") or entry.get("call_to_action"),
                    "asset_intent": entry.get("asset_intent"),
                    "posting_time_suggestion": slot_time,
                    "hashtags": entry.get("hashtags") or [],
                    "visual_direction": entry.get("visual_direction") or entry.get("image_prompt") or "",
                    "estimated_engagement": entry.get("estimated_engagement") or "",
                    "strategic_purpose": entry.get("strategic_purpose") or entry.get("priority") or "",
                }
            )
        )

    return {
        "action_type": "schedule_instagram_posts",
        "provider": "instagram",
        "approval_required": True,
        "payload": {
            "posts": posts,
            "ideas": calendar_ideas,
            "duration_days": params.get("duration_days", 7),
            "frequency": params.get("frequency", "daily"),
        },
        "human_readable": f"{len(posts)} gönderi {params.get('duration_days', 7)} günlük takvime eklendi.",
    }


def extract_campaign_analysis_action(raw_output: str) -> dict[str, Any]:
    """
    Parse ads agent campaign analysis output.

    Expected LLM output:
    {
        "summary": "...",
        "recommendations": [
            {
                "campaign": "...",
                "issue": "...",
                "action": "...",
                "expected_impact": "...",
                "priority": "high|medium|low"
            }
        ],
        "budget_changes": [...],
        "overall_health_score": 7.2
    }
    """
    parsed = _try_parse_json(raw_output)

    if isinstance(parsed, dict):
        recommendations = parsed.get("recommendations") or parsed.get("actions") or []
        budget_changes = parsed.get("budget_changes") or []
        summary = parsed.get("summary") or parsed.get("analysis", "")
        health_score = parsed.get("overall_health_score") or parsed.get("health_score")
    else:
        recommendations = []
        budget_changes = []
        summary = raw_output
        health_score = None

    return {
        "action_type": "apply_campaign_recommendations",
        "provider": "google_ads",
        "approval_required": True,
        "payload": {
            "summary": summary,
            "recommendations": recommendations,
            "budget_changes": budget_changes,
            "health_score": health_score,
        },
        "human_readable": f"{len(recommendations)} reklam optimizasyon önerisi üretildi.",
    }


def extract_ad_creative_action(
    raw_output: str,
    parameters: dict | None = None,
) -> dict[str, Any]:
    """Parse ad creative generation output."""
    parsed = _try_parse_json(raw_output)
    params = parameters or {}

    if isinstance(parsed, dict):
        creatives = parsed.get("creatives") or parsed.get("ads") or [parsed]
    elif isinstance(parsed, list):
        creatives = parsed
    else:
        creatives = [{"headline": "AI Reklam Önerisi", "body": raw_output}]

    return {
        "action_type": "create_ad_creatives",
        "provider": params.get("platform", "google_ads"),
        "approval_required": True,
        "payload": {
            "creatives": creatives,
            "platform": params.get("platform", "google_ads"),
            "objective": params.get("objective", "conversions"),
        },
        "human_readable": f"{len(creatives)} reklam kopyası üretildi.",
    }


def _validate_budget_changes(changes: list[dict], parsed: dict) -> dict[str, Any]:
    """Validate budget redistribution is numerically consistent."""
    warnings: list[str] = []

    total_current = sum(float(c.get("current_budget", 0)) for c in changes)
    total_recommended = sum(float(c.get("recommended_budget", 0)) for c in changes)

    if total_current > 0 and abs(total_current - total_recommended) / total_current > 0.02:
        warnings.append(
            f"Bütçe nötr değil: mevcut toplam {total_current:.2f}, önerilen toplam {total_recommended:.2f}. "
            "Fark %2'den büyük."
        )

    for c in changes:
        cur = float(c.get("current_budget", 0))
        rec = float(c.get("recommended_budget", 0))
        if cur > 0:
            if rec < cur * 0.10:
                warnings.append(
                    f"Kampanya {c.get('campaign_name', c.get('campaign_id', '?'))}: "
                    f"önerilen bütçe ({rec:.2f}) mevcut bütçenin %10'undan düşük ({cur:.2f})."
                )
            if rec > cur * 3.0:
                warnings.append(
                    f"Kampanya {c.get('campaign_name', c.get('campaign_id', '?'))}: "
                    f"önerilen bütçe ({rec:.2f}) mevcut bütçenin 3 katından yüksek ({cur:.2f})."
                )

        declared_pct = float(c.get("change_pct", 0))
        if cur > 0:
            actual_pct = ((rec - cur) / cur) * 100
            if abs(declared_pct - actual_pct) > 2.0:
                c["change_pct"] = round(actual_pct, 1)

    if total_current > 0 and abs(total_current - total_recommended) / total_current > 0.02:
        scale = total_current / total_recommended if total_recommended > 0 else 1
        for c in changes:
            c["recommended_budget"] = round(float(c.get("recommended_budget", 0)) * scale, 2)
            cur = float(c.get("current_budget", 0))
            rec = float(c.get("recommended_budget", 0))
            c["change_pct"] = round(((rec - cur) / cur) * 100, 1) if cur > 0 else 0.0
        warnings.append("Bütçeler toplam tutarlılık için ölçeklendirildi.")

    return {
        "validated_changes": changes,
        "total_current": round(total_current, 2),
        "total_recommended": round(sum(float(c.get("recommended_budget", 0)) for c in changes), 2),
        "warnings": warnings,
    }


def extract_budget_optimization_action(raw_output: str) -> dict[str, Any]:
    """Parse budget optimization output into an actionable budget change payload."""
    parsed = _try_parse_json(raw_output)

    if isinstance(parsed, dict):
        campaign_changes = parsed.get("campaign_changes") or []
        projected = parsed.get("overall_projected_improvement") or ""
        risk = parsed.get("risk_assessment") or ""
    else:
        campaign_changes = []
        projected = raw_output[:200]
        risk = ""

    validation = _validate_budget_changes(campaign_changes, parsed if isinstance(parsed, dict) else {})

    human_parts = [f"{len(campaign_changes)} kampanya için bütçe optimizasyonu önerisi üretildi."]
    if validation["warnings"]:
        human_parts.append(f"⚠ {len(validation['warnings'])} uyarı: " + "; ".join(validation["warnings"]))

    return {
        "action_type": "apply_budget_optimization",
        "provider": "google_ads",
        "approval_required": True,
        "payload": {
            "campaign_changes": validation["validated_changes"],
            "total_current_daily": validation["total_current"],
            "total_recommended_daily": validation["total_recommended"],
            "projected_improvement": projected,
            "risk_assessment": risk,
            "validation_warnings": validation["warnings"],
            "full_recommendation": parsed if isinstance(parsed, dict) else {"raw": raw_output},
        },
        "human_readable": " ".join(human_parts),
    }


def extract_analytics_report_action(
    raw_output: str,
    task_type: str = "traffic_analysis",
) -> dict[str, Any]:
    """Parse analytics agent output into a structured report payload."""
    parsed = _try_parse_json(raw_output)

    report_type_labels = {
        "traffic_analysis": "Trafik Analiz Raporu",
        "conversion_report": "Dönüşüm Raporu",
        "weekly_performance": "Haftalık Performans Raporu",
    }

    if isinstance(parsed, dict):
        summary = (
            parsed.get("executive_summary")
            or parsed.get("headline")
            or parsed.get("conversion_summary")
            or raw_output[:200]
        )
        recommendations = parsed.get("recommendations") or parsed.get("action_items") or []
    else:
        summary = raw_output[:200]
        recommendations = []

    return {
        "action_type": "log_analytics_report",
        "provider": "system",
        "approval_required": False,
        "payload": {
            "report_type": task_type,
            "title": report_type_labels.get(task_type, "Analitik Raporu"),
            "summary": summary,
            "recommendations": recommendations,
            "full_report": parsed if isinstance(parsed, dict) else {"raw": raw_output},
        },
        "human_readable": f"{report_type_labels.get(task_type, 'Rapor')} oluşturuldu.",
    }


def extract_content_strategy_action(
    raw_output: str,
    parameters: dict | None = None,
) -> dict[str, Any]:
    """Parse content strategy output into a weekly strategy action payload."""
    parsed = _try_parse_json(raw_output)
    params = parameters or {}
    data = parsed if isinstance(parsed, dict) else {}

    mission_brief = (
        data.get("mission_brief")
        or data.get("brief")
        or raw_output[:800]
    )
    missing_question = str(data.get("missing_question") or "").strip()
    ready = bool(data.get("ready_for_gram_master", not missing_question))

    return {
        "action_type": "create_weekly_content_strategy",
        "provider": "system",
        "approval_required": True,
        "payload": {
            "weekly_theme": data.get("weekly_theme") or "Weekly content strategy",
            "mission_brief": mission_brief,
            "pillar_mix": data.get("pillar_mix") or [],
            "recommended_formats": data.get("recommended_formats") or [],
            "template_use_cases": data.get("template_use_cases") or [],
            "asset_intents": data.get("asset_intents") or [],
            "missing_question": missing_question,
            "ready_for_gram_master": ready,
            "strategy_notes": data.get("strategy_notes") or [],
            "content_pillars": params.get("content_pillars") or params.get("contentPillars") or [],
            "time_period": params.get("time_period", "next week"),
            "full_strategy": data if data else {"raw": raw_output},
        },
        "human_readable": mission_brief[:240] if mission_brief else "Weekly content strategy created.",
    }


# ── Main dispatch ────────────────────────────────────────────────────────────

def extract_action(
    agent_role: str,
    task_type: str,
    raw_output: str,
    review_context: dict | None = None,
    parameters: dict | None = None,
) -> dict[str, Any]:
    """
    Main entry point: map (agent_role, task_type, raw_output) → action payload.

    Returns a dict with:
    - action_type: str          (maps to provider API call)
    - provider: str             (google_business | instagram | google_ads | system)
    - approval_required: bool
    - payload: dict             (structured data for the provider)
    - human_readable: str       (summary shown in UI)
    """
    if agent_role == "review_agent":
        if task_type == "single_review_response":
            return extract_review_response_action(raw_output, review_context)
        return extract_review_analysis_action(raw_output)

    if agent_role == "content_agent":
        if task_type == "content_calendar":
            return extract_content_calendar_action(raw_output, parameters)
        return extract_content_ideation_action(raw_output, parameters)

    if agent_role == "content_strategy_agent":
        return extract_content_strategy_action(raw_output, parameters)

    if agent_role == "ads_agent":
        if task_type == "ad_creative_generation":
            return extract_ad_creative_action(raw_output, parameters)
        if task_type in {"auto_budget_optimize", "ads_budget_optimization"}:
            return extract_budget_optimization_action(raw_output)
        return extract_campaign_analysis_action(raw_output)

    if agent_role == "analytics_agent":
        return extract_analytics_report_action(raw_output, task_type)

    # Fallback
    return {
        "action_type": "generic_output",
        "provider": "system",
        "approval_required": False,
        "payload": {"raw_output": raw_output},
        "human_readable": raw_output[:200] if raw_output else "",
    }
