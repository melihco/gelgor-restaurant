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


def _normalize_production_assignments(
    report: dict[str, Any],
    idea_count: int,
) -> None:
    """Ensure every idea index has a valid assignment; fill gaps heuristically."""
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
            pipeline_map = {
                "organic_post": "gallery_photo",
                "designed_post": "remotion_poster",
                "organic_story_still": "story_still",
                "campaign_story_motion": "remotion_story",
                "organic_reel": "runway_reel",
                "campaign_reel_motion": "runway_reel",
                "organic_carousel": "carousel_gallery",
                "paid_ad_creative": "meta_ad",
            }
            pipeline = pipeline_map.get(role, "gallery_photo")
        channel = str(item.get("publish_channel") or "")
        if not channel:
            channel = (
                "instagram_campaign"
                if "campaign" in role
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
    for i in range(idea_count):
        if i in by_index:
            role = by_index[i].get("slot_role", "")
            if role == "organic_post":
                post_n += 1
            elif role == "designed_post":
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
        # Weekly package: 1 gallery post + 1 designed post + 1 carousel + 3 Remotion stories + 1 reel
        if post_n == 0:
            by_index[i] = {
                "idea_index": i,
                "slot_role": "organic_post",
                "pipeline": "gallery_photo",
                "copy_bundle_id": "mission-week",
                "publish_channel": "instagram_organic",
                "rationale": "auto_fill_organic_post",
            }
            post_n += 1
        elif post_n == 1:
            by_index[i] = {
                "idea_index": i,
                "slot_role": "designed_post",
                "pipeline": "remotion_poster",
                "copy_bundle_id": "mission-week",
                "publish_channel": "instagram_organic",
                "rationale": "auto_fill_designed_post",
            }
            post_n += 1
        elif carousel_n == 0:
            by_index[i] = {
                "idea_index": i,
                "slot_role": "organic_carousel",
                "pipeline": "carousel_gallery",
                "copy_bundle_id": "mission-week",
                "publish_channel": "instagram_organic",
                "rationale": "auto_fill_carousel",
            }
            carousel_n += 1
        elif story_n < 3:
            by_index[i] = {
                "idea_index": i,
                "slot_role": "campaign_story_motion",
                "pipeline": "remotion_story",
                "copy_bundle_id": "mission-week",
                "publish_channel": "instagram_organic",
                "rationale": "auto_fill_remotion_story",
            }
            story_n += 1
        elif reel_n == 0:
            by_index[i] = {
                "idea_index": i,
                "slot_role": "organic_reel",
                "pipeline": "runway_reel",
                "copy_bundle_id": "mission-week",
                "publish_channel": "instagram_organic",
                "rationale": "auto_fill_reel",
            }
            reel_n += 1
        else:
            by_index[i] = {
                "idea_index": i,
                "slot_role": "campaign_story_motion",
                "pipeline": "remotion_story",
                "copy_bundle_id": "mission-week",
                "publish_channel": "instagram_organic",
                "rationale": "auto_fill_overflow_story",
            }
            story_n += 1

    report["production_assignments"] = [by_index[i] for i in sorted(by_index.keys())]
    required_counts = {
        "organic_post": 1,
        "designed_post": 1,
        "organic_carousel": 1,
        "campaign_story_motion": 3,
        "organic_reel": 1,
    }
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
    blob = f"{mission_type} {mission_title} {creative_brief} {weekly_theme}".lower()
    if any(k in blob for k in ("ads_focus", "reklam odak", "meta_ads", "paid_ad")):
        return "ads_focus"
    if any(k in blob for k in ("etkinlik", "event", "duyuru", "announcement", "gala", "konser")):
        return "event"
    if any(k in blob for k in ("kampanya", "campaign", "promo", "fırsat", "offer", "indirim")):
        return "campaign"
    return "weekly_content"


def run_feed_art_director(
    brand: BrandInfo,
    content_ideas_json: str,
    weekly_theme: str = "",
    mission_type: str = "",
    mission_title: str = "",
    creative_brief: str = "",
    llm: LLM | None = None,
) -> dict[str, Any]:
    """
    Run the Feed Art Director crew and return a cohesion report dict.
    Returns a fallback report on any error (non-blocking — content still publishes).
    """
    settings = get_settings()

    production_package = _infer_production_package(
        mission_type=mission_type,
        mission_title=mission_title,
        creative_brief=creative_brief,
        weekly_theme=weekly_theme,
    )

    if not content_ideas_json or content_ideas_json.strip() in ("", "[]", "{}"):
        return _fallback_report(
            "No content ideas provided",
            content_ideas_json,
            production_package=production_package,
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
            )

        try:
            ideas = json.loads(
                content_ideas_json.replace("```json", "").replace("```", "").strip()
            )
            idea_count = len(ideas) if isinstance(ideas, list) else 0
        except Exception:
            idea_count = 0
        if idea_count > 0:
            _normalize_production_assignments(report, idea_count)

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
        return _fallback_report(
            str(exc)[:200],
            content_ideas_json,
            production_package=production_package,
        )


def _fallback_report(
    reason: str,
    content_ideas_json: str = "",
    *,
    production_package: str = "weekly_content",
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
            _normalize_production_assignments(report, len(ideas))
    except Exception:
        pass
    report["production_package"] = production_package
    return report
