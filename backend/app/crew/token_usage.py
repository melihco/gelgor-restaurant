"""Read CrewAI token totals after crew.kickoff() for persistence in Nexus."""

from __future__ import annotations

from typing import Any


def total_tokens_from_crew(crew: Any) -> int:
    try:
        tu = getattr(crew, "token_usage", None)
        if tu is not None:
            return int(getattr(tu, "total_tokens", 0) or 0)
        metrics = getattr(crew, "usage_metrics", None)
        if metrics is None and hasattr(crew, "calculate_usage_metrics"):
            metrics = crew.calculate_usage_metrics()
        if metrics is None:
            return 0
        return int(getattr(metrics, "total_tokens", 0) or 0)
    except Exception:
        return 0
