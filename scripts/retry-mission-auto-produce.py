#!/usr/bin/env python3
"""Re-trigger /api/auto-produce for a completed mission's content_ideation output."""
import json
import re
import sys
import urllib.request

WS = sys.argv[1] if len(sys.argv) > 1 else "5feb36f7-def7-4b4a-834f-353457de57bf"
MISSION = sys.argv[2] if len(sys.argv) > 2 else "39648603-1e3b-4f4b-b865-4cf298860efe"
CREW = "http://127.0.0.1:8000"
NEXT = "http://127.0.0.1:3000"
KEY = "smartagency-internal-dev-key"


def fetch(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def post(url, body, headers):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url, data=data, headers={**headers, "Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=600) as r:
        return r.status, json.loads(r.read())


def main():
    h = {"X-Tenant-Id": WS}
    mission = fetch(f"{CREW}/api/v1/missions/{WS}/{MISSION}", h)
    node = next((n for n in mission.get("nodes", []) if n.get("task_type") == "content_ideation"), None)
    if not node:
        print("No content_ideation node")
        sys.exit(1)
    summary = node.get("output_summary") or ""
    m = re.search(r"\[.*\]", summary, re.DOTALL)
    if not m:
        print("No ideas JSON in output_summary")
        sys.exit(1)
    ideas = json.loads(m.group())
    print(f"ideas: {len(ideas)}")

    payload = {
        "workspaceId": WS,
        "missionId": MISSION,
        "nodeKey": node.get("node_key", "digital_ideas"),
        "ideas": ideas,
        "galleryAnalysis": {},
        "brandName": "Kaçta Info",
        "bundleCards": True,
        "missionType": mission.get("type"),
        "missionTitle": mission.get("title"),
        "creativeBrief": mission.get("creative_brief"),
    }
    print("POST auto-produce (up to 6 min)...")
    status, data = post(
        f"{NEXT}/api/auto-produce",
        payload,
        {"X-Internal-Api-Key": KEY, "X-Tenant-Id": WS},
    )
    print("status", status)
    print(json.dumps(data, indent=2, ensure_ascii=False)[:2000])


if __name__ == "__main__":
    main()
