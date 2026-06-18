"""
Feed Art Director Crew — reviews the full weekly content batch for cohesion.

Called by the task_graph_executor AFTER content_ideation completes.
The executor injects the ideation output_summary as the content batch.

Flow:
  content_ideation completed
      → feed_art_director node fires
      → FeedArtDirectorCrew reads ideas JSON
      → GPT-4o reviews format mix, theme, visual variety
      → Returns feed_art_director_report JSON
      → Saved to MissionTaskNode.output_summary
      → MissionHub shows feed score + publish schedule
"""

from __future__ import annotations

import json
import re
from typing import Any

import structlog
from crewai import Crew, LLM, Process

from app.config import get_settings
from app.crew.agents.feed_art_director_agent import create_feed_art_director_agent
from app.crew.context import BrandInfo
from app.crew.tasks.feed_art_director_tasks import create_feed_cohesion_task
from app.crew.token_usage import total_tokens_from_crew

logger = structlog.get_logger()

# Marka Detayı story slots — rotate when FD auto-fills Remotion story ideas.
_STORY_LIBRARY_SLOT_ROTATION = (
    "daily_story",
    "editorial_story",
    "social_proof",
)

# Haftalık Feed paketi — her misyonda tam 7 slot (fikir sayısından bağımsız)
_WEEKLY_PACKAGE_TOTAL = 7
_WEEKLY_SLOT_SPECS: list[tuple[str, str]] = [
    ("organic_post", "gallery_photo"),
    ("designed_post", "remotion_poster"),
    ("organic_carousel", "carousel_gallery"),
    ("campaign_story_motion", "remotion_story"),
    ("campaign_story_motion", "remotion_story"),
    ("campaign_story_motion", "remotion_story"),
    ("organic_reel", "runway_reel"),
]

_ECONOMY_LAST_SLOT: tuple[str, str] = ("organic_story_still", "story_still")


def _weekly_slot_specs(production_profile: str | None = None) -> list[tuple[str, str]]:
    specs = list(_WEEKLY_SLOT_SPECS)
    tier = (production_profile or "").strip().lower()
    if tier == "economy":
        specs[-1] = _ECONOMY_LAST_SLOT
    return specs


def _manifest_required_counts(production_profile: str | None = None) -> dict[str, int]:
    tier = (production_profile or "").strip().lower()
    if tier == "economy":
        return {
            "organic_post": 1,
            "designed_post": 1,
            "organic_carousel": 1,
            "campaign_story_motion": 3,
            "organic_story_still": 1,
        }
    return {
        "organic_post": 1,
        "designed_post": 1,
        "organic_carousel": 1,
        "campaign_story_motion": 3,
        "organic_reel": 1,
    }


def _story_library_slot_key(story_ordinal: int) -> str:
    return _STORY_LIBRARY_SLOT_ROTATION[
        story_ordinal % len(_STORY_LIBRARY_SLOT_ROTATION)
    ]


def _idea_content_format(idea: dict[str, Any]) -> str:
    """Detect the idea's intended format from content_type / content_kind / format fields."""
    ct = str(
        idea.get("content_type") or idea.get("content_kind") or idea.get("format") or ""
    ).lower()
    if "story" in ct or "canvas" in ct:
        return "story"
    if "reel" in ct:
        return "reel"
    if "carousel" in ct:
        return "carousel"
    return "post"


def _format_distribution_from_assignments(assignments: list[dict[str, Any]]) -> dict[str, int]:
    """Derive format_distribution from production_assignments (authoritative)."""
    dist = {"post": 0, "story": 0, "reel": 0, "carousel": 0}
    for a in assignments:
        role = str(a.get("slot_role") or "").lower()
        if not role:
            continue
        if "reel" in role:
            dist["reel"] += 1
        elif role == "organic_carousel":
            dist["carousel"] += 1
        elif "story" in role:
            dist["story"] += 1
        elif "post" in role or "ad" in role:
            dist["post"] += 1
    return dist


def _normalize_production_assignments(
    report: dict[str, Any],
    idea_count: int,
    production_profile: str | None = None,
    ideas: list[dict[str, Any]] | None = None,
) -> None:
    """Ensure every idea index has a valid assignment.

    When *ideas* is provided the auto-fill is format-aware: story ideas go to
    story slots, post ideas to post slots, etc.  Without *ideas* the legacy
    positional fill is used (safe fallback for callers that only have a count).
    """
    _pipeline_map = {
        "organic_post": "gallery_photo",
        "designed_post": "remotion_poster",
        "organic_story_still": "story_still",
        "campaign_story_motion": "remotion_story",
        "organic_reel": "runway_reel",
        "campaign_reel_motion": "runway_reel",
        "organic_carousel": "carousel_gallery",
        "paid_ad_creative": "meta_ad",
        "paid_ad_google_creative": "google_ad",
    }

    raw = report.get("production_assignments")
    if not isinstance(raw, list):
        raw = []
    by_index: dict[int, dict[str, Any]] = {}
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            idx = int(item.get("idea_index", -1))
        except (TypeError, ValueError):
            continue
        if idx < 0 or idx >= idea_count:
            continue
        role = str(item.get("slot_role") or "").strip()
        pipeline = str(item.get("pipeline") or "").strip()
        if not role:
            continue
        if not pipeline:
            pipeline = _pipeline_map.get(role, "gallery_photo")
        channel = str(item.get("publish_channel") or "")
        if not channel:
            channel = (
                "instagram_campaign"
                if "campaign" in role
                else "google_ads" if role == "paid_ad_google_creative"
                else "meta_ads" if role == "paid_ad_creative"
                else "instagram_organic"
            )
        by_index[idx] = {
            **item,
            "idea_index": idx,
            "slot_role": role,
            "pipeline": pipeline,
            "copy_bundle_id": str(item.get("copy_bundle_id") or "mission-week"),
            "publish_channel": channel,
        }

    post_n = carousel_n = story_n = reel_n = 0
    tier = (production_profile or "").strip().lower()

    for i in range(idea_count):
        if i in by_index:
            role = by_index[i].get("slot_role", "")
            if role in ("organic_post", "designed_post"):
                post_n += 1
            elif role == "organic_carousel":
                carousel_n += 1
            elif "story" in role:
                story_n += 1
                if role == "organic_story_still":
                    by_index[i] = {
                        **by_index[i],
                        "slot_role": "campaign_story_motion",
                        "pipeline": "remotion_story",
                        "rationale": "auto_upgrade_story_to_remotion",
                    }
            elif "reel" in role:
                reel_n += 1
            continue

        # Determine the idea's natural format (format-aware when ideas list provided).
        idea_fmt = _idea_content_format(ideas[i]) if (ideas and i < len(ideas)) else None

        def _assign(slot_role: str, pipeline: str, rationale: str, **extra: Any) -> None:
            by_index[i] = {
                "idea_index": i,
                "slot_role": slot_role,
                "pipeline": pipeline,
                "copy_bundle_id": "mission-week",
                "publish_channel": (
                    "instagram_campaign" if "campaign" in slot_role else "instagram_organic"
                ),
                "rationale": rationale,
                **extra,
            }

        # Format-aware assignment: prefer matching format to slot type.
        if idea_fmt == "story" and story_n < 3:
            _assign("campaign_story_motion", "remotion_story", "auto_fill_story_fmt",
                    library_slot_key=_story_library_slot_key(story_n))
            story_n += 1
        elif idea_fmt == "reel" and reel_n == 0:
            if tier == "economy":
                _assign("organic_story_still", "story_still", "auto_fill_economy_story_still_fmt")
                story_n += 1
            else:
                _assign("organic_reel", "runway_reel", "auto_fill_reel_fmt")
                reel_n += 1
        elif idea_fmt == "carousel" and carousel_n == 0:
            _assign("organic_carousel", "carousel_gallery", "auto_fill_carousel_fmt")
            carousel_n += 1
        elif idea_fmt in ("post", None) and post_n == 0:
            _assign("organic_post", "gallery_photo", "auto_fill_organic_post_fmt")
            post_n += 1
        elif idea_fmt in ("post", None) and post_n == 1:
            _assign("designed_post", "remotion_poster", "auto_fill_designed_post_fmt")
            post_n += 1
        # Fallback: fill remaining weekly-package slots in priority order.
        elif post_n == 0:
            _assign("organic_post", "gallery_photo", "auto_fill_organic_post")
            post_n += 1
        elif post_n == 1:
            _assign("designed_post", "remotion_poster", "auto_fill_designed_post")
            post_n += 1
        elif carousel_n == 0:
            _assign("organic_carousel", "carousel_gallery", "auto_fill_carousel")
            carousel_n += 1
        elif story_n < 3:
            _assign("campaign_story_motion", "remotion_story", "auto_fill_remotion_story",
                    library_slot_key=_story_library_slot_key(story_n))
            story_n += 1
        elif reel_n == 0:
            if tier == "economy":
                _assign("organic_story_still", "story_still", "auto_fill_economy_story_still")
                story_n += 1
            else:
                _assign("organic_reel", "runway_reel", "auto_fill_reel")
                reel_n += 1
        else:
            _assign("campaign_story_motion", "remotion_story", "auto_fill_overflow_story",
                    library_slot_key=_story_library_slot_key(story_n))
            story_n += 1

    # Build exactly 7 final assignments in _WEEKLY_SLOT_SPECS order.
    # Group by_index entries by slot_role so we can pick format-matched ideas per slot.
    by_role: dict[str, list[dict[str, Any]]] = {}
    for entry in by_index.values():
        r = str(entry.get("slot_role") or "unknown")
        by_role.setdefault(r, []).append(entry)
    for entries in by_role.values():
        entries.sort(key=lambda e: int(e.get("idea_index", 0)))

    slot_specs = _weekly_slot_specs(production_profile)
    effective_ideas = max(idea_count, 1)
    all_sorted = [by_index[k] for k in sorted(by_index.keys())]

    final_assignments: list[dict[str, Any]] = []
    story_ord = 0
    _used_fallback_idx = 0

    for slot_i, (role, pipeline) in enumerate(slot_specs):
        # Pick the first available entry with matching role; fall back to round-robin.
        if by_role.get(role):
            donor = by_role[role].pop(0)
        elif all_sorted:
            donor = all_sorted[slot_i % len(all_sorted)]
        else:
            donor = {"idea_index": slot_i % effective_ideas}

        idea_i = int(donor.get("idea_index", slot_i % effective_ideas))
        channel = str(donor.get("publish_channel") or "instagram_organic")
        entry: dict[str, Any] = {
            k: v
            for k, v in donor.items()
            if k not in ("slot_role", "pipeline", "idea_index", "library_slot_key")
        }
        entry.update({
            "idea_index": idea_i,
            "slot_role": role,
            "pipeline": pipeline,
            "copy_bundle_id": str(donor.get("copy_bundle_id") or "mission-week"),
            "publish_channel": channel,
            "rationale": str(donor.get("rationale") or f"weekly_slot_{slot_i}"),
        })
        if role == "campaign_story_motion":
            entry["library_slot_key"] = str(
                donor.get("library_slot_key") or _story_library_slot_key(story_ord)
            )
            story_ord += 1
        else:
            entry.pop("library_slot_key", None)
        final_assignments.append(entry)

    report["production_assignments"] = final_assignments
    report["format_distribution"] = _format_distribution_from_assignments(final_assignments)
    required_counts = _manifest_required_counts(production_profile)
    assigned_counts: dict[str, int] = {}
    for a in report["production_assignments"]:
        role = str(a.get("slot_role") or "")
        assigned_counts[role] = assigned_counts.get(role, 0) + 1
    filled = 0
    need_total = sum(required_counts.values())
    for role, need in required_counts.items():
        filled += min(need, assigned_counts.get(role, 0))
    report["manifest_coverage_pct"] = int(round(100 * filled / max(need_total, 1)))


def _extract_json(text: str) -> dict[str, Any] | None:
    """Extract first JSON object from LLM response."""
    text = text.strip()
    if text.startswith('{'):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
    cleaned = re.sub(r'```(?:json)?\s*', '', text).strip().rstrip('`').strip()
    if cleaned.startswith('{'):
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass
    m = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            pass
    return None


def _infer_production_package(
    mission_type: str = "",
    mission_title: str = "",
    creative_brief: str = "",
    weekly_theme: str = "",
) -> str:
    # Strategist trigger types (seasonal/opportunity/competitive/recovery/manual) are NOT Hub packages.
    blob = f"{mission_title} {creative_brief} {weekly_theme}".lower()
    if any(k in blob for k in ("ads_focus", "reklam odak", "meta_ads", "paid_ad")):
        return "ads_focus"
    if any(k in blob for k in ("etkinlik", "event", "duyuru", "announcement", "gala", "konser")):
        return "event"
    if any(k in blob for k in ("kampanya", "campaign", "promo", "offer", "indirim")):
        return "campaign"
    return "weekly_content"


def run_feed_art_director(
    brand: BrandInfo,
    content_ideas_json: str,
    weekly_theme: str = "",
    mission_type: str = "",
    mission_title: str = "",
    creative_brief: str = "",
    production_package: str | None = None,
    production_profile: str | None = None,
    llm: LLM | None = None,
) -> dict[str, Any]:
    """
    Run the Feed Art Director crew and return a cohesion report dict.
    Returns a fallback report on any error (non-blocking — content still publishes).
    """
    from app.services.production_profile_service import blocks_fd_fallback

    settings = get_settings()
    block_fallback = blocks_fd_fallback((production_profile or "").strip().lower())

    production_package = (production_package or "").strip() or _infer_production_package(
        mission_type=mission_type,
        mission_title=mission_title,
        creative_brief=creative_brief,
        weekly_theme=weekly_theme,
    )

    if not content_ideas_json or content_ideas_json.strip() in ("", "[]", "{}"):
        if block_fallback:
            raise RuntimeError("Feed Art Director blocked: no content ideas (premium/economy profile)")
        return _fallback_report(
            "No content ideas provided",
            content_ideas_json,
            production_package=production_package,
            production_profile=production_profile,
        )

    # Extract weekly theme from ideas if not explicitly provided
    if not weekly_theme:
        try:
            ideas = json.loads(content_ideas_json.replace('```json', '').replace('```', '').strip())
            if isinstance(ideas, list) and ideas:
                weekly_theme = str(ideas[0].get("strategic_purpose", "") or ideas[0].get("concept_title", ""))[:100]
        except Exception:
            pass

    try:
        agent = create_feed_art_director_agent(brand, llm=llm)
        task = create_feed_cohesion_task(
            agent=agent,
            brand_name=brand.business_name,
            business_type=brand.business_type or "brand",
            weekly_theme=weekly_theme or "weekly content batch",
            content_ideas_json=content_ideas_json,
            mission_type=mission_type,
            mission_title=mission_title,
            creative_brief=creative_brief,
            production_package=production_package,
        )

        crew = Crew(
            agents=[agent],
            tasks=[task],
            process=Process.sequential,
            verbose=settings.crew_verbose,
        )

        result = crew.kickoff()
        raw_output = str(result.raw) if hasattr(result, "raw") else str(result)
        usage = total_tokens_from_crew(result)

        report = _extract_json(raw_output)
        if not report:
            logger.warning(
                "feed_art_director_crew.json_parse_failed",
                brand=brand.business_name,
                raw_snippet=raw_output[:200],
            )
            return _fallback_report(
                "JSON parse failed",
                content_ideas_json,
                production_package=production_package,
                production_profile=production_profile,
            )

        try:
            parsed_ideas = json.loads(
                content_ideas_json.replace("```json", "").replace("```", "").strip()
            )
            idea_count = len(parsed_ideas) if isinstance(parsed_ideas, list) else 0
        except Exception:
            parsed_ideas = []
            idea_count = 0
        if idea_count > 0:
            _normalize_production_assignments(
                report,
                idea_count,
                production_profile=production_profile,
                ideas=parsed_ideas,
            )
            assignments = report.get("production_assignments")
            if not isinstance(assignments, list) or len(assignments) != _WEEKLY_PACKAGE_TOTAL:
                raise RuntimeError(
                    f"Feed Art Director schema: expected {_WEEKLY_PACKAGE_TOTAL} production_assignments, "
                    f"got {len(assignments) if isinstance(assignments, list) else 0}",
                )
        raw_assign = report.get("production_assignments")
        if isinstance(raw_assign, list) and raw_assign:
            report["format_distribution"] = _format_distribution_from_assignments(raw_assign)

        report["production_package"] = production_package
        report["_token_usage"] = usage
        logger.info(
            "feed_art_director_crew.success",
            brand=brand.business_name,
            feed_score=report.get("feed_score"),
            verdict=str(report.get("art_director_verdict", ""))[:100],
        )
        return report

    except Exception as exc:
        logger.error("feed_art_director_crew.failed", exc=str(exc), brand=brand.business_name)
        if block_fallback:
            raise RuntimeError(
                f"Feed Art Director blocked: {str(exc)[:200]} (premium/economy profile)",
            ) from exc
        return _fallback_report(
            str(exc)[:200],
            content_ideas_json,
            production_package=production_package,
            production_profile=production_profile,
        )


def _fallback_report(
    reason: str,
    content_ideas_json: str = "",
    *,
    production_package: str = "weekly_content",
    production_profile: str | None = None,
) -> dict[str, Any]:
    """Safe fallback when the agent fails — feed still publishes."""
    report: dict[str, Any] = {
        "feed_score": None,
        "format_distribution": {},
        "theme_coherence": None,
        "cohesion_notes": [f"Art Director review unavailable: {reason}"],
        "flagged_ideas": [],
        "recommended_order": [],
        "publish_schedule": {},
        "production_assignments": [],
        "manifest_coverage_pct": None,
        "art_director_verdict": "Review unavailable — content produced with heuristic routing",
        "_fallback": True,
        "_fallback_reason": reason,
    }
    try:
        ideas = json.loads(
            content_ideas_json.replace("```json", "").replace("```", "").strip()
        )
        if isinstance(ideas, list) and ideas:
            _normalize_production_assignments(
                report,
                len(ideas),
                production_profile=production_profile,
                ideas=ideas,
            )
    except Exception:
        pass
    report["production_package"] = production_package
    return report
