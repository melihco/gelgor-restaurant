"""Gate new mission proposals until the current mission is approved and feed-ready."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mission import Mission
from app.schemas.mission import MissionStatus
from app.services.mission_service import list_blocking_missions


@dataclass(frozen=True)
class MissionProposalBlock:
    reason: str
    message: str
    mission_id: str
    mission_title: str
    mission_status: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "reason": self.reason,
            "message": self.message,
            "mission_id": self.mission_id,
            "mission_title": self.mission_title,
            "mission_status": self.mission_status,
        }


async def is_mission_feed_production_complete(
    db: AsyncSession,
    mission: Mission,
) -> bool:
    """True when feed/factory production for this mission is done enough to propose the next one."""
    from app.services import production_job_service as pj
    from app.services.production_bridge import mission_feed_package_complete
    from app.services.mission_feed_production_service import (
        _resolve_mission_production_package_total,
    )

    perf = dict(mission.performance_summary or {})
    summary = await pj.mission_job_summary(mission.id, enrich=False)
    total = int(summary.get("total") or 0)
    ready = int(summary.get("ready") or 0)
    in_flight = int(summary.get("inFlight") or summary.get("in_flight") or 0)
    queued = int(summary.get("queued") or 0)
    if bool(summary.get("complete")):
        return True
    if total > 0 and ready >= total and in_flight == 0 and queued == 0:
        return True

    package_total = await _resolve_mission_production_package_total(
        mission.id,
        workspace_id=mission.workspace_id,
        mission_type=str(mission.type or ""),
        perf=perf,
    )
    if mission_feed_package_complete(perf, package_total=package_total):
        return True
    return False


async def resolve_mission_proposal_block(
    db: AsyncSession,
    workspace_id: uuid.UUID,
) -> MissionProposalBlock | None:
    """
    Return a block descriptor when a new mission must NOT be proposed yet.

    Rules (cost-safe, operator-first):
      - Any ``proposed`` mission still awaiting approval → block.
      - Any ``approved`` / ``in_flight`` mission whose feed/factory production is
        not complete → block.
    """
    blocking = await list_blocking_missions(db, workspace_id)
    if not blocking:
        return None

    proposed = [m for m in blocking if m.status == MissionStatus.PROPOSED.value]
    if proposed:
        mission = proposed[0]
        count = len(proposed)
        suffix = f" ({count} adet)" if count > 1 else ""
        return MissionProposalBlock(
            reason="awaiting_approval",
            message=(
                f"Onay bekleyen misyon var{suffix}: «{mission.title[:48]}». "
                "Yeni öneri için önce onaylayın veya reddedin."
            ),
            mission_id=str(mission.id),
            mission_title=mission.title,
            mission_status=mission.status,
        )

    active = [
        m for m in blocking
        if m.status in (MissionStatus.APPROVED.value, MissionStatus.IN_FLIGHT.value)
    ]
    if not active:
        return None

    mission = active[0]
    if await is_mission_feed_production_complete(db, mission):
        return None

    return MissionProposalBlock(
        reason="feed_incomplete",
        message=(
            f"Aktif misyonun feed üretimi henüz bitmedi: «{mission.title[:48]}». "
            "Yeni misyon önerisi maliyet kaçınmak için bekletiliyor."
        ),
        mission_id=str(mission.id),
        mission_title=mission.title,
        mission_status=mission.status,
    )


async def mission_proposal_allowed(
    db: AsyncSession,
    workspace_id: uuid.UUID,
) -> bool:
    return await resolve_mission_proposal_block(db, workspace_id) is None
