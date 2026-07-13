"""
Merge multiple content_ideation node outputs into one weekly Feed package batch.

Target per mission (plan-aware):
  Starter: 4 post · 3 story · 1 carousel · 4 reel (12)
  Agency:  6 post · 3 story · 1 carousel · 6 reel (16)
"""

from __future__ import annotations

import json
from typing import Any

from app.services.output_summary_parser import extract_object_array_from_output_summary
from app.services.package_weekly_geometry import (
    AGENCY_WEEKLY_GEOMETRY,
    resolve_weekly_package_geometry,
)

# Aligns with apps/web MISSION_WEEKLY_PACKAGE_COUNTS (Agency default)
MISSION_FEED_PACKAGE_TOTAL = AGENCY_WEEKLY_GEOMETRY["total"]
MISSION_OPPORTUNITY_PACKAGE_TOTAL = 3
OPPORTUNITY_FORMAT_TARGETS: dict[str, int] = {
    "story": 1,
    "post": 1,
    "reel": 1,
}


def resolve_feed_package_total(
    mission_type: str | None = None,
    hub_production_package: str | None = None,
    subscription_plan_slug: str | None = None,
) -> int:
    hub = str(hub_production_package or "").strip().lower()
    if hub == "opportunity":
        return MISSION_OPPORTUNITY_PACKAGE_TOTAL
    if str(mission_type or "").strip().lower() == "opportunity":
        return MISSION_OPPORTUNITY_PACKAGE_TOTAL
    return resolve_weekly_package_geometry(subscription_plan_slug)["total"]


def resolve_format_targets(
    mission_type: str | None = None,
    subscription_plan_slug: str | None = None,
) -> dict[str, int]:
    if str(mission_type or "").strip().lower() == "opportunity":
        return OPPORTUNITY_FORMAT_TARGETS
    geo = resolve_weekly_package_geometry(subscription_plan_slug)
    return {
        "story": geo["story"],
        "post": geo["post"],
        "carousel": geo["carousel"],
        "reel": geo["reel"],
    }

_IDEATION_NODE_ORDER = (
    "weekly_content_ideation",
    "content_ideation",
    "post_ideation",
    "reel_ideation",
)


def _idea_format(idea: dict[str, Any]) -> str:
    parts = [
        str(idea.get("content_type") or ""),
        str(idea.get("format") or ""),
        str(idea.get("content_kind") or ""),
    ]
    blob = " ".join(parts).lower()
    if "reel" in blob:
        return "reel"
    if "carousel" in blob:
        return "carousel"
    if "story" in blob:
        return "story"
    return "post"


def _idea_dedupe_key(idea: dict[str, Any]) -> str:
    for field in ("concept_title", "idea_title", "headline", "caption_draft"):
        val = str(idea.get(field) or "").strip().lower()
        if len(val) >= 8:
            return val[:120]
    return json.dumps(idea, sort_keys=True, ensure_ascii=False)[:200]


def parse_ideation_ideas_from_summary(output_summary: str) -> list[dict[str, Any]]:
    return extract_object_array_from_output_summary(output_summary)


def _payload_object_array(node: dict[str, Any]) -> list[dict[str, Any]]:
    payload = node.get("output_payload")
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("ideas", "content_ideas", "contentIdeas"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    return []


def _select_diverse_ideas(
    pool: list[dict[str, Any]],
    target: int,
) -> list[dict[str, Any]]:
    """
    Pick `target` ideas from `pool`, preferring distinct headlines over
    near-duplicates (e.g. "Kahvaltı keyfi" vs "Kahvaltı keyfi başlıyor").

    Diversity-aware but count-preserving: near-duplicates are deferred, not
    dropped — if there are not enough distinct headlines to fill `target`, the
    deferred ideas are added back in their original order. This never yields
    fewer ideas than `pool[:target]` would, so the weekly package count is
    unaffected while repetitive headlines are pushed out when alternatives exist.
    """
    if target <= 0 or not pool:
        return pool[:target]
    selected: list[dict[str, Any]] = []
    deferred: list[dict[str, Any]] = []
    for idea in pool:
        if len(selected) >= target:
            break
        headline = _idea_headline(idea)
        if headline and any(
            _headlines_match(headline, _idea_headline(s)) for s in selected
        ):
            deferred.append(idea)
            continue
        selected.append(idea)
    for idea in deferred:
        if len(selected) >= target:
            break
        selected.append(idea)
    return selected


def merge_ideation_ideas(
    idea_lists: list[list[dict[str, Any]]],
    *,
    mission_type: str | None = None,
    subscription_plan_slug: str | None = None,
) -> list[dict[str, Any]]:
    """Pick ideas across batches to hit format targets; dedupe by title."""
    format_targets = resolve_format_targets(mission_type, subscription_plan_slug)
    package_total = resolve_feed_package_total(
        mission_type,
        subscription_plan_slug=subscription_plan_slug,
    )
    buckets: dict[str, list[dict[str, Any]]] = {
        "story": [],
        "post": [],
        "carousel": [],
        "reel": [],
    }
    seen: set[str] = set()

    for ideas in idea_lists:
        for idea in ideas:
            key = _idea_dedupe_key(idea)
            if key in seen:
                continue
            seen.add(key)
            fmt = _idea_format(idea)
            buckets.setdefault(fmt, []).append(idea)

    merged: list[dict[str, Any]] = []
    for fmt, target in format_targets.items():
        pool = buckets.get(fmt, [])
        merged.extend(_select_diverse_ideas(pool, target))

    if len(merged) < package_total:
        overflow: list[dict[str, Any]] = []
        for fmt in ("story", "post", "reel", "carousel"):
            for idea in buckets.get(fmt, []):
                if idea not in merged:
                    overflow.append(idea)
        for idea in overflow:
            if len(merged) >= package_total:
                break
            if idea not in merged:
                merged.append(idea)

    return merged[:package_total]


def _calendar_item_headline(plan: dict[str, Any]) -> str:
    return str(
        plan.get("event_name")
        or plan.get("title")
        or plan.get("headline")
        or plan.get("concept_title")
        or plan.get("theme")
        or ""
    ).strip()


def _normalize_calendar_day(raw: Any) -> str | None:
    s = str(raw or "").strip()
    if not s:
        return None
    iso = __import__("re").match(r"^(\d{4}-\d{2}-\d{2})", s)
    if iso:
        from datetime import datetime

        try:
            d = datetime.fromisoformat(f"{iso.group(1)}T12:00:00")
            return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d.weekday()]
        except Exception:
            pass
    token = s.split()[0].strip().lower() if s.split() else s.lower()
    day_map = {
        "pzt": "Mon", "mon": "Mon", "monday": "Mon",
        "sal": "Tue", "tue": "Tue", "tuesday": "Tue",
        "çar": "Wed", "car": "Wed", "wed": "Wed", "wednesday": "Wed",
        "per": "Thu", "thu": "Thu", "thursday": "Thu",
        "cum": "Fri", "fri": "Fri", "friday": "Fri",
        "cmt": "Sat", "sat": "Sat", "saturday": "Sat",
        "paz": "Sun", "sun": "Sun", "sunday": "Sun",
    }
    if token in day_map:
        return day_map[token]
    cap = token[:1].upper() + token[1:3]
    if cap in {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}:
        return cap
    return token


def headlines_match(a: str, b: str) -> bool:
    return _headlines_match(a, b)


def dedupe_ideation_by_headline(ideas: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep the first idea for each distinct headline (near-duplicate aware)."""
    selected: list[dict[str, Any]] = []
    for idea in ideas:
        if not isinstance(idea, dict):
            continue
        headline = _idea_headline(idea)
        if headline and any(headlines_match(headline, _idea_headline(s)) for s in selected):
            continue
        selected.append(idea)
    return selected


def _headlines_match(a: str, b: str) -> bool:
    def norm(s: str) -> str:
        import re

        return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", s.lower(), flags=re.UNICODE)).strip()

    na, nb = norm(a), norm(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    if len(na) >= 8 and len(nb) >= 8 and (na in nb or nb in na):
        return True
    return False


def _resolve_planning_caption(idea: dict[str, Any] | None, plan: dict[str, Any]) -> str:
    if idea:
        for key in ("caption_draft", "caption"):
            val = str(idea.get(key) or "").strip()
            if val:
                return val
    for key in ("caption_draft", "caption"):
        val = str(plan.get(key) or "").strip()
        if val:
            return val
    tagline = str(
        plan.get("tagline") or plan.get("subline")
        or (idea or {}).get("tagline") or (idea or {}).get("subline") or ""
    ).strip()
    brief = str(
        plan.get("content_brief") or plan.get("description") or plan.get("brief")
        or (idea or {}).get("brief") or ""
    ).strip()
    parts = [p for p in (tagline, brief) if p]
    if parts:
        return " — ".join(parts)
    return _calendar_item_headline(plan) or _idea_headline(idea or {})


def _pick_ideation_for_calendar_strict(
    plan: dict[str, Any],
    ideas: list[dict[str, Any]],
    used: set[int],
) -> tuple[dict[str, Any] | None, int | None]:
    idea_idx = plan.get("idea_index")
    if idea_idx is None:
        idea_idx = plan.get("source_idea_index")
    if isinstance(idea_idx, int) and 0 <= idea_idx < len(ideas) and idea_idx not in used:
        return ideas[idea_idx], idea_idx

    cal_title = _calendar_item_headline(plan)
    if cal_title:
        for i, idea in enumerate(ideas):
            if i in used:
                continue
            if _headlines_match(cal_title, _idea_headline(idea)):
                return idea, i
    return None, None


def _pick_ideation_for_calendar(
    plan: dict[str, Any],
    plan_index: int,
    ideas: list[dict[str, Any]],
    used: set[int],
) -> tuple[dict[str, Any] | None, int | None]:
    idea_idx = plan.get("idea_index")
    if idea_idx is None:
        idea_idx = plan.get("source_idea_index")
    if isinstance(idea_idx, int) and 0 <= idea_idx < len(ideas) and idea_idx not in used:
        return ideas[idea_idx], idea_idx

    cal_title = _calendar_item_headline(plan)
    if cal_title:
        for i, idea in enumerate(ideas):
            if i in used:
                continue
            if _headlines_match(cal_title, _idea_headline(idea)):
                return idea, i

    if plan_index < len(ideas) and plan_index not in used:
        return ideas[plan_index], plan_index

    for i, idea in enumerate(ideas):
        if i not in used:
            return idea, i
    return None, None


def _merge_plan_with_ideation(
    plan: dict[str, Any],
    plan_index: int,
    idea: dict[str, Any] | None,
    idea_index: int | None,
) -> dict[str, Any]:
    fmt = _calendar_format(plan)
    cal_title = _calendar_item_headline(plan)
    day = _normalize_calendar_day(
        plan.get("date") or plan.get("day") or plan.get("publish_day") or plan.get("scheduled_day")
    )
    time = str(plan.get("time") or plan.get("scheduled_time") or plan.get("publish_time") or "").strip()
    caption = _resolve_planning_caption(idea, plan)
    hashtags = (idea or {}).get("hashtags") or plan.get("hashtags") or plan.get("hashtag_set") or []
    headline = _idea_headline(idea or {}) or cal_title
    subline = str(
        plan.get("tagline") or plan.get("subline")
        or (idea or {}).get("tagline") or (idea or {}).get("subline") or ""
    ).strip()
    cta = str((idea or {}).get("cta") or plan.get("cta_text") or plan.get("cta") or "").strip()
    visual_direction = str(
        plan.get("visual_direction") or plan.get("photo_mood") or plan.get("visual_style")
        or plan.get("visual_mood") or (idea or {}).get("visual_direction")
        or (idea or {}).get("photo_mood") or ""
    ).strip()
    posting = str(
        (idea or {}).get("posting_time_suggestion") or (idea or {}).get("postingTime") or ""
    ).strip()
    if not posting:
        posting = " ".join(p for p in (str(plan.get("date") or "").strip(), time) if p)

    row = dict(idea or {})
    event_details = dict(row.get("event_details") or {}) if isinstance(row.get("event_details"), dict) else {}
    if plan.get("date"):
        event_details["date"] = str(plan.get("date") or "").strip()
    if time:
        event_details["time"] = time
    if subline:
        event_details["tagline"] = subline
    if plan.get("venue_area"):
        event_details["venue_area"] = str(plan.get("venue_area") or "").strip()

    row.update({
        "concept_title": headline,
        "headline": headline,
        "title": headline,
        "caption_draft": caption,
        "caption": caption,
        "subline": subline or None,
        "cta": cta or None,
        "hashtags": hashtags,
        "content_type": _content_type_for_format(fmt),
        "content_kind": _content_type_for_format(fmt),
        "format": fmt,
        "calendar_plan_index": plan_index,
        "idea_index": idea_index if idea_index is not None else plan_index,
        "source_node": "content_calendar",
        "publish_schedule_day": day,
        "publish_schedule_time": time or None,
        "publish_schedule_format": fmt,
        "posting_time_suggestion": posting or None,
        "calendar_priority": plan.get("priority") or plan.get("must_post"),
        "calendar_announcement_type": plan.get("announcement_type") or plan.get("type"),
        "visual_direction": visual_direction or None,
        "strategic_purpose": plan.get("strategic_purpose") or row.get("strategic_purpose"),
        "template_use_case": plan.get("template_use_case") or plan.get("announcement_type")
        or row.get("template_use_case"),
        "event_details": event_details or None,
        "mood": plan.get("photo_mood") or row.get("mood"),
    })
    return row


def _parse_calendar_plans(output_summary: str) -> list[dict[str, Any]]:
    return extract_object_array_from_output_summary(output_summary)


def _parse_calendar_plans_from_node(node: dict[str, Any]) -> list[dict[str, Any]]:
    payload_items = _payload_object_array(node)
    if payload_items:
        return payload_items[:32]
    return _parse_calendar_plans(str(node.get("output_summary") or ""))[:32]


def _calendar_format(plan: dict[str, Any]) -> str:
    blob = " ".join(
        str(plan.get(k) or "")
        for k in ("format", "content_type", "content_kind")
    ).lower().replace("instagram_", "")
    if "reel" in blob:
        return "reel"
    if "carousel" in blob:
        return "carousel"
    if "story" in blob:
        return "story"
    return "post"


def _content_type_for_format(fmt: str) -> str:
    if fmt == "reel":
        return "instagram_reel"
    if fmt == "carousel":
        return "instagram_carousel"
    if fmt == "story":
        return "instagram_story"
    return "instagram_post"


def _idea_headline(idea: dict[str, Any]) -> str:
    for field in ("concept_title", "idea_title", "headline", "title"):
        val = str(idea.get(field) or "").strip()
        if val:
            return val
    return ""


def _clone_idea_for_format(donor: dict[str, Any], fmt: str, slot_index: int) -> dict[str, Any]:
    headline = _idea_headline(donor) or f"Haftalık {fmt} {slot_index + 1}"
    cloned = dict(donor)
    cloned.update({
        "concept_title": headline,
        "headline": headline,
        "title": headline,
        "content_type": _content_type_for_format(fmt),
        "content_kind": _content_type_for_format(fmt),
        "format": fmt,
        "source_node": "format_backfill",
        "manifest_slot_backfill": True,
    })
    return cloned


def ensure_weekly_format_coverage(
    primary: list[dict[str, Any]],
    pool: list[dict[str, Any]],
    *,
    mission_type: str | None = None,
    subscription_plan_slug: str | None = None,
) -> list[dict[str, Any]]:
    """P1-5 — weekly or opportunity format coverage (parity with TS ensureWeeklyFormatCoverage)."""
    format_targets = resolve_format_targets(mission_type, subscription_plan_slug)
    package_total = resolve_feed_package_total(
        mission_type,
        subscription_plan_slug=subscription_plan_slug,
    )
    buckets: dict[str, list[dict[str, Any]]] = {
        "story": [],
        "post": [],
        "carousel": [],
        "reel": [],
    }
    used: set[str] = set()

    def track(idea: dict[str, Any]) -> str:
        return f"{_idea_headline(idea)}|{_idea_format(idea)}"

    for idea in primary:
        fmt = _idea_format(idea)
        if len(buckets.get(fmt, [])) < format_targets.get(fmt, 0):
            buckets.setdefault(fmt, []).append(idea)
            used.add(track(idea))

    for fmt, target in format_targets.items():
        while len(buckets.get(fmt, [])) < target:
            donor = next(
                (i for i in pool if _idea_format(i) == fmt and track(i) not in used),
                None,
            )
            if donor is None:
                donor = next((i for i in pool if track(i) not in used), None)
            if donor is None:
                donor = primary[0] if primary else (pool[0] if pool else None)
            if donor is None:
                break
            next_idea = donor if _idea_format(donor) == fmt else _clone_idea_for_format(
                donor, fmt, len(buckets.get(fmt, [])),
            )
            buckets.setdefault(fmt, []).append(next_idea)
            used.add(track(next_idea))

    ordered: list[dict[str, Any]] = []
    for fmt in ("story", "post", "carousel", "reel"):
        ordered.extend(buckets.get(fmt, []))
    trimmed = ordered[:package_total]
    for idx, idea in enumerate(trimmed):
        idea["idea_index"] = idx
    return trimmed


def _calendar_schedule_overlay_fields(
    plan: dict[str, Any],
    plan_index: int,
    idea_index: int,
) -> dict[str, Any]:
    fmt = _calendar_format(plan)
    day = _normalize_calendar_day(
        plan.get("date") or plan.get("day") or plan.get("publish_day") or plan.get("scheduled_day")
    )
    time = str(plan.get("time") or plan.get("scheduled_time") or plan.get("publish_time") or "").strip()
    posting = " ".join(
        p for p in (str(plan.get("date") or "").strip(), time) if p
    ).strip()
    fields: dict[str, Any] = {
        "calendar_plan_index": plan_index,
        "calendar_linked_idea_index": idea_index,
        "publish_schedule_day": day,
        "publish_schedule_format": fmt,
        "calendar_priority": plan.get("priority") or plan.get("must_post"),
        "calendar_announcement_type": plan.get("announcement_type") or plan.get("type"),
    }
    if time:
        fields["publish_schedule_time"] = time
    if posting:
        fields["posting_time_suggestion"] = posting
    return fields


def _merge_event_details_from_calendar(
    idea: dict[str, Any],
    plan: dict[str, Any],
) -> dict[str, Any] | None:
    subline = str(plan.get("tagline") or plan.get("subline") or "").strip()
    time = str(plan.get("time") or plan.get("scheduled_time") or plan.get("publish_time") or "").strip()
    base = dict(idea.get("event_details") or {}) if isinstance(idea.get("event_details"), dict) else {}
    artist_line = str(
        plan.get("artist_name")
        or plan.get("dj_lineup")
        or plan.get("lineup")
        or plan.get("dj")
        or base.get("artist_name")
        or ""
    ).strip()
    merged = {
        **base,
        "date": str(plan.get("date") or base.get("date") or "").strip() or None,
        "time": time or base.get("time"),
        "tagline": subline or base.get("tagline"),
        "venue_area": str(plan.get("venue_area") or base.get("venue_area") or "").strip() or None,
        "artist_name": artist_line or None,
    }
    cleaned = {k: v for k, v in merged.items() if v}
    return cleaned or None


def _enrich_ideation_with_calendar_plan(
    idea: dict[str, Any],
    plan: dict[str, Any],
    plan_index: int,
    idea_index: int,
) -> dict[str, Any]:
    overlay = _calendar_schedule_overlay_fields(plan, plan_index, idea_index)
    event_details = _merge_event_details_from_calendar(idea, plan)
    cal_title = _calendar_item_headline(plan)
    tagline = str(plan.get("tagline") or plan.get("subline") or "").strip()
    brief = str(
        plan.get("content_brief") or plan.get("description") or plan.get("brief") or plan.get("caption") or ""
    ).strip()
    mood = str(
        plan.get("photo_mood") or plan.get("mood") or plan.get("visual_direction") or plan.get("visual_style") or ""
    ).strip()
    fmt = _calendar_format(plan)
    announcement = str(plan.get("announcement_type") or plan.get("type") or plan.get("template_use_case") or "").strip()
    ideation_caption = str(idea.get("caption_draft") or idea.get("caption") or "").strip()
    caption = brief or ideation_caption or " — ".join(p for p in (tagline, cal_title) if p)
    headline = cal_title or _idea_headline(idea)
    vps = dict(idea.get("visual_production_spec") or {}) if isinstance(idea.get("visual_production_spec"), dict) else {}

    row: dict[str, Any] = {
        **idea,
        **overlay,
        "calendar_enriched": True,
        "concept_title": headline,
        "headline": headline,
        "title": headline,
        "caption_draft": caption,
        "caption": caption,
        "content_type": _content_type_for_format(fmt),
        "content_kind": _content_type_for_format(fmt),
        "format": fmt,
        "calendar_gallery_designed": True,
        "visual_production_spec": {
            **vps,
            "treatment": vps.get("treatment") or "gallery_designed",
            "announcement_type": announcement or vps.get("announcement_type"),
            "photo_mood": mood or vps.get("photo_mood"),
            "content_brief": brief or vps.get("content_brief"),
        },
    }
    if brief:
        row["content_brief"] = brief
    if tagline:
        row["tagline"] = tagline
        row["subline"] = tagline
    if mood:
        row["photo_mood"] = mood
        row["mood"] = mood
        row["visual_direction"] = mood
    if event_details:
        row["event_details"] = event_details
    if announcement:
        row.setdefault("template_use_case", announcement)
        row["calendar_announcement_type"] = announcement

    from app.services.calendar_design_layout import (
        apply_calendar_design_layout_to_row,
        normalize_calendar_plan_design_layout,
        resolve_calendar_design_layout,
    )

    normalized_plan = normalize_calendar_plan_design_layout(plan)
    channel = "story" if "story" in fmt.lower() else "post"
    user_layout = str(
        normalized_plan.get("design_layout_family") or plan.get("design_layout_family") or ""
    ).strip()
    layout = resolve_calendar_design_layout(
        announcement_type=announcement,
        channel=channel,
        explicit_layout_family=user_layout if normalized_plan.get("design_layout_locked") else None,
    )
    row = apply_calendar_design_layout_to_row(row, layout)
    row["fal_design_hint"] = f"calendar layout:{layout['canva_archetype_id']}"
    return row


def apply_calendar_production_enrichment(
    ideation_records: list[dict[str, Any]],
    calendar_plans: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Enrich matched ideation rows with calendar brief/schedule.
    Returns (enriched_ideas, orphan_calendar_ideas, all_calendar_production_ideas).

    Additive production: every calendar plan becomes a production row (matched or orphan).
    Matched plans still enrich their ideation twin for caption/schedule quality.
    """
    result: list[dict[str, Any]] = []
    for index, idea in enumerate(ideation_records):
        row = dict(idea)
        row["idea_index"] = index
        row["source_node"] = row.get("source_node") or "content_ideation"
        row.setdefault("content_type", row.get("content_kind") or "instagram_post")
        result.append(row)

    orphan_ideas: list[dict[str, Any]] = []
    calendar_production_ideas: list[dict[str, Any]] = []
    if not calendar_plans:
        return result, orphan_ideas, calendar_production_ideas

    used: set[int] = set()
    for plan_index, plan in enumerate(calendar_plans):
        built = build_calendar_production_ideas([plan])
        if not built:
            continue
        calendar_row = dict(built[0])
        _, idea_index = _pick_ideation_for_calendar_strict(plan, result, used)
        if idea_index is None or idea_index < 0 or idea_index >= len(result):
            orphan_ideas.append(calendar_row)
            calendar_row = {**calendar_row, "production_scope": "calendar_orphan"}
            calendar_production_ideas.append(calendar_row)
            continue
        used.add(idea_index)
        result[idea_index] = _enrich_ideation_with_calendar_plan(
            result[idea_index], plan, plan_index, idea_index,
        )
        calendar_row = {
            **calendar_row,
            "calendar_linked_idea_index": idea_index,
            "planning_idea_index": idea_index,
            "production_scope": "calendar_plan",
        }
        calendar_production_ideas.append(calendar_row)
    return result, orphan_ideas, calendar_production_ideas


def build_content_production_items_from_records(
    ideation_records: list[dict[str, Any]],
    calendar_plans: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Additive pool: every unique ideation + every calendar plan. No format backfill."""
    seeded = [
        {**idea, "idea_index": index, "planning_idea_index": index}
        for index, idea in enumerate(ideation_records)
    ]
    enriched, _orphan_ideas, calendar_ideas = apply_calendar_production_enrichment(
        seeded, calendar_plans,
    )
    if not enriched and not calendar_ideas:
        return [
            {**idea, "idea_index": index, "planning_idea_index": index, "production_scope": "ideation"}
            for index, idea in enumerate(ideation_records)
        ]
    enriched_items = [
        {
            **idea,
            "idea_index": index,
            "planning_idea_index": idea.get("planning_idea_index", idea.get("calendar_linked_idea_index", index)),
            "production_scope": "ideation",
        }
        for index, idea in enumerate(enriched)
    ]
    calendar_items = [
        {
            **idea,
            "idea_index": len(enriched_items) + i,
            "production_scope": idea.get("production_scope")
            or ("calendar_plan" if idea.get("calendar_linked_idea_index") is not None else "calendar_orphan"),
        }
        for i, idea in enumerate(calendar_ideas)
    ]
    return enriched_items + calendar_items


def merge_calendar_plans_for_production(
    ideation_records: list[dict[str, Any]],
    calendar_plans: list[dict[str, Any]],
    *,
    mission_type: str | None = None,
    subscription_plan_slug: str | None = None,
) -> list[dict[str, Any]]:
    """Ideation + every calendar plan — content-scoped additive pool (TS parity)."""
    _ = mission_type, subscription_plan_slug
    return build_content_production_items_from_records(ideation_records, calendar_plans)


def apply_calendar_schedule_overlay(
    ideation_records: list[dict[str, Any]],
    calendar_plans: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Compat — enriched ideation rows only (calendar rows handled in merge)."""
    ideas, _orphans, _calendar = apply_calendar_production_enrichment(
        ideation_records, calendar_plans,
    )
    return ideas


def _apply_calendar_schedule_overlay_legacy(
    ideation_records: list[dict[str, Any]],
    calendar_plans: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Legacy loose matching — kept for reference tests if needed."""
    result: list[dict[str, Any]] = []
    for index, idea in enumerate(ideation_records):
        row = dict(idea)
        row["idea_index"] = index
        row["source_node"] = row.get("source_node") or "content_ideation"
        row.setdefault("content_type", row.get("content_kind") or "instagram_post")
        result.append(row)

    if not calendar_plans:
        return result

    used: set[int] = set()
    for plan_index, plan in enumerate(calendar_plans):
        _, idea_index = _pick_ideation_for_calendar(plan, plan_index, result, used)
        if idea_index is None or idea_index < 0 or idea_index >= len(result):
            continue
        used.add(idea_index)
        overlay = _calendar_schedule_overlay_fields(plan, plan_index, idea_index)
        event_details = _merge_event_details_from_calendar(result[idea_index], plan)
        row = {**result[idea_index], **overlay}
        if event_details:
            row["event_details"] = event_details
        template = plan.get("template_use_case") or plan.get("announcement_type")
        if template and not row.get("template_use_case"):
            row["template_use_case"] = template
        result[idea_index] = row
    return result


def collect_unique_ideation_from_nodes(
    nodes: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Unique ideation rows across completed nodes (TS collectUniqueMissionIdeationIdeas parity)."""
    completed = [
        n for n in nodes
        if n.get("task_type") == "content_ideation"
        and n.get("status") == "completed"
        and len(str(n.get("output_summary") or "").strip()) > 20
    ]
    if not completed:
        return []

    def sort_key(n: dict[str, Any]) -> tuple[int, str]:
        key = str(n.get("node_key") or "")
        try:
            idx = _IDEATION_NODE_ORDER.index(key)
        except ValueError:
            idx = 99
        return (idx, key)

    completed.sort(key=sort_key)
    all_ideas: list[dict[str, Any]] = []
    for node in completed:
        items = (
            _payload_object_array(node)
            or parse_ideation_ideas_from_summary(str(node.get("output_summary") or ""))
        )
        all_ideas.extend(items)
    return dedupe_ideation_by_headline(all_ideas)


def resolve_mission_production_target(
    idea_count: int,
    *,
    has_calendar: bool,
    mission_type: str | None = None,
    hub_production_package: str | None = None,
    subscription_plan_slug: str | None = None,
) -> int:
    """Content-scoped missions: produce every merged ideation+calendar row, not weekly 16 cap."""
    package_total = resolve_feed_package_total(
        mission_type,
        hub_production_package=hub_production_package,
        subscription_plan_slug=subscription_plan_slug,
    )
    if has_calendar and idea_count > 0:
        return idea_count
    return package_total


def merge_mission_production_ideas_from_nodes(
    nodes: list[dict[str, Any]],
    *,
    mission_type: str | None = None,
    subscription_plan_slug: str | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    """
    Ideation + calendar → additive content-scoped production pool (TS parity).
    Every unique ideation row AND every calendar plan becomes a production item.
    """
    calendar_nodes = [
        n for n in nodes
        if n.get("task_type") == "content_calendar"
        and n.get("status") == "completed"
    ]

    ideation_records = collect_unique_ideation_from_nodes(nodes)
    calendar_plans: list[dict[str, Any]] = []
    for node in calendar_nodes:
        calendar_plans.extend(_parse_calendar_plans_from_node(node))

    covered = merge_calendar_plans_for_production(
        ideation_records,
        calendar_plans,
        mission_type=mission_type,
        subscription_plan_slug=subscription_plan_slug,
    )
    if not covered:
        return "", []
    return json.dumps(covered, ensure_ascii=False), covered


def convert_calendar_plan_to_idea(plan: dict[str, Any], slot_index: int) -> dict[str, Any]:
    """Schedule-only calendar stub (legacy pool helper — not a production idea)."""
    return _calendar_schedule_overlay_fields(plan, slot_index, slot_index)


CALENDAR_PRODUCTION_IDEA_INDEX_BASE = 1000


def build_calendar_production_ideas(
    calendar_plans: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Map content_calendar rows → additive fal production ideas (TS parity)."""
    ideas: list[dict[str, Any]] = []
    for plan_index, plan in enumerate(calendar_plans[:32]):
        headline = _calendar_item_headline(plan)
        if not headline:
            continue
        tagline = str(plan.get("tagline") or plan.get("subline") or "").strip()
        content_brief = str(
            plan.get("content_brief") or plan.get("description") or plan.get("brief") or plan.get("caption") or ""
        ).strip()
        caption = content_brief or " — ".join(p for p in (tagline, headline) if p)
        photo_mood = str(
            plan.get("photo_mood") or plan.get("visual_direction") or plan.get("visual_style") or plan.get("visual_mood") or ""
        ).strip()
        announcement = str(
            plan.get("announcement_type") or plan.get("type") or plan.get("template_use_case") or ""
        ).strip().lower()
        fmt = _calendar_format(plan)
        day = _normalize_calendar_day(
            plan.get("date") or plan.get("day") or plan.get("publish_day") or plan.get("scheduled_day")
        )
        time = str(plan.get("time") or plan.get("scheduled_time") or plan.get("publish_time") or "").strip()
        posting = " ".join(p for p in (str(plan.get("date") or "").strip(), time) if p)
        event_details: dict[str, Any] = {}
        if plan.get("date"):
            event_details["date"] = str(plan.get("date") or "").strip()
        if time:
            event_details["time"] = time
        if tagline:
            event_details["tagline"] = tagline
        if plan.get("venue_area"):
            event_details["venue_area"] = str(plan.get("venue_area") or "").strip()
        artist_line = str(
            plan.get("artist_name")
            or plan.get("dj_lineup")
            or plan.get("lineup")
            or plan.get("dj")
            or ""
        ).strip()
        if artist_line:
            event_details["artist_name"] = artist_line

        from app.services.calendar_design_layout import (
            apply_calendar_design_layout_to_row,
            normalize_calendar_plan_design_layout,
            resolve_calendar_design_layout,
        )

        normalized_plan = normalize_calendar_plan_design_layout(plan)
        channel = "story" if "story" in fmt.lower() else "post"
        user_layout = str(
            normalized_plan.get("design_layout_family") or plan.get("design_layout_family") or ""
        ).strip()
        layout = resolve_calendar_design_layout(
            announcement_type=announcement,
            channel=channel,
            explicit_layout_family=user_layout if normalized_plan.get("design_layout_locked") else None,
        )

        idea_row = {
            "idea_index": CALENDAR_PRODUCTION_IDEA_INDEX_BASE + plan_index,
            "calendar_plan_index": plan_index,
            "source_node": "content_calendar",
            "source_track": "calendar",
            "concept_title": headline,
            "headline": headline,
            "title": headline,
            "tagline": tagline or None,
            "subline": tagline or None,
            "caption_draft": caption,
            "caption": caption,
            "content_brief": content_brief or None,
            "content_type": _content_type_for_format(fmt),
            "content_kind": _content_type_for_format(fmt),
            "format": fmt,
            "mood": photo_mood or None,
            "photo_mood": photo_mood or None,
            "visual_direction": photo_mood or None,
            "calendar_announcement_type": announcement or None,
            "template_use_case": announcement or plan.get("template_use_case"),
            "calendar_priority": plan.get("priority") or plan.get("must_post"),
            "publish_schedule_day": day,
            "publish_schedule_time": time or None,
            "publish_schedule_format": fmt,
            "posting_time_suggestion": posting or None,
            **({"event_details": event_details} if event_details else {}),
            "visual_production_spec": {
                "treatment": "fal_designed",
                "announcement_type": announcement,
                "photo_mood": photo_mood,
                "content_brief": content_brief,
            },
        }
        ideas.append(apply_calendar_design_layout_to_row(idea_row, layout))
    return ideas


def build_combined_idea_pool(
    nodes: list[dict[str, Any]],
    *,
    mission_type: str | None = None,
    subscription_plan_slug: str | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    """Alias for calendar-enriched merge — used by task_graph_executor."""
    return merge_mission_production_ideas_from_nodes(
        nodes,
        mission_type=mission_type,
        subscription_plan_slug=subscription_plan_slug,
    )


def merged_ideation_json_from_nodes(
    nodes: list[dict[str, Any]],
    *,
    mission_type: str | None = None,
    subscription_plan_slug: str | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    """
    nodes: {node_key, output_summary, status} dicts from mission progress.
    Returns (json string, ideas list).
    """
    completed = [
        n for n in nodes
        if n.get("task_type") == "content_ideation"
        and n.get("status") == "completed"
        and len(str(n.get("output_summary") or "").strip()) > 20
    ]
    if not completed:
        return "", []

    def sort_key(n: dict[str, Any]) -> tuple[int, str]:
        key = str(n.get("node_key") or "")
        try:
            idx = _IDEATION_NODE_ORDER.index(key)
        except ValueError:
            idx = 99
        return (idx, key)

    completed.sort(key=sort_key)
    lists = [
        (_payload_object_array(n) or parse_ideation_ideas_from_summary(str(n.get("output_summary") or "")))
        for n in completed
    ]
    merged = merge_ideation_ideas(
        lists,
        mission_type=mission_type,
        subscription_plan_slug=subscription_plan_slug,
    )
    if not merged:
        return "", []
    return json.dumps(merged, ensure_ascii=False), merged
