from app.config import get_settings
from app.services.production_automation import (
    auto_feed_production_allowed,
    auto_mission_proposal_allowed,
)


def test_auto_feed_blocked_by_default() -> None:
    settings = get_settings()
    assert settings.auto_feed_production_enabled is False
    assert auto_feed_production_allowed() is False
    assert auto_feed_production_allowed(operator_initiated=True) is True


def test_auto_mission_proposal_blocked_by_default() -> None:
    settings = get_settings()
    assert settings.auto_content_enabled is False
    assert settings.auto_mission_proposal_enabled is False
    assert auto_mission_proposal_allowed() is False
