"""Visual Production Director task — batch visual specs per idea."""

from __future__ import annotations

from crewai import Agent, Task


def create_visual_production_director_task(
    agent: Agent,
    brand_name: str,
    business_type: str,
    ideas_json: str,
    weekly_theme: str = "",
    production_package: str = "weekly_content",
    feed_report_json: str = "",
    mcp_enabled: bool = False,
) -> Task:
    mcp_block = ""
    if mcp_enabled:
        mcp_block = """
## Agent design consult
Call agent_design_consult for EVERY idea (one call per idea batch is acceptable).
Always include in the brief: brand name, business_type, headline, caption, content_type, mood, language.

The consult returns:
- visual_subject / image_edit_prompt → use for all content types
- REEL: camera_motion + director_brief → fill reel_motion_spec
- STORY: layout_family + animation_style + overlay_copy → fill text_layers
- CAROUSEL: slide_structure + narrative_arc + swipe_hook → fill text_layers.slide_notes
- CAPTION QA: hook_score + weak_signals + rewrite_hint → if grade < B, improve caption summary
- HASHTAG STRATEGY: niche_tags + mid_tags → note in rationale for downstream use

Priority rules:
- If caption_qa.grade = C or D: note the weak_signals in rationale so downstream can fix
- If carousel: use narrative_arc to set treatment (educational → "feed_text_overlay", testimonial �� "social_proof_card")
- For agency_services / SaaS: visual_subject MUST be digital_ui — NEVER venue_ambiance
"""

    description = f"""
You are the Visual Production Director for {brand_name} ({business_type}).

Weekly theme: "{weekly_theme}"
Production package: {production_package}

## Ideas batch (do not change captions — visual specs only):
{ideas_json[:8000]}

## Feed Art Director report (slot roles / layout hints — respect these):
{feed_report_json[:3000] or "none"}
{mcp_block}

Produce visual production specs for EACH idea index present in the batch.

Respond ONLY with valid JSON (no markdown):

{{
  "specs": [
    {{
      "idea_index": 0,
      "visual_production_spec": {{
        "treatment": "pure_photo | story_event | feed_text_overlay | event_announcement",
        "visual_subject": "venue_ambiance | product_hero | digital_ui",
        "scene_mood": "3-5 words",
        "image_edit_prompt": "GPT image-2 / enhance directive — brand identity + post brief separated",
        "selected_gallery_url": "",
        "layout_family_hint": "editorial_bottom | gallery_series | cinematic_center | ...",
        "enhance_level": "subtle | moderate | full",
        "text_layers": {{ "headline": "", "cta": "" }},
        "reel_motion_spec": {{
          "camera_movement": "slow_push_in | orbit | ...",
          "motion_style": "editorial | energetic | ..."
        }}
      }},
      "rationale": "one sentence"
    }}
  ],
  "brand_visual_anchor": "one sentence — identity layer for whole batch"
}}

Critical:
- Do NOT invent gallery URLs unless you see one in the idea JSON — leave selected_gallery_url empty otherwise
- image_edit_prompt must start with preservation rules for visual_subject
- layout_family_hint must align with Feed Art Director assignments when provided
"""

    return Task(
        description=description,
        expected_output="Valid JSON with specs array",
        agent=agent,
    )
