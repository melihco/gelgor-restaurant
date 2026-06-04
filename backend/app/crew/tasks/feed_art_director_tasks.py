"""
Feed Art Director Tasks — reviews weekly content batch for cohesion.
"""

from __future__ import annotations
import json
import re

from crewai import Agent, Task


def _weekly_theme_slug(weekly_theme: str) -> str:
    slug = re.sub(r"[^\w\-]+", "-", (weekly_theme or "").lower().strip())[:40].strip("-")
    return slug or "mission-week"


def create_feed_cohesion_task(
    agent: Agent,
    brand_name: str,
    business_type: str,
    weekly_theme: str,
    content_ideas_json: str,
    mission_type: str = "",
    mission_title: str = "",
    creative_brief: str = "",
    production_package: str = "weekly_content",
) -> Task:
    """
    Task: Review full weekly content batch → produce feed_art_director_report.

    `content_ideas_json` is the raw JSON array from content_ideation output.
    """
    weekly_theme_slug = _weekly_theme_slug(weekly_theme)

    mission_block = ""
    if mission_title or creative_brief or mission_type:
        mission_block = f"""
## Mission context
- Strategist type: {mission_type or "n/a"}
- Title: {mission_title or "n/a"}
- Creative brief: {creative_brief[:500] or "n/a"}
- Production package (Mission Hub): **{production_package}** — enforce matching slot counts and layout variety.
"""

    description = f"""
You are the Feed Art Director for {brand_name} ({business_type}).

Weekly theme: "{weekly_theme}"
{mission_block}

## Content batch to review:
{content_ideas_json[:6000]}

## Your analysis tasks:

### 1. Format distribution audit
Count actual formats in the batch. Compare to agency target: 40% post / 30% story / 20% reel / 10% carousel.
Flag if any format is 0 or if reels are missing when count ≥5.

### 2. Theme coherence score (0-100)
For each idea: does it support the weekly theme? Score: 100 = all on-theme, 0 = totally off.

### 3. Visual variety check
- Flag consecutive same-format ideas (e.g. 3 posts in a row)
- Flag ideas that feel visually identical (same subject, same treatment)
- Suggest reorder if needed

### 4. Overposting risk
Are any subject/topic clusters over-represented (>2 similar ideas)?
Flag the excess and suggest cutting or pivoting.

### 5. Hero reel slot
Pick ONE idea index (0-based) for the premium Runway motion reel this week.
Prefer high-visual-impact ideas with strong gallery photos. Only one hero reel per batch.

### 6. Layout family variety
Suggest 4-6 Remotion layout families from: editorial_bottom, magazine_cover, split_panel,
campaign_hero, cinematic_center, gallery_series, frosted_glass, neon_night, minimal_luxury.
Avoid repeating the same family more than twice in the batch.

### 7. Publish schedule (Mon–Sun)
Assign each idea to a day and optional time slot. Aim for:
- 1-2 posts per day max
- Spread formats across the week
- No reels on Monday (low organic reach)
- Carousels on Tuesday/Wednesday (highest save rate)

### 8. Production assignments (MANDATORY — one per idea index)
For EVERY idea in the batch (0-based index), assign exactly one production slot.
Copy (caption, CTA, hashtags) stays on the idea — this only routes VISUAL pipeline.

slot_role options:
- organic_post — gallery photo feed post (NO designed poster)
- designed_post — Remotion/SVG designed poster (campaign, promo, brand hero)
- campaign_story_motion — Remotion motion story MP4 (ALL story slots — no static-only stories)
- organic_reel — Runway reel (organic); hero_reel_index must point here
- campaign_reel_motion — Runway reel (campaign/promo)
- organic_carousel — multi-slide gallery carousel (2–4 photos)

pipeline must match role:
- organic_post → gallery_photo
- designed_post → remotion_poster
- campaign_story_motion → remotion_story
- organic_reel / campaign_reel_motion → runway_reel
- organic_carousel → carousel_gallery

### Brand template library slot (for campaign_story_motion only)
For every campaign_story_motion assignment, also set library_slot_key based on the idea content.
This tells the production engine which of the brand's 5 configured story templates to use:
- daily_story — everyday content, behind-the-scenes, educational, lifestyle moments
- event_story — events, live shows, openings, concerts, special nights, announcements
- campaign_post — promotional offers, limited-time deals, discount campaigns, product launches
- editorial_story — brand spotlights, chef/artist features, product showcases, editorial quality
- social_proof — customer reviews, testimonials, crowd photos, social moments, UGC

Match library_slot_key to the idea's dominant intent:
- Event/concert/show ideas → event_story
- Promo/offer/discount ideas → campaign_post
- Brand story/feature/spotlight ideas → editorial_story
- Customer proof/crowd/social ideas → social_proof
- General daily/behind-the-scenes → daily_story
Vary across the 3 story slots — do NOT assign the same library_slot_key to all 3 stories.

Weekly mission package (when batch has ≥7 ideas) — MANDATORY counts:
- exactly 1 organic_post
- exactly 1 designed_post
- exactly 1 organic_carousel
- exactly 3 campaign_story_motion (each a DIFFERENT layout_family_hint AND DIFFERENT library_slot_key)
- exactly 1 organic_reel (set hero_reel_index to that idea)

When batch has 5–6 ideas: still assign carousel + at least 2 campaign_story_motion + 1 organic_reel.

Campaign / seasonal / promo missions (theme contains "kampanya", "campaign", "etkinlik", "event", "fırsat", "offer"):
- MANDATORY: at least 1 campaign_story_motion (remotion_story pipeline)
- MANDATORY: hero_reel_index must point to organic_reel OR campaign_reel_motion
- Assign campaign/offer ideas → campaign_story_motion and/or designed_post (never organic_post only)
- When batch has 2+ reels and promo content: assign one organic_reel AND one campaign_reel_motion

Use copy_bundle_id: "{weekly_theme_slug}" or "mission-week" for all ideas in this batch.

Return ONLY valid JSON — no markdown, no preamble:

{{
  "feed_score": 0-100,
  "format_distribution": {{"post": N, "story": N, "reel": N, "carousel": N}},
  "format_vs_target": {{"post_delta": +/-N, "story_delta": +/-N, "reel_delta": +/-N, "carousel_delta": +/-N}},
  "theme_coherence": 0-100,
  "cohesion_notes": ["...note1...", "...note2..."],
  "flagged_ideas": [{{"index": N, "reason": "...", "severity": "warning|error"}}],
  "recommended_order": [N, N, N, ...],
  "hero_reel_index": N,
  "recommended_layout_families": ["magazine_cover", "split_panel", "campaign_hero", "editorial_bottom", "gallery_series"],
  "publish_schedule": {{
    "Mon": [{{"index": N, "format": "...", "suggested_time": "HH:MM"}}],
    "Tue": [...],
    "Wed": [...],
    "Thu": [...],
    "Fri": [...],
    "Sat": [...],
    "Sun": [...]
  }},
  "art_director_verdict": "One sentence summary of the batch quality and key recommendation",
  "production_assignments": [
    {{
      "idea_index": 0,
      "slot_role": "organic_post",
      "pipeline": "gallery_photo",
      "copy_bundle_id": "mission-week",
      "publish_channel": "instagram_organic",
      "layout_family_hint": "editorial_date",
      "rationale": "short reason"
    }},
    {{
      "idea_index": 1,
      "slot_role": "campaign_story_motion",
      "pipeline": "remotion_story",
      "copy_bundle_id": "mission-week",
      "publish_channel": "instagram_organic",
      "layout_family_hint": "magazine_cover",
      "library_slot_key": "event_story",
      "rationale": "event-themed idea → event_story brand template"
    }}
  ],
  "manifest_coverage_pct": 0-100,
  "production_package": "{production_package}"
}}
"""

    return Task(
        description=description,
        expected_output="Valid JSON feed_art_director_report — no markdown fences",
        agent=agent,
    )
