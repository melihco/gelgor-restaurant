# Sprint 10: Provider Write Adapters

Sprint 10 starts the real provider write layer behind approved actions.

## What Changed

- Google Business review replies now have a Python provider endpoint:
  `POST /api/v1/provider-actions/google-business/reviews/reply`
- Instagram content scheduling now has a Python provider endpoint:
  `POST /api/v1/provider-actions/instagram/posts/schedule`
- The .NET action executor can route live actions for:
  - `reply_to_google_review`
  - `create_instagram_content_plan`
  - `schedule_instagram_posts`
  - `create_ad_creatives`
  - `apply_budget_optimization`

## Live Readiness Rules

The .NET API still owns tenant/action safety:

- action must be approved before execution
- action must belong to the request tenant
- live mode requires a connected `IntegrationConnection`
- unsupported live actions fail with a structured provider response
- missing provider payload fields fail before any external mutation attempt

## Provider Notes

Google Business and Instagram endpoints are contract-ready. In development, they return deterministic simulated success when no access token is available. In production, missing credentials return a failure response.

Google Ads creative upload uses the existing responsive search ad endpoint. It requires:

- `creatives` or `ads`
- `ad_group_id` in the action payload or integration `Configuration`
- `final_url` in the action payload or integration `Configuration`

The adapter creates paused RSAs so live publishing remains conservative.
