"""Unit tests for slot_template_art_direction JSON parse."""

from app.crew.crews.slot_art_direction_crew import parse_slot_art_direction


def test_parse_beach_club_left_rail():
    raw = """
    {
      "layout_concept": "Teal left rail with clear beach photo window",
      "type_zone_anchor": "left_rail",
      "color_surfaces": "Primary rail fill",
      "type_hierarchy": "Stacked serif in rail",
      "motif_from_dna": "horizon rule",
      "reject_look": "cream top-left sticker",
      "diversity_note": "Not cocktail card"
    }
    """
    parsed = parse_slot_art_direction(raw)
    assert parsed is not None
    assert parsed["type_zone_anchor"] == "left_rail"
    assert "Teal left rail" in parsed["layout_concept"]


def test_parse_local_products_inset():
    raw = """```json
    {
      "layout_concept": "Brand-hex mat around jar hero",
      "type_zone_anchor": "inset_frame",
      "color_surfaces": "Accent mat",
      "type_hierarchy": "Short product name",
      "motif_from_dna": "wood grain line",
      "reject_look": "beige product flyer",
      "diversity_note": "Not lifestyle bleed"
    }
    ```"""
    parsed = parse_slot_art_direction(raw)
    assert parsed is not None
    assert parsed["type_zone_anchor"] == "inset_frame"


def test_parse_rejects_invalid_anchor():
    assert parse_slot_art_direction(
        '{"layout_concept":"x","type_zone_anchor":"magic_corner"}'
    ) is None
