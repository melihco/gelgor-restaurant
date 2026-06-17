"""
Local Design MCP client — calls SmartAgency design MCP server from Crew tools.

Anthropic's remote MCP connector cannot reach localhost; this client talks to
http://127.0.0.1:8010/mcp directly from the Crew backend.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Any

import structlog

logger = structlog.get_logger()

DEFAULT_MCP_URL = "http://127.0.0.1:8010/mcp"
DEFAULT_DEV_TOKEN = "smartagency-mcp-dev"


def design_mcp_url() -> str:
    return (
        os.getenv("MCP_DESIGN_URL", "").strip()
        or os.getenv("SMART_AGENCY_MCP_DESIGN_URL", "").strip()
        or DEFAULT_MCP_URL
    ).rstrip("/")


def design_mcp_token() -> str:
    return (
        os.getenv("MCP_AUTH_TOKEN", "").strip()
        or os.getenv("INTERNAL_API_KEY", "").strip()
        or DEFAULT_DEV_TOKEN
    )


def is_local_mcp_url(url: str) -> bool:
    return bool(re.search(r"^https?://(127\.0\.0\.1|localhost)(:\d+)?", url, re.I))


def is_design_mcp_configured() -> bool:
    return bool(design_mcp_url())


def _extract_headline_caption(brief: str) -> tuple[str, str]:
    headline = ""
    caption = ""
    for line in brief.splitlines():
        low = line.lower().strip()
        if low.startswith("headline:"):
            headline = line.split(":", 1)[1].strip()
        elif low.startswith("caption:"):
            caption = line.split(":", 1)[1].strip()
    if not headline and not caption:
        caption = brief.strip()[:500]
    return headline, caption


async def _call_tool(name: str, arguments: dict[str, Any]) -> str:
    from fastmcp import Client

    url = design_mcp_url()
    token = design_mcp_token()
    async with Client(url, auth=token) as client:
        result = await client.call_tool(name, arguments)
        if getattr(result, "data", None):
            return str(result.data)
        parts = []
        for block in getattr(result, "content", []) or []:
            text = getattr(block, "text", None)
            if text:
                parts.append(str(text))
        return "\n".join(parts) if parts else ""


def _extract_content_type(brief: str) -> str:
    """Extract content_type hint from brief text (reel | story | carousel | canvas | post)."""
    low = brief.lower()
    if "reel" in low or "instagram_reel" in low:
        return "reel"
    if "story" in low or "instagram_story" in low:
        return "story"
    if "carousel" in low or "instagram_carousel" in low:
        return "carousel"
    if "canvas" in low or "event_card" in low or "instagram_canvas" in low:
        return "canvas"
    return "post"


def _extract_vibe_field(brief: str, field: str) -> str:
    """Extract 'field: value' from brief text."""
    for line in brief.splitlines():
        if line.lower().strip().startswith(f"{field.lower()}:"):
            return line.split(":", 1)[1].strip()
    return ""


async def consult_design_via_mcp(
    *,
    brief: str,
    business_type: str,
    brand_name: str = "Brand",
    focus: str = "layout_and_visual_hierarchy",
) -> dict[str, Any]:
    headline, caption = _extract_headline_caption(brief)
    bt = business_type or "general_business"
    content_type = _extract_content_type(brief)

    subject_raw = await _call_tool("resolve_visual_subject_tool", {
        "business_type": bt,
        "caption": caption or brief[:300],
    })
    rules_raw = await _call_tool("get_sector_visual_rules_tool", {"business_type": bt})
    layout_raw = await _call_tool("recommend_poster_layout_tool", {
        "business_type": bt,
        "headline": headline or brand_name,
        "caption": caption or brief[:300],
    })
    prompt_raw = await _call_tool("build_image_edit_prompt_tool", {
        "business_type": bt,
        "headline": headline or brand_name,
        "caption": caption or brief[:300],
        "brand_name": brand_name,
    })

    qa_raw = ""
    try:
        prompt_data = json.loads(prompt_raw)
        qa_raw = await _call_tool("validate_visual_brief_tool", {
            "business_type": bt,
            "headline": headline or brand_name,
            "caption": caption or brief[:300],
            "image_edit_prompt": str(prompt_data.get("image_edit_prompt", "")),
        })
    except Exception as exc:
        logger.debug("design_mcp.qa_skipped", error=str(exc)[:120])

    # Reel: Runway director brief
    runway_raw = ""
    if content_type == "reel":
        try:
            runway_raw = await _call_tool("build_runway_director_prompt_tool", {
                "business_type": bt,
                "headline": headline or brand_name,
                "caption": caption or brief[:300],
                "brand_name": brand_name,
                "mood": _extract_vibe_field(brief, "mood"),
                "vibe_grading_look": _extract_vibe_field(brief, "grading_look"),
                "vibe_camera_movement": _extract_vibe_field(brief, "camera_movement"),
                "vibe_palette_description": _extract_vibe_field(brief, "palette"),
                "anti_patterns": _extract_vibe_field(brief, "anti_patterns"),
            })
        except Exception as exc:
            logger.debug("design_mcp.runway_brief_skipped", error=str(exc)[:120])

    # Story: scene brief with layout + animation
    story_raw = ""
    if content_type == "story":
        try:
            story_raw = await _call_tool("build_story_scene_brief_tool", {
                "business_type": bt,
                "headline": headline or brand_name,
                "caption": caption or brief[:300],
                "brand_name": brand_name,
                "mood": _extract_vibe_field(brief, "mood"),
                "template_use_case": _extract_vibe_field(brief, "template_use_case"),
                "vibe_palette_description": _extract_vibe_field(brief, "palette"),
                "anti_patterns": _extract_vibe_field(brief, "anti_patterns"),
            })
        except Exception as exc:
            logger.debug("design_mcp.story_brief_skipped", error=str(exc)[:120])

    # Carousel: slide structure + visual flow
    carousel_raw = ""
    if content_type == "carousel":
        try:
            carousel_raw = await _call_tool("build_carousel_brief_tool", {
                "business_type": bt,
                "headline": headline or brand_name,
                "caption": caption or brief[:300],
                "brand_name": brand_name,
                "slide_count": 4,
                "strategic_purpose": _extract_vibe_field(brief, "strategic_purpose"),
                "anti_patterns": _extract_vibe_field(brief, "anti_patterns"),
            })
        except Exception as exc:
            logger.debug("design_mcp.carousel_brief_skipped", error=str(exc)[:120])

    # Caption hook QA — always run for all content types
    caption_qa_raw = ""
    try:
        caption_qa_raw = await _call_tool("validate_caption_hook_tool", {
            "business_type": bt,
            "headline": headline or brand_name,
            "caption": caption or brief[:300],
            "content_type": content_type,
            "brand_language": _extract_vibe_field(brief, "language") or "tr",
        })
    except Exception as exc:
        logger.debug("design_mcp.caption_qa_skipped", error=str(exc)[:120])

    # Hashtag strategy — always run
    hashtag_raw = ""
    try:
        hashtag_raw = await _call_tool("build_hashtag_strategy_tool", {
            "business_type": bt,
            "content_type": content_type,
            "headline": headline or brand_name,
            "caption": caption or brief[:300],
            "brand_language": _extract_vibe_field(brief, "language") or "tr",
        })
    except Exception as exc:
        logger.debug("design_mcp.hashtag_strategy_skipped", error=str(exc)[:120])

    return {
        "ok": True,
        "mode": "local_mcp",
        "focus": focus,
        "content_type": content_type,
        "visual_subject": json.loads(subject_raw).get("visual_subject"),
        "sector_rules": json.loads(rules_raw),
        "layout_recommendation": json.loads(layout_raw),
        "image_edit_prompt_block": json.loads(prompt_raw),
        "validation": json.loads(qa_raw) if qa_raw else None,
        "runway_director": json.loads(runway_raw) if runway_raw else None,
        "story_scene": json.loads(story_raw) if story_raw else None,
        "carousel_brief": json.loads(carousel_raw) if carousel_raw else None,
        "caption_qa": json.loads(caption_qa_raw) if caption_qa_raw else None,
        "hashtag_strategy": json.loads(hashtag_raw) if hashtag_raw else None,
    }


def format_mcp_consult_response(payload: dict[str, Any]) -> str:
    if not payload.get("ok"):
        return f"Design consult failed: {payload.get('error', 'unknown')}"

    ct = payload.get("content_type", "post")
    lines = [
        f"[local_mcp] Smart Agency design consult (content_type={ct})",
        f"visual_subject: {payload.get('visual_subject')}",
    ]

    layout = payload.get("layout_recommendation") or {}
    if layout:
        lines.append(f"layout_family_hint: {layout.get('layout_family')}")
        lines.append(f"layout_rationale: {layout.get('rationale')}")

    rules = payload.get("sector_rules") or {}
    forbidden = rules.get("forbidden_elements") or []
    if forbidden:
        lines.append("forbidden: " + "; ".join(forbidden[:4]))

    prompt_block = payload.get("image_edit_prompt_block") or {}
    if prompt_block.get("image_edit_prompt"):
        lines.append(f"image_edit_prompt: {prompt_block['image_edit_prompt']}")

    if rules.get("scene_guidance"):
        lines.append(f"scene_guidance: {rules['scene_guidance']}")

    validation = payload.get("validation")
    if validation and not validation.get("pass"):
        lines.append("qa_issues: " + "; ".join(validation.get("issues") or []))

    # Reel: Runway director brief
    runway = payload.get("runway_director")
    if runway:
        lines.append("--- REEL DIRECTOR BRIEF ---")
        lines.append(f"camera_motion: {runway.get('camera_motion')}")
        lines.append(f"cinematic_concept: {runway.get('cinematic_concept', '')[:200]}")
        lines.append(f"director_brief: {runway.get('director_brief', '')[:300]}")
        fv = runway.get("forbidden_visuals") or []
        if fv:
            lines.append("forbidden_visuals: " + "; ".join(str(f) for f in fv[:4]))

    # Story: scene brief
    story = payload.get("story_scene")
    if story:
        lines.append("--- STORY SCENE BRIEF ---")
        lines.append(f"story_layout_family: {story.get('layout_family')}")
        lines.append(f"animation_style: {story.get('animation_style')}")
        overlay = story.get("overlay_copy") or {}
        if overlay.get("headline"):
            lines.append(f"overlay_headline: {overlay['headline']}")
        if overlay.get("cta"):
            lines.append(f"overlay_cta: {overlay['cta']}")
        lines.append(f"background_treatment: {story.get('background_treatment')}")

    # Carousel: slide structure
    carousel = payload.get("carousel_brief")
    if carousel:
        lines.append("--- CAROUSEL BRIEF ---")
        lines.append(f"carousel_layout_family: {carousel.get('layout_family')}")
        lines.append(f"narrative_arc: {carousel.get('narrative_arc')}")
        lines.append(f"visual_flow: {carousel.get('visual_flow', '')[:180]}")
        lines.append(f"cover_treatment: {carousel.get('cover_treatment')}")
        lines.append(f"swipe_hook: {carousel.get('swipe_hook', '')[:120]}")
        slides = carousel.get("slide_structure") or []
        for s in slides[:2]:
            lines.append(f"  slide_{s.get('index')} [{s.get('role')}]: {s.get('text', '')[:80]}")

    # Caption QA
    caption_qa = payload.get("caption_qa")
    if caption_qa:
        grade = caption_qa.get("grade", "?")
        score = caption_qa.get("hook_score", 0)
        hook_type = caption_qa.get("hook_type", "?")
        lines.append(f"--- CAPTION QA: grade={grade} score={score}/100 hook={hook_type} ---")
        weak = caption_qa.get("weak_signals") or []
        if weak:
            lines.append("caption_issues: " + "; ".join(weak[:3]))
        rewrite = caption_qa.get("rewrite_suggestion")
        if rewrite and not caption_qa.get("passes_qa"):
            lines.append(f"caption_rewrite_hint: {rewrite[:200]}")

    # Hashtag strategy
    hashtag = payload.get("hashtag_strategy")
    if hashtag:
        niche = hashtag.get("niche_tags") or []
        mid = hashtag.get("mid_tags") or []
        broad = hashtag.get("broad_tags") or []
        lines.append("--- HASHTAG STRATEGY ---")
        lines.append(f"niche_tags: {' '.join(niche[:5])}")
        lines.append(f"mid_tags: {' '.join(mid[:4])}")
        lines.append(f"broad_tags: {' '.join(broad[:3])}")
        lines.append(f"recommended_mix: {hashtag.get('recommended_mix', '')}")
        lines.append(f"usage_note: {hashtag.get('usage_note', '')[:120]}")

    return "\n".join(lines)


def consult_design_via_mcp_sync(**kwargs: Any) -> dict[str, Any]:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(consult_design_via_mcp(**kwargs))

    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, consult_design_via_mcp(**kwargs)).result()


async def probe_design_mcp() -> bool:
    try:
        from fastmcp import Client
        url = design_mcp_url()
        token = design_mcp_token()
        async with Client(url, auth=token) as client:
            tools = await client.list_tools()
            return len(tools) > 0
    except Exception as exc:
        logger.debug("design_mcp.probe_failed", error=str(exc)[:200])
        return False
