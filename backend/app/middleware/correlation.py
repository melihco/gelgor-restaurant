"""Correlation-id propagation middleware.

Stitches request traces across the three runtimes (browser → Next.js → .NET /
Python). Reads an inbound ``X-Correlation-Id`` header (forwarded by the Next.js
BFF or the .NET edge) or mints a fresh one, binds it to structlog's contextvars
so every log line emitted while handling the request carries it, and echoes the
id back on the response.
"""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable

import structlog
from starlette.requests import Request
from starlette.responses import Response

CORRELATION_ID_HEADER = "X-Correlation-Id"


async def correlation_id_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    correlation_id = request.headers.get(CORRELATION_ID_HEADER) or uuid.uuid4().hex
    structlog.contextvars.bind_contextvars(correlation_id=correlation_id)
    try:
        response = await call_next(request)
        response.headers[CORRELATION_ID_HEADER] = correlation_id
        return response
    finally:
        structlog.contextvars.clear_contextvars()
