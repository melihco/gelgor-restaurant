"""Shared pytest fixtures for the Python backend test suite.

Keep fixtures dependency-free (no live DB / network). They exist so the core
production-path tests can run fast and deterministically in CI.
"""

from __future__ import annotations

import types
from typing import Any

import pytest


class SettingsStub:
    """Minimal stand-in for ``app.config.Settings`` used by feature-flag branches.

    Only the attributes read by the code under test are modelled; everything
    else returns ``None`` so accidental new reads surface loudly in tests.
    """

    def __init__(self, **overrides: Any) -> None:
        self.use_bullmq_executor = overrides.pop("use_bullmq_executor", False)
        self.use_celery_orchestrator = overrides.pop("use_celery_orchestrator", False)
        self.production_max_concurrent_per_workspace = overrides.pop(
            "production_max_concurrent_per_workspace", 1
        )
        for key, value in overrides.items():
            setattr(self, key, value)


@pytest.fixture
def patch_settings(monkeypatch: pytest.MonkeyPatch):
    """Install a ``SettingsStub`` as the return value of ``app.config.get_settings``.

    Usage::

        def test_x(patch_settings):
            patch_settings(use_bullmq_executor=True)
    """

    def _install(**overrides: Any) -> SettingsStub:
        stub = SettingsStub(**overrides)
        monkeypatch.setattr("app.config.get_settings", lambda: stub, raising=True)
        return stub

    return _install


@pytest.fixture
def brand_stub() -> types.SimpleNamespace:
    """A lightweight brand object with the attributes the production path reads."""
    return types.SimpleNamespace(
        workspace_id="ws-test",
        business_name="Test Brand",
        brand_theme={},
    )
