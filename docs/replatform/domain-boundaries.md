# Domain Boundaries

## Target Bounded Contexts

### TenantIdentity
Owns:
- users
- roles and permissions
- tenant membership
- auth/session metadata

Current anchors:
- `apps/api/src/Nexus.Api/Controllers/SecurityController.cs`
- `apps/web/src/lib/api-client.ts`

### BrandProfile
Owns:
- company profile
- brand context snapshot
- gallery and logo assets
- brand AI settings

Current anchors:
- `apps/api/src/Nexus.Domain/Entities/CompanyProfile.cs`
- `backend/app/api/v1/brand_context.py`
- `apps/web/src/app/api/brand-context-data/[workspaceId]/route.ts`

### BillingUsage
Owns:
- packages
- quotas
- token wallet
- AI cost reporting

Current anchors:
- `apps/api/src/Nexus.Infrastructure/Services/PackagePlanCatalog.cs`
- `backend/app/services/usage_cost_service.py`
- `apps/web/src/lib/package-plan-config.ts`

### MissionExecution
Owns:
- mission lifecycle
- node execution
- scheduler hooks
- execution retries and recovery

Current anchors:
- `backend/app/services/task_graph_executor.py`
- `backend/app/api/v1/missions.py`

### ArtifactsPublishing
Owns:
- generated artifacts
- approval queue
- publish state
- external publish schedules

Current anchors:
- `apps/api/src/Nexus.Api/Controllers/ArtifactsController.cs`
- `apps/web/src/lib/production-bundle.ts`

### ApprovalsLearning
Owns:
- approval decisions
- learning feedback
- operator review outcomes

Current anchors:
- `apps/api/src/Nexus.Infrastructure/Services/BrandLearningService.cs`
- `backend/app/services/tenant_learning_service.py`

### AdminPlatform
Owns:
- cross-tenant overview
- rollout flags
- operational health surface
- brand/package/operator management

Current anchors:
- `apps/web/src/app/platform-admin/page.tsx`
- `apps/web/src/app/api/admin/platform/overview/route.ts`

## Refactor Rule

No new feature should directly join three layers at once (`Next -> Python -> .NET`) unless it is explicitly a temporary compatibility adapter.
