from app.services.mission_ideation_merge import dedupe_ideation_by_headline


def idea(title: str, fmt: str = "post") -> dict:
    return {
        "concept_title": title,
        "headline": title,
        "format": fmt,
        "caption_draft": f"Caption for {title}",
    }


def test_dedupe_ideation_by_headline_removes_exact_duplicates() -> None:
    ideas = [
        idea("Yeni Ürünlerimiz Geldi!", "post"),
        idea("Yeni Ürünlerimiz Geldi!", "reel"),
        idea("Üretim Sürecimizi Keşfedin!", "story"),
    ]
    deduped = dedupe_ideation_by_headline(ideas)
    assert len(deduped) == 2
    assert [i["concept_title"] for i in deduped] == [
        "Yeni Ürünlerimiz Geldi!",
        "Üretim Sürecimizi Keşfedin!",
    ]


def test_dedupe_ideation_by_headline_removes_near_duplicates() -> None:
    ideas = [
        idea("Kahvaltı keyfi", "story"),
        idea("Kahvaltı keyfi başlıyor", "story"),
        idea("Akşam menüsü", "post"),
    ]
    deduped = dedupe_ideation_by_headline(ideas)
    assert len(deduped) == 2
    assert deduped[0]["concept_title"] == "Kahvaltı keyfi"
    assert deduped[1]["concept_title"] == "Akşam menüsü"


def test_enforce_strategist_idea_diversity_does_not_clone_pad() -> None:
    from app.crew.context import BrandInfo
    from app.crew.crews.content_crew import _enforce_strategist_idea_diversity

    brand = BrandInfo(
        business_name="Test Shop",
        business_type="retail",
        languages="tr",
    )
    thin = [idea("Tek fikir", "post")]
    out = _enforce_strategist_idea_diversity(thin, brand, target_count=16)
    assert len(out) == 1
    assert out[0]["concept_title"] == "Tek fikir"


def test_revision_that_drops_ideas_is_rejected() -> None:
    """Live regression: a 16-idea batch came back from revision as 7 and was kept."""
    from app.crew.crews.content_crew import _revision_loses_ideas

    full = [idea(f"Fikir {i}", "story") for i in range(16)]

    assert _revision_loses_ideas(full, full[:7]) is True
    assert _revision_loses_ideas(full, full) is False
    # A revision may legitimately add an idea while fixing pillar coverage.
    assert _revision_loses_ideas(full, [*full, idea("Ek fikir", "post")]) is False
    assert _revision_loses_ideas(full, []) is True


def test_revision_budgets_fit_a_full_package() -> None:
    """The old 8k-char / 4k-token budgets cut the batch tail before review."""
    import json

    from app.crew.crews.content_crew import (
        _REVISION_INPUT_MAX_CHARS,
        _REVISION_MAX_OUTPUT_TOKENS,
    )
    from app.services.package_weekly_geometry import resolve_weekly_package_geometry

    total = resolve_weekly_package_geometry(None)["total"]
    batch = json.dumps(
        [
            {
                "concept_title": f"Fikir {i}",
                "headline": f"Fikir {i}",
                "format": "story",
                "caption_draft": "x" * 400,
                "caption_draft_alt": "y" * 400,
                "cta": "Hemen keşfet",
            }
            for i in range(total)
        ],
        ensure_ascii=False,
    )
    assert len(batch) < _REVISION_INPUT_MAX_CHARS
    # ~4 chars per token is the usual rule of thumb for this payload shape.
    assert len(batch) / 4 < _REVISION_MAX_OUTPUT_TOKENS
