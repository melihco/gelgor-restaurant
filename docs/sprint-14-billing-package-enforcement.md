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

## Package-Derived Quotas (PackagePlanCatalog)

| Plan | Agent runs | Provider | Live | LLM tokens | SA Kredi/ay |
|------|------------|----------|------|------------|-------------|
| starter | 12 | 15 | 0 | 200k | 5.000 |
| growth | 28 | 45 | 8 | 500k | 15.000 |
| performance | 65 | 140 | 40 | 1M | 40.000 |
| executive | ∞ | ∞ | ∞ | ∞ | 150.000 |

Monthly output promises (missions × ~7 posts): Starter 12/84, Growth 28/196, Performance 65/455.

Token wallet exposes `cost_profit_ratio` (maliyet/kar) and `effective_margin_percent` on Usage & Plan screens.

## Frontend

The billing page now shows real quota meters:

- Agent Run
- Provider Action
- Live Action
- LLM Token

Plan changes refresh subscription and usage data immediately.
