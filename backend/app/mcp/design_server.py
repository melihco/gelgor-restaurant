"""
Smart Agency Design MCP Server — visual direction tools for VPD / Claude MCP connector.

Run: python -m app.mcp.design_server
Anthropic connector: Streamable HTTP + authorization_token (MCP_AUTH_TOKEN).
"""

from __future__ import annotations

import json
import os

import structlog
from fastmcp import FastMCP
from fastmcp.server.auth.providers.debug import DebugTokenVerifier

from app.mcp.sector_rules import (
    get_sector_visual_rules,
    is_non_venue_sector,
    recommend_poster_layout,
    resolve_visual_subject,
    validate_visual_brief,
)

logger = structlog.get_logger()

INSTRUCTIONS = """
Smart Agency visual production MCP server.
Use these tools when routing social content for ambiguous sectors (SaaS vs physical venue).
Prefer digital_ui for B2B software; never steer SaaS brands toward storefront photography.
"""


def _expected_token() -> str:
    return (
        os.getenv("MCP_AUTH_TOKEN", "").strip()
        or os.getenv("INTERNAL_API_KEY", "").strip()
        or "smartagency-mcp-dev"
    )


def _build_auth() -> DebugTokenVerifier:
    expected = _expected_token()

    def _validate(token: str) -> bool:
        ok = token.strip() == expected
        if not ok:
            logger.warning("mcp.auth_rejected")
        return ok

    return DebugTokenVerifier(validate=_validate, client_id="smart-agency-design")


mcp = FastMCP(
    name="SmartAgency Design",
    instructions=INSTRUCTIONS.strip(),
    version="1.0.0",
    auth=_build_auth(),
)


@mcp.tool
def resolve_visual_subject_tool(business_type: str, caption: str = "") -> str:
    """
    Resolve visual subject for a brand post.
    Returns venue_ambiance | product_hero | digital_ui.
    """
    subject = resolve_visual_subject(business_type, caption)
    return json.dumps({
        "visual_subject": subject,
        "business_type": business_type,
        "caption_snippet": (caption or "")[:200],
    }, ensure_ascii=False)


@mcp.tool
def get_sector_visual_rules_tool(business_type: str) -> str:
    """
    Sector-specific visual rules: forbidden elements, layouts, CTA hints, enhance policy.
    """
    return json.dumps(get_sector_visual_rules(business_type), ensure_ascii=False, indent=2)


@mcp.tool
def recommend_poster_layout_tool(
    business_type: str,
    headline: str,
    caption: str = "",
) -> str:
    """
    Recommend Remotion poster layout_family for designed_post slots.
    """
    return json.dumps(
        recommend_poster_layout(business_type, headline, caption),
        ensure_ascii=False,
        indent=2,
    )


@mcp.tool
def validate_visual_brief_tool(
    business_type: str,
    headline: str,
    caption: str = "",
    image_edit_prompt: str = "",
) -> str:
    """
    QA check: does the visual brief match the business model (SaaS vs venue)?
    Returns pass/fail and recommended visual_subject.
    """
    return json.dumps(
        validate_visual_brief(business_type, headline, caption, image_edit_prompt),
        ensure_ascii=False,
        indent=2,
    )


@mcp.tool
def build_image_edit_prompt_tool(
    business_type: str,
    headline: str,
    caption: str,
    brand_name: str = "Brand",
) -> str:
    """
    Build a one-paragraph GPT image-2 / scene brief aligned with sector rules.
    """
    subject = resolve_visual_subject(business_type, caption)
    rules = get_sector_visual_rules(business_type)
    brief = f"{headline}. {caption}".strip()[:500]

    if subject == "digital_ui":
        prompt = (
            f"⚠️ DIGITAL PRODUCT — {brand_name} ({business_type}). "
            f"Show dashboard UI, appointment calendar, or mobile app mockup for: \"{brief}\". "
            "NEVER a physical shop storefront or street scene. "
            "Preserve real UI pixels; upgrade lighting and device framing only. "
            f"Forbidden: {', '.join(rules['forbidden_elements'][:3])}."
        )
    elif subject == "venue_ambiance":
        prompt = (
            f"⚠️ VENUE PRESERVATION — {brand_name}. "
            f"Enhance lighting/atmosphere for: \"{brief}\". "
            "Keep real venue architecture; do not replace with stock location."
        )
    else:
        prompt = (
            f"⚠️ PRODUCT PRESERVATION — {brand_name}. "
            f"Product hero for: \"{brief}\". "
            "Preserve labels and packaging; upgrade staging and light only."
        )

    return json.dumps({
        "visual_subject": subject,
        "image_edit_prompt": prompt,
        "enhance_recommended": rules.get("enhance_policy") != "skip_gpt_enhance",
    }, ensure_ascii=False, indent=2)


@mcp.tool
def build_runway_director_prompt_tool(
    business_type: str,
    headline: str,
    caption: str,
    brand_name: str = "Brand",
    mood: str = "",
    vibe_grading_look: str = "",
    vibe_camera_movement: str = "",
    vibe_palette_description: str = "",
    anti_patterns: str = "",
) -> str:
    """
    Build a Runway Gen4 cinematic director prompt for Reels.
    Returns camera_motion, cinematic_concept, director_brief, and forbidden_visuals.
    Sector-aware: SaaS brands get digital/urban concepts; venue brands get location-based cinematics.
    """
    subject = resolve_visual_subject(business_type, caption)
    rules = get_sector_visual_rules(business_type)
    anti_list = [a.strip() for a in anti_patterns.split(",") if a.strip()]

    grading = vibe_grading_look or "golden_hour"
    palette = vibe_palette_description or "warm editorial"

    # Camera motion: prefer vibe directive, fall back to sector default
    if vibe_camera_movement:
        camera_motion = vibe_camera_movement
    elif subject == "digital_ui":
        camera_motion = "slow_zoom_out"
    elif subject == "venue_ambiance":
        camera_motion = "slow_push_in"
    else:
        camera_motion = "orbit"

    # Cinematic concept per subject type
    if subject == "digital_ui":
        cinematic_concept = (
            f"{brand_name} — {headline}. "
            f"Aerial or floating camera reveals a {business_type} product interface. "
            f"{palette} ambient light. Motion: {camera_motion}. Mood: {mood or 'confident, modern'}. "
            f"NO physical storefront. NO street scenes."
        )
    elif subject == "venue_ambiance":
        cinematic_concept = (
            f"{brand_name} — {headline}. "
            f"Cinematic venue ambiance shot. {grading} color grade. "
            f"Camera: {camera_motion}. Mood: {mood or 'premium, inviting'}. "
            f"Preserve real architecture and lighting — enhance atmosphere only."
        )
    else:
        cinematic_concept = (
            f"{brand_name} — {headline}. "
            f"Product hero in motion. {grading} grading, {palette}. "
            f"Camera: {camera_motion}. Mood: {mood or 'confident, editorial'}."
        )

    director_brief = (
        f"Runway Gen4 Turbo — 5s, 720:1280 (9:16 Reels). "
        f"Concept: {cinematic_concept} "
        f"Caption context: {caption[:200]}. "
        f"Forbidden: {', '.join((rules['forbidden_elements'][:3] + anti_list)[:5]) or 'none'}."
    )

    return json.dumps({
        "camera_motion": camera_motion,
        "cinematic_concept": cinematic_concept,
        "director_brief": director_brief,
        "visual_subject": subject,
        "forbidden_visuals": rules["forbidden_elements"][:4] + anti_list[:2],
    }, ensure_ascii=False, indent=2)


@mcp.tool
def build_story_scene_brief_tool(
    business_type: str,
    headline: str,
    caption: str,
    brand_name: str = "Brand",
    mood: str = "",
    template_use_case: str = "",
    vibe_palette_description: str = "",
    anti_patterns: str = "",
) -> str:
    """
    Build an Instagram Story scene brief: overlay copy, layout_family, text hierarchy,
    and animation_style. Sector-aware (SaaS vs venue vs product).
    """
    subject = resolve_visual_subject(business_type, caption)
    rules = get_sector_visual_rules(business_type)
    anti_list = [a.strip() for a in anti_patterns.split(",") if a.strip()]
    palette = vibe_palette_description or "brand palette"

    # Determine animation style by mood/use-case
    use_case = template_use_case.lower() if template_use_case else ""
    if "event" in use_case or "announcement" in use_case:
        animation_style = "slide_reveal"
        layout_family = "story_event"
    elif "promo" in use_case or "indirim" in use_case or "%" in caption:
        animation_style = "pulse_scale"
        layout_family = "story_promo"
    elif subject == "digital_ui":
        animation_style = "fade_typewriter"
        layout_family = "story_digital"
    else:
        animation_style = "ken_burns"
        layout_family = "story_editorial"

    # Headline trim for overlay — 9:16 stories have ~28 char safe zone
    headline_safe = headline[:28].strip()
    cta_hint = rules["cta_hints"][0] if rules.get("cta_hints") else "Keşfet"

    return json.dumps({
        "layout_family": layout_family,
        "animation_style": animation_style,
        "overlay_copy": {
            "headline": headline_safe,
            "body": caption[:90].strip(),
            "cta": cta_hint,
        },
        "text_hierarchy": "headline > body > cta",
        "background_treatment": (
            "venue_photo_preserved" if subject == "venue_ambiance" else
            "ui_screenshot_preserved" if subject == "digital_ui" else
            "product_hero_preserved"
        ),
        "color_palette_hint": palette,
        "forbidden_visuals": rules["forbidden_elements"][:3] + anti_list[:2],
        "scene_mood": mood or "premium, editorial",
        "visual_subject": subject,
    }, ensure_ascii=False, indent=2)


@mcp.tool
def build_carousel_brief_tool(
    business_type: str,
    headline: str,
    caption: str,
    brand_name: str = "Brand",
    slide_count: int = 4,
    strategic_purpose: str = "",
    anti_patterns: str = "",
) -> str:
    """
    Build an Instagram Carousel production brief.
    Returns slide_structure (cover + body + CTA slide), visual_flow,
    cover_treatment, per_slide_image_hint, and layout_family.
    Sector-aware: SaaS gets UI/feature showcase; venue gets gallery sequence.
    """
    subject = resolve_visual_subject(business_type, caption)
    rules = get_sector_visual_rules(business_type)
    anti_list = [a.strip() for a in anti_patterns.split(",") if a.strip()]
    purpose = strategic_purpose.lower()

    # Determine carousel narrative arc
    if "social_proof" in purpose or "testimonial" in purpose:
        arc = "testimonial_series"
        cover_treatment = "bold_headline_with_quote_teaser"
        slide_theme = "Each slide: one customer proof point. Cover hooks curiosity, slides build evidence, CTA closes."
    elif "educational" in purpose or "how_to" in purpose or "tips" in purpose:
        arc = "educational_steps"
        cover_treatment = "numbered_hook_cover"
        slide_theme = "Cover: problem or hook. Slides 2-N: step-by-step or tip. Last slide: CTA + summary."
    elif "product" in purpose or "feature" in purpose:
        arc = "feature_showcase"
        cover_treatment = "product_hero_cover"
        slide_theme = "Cover: bold benefit claim. Each slide: one feature with visual proof. Last: pricing/CTA."
    else:
        arc = "editorial_series"
        cover_treatment = "editorial_magazine_cover"
        slide_theme = "Cover: strong visual + headline. Body slides: content + minimal text. Last: CTA."

    # Layout family based on subject
    if subject == "digital_ui":
        layout_family = "editorial_date"
        image_hint = "UI screenshot or mockup per slide — never stock photos of physical venues."
    elif subject == "venue_ambiance":
        layout_family = "gallery_series"
        image_hint = "Gallery sequence: each slide a different venue moment. Preserve real venue photography."
    else:
        layout_family = "product_series"
        image_hint = "Product packaging or lifestyle shot per slide — preserve labels."

    slides = []
    slides.append({
        "index": 0,
        "role": "cover",
        "treatment": cover_treatment,
        "text": f"Headline: '{headline[:40]}' — max 6 words, bold hook",
        "image_hint": image_hint,
    })
    for i in range(1, max(slide_count - 1, 1)):
        slides.append({
            "index": i,
            "role": "body",
            "treatment": "clean_content_slide",
            "text": f"Slide {i+1}: one key point from caption. Max 2 lines.",
            "image_hint": image_hint,
        })
    slides.append({
        "index": slide_count - 1,
        "role": "cta",
        "treatment": "cta_closing_slide",
        "text": f"CTA: {rules['cta_hints'][0] if rules.get('cta_hints') else 'Keşfet'} — brand anchor: {brand_name}",
        "image_hint": "Brand color background or logo lockup — no photography needed.",
    })

    return json.dumps({
        "layout_family": layout_family,
        "narrative_arc": arc,
        "slide_count": slide_count,
        "slide_structure": slides,
        "visual_flow": slide_theme,
        "cover_treatment": cover_treatment,
        "visual_subject": subject,
        "image_hint_per_slide": image_hint,
        "forbidden_visuals": rules["forbidden_elements"][:3] + anti_list[:2],
        "swipe_hook": "Cover must stop the scroll — use max 6 words, high-contrast text over image.",
    }, ensure_ascii=False, indent=2)


@mcp.tool
def validate_caption_hook_tool(
    business_type: str,
    headline: str,
    caption: str,
    content_type: str = "post",
    brand_language: str = "tr",
) -> str:
    """
    QA check on caption hook quality for social media.
    Returns hook_type detected, hook_score (0-100), weak_signals, and
    rewrite_suggestion when score < 60.
    Works for post, story, reel, carousel.
    """
    cap_lower = caption.lower()
    head_lower = headline.lower()
    combined = f"{head_lower} {cap_lower}"

    # Hook type detection
    hook_type = "generic"
    if any(w in combined for w in ["?", "neden", "nasıl", "kaç", "why", "how", "what if"]):
        hook_type = "question"
    elif any(w in combined for w in ["sır", "secret", "gizli", "az bilinen", "hidden"]):
        hook_type = "curiosity_gap"
    elif any(w in combined for w in ["ücretsiz", "free", "indirim", "kampanya", "%", "özel"]):
        hook_type = "offer_urgency"
    elif any(w in combined for w in ["biz", "we ", "our", "hikaye", "story", "nasıl başladık"]):
        hook_type = "brand_story"
    elif any(w in combined for w in ["ipucu", "tip", "adım", "step", "rehber", "guide"]):
        hook_type = "educational"
    elif any(w in combined for w in ["müşteri", "customer", "kullanıcı", "ba��ardı", "dönüşüm"]):
        hook_type = "social_proof"

    # Score weak signals
    issues = []
    score = 70  # baseline

    if len(headline) < 5:
        issues.append("Headline too short — no hook power")
        score -= 25

    if headline.upper() == headline and len(headline) > 20:
        issues.append("All-caps headline reduces readability on mobile")
        score -= 10

    generic_phrases = ["bu hafta", "bu haftanın", "yeni içerik", "new post", "check this", "merhaba"]
    for phrase in generic_phrases:
        if phrase in combined:
            issues.append(f"Generic phrase detected: '{phrase}' — replace with specific hook")
            score -= 15
            break

    if len(caption) < 30:
        issues.append("Caption too short — lacks context for engagement")
        score -= 10

    if not any(c in caption for c in ["?", "!", "."]):
        issues.append("No punctuation energy — add a question or exclamation to drive action")
        score -= 5

    rules = get_sector_visual_rules(business_type)
    if is_non_venue_sector(business_type) and any(
        w in combined for w in ["dükkan", "mağaza", "shop", "mekan", "venue"]
    ):
        issues.append("SaaS brand but caption mentions physical location — confusing for audience")
        score -= 20

    score = max(0, min(100, score))

    # Rewrite suggestion for weak hooks
    rewrite = None
    if score < 60:
        cta = rules["cta_hints"][0] if rules.get("cta_hints") else "Dene"
        if hook_type == "generic":
            rewrite = (
                f"Daha güçlü bir açılış için: Soru veya merak açığı kullan. "
                f"Örnek format: '[Spesifik rakam/sonuç] ile [Hedef kitle] [Sonuç] elde etti — [CTA]: {cta}'"
            )
        else:
            rewrite = f"Hook tipi iyi ({hook_type}) ama zayıf sinyal var. Başlığı ilk 5 kelimede spesifik bir sonuca bağla."

    return json.dumps({
        "hook_type": hook_type,
        "hook_score": score,
        "grade": "A" if score >= 80 else "B" if score >= 60 else "C" if score >= 40 else "D",
        "weak_signals": issues,
        "rewrite_suggestion": rewrite,
        "content_type": content_type,
        "passes_qa": score >= 60,
    }, ensure_ascii=False, indent=2)


@mcp.tool
def build_hashtag_strategy_tool(
    business_type: str,
    content_type: str,
    headline: str,
    caption: str,
    brand_language: str = "tr",
    platform: str = "instagram",
) -> str:
    """
    Build a 3-tier hashtag strategy (niche + mid + broad) for the content type and sector.
    Returns niche_tags (highest relevance, lowest reach), mid_tags, broad_tags,
    banned_signals (overused/shadowban risk), and usage_note per content type.
    """
    subject = resolve_visual_subject(business_type, caption)
    rules = get_sector_visual_rules(business_type)
    sector = rules["sector"]
    combined = f"{headline} {caption}".lower()

    # Sector-based niche clusters
    SECTOR_NICHE: dict = {
        "restaurant_cafe": ["#kahvekeyfi", "#cafevibes", "#yemekfotografı", "#foodphotography", "#kahveseverler"],
        "barber_salon": ["#berberfotografı", "#erkekbakım", "#saçmodası", "#berberdünyası", "#erkeksaçı"],
        "agency_services": ["#dijitalpazarlama", "#sosyalmedyayönetimi", "#içeriküretimi", "#brandingstrategy", "#digitalagency"],
        "hotel_resort": ["#bodrumoteli", "#lükskonaklama", "#tatilmoteli", "#summerhotel", "#bodrumvibe"],
        "ecommerce_retail": ["#onlinealisveris", "#ürünfotografı", "#türkemoda", "#alışverişzamanı", "#indirim"],
        "general_business": ["#türkiyeişdünyası", "#girişimcilik", "#işipuçları", "#küçükişletme", "#markalaşma"],
    }

    BROAD_TAGS = ["#instagram", "#reels", "#keşfet", "#viral", "#trending"]
    MID_TAGS_BY_CONTENT = {
        "reel": ["#instagramreels", "#reelsvideo", "#reelstürkiye", "#keşfetteyiz", "#reelstrending"],
        "story": ["#instastory", "#storytime", "#günlük", "#daily", "#hikaye"],
        "carousel": ["#swiperight", "#kaydır", "#carousel", "#infografik", "#bilgi"],
        "post": ["#instagood", "#photooftheday", "#türkiye", "#istanbul", "#like4like"],
    }

    niche = SECTOR_NICHE.get(sector, SECTOR_NICHE["general_business"])
    mid = MID_TAGS_BY_CONTENT.get(content_type.replace("instagram_", ""), MID_TAGS_BY_CONTENT["post"])

    # Content-specific additions
    if any(w in combined for w in ["yaz", "summer", "sezon", "season"]):
        niche.append("#yaztrendi")
        niche.append("#summervibes")

    if any(w in combined for w in ["ücretsiz", "free", "indirim", "kampanya"]):
        mid.append("#kampanya")
        mid.append("#firsatlar")

    # Shadowban-risk signals
    banned_signals = ["#like4likes", "#followforfollow", "#likeforlike", "#spam"]

    usage_note = {
        "reel": "Reels için 5-8 hashtag yeterli — fazlası reach düşürür. Niche + mid karışımı en iyi sonucu verir.",
        "story": "Story hashtag'leri aramada görünmez — sadece community hashtag (1-2) ekle.",
        "carousel": "Carousel için 10-15 hashtag en iyi reach'i sağlar. Niche ağırlıklı mix kullan.",
        "post": "Post için 10-15 hashtag önerilir. Bracket stratejisi: 5 niche + 5 mid + 3-5 broad.",
    }.get(content_type.replace("instagram_", ""), "10-15 hashtag, niche ağırlıklı mix önerilir.")

    return json.dumps({
        "niche_tags": niche[:6],
        "mid_tags": mid[:5],
        "broad_tags": BROAD_TAGS[:4],
        "recommended_count": 12 if content_type != "story" else 2,
        "recommended_mix": "5 niche + 4 mid + 3 broad",
        "banned_signals": banned_signals,
        "usage_note": usage_note,
        "content_type": content_type,
        "visual_subject": subject,
    }, ensure_ascii=False, indent=2)


def main() -> None:
    host = os.getenv("MCP_DESIGN_HOST", "0.0.0.0")
    port = int(os.getenv("MCP_DESIGN_PORT", "8010"))
    path = os.getenv("MCP_DESIGN_PATH", "/mcp")

    logger.info(
        "mcp.design_server.starting",
        host=host,
        port=port,
        path=path,
        auth="token",
    )
    mcp.run(
        transport="streamable-http",
        host=host,
        port=port,
        path=path,
    )


if __name__ == "__main__":
    main()
