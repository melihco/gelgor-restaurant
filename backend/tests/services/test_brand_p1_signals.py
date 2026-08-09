"""P1 brand intelligence helpers: review themes, competitor resolve, soft vibe."""

from types import SimpleNamespace

from app.services.brand_theme_freshness_service import (
    _vibe_is_thin,
    build_soft_vibe_from_signals,
)
from app.services.competitor_resolve import (
    extract_verified_handles_from_brief,
    resolve_competitors_raw,
)
from app.services.google_review_themes import (
    extract_google_review_themes,
    format_review_themes_for_learning,
)


def test_resolve_competitors_falls_back_to_suggested() -> None:
    raw = resolve_competitors_raw(
        "",
        '["Rakip Cafe Bodrum", "@otherplace"]',
    )
    assert "Rakip Cafe Bodrum" in raw
    assert "@otherplace" in raw or "otherplace" in raw


def test_resolve_competitors_prefers_explicit() -> None:
    raw = resolve_competitors_raw("@realone, @realtwo", '["Suggested Only"]')
    assert "realone" in raw.lower()
    assert "Suggested Only" not in raw


def test_extract_handles_from_brief() -> None:
    handles = extract_verified_handles_from_brief(
        "**Foo** (@foobodrum, 1200 followers)\n**Bar** (@bar.datca, 800)"
    )
    assert handles == ["foobodrum", "bar.datca"]


def test_review_theme_extraction() -> None:
    themes = extract_google_review_themes(
        [
            {"text": "Lezzetli zeytinyağı ve bal, personel çok ilgili", "stars": 5},
            {"text": "Fiyatlar biraz pahalı ama ortam güzel", "stars": 3},
            {"text": "Bekleme uzun sürdü, hijyen zayıf", "stars": 2},
        ]
    )
    assert themes["review_count"] == 3
    assert any("lezzet" in t for t in themes["themes"])
    assert themes["praise"]
    assert themes["complaints"]
    block = format_review_themes_for_learning(themes, rating="4.6")
    assert "GOOGLE YORUM TEMALARI" in block
    assert "4.6" in block


def test_soft_vibe_from_ig_voice() -> None:
    ctx = SimpleNamespace(
        brand_primary_color="#3d2b1f",
        brand_accent_color="#6b8f3e",
        brand_font_family="Fraunces",
        brand_tone="samimi",
        visual_dna="rustic pantry editorial",
        instagram_intelligence={
            "brand_voice": {
                "primary_tone": "samimi doğal",
                "writing_style": "kısa ürün odaklı",
                "emoji_usage": "az",
                "caption_length": "orta",
            }
        },
    )
    vibe = build_soft_vibe_from_signals(ctx)
    assert vibe is not None
    assert vibe["palette"]["primary"] == "#3d2b1f"
    assert vibe["caption_voice"]["tone"] == "samimi doğal"
    assert _vibe_is_thin({"palette": {"primary": "#000"}, "enrichment_note": "x"})
    assert not _vibe_is_thin(
        {
            "palette": {"primary": "#000"},
            "typography": {"heading_font": "Inter"},
            "composition": {"subject": "product"},
            "caption_voice": {"tone": "x"},
        }
    )
