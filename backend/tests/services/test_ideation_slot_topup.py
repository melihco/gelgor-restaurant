"""
The ideation top-up has to know which deliverables are still open.

A 16-slot Gel Gör package came back with the first eleven slots written
correctly and the tail filled by re-using four slot keys while four planned
slots went uncovered. The top-up was told "2 more posts, 1 more story" and
nothing about the plan, so it wrote "Müşterilerimiz Değerlendiriyor!" for the
dining-ambiance slot and repeated `farm_to_table_story` twice.
"""
from __future__ import annotations

from app.crew.crews.content_crew import _open_catalog_slots
from app.services.mission_ideation_merge import (
    dedupe_ideation_by_headline,
    headlines_match,
)

RESTAURANT_PLAN = [
    {"slot_key": "restaurant_cafe_brunch_offer_post", "label_tr": "Brunch teklifi", "format": "post"},
    {"slot_key": "restaurant_cafe_kitchen_bts_story", "label_tr": "Mutfak kulis story", "format": "story"},
    {"slot_key": "restaurant_cafe_dining_ambiance_post", "label_tr": "Yemek atmosferi", "format": "post"},
    {"slot_key": "restaurant_cafe_chef_plating_reel", "label_tr": "Şef plating reel", "format": "reel"},
]

SHOP_PLAN = [
    {"slot_key": "local_products_shop_gift_bundle_post", "label_tr": "Hediye paketi", "format": "post"},
    {"slot_key": "local_products_shop_maker_story_post", "label_tr": "Üretici hikayesi", "format": "post"},
    {"slot_key": "local_products_shop_craft_process_reel", "label_tr": "El işi süreç reel", "format": "reel"},
]


class TestOpenCatalogSlots:
    def test_reports_the_restaurant_slots_no_idea_claimed(self):
        existing = [
            {"headline": "Serpme Köy Kahvaltısı Bahçede",
             "catalog_slot_key": "restaurant_cafe_brunch_offer_post"},
            {"headline": "Mutfakta Sabah Hazırlığı",
             "catalog_slot_key": "restaurant_cafe_kitchen_bts_story"},
        ]

        open_slots = _open_catalog_slots(existing, RESTAURANT_PLAN)

        assert [s["slot_key"] for s in open_slots] == [
            "restaurant_cafe_dining_ambiance_post",
            "restaurant_cafe_chef_plating_reel",
        ]

    def test_reports_the_shop_slots_no_idea_claimed(self):
        existing = [{"headline": "Ballı Badem Ezmesi Raflarda",
                     "catalog_slot_key": "local_products_shop_gift_bundle_post"}]

        open_slots = _open_catalog_slots(existing, SHOP_PLAN)

        assert [s["slot_key"] for s in open_slots] == [
            "local_products_shop_maker_story_post",
            "local_products_shop_craft_process_reel",
        ]

    def test_preserves_plan_order(self):
        existing = [{"catalog_slot_key": "restaurant_cafe_kitchen_bts_story"}]

        open_slots = _open_catalog_slots(existing, RESTAURANT_PLAN)

        assert [s["slot_key"] for s in open_slots] == [
            "restaurant_cafe_brunch_offer_post",
            "restaurant_cafe_dining_ambiance_post",
            "restaurant_cafe_chef_plating_reel",
        ]

    def test_camel_case_key_counts_as_claimed(self):
        existing = [{"catalogSlotKey": "restaurant_cafe_brunch_offer_post"}]

        keys = [s["slot_key"] for s in _open_catalog_slots(existing, RESTAURANT_PLAN)]

        assert "restaurant_cafe_brunch_offer_post" not in keys

    def test_nothing_open_when_every_slot_is_claimed(self):
        existing = [{"catalog_slot_key": s["slot_key"]} for s in SHOP_PLAN]

        assert _open_catalog_slots(existing, SHOP_PLAN) == []

    def test_no_plan_means_no_slot_ask(self):
        """Without a plan the top-up must fall back to the format breakdown."""
        assert _open_catalog_slots([{"headline": "x"}], None) == []
        assert _open_catalog_slots([{"headline": "x"}], []) == []

    def test_unclaimed_ideas_leave_every_slot_open(self):
        existing = [{"headline": "Slot etiketi olmayan fikir"}]

        assert len(_open_catalog_slots(existing, RESTAURANT_PLAN)) == len(RESTAURANT_PLAN)

    def test_malformed_plan_rows_are_ignored(self):
        plan = [*SHOP_PLAN, {"label_tr": "anahtarsız"}, "metin", None]

        assert len(_open_catalog_slots([], plan)) == len(SHOP_PLAN)


class TestNearDuplicateHeadlines:
    """Thresholds calibrated on 479 headlines from 40 live packages."""

    def test_catches_the_two_pairs_that_shipped_together(self):
        assert headlines_match(
            "Müşterilerimiz, Lezzetlerimizi Çok Seviyor!",
            "Müşterilerimiz Kahvaltımızı Çok Seviyor!",
        )
        assert headlines_match(
            "Bu Sonbaharın Tazeliğini Sofranıza Taşıyoruz!",
            "Yazın Tazeliğini Sofranıza Taşıyoruz!",
        )

    def test_catches_suffix_only_variants(self):
        assert headlines_match(
            "Serpme Kahvaltının Keyfini Çıkar!", "Serpme Kahvaltının Tadını Çıkar!"
        )
        assert headlines_match(
            "Kahvaltı Hazırlıklarımız Başladı!", "Kahvaltı Hazırlıkları Başladı!"
        )
        assert headlines_match(
            "Yerli Üreticilerimizin Hikayesi", "Yerel Üretimlerimizin Hikayesi"
        )

    def test_keeps_the_same_frame_with_a_different_product(self):
        """Product-range variety is the point of a range carousel, not a dupe."""
        assert not headlines_match(
            "Erken Hasat Zeytinyağı Geldi", "Erken Hasat Badem Ezmesi Geldi"
        )

    def test_keeps_genuinely_different_angles(self):
        for a, b in [
            ("Erken Hasat Zeytinyağı Geldi", "Ballı Badem Ezmesi Raflarda"),
            ("Serpme Köy Kahvaltısı Bahçede", "Şefin Özel Akşam Menüsü"),
            ("Hafta Sonu Rezervasyonları Açıldı", "Mutfakta Sabah Hazırlığı"),
            ("Portakal Bahçesinde Akşam Yemeği", "Limon Ağaçları Altında Kahvaltı"),
        ]:
            assert not headlines_match(a, b), f"{a!r} vs {b!r}"

    def test_short_headlines_still_need_exact_or_substring_match(self):
        """Below 12 characters the ratio is noise, so nothing is inferred."""
        assert not headlines_match("Yaz Bitti", "Yaz Başlar")
        assert headlines_match("Masanız Hazır", "Masanız Hazır")

    def test_turkish_case_folding_does_not_split_a_duplicate(self):
        assert headlines_match(
            "SERPME KAHVALTININ TADI BURADA", "serpme kahvaltinin tadi burada"
        )

    def test_dedupe_keeps_the_first_of_a_near_duplicate_run(self):
        ideas = [
            {"headline": "Serpme Kahvaltının Tadını Çıkar!"},
            {"headline": "Serpme Kahvaltının Keyfini Çıkar!"},
            {"headline": "Erken Hasat Zeytinyağı Geldi"},
        ]

        kept = dedupe_ideation_by_headline(ideas)

        assert [i["headline"] for i in kept] == [
            "Serpme Kahvaltının Tadını Çıkar!",
            "Erken Hasat Zeytinyağı Geldi",
        ]
