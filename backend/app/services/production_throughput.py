"""Production throughput — factory drain batch sizing."""

from __future__ import annotations

import os
from typing import Any


def _read_brand_throughput(brand_theme: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(brand_theme, dict):
        return {}
    engines = brand_theme.get("production_engines") or brand_theme.get("productionEngines") or {}
    if not isinstance(engines, dict):
        return {}
    throughput = engines.get("throughput") or {}
    return throughput if isinstance(throughput, dict) else {}


def resolve_factory_drain_batch(brand_theme: dict[str, Any] | None = None) -> int:
    """Slots claimed + produced per auto-produce backfill call (1–5)."""
    throughput = _read_brand_throughput(brand_theme)
    brand_batch = throughput.get("factory_drain_batch")
    try:
        # Default 1 — one slot per auto-produce call avoids workspace lock 409 storms
        # and duplicate fal.ai requests when batch>1 races on the same mission.
        env_batch = int(os.getenv("PRODUCTION_FACTORY_DRAIN_BATCH", "1"))
    except ValueError:
        env_batch = 1

    if isinstance(brand_batch, int) and brand_batch > 0:
        n = brand_batch
    else:
        n = env_batch
    return max(1, min(int(n), 5))
