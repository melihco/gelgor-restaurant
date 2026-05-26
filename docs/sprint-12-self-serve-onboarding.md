# Sprint 12: Self-Serve Onboarding

Sprint 12 turns setup into a guided customer onboarding flow.

## Backend

New endpoint:

```http
GET /api/setup/onboarding-status
```

The endpoint returns tenant-scoped readiness:

- completion score
- profile readiness
- brand intelligence readiness
- provider integration readiness
- package/subscription readiness
- approval mode readiness
- first AI task/action readiness
- next recommended setup step
- `readyForLaunch` and `readyForLiveActions` flags

## Frontend

The setup wizard now shows:

- live onboarding score in the left rail
- next missing step CTA
- live-action readiness badge
- launch checklist with all onboarding gates
- first AI suggestion CTA that sends the user to the dashboard after setup completion

Integration and package changes invalidate onboarding status, so the checklist updates immediately.

## Product Impact

New customers can see exactly what is missing before running AI operations or enabling live provider actions. This reduces ambiguous setup states and makes the product closer to self-serve onboarding.
