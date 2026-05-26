# Sprint 13: Permission/RBAC & Enterprise Security

Sprint 13 adds the first role-based permission layer around sensitive operations.

## Roles

Permissions are derived from `User.Role`.

- `Owner` / `Admin`: full access, including live provider execution
- `Manager`: approvals, dry-run execution, integration management, operations visibility
- `Reviewer`: action/artifact approval and operations visibility
- `Operator`: dry-run execution and operations visibility
- `Analyst` / `Viewer`: operations visibility
- `User`: dry-run execution and operations visibility

In local demo fallback mode, the API treats the request as `Admin` to preserve development workflows.

## API

New endpoint:

```http
GET /api/security/me
```

Returns current tenant/user role, permissions, and demo fallback status.

## Enforced Permissions

- `actions.approve`: approve suggested actions
- `actions.reject`: reject suggested actions
- `artifacts.review`: approve/reject/request revision for output artifacts
- `provider.execute.dry_run`: execute actions in dry-run mode
- `provider.execute.live`: execute actions in live provider mode
- `integrations.manage`: create/update/delete integrations and OAuth auth URL generation
- `operations.view`: view operations telemetry

## Frontend

The approvals screen now reads current permissions and disables:

- action approval for users without `actions.approve`
- action rejection for users without `actions.reject`
- dry-run execution for users without `provider.execute.dry_run`
- live execution for users without `provider.execute.live`

The top bar displays the current role so restricted execution states are visible to the user.
