"""
Creative production contracts shared by onboarding, content crews and renderers.

Sprint 0 keeps these as lightweight dataclasses so future CrewAI tasks can emit
structured tenant intelligence without depending on Canva-specific concepts.
"""

from __future__ import annotations

from dataclasses import dataclass, field


CreativePlatform = str
CreativeChannel = str
CreativeIntent = str
CreativeRiskSignal = str
CreativeRiskTier = str
CreativeAssetIntent = str


@dataclass
class CreativeContentNeed:
    id: CreativeIntent
    label: str
    description: str
    default_channels: list[CreativeChannel] = field(default_factory=list)
    default_risk_tier: CreativeRiskTier = "low"
    required_asset_intents: list[CreativeAssetIntent] = field(default_factory=list)


@dataclass
class IndustryPlaybook:
    id: str
    label: str
    default_content_needs: list[CreativeIntent] = field(default_factory=list)
    risky_signals: list[CreativeRiskSignal] = field(default_factory=list)
    approval_required_for: list[CreativeRiskSignal] = field(default_factory=list)
    preferred_channels: list[CreativeChannel] = field(default_factory=list)


@dataclass
class TemplateFamilyContract:
    id: str
    label: str
    intents: list[CreativeIntent] = field(default_factory=list)
    channels: list[CreativeChannel] = field(default_factory=list)
    industries: list[str] = field(default_factory=list)
    required_fields: list[str] = field(default_factory=list)
    optional_fields: list[str] = field(default_factory=list)
    required_asset_intents: list[CreativeAssetIntent] = field(default_factory=list)
    risk_tier: CreativeRiskTier = "low"
    status: str = "draft"


@dataclass
class TenantCreativeProfile:
    tenant_id: str
    industry: str
    office_id: str | None = None
    business_type: str = ""
    platforms: list[CreativePlatform] = field(default_factory=list)
    selected_content_needs: list[CreativeIntent] = field(default_factory=list)
    selected_template_families: list[str] = field(default_factory=list)
    brand_tone: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    default_ctas: list[str] = field(default_factory=list)
    risk_rules: dict[CreativeRiskSignal, str] = field(default_factory=dict)
    customer_visible_summary: str = ""
    system_intelligence: str = ""
    discovery_confidence: int | None = None
    confirmed_at: str | None = None


@dataclass
class CreativeIntentBrief:
    tenant_id: str
    intent: CreativeIntent
    channel: CreativeChannel
    headline: str
    industry: str
    locale: str = "tr-TR"
    office_id: str | None = None
    subtitle: str = ""
    caption: str = ""
    cta: str = ""
    asset_intent: CreativeAssetIntent = ""
    risk_signals: list[CreativeRiskSignal] = field(default_factory=list)
    source: str = "gram_master"


@dataclass
class TemplateDecisionResult:
    template_id: str
    selected_by: str
    score: int
    eligibility: str
    risk_tier: CreativeRiskTier
    approval_required: bool
    template_family_id: str = ""
    reasons: list[str] = field(default_factory=list)
    missing_fields: list[str] = field(default_factory=list)
    validation_warnings: list[str] = field(default_factory=list)

