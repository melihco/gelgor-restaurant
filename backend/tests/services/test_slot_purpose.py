"""Slot purpose locks captions to the catalog job — two sectors minimum."""
from __future__ import annotations

from app.crew.caption_headline_pair import apply_caption_headline_pair
from app.services.slot_purpose import (
    align_idea_to_slot_purpose,
    bind_selected_gallery_to_analysis,
    caption_hits_slot_purpose,
    catalog_slot_purpose_key,
    resolve_slot_purpose,
    slot_purpose_job,
)


def test_purpose_key_strips_sector_prefix():
    assert catalog_slot_purpose_key(
        "local_products_shop_weekend_hours_story"
    ) == "weekend_hours_story"
    assert catalog_slot_purpose_key(
        "restaurant_cafe_farm_to_table_story"
    ) == "farm_to_table_story"


def test_weekend_hours_and_farm_visit_jobs_exist():
    shop = resolve_slot_purpose("local_products_shop_weekend_hours_story")
    resto = resolve_slot_purpose("restaurant_cafe_farm_to_table_story")
    assert shop and "saat" in shop["tokens"]
    assert resto and "ciftlik" in resto["tokens"]
    assert "saat" in slot_purpose_job("local_products_shop_weekend_hours_story").lower()


def test_atmosphere_caption_misses_weekend_hours():
    assert caption_hits_slot_purpose(
        "Dükkanımızda hoş bir atmosfer var! Sen de bu doğal lezzetleri keşfetmeye gel!",
        "local_products_shop_weekend_hours_story",
    ) is False
    assert caption_hits_slot_purpose(
        "Hafta sonu 10-18 açığız. Zeytinyağı tadımı için bekleriz.",
        "local_products_shop_weekend_hours_story",
    ) is True


def test_review_caption_misses_farm_visit():
    assert caption_hits_slot_purpose(
        "Müşterilerimiz çam balımızı çok seviyor! Hemen sipariş ver.",
        "local_products_shop_farm_visit_story",
    ) is False
    assert caption_hits_slot_purpose(
        "Çiftlikte erken hasat başladı. Zeytinlikten geliyoruz.",
        "local_products_shop_farm_visit_story",
    ) is True


def test_align_rewrites_off_slot_shop_and_restaurant():
    shop = {
        "catalog_slot_key": "local_products_shop_weekend_hours_story",
        "headline": "atmosferde doğal lezzetler!",
        "caption_draft": "Dükkanımızda hoş bir atmosfer var! Keşfetmeye gel!",
    }
    assert align_idea_to_slot_purpose(shop) is True
    assert caption_hits_slot_purpose(shop["caption_draft"], shop["catalog_slot_key"])
    assert shop["overlay_headline_source"] == "caption_pair"
    assert "hafta sonu" in shop["caption_draft"].lower()
    assert not shop["headline"].lower().startswith("hafta sonu")

    resto = {
        "catalog_slot_key": "restaurant_cafe_farm_to_table_story",
        "headline": "Lezzet dolu anlar",
        "caption_draft": "Raftaki kavanozlar sizi bekliyor.",
    }
    assert align_idea_to_slot_purpose(resto) is True
    assert "çiftlik" in resto["caption_draft"].lower() or "hasat" in resto["caption_draft"].lower()
    assert resto["overlay_headline_source"] == "caption_pair"


def test_align_uses_english_opening_for_en_shop_and_beach():
    shop = {
        "catalog_slot_key": "local_products_shop_weekend_hours_story",
        "headline": "flavors in the air",
        "caption_draft": "Nice atmosphere in the shop. Come taste.",
    }
    beach = {
        "catalog_slot_key": "beach_club_weekend_hours_story",
        "headline": "sunset on the terrace",
        "caption_draft": "Sunset vibes on the terrace.",
    }

    class EnBrand:
        languages = "en"

    assert align_idea_to_slot_purpose(shop, EnBrand()) is True
    assert shop["caption_draft"].startswith("We're open this weekend.")
    assert "Hafta sonu" not in shop["caption_draft"]

    assert align_idea_to_slot_purpose(beach, EnBrand()) is True
    assert beach["caption_draft"].startswith("We're open this weekend.")
    assert "Hafta sonu" not in beach["caption_draft"]


def test_align_keeps_turkish_opening_when_languages_empty():
    shop = {
        "catalog_slot_key": "local_products_shop_weekend_hours_story",
        "headline": "atmosferde doğal lezzetler!",
        "caption_draft": "Dükkanımızda hoş bir atmosfer var! Keşfetmeye gel!",
    }
    assert align_idea_to_slot_purpose(shop) is True
    assert shop["caption_draft"].lower().startswith("hafta sonu")


def test_align_keeps_on_slot_caption():
    idea = {
        "catalog_slot_key": "local_products_shop_customer_favorite_post",
        "headline": "Müşterilerimiz çam balımızı çok seviyor",
        "caption_draft": "Müşterilerimiz çam balımızı çok seviyor! Doğal ve katkısız.",
    }
    assert align_idea_to_slot_purpose(idea) is False
    assert idea["caption_draft"].startswith("Müşterilerimiz")


def test_caption_pair_marks_source():
    idea = apply_caption_headline_pair({
        "headline": "Zeytin hasadını kutlayın",
        "caption_draft": "Zeytin hasadı başladı! Soğuk sıkım bu hafta raflarda.",
    })
    assert idea["overlay_headline_source"] == "caption_pair"


def test_bind_gallery_url_to_website_analysis_key():
    idea = {
        "selected_gallery_url": "/api/media?key=tenant/image/2026-03/honey.jpg",
        "visual_production_spec": {
            "selected_gallery_url": "/api/media?key=tenant/image/2026-03/honey.jpg",
        },
    }
    ga = {
        "https://shop.example.com/wp-content/uploads/2026/03/honey.jpg": {
            "primarySubject": "honey",
        },
    }
    assert bind_selected_gallery_to_analysis(idea, ga)
    assert idea["gallery_analysis_key"].endswith("honey.jpg")
