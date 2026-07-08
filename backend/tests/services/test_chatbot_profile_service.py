"""Tests for chatbot_profile_service — sector-aware, no Karaman hardcoding."""

from __future__ import annotations

import uuid
from types import SimpleNamespace

from app.services.chatbot_profile_service import (
    analyze_chatbot_profile,
    is_valid_category_name,
)


def _ctx(**overrides):
    """Minimal BrandContext-like object for analyze_chatbot_profile."""
    base = dict(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        business_name="Test Brand",
        business_type="general_business",
        description="",
        brand_tone="samimi",
        visual_style="",
        target_audience="",
        location="",
        languages="tr",
        website_url="",
        instagram_handle="",
        website_summary="",
        instagram_bio="",
        content_pillars="[]",
        website_intelligence=None,
        brand_service_profile=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def test_is_valid_category_name_rejects_font_garbage():
    assert is_valid_category_name("wOF2\x00\x01binarygarbage") is False
    assert is_valid_category_name("application/font-woff2") is False
    assert is_valid_category_name("# Başlık") is False
    assert is_valid_category_name("ab") is False
    assert is_valid_category_name("Mezeler") is True
    assert is_valid_category_name("Ana Yemekler") is True


def test_gel_gor_restaurant_no_ecommerce_leaks():
    """Gel Gör Restaurant must not get Karaman/e-commerce defaults."""
    profile = analyze_chatbot_profile(_ctx(
        business_name="Gel Gör Restaurant",
        business_type="restaurant_cafe",
        website_url="https://gelgor.vercel.app",
        location="Datça, Muğla",
        description="Datça'da taze deniz ürünleri ve mevsimsel menü.",
        website_summary=(
            "Gel Gör Restaurant, Datça'nın kalbinde.\n\n"
            "Telefon: +90 539 700 74 68\n"
            "Rezervasyon için arayın."
        ),
        brand_service_profile={
            "category": "restaurant_bar",
            "cta_style": "reservation",
            "primary_ctas": ["Rezervasyon Yap"],
        },
        website_intelligence={
            "brand_display_name": "Gel Gör Restaurant",
            "menu_catalog": {
                "categories": [
                    {"name": "Mezeler", "items": [{"name": "Atom"}, {"name": "Haydari"}]},
                    {"name": "wOF2\x01fontbinarypayload", "image_count": 1},
                    {"name": "Ana Yemekler", "items": [{"name": "Levrek Izgara"}]},
                    {"name": "# Markdown Header", "image_count": 0},
                ],
            },
        },
    ))

    assert profile.business_display_name == "Gel Gör Restaurant"
    assert profile.website_url == "https://gelgor.vercel.app"
    assert "karamandatca" not in (profile.order_process or "").lower()
    assert profile.shipping_policy == ""
    assert "kargo" not in (profile.menu_summary or "").lower()
    assert "wOF2" not in profile.menu_summary
    assert profile.phone.replace(" ", "") in ("+905397007468", "05397007468", "+90 539 700 74 68".replace(" ", "")) or "539" in profile.phone
    assert "539" in profile.phone
    assert "700" in profile.phone
    assert "7468" in profile.phone.replace(" ", "")

    cat_names = {c.name for c in profile.product_categories}
    assert "Mezeler" in cat_names
    assert "Ana Yemekler" in cat_names
    assert not any("wOF2" in n for n in cat_names)
    assert "# Markdown Header" not in cat_names

    assert "rezervasyon" in profile.order_process.lower()
    assert "kargo" not in " ".join(f.question + f.answer for f in profile.faqs).lower() or profile.shipping_policy == ""
    assert "Datça'nın yöresel ve doğal ürünlerini online satışa sunar" not in profile.menu_summary


def test_ecommerce_uses_tenant_website_not_karaman():
    profile = analyze_chatbot_profile(_ctx(
        business_name="Datça Organik",
        business_type="local_products_shop",
        website_url="https://datcaorganik.com.tr",
        website_summary="2500 TL üzeri siparişlerde kargo ücretsiz.",
        brand_service_profile={
            "category": "local_products_shop",
            "cta_style": "ecommerce",
        },
        website_intelligence={
            "menu_catalog": {
                "categories": [{"name": "Reçeller", "image_count": 5}],
            },
        },
    ))

    assert "karamandatca" not in (profile.order_process or "").lower()
    assert "datcaorganik.com.tr" in profile.order_process
    assert profile.shipping_policy != ""
    assert "kargo" in profile.shipping_policy.lower() or "2500" in profile.shipping_policy


def test_restaurant_menu_summary_from_description_and_catalog():
    profile = analyze_chatbot_profile(_ctx(
        business_name="Sahil Restoran",
        business_type="restaurant_cafe",
        description="Deniz manzaralı bir restoran.",
        brand_service_profile={"category": "restaurant_bar", "cta_style": "reservation"},
        website_intelligence={
            "menu_catalog": {
                "categories": [
                    {"name": "Balıklar", "items": [{"name": "Çipura"}]},
                ],
            },
        },
    ))

    assert "Deniz manzaralı" in profile.menu_summary
    assert "Balıklar" in profile.menu_summary
    assert "Çipura" in profile.menu_summary
    assert "online satışa sunar" not in profile.menu_summary


def test_phone_extracted_from_instagram_bio():
    profile = analyze_chatbot_profile(_ctx(
        business_name="Kafe",
        business_type="coffee_shop",
        instagram_bio="☕ Kahve | 📍 Datça | ☎ 0532 111 22 33",
        brand_service_profile={"category": "cafe_bakery", "cta_style": "visit"},
    ))
    assert "532" in profile.phone
    assert "111" in profile.phone
