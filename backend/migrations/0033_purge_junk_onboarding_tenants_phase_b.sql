-- Phase B: purge junk onboarding tenants (missions > 0, artifacts = 0).
-- Duplicate Yula/Sarnic shells, failed scraper onboarding, empty Brand experiments.

BEGIN;

CREATE TEMP TABLE purge_dotnet_tenants (id uuid PRIMARY KEY);
INSERT INTO purge_dotnet_tenants VALUES
  ('5feb36f7-def7-4b4a-834f-353457de57bf'),  -- Brand (180 missions, 0 artifacts)
  ('f152992e-a89b-4ead-93ed-7a3f2bd37e90'),  -- Yulabodrum duplicate
  ('d24691ee-c314-45b4-8dcc-0726683c6f05'),  -- Yulabodrum duplicate
  ('deb3ffa1-e140-47c5-bdb0-ba5121c2ac47'),  -- Anasayfa Sarnıç Beach
  ('4e8533fa-d95a-4ddc-90b7-ab0764679bd4'),  -- Anasayfa Sarnıç Beach
  ('d40da67e-8caa-4549-b15e-81330fc6f2be'),  -- Datçam (empty output)
  ('4eb064b6-d462-4f1a-947e-c0facda96681'),  -- Ballidu Parti Evi
  ('21aa2cd6-30c4-4959-8ea7-97ccdcbb4389'),  -- kacta.info
  ('ec80bcdc-1d5b-47a0-ae72-8ca0baf3a9f5'),  -- Sarnic Beach shell
  ('2ffddc55-f298-4548-9eb3-98930533f8a7');  -- Brand

CREATE TEMP TABLE purge_python_workspaces (id uuid PRIMARY KEY);
INSERT INTO purge_python_workspaces
SELECT id FROM workspaces
WHERE id IN (SELECT id FROM purge_dotnet_tenants)
   OR tenant_id IN (SELECT id FROM purge_dotnet_tenants);

-- Python side (no DB-level FKs on live — explicit order)
DELETE FROM production_jobs
WHERE workspace_id IN (SELECT id FROM purge_python_workspaces);

DELETE FROM mission_task_nodes
WHERE workspace_id IN (SELECT id FROM purge_python_workspaces);

DELETE FROM missions
WHERE workspace_id IN (SELECT id FROM purge_python_workspaces);

DELETE FROM brand_contexts
WHERE workspace_id IN (SELECT id FROM purge_python_workspaces);

DELETE FROM brand_design_templates
WHERE workspace_id IN (SELECT id FROM purge_python_workspaces);

DELETE FROM workspace_usage_daily
WHERE workspace_id IN (SELECT id FROM purge_python_workspaces);

DELETE FROM brand_scheduled_templates
WHERE workspace_id IN (SELECT id FROM purge_python_workspaces);

DELETE FROM social_connections
WHERE workspace_id IN (SELECT id FROM purge_python_workspaces);

DELETE FROM brand_post_templates
WHERE workspace_id IN (SELECT id FROM purge_python_workspaces);

DELETE FROM brand_rules
WHERE workspace_id IN (SELECT id FROM purge_python_workspaces);

DELETE FROM suggestions
WHERE workspace_id IN (SELECT id FROM purge_python_workspaces);

DELETE FROM meta_ad_campaigns
WHERE workspace_id IN (SELECT id FROM purge_python_workspaces);

DELETE FROM workspaces
WHERE id IN (SELECT id FROM purge_python_workspaces);

DELETE FROM tenants
WHERE id IN (SELECT id FROM purge_dotnet_tenants)
  AND id IN (SELECT id FROM tenants);

-- .NET tenant purge
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
