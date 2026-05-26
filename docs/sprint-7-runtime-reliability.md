# Sprint 7: Runtime Reliability Smoke Pack

This sprint starts the move from demo confidence to repeatable runtime confidence.

## Goal

Verify the critical path without manually clicking through the UI:

`.NET API -> Python CrewAI -> artifact -> suggested action`

## Smoke Runner

Run the fast, non-LLM check:

```bash
python3 scripts/agent-runtime-smoke.py
```

This verifies:

- Nexus API health endpoint
- Crew service health endpoint
- Required demo agents exist for the configured tenant and office

Run live agent execution checks:

```bash
python3 scripts/agent-runtime-smoke.py --execute
```

Live CrewAI runs can take several minutes. The local API default timeout is
`OrchestrationService:TimeoutSeconds = 300`, while the smoke runner waits up to
360 seconds per execution unless `--timeout` is provided.

Run one agent only:

```bash
python3 scripts/agent-runtime-smoke.py --execute --agent AnalyticsAnalyst
```

## Covered Scenarios

- `AnalyticsAnalyst` with `traffic_analysis`
- `GoogleAdsAnalyst` with `auto_budget_optimize`
- `CustomerReviewResponder` with `single_review_response`
- `InstagramContentGenerator` with `content_ideation`

Each live scenario validates:

- HTTP execution returned successfully
- A task/run/artifact was created
- Artifact content is non-empty
- Any action created for the artifact is reported
- Expected action type presence is marked in the JSON report

## Expected Output

The command prints a JSON report:

```json
{
  "status": "passed",
  "mode": "dry-run",
  "checkedAgents": [
    "AnalyticsAnalyst",
    "GoogleAdsAnalyst",
    "CustomerReviewResponder",
    "InstagramContentGenerator"
  ],
  "executions": []
}
```

`status: warning` means the execution created an artifact but did not create the expected action type. This is not a transport failure, but it should be treated as an agent/action extraction quality issue.

`status: failed` means the runtime path is not healthy enough for a demo or release candidate.

## Environment Overrides

```bash
python3 scripts/agent-runtime-smoke.py \
  --api-url http://127.0.0.1:5050 \
  --crew-url http://127.0.0.1:8000 \
  --tenant-id 00000000-0000-0000-0000-000000000001 \
  --office-id 00000000-0000-0000-0000-000000000002
```

## Next Reliability Steps

- Add structured execution error codes to `AgentRun.ExecutionLog`.
- Add retry/backoff policy options per agent/task type.
- Add a durable execution status endpoint for smoke runner polling.
- Add CI mode that runs only dry-run checks unless secrets and LLM credentials are present.
