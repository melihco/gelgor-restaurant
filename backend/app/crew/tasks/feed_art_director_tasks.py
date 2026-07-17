"""
Feed Art Director Tasks — reviews weekly content batch for cohesion.
"""

from __future__ import annotations
import json
import re

from crewai import Agent, Task

from app.crew.prompts.canva_archetype_prompts import CANVA_ARCHETYPE_AGENT_PROMPT_BLOCK
from app.services.feed_director_slot_catalog import format_catalog_slots_for_prompt

# 10-idea weekly batches with TR captions exceed 6k chars — keep full pool for slot routing.
FD_CONTENT_IDEAS_PROMPT_MAX_CHARS = 12_000
FD_CONTENT_IDEAS_INPUT_MAX_CHARS = 24_000
FD_CREATIVE_BRIEF_PROMPT_MAX_CHARS = 1_200
FD_BRIEFING_CONTEXT_MAX_CHARS = 2_400
WEEKLY_MANIFEST_SLOT_TOTAL = 16


def build_fd_gallery_coverage_block(brand) -> str:
    """Compact gallery topic inventory for Feed Art Director (no per-URL dump).

    Ideation already gets the full scene block; FD only needs coverage topics so
    ``visual_subject_hint`` stays grounded in photos the brand actually has.
    """
    gallery_raw = getattr(brand, "gallery_analysis", None) or ""
    if not gallery_raw:
        refs = getattr(brand, "reference_image_urls", None) or []
        if refs:
            return (
                "## Gallery coverage\n"
                f"- {len(refs)} reference photos (unanalyzed) — prefer concrete venue/product subjects; "
                "avoid inventing scenes not visible in brand media."
            )
        return (
            "## Gallery coverage\n"
            "- No gallery analysis — prefer organic/designed slots carefully; "
            "do NOT invent specific products, vehicles, or crowds in visual_subject_hint."
        )

    try:
        from collections import Counter

        data = json.loads(gallery_raw) if isinstance(gallery_raw, str) else gallery_raw
        if not isinstance(data, dict) or not data:
            return "## Gallery coverage\n- Empty gallery analysis."

        tag_counts: Counter[str] = Counter()
        scene_counts: Counter[str] = Counter()
        best_for_counts: Counter[str] = Counter()
        skip_tags = {
            "logo", "marka", "brand", "interior", "mekan", "decor", "decoration",
            "photo", "image", "picture",
        }

        for _url, meta in data.items():
            if not isinstance(meta, dict):
                continue
            tags = [str(t).strip().lower() for t in (meta.get("contentTags") or []) if str(t).strip()]
            for t in tags:
                if t not in skip_tags and len(t) > 2:
                    tag_counts[t] += 1
            label = tags[0] if tags else str(meta.get("suggestedAssetType") or "venue").lower()
            scene_counts[label] += 1
            for bf in meta.get("bestFor") or []:
                bf_s = str(bf).strip()
                if bf_s:
                    best_for_counts[bf_s] += 1

        top_topics = [t for t, _ in tag_counts.most_common(14)]
        top_scenes = [f"{label}×{n}" for label, n in scene_counts.most_common(10)]
        top_best = [b for b, _ in best_for_counts.most_common(8)]
        total = len(data)

        lines = [
            f"## Gallery coverage ({total} analyzed photos)",
            "Topics the brand can VISUALLY support (from gallery tags):",
            "  " + (", ".join(top_topics) if top_topics else "(general venue)"),
            "Scene clusters:",
            "  " + (", ".join(top_scenes) if top_scenes else "(unclustered)"),
        ]
        if top_best:
            lines.append("bestFor signals: " + ", ".join(top_best))
        lines.extend(
            [
                "",
                "GALLERY GROUNDING (mandatory for FD):",
                "- visual_subject_hint MUST use subjects from the coverage list above.",
                "- Prefer under-used scene clusters when spreading the week.",
                "- NEVER invent glassware/vehicles/crowds/products absent from coverage — "
                "pick a different idea/pipeline or a weaker but real gallery subject.",
                "- If an idea topic is missing from coverage, flag it or route to a format "
                "that does not require a mismatched hero photo.",
            ]
        )
        return "\n".join(lines)
    except Exception:
        return "## Gallery coverage\n- Gallery analysis unavailable (parse error)."


def build_fd_brand_dynamics_brief(brand, *, max_chars: int = 900) -> str:
    """Season/sector/location angles for FD routing (truncated Strategist block)."""
    try:
        from app.services.context_signal_service import build_brand_dynamics_block

        block = (build_brand_dynamics_block(brand) or "").strip()
    except Exception:
        return ""
    if not block:
        return ""
    header = "## Brand dynamics (use when choosing hero reel, schedule, and subject hints)\n"
    body = block
    budget = max_chars - len(header)
    if budget < 120:
        return ""
    if len(body) > budget:
        body = body[:budget].rsplit("\n", 1)[0].rstrip() + "\n…"
    return header + body


def build_feed_director_briefing_block(
    brand,
    *,
    max_chars: int = FD_BRIEFING_CONTEXT_MAX_CHARS,
) -> str:
    """Gallery coverage + brand dynamics for Feed Art Director task description."""
    parts = [
        build_fd_gallery_coverage_block(brand),
        build_fd_brand_dynamics_brief(brand),
    ]
    text = "\n\n".join(p for p in parts if (p or "").strip()).strip()
    if not text:
        return ""
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rsplit("\n", 1)[0].rstrip() + "\n…"


def parse_content_ideas_json(raw: str) -> list:
    """Parse ideation JSON array; tolerate markdown fences."""
    if not raw or not str(raw).strip():
        return []
    cleaned = str(raw).replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(cleaned)
    except Exception:
        return []
    return parsed if isinstance(parsed, list) else []


def truncate_content_ideas_json_for_fd(
    raw: str,
    max_chars: int = FD_CONTENT_IDEAS_INPUT_MAX_CHARS,
) -> str:
    """Truncate ideation payload on complete idea objects — never mid-JSON.

    Blind ``raw[:max_chars]`` breaks ``json.loads`` on large weekly batches (~30k),
    which skips catalog-first normalize in Feed Art Director (idea_count == 0).
    """
    if not raw:
        return ""
    cleaned = str(raw).replace("```json", "").replace("```", "").strip()
    if len(cleaned) <= max_chars:
        return cleaned
    ideas = parse_content_ideas_json(cleaned)
    if not ideas:
        # Last-resort: keep prefix only when parse already failed on full string.
        return cleaned[:max_chars]
    # Compact re-dump often fits under the limit even when pretty/raw exceeded it.
    compact_all = json.dumps(ideas, ensure_ascii=False)
    if len(compact_all) <= max_chars:
        return compact_all
    kept: list = []
    for idea in ideas:
        candidate = json.dumps(kept + [idea], ensure_ascii=False)
        if len(candidate) > max_chars and kept:
            break
        kept.append(idea)
        if len(candidate) > max_chars:
            break
    if not kept:
        # Single oversized idea — still emit a valid one-element array if possible.
        one = json.dumps([ideas[0]], ensure_ascii=False)
        return one if len(one) <= max_chars else cleaned[:max_chars]
    return json.dumps(kept, ensure_ascii=False)


def _weekly_theme_slug(weekly_theme: str) -> str:
    slug = re.sub(r"[^\w\-]+", "-", (weekly_theme or "").lower().strip())[:40].strip("-")
    return slug or "mission-week"


def _production_assignment_directive(
    production_package: str,
    idea_count: int = 0,
    catalog_slots: list[dict[str, str]] | None = None,
) -> str:
    if production_package == "opportunity":
        catalog_note = (
            "Pick catalog_slot_key from the brand catalog for designed/story/reel slots."
            if catalog_slots
            else ""
        )
        return f"""
### 8. Production assignments (MANDATORY — exactly 3 opportunity slots)
Return **exactly 3** entries in production_assignments — one per opportunity package slot.
Reuse idea_index round-robin when fewer than 3 ideas exist. Do NOT assign paid ads or carousel.
{catalog_note}

Required slot mix (opportunity):
- exactly 1 designed_post (catalog_slot_key required when catalog loaded)
- exactly 1 campaign_story_motion (catalog_slot_key required — story format from brand catalog)
- exactly 1 organic_reel (set hero_reel_index to that idea_index)

manifest_coverage_pct must be 100 when all 3 slots are assigned.
"""
    n = max(int(idea_count), 1)
    if catalog_slots:
        return f"""
### 8. Production assignments (MANDATORY — catalog-first, exactly {n} slots)
Return **exactly {n}** entries in production_assignments — **one per idea** (idea_index 0..{n - 1}).
Do NOT reuse the same idea_index on multiple slots. Do NOT pad to 16.

**Catalog-first rules (mandatory when brand catalog is loaded):**
1. Pick `catalog_slot_key` ONLY from the brand catalog JSON below — prefer unique keys.
2. Set `slot_role` and `pipeline` to match the chosen catalog row AND the idea's format.
3. Include `catalog_slot_label` copied from the catalog row's `label_tr`.
4. Format comes from each idea (`format` / `content_type`) — calendar may already have stamped it.
5. Do NOT use legacy Remotion names or invent slots without a catalog key when catalog is loaded.

manifest_coverage_pct must be 100 when all {n} idea slots are assigned.
"""
    return f"""
### 8. Production assignments (MANDATORY — exactly {n} slots, one per idea)
Return **exactly {n}** entries in production_assignments — one per idea_index 0..{n - 1}.
Do NOT reuse idea_index. Do NOT pad to a fixed weekly 16.

For each idea, pick slot_role/pipeline from the idea's format:
- post → fal_designed_post / fal_design (or organic_post / gallery_photo when clearly gallery-only)
- story → campaign_story_motion / fal_story
- reel → organic_reel / fal_reel
- carousel → organic_carousel / carousel_gallery

manifest_coverage_pct must be 100 when all {n} idea slots are assigned.
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
    catalog_slots: list[dict[str, str]] | None = None,
    briefing_context: str = "",
) -> Task:
    """
    Task: Review full weekly content batch → produce feed_art_director_report.

    `content_ideas_json` is the raw JSON array from content_ideation output.
    `briefing_context` is gallery coverage + brand dynamics (optional).
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
    slot_directive = _production_assignment_directive(
        production_package,
        idea_count,
        catalog_slots,
    )
    catalog_block = format_catalog_slots_for_prompt(catalog_slots)

    mission_block = ""
    if mission_title or creative_brief or mission_type:
        mission_block = f"""
## Mission context
- Strategist type: {mission_type or "n/a"}
- Title: {mission_title or "n/a"}
- Creative brief: {creative_brief[:FD_CREATIVE_BRIEF_PROMPT_MAX_CHARS] or "n/a"}
- Production package (Mission Hub): **{production_package}** — enforce matching slot counts and layout variety.
"""

    briefing_block = ""
    if (briefing_context or "").strip():
        briefing_block = f"""
## Brand visual briefing (gallery diversity + dynamics)
Use this when scoring cohesion, picking hero_reel, and writing visual_subject_hint.
Do not invent subjects the gallery cannot show.
{briefing_context.strip()}
"""

    canva_archetypes = CANVA_ARCHETYPE_AGENT_PROMPT_BLOCK

    description = f"""
You are the Feed Art Director for {brand_name} ({business_type}).

Weekly theme: "{weekly_theme}"
{mission_block}
{briefing_block}

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
Pick ONE idea index (0-based) for the premium motion reel this week.
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

{catalog_block}
{slot_directive}

For EVERY assignment entry include: idea_index, slot_role, pipeline, copy_bundle_id, publish_channel, rationale.
Required for Fal/designed slots: catalog_slot_key (from brand catalog list above — locks onboarding template).
Optional: layout_family_hint (designed_post / stories), fal_design_hint.

### MANDATORY: visual_subject_hint for every gallery-using slot
For ALL slots that use real brand gallery photos (organic_post, organic_story_still, campaign_story_motion, organic_carousel, organic_reel),
include "visual_subject_hint": a comma-separated list of 2-4 specific visual subject keywords the gallery photo MUST show.
These keywords are matched against the photo's vision analysis tags — they act as a photo selection filter.
When Gallery coverage is provided above, every hint keyword should map to that coverage (or a close synonym).

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
  Also set catalog_slot_key to a post-format slot from the brand catalog (e.g. campaign/promo intent).
- designed_typography — fal.ai typography-forward designed feed post; exactly ONE per weekly mission (text-forward Canva-style).
  Set fal_design_hint with typography hierarchy, headline/subline placement, and mood aligned to the caption.
- fal_designed_post — fal.ai/GPT-image hybrid designed feed post; exactly ONE per weekly mission (uses gallery photo).
- fal_only_post — tam fal.ai designed feed post; exactly ONE per weekly mission (NO gallery, NO GPT — pure Ideogram/Flux).
- fal_only_story — tam fal.ai motion story; exactly ONE (NO gallery, NO Remotion — pure Ideogram + I2V).
- fal_only_reel — tam fal.ai motion reel; exactly ONE (NO gallery — pure Ideogram + I2V).
- campaign_story_motion — Remotion motion story MP4; exactly TWO designed story variants per weekly mission
- organic_story_still — static gallery story buffer for daily publishing resilience
- organic_reel — motion reel (organic); hero_reel_index must point here
- campaign_reel_motion — motion reel (campaign/promo)
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
- paid_ad_creative → fal_design (Meta Ads paid creative — set fal_design_hint: meta_ads_feed_creative; gallery photo required)
- paid_ad_google_creative → fal_design (Google Ads display asset — set fal_design_hint: google_ads_display_creative; headline max 30 chars)

### Brand catalog slot routing
For every Fal/designed assignment, set catalog_slot_key from the enabled brand catalog JSON above.
This locks the tenant's onboarding template for that slot (layout, typography, pipeline).
- Event/concert/show ideas → story slot with event/announcement intent
- Promo/offer/discount post ideas → post-format campaign/promo slot
- Brand story/feature/spotlight ideas → editorial or hero post/story slot
- Customer proof/crowd/social ideas → social proof post or story slot
- General daily/behind-the-scenes → lifestyle/daily story or organic post (catalog optional)
Vary catalog_slot_key across similar slots — do NOT repeat the same key twice when alternatives exist.
For designed_post / designed_typography / fal_designed_post / fal_only_post pick post-format keys.
For campaign_story_motion / fal_only_story pick story-format keys.
For reel slots pick reel-format keys.
Do NOT use legacy Remotion names (campaign_post, daily_story, event_story).

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
      "catalog_slot_key": "<post-format slot_key from brand catalog>",
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
      "catalog_slot_key": "<post-format slot_key from brand catalog>",
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
      "catalog_slot_key": "<story-format slot_key from brand catalog>",
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
      "catalog_slot_key": "<different story-format slot_key from brand catalog>",
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
