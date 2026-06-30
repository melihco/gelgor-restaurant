"""Gallery analysis/match-stats and review queue endpoints.

Part of the brand-context router package; mounted by ``__init__``.
"""
# ruff: noqa: F403, F405  — intentional star re-export from the package _shared module
from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.brand_context._shared import *

router = APIRouter()


@router.post("/{workspace_id}/gallery-analysis")
async def save_gallery_analysis(
    workspace_id: uuid.UUID,
    req: GalleryAnalysisSaveRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Persist gallery photo analysis results to avoid re-running expensive vision calls."""
    import json as _json
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Brand context not found")
    # Merge with existing analysis (keep entries for URLs not in current batch)
    existing: dict = {}
    try:
        existing = _json.loads(ctx.gallery_analysis or "{}")
    except Exception:
        pass
    for entry in req.results:
        existing[entry.url] = entry.model_dump(by_alias=True)
    ctx.gallery_analysis = _json.dumps(existing, ensure_ascii=False)
    db.add(ctx)
    await db.commit()
    return {"saved": len(req.results), "total": len(existing)}

@router.get("/{workspace_id}/gallery-analysis")
async def get_gallery_analysis(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Load persisted gallery analysis results."""
    import json as _json
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Brand context not found")
    try:
        data = _json.loads(ctx.gallery_analysis or "{}")
        if not isinstance(data, dict):
            data = {}
    except Exception:
        data = {}
    # Return the flat {url: analysis} dict directly — frontend uses it as-is
    return data

@router.post("/{workspace_id}/gallery-match-stats")
async def append_gallery_match_stats(
    workspace_id: uuid.UUID,
    req: GalleryMatchStatsRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Append match scores, keeping only the most recent ~40 (rolling window)."""
    import json as _json
    from datetime import datetime, timezone
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Brand context not found")
    prev: list[float] = []
    try:
        parsed = _json.loads(ctx.gallery_match_stats or "{}")
        if isinstance(parsed, dict) and isinstance(parsed.get("scores"), list):
            prev = [float(s) for s in parsed["scores"] if isinstance(s, (int, float))]
    except Exception:
        prev = []
    incoming = [float(s) for s in req.scores if isinstance(s, (int, float))]
    merged = (prev + incoming)[-_MATCH_LOG_LIMIT:]
    ctx.gallery_match_stats = _json.dumps(
        {"scores": merged, "updatedAt": datetime.now(timezone.utc).isoformat()},
        ensure_ascii=False,
    )
    db.add(ctx)
    await db.commit()
    return {"count": len(merged), "added": len(incoming)}

@router.get("/{workspace_id}/gallery-match-stats")
async def get_gallery_match_stats(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Load the rolling match-score log."""
    import json as _json
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Brand context not found")
    try:
        data = _json.loads(ctx.gallery_match_stats or "{}")
        if not isinstance(data, dict):
            data = {}
    except Exception:
        data = {}
    scores = data.get("scores") if isinstance(data.get("scores"), list) else []
    return {"scores": scores, "updatedAt": data.get("updatedAt")}

@router.get("/{workspace_id}/reviews/pending")
async def get_pending_reviews(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list:
    from app.services.human_review_service import get_pending_reviews as _get
    return await _get(db, workspace_id)

@router.post("/{workspace_id}/reviews/submit")
async def submit_review(
    workspace_id: uuid.UUID,
    req: ReviewSubmitRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    from app.services.human_review_service import submit_review as _submit
    return await _submit(db, req.review_id, req.status, req.notes or None,
                         req.edited_content or None, req.reviewer_name or None)

@router.get("/{workspace_id}/reviews/stats")
async def review_stats(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    from app.services.human_review_service import get_review_stats as _stats
    return await _stats(db, workspace_id)
