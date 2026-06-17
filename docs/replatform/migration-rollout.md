# Migration And Rollout

## Deployment Order

1. database migrations
2. crew service
3. core API
4. web/BFF
5. smoke tests

## Required Gates

### Schema Gate
- no startup-only schema mutations in production
- .NET migrations must be versioned
- Python migrations must be explicitly runnable before deploy

### Contract Gate
- shared contract updates must be backward compatible for one rollout window
- mobile and web should consume `packages/contracts`

### Health Gate
- `/health`
- `/health/ready`
- platform admin overview route

## Observability Baseline

Needed in next wave:
- structured correlation IDs across Next, .NET and Python
- contract failure logs
- mission execution audit stream
- visual production job tracing

## Smoke Checklist

- login succeeds
- platform admin overview loads
- brand snapshot route loads
- mission list loads for current tenant
- artifact list loads
- crew internal execution health verified
