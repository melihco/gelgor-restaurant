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


# ── Request / Response wrappers ───────────────────────────────────────────────

class BrandThemeRead(BaseModel):
    theme: BrandTheme | None = None
    updated_at: datetime | None = None


class BrandThemeSaveRequest(BaseModel):
    """Manual override — operator patches specific token fields."""
    theme: BrandTheme
