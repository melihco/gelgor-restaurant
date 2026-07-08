"""Central gates for scheduler-driven feed production and mission proposals."""

from __future__ import annotations

from app.config import get_settings


def auto_feed_production_allowed(*, operator_initiated: bool = False) -> bool:
    """False = no background fal.ai / auto-produce unless operator kicks manually."""
    if operator_initiated:
        return True
    return get_settings().auto_feed_production_enabled


def factory_drain_allowed(*, force: bool = False) -> bool:
    """Whether a factory drain kick may run.

    ``AUTO_FEED_PRODUCTION_ENABLED=false`` blocks scheduler-initiated *new* feed
    production, but an in-flight ``production_jobs`` queue must keep draining until
    all slots reach ``ready`` — pass ``force=True`` for those continuation kicks.
    """
    if force:
        return True
    return auto_feed_production_allowed()


def auto_mission_proposal_allowed() -> bool:
    """False = no scheduler-created mission proposals (semi-auto, seasonal, etc.)."""
    return get_settings().auto_mission_proposal_enabled
