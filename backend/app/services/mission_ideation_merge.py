"""
Merge multiple content_ideation node outputs into one weekly Feed package batch.

Target per mission: 2 story + 2 post + 1 reel (5 total).
"""

from __future__ import annotations

import json
from typing import Any

from app.services.output_summary_parser import extract_object_array_from_output_summary

# Aligns with apps/web MISSION_WEEKLY_PACKAGE_COUNTS
MISSION_FEED_PACKAGE_TOTAL = 5
MISSION_OPPORTUNITY_PACKAGE_TOTAL = 3
FORMAT_TARGETS: dict[str, int] = {
    "story": 2,
    "post": 2,
    "carousel": 0,
    "reel": 1,
}
OPPORTUNITY_FORMAT_TARGETS: dict[str, int] = {
    "story": 1,
    "post": 1,
    "reel": 1,
}


def resolve_feed_package_total(
    mission_type: str | None = None,
    hub_production_package: str | None = None,
) -> int:
    hub = str(hub_production_package or "").strip().lower()
    if hub == "opportunity":
        return MISSION_OPPORTUNITY_PACKAGE_TOTAL
    if hub in {"weekly_content", "campaign", "event", "ads_focus"}:
        return MISSION_FEED_PACKAGE_TOTAL
    if str(mission_type or "").strip().lower() == "opportunity":
        return MISSION_OPPORTUNITY_PACKAGE_TOTAL
    return MISSION_FEED_PACKAGE_TOTAL


def resolve_format_targets(mission_type: str | None = None) -> dict[str, int]:
    if str(mission_type or "").strip().lower() == "opportunity":
        return OPPORTUNITY_FORMAT_TARGETS
    return FORMAT_TARGETS

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


def merge_ideation_ideas(
    idea_lists: list[list[dict[str, Any]]],
    *,
    mission_type: str | None = None,
) -> list[dict[str, Any]]:
    """Pick ideas across batches to hit format targets; dedupe by title."""
    format_targets = resolve_format_targets(mission_type)
    package_total = resolve_feed_package_total(mission_type)
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
        merged.extend(pool[:target])

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
        return payload_items[:12]
    return _parse_calendar_plans(str(node.get("output_summary") or ""))[:12]


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
) -> list[dict[str, Any]]:
    """P1-5 — weekly or opportunity format coverage (parity with TS ensureWeeklyFormatCoverage)."""
    format_targets = resolve_format_targets(mission_type)
    package_total = resolve_feed_package_total(mission_type)
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


def merge_mission_production_ideas_from_nodes(
    nodes: list[dict[str, Any]],
    *,
    mission_type: str | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    """
    Calendar + ideation merge with weekly format coverage (TS buildMissionProductionIdeas parity).
    Calendar rows drive format/schedule; ideation supplies caption, hashtags, and headlines.
    """
    ideation_nodes = [n for n in nodes if n.get("task_type") == "content_ideation"]
    calendar_nodes = [
        n for n in nodes
        if n.get("task_type") == "content_calendar"
        and n.get("status") == "completed"
    ]

    _, ideation_records = merged_ideation_json_from_nodes(ideation_nodes, mission_type=mission_type)
    calendar_plans: list[dict[str, Any]] = []
    for node in calendar_nodes:
        calendar_plans.extend(_parse_calendar_plans_from_node(node))

    if not calendar_plans:
        covered = ensure_weekly_format_coverage(
            ideation_records,
            ideation_records,
            mission_type=mission_type,
        )
        if not covered:
            return "", []
        return json.dumps(covered, ensure_ascii=False), covered

    used: set[int] = set()
    merged: list[dict[str, Any]] = []
    for plan_index, plan in enumerate(calendar_plans):
        idea, idea_index = _pick_ideation_for_calendar(
            plan, plan_index, ideation_records, used,
        )
        if idea_index is not None:
            used.add(idea_index)
        merged.append(_merge_plan_with_ideation(plan, plan_index, idea, idea_index))

    for idx, idea in enumerate(ideation_records):
        if idx in used:
            continue
        extra = dict(idea)
        extra["idea_index"] = idx
        extra["source_node"] = extra.get("source_node") or "content_ideation"
        merged.append(extra)

    pool = list(ideation_records)
    for plan_index, plan in enumerate(calendar_plans):
        pool.append(_merge_plan_with_ideation(plan, plan_index, None, None))

    covered = ensure_weekly_format_coverage(merged, pool, mission_type=mission_type)
    if not covered:
        return "", []
    return json.dumps(covered, ensure_ascii=False), covered


def convert_calendar_plan_to_idea(plan: dict[str, Any], slot_index: int) -> dict[str, Any]:
    """Convert a content_calendar plan to an idea-compatible dict (pool backfill)."""
    return _merge_plan_with_ideation(plan, slot_index, None, None)


def build_combined_idea_pool(
    nodes: list[dict[str, Any]],
    *,
    mission_type: str | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    """Alias for calendar-enriched merge — used by task_graph_executor."""
    return merge_mission_production_ideas_from_nodes(nodes, mission_type=mission_type)


def merged_ideation_json_from_nodes(
    nodes: list[dict[str, Any]],
    *,
    mission_type: str | None = None,
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
    merged = merge_ideation_ideas(lists, mission_type=mission_type)
    if not merged:
        return "", []
    return json.dumps(merged, ensure_ascii=False), merged
