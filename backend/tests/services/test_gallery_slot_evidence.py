"""Gallery-proven catalog slots — hospitality + local shop."""

from __future__ import annotations

from app.services.gallery_slot_evidence import (
    gallery_can_prove_slot,
    gallery_evidence_tokens,
    prefer_gallery_proven_slots,
)

HOSPITALITY = [
    {
        "slot_key": "hospitality_lobby_ambiance_post",
        "label_tr": "Lobi atmosferi",
        "format": "post",
    },
    {
        "slot_key": "hospitality_breakfast_experience_post",
        "label_tr": "Kahvaltı deneyimi",
        "format": "post",
    },
    {
        "slot_key": "hospitality_spa_offer_story",
        "label_tr": "Spa teklifi story",
        "format": "story",
    },
    {
        "slot_key": "hospitality_room_tour_story",
        "label_tr": "Oda turu story",
        "format": "story",
    },
    {
        "slot_key": "hospitality_events_calendar_story",
        "label_tr": "Etkinlik takvimi",
        "format": "story",
    },
    {
        "slot_key": "hospitality_suite_showcase_post",
        "label_tr": "Suit tanıtım",
        "format": "post",
    },
    {
        "slot_key": "hospitality_checkin_story",
        "label_tr": "Check-in story",
        "format": "story",
    },
]

SHOP = [
    {
        "slot_key": "local_products_shop_product_hero_post",
        "label_tr": "Ürün kahramanı",
        "format": "post",
    },
    {
        "slot_key": "local_products_shop_shop_ambiance_post",
        "label_tr": "Dükkan atmosferi",
        "format": "post",
    },
    {
        "slot_key": "local_products_shop_farm_visit_post",
        "label_tr": "Çiftlik ziyareti",
        "format": "post",
    },
    {
        "slot_key": "local_products_shop_new_arrival_story",
        "label_tr": "Yeni gelen story",
        "format": "story",
    },
]


def _gallery(*rows: dict) -> dict:
    return {f"https://cdn.example/{i}.jpg": meta for i, meta in enumerate(rows)}


def test_pension_terrace_gallery_drops_spa_suite_events():
    gallery = _gallery(
        {
            "description": "Teras, deniz ve bahçe masası",
            "contentTags": ["teras", "deniz", "bahce"],
            "suggestedAssetType": "venue_reference",
        },
        {
            "description": "Pansiyon koridoru ve avlu",
            "contentTags": ["avlu", "koridor"],
            "bestFor": ["venue"],
        },
    )
    proven = prefer_gallery_proven_slots(HOSPITALITY, gallery)
    keys = {s["slot_key"] for s in proven}
    assert "hospitality_lobby_ambiance_post" in keys
    assert "hospitality_breakfast_experience_post" in keys
    assert "hospitality_checkin_story" in keys
    assert "hospitality_spa_offer_story" not in keys
    assert "hospitality_suite_showcase_post" not in keys
    assert "hospitality_events_calendar_story" not in keys
    assert "hospitality_room_tour_story" not in keys


def test_shop_jars_keep_product_drop_farm():
    gallery = _gallery(
        {
            "description": "Rafta etiketli zeytinyagi sisesi",
            "contentTags": ["zeytinyagi", "sise", "urun"],
            "suggestedAssetType": "product_image",
        },
        {
            "description": "Dukkan tezgahi ve kavanozlar",
            "contentTags": ["dukkan", "kavanoz", "bal"],
            "bestFor": ["product"],
        },
    )
    proven = prefer_gallery_proven_slots(SHOP, gallery)
    keys = {s["slot_key"] for s in proven}
    assert "local_products_shop_product_hero_post" in keys
    assert "local_products_shop_shop_ambiance_post" in keys
    assert "local_products_shop_new_arrival_story" in keys
    assert "local_products_shop_farm_visit_post" not in keys


SHOP_PLACE = SHOP + [
    {
        "slot_key": "local_products_shop_market_day_post",
        "label_tr": "Pazar günü",
        "format": "post",
    },
    {
        "slot_key": "local_products_shop_weekend_hours_story",
        "label_tr": "Hafta sonu saatleri",
        "format": "story",
    },
]


def test_product_only_gallery_closes_place_and_process_slots():
    # 77 jar shots + one logo: no venue, no process family → place/process slots
    # do not open this week; product slots stay.
    rows = [
        {
            "description": f"Rafta etiketli zeytinyagi sisesi {i}",
            "contentTags": ["zeytinyagi", "sise", "urun"],
            "suggestedAssetType": "product_image",
            "bestFor": ["product"],
        }
        for i in range(5)
    ] + [
        {
            "description": "Marka logosu, cicek dali",
            "contentTags": ["logo"],
            "suggestedAssetType": "logo",
        }
    ]
    proven = prefer_gallery_proven_slots(SHOP_PLACE, _gallery(*rows))
    keys = {s["slot_key"] for s in proven}
    assert "local_products_shop_product_hero_post" in keys
    assert "local_products_shop_new_arrival_story" in keys
    assert "local_products_shop_shop_ambiance_post" not in keys
    assert "local_products_shop_market_day_post" not in keys
    assert "local_products_shop_weekend_hours_story" not in keys
    assert "local_products_shop_farm_visit_post" not in keys


def test_one_venue_photo_reopens_place_slots_for_beach_club():
    slots = [
        {"slot_key": "beach_club_sunset_ambiance_post", "label_tr": "Gün batımı", "format": "post"},
        {"slot_key": "beach_club_weekend_hours_story", "label_tr": "Hafta sonu saatleri", "format": "story"},
        {"slot_key": "beach_club_signature_cocktail_post", "label_tr": "İmza kokteyl", "format": "post"},
    ]
    gallery = _gallery(
        {
            "description": "Şezlonglar ve deniz, akşam ışığı",
            "contentTags": ["sezlong", "deniz"],
            "suggestedAssetType": "venue_reference",
        },
        {
            "description": "Bardakta kokteyl",
            "contentTags": ["kokteyl"],
            "suggestedAssetType": "product_image",
        },
    )
    keys = {s["slot_key"] for s in prefer_gallery_proven_slots(slots, gallery)}
    assert keys == {
        "beach_club_sunset_ambiance_post",
        "beach_club_weekend_hours_story",
        "beach_club_signature_cocktail_post",
    }


def test_empty_analysis_keeps_caller_list():
    assert prefer_gallery_proven_slots(HOSPITALITY, None) == []
    assert prefer_gallery_proven_slots(HOSPITALITY, "{}") == []


def test_room_photo_proves_room_tour_not_spa():
    tokens = gallery_evidence_tokens(
        _gallery(
            {
                "description": "Yatak ve oda penceresi",
                "contentTags": ["oda", "yatak"],
            },
        ),
    )
    room = next(s for s in HOSPITALITY if "room_tour" in s["slot_key"])
    spa = next(s for s in HOSPITALITY if "spa_offer" in s["slot_key"])
    assert gallery_can_prove_slot(room, tokens, has_photos=True) is True
    assert gallery_can_prove_slot(spa, tokens, has_photos=True) is False
