import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

from app.services.scheduled_template_service import (
    is_template_active_now,
    resolve_active_templates_for_feed,
)


def template(**overrides):
    base = {
        "id": uuid.uuid4(),
        "name": "Gunaydin",
        "format": "story",
        "media_items": [{"url": "https://cdn.example/story.mp4", "type": "video"}],
        "schedule_type": "daily",
        "schedule_days": [0, 1, 2, 3, 4, 5, 6],
        "schedule_time": "10:00",
        "schedule_end_time": None,
        "timezone": "Europe/Istanbul",
        "status": "active",
        "category": "morning_greeting",
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def dt_utc(year: int, month: int, day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)


def test_daily_template_is_active_after_start_time() -> None:
    # 07:30 UTC = 10:30 Europe/Istanbul in summer.
    assert is_template_active_now(template(schedule_time="10:00"), dt_utc(2026, 6, 20, 7, 30))


def test_template_is_inactive_before_start_time() -> None:
    # 06:30 UTC = 09:30 Europe/Istanbul in summer.
    assert not is_template_active_now(template(schedule_time="10:00"), dt_utc(2026, 6, 20, 6, 30))


def test_specific_days_filter_uses_local_weekday() -> None:
    # 2026-06-20 is Saturday => weekday index 5.
    saturday_template = template(schedule_type="specific_days", schedule_days=[5], schedule_time="10:00")
    monday_template = template(schedule_type="specific_days", schedule_days=[0], schedule_time="10:00")

    assert is_template_active_now(saturday_template, dt_utc(2026, 6, 20, 8, 0))
    assert not is_template_active_now(monday_template, dt_utc(2026, 6, 20, 8, 0))


def test_time_window_hides_template_after_end_time() -> None:
    happy_hour = template(
        schedule_time="17:00",
        schedule_end_time="19:00",
    )

    assert is_template_active_now(happy_hour, dt_utc(2026, 6, 20, 15, 0))  # 18:00 local
    assert not is_template_active_now(happy_hour, dt_utc(2026, 6, 20, 17, 0))  # 20:00 local


def test_cross_midnight_window_is_supported() -> None:
    late_night = template(schedule_time="22:00", schedule_end_time="02:00")

    assert is_template_active_now(late_night, dt_utc(2026, 6, 20, 20, 0))  # 23:00 local
    assert is_template_active_now(late_night, dt_utc(2026, 6, 20, 22, 30))  # 01:30 local
    assert not is_template_active_now(late_night, dt_utc(2026, 6, 20, 23, 30))  # 02:30 local


def test_paused_and_empty_media_templates_are_inactive() -> None:
    assert not is_template_active_now(template(status="paused"), dt_utc(2026, 6, 20, 8, 0))
    assert not is_template_active_now(template(media_items=[]), dt_utc(2026, 6, 20, 8, 0))


def test_resolve_active_templates_for_feed_keeps_archived_out_and_marks_active() -> None:
    active = template(name="Active")
    paused = template(name="Paused", status="paused")
    archived = template(name="Archived", status="archived")

    feed = resolve_active_templates_for_feed([active, paused, archived], dt_utc(2026, 6, 20, 8, 0))

    assert [item.name for item in feed] == ["Active", "Paused"]
    assert feed[0].is_active_now is True
    assert feed[1].is_active_now is False
