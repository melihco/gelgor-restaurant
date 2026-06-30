"""Tests for the correlation-id propagation middleware.

Mounts the middleware on a minimal FastAPI app so the full service (DB, crew,
scheduler) does not need to boot — we only exercise the header/contextvar logic.
"""

from __future__ import annotations

import structlog
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.middleware.correlation import (
    CORRELATION_ID_HEADER,
    correlation_id_middleware,
)


def _build_app() -> FastAPI:
    app = FastAPI()
    app.middleware("http")(correlation_id_middleware)

    @app.get("/ping")
    async def ping():
        # The middleware should have bound the id into the structlog context.
        bound = structlog.contextvars.get_contextvars()
        return {"correlation_id": bound.get("correlation_id")}

    return app


def test_inbound_correlation_id_is_echoed_and_bound():
    client = TestClient(_build_app())
    resp = client.get("/ping", headers={CORRELATION_ID_HEADER: "trace-abc"})

    assert resp.status_code == 200
    assert resp.headers[CORRELATION_ID_HEADER] == "trace-abc"
    assert resp.json()["correlation_id"] == "trace-abc"


def test_missing_correlation_id_is_generated():
    client = TestClient(_build_app())
    resp = client.get("/ping")

    assert resp.status_code == 200
    generated = resp.headers.get(CORRELATION_ID_HEADER)
    assert generated
    assert resp.json()["correlation_id"] == generated


def test_context_is_cleared_between_requests():
    client = TestClient(_build_app())
    first = client.get("/ping", headers={CORRELATION_ID_HEADER: "first"})
    second = client.get("/ping", headers={CORRELATION_ID_HEADER: "second"})

    assert first.json()["correlation_id"] == "first"
    assert second.json()["correlation_id"] == "second"
