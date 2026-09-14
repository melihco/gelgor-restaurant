"""Plan-time gallery decisions (photo or explicit 'no photo') travel to drain once."""

from __future__ import annotations

import json

from app.services.production_factory_service import _gallery_assignments_from_batch


def test_photo_assignment_is_decided() -> None:
    out = _gallery_assignments_from_batch([
        {
            "idea_index": 0,
            "slot_role": "hero_post",
            "payload": {"galleryPhotoUrl": "https://x/a.jpg", "galleryMatchScore": 71},
        }
    ])
    assert out == {"0::hero_post": {"url": "https://x/a.jpg", "score": 71, "decided": True}}


def test_no_photo_decision_is_carried_not_recomputed() -> None:
    out = _gallery_assignments_from_batch([
        {"idea_index": 1, "slot_role": "day_story", "payload": json.dumps({"galleryAssignDecided": True})},
    ])
    assert out["1::day_story"]["url"] == ""
    assert out["1::day_story"]["decided"] is True


def test_legacy_job_without_plan_decision_is_skipped() -> None:
    out = _gallery_assignments_from_batch([
        {"idea_index": 2, "slot_role": "day_post", "payload": None},
        {"idea_index": 3, "slot_role": "day_post", "payload": {"galleryVolumeWithheld": True}},
    ])
    assert out == {}
