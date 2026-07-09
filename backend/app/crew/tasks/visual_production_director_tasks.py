"""Visual Production Director task — batch visual specs per idea."""

from __future__ import annotations

from crewai import Agent, Task

from app.crew.prompts.canva_archetype_prompts import CANVA_ARCHETYPE_AGENT_PROMPT_BLOCK


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

    canva_archetypes = CANVA_ARCHETYPE_AGENT_PROMPT_BLOCK

    description = f"""
You are the Visual Production Director for {brand_name} ({business_type}).

Weekly theme: "{weekly_theme}"
Production package: {production_package}

## Ideas batch (do not change captions — visual specs only):
{ideas_json[:8000]}

## Feed Art Director report (slot roles / layout hints — respect these):
{feed_report_json[:3000] or "none"}
{canva_archetypes}
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
        }},
        "fal_design_brief": {{
          "canva_archetype": "one id from picklist e.g. diagonal_brand_split | neon_night_promo | split_feature_panel",
          "creative_hook": "one sentence — what makes this design scroll-stopping vs generic",
          "layout_pattern": "diagonal_split | top_masthead | quote_card | hero_object | graphic_layering",
          "typography_mode": "headline_stack | quote_pull | event_masthead | minimal_overlay | bold_display",
          "photo_zone": "where real gallery photo lives if applicable — e.g. lower 50% hero, natural pixels",
          "graphic_accents": ["accent bar", "divider line", "circle frame"],
          "caption_visual_bridge": "single sentence linking caption message → visual treatment",
          "designer_rationale": "why this layout fits THIS caption (designer eye)",
          "differentiator": "what makes this NOT look like stock Canva template",
          "motion_cue": "for reels — how motion serves the design (or static for posts)",
          "logo_position": "top_left | top_center | top_right | bottom_left | bottom_center | bottom_right — match layout; never over photo focal point",
          "logo_zone": "one sentence — where the official logo sits in THIS layout (e.g. inside top color panel, above headline stack)",
          "avoid": ["amateur beige split", "unreadable text on busy photo"]
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
- For ideas assigned to fal.ai slots (designed_post, designed_typography, fal_designed_post, fal_reel_motion, fal_only_*): ALWAYS fill fal_design_brief.
  Evaluate as a senior social media designer: layout, typography hierarchy, graphic accents, caption→visual bridge.
  fal_design_brief must make the fal.ai output feel Canva Pro premium — not a raw photo with floating text.
- When premium_composition exists on an idea, align fal_design_brief.layout_pattern and graphic_accents with it.
- Pick fal_design_brief.canva_archetype from the CANVA PRO ARCHETYPE PICKLIST above — must match caption intent and sector.
- For fal_design_brief logo fields: place the venue's EXISTING logo (never redraw it). logo_position + logo_zone must align with layout_pattern and photo_zone — e.g. diagonal split → logo on color wedge, not over the dish in the photo hero.
"""

    return Task(
        description=description,
        expected_output="Valid JSON with specs array",
        agent=agent,
    )
