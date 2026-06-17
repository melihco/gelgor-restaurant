from __future__ import annotations

import uuid
from datetime import datetime
from pydantic import BaseModel, Field

from app.schemas.common import OrmBase


class BrandContextCreate(BaseModel):
    business_name: str
    business_type: str
    description: str | None = None
    brand_tone: str | None = None
    visual_style: str | None = None
    target_audience: str | None = None
    location: str | None = None
    languages: str = "tr"
    campaign_goals: str | None = None
    competitors: str | None = None
    custom_rules: str | None = None
    keywords: str | None = None
    # Discovery fields (optional on create)
    website_url: str | None = None
    instagram_handle: str | None = None
    google_business_url: str | None = None


class BrandContextUpdate(BaseModel):
    business_name: str | None = None
    business_type: str | None = None
    description: str | None = None
    brand_tone: str | None = None
    visual_style: str | None = None
    target_audience: str | None = None
    location: str | None = None
    languages: str | None = None
    campaign_goals: str | None = None
    competitors: str | None = None
    custom_rules: str | None = None
    keywords: str | None = None
    # Discovery source URLs
    website_url: str | None = None
    instagram_handle: str | None = None
    google_business_url: str | None = None
    # Discovery output (stored as JSON text)
    content_pillars: str | None = None
    default_ctas: str | None = None
    risk_rules: str | None = None
    instagram_top_hashtags: str | None = None
    website_summary: str | None = None
    instagram_bio: str | None = None
    reference_image_urls: str | None = None
    google_review_signals: str | None = None
    google_rating: str | None = None
    google_review_count: int | None = None
    visual_dna: str | None = None
    competitor_brief: str | None = None
    trend_brief: str | None = None
    trend_brief_updated_at: str | None = None
    tripadvisor_reviews: str | None = None
    location_posts: str | None = None
    google_trends: str | None = None
    extended_intelligence_updated_at: str | None = None
    suggested_competitors: str | None = None
    # Discovery metadata
    discovery_confidence: int | None = None
    last_brand_analysis_at: datetime | None = None
    brand_constitution_confirmed_at: datetime | None = None
    logo_url: str | None = None
    brand_primary_color: str | None = None
    brand_accent_color: str | None = None
    brand_font_family: str | None = None


class BrandContextRead(OrmBase):
    id: uuid.UUID
    workspace_id: uuid.UUID
    business_name: str
    business_type: str
    description: str | None
    brand_tone: str | None
    visual_style: str | None
    target_audience: str | None
    location: str | None
    languages: str
    campaign_goals: str | None
    competitors: str | None
    custom_rules: str | None
    keywords: str | None
    # Discovery fields
    website_url: str | None = None
    instagram_handle: str | None = None
    google_business_url: str | None = None
    content_pillars: str | None = None
    default_ctas: str | None = None
    risk_rules: str | None = None
    instagram_top_hashtags: str | None = None
    website_summary: str | None = None
    instagram_bio: str | None = None
    reference_image_urls: str | None = None
    # Sprint 1: Google Business signals
    google_review_signals: str | None = None
    google_rating: str | None = None
    google_review_count: int | None = None
    # Sprint 1: Visual DNA (GPT-4o Vision analysis)
    visual_dna: str | None = None
    # Sprint 2: Competitor Intelligence
    competitor_brief: str | None = None
    # Sprint 3: Seasonal/Trend Intelligence
    trend_brief: str | None = None
    trend_brief_updated_at: str | None = None
    # Extended intelligence (migration 0012)
    tripadvisor_reviews: str | None = None
    location_posts: str | None = None
    google_trends: str | None = None
    extended_intelligence_updated_at: str | None = None
    # AI-suggested competitors (migration 0013)
    suggested_competitors: str | None = None
    # Brand logo URL (official logo from website/Instagram)
    logo_url: str | None = None
    # Brand design identity (colors)
    brand_primary_color: str | None = None
    brand_accent_color: str | None = None
    # Agency-grade reference DNA (migration 0014)
    brand_vibe_profile: dict | None = None
    brand_vibe_profile_updated_at: datetime | None = None
    # Metadata
    discovery_confidence: int | None = None
    last_brand_analysis_at: datetime | None = None
    brand_constitution_confirmed_at: datetime | None = None
    created_at: datetime


class BrandAssetRead(OrmBase):
    id: uuid.UUID
    asset_type: str
    file_name: str
    file_path: str
    content_type: str | None
    description: str | None
    created_at: datetime


# ── Analysis request/response ─────────────────────────────────────────────

class BrandAnalyzeRequest(BaseModel):
    """Request body for POST /api/v1/brand-context/{workspace_id}/analyze"""
    website_url: str = ""
    instagram_handle: str = ""
    google_business_url: str = ""
    brand_name: str = ""


class ConfirmConstitutionRequest(BaseModel):
    auto_confirmed: bool = False
    synthesize_dna: bool = True


class SourceStatus(BaseModel):
    attempted: bool = False
    ok: bool = False
    error: str | None = None
    data_points: list[str] = Field(default_factory=list)


class BrandAnalyzeResponse(BaseModel):
    success: bool
    sources: dict[str, dict] = Field(default_factory=dict)
    confidence: int
    inferred_tone: str
    inferred_language: str
    inferred_industry: str
    content_pillars: list[str]
    default_ctas: list[str]
    risk_rules: dict[str, str]
    instagram_top_hashtags: list[str]
    website_summary: str
    instagram_bio: str
    missing_signals: list[str]
    brand_context: BrandContextRead
    reference_image_urls: list[str] = Field(default_factory=list)
