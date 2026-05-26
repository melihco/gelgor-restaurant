# Sprint 14: Billing & Package Enforcement

Sprint 14 introduces quota enforcement and usage metering for package limits.

## Backend

New endpoint:

```http
GET /api/packages/usage
```

The endpoint returns current billing-period usage for:

- agent runs
- provider actions
- live provider actions
- LLM tokens

## Enforcement

The API now checks quota before:

- `POST /api/agents/{id}/execute`
- `POST /api/agents/workflows/growth-recovery/start`
- `POST /api/actions/{id}/execute`

Agent runs are metered into `TenantSubscription.TasksUsedThisPeriod`.
Provider action usage is calculated from `ExecutionJob` records in the active subscription period.

## Package-Derived Provider Quotas

- `starter`: 10 provider actions, 0 live actions
- `growth`: 50 provider actions, 10 live actions
- `performance`: 150 provider actions, 50 live actions
- `executive`: unlimited provider and live actions

Token limits are also exposed for metering visibility.

## Frontend

The billing page now shows real quota meters:

- Agent Run
- Provider Action
- Live Action
- LLM Token

Plan changes refresh subscription and usage data immediately.
