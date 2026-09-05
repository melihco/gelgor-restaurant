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


def test_keeps_headline_already_taken_from_caption():
    idea = apply_caption_headline_pair({
        "headline": "Zeytin hasadı başladı",
        "caption_draft": "Zeytin hasadı başladı! Soğuk sıkım bu hafta raflarda.",
    })
    assert idea["headline"] == "Zeytin hasadı başladı"
