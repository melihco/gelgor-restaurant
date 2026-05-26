"""
Brand Theme Service — derives a BrandTheme token set from available brand signals.

Source priority waterfall (ADR-001):
  1. brand_vibe_profile  → richest; has palette, grading, composition, anti_patterns
  2. visual_dna text     → LLM hex extraction from prose visual description
  3. brand_primary_color / brand_accent_color / brand_font_family → manual fallback
  4. Industry sector defaults → cold-start guarantee

Called:
  - After onboarding confirm-constitution (automatic bootstrap)
  - After extract-vibe completes (automatic re-derive)
  - On demand via PUT /brand-context/{id}/theme (operator override)
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

import structlog

from app.schemas.brand_theme import (
    BrandTheme,
    ThemeComposition,
    ThemeGrading,
    ThemeLayout,
    ThemeOverlay,
    ThemePalette,
    ThemeTypography,
)

if TYPE_CHECKING:
    from app.models.brand_context import BrandContext

logger = structlog.get_logger()


# ── Safe fonts (Google Fonts / OFL only) ─────────────────────────────────────

SAFE_FONTS: frozenset[str] = frozenset({
    "Inter", "Playfair Display", "Montserrat", "Lora", "Raleway", "Nunito",
    "Josefin Sans", "Cormorant Garamond", "DM Sans", "DM Serif Display",
    "Libre Baskerville", "Poppins", "Source Serif 4", "Fraunces",
    "Space Grotesk", "Syne",
})

_DEFAULT_HEADING_FONT = "Playfair Display"
_DEFAULT_BODY_FONT = "Inter"


# ── Sector defaults ───────────────────────────────────────────────────────────

_SECTOR_DEFAULTS: dict[str, dict] = {
    "restaurant_cafe": {
        "palette": ThemePalette(primary="#2c1a0e", accent="#c9813f", neutral="#f5f0e8", shadow="#1a0f07", description="warm earth tones"),
        "typography": ThemeTypography(heading_font="Playfair Display", body_font="Lora", text_overlay_density="minimal", personality="warm, inviting, artisanal"),
        "grading": ThemeGrading(look="warm golden editorial", lut_directive="warm tones, lifted shadows, golden cast, film grain"),
        "overlay": ThemeOverlay(opacity=0.2, color="#2c1a0e"),
    },
    "beauty_wellness": {
        "palette": ThemePalette(primary="#f8f4f0", accent="#c9a98e", neutral="#ffffff", shadow="#3d2b1f", description="soft neutral luxury"),
        "typography": ThemeTypography(heading_font="Cormorant Garamond", body_font="DM Sans", text_overlay_density="minimal", personality="elegant, soft, aspirational"),
        "grading": ThemeGrading(look="soft pastel editorial", lut_directive="bright, airy, desaturated skin tones, clean whites"),
        "overlay": ThemeOverlay(opacity=0.15, color="#f8f4f0"),
    },
    "beach_club": {
        "palette": ThemePalette(primary="#0b4f6c", accent="#f5a623", neutral="#e8f4f8", shadow="#071e26", description="deep ocean with golden sun"),
        "typography": ThemeTypography(heading_font="Raleway", body_font="Montserrat", text_overlay_density="medium", personality="energetic, bold, summery"),
        "grading": ThemeGrading(look="vibrant coastal", lut_directive="punchy blues, golden highlights, high contrast, vivid saturation"),
        "overlay": ThemeOverlay(opacity=0.3, color="#0b4f6c"),
    },
    "healthcare_clinic": {
        "palette": ThemePalette(primary="#f0f6ff", accent="#2563eb", neutral="#ffffff", shadow="#1e3a5f", description="clean clinical trust"),
        "typography": ThemeTypography(heading_font="Inter", body_font="DM Sans", text_overlay_density="minimal", personality="professional, trustworthy, calm"),
        "grading": ThemeGrading(look="cool clinical minimal", lut_directive="cool tones, clean whites, minimal saturation"),
        "overlay": ThemeOverlay(opacity=0.15, color="#1e3a5f"),
    },
    "ecommerce_retail": {
        "palette": ThemePalette(primary="#111111", accent="#e63946", neutral="#f8f8f8", shadow="#000000", description="bold modern retail"),
        "typography": ThemeTypography(heading_font="Syne", body_font="DM Sans", text_overlay_density="medium", personality="modern, bold, commercial"),
        "grading": ThemeGrading(look="punchy product", lut_directive="high contrast, vivid colors, clean backgrounds"),
        "overlay": ThemeOverlay(opacity=0.35, color="#111111"),
    },
    "local_products_shop": {
        "palette": ThemePalette(primary="#3d2b1f", accent="#6b8f3e", neutral="#f5ede0", shadow="#1a110a", description="organic earthy natural"),
        "typography": ThemeTypography(heading_font="Fraunces", body_font="Libre Baskerville", text_overlay_density="minimal", personality="authentic, artisan, natural"),
        "grading": ThemeGrading(look="natural earthy", lut_directive="earthy tones, natural greens, warm shadows, organic film look"),
        "overlay": ThemeOverlay(opacity=0.2, color="#3d2b1f"),
    },
    "real_estate": {
        "palette": ThemePalette(primary="#1a1a2e", accent="#c9a84c", neutral="#f2f2f2", shadow="#0d0d1a", description="prestige dark gold"),
        "typography": ThemeTypography(heading_font="Montserrat", body_font="Source Serif 4", text_overlay_density="medium", personality="prestigious, authoritative, refined"),
        "grading": ThemeGrading(look="prestige architectural", lut_directive="dramatic shadows, golden hour glow, rich blacks, cinematic"),
        "overlay": ThemeOverlay(opacity=0.4, color="#1a1a2e"),
    },
    "agency_services": {
        "palette": ThemePalette(primary="#0f172a", accent="#6366f1", neutral="#f8fafc", shadow="#020617", description="modern digital bold"),
        "typography": ThemeTypography(heading_font="Space Grotesk", body_font="Inter", text_overlay_density="medium", personality="sharp, innovative, confident"),
        "grading": ThemeGrading(look="digital modern", lut_directive="cool neutral, clean whites, accent color pops, high clarity"),
        "overlay": ThemeOverlay(opacity=0.3, color="#0f172a"),
    },
}

_DEFAULT_SECTOR = "local_service_business"
_DEFAULT_SECTOR_DATA = {
    "palette": ThemePalette(primary="#1a1a1a", accent="#4f8ef7", neutral="#f5f5f5", shadow="#000000", description="clean professional"),
    "typography": ThemeTypography(heading_font="Montserrat", body_font="DM Sans", text_overlay_density="minimal", personality="professional, reliable"),
    "grading": ThemeGrading(look="clean natural", lut_directive="balanced exposure, neutral colors, professional clarity"),
    "overlay": ThemeOverlay(opacity=0.25, color="#1a1a1a"),
}


# ── Contrast checker (WCAG AA — 4.5:1 for normal text) ───────────────────────

def _hex_to_rgb(hex_color: str) -> tuple[float, float, float]:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return r / 255.0, g / 255.0, b / 255.0


def _relative_luminance(r: float, g: float, b: float) -> float:
    def channel(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def _contrast_ratio(hex1: str, hex2: str) -> float:
    try:
        l1 = _relative_luminance(*_hex_to_rgb(hex1))
        l2 = _relative_luminance(*_hex_to_rgb(hex2))
        lighter, darker = max(l1, l2), min(l1, l2)
        return (lighter + 0.05) / (darker + 0.05)
    except Exception:
        return 1.0


def _wcag_aa_pass(background: str, text: str) -> bool:
    return _contrast_ratio(background, text) >= 4.5


def _ensure_contrast(palette: ThemePalette) -> tuple[ThemePalette, bool]:
    """
    Check WCAG AA contrast between primary bg and neutral text.
    If it fails, swap neutral to white (#ffffff) or black (#000000) — whichever passes.
    Returns (possibly adjusted palette, whether original passed).
    """
    passes = _wcag_aa_pass(palette.primary, palette.neutral)
    if passes:
        return palette, True

    white_passes = _wcag_aa_pass(palette.primary, "#ffffff")
    better_neutral = "#ffffff" if white_passes else "#000000"
    fixed = palette.model_copy(update={"neutral": better_neutral})
    logger.warning(
        "contrast_adjusted",
        original_neutral=palette.neutral,
        adjusted_neutral=better_neutral,
        primary=palette.primary,
    )
    return fixed, False


# ── Hex extraction from visual_dna prose ─────────────────────────────────────

def _extract_hex_from_prose(text: str) -> list[str]:
    """Extract all hex color codes mentioned in visual_dna text."""
    return re.findall(r"#[0-9a-fA-F]{6}\b", text)


# ── Source 1: from vibe_profile ───────────────────────────────────────────────

def _from_vibe_profile(vibe: dict) -> tuple[ThemePalette, ThemeTypography, ThemeGrading, ThemeComposition, ThemeOverlay, list[str], list[str]]:
    palette_data = vibe.get("palette") or {}
    grading_data = vibe.get("grading") or {}
    comp_data = vibe.get("composition") or {}
    typo_data = vibe.get("typography") or {}
    voice_data = vibe.get("caption_voice") or {}

    palette = ThemePalette(
        primary=palette_data.get("primary", "#1a1a1a"),
        accent=palette_data.get("accent", "#4f8ef7"),
        neutral=palette_data.get("neutral", "#f5f5f5"),
        shadow=palette_data.get("shadow", "#000000"),
        description=palette_data.get("palette_description", ""),
    )

    heading_font = typo_data.get("heading_personality", _DEFAULT_HEADING_FONT)
    # heading_personality is descriptive text, not a font name — use safe default
    heading_font = _DEFAULT_HEADING_FONT
    body_font = _DEFAULT_BODY_FONT
    density_raw = typo_data.get("text_overlay_density", "minimal")
    density = density_raw if density_raw in ("minimal", "medium", "dense") else "minimal"

    typography = ThemeTypography(
        heading_font=heading_font,
        body_font=body_font,
        text_overlay_density=density,
        personality=typo_data.get("body_personality", ""),
    )

    grading = ThemeGrading(
        look=grading_data.get("look", "natural editorial"),
        lut_directive=grading_data.get("lut_directive", "natural colors, balanced exposure"),
    )

    composition = ThemeComposition(
        primary_pattern=comp_data.get("primary_pattern", "centered subject"),
        text_safe_area_fraction=0.6,
        subject_focus=comp_data.get("subject_focus", "main subject sharp"),
    )

    overlay = ThemeOverlay(
        opacity=0.25,
        color=palette_data.get("shadow", "#000000"),
    )

    writing_rules: list[str] = voice_data.get("writing_rules", []) if isinstance(voice_data, dict) else []
    anti_patterns: list[str] = vibe.get("anti_patterns", [])

    return palette, typography, grading, composition, overlay, writing_rules, anti_patterns


# ── Source 2: from visual_dna prose ──────────────────────────────────────────

def _parse_visual_dna_palette_line(visual_dna: str) -> list[str]:
    """
    Extract palette hex codes from the formatted **Palette** line.
    Format: "**Palette**: #xxxxxx · #yyyyyy · #zzzzzz · #wwwwww"
    Falls back to generic hex extraction if line not found.
    """
    for line in visual_dna.splitlines():
        if "**Palette**:" in line or "**palette**:" in line.lower():
            return re.findall(r"#[0-9a-fA-F]{6}", line)
    return _extract_hex_from_prose(visual_dna)


def _grading_from_visual_style(visual_dna: str, lighting: str = "") -> ThemeGrading:
    """Derive grading look + LUT directive from visual_dna prose keywords."""
    text = (visual_dna + " " + lighting).lower()
    grading_map = [
        (["warm golden", "golden hour", "golden cast"],     "warm golden editorial",      "warm tones, lifted shadows, golden cast, film grain"),
        (["cool toned", "cool blue", "cold toned"],          "cool toned editorial",       "cool tones, desaturated highlights, blue cast"),
        (["bright minimal", "bright airy", "airy", "clean"], "bright minimal editorial",   "bright, airy, lifted whites, clean tones, minimal grain"),
        (["moody dark", "dark moody", "dramatic"],           "dark moody editorial",       "crushed blacks, deep shadows, muted highlights, cinematic"),
        (["vibrant", "saturated", "punchy"],                 "vibrant editorial",          "punchy saturation, high contrast, vivid accent colors"),
        (["earthy", "natural", "organic"],                   "natural earthy editorial",   "earthy tones, natural greens, warm shadows, organic film look"),
        (["pastel", "soft", "muted"],                        "soft pastel editorial",      "bright, airy, desaturated, lifted shadows, soft pastels"),
        (["clinical", "clean", "white"],                     "clean clinical",             "cool tones, clean whites, minimal saturation, precise"),
        (["neon", "electric", "glow"],                       "neon editorial",             "high saturation, neon accent colors, dramatic shadows"),
    ]
    for keywords, look, lut in grading_map:
        if any(k in text for k in keywords):
            return ThemeGrading(look=look, lut_directive=lut)
    return ThemeGrading(look="natural editorial", lut_directive="natural colors, balanced exposure, subtle warmth")


def _from_visual_dna(visual_dna: str, sector_data: dict) -> tuple[ThemePalette, ThemeGrading]:
    hexes = _parse_visual_dna_palette_line(visual_dna)
    if len(hexes) >= 2:
        palette = ThemePalette(
            primary=hexes[0],
            accent=hexes[1],
            neutral=hexes[2] if len(hexes) > 2 else "#f5f5f5",
            shadow=hexes[3] if len(hexes) > 3 else "#000000",
            description="extracted from visual DNA analysis",
        )
    else:
        palette = sector_data["palette"]

    # Extract lighting line for better grading heuristics
    lighting = ""
    for line in visual_dna.splitlines():
        if "**Lighting**:" in line:
            lighting = line.split(":", 1)[-1].strip()
            break

    grading = _grading_from_visual_style(visual_dna, lighting)
    return palette, grading


# ── Main derivation function ──────────────────────────────────────────────────

async def derive_brand_theme(ctx: "BrandContext") -> BrandTheme:
    """
    Derive a BrandTheme from available brand signals (ADR-001 waterfall).

    This is the single entry point called by:
    - confirm-constitution endpoint (auto bootstrap)
    - extract-vibe completion hook (re-derive on new data)
    - PUT /brand-context/{id}/theme (manual trigger)
    """
    from app.crew.industry_playbooks import normalize_industry_id

    workspace_id = str(ctx.workspace_id)
    sector = normalize_industry_id(ctx.business_type or "")
    sector_data = _SECTOR_DEFAULTS.get(sector, _DEFAULT_SECTOR_DATA)

    source: str
    palette: ThemePalette
    typography: ThemeTypography
    grading: ThemeGrading
    composition: ThemeComposition
    overlay: ThemeOverlay
    caption_voice_rules: list[str] = []
    anti_patterns: list[str] = []

    vibe = ctx.brand_vibe_profile
    visual_dna = getattr(ctx, "visual_dna", None) or ""

    # ── Step 1: vibe_profile ──────────────────────────────────────────────────
    if vibe and isinstance(vibe, dict) and vibe.get("palette"):
        source = "vibe_profile"
        palette, typography, grading, composition, overlay, caption_voice_rules, anti_patterns = _from_vibe_profile(vibe)
        logger.info("brand_theme_source_vibe", workspace_id=workspace_id)

    # ── Step 2: visual_dna text ───────────────────────────────────────────────
    elif visual_dna and len(visual_dna) > 50:
        source = "visual_dna"
        palette, grading = _from_visual_dna(visual_dna, sector_data)
        typography = sector_data["typography"]
        composition = ThemeComposition()
        overlay = sector_data["overlay"]
        logger.info("brand_theme_source_visual_dna", workspace_id=workspace_id)

    # ── Step 3: manual brand colors ───────────────────────────────────────────
    elif getattr(ctx, "brand_primary_color", None):
        source = "manual_colors"
        primary = ctx.brand_primary_color or "#1a1a1a"
        accent = getattr(ctx, "brand_accent_color", None) or sector_data["palette"].accent
        palette = ThemePalette(
            primary=primary,
            accent=accent,
            neutral=sector_data["palette"].neutral,
            shadow=sector_data["palette"].shadow,
            description="from manually set brand colors",
        )
        font_family = getattr(ctx, "brand_font_family", None)
        if font_family and font_family in SAFE_FONTS:
            typography = ThemeTypography(
                heading_font=font_family,
                body_font=sector_data["typography"].body_font,
                text_overlay_density=sector_data["typography"].text_overlay_density,
                personality=sector_data["typography"].personality,
            )
        else:
            typography = sector_data["typography"]
        grading = sector_data["grading"]
        composition = ThemeComposition()
        overlay = ThemeOverlay(opacity=0.25, color=primary)
        logger.info("brand_theme_source_manual", workspace_id=workspace_id)

    # ── Step 4: sector default ────────────────────────────────────────────────
    else:
        source = "sector_default"
        palette = sector_data["palette"]
        typography = sector_data["typography"]
        grading = sector_data["grading"]
        composition = ThemeComposition()
        overlay = sector_data["overlay"]
        logger.info("brand_theme_source_sector_default", workspace_id=workspace_id, sector=sector)

    # ── Contrast check ────────────────────────────────────────────────────────
    palette, contrast_valid = _ensure_contrast(palette)

    # ── Assemble ──────────────────────────────────────────────────────────────
    theme = BrandTheme(
        workspace_id=workspace_id,
        derived_at=datetime.now(timezone.utc),
        source=source,
        palette=palette,
        typography=typography,
        composition=composition,
        grading=grading,
        overlay=overlay,
        layout=ThemeLayout(
            border_radius=12,
            spacing_base=8,
            default_layout_id="feed_square",
        ),
        caption_voice_rules=caption_voice_rules[:8],
        anti_patterns=anti_patterns[:10],
        contrast_valid=contrast_valid,
    )

    logger.info(
        "brand_theme_derived",
        workspace_id=workspace_id,
        source=source,
        palette_primary=palette.primary,
        contrast_valid=contrast_valid,
        anti_patterns_count=len(anti_patterns),
    )
    return theme


async def save_brand_theme(ctx: "BrandContext", theme: "BrandTheme", db) -> None:
    """Persist a derived or manually-overridden BrandTheme to brand_context."""
    from datetime import datetime, timezone
    from sqlalchemy import update
    from app.models.brand_context import BrandContext

    await db.execute(
        update(BrandContext)
        .where(BrandContext.workspace_id == ctx.workspace_id)
        .execution_options(synchronize_session=False)
        .values(
            brand_theme=theme.model_dump(mode="json"),
            brand_theme_updated_at=datetime.now(timezone.utc),
        )
    )
    await db.commit()
