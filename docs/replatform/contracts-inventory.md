# Contracts Inventory

## Current Contract Sources

### .NET
- `apps/api/src/Nexus.Contracts`
- `apps/api/src/Nexus.Application/Services/CrewOrchestrationService.cs`

### Python
- `backend/app/schemas/internal.py`
- `backend/app/crew/context.py`

### Web / BFF
- `apps/web/src/types/index.ts`
- `apps/web/src/types/brand-theme.ts`
- `apps/web/src/lib/api-client.ts`

## New Shared Contract Package

`packages/contracts` now provides the first stable replatform contract surface:

- `BrandProfileSnapshot`
- `BrandThemeAiSettings`
- `MissionExecutionRequest`
- `ProductionJobRequest`
- `PlatformAdminOverview`

## Mapping Rules

### Brand
- Nexus company profile remains customer-facing source
- Python brand context remains intelligence source
- UI and mobile consume only `BrandProfileSnapshot`

### Mission / Production
- mission execution command and production job request are split on purpose
- mission orchestration must not receive raw web-only payloads
- production service must not depend on UI-specific metadata blobs

### Admin
- admin UI consumes `PlatformAdminOverview`
- tenant registry, brand CRUD and rollout flags will be layered on top of this contract

## Immediate Refactor Rule

Any new API or mobile screen added during the replatform should prefer `packages/contracts` over adding new local DTO drift in:
- `apps/web/src/types`
- ad-hoc Python dict payloads
- implicit Next route response shapes
