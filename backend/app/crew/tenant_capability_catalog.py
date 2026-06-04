"""Tenant capability catalog and gallery policy defaults — mirrors web tenant-operating-policy."""

from __future__ import annotations

from dataclasses import dataclass, field

PolicyDecision = str  # allow | approval_required | blocked


@dataclass(frozen=True)
class TenantCapabilityDefinition:
    id: str
    kind: str  # content_intent | workflow
    label: str
    description: str
    industries: tuple[str, ...] = ()
    default_enabled: bool = False
    risk_signals: tuple[str, ...] = ()
    required_asset_intents: tuple[str, ...] = ()
    requires: tuple[str, ...] = ()


@dataclass
class TenantGalleryPolicy:
    allowed_asset_intents: list[str] = field(default_factory=list)
    client_photo_policy: str = "approval_required"
    before_after_policy: str = "approval_required"
    max_gallery_photos: int = 48
    require_consent_metadata: bool = False


BARBER_SALON_PLAYBOOK_ID = "barber_salon"

INDUSTRY_ALIASES: dict[str, str] = {
    "restaurant": "restaurant_cafe",
    "coffee_shop": "restaurant_cafe",
    "cafe": "restaurant_cafe",
    "barber": BARBER_SALON_PLAYBOOK_ID,
    "barbershop": BARBER_SALON_PLAYBOOK_ID,
    "hairdresser": BARBER_SALON_PLAYBOOK_ID,
    "kuaför": BARBER_SALON_PLAYBOOK_ID,
    "kuafor": BARBER_SALON_PLAYBOOK_ID,
    "berber": BARBER_SALON_PLAYBOOK_ID,
    "salon": "beauty_wellness",
    "beauty": "beauty_wellness",
}

CLIENT_ASSET_TYPES = frozenset({
    "client_photo",
    "client_result",
    "service_result",
    "customer_photo",
    "expert_photo",
})

BEFORE_AFTER_ASSET_TYPES = frozenset({
    "before_after",
    "before_after_image",
})

WORKFLOW_CAPABILITIES: tuple[TenantCapabilityDefinition, ...] = (
    TenantCapabilityDefinition(
        id="workflow_post_service_client_share",
        kind="workflow",
        label="İşlem sonrası müşteri paylaşımı",
        description="Traş/kesim sonrası müşteriye özel paylaşım akışı.",
        industries=("beauty_wellness", BARBER_SALON_PLAYBOOK_ID, "local_service_business"),
        risk_signals=("personal_data", "before_after"),
        required_asset_intents=("expert_photo", "before_after_image"),
        requires=("post_service_client_result", "gallery_client_upload"),
    ),
    TenantCapabilityDefinition(
        id="gallery_manage",
        kind="workflow",
        label="Galeri yönetimi",
        description="Mekan ve marka görselleri.",
        default_enabled=True,
        required_asset_intents=("venue_photo", "hero_image", "product_image"),
    ),
    TenantCapabilityDefinition(
        id="gallery_client_upload",
        kind="workflow",
        label="Müşteri / sonuç fotoğrafı",
        description="Müşteri veya hizmet sonucu görselleri.",
        industries=("beauty_wellness", BARBER_SALON_PLAYBOOK_ID, "healthcare_clinic", "local_service_business"),
        risk_signals=("personal_data",),
        required_asset_intents=("expert_photo", "before_after_image"),
    ),
    TenantCapabilityDefinition(
        id="gallery_before_after",
        kind="workflow",
        label="Önce / sonra görselleri",
        description="Before/after karşılaştırma.",
        industries=("beauty_wellness", BARBER_SALON_PLAYBOOK_ID, "healthcare_clinic"),
        risk_signals=("before_after", "health_claim"),
        required_asset_intents=("before_after_image",),
    ),
)

EXTRA_CONTENT_CAPABILITIES: tuple[TenantCapabilityDefinition, ...] = (
    TenantCapabilityDefinition(
        id="post_service_client_result",
        kind="content_intent",
        label="Hizmet sonucu paylaşımı",
        description="İşlem sonrası müşteri sonucu paylaşımı.",
        industries=("beauty_wellness", BARBER_SALON_PLAYBOOK_ID, "local_service_business"),
        risk_signals=("personal_data", "before_after"),
        required_asset_intents=("expert_photo", "before_after_image"),
    ),
)

GALLERY_POLICY_BY_INDUSTRY: dict[str, TenantGalleryPolicy] = {
    "restaurant_cafe": TenantGalleryPolicy(
        allowed_asset_intents=["venue_photo", "hero_image", "product_image", "brand_background", "logo", "team_photo"],
        client_photo_policy="blocked",
        before_after_policy="blocked",
        max_gallery_photos=48,
    ),
    "beauty_wellness": TenantGalleryPolicy(
        allowed_asset_intents=[
            "venue_photo", "hero_image", "expert_photo", "before_after_image",
            "brand_background", "logo", "team_photo",
        ],
        client_photo_policy="approval_required",
        before_after_policy="approval_required",
        max_gallery_photos=64,
        require_consent_metadata=True,
    ),
    BARBER_SALON_PLAYBOOK_ID: TenantGalleryPolicy(
        allowed_asset_intents=[
            "venue_photo", "hero_image", "expert_photo", "before_after_image",
            "brand_background", "logo", "team_photo",
        ],
        client_photo_policy="approval_required",
        before_after_policy="approval_required",
        max_gallery_photos=72,
        require_consent_metadata=True,
    ),
    "healthcare_clinic": TenantGalleryPolicy(
        allowed_asset_intents=["venue_photo", "hero_image", "expert_photo", "brand_background", "logo"],
        client_photo_policy="blocked",
        before_after_policy="approval_required",
        max_gallery_photos=40,
        require_consent_metadata=True,
    ),
}

DEFAULT_GALLERY_POLICY = TenantGalleryPolicy(
    allowed_asset_intents=["venue_photo", "hero_image", "product_image", "brand_background", "logo"],
    client_photo_policy="approval_required",
    before_after_policy="approval_required",
)


def normalize_industry_id(industry: str) -> str:
    from app.crew.industry_playbooks import INDUSTRY_PLAYBOOKS, normalize_industry_id as base_normalize

    value = (industry or "").strip().lower().replace(" ", "_").replace("/", "_")
    aliased = INDUSTRY_ALIASES.get(value, value)
    if aliased in INDUSTRY_PLAYBOOKS or aliased == BARBER_SALON_PLAYBOOK_ID:
        return aliased
    return base_normalize(industry)


def gallery_policy_for_industry(industry: str) -> TenantGalleryPolicy:
    key = normalize_industry_id(industry)
    base = GALLERY_POLICY_BY_INDUSTRY.get(key) or DEFAULT_GALLERY_POLICY
    return TenantGalleryPolicy(
        allowed_asset_intents=list(base.allowed_asset_intents),
        client_photo_policy=base.client_photo_policy,
        before_after_policy=base.before_after_policy,
        max_gallery_photos=base.max_gallery_photos,
        require_consent_metadata=base.require_consent_metadata,
    )


def list_capabilities_for_industry(industry: str) -> list[TenantCapabilityDefinition]:
    playbook_id = normalize_industry_id(industry)
    caps = list(WORKFLOW_CAPABILITIES) + list(EXTRA_CONTENT_CAPABILITIES)
    return [c for c in caps if not c.industries or playbook_id in c.industries]
