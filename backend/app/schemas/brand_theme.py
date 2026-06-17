"""
BrandTheme schemas — derived design token set for a specific tenant.

Python mirror of apps/web/src/types/brand-theme.ts.
Produced by brand_theme_service.derive_brand_theme() and stored in
brand_contexts.brand_theme (JSONB).

Source priority waterfall (ADR-001):
  1. brand_vibe_profile   (richest — palette, grading, composition, anti_patterns)
  2. visual_dna text      (LLM hex extraction from prose description)
  3. brand_primary_color / brand_accent_color (manually set)
  4. Industry sector defaults
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ThemePalette(BaseModel):
    primary: str = Field(..., description="Primary hex color e.g. #2c1a0e")
    accent: str
    neutral: str
    shadow: str
    description: str = ""


class ThemeTypography(BaseModel):
    heading_font: str = "Inter"
    body_font: str = "DM Sans"
    text_overlay_density: Literal["minimal", "medium", "dense"] = "minimal"
    personality: str = ""


class ThemeComposition(BaseModel):
    primary_pattern: str = "centered subject"
    text_safe_area_fraction: float = Field(0.6, ge=0.0, le=1.0)
    subject_focus: str = "main subject sharp, background softly blurred"


class ThemeGrading(BaseModel):
    look: str = "natural editorial"
    lut_directive: str = "natural colors, balanced exposure"


class ThemeOverlay(BaseModel):
    opacity: float = Field(0.25, ge=0.0, le=1.0)
    color: str = "#000000"


class ThemeLayout(BaseModel):
    border_radius: int = Field(12, ge=0, le=48)
    spacing_base: int = Field(8, ge=4, le=32)
    default_layout_id: str = "feed_square"


class ThemeMediaPolicy(BaseModel):
    require_gallery: bool = True
    fallback: str = "brand_solid"
    min_match_score: int = Field(55, ge=0, le=100)


class ThemeMotionProfile(BaseModel):
    """Per-tenant Remotion routing — mirrors apps/web/src/lib/brand-motion-profile.ts"""

    motion_style: str = "editorial"
    locale: str = "tr"
    text_density: str = "medium"
    text_transform: str = "sentence"
    prefer_pure_photo_stories: float = Field(0.72, ge=0.4, le=0.95)
    composition_weights: dict[str, float] = Field(default_factory=dict)
    blocked_compositions: list[str] = Field(default_factory=list)
    allowed_intents: list[str] = Field(default_factory=list)
    media_policy: ThemeMediaPolicy = Field(default_factory=ThemeMediaPolicy)
    audio_mood_pool: list[str] = Field(default_factory=list)
    story_audio_mood: str | None = None
    story_audio_mode: str = "music_and_voice"  # music_only | music_and_voice
    story_voice_id: str | None = "nova"  # OpenAI TTS: nova, shimmer, onyx, echo, alloy, fable
    operator_override: bool = False


class BrandTheme(BaseModel):
    """Persisted on brand_contexts.brand_theme (JSONB)."""

    workspace_id: str
    derived_at: datetime
    source: Literal["vibe_profile", "visual_dna", "manual_colors", "sector_default"]

    palette: ThemePalette
    typography: ThemeTypography
    composition: ThemeComposition
    grading: ThemeGrading
    overlay: ThemeOverlay
    layout: ThemeLayout

    caption_voice_rules: list[str] = Field(default_factory=list)
    anti_patterns: list[str] = Field(default_factory=list)
    contrast_valid: bool = True

    # ── AI Photo Enhancement settings (set from Brand Hub → Ayarlar) ───────────
    ai_photo_enhance: bool = False
    ai_photo_enhance_level: str = "moderate"  # subtle | moderate | full
    # GPT images.edit on gallery-matched photo (not fresh generation)
    ai_enhance_gallery_selected: bool = True
    # Identity vs post brief split (Mission Hub / feed production standard)
    ai_use_brand_identity: bool = True
    ai_brief_drives_scene: bool = True
    ai_embed_logo: bool = True
    ai_enhance_formats: list[str] = Field(
        default_factory=lambda: ["post", "story", "carousel", "reel"],
    )
    ai_visual_subject: str = "auto"  # auto | venue_ambiance | product_hero
    # Caption-driven scene/product composite for Mission Hub (weak gallery included)
    ai_adaptive_scene: bool = False
    ai_adaptive_scene_mode: str = "auto"  # auto | venue_context | product_showcase | lifestyle_composite
    # Fresh AI visual from caption + brand DNA — gallery matcher skipped for feed posts
    ai_caption_driven_visual: bool = False
    # Experimental: Crew Visual Production Director enriches VPS before auto-produce
    enable_visual_production_director: bool = False

    motion_profile: ThemeMotionProfile | None = None

    # 5-slot brand template library (Mission Hub / feed production)
    template_library: dict | None = None


# ── Request / Response wrappers ───────────────────────────────────────────────

class BrandThemeRead(BaseModel):
    theme: BrandTheme | None = None
    updated_at: datetime | None = None


class BrandThemeSaveRequest(BaseModel):
    """Manual override — operator patches specific token fields."""
    theme: BrandTheme


class AiThemeSettingsPatch(BaseModel):
    """Partial AI visual settings — merged into existing brand_theme JSON."""

    ai_photo_enhance: bool | None = None
    ai_photo_enhance_level: str | None = None
    ai_enhance_gallery_selected: bool | None = None
    ai_use_brand_identity: bool | None = None
    ai_brief_drives_scene: bool | None = None
    ai_embed_logo: bool | None = None
    ai_enhance_formats: list[str] | None = None
    ai_visual_subject: str | None = None
    ai_adaptive_scene: bool | None = None
    ai_adaptive_scene_mode: str | None = None
    ai_caption_driven_visual: bool | None = None
    enable_visual_production_director: bool | None = None  # experimental VPD crew
    # Mertcafe / Zernio Instagram publish (per-tenant overrides)
    mertcafe_api_key: str | None = None
    mertcafe_instagram_account_id: str | None = None
    mertcafe_instagram_accounts: list[dict[str, str]] | None = None
    mertcafe_use_oauth_account: bool | None = None
