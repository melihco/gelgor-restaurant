from app.crew.caption_headline_pair import (
    apply_caption_headline_pair,
    overlay_headline_from_caption,
    overlay_taken_from_caption,
)


def test_overlay_is_opening_thought_of_caption():
    assert overlay_headline_from_caption(
        "Zeytin hasadı başladı! Datça’nın bereketli topraklarından gelen zeytinlerimizi işliyoruz."
    ) == "Zeytin hasadı başladı"
    shop = overlay_headline_from_caption(
        "Sofra sade, tabak dolu. Bugün mutfakta taze otlar."
    )
    assert shop == "Sofra sade, tabak dolu"


def test_apply_replaces_invented_slogan_with_caption_line():
    idea = apply_caption_headline_pair({
        "headline": "Zeytin hasadını kutlayın",
        "caption_draft": "Zeytin hasadı başladı! Soğuk sıkım bu hafta raflarda.",
    })
    assert idea["headline"] == "Zeytin hasadı başladı"
    assert idea["canva_field_copy"]["headline"] == "Zeytin hasadı başladı"
    assert overlay_taken_from_caption(idea["headline"], idea["caption_draft"])


def test_apply_keeps_complete_grounded_tone_line():
    shop = apply_caption_headline_pair({
        "headline": "Soğuk sıkım raflarda",
        "caption_draft": "Zeytin hasadı başladı! Soğuk sıkım bu hafta raflarda.",
    })
    assert shop["headline"] == "Soğuk sıkım raflarda"
    assert shop["overlay_headline_source"] == "brand_tone_line"

    beach = apply_caption_headline_pair({
        "headline": "Last light on the terrace",
        "caption_draft": "The terrace holds the last light. The sea stays open.",
    })
    assert beach["headline"] == "Last light on the terrace"
    assert beach["overlay_headline_source"] == "brand_tone_line"


def test_keeps_headline_already_taken_from_caption():
    idea = apply_caption_headline_pair({
        "headline": "Zeytin hasadı başladı",
        "caption_draft": "Zeytin hasadı başladı! Soğuk sıkım bu hafta raflarda.",
    })
    assert idea["headline"] == "Zeytin hasadı başladı"
