"""brand_context router package.

Splits the former 3k-line module into focused sub-routers. The aggregated
``router`` is mounted unchanged in app.api.v1.router with prefix /brand-context.
"""
from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.brand_context import core, gallery_reviews, identity, templates

router = APIRouter()
router.include_router(core.router)
router.include_router(identity.router)
router.include_router(templates.router)
router.include_router(gallery_reviews.router)

__all__ = ["router"]
