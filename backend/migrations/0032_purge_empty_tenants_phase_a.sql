-- Phase A: purge 17 completely empty tenants (0 missions, 0 artifacts, 0 brand_context).
-- Safe onboarding leftovers: duplicate Sarnic/Yula shells, DeploySmoke, empty signups.

BEGIN;

CREATE TEMP TABLE purge_dotnet_tenants (id uuid PRIMARY KEY);
INSERT INTO purge_dotnet_tenants VALUES
  ('5b440946-a9ca-4244-a114-fb8edaef1712'),  -- Bafetto
  ('e4324d17-5174-41bf-bcb9-666a3b400b0f'),  -- DeploySmoke
  ('a85c7002-fe22-48a2-b63b-34ea1be46ddf'),  -- garapub.com
  ('0f1ba94f-c675-4c45-9d02-2347d4894e20'),  -- Kaçta
  ('8760efbb-7550-45a3-85ba-dfede5f2cd36'),  -- Kaçta Info
  ('252ef734-cafa-461a-bcd1-8d4f01c915e4'),  -- Poly
  ('f8f1ef61-73ab-4c7d-b3ba-74b92fbb7ae8'),  -- Sarnic Beach
  ('3d9a7327-a03d-4431-b457-bb206ee6367f'),  -- Sarnic Beach
  ('9e72f9be-425e-4469-b6aa-ba8ef2683f7a'),  -- Sarnic Beach
  ('b1f3c376-c6d1-4b34-83d4-da5d1ea920bd'),  -- Sarnic Beach
  ('b9da89cf-a4f6-4177-a007-52b1d65de33d'),  -- Sarnic Beach
  ('ddba233d-41fd-4491-9f19-f89f1a347975'),  -- Sarnic Beach
  ('3e16a148-5af3-45eb-b8e3-046f817c24fc'),  -- Sarnic Beach Smoke
  ('728223b9-0c14-4b6c-8e3c-fbbb9f3aee69'),  -- Sarnıç
  ('d248a190-06a3-4461-8f48-08c3a6bb3bb9'),  -- Yula Bodrum
  ('a3e930c0-2389-4d0e-9722-6777f8d10494'),  -- Yula Bodrum
  ('a8e337b5-1699-4cf7-ae06-dd18e15878e4');  -- Yula Bodrum

CREATE TEMP TABLE purge_python_tenants (id uuid PRIMARY KEY);
INSERT INTO purge_python_tenants
SELECT id FROM purge_dotnet_tenants
WHERE id IN (SELECT id FROM tenants);

CREATE TEMP TABLE purge_python_workspaces (id uuid PRIMARY KEY);
INSERT INTO purge_python_workspaces
SELECT id FROM workspaces
WHERE id IN (SELECT id FROM purge_dotnet_tenants)
   OR tenant_id IN (SELECT id FROM purge_python_tenants);

DELETE FROM production_jobs
WHERE workspace_id IN (SELECT id FROM purge_python_workspaces);

DELETE FROM brand_scheduled_templates
WHERE workspace_id IN (SELECT id FROM purge_python_workspaces);

DELETE FROM social_connections
WHERE workspace_id IN (SELECT id FROM purge_python_workspaces);

DELETE FROM workspaces
WHERE id IN (SELECT id FROM purge_python_workspaces);

DELETE FROM tenants
WHERE id IN (SELECT id FROM purge_python_tenants);

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
