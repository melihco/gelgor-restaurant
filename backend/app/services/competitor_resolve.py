"""Resolve competitor handles from brand_contexts competitors + suggestions."""

from __future__ import annotations

import json
import re
from typing import Any


def _parse_suggested(raw: Any) -> list[str]:
    if not raw:
        return []
    if isinstance(raw, list):
        items = raw
    else:
        try:
            items = json.loads(str(raw))
        except Exception:
            # plain comma list
            return [p.strip() for p in str(raw).split(",") if p.strip()]
    out: list[str] = []
    for item in items:
        if isinstance(item, str) and item.strip():
            out.append(item.strip())
        elif isinstance(item, dict):
            name = item.get("name") or item.get("handle") or item.get("instagram")
            if name:
                out.append(str(name).strip())
    return out


def resolve_competitors_raw(
    competitors: str | None,
    suggested_competitors: str | None,
    *,
    limit: int = 5,
) -> str:
    """
    Prefer explicit competitors; fall back to suggested_competitors names/handles.
    Returns comma-separated string suitable for build_competitor_brief.
    """
    parts: list[str] = []
    seen: set[str] = set()

    def _add(entry: str) -> None:
        cleaned = entry.strip().lstrip("@")
        if not cleaned:
            return
        key = cleaned.lower()
        if key in seen:
            return
        seen.add(key)
        parts.append(cleaned if not entry.strip().startswith("@") else f"@{cleaned}")

    for chunk in (competitors or "").split(","):
        if chunk.strip():
            _add(chunk)

    # Fall back to suggestions only when the operator has not set competitors yet.
    if not parts:
        for name in _parse_suggested(suggested_competitors):
            _add(name)
            if len(parts) >= limit:
                break

    return ", ".join(parts[:limit])


def extract_verified_handles_from_brief(brief: str) -> list[str]:
    """Pull @handles from a competitor brief for optional write-back."""
    if not brief:
        return []
    found = re.findall(r"@([A-Za-z0-9._]{2,30})", brief)
    out: list[str] = []
    seen: set[str] = set()
    for h in found:
        key = h.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(h)
    return out[:5]
