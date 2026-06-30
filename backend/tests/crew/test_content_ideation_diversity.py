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
