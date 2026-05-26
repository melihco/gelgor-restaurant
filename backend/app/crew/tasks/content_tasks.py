"""
CrewAI Task definitions for the Content Agent crew.
"""

from __future__ import annotations

from datetime import datetime, timezone
from crewai import Agent, Task

from app.crew.context import BrandInfo, build_urgency_directive
from app.crew.prompts.content_prompts import CONTENT_IDEATION_TASK, CONTENT_CALENDAR_TASK


def _date_context_block() -> str:
    """
    Builds a precise date/time block injected into every content task.
    Prevents agents from suggesting campaigns for dates that have already passed.
    """
    now = datetime.now(timezone.utc)
    # Turkish month names for natural output
    TR_MONTHS = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran",
                 "Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"]
    TR_DAYS   = ["Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi","Pazar"]
    day_name  = TR_DAYS[now.weekday()]
    month     = TR_MONTHS[now.month - 1]
    date_str  = f"{now.day} {month} {now.year}, {day_name}"

    return f"""## 📅 BUGÜNÜN TARİHİ — KESİN REFERANS
**Bugün**: {date_str} (ISO: {now.strftime('%Y-%m-%d')})
**Saat dilimi**: UTC

⚠️ TARİH KURALI (ASLA İHLAL ETME):
- Bugünden ÖNCE kalan özel günler veya etkinlikler için içerik ÜRETİLMEZ.
- Anneler Günü, Babalar Günü, bayramlar, ulusal günler — tarihi GEÇMİŞ olanlar için kampanya YASAK.
- Yalnızca bugünden itibaren en az 3 gün sonrasına kadar olan fırsatlar için içerik öner.
- Her içerik önerisinde "posting_time_suggestion" alanı bugünün tarihinden SONRA bir tarih içermeli.
- Eğer geleneksel bir etkinlik için tarih belirsizse, bu yılki tarihi hesapla ve geçip geçmediğini kontrol et."""


def _build_gallery_scene_block(brand: BrandInfo) -> str:
    """
    Build a compact gallery scene inventory from gallery_analysis.
    Groups analyzed photos by their primary content tag and returns a
    prompt block that tells the agent EXACTLY what visuals are available.
    Marks used photos and prioritizes unused ones.
    """
    if not brand.gallery_analysis:
        if brand.reference_image_urls:
            lines = "\n".join(f"- {u}" for u in brand.reference_image_urls[:12])
            return f"Available reference photos (unanalyzed):\n{lines}"
        return "No gallery images available — use generated_visual treatment."

    try:
        import json as _json
        from collections import defaultdict as _dd

        gallery_data = _json.loads(brand.gallery_analysis)
        if not gallery_data or not isinstance(gallery_data, dict):
            return "No gallery images available — use generated_visual treatment."

        used_by_type: dict[str, set[str]] = {
            "feed": set(),
            "story": set(),
            "reel": set(),
            "carousel": set(),
        }
        raw_by_type = brand.used_images_by_type or {}
        for post_type, urls in raw_by_type.items():
            bucket = used_by_type.get(post_type, used_by_type["feed"])
            for u in urls or []:
                bucket.add(u.split("?")[0])

        used_bases = set()
        for u in (brand.used_image_urls or []):
            used_bases.add(u.split("?")[0])

        def _used_types_for_url(url: str) -> list[str]:
            base = url.split("?")[0]
            return [t for t, bases in used_by_type.items() if base in bases]

        scene_map: dict = _dd(list)
        unused_photos: list[dict] = []
        for url, meta in gallery_data.items():
            tags = meta.get("contentTags") or []
            mood = meta.get("mood") or ""
            usage = meta.get("usageContext") or ""
            best_for = meta.get("bestFor") or []
            if not tags and not usage:
                continue
            used_types = _used_types_for_url(url)
            is_used = bool(used_types) or url.split("?")[0] in used_bases
            label = tags[0] if tags else (meta.get("suggestedAssetType") or "venue")
            desc = (meta.get("description") or "")[:120]
            entry = {
                "url": url,
                "tags": tags[:5],
                "mood": mood,
                "usage": usage,
                "best_for": best_for[:3],
                "desc": desc,
                "used": is_used,
                "used_types": used_types,
            }
            scene_map[label].append(entry)
            if not used_types:
                unused_photos.append(entry)

        sorted_scenes = sorted(scene_map.items(), key=lambda x: len(x[1]), reverse=True)[:15]
        total = len(gallery_data)
        used_count = sum(1 for u in gallery_data if u.split("?")[0] in used_bases)
        unused_count = total - used_count

        lines = [
            f"## 📸 BRAND GALLERY — {total} Photos ({unused_count} unused, {used_count} already published)",
            "PURPOSE: Ideas are driven by brand strategy, timing, and market context — NOT by what photos exist.",
            "Use this gallery ONLY at the final step: after forming an idea, pick the photo that best illustrates it.",
            "If no photo fits perfectly, set selected_gallery_url to null and note 'needs new photo'.",
            "",
            "🔒 REUSE RULE (mandatory): A gallery photo used for one post type CANNOT be selected again for the SAME post type.",
            "  Post types: feed (post), story, reel, carousel — each is independent.",
            "  Example: photo used in a feed post may still be used in a story, but never in another feed post.",
            "  Match caption to photo ONLY among photos not already used for that idea's content_type.",
            "",
        ]

        if unused_count > 0 and used_count > 0:
            lines.append("⭐ PRIORITY: Prefer photos with NO used-type marks (✨) for the target content_type.")
            lines.append("Photos marked ✓ feed / ✓ story show which post types already consumed them.")
            lines.append("")

        for scene_label, photos in sorted_scenes:
            count_ph = len(photos)
            sample = photos[0]
            tags_str = ", ".join(sample["tags"])
            mood_str = sample["mood"]
            usage_str = (sample["usage"] or "")[:90]
            desc_str = (sample.get("desc") or "")[:100]
            used_types = sample.get("used_types") or []
            if used_types:
                status = "✓ " + ", ".join(used_types)
            else:
                status = "✨"
            line = f"• {status} **{scene_label}** ({count_ph}x) | url: {sample['url']}"
            if desc_str:
                line += f"\n    📝 {desc_str}"
            if tags_str:
                line += f" | tags: {tags_str}"
            if mood_str:
                line += f" | {mood_str} mood"
            if usage_str:
                line += f" → {usage_str}"
            lines.append(line)

        if unused_photos and used_count > 0:
            lines += [
                "",
                "### UNUSED PHOTOS — prioritize these for new content:",
            ]
            for p in unused_photos[:8]:
                tags_str = ", ".join(p["tags"])
                desc_short = (p.get("desc") or "")[:80]
                desc_part = f" → {desc_short}" if desc_short else ""
                lines.append(f"  ✨ {p['url']} — {tags_str} ({p['mood']}){desc_part}")

        lines += [
            "",
            "PHOTO SELECTION (last step, after idea is formed):",
            "→ Check content_type of the idea (post/story/reel/carousel) BEFORE picking a photo.",
            "→ NEVER pick a photo marked ✓ for the SAME content_type — caption/visual match must respect this rule.",
            "→ In `selected_gallery_url`: copy the EXACT url from an eligible (unused-for-type) scene above.",
            "→ In `visual_direction`: write \"Use [scene_label] photo — [why it fits this caption]\"",
            "→ If every matching photo is already used for this content_type → selected_gallery_url: null, visual_direction: 'needs new photo: [description]'",
        ]

        if unused_count == 0 and total > 0:
            lines.append("→ ALL gallery photos have been used. Generate content concepts for which NEW photos should be taken.")
            lines.append("   In visual_direction, describe the ideal new photo instead of picking an existing one.")

        return "\n".join(lines)

    except Exception:
        if brand.reference_image_urls:
            lines = "\n".join(f"- {u}" for u in brand.reference_image_urls[:12])
            return f"Available reference photos:\n{lines}"
        return "No gallery images available — use generated_visual treatment."


def _build_brand_theme_block(brand: BrandInfo) -> str:
    """
    Build a BrandTheme quality gate block from the brand's derived design tokens.

    Injected at the TOP of the content ideation description so the agent:
    1. Uses correct palette hex codes in image_edit_prompt (not hallucinated colors)
    2. Respects anti-pattern rules (no forbidden visual elements)
    3. Applies correct grading look to every pure_photo treatment
    4. Sets tokens_hint correctly for layouts that need seasonal/campaign overrides
    """
    vibe = brand.brand_vibe_profile
    if not vibe or not isinstance(vibe, dict):
        return ""

    palette = vibe.get("palette") or {}
    grading = vibe.get("grading") or {}
    composition = vibe.get("composition") or {}
    anti_patterns = vibe.get("anti_patterns") or []

    if not palette:
        return ""

    lines = ["## 🎨 BRAND THEME TOKENS — MANDATORY IMAGE GENERATION RULES"]
    lines.append("Use these EXACT values in every image_edit_prompt and tokens_hint field.\n")

    if palette.get("primary"):
        lines.append(f"**Primary Color**: `{palette['primary']}`")
    if palette.get("accent"):
        lines.append(f"**Accent Color**: `{palette['accent']}`")
    if palette.get("neutral"):
        lines.append(f"**Neutral Color**: `{palette['neutral']}`")
    if palette.get("shadow"):
        lines.append(f"**Shadow Color**: `{palette['shadow']}`")

    if grading.get("look"):
        lines.append(f"\n**Grading Look**: {grading['look']}")
    if grading.get("lut_directive"):
        lines.append(f"**LUT Directive** (use in EVERY image_edit_prompt): {grading['lut_directive']}")

    if composition.get("framing_rules"):
        lines.append(f"\n**Composition Rules**: {composition['framing_rules']}")

    if anti_patterns:
        lines.append("\n## 🚫 VISUAL ANTI-PATTERNS — ABSOLUTE PROHIBITION")
        lines.append("Never produce or suggest any image that contains:")
        for ap in anti_patterns[:8]:
            lines.append(f"  ✕ {ap}")

    lines.append(
        "\n⚠️ IMAGE GEN RULE: Every `image_edit_prompt` for this brand MUST include the LUT directive above. "
        "Every `tokens_hint` MUST use the exact hex codes above for any color override."
    )

    return "\n".join(lines)


def _extract_theme_keywords(titles: list[str]) -> list[str]:
    """
    Extract recurring theme keywords from recent content titles.
    Used to build a 'burned themes' list that goes beyond exact title matching.
    """
    import re
    word_freq: dict[str, int] = {}
    STOP_WORDS = {
        "bir", "bu", "ve", "ile", "için", "da", "de", "mi", "mı",
        "the", "a", "an", "of", "in", "for", "and", "to", "with",
        "from", "by", "post", "reel", "story", "feed", "carousel",
        "—", "–", "-", "|", "konsept", "fikir", "içerik",
    }
    for title in titles:
        clean = re.sub(r"[^\w\sçğıöşüÇĞİÖŞÜ]", " ", title.lower())
        words = [w for w in clean.split() if len(w) > 2 and w not in STOP_WORDS]
        for w in set(words):
            word_freq[w] = word_freq.get(w, 0) + 1

    burned = [w for w, c in sorted(word_freq.items(), key=lambda x: -x[1]) if c >= 2]
    return burned[:15]


def _build_recent_titles_block(brand: BrandInfo) -> str:
    """
    Build a comprehensive anti-repeat block from learning_context.
    Goes beyond exact titles: also extracts caption excerpts and
    recurring theme keywords to prevent thematic repetition.
    """
    lc = brand.learning_context or ""
    if not lc:
        return ""

    titles: list[str] = []
    captions: list[str] = []
    in_recent = False
    in_approved = False

    for line in lc.split("\n"):
        # Recent titles section
        if "SON 3 HAFTADA" in line or "RECENTLY PRODUCED" in line.upper() or "ALREADY PRODUCED" in line.upper():
            in_recent = True
            in_approved = False
            continue
        # Approved examples section — extract caption excerpts
        if "content this tenant APPROVES" in line or "APPROVES:" in line:
            in_approved = True
            in_recent = False
            continue
        if line.strip().startswith("###") or line.strip().startswith("## "):
            if in_recent or in_approved:
                in_recent = False
                in_approved = False

        if in_recent:
            stripped = line.strip()
            if stripped.startswith("-") or stripped.startswith("•"):
                titles.append(stripped.lstrip("-•").strip())
            elif not stripped:
                continue

        if in_approved and "Caption:" in line:
            excerpt = line.split("Caption:", 1)[1].strip().strip('"')
            if excerpt:
                captions.append(excerpt[:100])

    if not titles and not captions:
        return ""

    parts = ["\n\n## 🚫 RECENTLY PRODUCED — DO NOT REPEAT THESE:"]

    if titles:
        parts.append("### Recent titles (last 3 weeks):")
        for t in titles[:25]:
            parts.append(f"- {t}")

    # Extract burned themes for deeper dedup
    burned_themes = _extract_theme_keywords(titles + captions)
    if burned_themes:
        parts.append(f"\n### 🔥 BURNED THEMES (overused keywords — find fresh angles):")
        parts.append(f"These words/themes appeared in 2+ recent pieces: {', '.join(burned_themes)}")
        parts.append("Do NOT build new concepts around the same keywords. Find genuinely new angles.")

    if captions:
        parts.append("\n### Recent caption angles (avoid similar messaging):")
        for c in captions[:8]:
            parts.append(f"- \"{c}...\"")

    parts.append(
        "\n⚠️ ANTI-REPEAT RULES:"
        "\n1. Every new concept MUST be genuinely different from ALL of the above."
        "\n2. Same theme with different wording is STILL repetition."
        "\n3. If a topic appeared in burned themes, approach it from a completely new angle or skip it."
        "\n4. Check: would a human scrolling the feed notice similarity? If yes → DON'T produce it."
    )

    return "\n".join(parts)


def create_content_ideation_task(
    agent: Agent,
    brand: BrandInfo,
    count: int = 5,
    time_period: str = "next week",
    brief: str = "",
    content_pillars: list[str] | None = None,
    autonomy_mode: bool = False,
) -> Task:
    gallery_scene_block = _build_gallery_scene_block(brand)
    recent_titles_block = _build_recent_titles_block(brand)

    # Resolve output language — "en" → English, "tr" → Turkish, etc.
    lang_map = {"en": "English", "tr": "Turkish", "de": "German", "fr": "French", "es": "Spanish"}
    raw_lang = (brand.languages or "en").split(",")[0].strip().lower()
    output_language = lang_map.get(raw_lang, raw_lang.capitalize())

    description = CONTENT_IDEATION_TASK.format(
        business_name=brand.business_name,
        business_type=brand.business_type or "general_business",
        location=brand.location or "belirtilmemiş",
        brand_tone=brand.brand_tone or "professional",
        target_audience=brand.target_audience or "genel kitle",
        count=count,
        time_period=time_period,
        campaign_goals=brand.campaign_goals or "increase engagement and brand awareness",
        description=brand.description or "No description provided.",
        keywords=brand.keywords or "No specific keywords set.",
        available_assets=", ".join(brand.asset_descriptions or ["No assets uploaded yet"]),
        brief=brief or "No extra user brief. Build the weekly plan from brand memory and content pillars.",
        content_pillars=", ".join(content_pillars or brand.content_pillars or ["brand story", "product/service value", "social proof", "conversion CTA"]),
        autonomy_mode="enabled" if autonomy_mode else "disabled",
        reference_image_urls_list=gallery_scene_block,
        output_language=output_language,
    )

    # Date context — always first so agent knows exactly what day it is
    date_block = _date_context_block()
    description = date_block + "\n\n---\n\n" + description

    # Urgency directive — second highest priority
    urgency_block = build_urgency_directive(brand)
    if urgency_block:
        description = urgency_block + "\n\n---\n\n" + description

    # Anti-repeat: inject recently produced titles
    if recent_titles_block:
        description += recent_titles_block

    # ── S5 Quality Gate: BrandTheme anti-pattern block ──────────────────────
    # Inject anti-patterns from BrandTheme so the agent cannot hallucinate
    # imagery that violates the brand's visual DNA rules.
    brand_theme_block = _build_brand_theme_block(brand)
    if brand_theme_block:
        description = brand_theme_block + "\n\n---\n\n" + description

    return Task(
        description=description,
        expected_output=(
            "A JSON array of content concepts. Each item MUST include ALL of these fields:\n"
            "content_type, format, template_use_case, content_kind, headline, subline, bullets,\n"
            "concept_title, idea_title, cta, shot_type, visual_direction, caption_draft,\n"
            "caption_draft_alt, caption_hook_type, caption_alt_hook_type, engagement_prediction,\n"
            "tokens_hint, hashtags, posting_time_suggestion, strategic_purpose,\n"
            "asset_recommendation, production_notes, brand_confidence, missing_questions,\n"
            "visual_production_spec (with treatment, selected_gallery_url, image_edit_prompt, text_layers, reel_motion_spec).\n"
            "Output ONLY the JSON array — no markdown, no explanation."
        ),
        agent=agent,
    )


def create_content_calendar_task(
    agent: Agent,
    brand: BrandInfo,
    duration_days: int = 7,
    frequency: str = "daily",
) -> Task:
    description = CONTENT_CALENDAR_TASK.format(
        business_name=brand.business_name,
        duration=duration_days,
        frequency=frequency,
        campaign_goals=brand.campaign_goals or "increase engagement and brand awareness",
    )

    return Task(
        description=description,
        expected_output=(
            "A JSON array of daily content entries, each with day, date_suggestion, "
            "content_type, theme, brief, and priority."
        ),
        agent=agent,
    )
