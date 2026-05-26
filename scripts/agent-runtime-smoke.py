#!/usr/bin/env python3
"""Smoke test SmartAgency agent runtime wiring.

Default mode checks service health and verifies that the four core agents exist.
Use --execute to run the full .NET -> Python CrewAI -> artifact/action path.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


DEFAULT_API_URL = "http://127.0.0.1:5050"
DEFAULT_CREW_URL = "http://127.0.0.1:8000"
DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"
DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"
DEFAULT_OFFICE_ID = "00000000-0000-0000-0000-000000000002"

AGENT_TYPE_BY_NUMBER = {
    0: "AiCeo",
    1: "BlogWriter",
    2: "SocialMediaDesigner",
    3: "InstagramContentGenerator",
    4: "UiUxDesigner",
    5: "VideoEditor",
    6: "SeoSpecialist",
    7: "GoogleAdsAnalyst",
    8: "CustomerReviewResponder",
    9: "ChatbotManager",
    10: "AiStrategist",
    11: "AnalyticsAnalyst",
}

TASK_STATUS_BY_NUMBER = {
    0: "Pending",
    1: "Queued",
    2: "InProgress",
    3: "WaitingForDependency",
    4: "WaitingForApproval",
    5: "Approved",
    6: "Rejected",
    7: "RevisionRequested",
    8: "Completed",
    9: "Failed",
    10: "Cancelled",
}


@dataclass(frozen=True)
class SmokeScenario:
    label: str
    agent_type: str
    task_type: str
    input_data: dict[str, Any]
    expect_action_types: tuple[str, ...]


SCENARIOS = [
    SmokeScenario(
        label="Analytics traffic report",
        agent_type="AnalyticsAnalyst",
        task_type="traffic_analysis",
        input_data={
            "dateRange": "last_30_days",
            "sessions": 1240,
            "conversions": 18,
            "topChannels": ["organic", "paid", "direct"],
        },
        expect_action_types=("log_analytics_report",),
    ),
    SmokeScenario(
        label="Google Ads optimization",
        agent_type="GoogleAdsAnalyst",
        task_type="auto_budget_optimize",
        input_data={
            "campaigns": [
                {"campaign_id": "brand-search", "name": "Brand Search", "budget": 1200, "conversions": 19},
                {"campaign_id": "generic-events", "name": "Generic Events", "budget": 900, "conversions": 2},
            ]
        },
        expect_action_types=("apply_budget_optimization", "apply_campaign_recommendations"),
    ),
    SmokeScenario(
        label="Review response",
        agent_type="CustomerReviewResponder",
        task_type="single_review_response",
        input_data={
            "reviewerName": "Ayse",
            "rating": 2,
            "reviewText": "Planlama iyiydi ama dönüş çok geç oldu.",
            "reviewDate": "2026-05-01",
            "language": "tr",
        },
        expect_action_types=("reply_to_google_review",),
    ),
    SmokeScenario(
        label="Content ideation",
        agent_type="InstagramContentGenerator",
        task_type="content_ideation",
        input_data={
            "count": 3,
            "timePeriod": "next week",
            "campaignGoal": "local event lead generation",
        },
        expect_action_types=("create_instagram_content_plan",),
    ),
]


class SmokeFailure(RuntimeError):
    pass


def request_json(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    body: dict[str, Any] | None = None,
    timeout: int = 30,
) -> Any:
    data = None
    request_headers = dict(headers)
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        request_headers["Content-Type"] = "application/json"

    request = urllib.request.Request(url, data=data, headers=request_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = response.read().decode("utf-8")
            if not payload:
                return None
            return json.loads(payload)
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise SmokeFailure(f"{method} {url} failed: HTTP {exc.code} {error_body[:500]}") from exc
    except urllib.error.URLError as exc:
        raise SmokeFailure(f"{method} {url} failed: {exc.reason}") from exc


def resolve_agent_type(value: Any) -> str:
    if isinstance(value, int):
        return AGENT_TYPE_BY_NUMBER.get(value, str(value))
    return str(value)


def resolve_task_status(value: Any) -> str:
    if isinstance(value, int):
        return TASK_STATUS_BY_NUMBER.get(value, str(value))
    return str(value)


def ensure_service_health(api_url: str, crew_url: str, headers: dict[str, str]) -> None:
    api_health = request_json("GET", f"{api_url}/health", headers=headers)
    crew_health = request_json("GET", f"{crew_url}/health", headers=headers)
    if api_health.get("status") != "ok":
        raise SmokeFailure(f"Nexus API health is not ok: {api_health}")
    if crew_health.get("status") != "ok":
        raise SmokeFailure(f"Crew service health is not ok: {crew_health}")


def load_agents(api_url: str, office_id: str, headers: dict[str, str]) -> list[dict[str, Any]]:
    agents = request_json("GET", f"{api_url}/api/agents/office/{office_id}", headers=headers)
    if not isinstance(agents, list):
        raise SmokeFailure(f"Expected agent list, got: {agents}")
    return agents


def find_agent(agents: list[dict[str, Any]], agent_type: str) -> dict[str, Any]:
    for agent in agents:
        if resolve_agent_type(agent.get("agentType")) == agent_type:
            return agent
    available = ", ".join(resolve_agent_type(agent.get("agentType")) for agent in agents)
    raise SmokeFailure(f"Missing required agent {agent_type}. Available: {available}")


def execute_scenario(
    api_url: str,
    scenario: SmokeScenario,
    agent: dict[str, Any],
    headers: dict[str, str],
    timeout: int,
) -> dict[str, Any]:
    started = time.monotonic()
    result = request_json(
        "POST",
        f"{api_url}/api/agents/{agent['id']}/execute",
        headers=headers,
        body={"taskType": scenario.task_type, "inputData": scenario.input_data},
        timeout=timeout,
    )

    if not result.get("artifactId"):
        raise SmokeFailure(f"{scenario.label}: execution did not return artifactId: {result}")

    status = resolve_task_status(result.get("status"))
    normalized_status = status.replace("_", "").lower()
    if normalized_status not in {"waitingforapproval", "completed"}:
        raise SmokeFailure(f"{scenario.label}: unexpected task status: {status}")

    artifact = request_json("GET", f"{api_url}/api/artifacts/{result['artifactId']}", headers=headers)
    content = str(artifact.get("content") or "")
    if len(content.strip()) < 40:
        raise SmokeFailure(f"{scenario.label}: artifact content is too short.")

    actions = request_json("GET", f"{api_url}/api/actions", headers=headers)
    matching_actions = [
        action for action in actions
        if str(action.get("artifactId")).lower() == str(result["artifactId"]).lower()
    ]
    action_types = {str(action.get("actionType")) for action in matching_actions}
    expected = set(scenario.expect_action_types)
    has_expected_action = not expected or bool(action_types & expected)

    return {
        "label": scenario.label,
        "agentType": scenario.agent_type,
        "taskType": scenario.task_type,
        "artifactId": result["artifactId"],
        "status": status,
        "contentLength": len(content),
        "actionTypes": sorted(action_types),
        "expectedActionObserved": has_expected_action,
        "durationSeconds": round(time.monotonic() - started, 2),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run SmartAgency agent runtime smoke checks.")
    parser.add_argument("--api-url", default=DEFAULT_API_URL)
    parser.add_argument("--crew-url", default=DEFAULT_CREW_URL)
    parser.add_argument("--tenant-id", default=DEFAULT_TENANT_ID)
    parser.add_argument("--user-id", default=DEFAULT_USER_ID)
    parser.add_argument("--office-id", default=DEFAULT_OFFICE_ID)
    parser.add_argument("--timeout", type=int, default=360)
    parser.add_argument("--execute", action="store_true", help="Run live agent executions.")
    parser.add_argument(
        "--agent",
        action="append",
        choices=[scenario.agent_type for scenario in SCENARIOS],
        help="Limit --execute to one or more agent types.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    headers = {
        "X-Tenant-Id": args.tenant_id,
        "X-User-Id": args.user_id,
        "X-Office-Id": args.office_id,
    }

    try:
        ensure_service_health(args.api_url.rstrip("/"), args.crew_url.rstrip("/"), headers)
        agents = load_agents(args.api_url.rstrip("/"), args.office_id, headers)

        selected = [
            scenario for scenario in SCENARIOS
            if not args.agent or scenario.agent_type in set(args.agent)
        ]
        resolved_agents = {
            scenario.agent_type: find_agent(agents, scenario.agent_type)
            for scenario in selected
        }

        report: dict[str, Any] = {
            "status": "passed",
            "mode": "execute" if args.execute else "dry-run",
            "checkedAgents": list(resolved_agents.keys()),
            "executions": [],
        }

        if args.execute:
            for scenario in selected:
                report["executions"].append(
                    execute_scenario(
                        args.api_url.rstrip("/"),
                        scenario,
                        resolved_agents[scenario.agent_type],
                        headers,
                        args.timeout,
                    )
                )

            missing_actions = [
                item for item in report["executions"]
                if not item["expectedActionObserved"]
            ]
            if missing_actions:
                report["status"] = "warning"
                report["warning"] = "One or more executions produced an artifact but not the expected action type."

        print(json.dumps(report, indent=2, ensure_ascii=False))
        return 0 if report["status"] in {"passed", "warning"} else 1
    except SmokeFailure as exc:
        print(json.dumps({"status": "failed", "error": str(exc)}, indent=2, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    sys.exit(main())
