"""Unit tests for slot catalog admin helpers (facilities, shelves, coverage)."""

from __future__ import annotations

from types import SimpleNamespace

from app.services.slot_catalog_service import (
    LIBRARY_SHELF_SPECS,
    _build_shelf_summaries,
    _compute_effective_rows,
    _coverage_from_effective,
    default_slot_facilities,
    facility_options,
    list_library_shelves,
    required_facilities_from_tags,
    resolve_facilities_dict,
    validate_format_coverage,
)


def _slot(
    key: str,
    fmt: str = "post",
    *,
    library: str | None = "campaign_post",
    tags: list[str] | None = None,
    enabled_by_default: bool = True,
    status: str = "active",
    sort_order: int = 10,
):
    return SimpleNamespace(
        slot_key=key,
        format=fmt,
        library_slot_key=library,
        optional_tags=tags or [],
        enabled_by_default=enabled_by_default,
        status=status,
        sort_order=sort_order,
    )


def test_library_shelves_are_fixed_seven():
    shelves = list_library_shelves()
    assert len(shelves) == 7
    assert [s["key"] for s in shelves] == [s["key"] for s in LIBRARY_SHELF_SPECS]
    assert shelves[0]["key"] == "daily_story"
    assert shelves[-1]["key"] == "ad_creative_post"


def test_resolve_facilities_opt_out_defaults():
    assert resolve_facilities_dict(None)["pool"] is True
    assert resolve_facilities_dict({"pool": False})["pool"] is False
    assert resolve_facilities_dict({"pool": False})["dj_stage"] is True
    assert "unknown" not in resolve_facilities_dict({"unknown": False})
    # Opt-in service surface defaults OFF
    assert resolve_facilities_dict(None)["hiring"] is False
    assert resolve_facilities_dict(None)["events_calendar"] is False
    assert resolve_facilities_dict({"hiring": True})["hiring"] is True


def test_facility_options_include_labels():
    opts = facility_options(default_slot_facilities())
    assert len(opts) == len(default_slot_facilities())
    pool = next(o for o in opts if o["key"] == "pool")
    assert pool["label_tr"]
    assert pool["enabled"] is True
    hiring = next(o for o in opts if o["key"] == "hiring")
    assert hiring["enabled"] is False
    assert hiring["opt_in"] is True
    events = next(o for o in opts if o["key"] == "events_calendar")
    assert events["enabled"] is False
    assert events["opt_in"] is True


def test_required_facilities_from_tags():
    assert required_facilities_from_tags(["requires:pool", "requires:dj_stage"]) == [
        "pool",
        "dj_stage",
    ]
    assert required_facilities_from_tags(["other"]) == []


def test_coverage_requires_post_and_story():
    ok = validate_format_coverage(["post", "story"])
    assert ok["ok"] is True
    bad = validate_format_coverage(["post"])
    assert bad["ok"] is False
    assert "at_least_one_story_required" in bad["errors"]


def test_effective_defaults_respect_facilities():
    slots = [
        _slot("beach_pool", "post", tags=["requires:pool"], library="editorial_story"),
        _slot("beach_dj", "post", library="event_story"),
        _slot("beach_story", "story", library="daily_story"),
    ]
    rows = _compute_effective_rows(
        sector_slots=slots,
        assignments=[],
        facilities=resolve_facilities_dict({"pool": False}),
    )
    by_key = {r["slot_key"]: r for r in rows}
    assert by_key["beach_pool"]["effective_enabled"] is False
    assert by_key["beach_pool"]["blocked_by"] == "facility"
    assert by_key["beach_pool"]["facility_blocked"] is True
    assert by_key["beach_dj"]["effective_enabled"] is True
    assert by_key["beach_story"]["effective_enabled"] is True
    coverage = _coverage_from_effective(rows)
    assert coverage["ok"] is True


def test_effective_with_assignments_ignores_facility_for_production():
    """Production path: assignment.enabled wins; facility is advisory only."""
    slots = [
        _slot("beach_pool", "post", tags=["requires:pool"], library="editorial_story"),
        _slot("beach_story", "story", library="daily_story"),
    ]
    assignments = [
        SimpleNamespace(
            slot_key="beach_pool",
            enabled=True,
            assignment_source="operator",
            priority=10,
        ),
        SimpleNamespace(
            slot_key="beach_story",
            enabled=True,
            assignment_source="auto_default",
            priority=20,
        ),
    ]
    rows = _compute_effective_rows(
        sector_slots=slots,
        assignments=assignments,
        facilities=resolve_facilities_dict({"pool": False}),
    )
    by_key = {r["slot_key"]: r for r in rows}
    assert by_key["beach_pool"]["facility_blocked"] is True
    assert by_key["beach_pool"]["effective_enabled"] is True
    assert by_key["beach_pool"]["assignment_enabled"] is True


def test_shelf_summaries_group_by_library_slot_key():
    slots = [
        _slot("a", "story", library="daily_story"),
        _slot("b", "story", library="daily_story"),
        _slot("c", "post", library="campaign_post"),
    ]
    rows = _compute_effective_rows(
        sector_slots=slots,
        assignments=[],
        facilities=default_slot_facilities(),
    )
    shelves = _build_shelf_summaries(rows)
    daily = next(s for s in shelves if s["key"] == "daily_story")
    campaign = next(s for s in shelves if s["key"] == "campaign_post")
    assert daily["catalog_count"] == 2
    assert daily["effective_count"] == 2
    assert campaign["catalog_count"] == 1
    assert campaign["effective_count"] == 1
