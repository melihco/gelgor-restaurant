"""
Synthesised Canva copy must not be cut through a word.

A live Karaman story shipped the headline "Mağazamızda doğal lezzetleri
keşfetmeye hazır m": ideation left `headline` empty on a pure_photo story, the
fallback derived one from the caption, and a raw 47-character slice landed
inside "mısınız".
"""
from __future__ import annotations

import pytest

from app.crew.crews.content_crew import (
    _CANVA_CTA_MAX,
    _CANVA_HEADLINE_MAX,
    _CANVA_SUBTITLE_MAX,
    _clip_on_word,
    _enforce_idea_completeness,
)
from app.crew.context import BrandInfo


class TestClipOnWord:
    def test_reproduces_and_fixes_the_live_defect(self):
        derived = "Mağazamızda doğal lezzetleri keşfetmeye hazır mısınız"

        out = _clip_on_word(derived, _CANVA_HEADLINE_MAX)

        assert out == "Mağazamızda doğal lezzetleri keşfetmeye hazır"
        assert not out.endswith(" m")
        assert len(out) <= _CANVA_HEADLINE_MAX

    def test_text_within_the_limit_is_untouched(self):
        assert _clip_on_word("Erken Hasat Zeytinyağı Geldi", 47) == (
            "Erken Hasat Zeytinyağı Geldi"
        )

    def test_drops_a_question_particle_the_cut_stranded(self):
        # Without this, dropping "mısınız" leaves "… keşfetmeye hazır mı".
        out = _clip_on_word("Bu yaz bizimle keşfetmeye hazır mı mısınız", 36)

        assert out == "Bu yaz bizimle keşfetmeye hazır"

    def test_drops_a_conjunction_the_cut_stranded(self):
        out = _clip_on_word("Zeytinyağı ve badem ezmesi ve reçel", 30)

        assert out == "Zeytinyağı ve badem ezmesi"

    def test_copy_that_already_fits_is_never_rewritten(self):
        """The clipper does not edit an author's line, however it ends."""
        assert _clip_on_word("Zeytinyağı ve badem ezmesi ve", 40) == (
            "Zeytinyağı ve badem ezmesi ve"
        )

    def test_collapses_whitespace(self):
        assert _clip_on_word("  Çam   Balı\nGeldi ", 47) == "Çam Balı Geldi"

    def test_strips_trailing_punctuation_left_by_the_cut(self):
        out = _clip_on_word("Serpme köy kahvaltısı, bahçede servis", 22)

        assert not out.endswith(",")
        assert out == "Serpme köy kahvaltısı"

    def test_a_single_long_word_still_respects_the_limit(self):
        out = _clip_on_word("Kahvaltılıklarımızdanbirseçki", 10)

        assert len(out) <= 10

    def test_empty_input_is_empty_output(self):
        assert _clip_on_word("", 47) == ""
        assert _clip_on_word("   ", 47) == ""

    @pytest.mark.parametrize("limit", [_CANVA_HEADLINE_MAX, _CANVA_CTA_MAX, _CANVA_SUBTITLE_MAX])
    def test_never_exceeds_the_cap(self, limit):
        text = "Datça'nın erken hasat zeytinyağı ve ballı badem ezmesi raflarımızda"

        assert len(_clip_on_word(text, limit)) <= limit


def _brand(business_type: str) -> BrandInfo:
    return BrandInfo(
        business_name="Karaman Datça" if business_type == "local_products_shop" else "Gel Gör",
        business_type=business_type,
        languages="tr",
    )


class TestSynthesisedCanvaCopy:
    """Two sectors, since the fallback is shared by every designed slot."""

    def test_shop_story_headline_is_not_cut_mid_word(self):
        idea = {
            "content_type": "story",
            "format": "story",
            "headline": "",
            "cta": "Hadi keşfet!",
            "caption_draft": (
                "Mağazamızda doğal lezzetleri keşfetmeye hazır mısınız? Hadi keşfet!"
            ),
            "catalog_slot_key": "local_products_shop_farm_visit_story",
        }

        out = _enforce_idea_completeness([idea], _brand("local_products_shop"))
        headline = out[0]["canva_field_copy"]["headline"]

        assert headline
        assert not headline.endswith(" m")
        assert headline.split()[-1] in {
            w.strip(".,!?:;") for w in idea["caption_draft"].split()
        }

    def test_restaurant_story_headline_is_not_cut_mid_word(self):
        idea = {
            "content_type": "story",
            "format": "story",
            "headline": "",
            "cta": "Rezervasyon yap",
            "caption_draft": (
                "Portakal bahçemizde serpme köy kahvaltısına katılmak ister misiniz? "
                "Masanız hazır."
            ),
            "catalog_slot_key": "restaurant_cafe_brunch_offer_post",
        }

        out = _enforce_idea_completeness([idea], _brand("restaurant_cafe"))
        headline = out[0]["canva_field_copy"]["headline"]

        assert headline
        assert len(headline) <= _CANVA_HEADLINE_MAX
        # The final token must be a whole word from the caption.
        caption_words = {w.strip(".,!?:;") for w in idea["caption_draft"].split()}
        assert headline.split()[-1] in caption_words

    def test_an_explicit_headline_is_preferred_over_the_caption(self):
        idea = {
            "content_type": "post",
            "format": "feed",
            "headline": "Erken Hasat Zeytinyağı Raflarda",
            "caption_draft": "Bu sabah sıktığımız zeytinyağı artık mağazamızda.",
            "cta": "Şimdi al",
        }

        out = _enforce_idea_completeness([idea], _brand("local_products_shop"))

        assert out[0]["canva_field_copy"]["headline"] == "Erken Hasat Zeytinyağı Raflarda"

    def test_existing_canva_copy_is_left_alone(self):
        idea = {
            "content_type": "post",
            "format": "feed",
            "headline": "Erken Hasat Zeytinyağı Raflarda",
            "canva_field_copy": {"headline": "Elle sıkılmış, bugün geldi"},
            "caption_draft": "Bu sabah sıktığımız zeytinyağı artık mağazamızda.",
        }

        out = _enforce_idea_completeness([idea], _brand("local_products_shop"))

        assert out[0]["canva_field_copy"]["headline"] == "Elle sıkılmış, bugün geldi"
