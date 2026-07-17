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
from app.crew.tasks.feed_art_director_tasks import (
    create_feed_cohesion_task,
    parse_content_ideas_json,
)
from app.services.feed_director_slot_catalog import apply_catalog_slot_to_entry
from app.crew.token_usage import total_tokens_from_crew

logger = structlog.get_logger()

# Haftalık Feed paketi — her misyonda tam 16 üretim slotu (7 günlük yayın hedefi + buffer)
_WEEKLY_PACKAGE_TOTAL = 16
_WEEKLY_SLOT_SPECS: list[tuple[str, str]] = [
    ("organic_post", "gallery_photo"),
    ("organic_post", "gallery_photo"),
    ("designed_post", "fal_design"),
    ("designed_typography", "fal_design"),
    ("fal_designed_post", "fal_design"),
    ("organic_carousel", "carousel_gallery"),
    ("campaign_story_motion", "fal_story"),
    ("campaign_story_motion", "fal_story"),
    ("organic_story_still", "story_still"),
    ("organic_reel", "fal_reel"),
    ("campaign_reel_motion", "fal_reel"),
    ("fal_reel_motion", "fal_reel"),
    ("fal_reel_motion", "fal_reel"),
    ("fal_only_post", "fal_only_post"),
    ("fal_only_reel", "fal_only_reel"),
    ("fal_only_reel", "fal_only_reel"),
]

_ECONOMY_LAST_SLOT: tuple[str, str] = ("organic_story_still", "story_still")


def _weekly_slot_specs(production_profile: str | None = None) -> list[tuple[str, str]]:
    return list(_WEEKLY_SLOT_SPECS)


def _manifest_required_counts(production_profile: str | None = None) -> dict[str, int]:
    tier = (production_profile or "").strip().lower()
    if tier == "economy":
        return {
            "organic_post": 2,
            "designed_post": 1,
            "designed_typography": 1,
            "fal_designed_post": 1,
            "fal_only_post": 1,
            "fal_only_reel": 1,
            "organic_carousel": 1,
            "campaign_story_motion": 2,
            "organic_story_still": 1,
            "organic_reel": 1,
            "campaign_reel_motion": 1,
            "fal_reel_motion": 2,
        }
    return {
        "organic_post": 2,
        "designed_post": 1,
        "designed_typography": 1,
        "fal_designed_post": 1,
        "fal_only_post": 1,
        "fal_only_reel": 2,
        "organic_carousel": 1,
        "campaign_story_motion": 2,
        "organic_story_still": 1,
        "organic_reel": 1,
        "campaign_reel_motion": 1,
        "fal_reel_motion": 2,
    }


def _post_slot_role_for(post_ordinal: int) -> tuple[str, str]:
    """Weekly post slot mix (5): 2 organic + 3 fal designed (gallery match + agent brief)."""
    if post_ordinal == 1:
        return ("designed_post", "fal_design")
    if post_ordinal == 3:
        return ("designed_typography", "fal_design")
    if post_ordinal >= 4:
        return ("fal_designed_post", "fal_design")
    return ("organic_post", "gallery_photo")


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
        elif "post" in role or "ad" in role or role in ("designed_typography", "fal_designed_post", "fal_only_post"):
            dist["post"] += 1
    return dist


def _publish_channel_for_role(role: str) -> str:
    if role == "paid_ad_google_creative":
        return "google_ads"
    if role == "paid_ad_creative":
        return "meta_ads"
    if "campaign" in role:
        return "instagram_campaign"
    return "instagram_organic"


def _default_role_pipeline_for_format(
    fmt: str,
    production_profile: str | None = None,
) -> tuple[str, str]:
    """One role/pipeline per idea format — no multi-slot fan-out."""
    tier = (production_profile or "").strip().lower()
    if fmt == "story":
        return "campaign_story_motion", "fal_story"
    if fmt == "reel":
        if tier == "economy":
            return "organic_story_still", "story_still"
        return "organic_reel", "fal_reel"
    if fmt == "carousel":
        return "organic_carousel", "carousel_gallery"
    return "fal_designed_post", "fal_design"


def _normalize_weekly_catalog_first(
    report: dict[str, Any],
    idea_count: int,
    production_profile: str | None,
    ideas: list[dict[str, Any]] | None,
    catalog_slots: list[dict[str, str]],
) -> None:
    """Catalog-first normalize — exactly one assignment per idea (no 16-slot pad)."""
    raw = report.get("production_assignments")
    if not isinstance(raw, list):
        raw = []

    donors_by_idea: dict[int, dict[str, Any]] = {}
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            idx = int(item.get("idea_index", -1))
        except (TypeError, ValueError):
            continue
        if idx >= 0 and idx not in donors_by_idea:
            donors_by_idea[idx] = item

    effective_ideas = max(idea_count, 1)
    used_catalog_keys: set[str] = set()
    final_assignments: list[dict[str, Any]] = []

    for idea_i in range(effective_ideas):
        idea = ideas[idea_i] if (ideas and idea_i < len(ideas)) else {}
        fmt = _idea_content_format(idea) if idea else "post"
        role, pipeline = _default_role_pipeline_for_format(fmt, production_profile)
        donor = donors_by_idea.get(idea_i) or {}
        donor_role = str(donor.get("slot_role") or "").strip()
        donor_pipeline = str(donor.get("pipeline") or "").strip()
        if donor_role:
            role = donor_role
        if donor_pipeline:
            pipeline = donor_pipeline

        entry: dict[str, Any] = {
            "idea_index": idea_i,
            "slot_role": role,
            "pipeline": pipeline,
            "copy_bundle_id": str(donor.get("copy_bundle_id") or "mission-week"),
            "publish_channel": str(
                donor.get("publish_channel") or _publish_channel_for_role(role)
            ),
            "rationale": str(donor.get("rationale") or f"idea_{idea_i}_{fmt}"),
        }
        if donor.get("catalog_slot_key"):
            entry["catalog_slot_key"] = donor.get("catalog_slot_key")
        for hint_key in (
            "visual_subject_hint",
            "fal_design_hint",
            "layout_family_hint",
            "hero_reel_index",
        ):
            if donor.get(hint_key) is not None:
                entry[hint_key] = donor[hint_key]
        apply_catalog_slot_to_entry(entry, catalog_slots, used_catalog_keys)
        entry.pop("library_slot_key", None)
        final_assignments.append(entry)

    report["production_assignments"] = final_assignments
    report["format_distribution"] = _format_distribution_from_assignments(final_assignments)
    report["manifest_coverage_pct"] = 100 if final_assignments else 0
    report["catalog_first"] = True


def _normalize_production_assignments(
    report: dict[str, Any],
    idea_count: int,
    production_profile: str | None = None,
    ideas: list[dict[str, Any]] | None = None,
    production_package: str = "weekly_content",
    catalog_slots: list[dict[str, str]] | None = None,
) -> None:
    """Normalize FD output to one assignment per idea (idea_count deliverables).

    Opportunity missions: exactly 3 slots. Weekly/seasonal: len == idea_count.
    """
    _pipeline_map = {
        "organic_post": "gallery_photo",
        "designed_post": "fal_design",
        "designed_typography": "fal_design",
        "fal_designed_post": "fal_design",
        "organic_story_still": "story_still",
        "campaign_story_motion": "fal_story",
        "organic_reel": "fal_reel",
        "campaign_reel_motion": "fal_reel",
        "fal_reel_motion": "fal_reel",
        "fal_only_post": "fal_only_post",
        "fal_only_reel": "fal_only_reel",
        "organic_carousel": "carousel_gallery",
        "paid_ad_creative": "fal_design",
        "paid_ad_google_creative": "fal_design",
    }

    pkg = (production_package or "weekly_content").strip().lower()
    used_catalog_keys: set[str] = set()

    if pkg == "opportunity":
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
            if idx < 0:
                continue
            role = str(item.get("slot_role") or "").strip()
            pipeline = str(item.get("pipeline") or "").strip() or _pipeline_map.get(role, "gallery_photo")
            by_index[idx] = {
                **item,
                "idea_index": idx,
                "slot_role": role,
                "pipeline": pipeline,
                "copy_bundle_id": str(item.get("copy_bundle_id") or "mission-week"),
                "publish_channel": _publish_channel_for_role(role),
            }
        opp_specs = [
            ("designed_post", "fal_design"),
            ("campaign_story_motion", "fal_story"),
            ("organic_reel", "fal_reel"),
        ]
        target = min(max(idea_count, 1), 3)
        final_assignments: list[dict[str, Any]] = []
        for slot_i in range(target):
            if slot_i in by_index:
                entry = dict(by_index[slot_i])
            else:
                role, pipeline = opp_specs[slot_i]
                entry = {
                    "idea_index": slot_i % max(idea_count, 1),
                    "slot_role": role,
                    "pipeline": pipeline,
                    "copy_bundle_id": "mission-week",
                    "publish_channel": _publish_channel_for_role(role),
                    "rationale": f"auto_fill_{role}",
                }
            role = str(entry.get("slot_role") or "")
            apply_catalog_slot_to_entry(entry, catalog_slots, used_catalog_keys)
            entry.pop("library_slot_key", None)
            final_assignments.append(entry)
        report["production_assignments"] = final_assignments
        report["format_distribution"] = _format_distribution_from_assignments(final_assignments)
        required_counts = {"designed_post": 1, "campaign_story_motion": 1, "organic_reel": 1}
        assigned_counts: dict[str, int] = {}
        for a in final_assignments:
            role = str(a.get("slot_role") or "")
            assigned_counts[role] = assigned_counts.get(role, 0) + 1
        filled = sum(min(need, assigned_counts.get(role, 0)) for role, need in required_counts.items())
        report["manifest_coverage_pct"] = int(round(100 * filled / 3))
        return

    if catalog_slots and pkg != "opportunity":
        _normalize_weekly_catalog_first(
            report,
            idea_count,
            production_profile,
            ideas,
            catalog_slots,
        )
        return

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
        if idx < 0 or idx >= max(idea_count, 1):
            continue
        role = str(item.get("slot_role") or "").strip()
        pipeline = str(item.get("pipeline") or "").strip()
        if not role:
            continue
        if not pipeline:
            pipeline = _pipeline_map.get(role, "gallery_photo")
        channel = str(item.get("publish_channel") or "")
        if not channel:
            channel = _publish_channel_for_role(role)
        by_index[idx] = {
            **item,
            "idea_index": idx,
            "slot_role": role,
            "pipeline": pipeline,
            "copy_bundle_id": str(item.get("copy_bundle_id") or "mission-week"),
            "publish_channel": channel,
        }

    effective_ideas = max(idea_count, 1)
    final_assignments: list[dict[str, Any]] = []
    for idea_i in range(effective_ideas):
        idea = ideas[idea_i] if (ideas and idea_i < len(ideas)) else {}
        fmt = _idea_content_format(idea) if idea else "post"
        role, pipeline = _default_role_pipeline_for_format(fmt, production_profile)
        if idea_i in by_index:
            entry = dict(by_index[idea_i])
            role = str(entry.get("slot_role") or role)
            pipeline = str(entry.get("pipeline") or pipeline)
        else:
            entry = {
                "idea_index": idea_i,
                "slot_role": role,
                "pipeline": pipeline,
                "copy_bundle_id": "mission-week",
                "publish_channel": _publish_channel_for_role(role),
                "rationale": f"auto_fill_idea_{idea_i}_{fmt}",
            }
        entry["idea_index"] = idea_i
        entry["slot_role"] = role
        entry["pipeline"] = pipeline
        entry["publish_channel"] = str(
            entry.get("publish_channel") or _publish_channel_for_role(role)
        )
        apply_catalog_slot_to_entry(entry, catalog_slots, used_catalog_keys)
        entry.pop("library_slot_key", None)
        final_assignments.append(entry)

    report["production_assignments"] = final_assignments
    report["format_distribution"] = _format_distribution_from_assignments(final_assignments)
    report["manifest_coverage_pct"] = 100 if final_assignments else 0


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
    catalog_slots: list[dict[str, str]] | None = None,
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
            catalog_slots=catalog_slots,
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
            catalog_slots=catalog_slots,
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
                catalog_slots=catalog_slots,
            )

        parsed_ideas = parse_content_ideas_json(content_ideas_json)
        idea_count = len(parsed_ideas)
        # Catalog-first must still run when ideation JSON was truncated/unparseable
        # but brand catalog slots were loaded (otherwise LLM sparse keys stick forever).
        if idea_count == 0 and catalog_slots:
            expected_for_pkg = 3 if production_package == "opportunity" else 0
            raw_assign = report.get("production_assignments")
            idxs: list[int] = []
            if isinstance(raw_assign, list):
                for a in raw_assign:
                    if not isinstance(a, dict):
                        continue
                    try:
                        idxs.append(int(a.get("idea_index", 0)))
                    except (TypeError, ValueError):
                        continue
            if idxs:
                idea_count = max(idxs) + 1
            elif expected_for_pkg:
                idea_count = expected_for_pkg
            else:
                idea_count = len(raw_assign) if isinstance(raw_assign, list) and raw_assign else 0
            parsed_ideas = [{} for _ in range(idea_count)] if idea_count else []
            logger.warning(
                "feed_art_director_crew.ideas_unparseable_catalog_normalize",
                brand=brand.business_name,
                idea_count=idea_count,
                catalog_slots=len(catalog_slots),
            )
        if idea_count > 0:
            _normalize_production_assignments(
                report,
                idea_count,
                production_profile=production_profile,
                ideas=parsed_ideas,
                production_package=production_package,
                catalog_slots=catalog_slots,
            )
            assignments = report.get("production_assignments")
            expected_slots = 3 if production_package == "opportunity" else idea_count
            if not isinstance(assignments, list) or len(assignments) != expected_slots:
                raise RuntimeError(
                    f"Feed Art Director schema: expected {expected_slots} production_assignments, "
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
            catalog_slots=catalog_slots,
        )


def _fallback_report(
    reason: str,
    content_ideas_json: str = "",
    *,
    production_package: str = "weekly_content",
    production_profile: str | None = None,
    catalog_slots: list[dict[str, str]] | None = None,
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
        ideas = parse_content_ideas_json(content_ideas_json)
        idea_count = len(ideas)
        if idea_count == 0 and catalog_slots:
            idea_count = 3 if production_package == "opportunity" else _WEEKLY_PACKAGE_TOTAL
            ideas = [{} for _ in range(idea_count)]
        if idea_count > 0:
            _normalize_production_assignments(
                report,
                idea_count,
                production_profile=production_profile,
                ideas=ideas,
                production_package=production_package,
                catalog_slots=catalog_slots,
            )
    except Exception:
        pass
    report["production_package"] = production_package
    return report
