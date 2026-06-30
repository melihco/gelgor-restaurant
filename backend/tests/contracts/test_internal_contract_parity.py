"""Drift guard: Python internal models must match the shared SSOT manifest.

The manifest at ``contracts/internal-agent-contract.json`` is the single source of
truth for the .NET <-> Python orchestration contract. If a field is added to (or
removed from) the Pydantic models without updating the manifest, this test fails
— turning silent schema drift into a CI failure. The .NET side has a mirror test.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.schemas.internal import (
    InternalAgentExecutionRequest,
    InternalAgentExecutionResponse,
    InternalBrandContext,
)

_MANIFEST_PATH = (
    Path(__file__).resolve().parents[3] / "contracts" / "internal-agent-contract.json"
)


def _manifest() -> dict:
    return json.loads(_MANIFEST_PATH.read_text(encoding="utf-8"))


def test_manifest_file_exists():
    assert _MANIFEST_PATH.exists(), f"SSOT manifest missing at {_MANIFEST_PATH}"


@pytest.mark.parametrize(
    "model, model_name",
    [
        (InternalBrandContext, "InternalBrandContext"),
        (InternalAgentExecutionRequest, "InternalAgentExecutionRequest"),
        (InternalAgentExecutionResponse, "InternalAgentExecutionResponse"),
    ],
)
def test_pydantic_model_matches_manifest(model, model_name):
    expected = set(_manifest()["models"][model_name]["fields"])
    actual = set(model.model_fields.keys())

    missing = expected - actual
    extra = actual - expected
    assert not missing, f"{model_name} is missing manifest fields: {sorted(missing)}"
    assert not extra, (
        f"{model_name} has fields not in the SSOT manifest: {sorted(extra)}. "
        f"Update contracts/internal-agent-contract.json (and the .NET model)."
    )


def test_dotnet_forwarded_fields_are_subset_of_brand_context():
    """Every field .NET forwards must be a known InternalBrandContext field."""
    models = _manifest()["models"]["InternalBrandContext"]
    forwarded = set(models["dotnetForwards"])
    known = set(models["fields"])
    unknown = forwarded - known
    assert not unknown, (
        f".NET forwards fields Python does not define (would be silently dropped): "
        f"{sorted(unknown)}"
    )
