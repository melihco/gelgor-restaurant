-- Phase D: purge all remaining non-pilot tenants (31 rows).
-- KEEP only the 7 pilot workspaces used for controlled production testing.

BEGIN;

CREATE TEMP TABLE keep_tenants (id uuid PRIMARY KEY);
INSERT INTO keep_tenants VALUES
  ('00000000-0000-0000-0000-000000000001'),  -- Sunu Event
  ('431b2901-a2dc-4df6-abe3-3670d9844851'),  -- Sarnıç Beach pilot
  ('d365f0e0-436e-402d-8f84-0c8fd7ab2022'),  -- Yula Bodrum main
  ('f00e3308-ebbe-4d75-8592-12d52e7ff1aa'),  -- Yula Drink & Chill
  ('d6b187ab-0821-43bf-8381-25f3b17f24e4'),  -- Turunç Bodrum
  ('327db521-ede2-48e0-8f06-4146ee458c50'),  -- karamandatca.com.tr
  ('3be8dacc-0300-4e90-8438-4db8954bb76b');  -- KARAMAN DATÇA

CREATE TEMP TABLE purge_dotnet_tenants (id uuid PRIMARY KEY);
INSERT INTO purge_dotnet_tenants
SELECT "Id" FROM "Tenants" WHERE "Id" NOT IN (SELECT id FROM keep_tenants);

CREATE TEMP TABLE purge_python_workspaces (id uuid PRIMARY KEY);
INSERT INTO purge_python_workspaces
SELECT id FROM workspaces
WHERE id IN (SELECT id FROM purge_dotnet_tenants)
   OR tenant_id IN (SELECT id FROM purge_dotnet_tenants);

DELETE FROM production_jobs
WHERE workspace_id IN (SELECT id FROM purge_python_workspaces);

DELETE FROM artifact_cost_ledger
WHERE workspace_id IN (SELECT id FROM purge_python_workspaces);

DELETE FROM mission_cost_ledger
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
