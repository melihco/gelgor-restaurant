"""Characterization tests for the shared brand-execution enrichment helpers.

Locks the behavior the three execution entrypoints rely on:
  * truthy-guard learning assignment (orchestrator/executor) vs. always-assign
    (agent_execution_service, set_when_empty=True),
  * gallery usage plumbing (fetch -> apply with the tenant id).
"""

from __future__ import annotations

import asyncio
import types

import app.services.brand_execution_context as bec


def _brand() -> types.SimpleNamespace:
    return types.SimpleNamespace(learning_context="PRIOR")


def _patch_learning(monkeypatch, prompt_text: str, approved=("a", "b")) -> None:
    snapshot = types.SimpleNamespace(approved_examples=list(approved))

    async def _fake_snapshot(_db, _tenant_id):
        return snapshot

    monkeypatch.setattr(bec, "build_tenant_learning_snapshot", _fake_snapshot)
    monkeypatch.setattr(bec, "build_learning_context_prompt", lambda _s: prompt_text)


def test_learning_assigned_when_prompt_truthy(monkeypatch) -> None:
    _patch_learning(monkeypatch, "LEARN-BLOCK")
    brand = _brand()
    snap = asyncio.run(bec.apply_learning_context(None, brand, "ws-1"))
    assert brand.learning_context == "LEARN-BLOCK"
    assert snap.approved_examples == ["a", "b"]


def test_learning_not_overwritten_when_empty_and_guarded(monkeypatch) -> None:
    _patch_learning(monkeypatch, "")
    brand = _brand()
    asyncio.run(bec.apply_learning_context(None, brand, "ws-1"))
    # truthy-guard: prior value preserved when prompt is empty
    assert brand.learning_context == "PRIOR"


def test_learning_overwritten_when_empty_and_set_when_empty(monkeypatch) -> None:
    _patch_learning(monkeypatch, "")
    brand = _brand()
    asyncio.run(bec.apply_learning_context(None, brand, "ws-1", set_when_empty=True))
    assert brand.learning_context == ""


def test_gallery_usage_fetches_then_applies(monkeypatch) -> None:
    calls: dict[str, object] = {}

    async def _fake_fetch(tenant_id):
        calls["tenant_id"] = tenant_id
        return {"usage": 1}

    def _fake_apply(brand, usage):
        calls["applied_to"] = brand
        calls["usage"] = usage

    import app.services.gallery_usage_service as gus

    monkeypatch.setattr(gus, "fetch_gallery_usage_by_type", _fake_fetch)
    monkeypatch.setattr(gus, "apply_gallery_usage_to_brand", _fake_apply)

    brand = _brand()
    asyncio.run(bec.apply_gallery_usage(brand, "ws-9"))

    assert calls["tenant_id"] == "ws-9"
    assert calls["applied_to"] is brand
    assert calls["usage"] == {"usage": 1}


def test_learning_task_types_matches_orchestrator_executor_set() -> None:
    assert bec.LEARNING_TASK_TYPES == frozenset(
        {
            "content_ideation",
            "content_calendar",
            "content_strategy",
            "single_review_response",
            "review_analysis",
            "visual_design_cards",
        }
    )
