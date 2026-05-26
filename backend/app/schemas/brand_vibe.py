"""
Brand Vibe Profile schemas — agency-grade visual + voice DNA.

Extracted from reference Instagram accounts (e.g. @thesummerroom.co) via
GPT-4o Vision on R2-mirrored sample images. Drives render pipeline directives.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# ── Sub-schemas (mirror of the JSON the Vision model returns) ──────────────


class VibePalette(BaseModel):
    primary: str = Field(..., description="hex e.g. #f5a25d")
    accent: str
    neutral: str
    shadow: str
    palette_description: str


class VibeTypography(BaseModel):
    heading_personality: str
    body_personality: str
    text_overlay_density: Literal["minimal", "medium", "dense"]
    typography_role: str


class VibeMotion(BaseModel):
    pace: Literal["slow_observational", "rhythmic", "kinetic"]
    cuts_per_10_seconds_estimate: float
    camera_movement: str
    shot_grammar: str


class VibeGrading(BaseModel):
    look: str  # free-form, matches the enum suggested in extraction prompt
    lut_directive: str


class VibeAudio(BaseModel):
    mood: str
    description: str


class VibeComposition(BaseModel):
    primary_pattern: str
    framing_rules: str
    subject_focus: str


class VibeCaptionVoice(BaseModel):
    style: str | None = None
    avg_word_count: float | None = None
    uses_emojis: bool | None = None
    uses_hashtags_in_caption_body: bool | None = None
    punctuation_style: str | None = None
    tonal_anchors: list[str] = Field(default_factory=list)
    writing_rules: list[str] = Field(default_factory=list)
    example_template: str | None = None


class VibeReferenceFrame(BaseModel):
    url: str
    source_account: str
    why_representative: str | None = None


# ── Aggregate ──────────────────────────────────────────────────────────────


class BrandVibeProfile(BaseModel):
    """Persisted on brand_contexts.brand_vibe_profile (JSONB)."""

    source_accounts: list[str] = Field(default_factory=list)
    extracted_at: datetime | None = None
    image_sample_count: int = 0
    caption_sample_count: int = 0

    palette: VibePalette | None = None
    typography: VibeTypography | None = None
    motion: VibeMotion | None = None
    grading: VibeGrading | None = None
    audio: VibeAudio | None = None
    composition: VibeComposition | None = None
    caption_voice: VibeCaptionVoice | None = None

    content_pillars_visual: list[str] = Field(default_factory=list)
    anti_patterns: list[str] = Field(default_factory=list)
    what_makes_this_agency_level: str | None = None

    reference_frames: list[VibeReferenceFrame] = Field(default_factory=list)


# ── Request/response wrappers ──────────────────────────────────────────────


class ScrapeRefAccountsRequest(BaseModel):
    """Step 1: scrape Apify for a list of reference IG handles."""

    handles: list[str] = Field(..., min_length=1, max_length=5)
    posts_per_handle: int = 12


class ScrapeRefAccountsResponse(BaseModel):
    handles: list[str]
    image_urls: list[str]
    captions: list[str]
    fetch_errors: dict[str, str] = Field(default_factory=dict)


class BrandVibeSaveRequest(BaseModel):
    """Step 3: persist the AI-extracted profile."""

    vibe: BrandVibeProfile


class BrandVibeRead(BaseModel):
    vibe: BrandVibeProfile | None = None
    updated_at: datetime | None = None
