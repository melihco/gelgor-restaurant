# Sprint 9: Real Provider Execution

Sprint 9 moves approved AI actions from controller-local simulation toward a provider adapter pipeline.

## Execution Modes

Action execution is controlled by `ActionExecution:Mode`.

- `dry-run` is the default. It validates the action payload, creates an `ExecutionJob`, records the result, and does not mutate external provider accounts.
- `live` calls a provider adapter when the tenant has a connected integration and the action type is supported.

Local defaults:

```json
"ActionExecution": {
  "Mode": "dry-run",
  "TimeoutSeconds": 90
}
```

Docker Compose defaults:

```bash
ACTION_EXECUTION_MODE=dry-run
ACTION_EXECUTION_TIMEOUT_SECONDS=90
```

## API Usage

Default safe execution:

```bash
curl -X POST "http://127.0.0.1:5050/api/actions/{actionId}/execute" \
  -H "X-Tenant-Id: 00000000-0000-0000-0000-000000000001"
```

Explicit live execution:

```bash
curl -X POST "http://127.0.0.1:5050/api/actions/{actionId}/execute?mode=live" \
  -H "X-Tenant-Id: 00000000-0000-0000-0000-000000000001"
```

## Frontend Behavior

The approvals screen keeps `dry-run` selected by default for every approved action.

- `Test Uygula` runs the action in dry-run mode and shows the execution mode plus provider response status.
- `Live` must be selected explicitly before the UI sends `mode=live`.
- Live mode displays a warning before execution because supported adapters may mutate connected provider accounts.

## Current Provider Coverage

- `apply_budget_optimization`: live adapter calls the Python Google Ads bulk budget endpoint (`/api/v1/ads/campaigns/budget/bulk`) when a connected Google Ads integration exists.
- `log_analytics_report` and `log_review_analysis`: live mode records the internal action without external provider mutation.
- `reply_to_google_review`, `schedule_instagram_posts`, and ad creative publishing are guarded in live mode until their provider write adapters are implemented.

## Safety Rules

- Every execution creates an `ExecutionJob`.
- Provider responses and result data are persisted on the job.
- Failed live readiness checks mark the action as failed and record the reason.
- Default mode remains `dry-run` so demos and local runs cannot accidentally mutate real ad accounts.
