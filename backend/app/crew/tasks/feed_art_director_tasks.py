"""
Feed Art Director Tasks — reviews weekly content batch for cohesion.
"""

from __future__ import annotations
import json
import re

from crewai import Agent, Task

from app.crew.prompts.canva_archetype_prompts import CANVA_ARCHETYPE_AGENT_PROMPT_BLOCK

# 10-idea weekly batches with TR captions exceed 6k chars — keep full pool for slot routing.
FD_CONTENT_IDEAS_PROMPT_MAX_CHARS = 12_000
FD_CONTENT_IDEAS_INPUT_MAX_CHARS = 24_000
FD_CREATIVE_BRIEF_PROMPT_MAX_CHARS = 1_200
WEEKLY_MANIFEST_SLOT_TOTAL = 16


def _weekly_theme_slug(weekly_theme: str) -> str:
    slug = re.sub(r"[^\w\-]+", "-", (weekly_theme or "").lower().strip())[:40].strip("-")
    return slug or "mission-week"


def _production_assignment_directive(production_package: str, idea_count: int = 0) -> str:
    if production_package == "opportunity":
        return """
### 8. Production assignments (MANDATORY — exactly 3 opportunity slots)
Return **exactly 3** entries in production_assignments — one per opportunity package slot.
Reuse idea_index round-robin when fewer than 3 ideas exist. Do NOT assign paid ads or carousel.

Required slot mix (opportunity):
- exactly 1 designed_post
- exactly 1 campaign_story_motion (library_slot_key required)
- exactly 1 organic_reel (set hero_reel_index to that idea_index)

manifest_coverage_pct must be 100 when all 3 slots are assigned.
"""
    n = max(int(idea_count), 1)
    return f"""
### 8. Production assignments (MANDATORY — exactly {WEEKLY_MANIFEST_SLOT_TOTAL} weekly slots)
Return **exactly {WEEKLY_MANIFEST_SLOT_TOTAL}** entries in production_assignments — one per manifest slot, NOT one per idea.
Reuse idea_index round-robin across the {n} ideas in this batch (same idea_index may appear on multiple slots).

Required slot mix (weekly_content / agency):
- exactly 2 organic_post (gallery_photo)
- exactly 1 designed_post + 1 designed_typography (fal_design — gallery match + agent design brief)
- exactly 1 fal_designed_post (fal_design)
- exactly 1 organic_carousel (carousel_gallery)
- exactly 2 campaign_story_motion (fal_story) — different library_slot_key each
- exactly 1 organic_story_still (story_still)
- exactly 1 organic_reel + 1 campaign_reel_motion (fal_reel) — set hero_reel_index on organic_reel
- exactly 2 fal_reel_motion (fal_reel)
- exactly 1 fal_only_post (fal_only_post)
- exactly 2 fal_only_reel (fal_only_reel)

Campaign story slots use fal.ai grounded 9:16 posters (gallery photo + ideation headline) — NOT Remotion.
Do NOT assign remotion_story or fal_only_story in weekly missions.

manifest_coverage_pct must be 100 when all {WEEKLY_MANIFEST_SLOT_TOTAL} slots are assigned.
"""


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
    idea_count = 0
    try:
        parsed = json.loads(
            content_ideas_json.replace("```json", "").replace("```", "").strip()
        )
        if isinstance(parsed, list):
            idea_count = len(parsed)
    except Exception:
        pass
    slot_directive = _production_assignment_directive(production_package, idea_count)

    mission_block = ""
    if mission_title or creative_brief or mission_type:
        mission_block = f"""
## Mission context
- Strategist type: {mission_type or "n/a"}
- Title: {mission_title or "n/a"}
- Creative brief: {creative_brief[:FD_CREATIVE_BRIEF_PROMPT_MAX_CHARS] or "n/a"}
- Production package (Mission Hub): **{production_package}** — enforce matching slot counts and layout variety.
"""

    canva_archetypes = CANVA_ARCHETYPE_AGENT_PROMPT_BLOCK

    description = f"""
You are the Feed Art Director for {brand_name} ({business_type}).

Weekly theme: "{weekly_theme}"
{mission_block}

## Content batch to review (combined pool from two independent sources):
- source_node "content_ideation": creative ideas from the ideation agent — concept_title / headline / caption_draft
- source_node "content_calendar": event-based ideas from the calendar agent — headline is the event name (concept_title), caption_draft is the event description
Review all ideas on their own merits regardless of source. Assign the best ideas to production slots.
{content_ideas_json[:FD_CONTENT_IDEAS_PROMPT_MAX_CHARS]}

## Your analysis tasks:

### 1. Format distribution audit
Count actual formats in the batch. Flag if any format is 0 when the batch clearly needs that format (e.g. reels missing when several reel ideas exist).

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
- 1-2 outputs per day max
- Spread formats across the week
- No reels on Monday (low organic reach)
- Carousels on Tuesday/Wednesday (highest save rate)
- For idea-driven missions, schedule one primary publish moment per idea; spread formats across the week.

{slot_directive}

For EVERY assignment entry include: idea_index, slot_role, pipeline, copy_bundle_id, publish_channel, rationale.
Optional: layout_family_hint (designed_post / stories), library_slot_key (designed_post and campaign_story_motion).

### MANDATORY: visual_subject_hint for every gallery-using slot
For ALL slots that use real brand gallery photos (organic_post, organic_story_still, campaign_story_motion, organic_carousel, organic_reel),
include "visual_subject_hint": a comma-separated list of 2-4 specific visual subject keywords the gallery photo MUST show.
These keywords are matched against the photo's vision analysis tags — they act as a photo selection filter.

For fal.ai design slots (designed_post, designed_typography, fal_designed_post, fal_reel_motion, fal_only_post, fal_only_reel, fal_only_story),
ALSO include "fal_design_hint": one sentence from a senior social designer — layout pattern, typography emphasis,
graphic accents, and how the caption message should LOOK (Canva Pro quality). Example:
"fal_design_hint": "diagonal_brand_split — mustard headline stack on teal block, venue photo hero lower-right, accent bar under CTA"

{canva_archetypes}

Rules for visual_subject_hint:
- Use the same language as the caption (TR/EN) + specific service/product terminology from the idea
- For beauty/nail ideas: MUST include the specific service (e.g. "tırnak, manikür, nail art" — NOT "güzellik, bakım")
- For food ideas: specify the dish type (e.g. "kahvaltı, tabak" — NOT just "yemek")
- For event ideas: specify the visual scene (e.g. "sahne, kalabalık, gece")
- For before/after results: include "before after, sonuç"
- For product/showcase: specify the exact product (e.g. "kalıcı oje, el, parmak")
- NEVER use generic words alone (güzellik, hizmet, bakım, servis) without a specific qualifier

For EVERY manifest slot, create exactly one assignment entry.
Copy (caption, CTA, hashtags) stays on the linked idea — this routes VISUAL pipeline per slot.
Reuse idea_index round-robin when fewer than {WEEKLY_MANIFEST_SLOT_TOTAL} ideas exist.

slot_role options:
- organic_post — gallery photo feed post (NO designed poster)
- designed_post — fal.ai/GPT-image designed feed post (campaign, promo, brand hero); exactly ONE per weekly mission
  Gallery photo MUST match caption via visual_subject_hint; set fal_design_hint with layout, typography, and brand vibe for the agent design brief.
  For designed_post set layout_family_hint to a POSTER family (not story):
  editorial_date | restaurant_feature for B2B/logistics/service seasonal copy;
  promo_split ONLY when copy has % / indirim / kampanya;
  event_masthead for dated launches. Never hint promo_split for vague "fırsat" alone.
  Also set library_slot_key to campaign_post, social_proof_post, or ad_creative_post so the brand can reuse this post template later.
- designed_typography — fal.ai typography-forward designed feed post; exactly ONE per weekly mission (text-forward Canva-style).
  Set fal_design_hint with typography hierarchy, headline/subline placement, and mood aligned to the caption.
- fal_designed_post — fal.ai/GPT-image hybrid designed feed post; exactly ONE per weekly mission (uses gallery photo).
- fal_only_post — tam fal.ai designed feed post; exactly ONE per weekly mission (NO gallery, NO GPT — pure Ideogram/Flux).
- fal_only_story — tam fal.ai motion story; exactly ONE (NO gallery, NO Remotion — pure Ideogram + I2V).
- fal_only_reel — tam fal.ai motion reel; exactly ONE (NO gallery, NO Runway — pure Ideogram + I2V).
- campaign_story_motion — Remotion motion story MP4; exactly TWO designed story variants per weekly mission
- organic_story_still — static gallery story buffer for daily publishing resilience
- organic_reel — Runway reel (organic); hero_reel_index must point here
- campaign_reel_motion — Runway reel (campaign/promo)
- organic_carousel — multi-slide gallery carousel (2–4 photos)

pipeline must match role:
- organic_post → gallery_photo
- designed_post → fal_design
- designed_typography → fal_design
- fal_designed_post → fal_design
- fal_only_post → fal_only_post
- fal_only_story → fal_only_story
- fal_only_reel → fal_only_reel
- organic_story_still → story_still
- campaign_story_motion → fal_story
- organic_reel / campaign_reel_motion → fal_reel
- organic_carousel → carousel_gallery

### Brand template library slot
For every campaign_story_motion and designed_post assignment, also set library_slot_key based on the idea content.
This tells the production engine which configured reusable template to use:
- daily_story — everyday content, behind-the-scenes, educational, lifestyle moments
- event_story — events, live shows, openings, concerts, special nights, announcements
- campaign_post — promotional offers, limited-time deals, discount campaigns, product launches (designed_post)
- editorial_story — brand spotlights, chef/artist features, product showcases, editorial quality
- social_proof — customer reviews, testimonials, crowd photos, social moments, UGC
- social_proof_post — customer/review proof as a designed_post
- ad_creative_post — paid/ad style designed_post

Match library_slot_key to the idea's dominant intent:
- Event/concert/show ideas → event_story
- Promo/offer/discount post ideas → campaign_post
- Brand story/feature/spotlight ideas → editorial_story
- Customer proof/crowd/social ideas → social_proof
- General daily/behind-the-scenes → daily_story
Vary across the 2 story slots — do NOT assign the same library_slot_key to both stories.
For the designed_post slot prefer campaign_post or social_proof_post based on the idea intent.

Weekly mission — one assignment per idea ({idea_count} ideas in this batch):
- Match slot_role/pipeline to each idea's format (post → organic_post/designed_post/fal_*, story → campaign_story_motion/organic_story_still, reel → organic_reel/campaign_reel_motion, carousel → organic_carousel)
- Vary pipelines across ideas; do NOT assign the same idea_index twice
- Set hero_reel_index on the strongest reel idea

Campaign / seasonal / promo missions (theme contains "kampanya", "campaign", "etkinlik", "event", "fırsat", "offer"):
- Prefer campaign_story_motion and designed_post for campaign/offer ideas
- hero_reel_index should point to the best reel idea when reels exist

Use copy_bundle_id: "{weekly_theme_slug}" or "mission-week" for all ideas in this batch.

Return ONLY valid JSON — no markdown, no preamble:

{{
  "feed_score": 0-100,
  "format_distribution": {{"post": 5, "story": 4, "reel": 3, "carousel": 1}},
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
      "visual_subject_hint": "ürün, mekan, close-up",
      "rationale": "strongest real-photo idea → gallery_photo feed post"
    }},
    {{
      "idea_index": 1,
      "slot_role": "organic_post",
      "pipeline": "gallery_photo",
      "copy_bundle_id": "mission-week",
      "publish_channel": "instagram_organic",
      "visual_subject_hint": "müşteri, deneyim, ortam",
      "rationale": "second daily feed idea → gallery_photo buffer post"
    }},
    {{
      "idea_index": 2,
      "slot_role": "designed_post",
      "pipeline": "fal_design",
      "copy_bundle_id": "mission-week",
      "publish_channel": "instagram_organic",
      "layout_family_hint": "restaurant_feature",
      "library_slot_key": "campaign_post",
      "fal_design_hint": "Campaign hero post: bold headline on matched gallery photo, brand colors, premium hospitality layout.",
      "visual_subject_hint": "teras, deniz, gün batımı",
      "rationale": "brand hero idea → fal designed post"
    }},
    {{
      "idea_index": 3,
      "slot_role": "designed_typography",
      "pipeline": "fal_design",
      "copy_bundle_id": "mission-week",
      "publish_channel": "instagram_organic",
      "layout_family_hint": "promo_split",
      "library_slot_key": "social_proof_post",
      "fal_design_hint": "Typography-forward proof post: short headline + subline, minimal layout on gallery match.",
      "visual_subject_hint": "müşteri, deneyim",
      "rationale": "campaign or proof idea → fal typography designed post"
    }},
    {{
      "idea_index": 4,
      "slot_role": "organic_carousel",
      "pipeline": "carousel_gallery",
      "copy_bundle_id": "mission-week",
      "publish_channel": "instagram_organic",
      "visual_subject_hint": "ürün, detay, süreç",
      "rationale": "multi-angle idea → gallery carousel swipe"
    }},
    {{
      "idea_index": 5,
      "slot_role": "campaign_story_motion",
      "pipeline": "fal_story",
      "copy_bundle_id": "mission-week",
      "publish_channel": "instagram_organic",
      "layout_family_hint": "campaign_hero",
      "library_slot_key": "editorial_story",
      "visual_subject_hint": "marka, öne çıkan, vitrin",
      "rationale": "brand spotlight idea → fal.ai story poster #1"
    }},
    {{
      "idea_index": 6,
      "slot_role": "campaign_story_motion",
      "pipeline": "fal_story",
      "copy_bundle_id": "mission-week",
      "publish_channel": "instagram_organic",
      "layout_family_hint": "frosted_glass",
      "library_slot_key": "daily_story",
      "visual_subject_hint": "günlük, sahne, atmosfer",
      "rationale": "everyday vibe idea → fal.ai story poster #2 (different template)"
    }},
    {{
      "idea_index": 7,
      "slot_role": "organic_story_still",
      "pipeline": "story_still",
      "copy_bundle_id": "mission-week",
      "publish_channel": "instagram_organic",
      "visual_subject_hint": "günlük, atmosfer, detay",
      "rationale": "low-cost backup story for 30% production buffer"
    }},
    {{
      "idea_index": 8,
      "slot_role": "organic_reel",
      "pipeline": "fal_reel",
      "copy_bundle_id": "mission-week",
      "publish_channel": "instagram_organic",
      "visual_subject_hint": "hareket, dinamik, sahne",
      "rationale": "highest-visual-impact idea → fal designer hero reel"
    }},
    {{
      "idea_index": 9,
      "slot_role": "campaign_reel_motion",
      "pipeline": "fal_reel",
      "copy_bundle_id": "mission-week",
      "publish_channel": "instagram_organic",
      "visual_subject_hint": "müşteri, deneyim, sosyal",
      "rationale": "behind-the-scenes or social proof idea → fal designer second reel"
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
