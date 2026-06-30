"""Read CrewAI token totals after crew.kickoff() for persistence in Nexus."""

from __future__ import annotations

from typing import Any

import structlog

_logger = structlog.get_logger(__name__)


def _usage_metrics(crew: Any) -> Any:
    """Best-effort extraction of CrewAI UsageMetrics from a crew/result object."""
    tu = getattr(crew, "token_usage", None)
    if tu is not None:
        return tu
    metrics = getattr(crew, "usage_metrics", None)
    if metrics is None and hasattr(crew, "calculate_usage_metrics"):
        metrics = crew.calculate_usage_metrics()
    return metrics


def total_tokens_from_crew(crew: Any) -> int:
    try:
        metrics = _usage_metrics(crew)
        if metrics is None:
            return 0
        return int(getattr(metrics, "total_tokens", 0) or 0)
    except Exception:
        return 0


def crew_usage_breakdown(crew: Any) -> dict[str, int]:
    """Full token breakdown including cached prompt tokens (caching verification).

    Faz 1.1 — OpenAI prompt caching brand-context prefix'inde otomatik devreye
    girer. `cached_prompt_tokens > 0` ise caching çalışıyor demektir.
    """
    out = {"total": 0, "prompt": 0, "completion": 0, "cached": 0}
    try:
        metrics = _usage_metrics(crew)
        if metrics is None:
            return out
        out["total"] = int(getattr(metrics, "total_tokens", 0) or 0)
        out["prompt"] = int(getattr(metrics, "prompt_tokens", 0) or 0)
        out["completion"] = int(getattr(metrics, "completion_tokens", 0) or 0)
        out["cached"] = int(getattr(metrics, "cached_prompt_tokens", 0) or 0)
    except Exception:
        pass
    return out


def log_crew_token_usage(crew: Any, *, task_type: str, mission_id: str | None = None) -> int:
    """Faz 0.1/1.1 telemetri — token kırılımını yapılandırılmış olarak loglar.

    Returns total_tokens (geriye uyumlu kullanım için).
    """
    b = crew_usage_breakdown(crew)
    cache_hit_rate = round(b["cached"] / b["prompt"], 3) if b["prompt"] else 0.0
    _logger.info(
        "crew_token_usage",
        task_type=task_type,
        mission_id=mission_id,
        total_tokens=b["total"],
        prompt_tokens=b["prompt"],
        completion_tokens=b["completion"],
        cached_prompt_tokens=b["cached"],
        cache_hit_rate=cache_hit_rate,
    )
    return b["total"]
