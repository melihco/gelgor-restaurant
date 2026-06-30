-- Purge non-pilot tenants/workspaces.
-- KEEP: Sunu Event (00000000-0000-0000-0000-000000000001), Yula Bodrum (4278d8e0-...),
--       Sarnıç Beach (9eaf3663-...).
-- Karaman Datça (327db521-...) is not present in this database snapshot.

BEGIN;

CREATE TEMP TABLE purge_dotnet_tenants (id uuid PRIMARY KEY);
INSERT INTO purge_dotnet_tenants VALUES
  ('5d9516fa-6ce9-4ea0-8b52-c0512c5fa20d'),
  ('9ec1bee7-1848-4fd1-80cc-fd6653893e48');

CREATE TEMP TABLE purge_python_tenants (id uuid PRIMARY KEY);
INSERT INTO purge_python_tenants VALUES
  ('9ec1bee7-1848-4fd1-80cc-fd6653893e48'),
  ('d6b187ab-0821-43bf-8381-25f3b17f24e4'),
  ('431b2901-a2dc-4df6-abe3-3670d9844851');

CREATE TEMP TABLE purge_python_workspaces (id uuid PRIMARY KEY);
INSERT INTO purge_python_workspaces VALUES
  ('00000000-0000-0000-0000-000000000010'),
  ('d6b187ab-0821-43bf-8381-25f3b17f24e4'),
  ('431b2901-a2dc-4df6-abe3-3670d9844851'),
  ('9ec1bee7-1848-4fd1-80cc-fd6653893e48');

-- Python tables without FK to workspaces
DELETE FROM production_jobs
WHERE workspace_id IN (SELECT id FROM purge_python_workspaces)
   OR workspace_id IN (SELECT id FROM workspaces WHERE tenant_id IN (SELECT id FROM purge_python_tenants));

DELETE FROM brand_scheduled_templates
WHERE workspace_id IN (SELECT id FROM purge_python_workspaces)
   OR workspace_id IN (SELECT id FROM workspaces WHERE tenant_id IN (SELECT id FROM purge_python_tenants));

DELETE FROM social_connections
WHERE workspace_id IN (SELECT id FROM purge_python_workspaces)
   OR workspace_id IN (SELECT id FROM workspaces WHERE tenant_id IN (SELECT id FROM purge_python_tenants));

-- Cafe Bosphorus demo workspace under Sunu tenant
DELETE FROM workspaces WHERE id = '00000000-0000-0000-0000-000000000010';

-- Full python tenant purge (CASCADE workspaces + brand_contexts + missions + ...)
DELETE FROM tenants WHERE id IN (SELECT id FROM purge_python_tenants);

-- .NET tenant purge (manual FK order)
DELETE FROM "ExecutionJobs"
WHERE "SuggestedActionId" IN (
  SELECT sa."Id" FROM "SuggestedActions" sa
  WHERE sa."TenantId" IN (SELECT id FROM purge_dotnet_tenants)
     OR sa."ArtifactId" IN (
       SELECT "Id" FROM "OutputArtifacts"
       WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants)
     )
);

DELETE FROM "SuggestedActions"
WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants)
   OR "ArtifactId" IN (
     SELECT "Id" FROM "OutputArtifacts"
     WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants)
   );

DELETE FROM "ReviewDecisions"
WHERE "ArtifactId" IN (
  SELECT "Id" FROM "OutputArtifacts"
  WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants)
);

DELETE FROM "OutputArtifacts"
WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants);

DELETE FROM "AgentRuns"
WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants);

DELETE FROM "TaskAssignments"
WHERE "TaskId" IN (
  SELECT "Id" FROM "TaskItems"
  WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants)
);

DELETE FROM "TaskDependencies"
WHERE "TaskId" IN (
  SELECT "Id" FROM "TaskItems"
  WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants)
)
OR "DependsOnTaskId" IN (
  SELECT "Id" FROM "TaskItems"
  WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants)
);

DELETE FROM "AgentCapabilities"
WHERE "AgentId" IN (
  SELECT "Id" FROM "Agents"
  WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants)
);

DELETE FROM "AgentMemoryReferences"
WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants);

UPDATE "Agents"
SET "CurrentTaskId" = NULL
WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants);

DELETE FROM "Agents"
WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants);

DELETE FROM "TaskItems"
WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants);

DELETE FROM "BriefAttachments"
WHERE "BriefId" IN (
  SELECT "Id" FROM "Briefs"
  WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants)
);

DELETE FROM "Briefs"
WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants);

DELETE FROM "Notifications"
WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants);

DELETE FROM "AuditLogs"
WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants);

DELETE FROM "BrandMemoryDocuments"
WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants);

DELETE FROM "CanvaTemplateAssignments"
WHERE "OfficeId" IN (
  SELECT "Id" FROM "Offices"
  WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants)
);

DELETE FROM "OfficeBrandProfiles"
WHERE "OfficeId" IN (
  SELECT "Id" FROM "Offices"
  WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants)
);

DELETE FROM "TenantMediaAssets"
WHERE "OfficeId" IN (
  SELECT "Id" FROM "Offices"
  WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants)
);

DELETE FROM "OfficeZones"
WHERE "OfficeId" IN (
  SELECT "Id" FROM "Offices"
  WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants)
);

DELETE FROM "Offices"
WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants);

DELETE FROM "SubscriptionAgents"
WHERE "SubscriptionId" IN (
  SELECT "Id" FROM "TenantSubscriptions"
  WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants)
);

DELETE FROM "TenantSubscriptions"
WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants);

DELETE FROM "ProviderAccountMappings"
WHERE "IntegrationConnectionId" IN (
  SELECT "Id" FROM "IntegrationConnections"
  WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants)
);

DELETE FROM "IntegrationConnections"
WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants);

DELETE FROM "CompanyProfiles"
WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants);

DELETE FROM "Users"
WHERE "TenantId" IN (SELECT id FROM purge_dotnet_tenants);

DELETE FROM "Tenants"
WHERE "Id" IN (SELECT id FROM purge_dotnet_tenants);

COMMIT;
