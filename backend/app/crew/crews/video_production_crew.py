"""
Video Production Crew — generates AI video specs for Instagram Reels.

Input: reel content concept + gallery photo list
Output: video_production_spec with selected photo URL + video prompt
"""

from __future__ import annotations

import json
import re
from typing import Any

import structlog
from crewai import Crew, Process, Task

from app.config import get_settings
from app.crew.agents.video_production_agent import create_video_production_agent
from app.crew.context import BrandInfo, extract_urgency_signal, build_urgency_directive
from app.crew.prompts.video_production_prompts import VIDEO_PRODUCTION_TASK
from app.crew.token_usage import total_tokens_from_crew

logger = structlog.get_logger()


def run_video_production(
    brand: BrandInfo,
    title: str,
    caption: str,
    visual_direction: str,
    gallery_photos: list[dict],  # [{url, tags, description, assetType}]
    llm: Any = None,
) -> dict[str, Any]:
    """
    Run Video Production Agent to select best photo and craft the video prompt.

    gallery_photos: list of dicts with keys: url, tags, description, assetType
    Returns: video_production_spec dict
    """
    settings = get_settings()

    if not gallery_photos:
        return {
            "status": "no_photos",
            "error": "No analyzed gallery photos available. Run gallery analysis first.",
        }

    # Format gallery for agent
    gallery_text = "\n".join([
        f"- URL: {p['url']}\n"
        f"  Type: {p.get('assetType', 'unknown')}\n"
        f"  Tags: {p.get('tags', 'not analyzed')}\n"
        f"  Description: {p.get('description', 'no description')}"
        for p in gallery_photos[:12]  # max 12 photos
    ])

    # Extract urgency signal from industry calendar
    urgency_sig = extract_urgency_signal(brand)
    urgency_directive = build_urgency_directive(brand)

    agent = create_video_production_agent(brand, llm=llm)

    # Build Pinterest context block for prompt enrichment
    pinterest_block = ""
    if brand.pinterest_visual_themes or brand.pinterest_top_pins:
        lines = ["## 📌 Pinterest Trend Intelligence (real data, sector-specific)"]
        if brand.pinterest_visual_themes:
            lines.append(f"Trending visual themes: {', '.join(brand.pinterest_visual_themes[:6])}")
            lines.append("→ Video prompt MUST reflect these aesthetics (lighting, mood, color palette, motion style).")
        if brand.pinterest_top_pins:
            lines.append("Top pinned compositions to reference:")
            for pin in brand.pinterest_top_pins[:4]:
                title_p = (pin.get("title") or "").strip()[:70]
                if title_p:
                    lines.append(f"  - \"{title_p}\" ({pin.get('saves', 0):,} saves)")
            lines.append("→ Pick camera motion and lighting that matches these high-performing styles.")
        pinterest_block = "\n".join(lines)

    task_description = VIDEO_PRODUCTION_TASK.format(
        title=title,
        caption=caption[:300] if caption else "No caption provided",
        visual_direction=visual_direction[:200] if visual_direction else "Natural venue atmosphere",
        brand_tone=brand.brand_tone or "premium, authentic",
        location=brand.location or "Turkey",
        gallery_photos=gallery_text,
        pinterest_context=pinterest_block,
        urgency_directive=urgency_directive,
    )

    task = Task(
        description=task_description,
        expected_output=(
            "A JSON object with selected_photo_url, reel_prompt, camera_motion, "
            "duration, style_notes, urgency_level, recommended_creatomate_formats"
        ),
        agent=agent,
    )

    crew = Crew(
        agents=[agent],
        tasks=[task],
        process=Process.sequential,
        verbose=settings.crew_verbose,
    )

    result = crew.kickoff()
    raw = str(result).strip()

    # Parse JSON from output
    spec: dict[str, Any] = {}
    try:
        json_match = re.search(r"\{[\s\S]*\}", raw)
        if json_match:
            spec = json.loads(json_match.group())
    except Exception as exc:
        logger.warning("video_production_parse_failed", error=str(exc))

    # Validate essential fields
    if not spec.get("selected_photo_url") or not spec.get("reel_prompt"):
        logger.warning("video_production_incomplete_spec", raw=raw[:200])
        fallback_photo = gallery_photos[0]["url"] if gallery_photos else None
        # Urgency-aware fallback prompt
        urgency_style = {
            "HIGH": "Dynamic subtle animation, vibrant light, energy. Keep scene identical.",
            "MEDIUM": "Gentle motion, warm light shimmer. Keep scene identical.",
            "LOW": "Very subtle breeze, calm ambient light. Keep scene identical.",
        }.get(urgency_sig["urgency_level"], "Subtle animation. Keep scene identical.")
        spec = {
            "selected_photo_url": fallback_photo,
            "selected_photo_reason": "Fallback selection — agent output was incomplete",
            "reel_prompt": f"Animate this exact scene faithfully. {urgency_style} {title}",
            "camera_motion": "static",
            "duration": 5,
            "style_notes": f"Agent output parse failed — urgency={urgency_sig['urgency_level']}",
        }

    # Auto-determine recommended Creatomate formats based on urgency + event signals
    if urgency_sig["has_weekend_events"]:
        recommended_formats = ["event", "reel", "story", "teaser"]
    elif urgency_sig["urgency_level"] == "HIGH":
        recommended_formats = ["reel", "story", "event", "teaser"]
    elif urgency_sig["urgency_level"] == "MEDIUM":
        recommended_formats = ["reel", "story", "feed", "teaser"]
    else:
        recommended_formats = ["reel", "story", "feed", "teaser"]

    spec["urgency_level"] = urgency_sig["urgency_level"]
    spec["recommended_creatomate_formats"] = spec.get("recommended_creatomate_formats") or recommended_formats

    logger.info(
        "video_production_complete",
        brand=brand.business_name,
        tenant_id=brand.tenant_id or "unknown",
        urgency=urgency_sig["urgency_level"],
        has_weekend_events=urgency_sig["has_weekend_events"],
        selected_url=spec.get("selected_photo_url", "")[-40:],
        camera_motion=spec.get("camera_motion"),
        recommended_formats=spec["recommended_creatomate_formats"],
    )

    return {
        "status": "completed",
        "spec": spec,
        "urgency": urgency_sig,
        "tokens_used": total_tokens_from_crew(crew),
        "raw_output": raw,
    }
