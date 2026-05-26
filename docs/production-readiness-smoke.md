# Production Readiness Smoke Test

Run this after restarting `postgres`, `backend`, `api`, and `web` with production-like environment values.

## Required Headers

Use tenant and user headers for API smoke requests:

```bash
X-Tenant-Id: 00000000-0000-0000-0000-000000000001
X-User-Id: 00000000-0000-0000-0000-000000000001
X-Office-Id: 00000000-0000-0000-0000-000000000002
```

## Flow

1. Setup profile
   - `GET /api/setup/profile`
   - `PUT /api/setup/profile`
   - `POST /api/setup/complete`

2. Integrations
   - `GET /api/integrations`
   - `GET /api/integrations/google/auth-url?scopes=ads,analytics,search_console`
   - Verify OAuth callback creates tenant-scoped integration records.

3. Agent run
   - `GET /api/agents`
   - `POST /api/agents/{agentId}/execute`
   - Verify created `TaskItem`, `AgentRun`, `OutputArtifact`, and optional `SuggestedAction`.

4. Action approval
   - `GET /api/actions`
   - `POST /api/actions/{id}/approve`
   - `POST /api/actions/{id}/execute`
   - Verify `ExecutionJob` and executed action brand memory entry.

5. Workflow
   - `POST /api/agents/workflows/growth-recovery/start`
   - Verify four workflow tasks and three `TaskDependency` records.

6. Dashboard
   - Open web dashboard.
   - Confirm AI Control Center, action queue, and workflow timeline refresh.

## Expected Production Guards

- Cross-tenant action, integration, and artifact access should return `404` or `400`.
- Missing/invalid OAuth config should return clear `400`.
- Excessive requests should return `429`.
- Internal Crew calls must include `X-Internal-Api-Key`.
