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


class LanguageUpdateRequest(BaseModel):
    language: str = Field(..., min_length=2, max_length=8)


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
    chatbot_profile: dict | None = None
    chatbot_profile_updated_at: datetime | None = None
    brand_service_profile: dict | None = None
    brand_service_profile_updated_at: datetime | None = None


class BrandAssetRead(OrmBase):
    id: uuid.UUID
    asset_type: str
    file_name: str
    file_path: str
    content_type: str | None
    description: str | None
    created_at: datetime


class BrandPostTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    format: str = Field(default="post", max_length=24)
    status: str = Field(default="active", max_length=24)
    template_kind: str = Field(default="canvas", max_length=32)
    layout_spec: dict = Field(default_factory=dict)
    thumbnail_url: str | None = None
    example_artifact_url: str | None = None


class BrandPostTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    format: str | None = Field(default=None, max_length=24)
    status: str | None = Field(default=None, max_length=24)
    template_kind: str | None = Field(default=None, max_length=32)
    layout_spec: dict | None = None
    thumbnail_url: str | None = None
    example_artifact_url: str | None = None
    increment_usage: bool = False


class BrandPostTemplateRead(OrmBase):
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    format: str
    status: str
    template_kind: str
    layout_spec: dict
    thumbnail_url: str | None
    example_artifact_url: str | None
    usage_count: int
    last_used_at: datetime | None
    created_at: datetime
    updated_at: datetime


# ── Analysis request/response ─────────────────────────────────────────────

class BrandAnalyzeRequest(BaseModel):
    """Request body for POST /api/v1/brand-context/{workspace_id}/analyze"""
    website_url: str = ""
    instagram_handle: str = ""
    google_business_url: str = ""
    menu_url: str = ""
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


class GalleryPhotoAnalysisEntry(BaseModel):
    """Single gallery photo vision analysis — accepts camelCase from Next.js BFF."""

    model_config = {"populate_by_name": True}

    url: str
    description: str = ""
    content_tags: list[str] = Field(default_factory=list, alias="contentTags")
    best_for: list[str] = Field(default_factory=list, alias="bestFor")
    not_good_for: list[str] = Field(default_factory=list, alias="notGoodFor")
    mood: str = "ambient"
    has_people: bool = Field(default=False, alias="hasPeople")
    has_text: bool = Field(default=False, alias="hasText")
    is_logo: bool = Field(default=False, alias="isLogo")
    suggested_asset_type: str = Field(default="venue_reference", alias="suggestedAssetType")
    usage_context: str = Field(default="", alias="usageContext")
    caption_hooks: list[str] = Field(default_factory=list, alias="captionHooks")
    pairing_keywords: list[str] = Field(default_factory=list, alias="pairingKeywords")
    quality_score: float | None = Field(default=None, alias="qualityScore")
    analyzed_at: str | None = Field(default=None, alias="analyzedAt")
    analysis_source: str | None = Field(default=None, alias="analysisSource")


class GalleryAnalysisSaveRequest(BaseModel):
    results: list[GalleryPhotoAnalysisEntry] = Field(default_factory=list)


class GalleryAppendRequest(BaseModel):
    urls: list[str] = Field(min_length=1, max_length=24)


class GalleryMatchStatsRequest(BaseModel):
    scores: list[float] = Field(default_factory=list)


class ReviewSubmitRequest(BaseModel):
    review_id: uuid.UUID
    status: str
    notes: str | None = None
    edited_content: str | None = None
    reviewer_name: str | None = None
