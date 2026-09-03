from app.services.brand_context_service import extract_discovery_outputs


def test_restaurant_cafe_persists_template_and_asset_needs():
    analysis = {
        "report": {
            "template_needs": ["generic_story", "offer_campaign_post"],
            "asset_recommendations": ["logo", "brand_background", "product_image"],
            "missing_questions": ["Akşam menüsü var mı?"],
        },
        "competitor_instagram_profiles": [{"handle": "ornek_restoran"}],
    }
    out = extract_discovery_outputs(analysis)
    assert "generic_story" in out["template_needs"]
    assert "product_image" in out["asset_recommendations"]
    assert out["missing_questions"] == ["Akşam menüsü var mı?"]
    assert out["competitor_instagram_profiles"][0]["handle"] == "ornek_restoran"


def test_beach_club_persists_event_asset_needs():
    analysis = {
        "report": {
            "template_needs": ["event_announcement_story"],
            "asset_recommendations": ["logo", "event_image", "artist_photo"],
            "missing_questions": [],
        },
        "competitor_instagram_profiles": [],
    }
    out = extract_discovery_outputs(analysis)
    assert out["template_needs"] == ["event_announcement_story"]
    assert "event_image" in out["asset_recommendations"]
    assert out["missing_questions"] == []
    assert out["competitor_instagram_profiles"] == []


def test_empty_report_returns_empty_lists():
    out = extract_discovery_outputs({"report": {}})
    assert out["template_needs"] == []
    assert out["asset_recommendations"] == []
