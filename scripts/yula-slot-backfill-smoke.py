#!/usr/bin/env python3
"""Quick slot backfill smoke — verify template bind + match_quality on live."""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request

WEB = "https://smartagency-web.onrender.com"
API = "https://smartagency-api.onrender.com"
TENANT = "f00e3308-ebbe-4d75-8592-12d52e7ff1aa"
MISSION = "07acb4c7-dc1f-40c5-ad25-42f4ec42c2d3"
KEY = "smartagency-internal-dev-key"
OFFICE = "00000000-0000-0000-0000-000000000001"

BACKFILL_KEYS = sys.argv[1:] or ["4:designed_post"]
AUDIT_PATH = "/tmp/yula_mission_audit.json"


def http_json(method: str, url: str, headers: dict, body: dict | None = None) -> tuple[int, object]:
    data = None
    hdrs = {**headers, "Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode()
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        try:
            parsed = json.loads(detail)
        except json.JSONDecodeError:
            parsed = {"raw": detail[:600]}
        return exc.code, parsed


def main() -> None:
    audit = json.load(open(AUDIT_PATH))
    payload = {
        "workspaceId": TENANT,
        "missionId": MISSION,
        "nodeKey": "ideas",
        "ideas": audit["ideas"],
        "missionTitle": audit.get("title", ""),
        "bundleCards": False,
        "skipArtifactDedupe": True,
        "slotBackfillPass": True,
        "backfillSlotKeys": BACKFILL_KEYS,
    }
    headers = {
        "X-Tenant-Id": TENANT,
        "X-Office-Id": OFFICE,
        "X-Internal-Api-Key": KEY,
    }

    print(f"==> POST auto-produce slots={BACKFILL_KEYS}")
    code, result = http_json("POST", f"{WEB}/api/auto-produce", headers, payload)
    print(f"    status={code}")
    if code != 200:
        print(json.dumps(result, ensure_ascii=False, indent=2)[:2000])
        raise SystemExit(1)

    with open("/tmp/yula_slot_backfill_last.json", "w") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    results = result.get("results") or []
    if not isinstance(results, list):
        results = []

    for row in results:
        if not isinstance(row, dict):
            continue
        meta = row.get("metadata") or {}
        slot = row.get("slotKey")
        print(
            f"\n── result {row.get('id')} slot={slot} ──\n"
            f"  catalog_slot_key: {meta.get('catalog_slot_key')}\n"
            f"  template: {meta.get('brand_design_template_name')}\n"
            f"  match_quality: {meta.get('brand_design_template_match_quality')}\n"
            f"  fal_designer_produced: {meta.get('fal_designer_produced')}\n"
            f"  visual_pipeline_steps: {meta.get('visual_pipeline_steps')}"
        )

    # Prefer the backfill slot we asked for
    target = BACKFILL_KEYS[0] if BACKFILL_KEYS else None
    match_row = next((r for r in results if r.get("slotKey") == target), results[0] if results else None)
    meta = (match_row or {}).get("metadata") or {}
    mq = meta.get("brand_design_template_match_quality")
    if mq == "hard":
        print("\n✓ PASS — match_quality=hard")
    else:
        print(f"\n✗ FAIL — match_quality={mq!r} (deploy a3333a9+ may still be rolling)")
        raise SystemExit(2)


if __name__ == "__main__":
    main()
