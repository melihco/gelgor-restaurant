"""
Brand context builder for CrewAI agents.

Transforms database BrandContext + BrandAssets into a structured string
that gets injected into every agent's backstory and task descriptions.
This ensures agents produce brand-aware, business-specific outputs
instead of generic AI content.
"""

from __future__ import annotations

import structlog
from dataclasses import dataclass, field

from app.crew.cta_localization import localize_ctas, resolve_language_code, resolve_output_language

_logger = structlog.get_logger()


@dataclass
class BrandInfo:
    """Flattened brand context passed to the orchestration layer."""

    # ── Core identity ──────────────────────────────────────────────────────
    business_name: str
    business_type: str
    description: str = ""
    brand_tone: str = "professional"
    visual_style: str = ""
    target_audience: str = ""
    location: str = ""
    languages: str = "tr"
    campaign_goals: str = ""
    competitors: str = ""
    custom_rules: str = ""
    keywords: str = ""
    asset_descriptions: list[str] | None = None

    # ── Discovery intelligence (added 2025-05-07) ─────────────────────────
    # Confirmed content types for this brand (e.g. ["daily_story", "menu_share"])
    content_pillars: list[str] = field(default_factory=list)
    # Brand-specific call-to-action phrases (e.g. ["Rezervasyon Yap", "Menüye Bak"])
    default_ctas: list[str] = field(default_factory=list)
    # Approval rules per signal type (e.g. {"price": "approval_required"})
    risk_rules: dict[str, str] = field(default_factory=dict)
    # Top hashtags extracted from Instagram account
    instagram_top_hashtags: list[str] = field(default_factory=list)
    instagram_handle: str = ""
    website_summary: str = ""
    instagram_bio: str = ""
    # Verbatim recent captions — injected so agents match the brand's real writing voice
    instagram_recent_captions: list[str] = field(default_factory=list)
    # GPT-4o structured analysis of Instagram: voice, themes, CTAs, emotional triggers
    instagram_intelligence: dict | None = None
    discovery_confidence: int | None = None
    brand_constitution_confirmed: bool = False
    reference_image_urls: list[str] = field(default_factory=list)
    visual_dna: str = ""
    competitor_brief: str = ""
    # Weekly seasonal + location trend context — injected into Content Strategy Agent.
    trend_brief: str = ""
    # Daily competitor activity digest from Market Intelligence Agent
    competitor_pulse: str = ""
    # Urgent content opportunities from today's market scan (JSON list)
    market_opportunity_ideas: str = ""

    # ── Google Business signals (rating, review excerpts) ─────────────────
    google_rating: str = ""
    google_review_count: int | None = None
    # Top review excerpts: [{"text": "...", "stars": 5}, ...]
    google_review_signals: list[dict] = field(default_factory=list)

    # ── Social Listening (daily: brand mentions, hashtag trends, competitor web) ─
    social_signals: str = ""
    # ── Brand DNA (weekly synthesis of all signals — master intelligence layer) ─
    brand_dna: str = ""
    brand_dna_updated_at: str = ""

    # ── Gallery intelligence — analyzed brand photos with content tags ───────
    # JSON dict: {url: {contentTags, mood, usageContext, description, suggestedAssetType}}
    gallery_analysis: str = ""

    # ── Visual DNA / Brand Vibe Profile (JSONB from brand_contexts.brand_vibe_profile) ─
    # Rich structured vibe: palette, typography, motion, grading, composition, audio, caption_voice
    # Used by auto-produce for image/video generation; injected here for CrewAI agents
    brand_vibe_profile: dict | None = None

    # Derived design tokens (Brand Hub → Ayarlar): LUT, anti_patterns, caption_voice_rules, AI enhance flags
    brand_theme: dict | None = None
    brand_theme_updated_at: str = ""

    # ── Website Intelligence — menu catalog, venue/product photos from onboarding crawl ─
    website_intelligence: dict | None = None

    # ── Brand Service Profile (validated positioning — migration 0026) ────
    # Authoritative category + signature offerings + CTA style + seasonality +
    # guardrails. Injected at the top of the Business Profile prompt block and
    # treated as the source of truth over the brittle `business_type` string.
    service_profile: dict | None = None

    # ── Extended brand intelligence (migration 0012) ───────────────────────
    # Tripadvisor reviews — JSON list of {text, rating, date}
    tripadvisor_reviews: str = ""
    # Hyper-local Instagram posts at brand's location — JSON list of {caption, hashtags, likes}
    location_posts: str = ""
    # Google Trends interest data — JSON list of {keyword, interestOverTime}
    google_trends: str = ""
    # ── Industry intelligence (injected by industry_intelligence_service) ──
    # JSON string of the full industry calendar; prompt block built on the fly
    industry_calendar: str = ""

    # ── Tenant learning context (injected by tenant_learning_service) ─────
    learning_context: str = ""

    # ── Operating policy (capabilities + gallery rules from CompanyProfile) ─
    operating_capabilities: list[str] = field(default_factory=list)
    gallery_policy: dict = field(default_factory=dict)
    operating_policy_prompt: str = ""

    # ── Per-tenant LLM override (optional) ────────────────────────────────
    # If set, overrides global CREWAI_LLM_PROVIDER / model for this tenant.
    # Stored in brand_context.llm_provider / brand_context.llm_model columns.
    # Example: provider="anthropic", model="claude-opus-4-7"  for a B2B event firm
    #          provider="openai",    model="gpt-4o"            for a hospitality brand
    # None = fall back to global smart routing (get_llm default behaviour).
    preferred_llm_provider: str | None = None
    preferred_llm_model: str | None = None

    # ── Tenant workspace ID (for logging / isolation checks) ──────────────
    # Populated from the Python workspace/Nexus tenant UUID.
    # Never used as a data key — purely for audit logging.
    tenant_id: str = ""
    workspace_id: str = ""

    # ── Pinterest Visual Inspiration ───────────────────────────────────────
    # Loaded from brand_contexts.visual_inspiration (JSON).
    # visual_themes: top 10 recurring keywords from scraped pins (e.g. ["golden hour","minimal"])
    # pinterest_top_pins: [{title, imageUrl, saves}] — top 8 pins by save count
    # Both are per-tenant; injected into image gen prompts and video production specs.
    pinterest_visual_themes: list[str] = field(default_factory=list)
    pinterest_top_pins: list[dict] = field(default_factory=list)

    # ── Used image URLs (transient, set per execution from input_data) ─────
    # Gallery URLs already used in published artifacts — agents should prefer
    # unused photos when selecting visuals for new content.
    used_image_urls: list[str] = field(default_factory=list)
    # Per post-type usage: feed | story | reel | carousel → gallery URLs already used
    used_images_by_type: dict[str, list[str]] = field(default_factory=dict)

    # ── Mission Memory (Task 7 — set by TaskGraphExecutor for campaign executions) ──
    # When set, build_brand_context_prompt appends the Mission Context block so
    # agents within the same campaign share narrative continuity.
    # None = standard single-task execution, identical to pre-Task-7 behaviour.
    mission_memory: "MissionMemory | None" = field(default=None, repr=False)


_TONE_RULES: dict[str, list[str]] = {
    "friendly": [
        "### ✍️ Tone Writing Rules (Samimi)",
        "- Write like a trusted local friend, not a corporation.",
        "- Use 'sen' form (informal address). Warm, personal openers.",
        "- Emoji: 1-2 per caption for warmth, never every sentence.",
        "- Short sentences with natural Turkish rhythm. Avoid stiff corporate phrasing.",
        "- CTAs feel like an invitation: 'Uğra gel', 'Seni bekliyoruz', 'Bir de sen dene'.",
        "- Storytelling hook: 'Bugün şunu fark ettik...', 'Bir müşterimiz şunu dedi...'",
    ],
    "luxury": [
        "### ✍️ Tone Writing Rules (Premium/Luxury)",
        "- Restraint is sophistication. Never exclaim. No exclamation marks.",
        "- No emoji. Let the words carry the weight.",
        "- Short, measured sentences. Pause. Let each idea breathe.",
        "- 'Siz' form (formal address). Aspirational but never sales-y.",
        "- Vocabulary: 'seçkin', 'nadide', 'zarafet', 'kusursuz', 'özel'.",
        "- CTAs are understated: 'Rezervasyon için', 'Keşfedin', 'Detaylar için yazın'.",
        "- Show, don't tell. Describe the experience, not the product features.",
    ],
    "energetic": [
        "### ✍️ Tone Writing Rules (Enerjik)",
        "- Short punchy sentences. Energy in every word.",
        "- Action verbs up front. 'Gel.' 'Dene.' 'Hisset.'",
        "- Urgency is ok: 'Bugün son gün', 'Yerler dolmadan'.",
        "- Emojis for energy: ⚡🔥🎉 — max 3 per caption.",
        "- Capitalization for impact: 'BU CUMARTE' — use sparingly.",
        "- CTAs are bold calls to action: 'Hemen rezervasyon yap!', 'Kaçırma!'",
    ],
    "professional": [
        "### ✍️ Tone Writing Rules (Profesyonel)",
        "- Clear, credible, authoritative. No filler phrases.",
        "- 'Siz' or neutral form. Facts and expertise build trust.",
        "- Structure: lead with the value, support with proof.",
        "- CTAs are clear and action-forward: 'Rezervasyon yapın', 'İletişime geçin'.",
        "- Avoid hyperbole. Let quality speak through specifics.",
    ],
    "casual": [
        "### ✍️ Tone Writing Rules (Rahat/Gündelik)",
        "- Conversational, like chatting with a neighbor.",
        "- 'Sen' form. Light humor is welcome.",
        "- Imperfect is ok — too polished feels fake.",
        "- Emojis: natural usage, like a text message.",
        "- CTAs feel low-pressure: 'Bir bakiver', 'Gel bir çay içelim'.",
    ],
}

def _tone_writing_rules(brand_tone: str) -> list[str]:
    """Expand a brand_tone value into concrete writing instructions for agents."""
    if not brand_tone:
        return []
    tone_key = brand_tone.lower().strip()
    # Map aliases
    aliases = {
        "samimi": "friendly", "sıcak": "friendly", "warm": "friendly",
        "premium": "luxury", "lüks": "luxury", "luxe": "luxury",
        "enerjik": "energetic", "dynamic": "energetic",
        "profesyonel": "professional", "kurumsal": "professional", "corporate": "professional",
        "rahat": "casual", "gündelik": "casual", "informal": "casual",
    }
    resolved = aliases.get(tone_key, tone_key)
    rules = _TONE_RULES.get(resolved, [])
    return [""] + rules + [""] if rules else []


def _build_website_intelligence_block(intel: dict | None) -> list[str]:
    from app.services.website_intelligence_service import format_website_intelligence_for_prompt
    return format_website_intelligence_for_prompt(intel)


def _build_vibe_profile_block(vibe: dict | None) -> list[str]:
    """Serialize brand_vibe_profile (JSONB) into a readable prompt block for agents."""
    if not vibe:
        return []
    lines = ["", "### 🎨 Brand Vibe DNA (extracted from reference Instagram accounts)"]

    palette = vibe.get("palette") or {}
    if palette:
        primary = palette.get("primary", "")
        accent = palette.get("accent", "")
        neutral = palette.get("neutral", "")
        desc = palette.get("description", "")
        lines.append(f"**Palette**: primary {primary}, accent {accent}, neutral {neutral}")
        if desc:
            lines.append(f"  → {desc}")

    typo = vibe.get("typography") or {}
    if typo:
        headline_font = typo.get("headline_style", "")
        body_font = typo.get("body_style", "")
        letter_spacing = typo.get("letter_spacing", "")
        lines.append(f"**Typography**: headlines {headline_font}, body {body_font}, spacing {letter_spacing}")

    grading = vibe.get("grading") or {}
    if grading:
        look = grading.get("look", "")
        temp = grading.get("temperature", "")
        sat = grading.get("saturation", "")
        lines.append(f"**Color grading**: {look} ({temp} temp, {sat} saturation)")

    comp = vibe.get("composition") or {}
    if comp:
        framing = comp.get("framing_rules", "")
        anti = comp.get("anti_patterns", [])
        lines.append(f"**Composition**: {framing}")
        if anti:
            lines.append(f"  AVOID: {', '.join(anti[:5])}")

    motion = vibe.get("motion") or {}
    if motion:
        pace = motion.get("pace", "")
        transitions = motion.get("transitions", "")
        camera = motion.get("camera_movement", "")
        lines.append(f"**Motion (Reels)**: {pace} pace, {transitions} transitions, {camera}")

    audio = vibe.get("audio") or {}
    if audio:
        genre = audio.get("genre", "")
        bpm = audio.get("bpm_range", "")
        lines.append(f"**Audio**: {genre}, {bpm} BPM")

    caption_voice = vibe.get("caption_voice") or {}
    if caption_voice:
        # Support both schema variants (tone/emoji_density AND style/tonal_anchors/writing_rules)
        tone = caption_voice.get("tone") or caption_voice.get("style") or ""
        emoji_density = caption_voice.get("emoji_density") or ("yes" if caption_voice.get("uses_emojis") else "no")
        cta_style = caption_voice.get("cta_style") or ""
        avg_words = caption_voice.get("avg_word_count") or ""
        lines.append(f"**Caption voice**: {tone} tone, emojis={emoji_density}{', ' + str(avg_words) + ' avg words' if avg_words else ''}{', CTA: ' + cta_style if cta_style else ''}")

        tonal_anchors = caption_voice.get("tonal_anchors") or []
        if tonal_anchors:
            lines.append(f"  → Tone anchors: {', '.join(str(a) for a in tonal_anchors[:5])}")

        writing_rules = caption_voice.get("writing_rules") or []
        if writing_rules:
            lines.append("  → Writing rules:")
            for rule in writing_rules[:5]:
                lines.append(f"    • {rule}")

        example = caption_voice.get("example_template") or ""
        if example:
            lines.append(f"  → Example template: {example[:120]}")

        punct = caption_voice.get("punctuation_style") or ""
        no_hashtags = caption_voice.get("uses_hashtags_in_caption_body")
        if punct or no_hashtags is not None:
            extras = []
            if punct: extras.append(f"punctuation: {punct}")
            if no_hashtags is False: extras.append("NO hashtags in caption body")
            if extras:
                lines.append(f"  → Style: {', '.join(extras)}")

    source_accounts = vibe.get("source_accounts") or []
    if source_accounts:
        lines.append(f"**Reference accounts**: {', '.join('@' + a for a in source_accounts[:5])}")

    # Build a mandatory enforcement summary using the actual field values
    palette = vibe.get("palette") or {}
    typo = vibe.get("typography") or {}
    grading = vibe.get("grading") or {}
    cap_v = vibe.get("caption_voice") or {}
    heading_personality = typo.get("heading_personality") or ""
    overlay_density = typo.get("text_overlay_density") or ""
    grading_look = grading.get("look") or ""
    lut = grading.get("lut_directive") or ""
    primary_color = palette.get("primary") or ""
    accent_color = palette.get("accent") or ""

    lines += ["", "🔴 VIBE DNA ENFORCEMENT — NON-NEGOTIABLE:"]
    if heading_personality:
        lines.append(f"  • Headlines MUST be {heading_personality} — no exceptions")
    if overlay_density:
        lines.append(f"  • Text overlay density: {overlay_density} — respect this")
    if grading_look:
        lines.append(f"  • All visuals: {grading_look} color grade ({lut})")
    if primary_color or accent_color:
        lines.append(f"  • Colors: primary {primary_color}, accent {accent_color} — use these exact values in image prompts")
    writing_rules = cap_v.get("writing_rules") or []
    if writing_rules:
        lines.append(f"  • Caption MUST follow: {'; '.join(str(r) for r in writing_rules[:3])}")
    no_hashtags = cap_v.get("uses_hashtags_in_caption_body")
    if no_hashtags is False:
        lines.append("  • DO NOT put hashtags inside the caption body — hashtags in separate field only")
    avg_words = cap_v.get("avg_word_count")
    if avg_words:
        lines.append(f"  • Caption length: ~{avg_words} words average")

    return lines


_prompt_cache: dict[str, tuple[float, str]] = {}
_PROMPT_CACHE_TTL = 180  # 3 minutes


def _prompt_cache_key(brand: BrandInfo, profile: str, include_gallery_inventory: bool = True) -> str:
    gal = "" if include_gallery_inventory else ":nogal"
    return (
        f"{brand.workspace_id}:{profile}:{brand.brand_dna_updated_at or ''}:"
        f"{brand.brand_theme_updated_at or ''}{gal}"
    )


def build_brand_context_prompt(
    brand: BrandInfo,
    profile: str = "full",
    *,
    include_gallery_inventory: bool = True,
) -> str:
    """
    Compose a context block that gets prepended to agent backstories.
    Order: Brand DNA (master) → identity → discovery → market → learning.
    DNA at top = highest LLM attention; learning at bottom = highest recency priority.

    profile options:
      "full"     — all intelligence (content agents, strategy)
      "review"   — brand identity + customer signals only (review agent)
      "ads"      — brand + market intelligence only (ads agent)
      "video"    — brand identity + industry calendar + market intel + Pinterest (video production)
                   Compact: urgency signals and trending themes only, no social listening noise
      "minimal"  — brand identity only (analytics, lightweight tasks)

    Uses a short TTL cache keyed on workspace+profile+dna_timestamp to avoid
    recomputing 15-20KB prompts for parallel nodes in the same mission wave.
    """
    import time as _t
    ck = _prompt_cache_key(brand, profile, include_gallery_inventory)
    cached = _prompt_cache.get(ck)
    if cached and (_t.time() - cached[0]) < _PROMPT_CACHE_TTL and brand.mission_memory is None:
        return cached[1]

    result = _build_brand_context_prompt_inner(
        brand, profile, include_gallery_inventory=include_gallery_inventory
    )

    if brand.mission_memory is None:
        _prompt_cache[ck] = (_t.time(), result)
    return result


def _build_brand_context_prompt_inner(
    brand: BrandInfo,
    profile: str = "full",
    *,
    include_gallery_inventory: bool = True,
) -> str:
    sections: list[str] = []

    # ── Output language — highest priority for all copy-generating agents ───
    if brand.languages:
        lang_code = resolve_language_code(brand.languages)
        lang_label = resolve_output_language(brand.languages)
        sections += [
            "## OUTPUT LANGUAGE — NON-NEGOTIABLE",
            f"Brand content language: **{lang_label}** (`{lang_code}`).",
            f"Write EVERY headline, caption, CTA, and on-screen text natively in {lang_label}.",
            "Source brand data may be in another language — translate the idea, do not copy Turkish phrasing when English is configured.",
            "",
        ]

    # ── Profile-based filtering ───────────────────────────────────────────
    include_market_intel = profile in ("full", "ads", "video")
    include_social_listening = profile in ("full", "video")
    include_industry_calendar = profile in ("full", "ads", "video")
    include_customer_signals = profile in ("full", "review", "ads", "video")
    include_learning = profile in ("full", "review", "ads", "video")

    # ── Brand DNA — synthesised master intelligence, read first ──────────
    if brand.brand_dna:
        try:
            import json as _json
            from app.services.brand_dna_service import build_brand_dna_prompt
            dna_data = _json.loads(brand.brand_dna)
            dna_prompt = build_brand_dna_prompt(dna_data)
            if dna_prompt:
                sections += [dna_prompt, ""]
        except Exception as _exc:
            _logger.warning("brand_context_section_failed", section="brand_dna", error=str(_exc))

    # ── Today's date — injected first so agents always know the current date ──
    from datetime import datetime as _dt, timezone as _tz
    _now = _dt.now(_tz.utc)
    _TR_MONTHS = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran",
                  "Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"]
    _TR_DAYS   = ["Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi","Pazar"]
    sections += [
        f"## 📅 Bugünün Tarihi: {_now.day} {_TR_MONTHS[_now.month-1]} {_now.year}, "
        f"{_TR_DAYS[_now.weekday()]} (ISO: {_now.strftime('%Y-%m-%d')})",
        "⚠️ Geçmişteki etkinlikler ve özel günler için içerik/kampanya ÜRETME. "
        "Yalnızca bugünden sonraki fırsatlar için çalış.",
        "",
    ]

    # Validated positioning takes precedence over the brittle business_type string.
    _service_category = ""
    if brand.service_profile and isinstance(brand.service_profile, dict):
        _service_category = str(brand.service_profile.get("category") or "").strip()
    _display_type = _service_category or brand.business_type

    sections += [
        "## Business Profile",
        f"- **Name**: {brand.business_name}",
        f"- **Type**: {_display_type}",
        *(
            [f"- **Location**: {brand.location}"]
            if brand.location else []
        ),
        f"- **Languages**: {brand.languages}",
        "",
    ]

    if brand.service_profile:
        try:
            from app.services.brand_service_profile_service import build_service_profile_prompt
            sp_block = build_service_profile_prompt(brand.service_profile)
            if sp_block:
                sections += sp_block
        except Exception as _exc:
            _logger.warning("brand_context_section_failed", section="service_profile", error=str(_exc))

    sections += [
        "## Brand Identity",
        f"- **Tone**: {brand.brand_tone}",
        *_tone_writing_rules(brand.brand_tone),
        *(
            [f"- **Visual Style**: {brand.visual_style}"]
            if brand.visual_style else []
        ),
        *(
            [f"- **Description**: {brand.description}"]
            if brand.description else []
        ),
        *(
            [
                "",
                "### Visual DNA (AI analysis of real venue photography)",
                brand.visual_dna,
                "Use the above color palette, lighting, and materials when art-directing or"
                " prompting any visual — do not substitute a different aesthetic.",
            ]
            if brand.visual_dna else []
        ),
        *(_build_vibe_profile_block(brand.brand_vibe_profile) if brand.brand_vibe_profile else []),
        *(_build_website_intelligence_block(brand.website_intelligence)),
        "",
        "## Audience & Market",
        *(
            [f"- **Target Audience**: {brand.target_audience}"]
            if brand.target_audience else []
        ),
        *(
            [f"- **Competitors**: {brand.competitors}"]
            if brand.competitors else []
        ),
        *(
            [f"- **Keywords**: {brand.keywords}"]
            if brand.keywords else []
        ),
        "",
    ]

    if brand.campaign_goals:
        sections += [
            "## Campaign Goals",
            brand.campaign_goals,
            "",
        ]

    if brand.custom_rules:
        sections += [
            "## Mandatory Rules (MUST follow)",
            brand.custom_rules,
            "",
        ]

    if brand.operating_policy_prompt:
        sections += [brand.operating_policy_prompt, ""]

    if brand.asset_descriptions:
        sections += [
            "## Available Brand Assets",
            *[f"- {desc}" for desc in brand.asset_descriptions],
            "",
        ]

    if brand.reference_image_urls:
        sections += [
            "## Authentic brand reference photography (from live discovery)",
            "These URLs are REAL PHOTOS of the actual venue/business. "
            "For any visual content, image prompt, or art direction: "
            "use these as the authoritative visual reference — same architecture, materials, colour palette, lighting mood. "
            "Pass these URLs to the image generation service as referenceImageUrls so it can composite on top of the real photos.",
            *[f"- {u}" for u in brand.reference_image_urls[:18]],
            "",
        ]

    if brand.instagram_bio or brand.instagram_top_hashtags or brand.instagram_intelligence or brand.instagram_recent_captions:
        social_lines = ["## Social Media Intelligence (from live Instagram analysis)"]
        if brand.instagram_bio:
            social_lines.append(f"**Account Bio**: {brand.instagram_bio[:150]}")
        if brand.instagram_top_hashtags:
            social_lines.append(
                f"**Top hashtags from real posts**: {' '.join(brand.instagram_top_hashtags[:12])}"
            )
            social_lines.append(
                "Use the above hashtags in content — they reflect the brand's real audience and engagement patterns."
            )

        # GPT-4o structured brand voice analysis from real captions
        if brand.instagram_intelligence:
            ig = brand.instagram_intelligence
            bv = ig.get("brand_voice", {})
            if bv:
                voice_parts = []
                if bv.get("primary_tone"):
                    voice_parts.append(f"Ton: {bv['primary_tone']}")
                if bv.get("writing_style"):
                    voice_parts.append(f"Yazım stili: {bv['writing_style']}")
                if bv.get("emoji_usage"):
                    voice_parts.append(f"Emoji kullanımı: {bv['emoji_usage']}")
                if bv.get("caption_length"):
                    voice_parts.append(f"Caption uzunluğu: {bv['caption_length']}")
                if bv.get("engagement_style"):
                    voice_parts.append(f"Etkileşim stili: {bv['engagement_style']}")
                if voice_parts:
                    social_lines.append(f"**Marka Sesi (gerçek paylaşımlardan analiz)**: {' | '.join(voice_parts)}")

            themes = ig.get("content_themes", [])
            if themes:
                theme_strs = [
                    f"{t.get('theme', '')} ({t.get('frequency', '')}): \"{t.get('example', '')[:80]}\""
                    for t in themes[:5] if t.get("theme")
                ]
                social_lines.append(f"**İçerik Temaları**: {' | '.join(theme_strs)}")

            cta_patterns = ig.get("cta_patterns", [])
            if cta_patterns:
                social_lines.append(f"**Gerçek CTA'lar**: {' | '.join(cta_patterns[:6])}")

            triggers = ig.get("emotional_triggers", [])
            if triggers:
                social_lines.append(f"**Duygusal Tetikleyiciler**: {', '.join(triggers[:5])}")

            insights = ig.get("posting_insights", {})
            if insights.get("audience_connection_method"):
                social_lines.append(f"**Takipçiyle bağ kurma yöntemi**: {insights['audience_connection_method']}")

            # Best caption examples for direct voice mimicking
            caption_examples = ig.get("caption_examples", [])
            if caption_examples:
                social_lines.append("**Örnek gerçek captionlar (bu sesi taklit et)**:")
                for ex in caption_examples[:2]:
                    if ex.get("text"):
                        social_lines.append(f'  - "{ex["text"][:200]}"')

        # Fallback: show raw captions if no LLM analysis
        elif brand.instagram_recent_captions:
            social_lines.append("**Son gerçek paylaşımlar (marka sesini yakala)**:")
            for cap in brand.instagram_recent_captions[:3]:
                if cap.strip():
                    social_lines.append(f'  - "{cap[:180]}"')

        social_lines.append("")
        sections += social_lines

    has_discovery = (
        brand.content_pillars
        or brand.default_ctas
        or brand.risk_rules
        or brand.instagram_top_hashtags
        or brand.website_summary
        or brand.instagram_bio
        or brand.reference_image_urls
        or brand.google_review_signals
        or brand.google_rating
    )

    if has_discovery:
        sections += ["## Brand Discovery Intelligence", ""]

        if brand.website_summary:
            # Truncate at 700 chars — enough for product-heavy brands (menus, services)
            ws = brand.website_summary[:700]
            sections += [
                f"**Website Summary** (scraped from live site):\n{ws}",
                "",
            ]

        if brand.instagram_bio:
            sections += [
                f"**Instagram Bio**: {brand.instagram_bio[:200]}",
                "",
            ]

        if brand.content_pillars:
            pillars_str = ", ".join(brand.content_pillars)
            sections += [
                f"**Confirmed Content Pillars**: {pillars_str}",
                "- Only produce content that fits these content types.",
                "",
            ]

        if brand.default_ctas:
            lang_label = resolve_output_language(brand.languages)
            localized = localize_ctas(brand.default_ctas, resolve_language_code(brand.languages))
            ctas_str = " | ".join(localized or brand.default_ctas)
            sections += [
                f"**Preferred CTAs for this brand ({lang_label})**: {ctas_str}",
                f"- The `cta` field AND any CTA embedded in `caption_draft` MUST be written in {lang_label} only.",
                "- Never mix Turkish CTA text inside an English caption (or the reverse).",
                "",
            ]

        if brand.instagram_top_hashtags:
            tags_str = " ".join(brand.instagram_top_hashtags[:10])
            sections += [
                f"**Instagram Hashtags (from real account)**: {tags_str}",
                "",
            ]

        if brand.risk_rules:
            approval_required = [k for k, v in brand.risk_rules.items() if v == "approval_required"]
            if approval_required:
                sections += [
                    f"**Approval-required signals**: {', '.join(approval_required)}",
                    "- Content containing these topics must be flagged for human review.",
                    "",
                ]

        # Google Business rating + customer review signals
        if include_customer_signals and (brand.google_rating or brand.google_review_signals):
            rating_line = (
                f"**Google Rating**: {brand.google_rating}/5"
                + (f" ({brand.google_review_count} reviews)" if brand.google_review_count else "")
            ) if brand.google_rating else ""

            if rating_line:
                sections += [rating_line, ""]

            if brand.google_review_signals:
                positives = [r["text"] for r in brand.google_review_signals if r.get("stars", 0) >= 4 and r.get("text")][:5]
                negatives = [r["text"] for r in brand.google_review_signals if r.get("stars", 0) <= 3 and r.get("text")][:3]

                if positives:
                    sections += [
                        "**What customers love (real Google reviews)**:",
                        *[f"- \"{t[:120]}\"" for t in positives],
                        "",
                    ]
                if negatives:
                    sections += [
                        "**Customer concerns to address in content**:",
                        *[f"- \"{t[:120]}\"" for t in negatives],
                        "",
                    ]

        # Gallery intelligence — analyzed brand photos mapped to content use-cases.
        # Faz 1.2 — ideation task'ı zaten zengin gallery scene block taşıdığında bu
        # kaba envanter kopyasını backstory'den çıkararak input token tasarrufu sağlanır.
        if brand.gallery_analysis and include_gallery_inventory:
            try:
                import json as _json
                gallery_data = _json.loads(brand.gallery_analysis)
                if gallery_data and isinstance(gallery_data, dict):
                    # Build a compact scene inventory: group photos by their primary content tag
                    from collections import defaultdict as _dd
                    scene_map: dict = _dd(list)
                    for url, meta in gallery_data.items():
                        tags = meta.get("contentTags") or []
                        mood = meta.get("mood") or ""
                        usage = meta.get("usageContext") or ""
                        desc = meta.get("description") or ""
                        asset_type = meta.get("suggestedAssetType") or ""
                        # Skip unanalyzed photos (no tags and no usage context)
                        if not tags and not usage:
                            continue
                        # Primary label: first meaningful tag or asset_type
                        label = tags[0] if tags else asset_type or "venue"
                        scene_map[label].append({
                            "url": url,
                            "tags": tags[:6],
                            "mood": mood,
                            "usage": usage,
                            "desc": desc[:120],
                        })

                    # Deduplicate labels, keep top 12 most represented scenes
                    sorted_scenes = sorted(scene_map.items(), key=lambda x: len(x[1]), reverse=True)[:12]

                    if sorted_scenes:
                        sections += ["## 🖼 Brand Gallery — Available Photos for Visual Matching"]
                        sections.append(
                            "IDEAS are driven by brand strategy, timing, and market context — NOT by what photos exist. "
                            "Use this gallery as the FINAL step: once an idea is formed, find the photo that best illustrates it. "
                            "If no photo fits, note 'needs new photo'."
                        )
                        sections.append("")
                        for scene_label, photos in sorted_scenes:
                            count = len(photos)
                            sample = photos[0]
                            tags_str = ", ".join(sample["tags"])
                            usage_str = sample["usage"][:100] if sample["usage"] else ""
                            mood_str = sample["mood"]
                            line = f"- **{scene_label}** ({count} photo{'s' if count > 1 else ''})"
                            if tags_str:
                                line += f" | tags: {tags_str}"
                            if mood_str:
                                line += f" | mood: {mood_str}"
                            if usage_str:
                                line += f" | best for: {usage_str}"
                            sections.append(line)
                        sections.append("")
                        sections.append(
                            f"Total analyzed photos: {len(gallery_data)}. "
                            "Each content idea should name which scene/photo type it pairs with."
                        )
                        sections.append("")
            except Exception as _exc:
                _logger.warning("brand_context_section_failed", section="gallery_analysis", error=str(_exc))

        if brand.discovery_confidence is not None:
            conf_label = (
                "high" if brand.discovery_confidence >= 70
                else "medium" if brand.discovery_confidence >= 40
                else "low"
            )
            sections += [
                f"**Discovery confidence**: {brand.discovery_confidence}% ({conf_label})",
                "" if brand.discovery_confidence >= 40
                else "- Limited brand data was available; apply extra care with brand-specific claims.",
                "",
            ]

        if not brand.brand_constitution_confirmed:
            sections += [
                "⚠ **Brand profile not yet confirmed by operator.** "
                "Use available signals as guidance but avoid strong brand-specific claims until confirmed.",
                "",
            ]

    # Social Listening — real-time brand/hashtag/competitor signals
    if include_social_listening and brand.social_signals:
        try:
            import json as _json
            from app.services.social_listening_service import build_social_signals_prompt
            sl_data = _json.loads(brand.social_signals)
            sl_prompt = build_social_signals_prompt(sl_data)
            if sl_prompt:
                sections += [sl_prompt, ""]
        except Exception as _exc:
            _logger.warning("brand_context_section_failed", section="social_signals", error=str(_exc))

    # Competitor Intelligence — structured competitor analysis
    if include_market_intel and brand.competitor_brief:
        sections += [
            "## 🏆 Competitor Intelligence",
            brand.competitor_brief[:800],
            "",
        ]

    # Tripadvisor Reviews — customer experience signals from third-party platform
    if include_market_intel and brand.tripadvisor_reviews:
        try:
            import json as _json
            ta_reviews = _json.loads(brand.tripadvisor_reviews)
            if ta_reviews:
                sections += ["## ⭐ Tripadvisor Customer Signals"]
                pos = [r for r in ta_reviews if (r.get("rating") or 0) >= 4][:3]
                neg = [r for r in ta_reviews if (r.get("rating") or 5) <= 2][:2]
                if pos:
                    sections.append("**What guests love** (use as content proof points):")
                    for r in pos:
                        sections.append(f"- \"{r.get('text', '')[:120]}\"")
                if neg:
                    sections.append("**Areas guests mention** (avoid promising these, address proactively):")
                    for r in neg:
                        sections.append(f"- \"{r.get('text', '')[:100]}\"")
                sections.append("")
        except Exception as _exc:
            _logger.warning("brand_context_section_failed", section="tripadvisor_reviews", error=str(_exc))

    # Hyper-local Instagram — what people are posting at this location right now
    if include_market_intel and brand.location_posts:
        try:
            import json as _json
            loc_posts = _json.loads(brand.location_posts)
            if loc_posts:
                all_tags: list[str] = []
                for p in loc_posts:
                    all_tags.extend(p.get("hashtags", []))
                from collections import Counter as _Counter
                top_local = [t for t, _ in _Counter(all_tags).most_common(8)]
                if top_local:
                    sections += [
                        "## 📍 Hyper-Local Trend (what people post at this location)",
                        f"Trending tags at this location: {' '.join(top_local)}",
                        "→ Use 2-3 of these in posts for local discoverability.",
                        "",
                    ]
        except Exception as _exc:
            _logger.warning("brand_context_section_failed", section="location_posts", error=str(_exc))

    # Weekly Trend Brief — market trends and opportunities
    if include_market_intel and brand.trend_brief:
        sections += [
            "## 📈 Weekly Trend Brief",
            brand.trend_brief[:600],
            "",
        ]

    # Industry Intelligence — sector-specific seasonal and contextual calendar
    if include_industry_calendar and brand.industry_calendar:
        try:
            import json as _json
            from app.services.industry_intelligence_service import build_industry_context_prompt
            calendar_data = _json.loads(brand.industry_calendar)
            industry_prompt = build_industry_context_prompt(calendar_data)
            if industry_prompt:
                sections += [industry_prompt, ""]

            # Live event intelligence (injected inside industry calendar)
            event_data = calendar_data.get("live_event_data", {})
            if event_data and event_data.get("available"):
                from app.services.event_intelligence_service import build_event_intelligence_prompt
                event_prompt = build_event_intelligence_prompt(event_data)
                if event_prompt:
                    sections += [event_prompt, ""]

            # LinkedIn B2B intelligence (injected inside industry calendar)
            linkedin_data = calendar_data.get("linkedin_intelligence", {})
            if linkedin_data and linkedin_data.get("available"):
                from app.services.linkedin_intelligence_service import build_linkedin_prompt
                linkedin_prompt = build_linkedin_prompt(linkedin_data)
                if linkedin_prompt:
                    sections += [linkedin_prompt, ""]
        except Exception as _exc:
            _logger.warning("brand_context_section_failed", section="linkedin_intelligence", error=str(_exc))

    # Market Intelligence — daily trend + competitor pulse (highest recency priority)
    if include_market_intel and (brand.competitor_pulse or brand.market_opportunity_ideas):
        sections += ["## 📊 Daily Market Intelligence (refreshed this morning)", ""]

        if brand.competitor_pulse:
            sections += [brand.competitor_pulse, ""]

        if brand.market_opportunity_ideas:
            try:
                import json as _json
                ideas = _json.loads(brand.market_opportunity_ideas)
                if ideas:
                    sections += ["### ⚡ Urgent Content Opportunities (act today)"]
                    for idea in ideas[:3]:
                        urgency = idea.get("urgency", "")
                        why = idea.get("why_now", "")
                        fmt = idea.get("format", "post")
                        title = idea.get("title", "")
                        sections.append(
                            f"- **[{urgency.upper()}]** {title} ({fmt}) — {why}"
                        )
                    sections.append("")
            except Exception as _exc:
                _logger.warning("brand_context_section_failed", section="market_opportunities", error=str(_exc))

    # Tenant learning context — injected just before Pinterest for high LLM attention
    # (last 25% of context = where transformer models focus most)
    if include_learning and brand.learning_context:
        sections += [
            "## 🧠 Tenant Learning (Approved/Rejected history — highest priority)",
            brand.learning_context,
            "",
        ]

    # Pinterest Visual Inspiration — sector/location-specific trends scraped from Pinterest
    # Injected into ALL agents so image gen, video specs and content ideas align with real trends.
    if brand.pinterest_visual_themes or brand.pinterest_top_pins:
        sections += ["## 📌 Pinterest Visual Inspiration (brand-specific, scraped trends)\n"]

        if brand.pinterest_visual_themes:
            themes_str = ", ".join(brand.pinterest_visual_themes[:8])
            sections += [
                f"**Trending visual themes in this sector/location**: {themes_str}",
                "→ All image and video prompts MUST reflect these themes where relevant.",
                "",
            ]

        if brand.pinterest_top_pins:
            sections += ["**Top pinned content styles (highest saved — most resonant with audience)**:"]
            for pin in brand.pinterest_top_pins[:5]:
                title = (pin.get("title") or "").strip()[:80]
                saves = pin.get("saves", 0)
                if title:
                    sections.append(f"- \"{title}\" ({saves:,} saves)")
            sections += [
                "",
                "→ Study these pin titles for visual direction: what's working gets saved.",
                "→ Use as inspiration for composition style, color palette, and subject matter.",
                "",
            ]

    # ── Mission Context (Task 7) — appended AFTER learning for maximum recency ──
    # Only present when the TaskGraphExecutor fires a node within a campaign.
    # When mission_memory is None (standard execution), this block is skipped
    # and the output is identical to pre-Task-7 behaviour.
    if brand.mission_memory is not None:
        try:
            from app.crew.mission_memory import build_mission_context_block
            mission_block = build_mission_context_block(brand.mission_memory)
            if mission_block:
                sections += [mission_block, ""]
        except Exception as _exc:
            _logger.warning("brand_context_section_failed", section="mission_memory", error=str(_exc))

    return "\n".join(sections)


# ── Urgency Signal Extractor ───────────────────────────────────────────────────

def extract_urgency_signal(brand: "BrandInfo") -> dict:
    """
    Parse brand.industry_calendar JSON and return a compact urgency signal dict.

    Used by:
    - video_production_crew   → drive Runway style (energetic vs calm)
    - content_tasks           → prepend urgency directive to content ideation
    - Creatomate service      → auto-select "event" format when urgency=HIGH

    Returns:
        urgency_level:  "HIGH" | "MEDIUM" | "LOW"
        current_phase:  phase name (e.g. "Peak Season")
        key_message:    the brand's most important message right now
        content_posture: what stance the brand should take
        days_until_next_phase: int or None
        has_weekend_events: bool (from live_event_data)
        weekend_event_count: int
        event_city: str
        upcoming_triggers: list[str]  — top 2 trigger names
    """
    default = {
        "urgency_level": "LOW",
        "current_phase": "",
        "key_message": "",
        "content_posture": "",
        "days_until_next_phase": None,
        "has_weekend_events": False,
        "weekend_event_count": 0,
        "event_city": "",
        "upcoming_triggers": [],
    }

    if not brand.industry_calendar:
        return default

    try:
        import json as _json
        cal = _json.loads(brand.industry_calendar)

        cp = cal.get("current_phase", {})
        raw_urgency = (cp.get("urgency_level") or "low").upper()
        urgency = raw_urgency if raw_urgency in ("HIGH", "MEDIUM", "LOW") else "LOW"

        # Check live event data for weekend override
        event_data = cal.get("live_event_data", {})
        has_weekend = event_data.get("this_weekend_count", 0) > 0
        if has_weekend and urgency == "LOW":
            urgency = "MEDIUM"  # bump up when local events exist

        upcoming = [
            t.get("name", "")
            for t in cal.get("upcoming_triggers", [])[:2]
            if t.get("name")
        ]

        return {
            "urgency_level": urgency,
            "current_phase": cp.get("name", ""),
            "key_message": cp.get("key_message", ""),
            "content_posture": cp.get("content_posture", ""),
            "days_until_next_phase": cp.get("days_until_next_phase"),
            "has_weekend_events": has_weekend,
            "weekend_event_count": event_data.get("this_weekend_count", 0),
            "event_city": event_data.get("city", ""),
            "upcoming_triggers": upcoming,
        }
    except Exception:
        return default


def build_urgency_directive(brand: "BrandInfo") -> str:
    """
    Return a short, authoritative urgency directive block for task prompts.
    Empty string when no actionable signal exists.

    Injected at the TOP of content ideation and video production tasks so the
    LLM treats it as the highest-priority instruction for this execution.
    """
    sig = extract_urgency_signal(brand)
    if not sig["urgency_level"] or sig["urgency_level"] == "LOW" and not sig["has_weekend_events"]:
        if not sig.get("upcoming_triggers"):
            return ""

    lines = ["## ⚡ EXECUTION URGENCY — READ THIS FIRST\n"]

    urgency_emoji = {"HIGH": "🔴", "MEDIUM": "🟡", "LOW": "🟢"}.get(sig["urgency_level"], "⚪")
    lines.append(f"**Urgency level**: {urgency_emoji} {sig['urgency_level']}")

    if sig["current_phase"]:
        lines.append(f"**Current business phase**: {sig['current_phase']}")

    if sig["key_message"]:
        lines.append(f"**Most important message RIGHT NOW**: {sig['key_message']}")

    if sig["content_posture"]:
        lines.append(f"**Content posture this week**: {sig['content_posture']}")

    if sig["days_until_next_phase"]:
        lines.append(f"**Days until next phase**: {sig['days_until_next_phase']} — adjust urgency accordingly")

    if sig["has_weekend_events"]:
        lines.append(
            f"\n🎟️ **LOCAL EVENT ALERT**: {sig['weekend_event_count']} event(s) this weekend in "
            f"{sig['event_city']} — content MUST reference or capitalize on local energy."
        )

    if sig["upcoming_triggers"]:
        trigs = " | ".join(sig["upcoming_triggers"])
        lines.append(f"\n**Act on these triggers NOW**: {trigs}")

    # Behavioural mandate
    mandate = {
        "HIGH": (
            "\n🚨 **MANDATE**: Urgency is HIGH. ALL content concepts must reflect peak-season energy. "
            "CTAs must be direct and time-bound ('Rezervasyon Yap — Bu Hafta Sonu', 'Kaçırma'). "
            "Runway prompts must use dynamic motion, dramatic lighting. "
            "Do NOT produce relaxed, evergreen, or generic content."
        ),
        "MEDIUM": (
            "\n⚠️ **MANDATE**: Urgency is MEDIUM. Blend evergreen content with timely hooks. "
            "At least 50% of concepts should reference the current phase or upcoming triggers."
        ),
        "LOW": (
            "\n✅ **MANDATE**: Low urgency period — focus on brand building, community, storytelling. "
            "Upcoming triggers listed above should be prepared in advance."
        ),
    }.get(sig["urgency_level"], "")

    if mandate:
        lines.append(mandate)

    return "\n".join(lines)
