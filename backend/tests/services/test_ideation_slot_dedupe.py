"""One deliverable per catalog slot, however many ideation nodes answered.

A mission graph may carry several ideation nodes, and each is briefed with the
whole slot plan, so each answers with a full weekly package. One live Karaman
week had three (`product_selection`, `in_store_promotion`,
`social_media_campaign`) and enqueued 44 jobs across 17 slots, producing
`farm_visit_story` seven times.
"""
import json

from app.services.mission_ideation_merge import (
    collect_unique_ideation_from_nodes,
    dedupe_ideation_by_catalog_slot,
)


def _idea(headline: str, slot: str, fmt: str = "post") -> dict:
    return {
        "concept_title": headline,
        "headline": headline,
        "caption_draft": f"{headline} — bu haftanın hikayesi.",
        "format": fmt,
        "catalog_slot_key": slot,
    }


def _node(node_key: str, ideas: list[dict]) -> dict:
    return {
        "node_key": node_key,
        "task_type": "content_ideation",
        "status": "completed",
        "output_summary": json.dumps(ideas, ensure_ascii=False),
        "output_payload": ideas,
    }


class TestSlotDedupe:
    def test_second_claim_on_a_slot_is_dropped(self) -> None:
        kept = dedupe_ideation_by_catalog_slot([
            _idea("Zeytinyağımız geldi", "local_products_shop_new_arrival_story"),
            _idea("Taze hasat rafta", "local_products_shop_new_arrival_story"),
            _idea("Çiftliği gezdik", "local_products_shop_farm_visit_story"),
        ])

        assert [i["headline"] for i in kept] == ["Zeytinyağımız geldi", "Çiftliği gezdik"]

    def test_unclaimed_ideas_are_left_alone(self) -> None:
        # Dropping these would silently shrink packages that never bound to the
        # catalog — they are still governed by headline dedupe upstream.
        kept = dedupe_ideation_by_catalog_slot([
            {"headline": "Serbest fikir A"},
            {"headline": "Serbest fikir B"},
            _idea("Masa hazır", "restaurant_cafe_table_ready_story", "story"),
        ])

        assert len(kept) == 3


class TestAcrossNodes:
    def test_local_products_shop_three_nodes_collapse_to_the_slot_plan(self) -> None:
        slots = [
            "local_products_shop_new_arrival_story",
            "local_products_shop_farm_visit_story",
            "local_products_shop_market_day_post",
        ]
        # Each node answers the whole plan in its own words, which is exactly why
        # headline dedupe cannot see the collision.
        nodes = [
            _node("in_store_promotion", [
                _idea("Erken hasat zeytinyağı rafta", slots[0], "story"),
                _idea("Bu sabah çiftlikteydik", slots[1], "story"),
                _idea("Pazar günü tezgâh kuruyoruz", slots[2]),
            ]),
            _node("product_selection", [
                _idea("Yeni gelen badem ezmesi", slots[0], "story"),
                _idea("Üreticimizin bahçesinden", slots[1], "story"),
                _idea("Semt pazarındayız", slots[2]),
            ]),
            _node("social_media_campaign", [
                _idea("Taze ürünler tezgâhta", slots[0], "story"),
                _idea("Toprakla başlayan yolculuk", slots[1], "story"),
                _idea("Haftalık pazar buluşması", slots[2]),
            ]),
        ]

        ideas = collect_unique_ideation_from_nodes(nodes)

        assert len(ideas) == 3
        assert {i["catalog_slot_key"] for i in ideas} == set(slots)
        # The node sort decides the winner, so the queue is stable across re-runs
        # rather than depending on which node finished first.
        assert [i["headline"] for i in ideas] == [
            "Erken hasat zeytinyağı rafta",
            "Bu sabah çiftlikteydik",
            "Pazar günü tezgâh kuruyoruz",
        ]

    def test_restaurant_cafe_single_node_is_unchanged(self) -> None:
        slots = [
            "restaurant_cafe_table_ready_story",
            "restaurant_cafe_new_menu_story",
            "restaurant_cafe_customer_review_post",
            "restaurant_cafe_signature_dish_post",
        ]
        nodes = [_node("content_ideation", [
            _idea("Masanız hazır, buyurun", slots[0], "story"),
            _idea("Sonbahar menüsü başladı", slots[1], "story"),
            _idea("Misafirimiz ne demiş", slots[2]),
            _idea("Şefin imza tabağı", slots[3]),
        ])]

        ideas = collect_unique_ideation_from_nodes(nodes)

        assert len(ideas) == 4
        assert [i["catalog_slot_key"] for i in ideas] == slots

    def test_two_nodes_covering_different_slots_both_survive(self) -> None:
        # The fix must not turn a legitimately split plan into a truncated one.
        nodes = [
            _node("post_ideation", [
                _idea("Menü tanıtımı", "restaurant_cafe_new_menu_story", "story"),
            ]),
            _node("reel_ideation", [
                _idea("Mutfak arkası", "restaurant_cafe_kitchen_bts_story", "reel"),
            ]),
        ]

        ideas = collect_unique_ideation_from_nodes(nodes)

        assert len(ideas) == 2
