# Admin Platform Surface

## Initial Admin Scope

The first implemented admin surface lives at:

- `apps/web/src/app/platform-admin/page.tsx`

Backed by:

- `apps/web/src/app/api/admin/platform/overview/route.ts`
- `apps/web/src/app/api/admin/platform/brand-snapshot/route.ts`

## Phase 1 Read Models

### PlatformAdminOverview
Contains:
- current operator identity
- operations health summary
- usage summary
- tenant summary rows

### BrandProfileSnapshot
Contains:
- brand identity and description
- gallery references
- AI visual flags

## Phase 2 Write Actions

Planned next actions on top of this surface:
- create workspace / brand bootstrap
- package override
- AI policy override
- rollout flag assignment
- suspend / reactivate tenant
- cross-tenant user membership management

## UX Policy

- short term: standalone admin entry at `/platform-admin`
- medium term: wire into `/desk` navigation as `Platform Admin`
- long term: split into dedicated `apps/admin` only if cross-tenant surface becomes large enough
