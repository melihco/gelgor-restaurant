"""
WorkspaceHealthAnalyzer — CrewAI tool that reads all available tenant signals
and returns a structured health snapshot.

The CEO Intelligence Agent uses this tool to understand the current state
of a tenant's business before generating task recommendations.

Signals read:
  - Brand context (visual DNA, competitors, trend brief, constitution status)
  - Google Business (rating, review count, review signals)
  - Content production gap (days since last content run)
  - Approval rate (from suggestions table)
  - Campaign goals vs current focus
  - Industry playbook coverage
"""

from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
from typing import Any

from crewai.tools import BaseTool
from pydantic import BaseModel, Field


class WorkspaceHealthInput(BaseModel):
    workspace_id: str = Field(description="Workspace UUID to analyze")
    include_details: bool = Field(default=True, description="Include full signal details")


class WorkspaceHealthAnalyzerTool(BaseTool):
    """
    Reads all available tenant intelligence and returns a structured health report.
    The CEO agent calls this at the start of every recommendation cycle.
    """

    name: str = "workspace_health_analyzer"
    description: str = (
        "Analyzes the current health of a tenant workspace by reading all available signals: "
        "Google rating, review gaps, content production frequency, campaign goals, brand "
        "constitution status, and industry playbook coverage. Returns a JSON health report "
        "that guides task prioritization."
    )
    args_schema: type[BaseModel] = WorkspaceHealthInput

    # Injected by the crew factory — not a CrewAI-managed field
    _health_data: dict[str, Any] = {}

    def __init__(self, health_data: dict[str, Any]):
        super().__init__()
        # Store health data for use in _run
        object.__setattr__(self, '_health_data', health_data)

    def _run(self, workspace_id: str, include_details: bool = True) -> str:
        """Return the pre-loaded health data as a JSON string."""
        return json.dumps(self._health_data, ensure_ascii=False, indent=2)


def build_health_snapshot(
    brand: Any,  # BrandInfo dataclass
    recent_tasks: list[dict],
    pending_suggestions: int,
    approved_count: int,
    rejected_count: int,
) -> dict[str, Any]:
    """
    Build a structured health snapshot dict from available tenant data.
    Called before creating a WorkspaceHealthAnalyzerTool instance.
    """
    now = datetime.now(timezone.utc)

    # ── Content production gap ─────────────────────────────────────────
    content_tasks = [t for t in recent_tasks if "content" in t.get("task_type", "")]
    last_content_task = content_tasks[0] if content_tasks else None
    days_since_content = None
    if last_content_task and last_content_task.get("created_at"):
        try:
            last_dt = datetime.fromisoformat(str(last_content_task["created_at"]).replace("Z", "+00:00"))
            days_since_content = (now - last_dt).days
        except (ValueError, TypeError):
            pass

    # ── Review gap ─────────────────────────────────────────────────────
    review_tasks = [t for t in recent_tasks if "review" in t.get("task_type", "")]
    days_since_review = None
    if review_tasks and review_tasks[0].get("created_at"):
        try:
            last_dt = datetime.fromisoformat(str(review_tasks[0]["created_at"]).replace("Z", "+00:00"))
            days_since_review = (now - last_dt).days
        except (ValueError, TypeError):
            pass

    # ── Approval health ────────────────────────────────────────────────
    total_reviewed = approved_count + rejected_count
    approval_rate = round(approved_count / total_reviewed * 100) if total_reviewed > 0 else None

    # ── Google review urgency ──────────────────────────────────────────
    google_rating = float(brand.google_rating) if brand.google_rating else None
    review_urgency = "low"
    if google_rating is not None:
        if google_rating < 4.0:
            review_urgency = "critical"
        elif google_rating < 4.3:
            review_urgency = "high"
        elif days_since_review is None or days_since_review > 14:
            review_urgency = "medium"

    # ── Brand readiness ────────────────────────────────────────────────
    brand_readiness = {
        "constitution_confirmed": brand.brand_constitution_confirmed,
        "has_visual_dna": bool(brand.visual_dna),
        "has_competitor_brief": bool(brand.competitor_brief),
        "has_trend_brief": bool(brand.trend_brief),
        "discovery_confidence": brand.discovery_confidence,
    }
    brand_readiness_score = sum([
        20 if brand.brand_constitution_confirmed else 0,
        20 if brand.visual_dna else 0,
        20 if brand.competitor_brief else 0,
        20 if brand.trend_brief else 0,
        min(20, (brand.discovery_confidence or 0) // 5),
    ])

    # ── Content pillar gap ────────────────────────────────────────────
    confirmed_pillars = brand.content_pillars or []
    recent_task_types = [t.get("task_type", "") for t in recent_tasks[:10]]
    content_ran_this_week = any("content_ideation" in t for t in recent_task_types)

    # ── Risk signals from Google reviews ─────────────────────────────
    negative_reviews = [
        r for r in (brand.google_review_signals or [])
        if isinstance(r, dict) and (r.get("stars") or 5) <= 3
    ]

    return {
        "workspace_id": str(getattr(brand, "workspace_id", "")),
        "business_name": brand.business_name,
        "business_type": brand.business_type,
        "location": brand.location,
        "campaign_goals": brand.campaign_goals,
        "content_pillars": confirmed_pillars[:4],
        "industry": brand.business_type,

        "google": {
            "rating": google_rating,
            "review_count": brand.google_review_count,
            "negative_review_count": len(negative_reviews),
            "review_urgency": review_urgency,
            "days_since_review_response": days_since_review,
        },

        "content": {
            "days_since_last_content": days_since_content,
            "content_ran_this_week": content_ran_this_week,
            "confirmed_pillars": confirmed_pillars[:4],
            "trend_brief_available": bool(brand.trend_brief),
            "trend_brief_summary": (brand.trend_brief or "")[:200],
        },

        "approvals": {
            "pending_suggestions": pending_suggestions,
            "approval_rate_pct": approval_rate,
            "recent_approved": approved_count,
            "recent_rejected": rejected_count,
        },

        "brand_intelligence": {
            "readiness_score": brand_readiness_score,
            "readiness_details": brand_readiness,
            "competitor_brief_available": bool(brand.competitor_brief),
            "competitor_summary": (brand.competitor_brief or "")[:200],
        },

        "context": {
            "current_date": now.strftime("%d %B %Y"),
            "day_of_week": now.strftime("%A"),
            "week_number": now.isocalendar()[1],
        },
    }
