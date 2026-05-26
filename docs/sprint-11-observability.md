# Sprint 11: Observability & Operations Panel

Sprint 11 introduces the first operational telemetry layer for SmartAgency.

## Backend

New endpoint:

```http
GET /api/operations/summary
```

The endpoint returns tenant-scoped operational data:

- 24-hour agent run counts and failure counts
- 24-hour provider execution job counts and failure rate
- average agent/provider execution duration
- token usage total for recent agent runs
- recent `AgentRun` telemetry
- recent `ExecutionJob` provider history
- recent failure list across agent runs and provider jobs
- latest audit trail entries

## Frontend

The existing `Uygulamalar` navigation item is now the operations panel.

The page shows:

- live health metrics
- provider execution job timeline
- agent run telemetry timeline
- critical failure cards
- 15-second auto refresh

## Scope Notes

This sprint creates visibility, not retry orchestration. Retry queues, alert routing, and cost dashboards remain follow-up work.
