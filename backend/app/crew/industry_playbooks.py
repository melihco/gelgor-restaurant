"""Industry playbooks for tenant discovery and creative production."""

from __future__ import annotations

from app.crew.creative_profile import IndustryPlaybook


INDUSTRY_PLAYBOOKS: dict[str, IndustryPlaybook] = {
    "restaurant_cafe": IndustryPlaybook(
        id="restaurant_cafe",
        label="Restaurant / Cafe",
        default_content_needs=[
            "menu_share",
            "campaign_offer",
            "event_announcement",
            "daily_story",
            "social_proof",
            "behind_the_scenes",
        ],
        risky_signals=["price", "discount", "date", "location", "limited_availability"],
        approval_required_for=["price", "discount", "date"],
        preferred_channels=["instagram_story", "instagram_post", "instagram_reel", "google_business_update"],
    ),
    "beauty_wellness": IndustryPlaybook(
        id="beauty_wellness",
        label="Beauty / Wellness",
        default_content_needs=[
            "service_intro",
            "campaign_offer",
            "social_proof",
            "educational_post",
            "behind_the_scenes",
            "lead_generation",
        ],
        risky_signals=["before_after", "personal_data", "discount", "health_claim"],
        approval_required_for=["before_after", "personal_data", "health_claim"],
        preferred_channels=["instagram_story", "instagram_reel", "instagram_post"],
    ),
    "healthcare_clinic": IndustryPlaybook(
        id="healthcare_clinic",
        label="Healthcare / Clinic",
        default_content_needs=["educational_post", "service_intro", "social_proof", "lead_generation"],
        risky_signals=["regulated_industry", "health_claim", "before_after", "personal_data"],
        approval_required_for=["health_claim", "before_after", "personal_data"],
        preferred_channels=["instagram_carousel", "instagram_post", "google_business_update"],
    ),
    "real_estate": IndustryPlaybook(
        id="real_estate",
        label="Real Estate",
        default_content_needs=[
            "product_highlight",
            "lead_generation",
            "educational_post",
            "social_proof",
            "campaign_offer",
        ],
        risky_signals=["price", "location", "financial_claim", "limited_availability"],
        approval_required_for=["price", "location", "financial_claim"],
        preferred_channels=["instagram_post", "instagram_carousel", "meta_ad_creative"],
    ),
    "ecommerce_retail": IndustryPlaybook(
        id="ecommerce_retail",
        label="Ecommerce / Retail",
        default_content_needs=[
            "product_highlight",
            "campaign_offer",
            "seasonal_content",
            "social_proof",
            "ad_creative",
        ],
        risky_signals=["price", "discount", "limited_availability", "user_generated_content"],
        approval_required_for=["price", "discount"],
        preferred_channels=["instagram_post", "instagram_story", "meta_ad_creative"],
    ),
    "agency_services": IndustryPlaybook(
        id="agency_services",
        label="Agency / Professional Services",
        default_content_needs=["service_intro", "educational_post", "social_proof", "lead_generation"],
        risky_signals=["financial_claim", "legal_claim"],
        approval_required_for=["financial_claim", "legal_claim"],
        preferred_channels=["linkedin_post", "instagram_carousel", "meta_ad_creative"],
    ),
    "local_service_business": IndustryPlaybook(
        id="local_service_business",
        label="Local Service Business",
        default_content_needs=[
            "service_intro",
            "lead_generation",
            "social_proof",
            "educational_post",
            "google_business_update",
        ],
        risky_signals=["price", "location", "personal_data"],
        approval_required_for=["price", "personal_data"],
        preferred_channels=["google_business_update", "instagram_post", "meta_ad_creative"],
    ),
    "local_products_shop": IndustryPlaybook(
        id="local_products_shop",
        label="Yöresel / Yerel Ürün Dükkanı",
        default_content_needs=[
            "product_highlight",
            "producer_story",
            "behind_the_scenes",
            "educational_post",
            "seasonal_availability",
            "social_proof",
            "tasting_experience",
            "daily_story",
        ],
        risky_signals=["price", "health_claim", "origin_claim"],
        approval_required_for=["price", "health_claim"],
        preferred_channels=["instagram_post", "instagram_story", "instagram_reel"],
    ),
    "beach_club": IndustryPlaybook(
        id="beach_club",
        label="Beach Club / Bar",
        default_content_needs=[
            "daily_story",
            "event_announcement",
            "campaign_offer",
            "social_proof",
            "behind_the_scenes",
        ],
        risky_signals=["price", "date", "limited_availability", "alcohol"],
        approval_required_for=["price", "date", "alcohol"],
        preferred_channels=["instagram_story", "instagram_reel", "instagram_post"],
    ),
}


INDUSTRY_ALIASES = {
    "restaurant": "restaurant_cafe",
    "coffee_shop": "restaurant_cafe",
    "cafe": "restaurant_cafe",
    "hospitality": "restaurant_cafe",
    "hospitality_entertainment": "restaurant_cafe",
    "beauty": "beauty_wellness",
    "wellness": "beauty_wellness",
    "health": "healthcare_clinic",
    "healthcare": "healthcare_clinic",
    "clinic": "healthcare_clinic",
    "medical": "healthcare_clinic",
    "real_estate": "real_estate",
    "property": "real_estate",
    "ecommerce": "ecommerce_retail",
    "retail": "ecommerce_retail",
    "handmade_product_brand": "ecommerce_retail",
    "agency": "agency_services",
    "web_agency": "agency_services",
    "production_company": "agency_services",
    "service": "local_service_business",
    "general_business": "local_service_business",
    # Local products / artisan food
    "local_products": "local_products_shop",
    "yöresel_ürün": "local_products_shop",
    "yoresel_urun": "local_products_shop",
    "artisan_food": "local_products_shop",
    "food_retail": "local_products_shop",
    "local_food_shop": "local_products_shop",
    "grocery": "local_products_shop",
    # Beach / bar
    "bar": "beach_club",
    "nightclub": "beach_club",
    "club": "beach_club",
}


def normalize_industry_id(industry: str) -> str:
    value = (industry or "").strip().lower().replace(" ", "_").replace("/", "_")
    return INDUSTRY_ALIASES.get(value, value if value in INDUSTRY_PLAYBOOKS else "local_service_business")


def get_industry_playbook(industry: str) -> IndustryPlaybook:
    return INDUSTRY_PLAYBOOKS[normalize_industry_id(industry)]


def merge_playbook_content_needs(industry: str, inferred_needs: list[str]) -> list[str]:
    playbook = get_industry_playbook(industry)
    return list(dict.fromkeys([*playbook.default_content_needs, *inferred_needs]))[:8]


def risk_rules_for_industry(industry: str) -> dict[str, str]:
    playbook = get_industry_playbook(industry)
    rules = {signal: "allow" for signal in playbook.risky_signals}
    for signal in playbook.approval_required_for:
        rules[signal] = "approval_required"
    if "personal_data" in playbook.risky_signals and "personal_data" not in rules:
        rules["personal_data"] = "approval_required"
    return rules


def template_families_for(industry: str, content_needs: list[str]) -> list[str]:
    playbook_id = normalize_industry_id(industry)
    channel_by_need = {
        "campaign_offer": "story",
        "event_announcement": "story",
        "menu_share": "post",
        "product_highlight": "post",
        "service_intro": "post",
        "educational_post": "carousel",
        "social_proof": "post",
        "review_response": "post",
        "daily_story": "story",
        "behind_the_scenes": "story",
        "lead_generation": "ad",
        "seasonal_content": "post",
        "ad_creative": "ad",
        "google_business_update": "gbp",
    }
    return [
        f"{playbook_id}.{need}.{channel_by_need.get(need, 'post')}"
        for need in content_needs
    ]

