from __future__ import annotations

from pydantic import BaseModel, Field


class InternalBrandContext(BaseModel):
    # ── Core identity (pre-existing — .NET always sends these) ───────────
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
    asset_descriptions: list[str] = Field(default_factory=list)

    # ── Discovery intelligence (added 2025-05-07 — optional, .NET may not send yet) ─
    # All fields have safe defaults so existing .NET callers are not broken.
    content_pillars: list[str] = Field(default_factory=list)
    default_ctas: list[str] = Field(default_factory=list)
    risk_rules: dict[str, str] = Field(default_factory=dict)
    instagram_top_hashtags: list[str] = Field(default_factory=list)
    website_summary: str = ""
    instagram_bio: str = ""
    discovery_confidence: int | None = None
    brand_constitution_confirmed: bool = False
    reference_image_urls: list[str] = Field(default_factory=list)
    google_rating: str = ""
    google_review_count: int | None = None
    google_review_signals: list[dict] = Field(default_factory=list)
    learning_context: str = ""
    visual_dna: str = ""
    competitor_brief: str = ""
    trend_brief: str = ""
    tripadvisor_reviews: str = ""
    location_posts: str = ""
    google_trends: str = ""
    gallery_analysis: str = ""


class InternalAgentExecutionRequest(BaseModel):
    tenant_id: str
    office_id: str
    agent_role: str
    task_type: str
    input_data: dict = Field(default_factory=dict)
    brand_context: InternalBrandContext
    correlation_id: str | None = None


class InternalAgentExecutionResponse(BaseModel):
    status: str
    agent_role: str
    task_type: str
    artifact_type: str
    artifact_title: str
    content: str
    summary: str | None = None
    metadata: dict = Field(default_factory=dict)
    correlation_id: str | None = None
    # Structured action payload — agent bazında ayıklanmış aksiyon verisi
    action_payload: dict | None = None
    # CrewAI LLM usage (prompt+completion); 0 if provider did not report usage
    tokens_used: int = 0
