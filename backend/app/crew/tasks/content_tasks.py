"""
CrewAI Task definitions for the Content Agent crew.
"""

from __future__ import annotations

import hashlib
import time as _time
from datetime import datetime, timezone
from crewai import Agent, Task

from app.crew.context import BrandInfo, build_urgency_directive
from app.crew.prompts.content_prompts import CONTENT_IDEATION_TASK, CONTENT_CALENDAR_TASK


def _variation_seed_block(mission_id: str | None = None) -> str:
    """Inject a run-unique token so same-context runs still produce different outputs."""
    seed = hashlib.md5(
        f"{mission_id or ''}{_time.time()}".encode()
    ).hexdigest()[:8]
    return (
        f"## 🎲 ÇALIŞMA KİMLİĞİ: {seed}\n"
        "Bu çalışmada üretilen 7 fikir bu özgün kimlik için yazılıyor. "
        "Önceki misyonlarda üretilmiş fikirlerle birebir örtüşen HİÇBİR konsept kabul edilmez."
    )


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

        def _enrich_meta_tags(meta: dict) -> dict:
            """
            Generic, sector-agnostic tag extraction from photo description.
            Works for ANY business type: gym, salon, restaurant, clinic, hotel, retail, etc.
            No hardcoded sector rules — all enrichment comes from description text + universal
            activity patterns. New tenants get correct enrichment automatically.
            Mirrors gallery-photo-matcher.ts enrichTagsFromDescription() logic.
            """
            desc_raw = meta.get("description") or ""
            if not desc_raw:
                return meta
            existing_tags = meta.get("contentTags") or []
            if len(existing_tags) > 2 and (meta.get("bestFor") or meta.get("usageContext")):
                return meta  # already well-enriched by GPT analysis

            desc = desc_raw.lower()

            # ── Step 1: Generic NLP — extract meaningful words as tags ──────────
            STOP_WORDS = {
                "the","a","an","of","in","on","at","with","and","or","to","is","are","was",
                "be","by","as","that","this","from","for","it","its","has","have","been",
                "being","can","next","into","various","several","multiple","some","there",
                "their","they","which","where","while","also","very","quite","more","most",
                "two","three","four","five","one","here","these","those","what","when","how",
                "each","other","such","only","both","shows","show","features","featuring",
                "appears","visible","seen","photo","image","picture","photograph","taken",
                "captured","displayed","including","surrounded",
                # Turkish
                "bir","bu","ve","ile","için","da","de","mi","mı","mu","mü","var","çok",
                "daha","en","şu","her","ne","ama","veya","olan","üç","dört","beş",
            }
            PURE_ADJ = {"beautiful","colorful","bright","dark","large","small","tall","wide",
                        "narrow","clean","dirty","old","new","big","little","many","few",
                        "various","different","same","similar","specific","particular","unique"}

            import re as _re
            raw_tokens = _re.sub(r"[,\.!?;:'\"()\-–—/|]", " ", desc).split()
            content_words = [
                w for w in raw_tokens
                if len(w) > 2 and w not in STOP_WORDS and w not in PURE_ADJ
            ]

            all_tags = list(existing_tags)
            seen_tags = set(all_tags)
            for w in content_words[:20]:
                if w not in seen_tags:
                    all_tags.append(w)
                    seen_tags.add(w)

            # ── Step 2: Universal activity patterns → bestFor ───────────────────
            new_best_for: list[str] = list(meta.get("bestFor") or [])
            bf_set = set(new_best_for)

            def _add_bf(*items: str) -> None:
                for item in items:
                    if item not in bf_set:
                        new_best_for.append(item)
                        bf_set.add(item)

            if _re.search(r"person|people|customer|client|patient|student|member|visitor|guest|user|staff|team|employee|man|woman|child|couple|family|group|crowd", desc):
                _add_bf("social_proof", "feed_post")
            if _re.search(r"before|after|result|transformation|progress|improvement|change|difference|outcome", desc):
                _add_bf("before_after", "customer_result")
            if _re.search(r"product|item|packaging|display|collection|merchandise|retail|shelf", desc):
                _add_bf("product_highlight", "feed_post")
            if _re.search(r"treatment|procedure|session|therapy|application|service|care|consultation", desc):
                _add_bf("service_showcase", "behind_the_scenes")
            if _re.search(r"equipment|machine|device|tool|apparatus|instrument|gear|station|setup", desc):
                _add_bf("equipment_showcase", "behind_the_scenes")
            if _re.search(r"food|yemek|dish|meal|plate|cuisine|drink|beverage|içecek|coffee|kahve", desc):
                _add_bf("food_showcase", "feed_post")
            if _re.search(r"event|party|celebration|ceremony|opening|concert|show|performance|gathering|festival|workshop|class", desc):
                _add_bf("event_announcement", "story_format")
            if _re.search(r"logo|sign|brand|entrance|facade|label|signage", desc):
                _add_bf("brand_background")
            if _re.search(r"outdoor|exterior|garden|terrace|patio|rooftop|nature|park|view|landscape", desc):
                _add_bf("venue_photo", "daily_story")
            if _re.search(r"interior|indoor|room|studio|salon|office|clinic|store|shop|facility", desc):
                _add_bf("venue_photo", "feed_post")
            if not new_best_for:
                _add_bf("feed_post", "daily_story")

            new_usage = meta.get("usageContext") or desc_raw[:200]

            return {**meta, "contentTags": all_tags, "bestFor": new_best_for, "usageContext": new_usage}

        scene_map: dict = _dd(list)
        unused_photos: list[dict] = []
        for url, meta_raw in gallery_data.items():
            meta = _enrich_meta_tags(meta_raw)
            tags = meta.get("contentTags") or []
            mood = meta.get("mood") or ""
            usage = meta.get("usageContext") or ""
            best_for = meta.get("bestFor") or []
            # Skip only if we have no description and no tags — don't skip photos with descriptions
            desc_raw = meta.get("description") or ""
            if not tags and not usage and not desc_raw:
                continue
            used_types = _used_types_for_url(url)
            is_used = bool(used_types) or url.split("?")[0] in used_bases
            label = tags[0] if tags else (meta.get("suggestedAssetType") or desc_raw[:30] or "venue")
            desc = desc_raw[:150]
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

        # Build gallery topic coverage summary for idea generation guidance
        from collections import Counter as _Counter
        all_tags: _Counter = _Counter()
        for _meta in gallery_data.values():
            _enriched = _enrich_meta_tags(_meta)
            for _t in (_enriched.get("contentTags") or []):
                all_tags[_t] += 1
        top_gallery_topics = [t for t, _ in all_tags.most_common(12) if t not in ("logo", "marka", "brand", "interior", "mekan", "decor")]

        lines = [
            f"## 📸 BRAND GALLERY — {total} Photos ({unused_count} unused, {used_count} already published)",
            "",
            "🎯 GALLERY COVERAGE — Topics this gallery can VISUALLY illustrate:",
            "  " + ", ".join(top_gallery_topics) if top_gallery_topics else "  (general venue)",
            "",
            "⚠️ CONTENT-PHOTO ALIGNMENT RULE (CRITICAL):",
            "  Ideas whose core topic is NOT in the coverage list above will get WRONG photos.",
            "  Example: if the gallery has no 'food' or 'seafood' photos, do NOT write captions",
            "  about specific dishes — the system will have to use an unrelated photo.",
            "  PREFER ideas about: " + ", ".join(top_gallery_topics[:6]) if top_gallery_topics else "",
            "",
            "PURPOSE: Ideas first, then photos. But align idea TOPICS with what the gallery can show.",
            "Use gallery ONLY at the final step: pick the photo that best illustrates the FORMED idea.",
            "If no photo fits, set selected_gallery_url to null and note 'needs new photo: [description]'.",
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

        # Show each photo individually so the agent can pick the exact best match,
        # not just the first sample of a group. Group header for context, then each URL.
        for scene_label, photos in sorted_scenes:
            tags_str = ", ".join(photos[0]["tags"]) if photos[0]["tags"] else scene_label
            lines.append(f"\n### {scene_label.upper()} ({len(photos)} photos) | tags: {tags_str}")
            for photo in photos:
                used_types = photo.get("used_types") or []
                status = "✓ " + ", ".join(used_types) if used_types else "✨"
                desc_str = (photo.get("desc") or "")[:120]
                mood_str = photo.get("mood") or ""
                usage_str = (photo.get("usage") or "")[:80]
                line = f"  {status} {photo['url']}"
                if desc_str:
                    line += f"\n      📝 {desc_str}"
                if mood_str and not desc_str:
                    line += f" | {mood_str} mood"
                if usage_str:
                    line += f"\n      → {usage_str}"
                lines.append(line)

        if unused_photos and used_count > 0:
            lines += [
                "",
                "### UNUSED PHOTOS (prioritize for new content):",
            ]
            for p in unused_photos[:12]:
                tags_str = ", ".join(p["tags"])
                desc_short = (p.get("desc") or "")[:80]
                desc_part = f" → {desc_short}" if desc_short else ""
                lines.append(f"  ✨ {p['url']} | {tags_str} ({p['mood']}){desc_part}")

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


def _theme_dict(val) -> dict:
    return val if isinstance(val, dict) else {}


def _merge_theme_section(theme: dict, vibe: dict, key: str) -> dict:
    """Operator-derived brand_theme wins on overlap; vibe fills gaps."""
    t = _theme_dict(theme.get(key))
    v = _theme_dict(vibe.get(key))
    if not t:
        return v
    if not v:
        return t
    return {**v, **t}


def _collect_anti_patterns(theme: dict, vibe: dict) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for source in (theme.get("anti_patterns"), vibe.get("anti_patterns")):
        if not isinstance(source, list):
            continue
        for ap in source:
            s = str(ap).strip()
            if s and s not in seen:
                seen.add(s)
                out.append(s)
    return out


def _build_brand_theme_block(brand: BrandInfo) -> str:
    """
    Brand Hub Ayarlar (brand_theme) + vibe extract — merged for ideation prompts.

    Injected at the TOP of content ideation so agents use real LUT/anti-pattern/caption voice.
    """
    vibe = _theme_dict(brand.brand_vibe_profile)
    theme = _theme_dict(brand.brand_theme)

    if not vibe and not theme:
        return ""

    palette = _merge_theme_section(theme, vibe, "palette")
    grading = _merge_theme_section(theme, vibe, "grading")
    composition = _merge_theme_section(theme, vibe, "composition")
    typography = _theme_dict(theme.get("typography"))
    anti_patterns = _collect_anti_patterns(theme, vibe)
    caption_voice = theme.get("caption_voice_rules")
    if not isinstance(caption_voice, list):
        caption_voice = []

    has_palette = bool(palette.get("primary") or palette.get("accent"))
    has_grading = bool(grading.get("look") or grading.get("lut_directive"))
    if not has_palette and not has_grading and not anti_patterns and not caption_voice:
        return ""

    lines = ["## 🎨 BRAND THEME TOKENS — MANDATORY IMAGE GENERATION RULES"]
    lines.append(
        "Sources: Brand Hub Ayarlar (brand_theme) + vibe profile. "
        "Use these EXACT values in every image_edit_prompt and tokens_hint.\n",
    )

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
    elif composition.get("primary_pattern"):
        lines.append(f"\n**Composition Pattern**: {composition['primary_pattern']}")

    if typography.get("personality"):
        lines.append(f"**Typography personality**: {typography['personality']}")

    if caption_voice:
        lines.append("\n## ✍️ CAPTION VOICE (on-image text & hooks)")
        for rule in caption_voice[:6]:
            lines.append(f"  • {rule}")

    if anti_patterns:
        lines.append("\n## 🚫 VISUAL ANTI-PATTERNS — ABSOLUTE PROHIBITION")
        lines.append("Never produce or suggest any image that contains:")
        for ap in anti_patterns[:10]:
            lines.append(f"  ✕ {ap}")

    if brand.visual_dna and str(brand.visual_dna).strip():
        lines.append(f"\n**Visual DNA (prose)**: {str(brand.visual_dna).strip()[:400]}")

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
    count: int = 10,
    time_period: str = "next week",
    brief: str = "",
    content_pillars: list[str] | None = None,
    autonomy_mode: bool = False,
    mission_id: str | None = None,
) -> Task:
    gallery_scene_block = _build_gallery_scene_block(brand)
    recent_titles_block = _build_recent_titles_block(brand)

    # Resolve output language — "en" → English, "tr" → Turkish, etc.
    lang_map = {"en": "English", "tr": "Turkish", "de": "German", "fr": "French", "es": "Spanish"}
    raw_lang = (brand.languages or "en").split(",")[0].strip().lower()
    output_language = lang_map.get(raw_lang, raw_lang.capitalize())
    loc_default = "not specified" if output_language == "English" else "belirtilmemiş"
    aud_default = "general audience" if output_language == "English" else "genel kitle"

    resolved_pillars = content_pillars or brand.content_pillars or []
    from app.services.pillar_coverage_service import build_pillar_coverage_prompt_block

    description = CONTENT_IDEATION_TASK.format(
        business_name=brand.business_name,
        business_type=brand.business_type or "general_business",
        location=brand.location or loc_default,
        brand_tone=brand.brand_tone or "professional",
        target_audience=brand.target_audience or aud_default,
        count=count,
        time_period=time_period,
        campaign_goals=brand.campaign_goals or "increase engagement and brand awareness",
        description=brand.description or "No description provided.",
        keywords=brand.keywords or "No specific keywords set.",
        available_assets=", ".join(brand.asset_descriptions or ["No assets uploaded yet"]),
        brief=brief or "No extra user brief. Build the weekly plan from brand memory and content pillars.",
        content_pillars=", ".join(resolved_pillars) or "derive from business_type only",
        pillar_coverage_block=build_pillar_coverage_prompt_block(resolved_pillars, count),
        autonomy_mode="enabled" if autonomy_mode else "disabled",
        reference_image_urls_list=gallery_scene_block,
        output_language=output_language,
    )

    # Variation seed — run-unique token to prevent same-context repetition
    seed_block = _variation_seed_block(mission_id)
    description = seed_block + "\n\n---\n\n" + description

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
        name="Haftalık içerik fikirleri",
        description=description,
        expected_output=(
            f"A JSON array containing EXACTLY {count} distinct content concept objects "
            f"(array length MUST equal {count} — never fewer). "
            "Each item MUST include ALL of these fields:\n"
            "content_type, format, template_use_case, content_kind, headline, subline, bullets,\n"
            "concept_title, idea_title, cta, shot_type, visual_direction, caption_draft,\n"
            "caption_draft_alt, caption_hook_type, caption_alt_hook_type, engagement_prediction,\n"
            "tokens_hint, hashtags, posting_time_suggestion, strategic_purpose,\n"
            "asset_recommendation, production_notes, brand_confidence, missing_questions,\n"
            "visual_production_spec (with treatment, selected_gallery_url, image_edit_prompt, text_layers, reel_motion_spec,\n"
            "  and premium_composition object for at least 3 premium ideas).\n"
            "Output ONLY the JSON array — no markdown, no explanation."
        ),
        agent=agent,
    )


def create_content_calendar_task(
    agent: Agent,
    brand: BrandInfo,
    duration_days: int = 7,
    frequency: str = "daily",
    *,
    count: int | None = None,
    format_mix: str = "",
) -> Task:
    from datetime import datetime, timezone
    now_utc = datetime.now(timezone.utc)
    current_date_str = now_utc.strftime("%A, %d %B %Y")

    # Build active signals summary (context signals already in brand via learning_context)
    signals_summary = (
        getattr(brand, "learning_context", "") or ""
    )
    # Extract just the signals block if present
    if "BAĞLAM SİNYALLERİ" in signals_summary:
        start = signals_summary.find("=== BAĞLAM")
        end = signals_summary.find("===", start + 4) + 3 if start > -1 else -1
        signals_summary = signals_summary[start:end] if start > -1 and end > 3 else ""
    else:
        signals_summary = "Current season, weekly rhythm"

    # Match weekly package slot count so backfill has enough format-diverse donors.
    row_count = max(3, min(int(count or 0) or duration_days, 16))

    description = CONTENT_CALENDAR_TASK.format(
        business_name=brand.business_name,
        count=row_count,
        current_date=current_date_str,
        location=brand.location or "Turkey",
        business_type=brand.business_type or "hospitality",
        brief=brand.campaign_goals or "increase engagement and brand awareness",
        signals=signals_summary,
        format_mix=format_mix or f"{duration_days}-day weekly mix (story, post, reel, carousel)",
    )

    return Task(
        description=description,
        expected_output=(
            f"A JSON array of {row_count} publish plan rows, each with: "
            "announcement_type, event_name, tagline, date, time, venue_area, "
            "template_use_case, format (story|post|reel|carousel), content_brief, photo_mood, priority."
        ),
        agent=agent,
    )
