#!/usr/bin/env python3
"""Smoke test for scheduled story/reel templates.

This checks the live-critical scheduled content path without calling external
providers:

1. Next BFF can list scheduled templates.
2. Next BFF can create a template for the workspace.
3. Python active-feed resolver marks it active for the current schedule window.
4. Next BFF can delete the template (cleanup).

It intentionally uses a stable sample media URL instead of uploading to R2, so
the script is fast and safe for CI. Upload/playback are covered by frontend/E2E
browser tests in the next sprint.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo


DEFAULT_WEB_URL = "http://127.0.0.1:3000"
DEFAULT_CREW_URL = "http://127.0.0.1:8000"
DEFAULT_WORKSPACE_ID = "fa91b75d-0392-48e9-8cd8-2406a9d2042f"
DEFAULT_INTERNAL_KEY = "smartagency-internal-dev-key"
ISTANBUL = ZoneInfo("Europe/Istanbul")


class SmokeFailure(RuntimeError):
    pass


def request_json(
    url: str,
    *,
    method: str = "GET",
    body: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 30,
) -> tuple[int, Any]:
    payload = json.dumps(body).encode("utf-8") if body is not None else None
    req_headers = dict(headers or {})
    if body is not None:
        req_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=payload, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            data = json.loads(raw) if raw else None
        except Exception:
            data = {"raw": raw[:500]}
        raise SmokeFailure(f"{method} {url} failed: HTTP {exc.code} {data}") from exc
    except urllib.error.URLError as exc:
        raise SmokeFailure(f"{method} {url} failed: {exc.reason}") from exc


def choose_free_slot(templates: list[dict[str, Any]]) -> int:
    used = {int(t.get("slot_index", 0)) for t in templates if t.get("slot_index")}
    for slot in range(1, 11):
        if slot not in used:
            return slot
    raise SmokeFailure("workspace already has 10 scheduled templates; cannot run non-destructive smoke")


def schedule_window(now: datetime) -> tuple[list[int], str, str]:
    local = now.astimezone(ISTANBUL)
    start = local - timedelta(minutes=1)
    end = local + timedelta(minutes=30)
    return [local.weekday()], start.strftime("%H:%M"), end.strftime("%H:%M")


def run(args: argparse.Namespace) -> dict[str, Any]:
    web = args.web_url.rstrip("/")
    crew = args.crew_url.rstrip("/")
    workspace_id = args.workspace_id
    smoke_id = uuid.uuid4().hex[:8]

    tenant_headers = {"X-Tenant-Id": workspace_id}
    crew_headers = {
        "X-Tenant-Id": workspace_id,
        "X-Internal-Api-Key": args.internal_key,
    }

    list_url = f"{web}/api/brand-context/{workspace_id}/scheduled-templates"
    _, existing = request_json(list_url, headers=tenant_headers)
    if not isinstance(existing, list):
        raise SmokeFailure(f"expected template list from BFF, got {existing!r}")

    slot = choose_free_slot(existing)
    days, start_time, end_time = schedule_window(datetime.now(tz=ISTANBUL))
    name = f"Smoke Scheduled Story {smoke_id}"
    create_payload = {
        "slot_index": slot,
        "name": name,
        "format": "story",
        "media_items": [
            {
                "url": "https://filesamples.com/samples/video/mp4/sample_640x360.mp4",
                "type": "video",
                "uploaded_at": datetime.now(tz=ISTANBUL).isoformat(),
            }
        ],
        "schedule_type": "specific_days",
        "schedule_days": days,
        "schedule_time": start_time,
        "schedule_end_time": end_time,
        "timezone": "Europe/Istanbul",
        "category": "smoke_test",
    }

    status, created = request_json(
        list_url,
        method="POST",
        body=create_payload,
        headers=tenant_headers,
    )
    if status not in (200, 201) or not isinstance(created, dict) or not created.get("id"):
        raise SmokeFailure(f"create returned unexpected response: {status} {created!r}")

    template_id = str(created["id"])
    cleanup_error: str | None = None
    active_hit = False
    try:
        active_url = f"{crew}/api/v1/scheduled-templates/{workspace_id}/feed/active"
        _, active_items = request_json(active_url, headers=crew_headers)
        if not isinstance(active_items, list):
            raise SmokeFailure(f"expected active list from Python, got {active_items!r}")
        active_hit = any(str(item.get("template_id")) == template_id for item in active_items)
        if not active_hit:
            raise SmokeFailure(
                f"created template {template_id} was not active; active ids="
                f"{[item.get('template_id') for item in active_items]}"
            )
    finally:
        delete_url = f"{list_url}/{template_id}"
        try:
            request_json(delete_url, method="DELETE", headers=tenant_headers)
        except Exception as exc:  # cleanup should not hide primary failure
            cleanup_error = str(exc)

    if cleanup_error:
        raise SmokeFailure(f"template was active, but cleanup failed: {cleanup_error}")

    return {
        "status": "ok",
        "workspace_id": workspace_id,
        "template_id": template_id,
        "slot_index": slot,
        "schedule_days": days,
        "schedule_time": start_time,
        "schedule_end_time": end_time,
        "active_hit": active_hit,
        "cleanup_error": cleanup_error,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run scheduled template smoke test.")
    parser.add_argument("--web-url", default=DEFAULT_WEB_URL)
    parser.add_argument("--crew-url", default=DEFAULT_CREW_URL)
    parser.add_argument("--workspace-id", default=DEFAULT_WORKSPACE_ID)
    parser.add_argument("--internal-key", default=DEFAULT_INTERNAL_KEY)
    args = parser.parse_args()

    try:
        print(json.dumps(run(args), indent=2, ensure_ascii=False))
        return 0
    except SmokeFailure as exc:
        print(json.dumps({"status": "failed", "error": str(exc)}, indent=2, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
