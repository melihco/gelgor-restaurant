"""Characterization matrix for engine.get_llm.

Locks the LLM routing decisions (resolved model string, api_key, max_tokens cap)
across every branch so the strategy-list refactor is provably behavior-identical.
``LLM`` is replaced with a recorder so no crewai/network behavior is exercised.
"""

from __future__ import annotations

import types

import pytest

import app.crew.engine as engine


class _FakeLLM:
    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.model = kwargs.get("model")


def _settings(**over):
    base = dict(
        crewai_llm_provider="openai",
        ollama_model="llama3",
        ollama_base_url="http://localhost:11434",
        anthropic_api_key="",
        openai_api_key="sk-openai",
        anthropic_model="claude-x",
        openai_model="gpt-4o",
        openai_content_model="",
        openai_lite_model="gpt-4o-mini",
        lite_structural_tasks_enabled=False,
        llm_max_tokens_cap=0,
    )
    base.update(over)
    return types.SimpleNamespace(**base)


def _brand(provider=None, model=None):
    return types.SimpleNamespace(
        preferred_llm_provider=provider,
        preferred_llm_model=model,
        tenant_id="t-1",
    )


@pytest.fixture(autouse=True)
def _patch_llm(monkeypatch):
    monkeypatch.setattr(engine, "LLM", _FakeLLM)


def _install(monkeypatch, **over):
    monkeypatch.setattr(engine, "get_settings", lambda: _settings(**over))


def test_ollama_override(monkeypatch):
    _install(monkeypatch, crewai_llm_provider="ollama")
    llm = engine.get_llm()
    assert llm.model == "ollama/llama3"
    assert llm.kwargs["base_url"] == "http://localhost:11434"


def test_tenant_override_anthropic(monkeypatch):
    _install(monkeypatch, anthropic_api_key="sk-ant")
    llm = engine.get_llm("content_ideation", _brand("anthropic", "claude-opus"))
    assert llm.model == "anthropic/claude-opus"
    assert llm.kwargs["api_key"] == "sk-ant"


def test_tenant_override_openai(monkeypatch):
    _install(monkeypatch)
    llm = engine.get_llm("content_ideation", _brand("openai", "gpt-4o-mini"))
    assert llm.model == "openai/gpt-4o-mini"


def test_tenant_override_ignored_when_provider_key_missing(monkeypatch):
    # anthropic requested but no anthropic key -> falls through to default openai
    _install(monkeypatch, anthropic_api_key="")
    llm = engine.get_llm("review_analysis", _brand("anthropic", "claude-opus"))
    assert llm.model == "openai/gpt-4o"


def test_lite_model_task(monkeypatch):
    _install(monkeypatch)
    llm = engine.get_llm("traffic_analysis")
    assert llm.model == "openai/gpt-4o-mini"


def test_structural_lite_off_by_default(monkeypatch):
    _install(monkeypatch)
    llm = engine.get_llm("content_calendar")
    # flag off -> stays on full model (content_* default branch)
    assert llm.model == "openai/gpt-4o"


def test_structural_lite_on(monkeypatch):
    _install(monkeypatch, lite_structural_tasks_enabled=True)
    llm = engine.get_llm("content_calendar")
    assert llm.model == "openai/gpt-4o-mini"


def test_gpt_preferred_task_uses_model(monkeypatch):
    _install(monkeypatch)
    llm = engine.get_llm("campaign_analysis")
    assert llm.model == "openai/gpt-4o"


def test_gpt_preferred_task_prefers_content_model(monkeypatch):
    _install(monkeypatch, openai_content_model="gpt-4o-content")
    llm = engine.get_llm("campaign_analysis")
    assert llm.model == "openai/gpt-4o-content"


def test_global_anthropic_fallback(monkeypatch):
    _install(monkeypatch, crewai_llm_provider="anthropic", anthropic_api_key="sk-ant")
    llm = engine.get_llm()
    assert llm.model == "anthropic/claude-x"


def test_content_task_uses_content_model(monkeypatch):
    _install(monkeypatch, openai_content_model="gpt-4o-content")
    llm = engine.get_llm("content_ideation")
    assert llm.model == "openai/gpt-4o-content"


def test_default_openai_model(monkeypatch):
    _install(monkeypatch)
    llm = engine.get_llm()
    assert llm.model == "openai/gpt-4o"


def test_token_cap_applied(monkeypatch):
    _install(monkeypatch, llm_max_tokens_cap=1234)
    llm = engine.get_llm()
    assert llm.kwargs.get("max_tokens") == 1234


def test_token_cap_absent_when_zero(monkeypatch):
    _install(monkeypatch)
    llm = engine.get_llm()
    assert "max_tokens" not in llm.kwargs
