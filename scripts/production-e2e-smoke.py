#!/usr/bin/env python3
"""Production-oriented E2E smoke checks for SmartAgency.

This script verifies deployment readiness without mutating provider accounts.
It checks liveness/readiness, tenant-scoped security, onboarding, billing usage,
operations telemetry, and the core agent catalog.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from typing import Any


DEFAULT_API_URL = "http://127.0.0.1:5050"
DEFAULT_WEB_URL = "http://127.0.0.1:3000"
DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"
DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"
DEFAULT_OFFICE_ID = "00000000-0000-0000-0000-000000000002"


class SmokeFailure(RuntimeError):
    pass


def request_json(url: str, headers: dict[str, str], timeout: int = 20) -> Any:
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload) if payload else None
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise SmokeFailure(f"GET {url} failed: HTTP {exc.code} {body[:500]}") from exc
    except urllib.error.URLError as exc:
        raise SmokeFailure(f"GET {url} failed: {exc.reason}") from exc


def request_text(url: str, timeout: int = 20) -> str:
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise SmokeFailure(f"GET {url} failed: HTTP {exc.code} {body[:500]}") from exc
    except urllib.error.URLError as exc:
        raise SmokeFailure(f"GET {url} failed: {exc.reason}") from exc


def assert_ok(condition: bool, message: str) -> None:
    if not condition:
        raise SmokeFailure(message)


def run(args: argparse.Namespace) -> dict[str, Any]:
    api_url = args.api_url.rstrip("/")
    web_url = args.web_url.rstrip("/")
    headers = {
        "X-Tenant-Id": args.tenant_id,
        "X-User-Id": args.user_id,
        "X-Office-Id": args.office_id,
    }

    live = request_json(f"{api_url}/health/live", headers)
    assert_ok(live.get("status") == "ok", f"API liveness is not ok: {live}")

    ready = request_json(f"{api_url}/health/ready", headers)
    assert_ok(ready.get("status") in {"ok", "degraded"}, f"API readiness returned unexpected status: {ready}")
    checks = ready.get("checks") or {}
    assert_ok("database" in checks, "Readiness response is missing database check.")
    assert_ok("orchestration" in checks, "Readiness response is missing orchestration check.")

    security = request_json(f"{api_url}/api/security/me", headers)
    assert_ok(bool(security.get("role")), f"Security context is missing role: {security}")
    assert_ok(isinstance(security.get("permissions"), list), f"Security context is missing permissions: {security}")

    onboarding = request_json(f"{api_url}/api/setup/onboarding-status", headers)
    assert_ok("score" in onboarding, f"Onboarding status is missing score: {onboarding}")

    usage = request_json(f"{api_url}/api/packages/usage", headers)
    assert_ok("agentRuns" in usage, f"Usage response is missing agentRuns: {usage}")
    assert_ok("providerActions" in usage, f"Usage response is missing providerActions: {usage}")

    operations = request_json(f"{api_url}/api/operations/summary", headers)
    assert_ok("health" in operations, f"Operations summary is missing health: {operations}")

    agents = request_json(f"{api_url}/api/agents/office/{args.office_id}", headers)
    assert_ok(isinstance(agents, list), f"Agent catalog should be a list: {agents}")

    web_checked = False
    if args.check_web:
        html = request_text(web_url)
        assert_ok("<html" in html.lower() or "__next" in html.lower(), "Web app did not return an HTML/Next response.")
        web_checked = True

    return {
        "status": "ok",
        "api_url": api_url,
        "web_checked": web_checked,
        "readiness_status": ready.get("status"),
        "role": security.get("role"),
        "onboarding_score": onboarding.get("score"),
        "agent_count": len(agents),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run production E2E smoke checks.")
    parser.add_argument("--api-url", default=DEFAULT_API_URL)
    parser.add_argument("--web-url", default=DEFAULT_WEB_URL)
    parser.add_argument("--tenant-id", default=DEFAULT_TENANT_ID)
    parser.add_argument("--user-id", default=DEFAULT_USER_ID)
    parser.add_argument("--office-id", default=DEFAULT_OFFICE_ID)
    parser.add_argument("--check-web", action="store_true")
    args = parser.parse_args()

    try:
        print(json.dumps(run(args), indent=2))
        return 0
    except SmokeFailure as exc:
        print(json.dumps({"status": "failed", "error": str(exc)}, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
