"""Shared imports, helpers, logger and module-level constants for the
brand-context router package.

This is an intentional re-export aggregation module: every name bound here
(including the private ``_`` helpers, constants and pydantic aliases used by the
moved endpoint bodies) is re-exported via ``__all__`` so sub-routers only need a
single ``from ._shared import *``. The dynamic ``__all__`` guarantees no moved
body loses access to a module-level name during the split.
"""
# ruff: noqa: F401  — re-export aggregation: imports below are intentionally surfaced via __all__
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel as _AutoRenderModel
from pydantic import BaseModel as _BM
from pydantic import BaseModel as _BM2
from pydantic import BaseModel as _BaseModel
from pydantic import BaseModel as _LLMModel
from pydantic import BaseModel as _TplModel
from pydantic import BaseModel as _VideoModel
from pydantic import BaseModel as _VideoPackModel
from pydantic import ConfigDict as _ConfigDict
from pydantic import Field as _Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.config import get_settings
from app.crew.brand_analyzer import analyze_brand
from app.models.brand_context import BrandPostTemplate
from app.schemas.brand_chatbot import BrandChatbotProfilePatch
from app.schemas.brand_context import (
    BrandAnalyzeRequest,
    BrandAnalyzeResponse,
    BrandContextCreate,
    BrandContextRead,
    BrandContextUpdate,
    BrandPostTemplateCreate,
    BrandPostTemplateRead,
    BrandPostTemplateUpdate,
    ConfirmConstitutionRequest,
    SourceStatus,
)
from app.schemas.brand_theme import AiThemeSettingsPatch, BrandThemeSaveRequest
from app.schemas.brand_vibe import BrandVibeSaveRequest, ScrapeRefAccountsRequest
from app.services import brand_context_service

logger = structlog.get_logger()

async def _discover_competitor_suggestions(
    brand_name: str,
    business_type: str,
    location: str,
    perplexity_api_key: str = "",
    perplexity_model: str = "sonar",
    openai_api_key: str = "",
) -> list[str]:
    """
    Use Perplexity (preferred) or OpenAI to discover 4-6 real competitor names
    for the given brand. Returns a list of business name strings.
    """
    import re as _re

    import httpx as _httpx

    query = (
        f"List 5 real competitors of '{brand_name}', a {business_type} in {location or 'Turkey'}. "
        f"Return ONLY a JSON array of business names, no explanation. "
        f"Example: [\"Competitor A\", \"Competitor B\", \"Competitor C\"]"
    )

    # Try Perplexity first
    if perplexity_api_key:
        try:
            async with _httpx.AsyncClient(timeout=20) as client:
                r = await client.post(
                    "https://api.perplexity.ai/chat/completions",
                    headers={"Authorization": f"Bearer {perplexity_api_key}"},
                    json={
                        "model": perplexity_model or "sonar",
                        "messages": [{"role": "user", "content": query}],
                        "max_tokens": 200,
                    },
                )
                if r.status_code == 200:
                    content = r.json()["choices"][0]["message"]["content"].strip()
                    arr_match = _re.search(r"\[.*?\]", content, _re.DOTALL)
                    if arr_match:
                        import json as _json
                        names = _json.loads(arr_match.group(0))
                        if isinstance(names, list):
                            return [str(n).strip() for n in names if str(n).strip()][:6]
        except Exception:
            pass

    # Fallback: OpenAI
    if openai_api_key:
        try:
            async with _httpx.AsyncClient(timeout=20) as client:
                r = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {openai_api_key}"},
                    json={
                        "model": "gpt-4o-mini",
                        "max_tokens": 150,
                        "messages": [{"role": "user", "content": query}],
                    },
                )
                if r.status_code == 200:
                    content = r.json()["choices"][0]["message"]["content"].strip()
                    arr_match = _re.search(r"\[.*?\]", content, _re.DOTALL)
                    if arr_match:
                        import json as _json
                        names = _json.loads(arr_match.group(0))
                        if isinstance(names, list):
                            return [str(n).strip() for n in names if str(n).strip()][:6]
        except Exception:
            pass

    return []

def _build_source_status(
    attempted: bool,
    data: dict,
    error_msg: str,
    data_point_keys: list[tuple[str, str]],
) -> SourceStatus:
    """Build a SourceStatus from a raw source data dict."""
    ok = data.get("raw_fetch_ok", False)
    return SourceStatus(
        attempted=attempted,
        ok=ok,
        error=None if ok else (error_msg if attempted else None),
        data_points=[label for label, key in data_point_keys if data.get(key)],
    )

_MATCH_LOG_LIMIT = 40

_DEFAULT_ANNOUNCEMENT_LIBRARY = {
    "event": "luxury_bottom",
    "campaign": "campaign_badge",
    "announcement": "editorial_left",
    "default_format": "story",
}

# Re-export every module-level name (public deps + private helpers/constants/
# pydantic aliases) so ``from ._shared import *`` makes the moved endpoint bodies
# resolve identically to the pre-split single module. Built dynamically to stay
# exhaustive — adding a shared import above needs no change here.
__all__ = [_n for _n in list(globals()) if not _n.startswith("__")]
