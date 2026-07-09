-- Phase C: purge onboarding junk with 20+ proposed missions and <50 artifacts.
-- Excludes 7 pilot tenants. Removes duplicate Sunu/Karaman shells and scraper test signups.

BEGIN;

CREATE TEMP TABLE purge_dotnet_tenants (id uuid PRIMARY KEY);
INSERT INTO purge_dotnet_tenants VALUES
  ('231b854b-23c0-4341-a8c6-d256fbcc5d4e'),  -- Sunu Event duplicate
  ('9e7d74d9-a4f2-40ac-8fcd-13a55b4ca5e7'),  -- Su Psikoterapi
  ('b01ab580-f2b1-4388-ba77-128491e58d95'),  -- Doğal Zeytinyağı
  ('4afd99ca-12fa-4a42-9869-36d4a238e03d'),  -- Karaman Datça duplicate
  ('6d9df70c-72c1-4886-9b34-6e0ec860f507'),  -- Klar Coffee
  ('a1fe9aa7-2d6f-4b77-a2bb-b18ab3cb931a'),  -- Bafetto Pizza
  ('02248814-4cd6-48c8-9135-d16c52564631'),  -- Blog SmartDent
  ('8d5979ad-99e8-4f02-9455-9e1e9c214bc4'),  -- Garapub
  ('5101dd7a-d6d8-4176-97e6-f984967a0d34'),  -- MertBot
  ('9206430e-b87b-4763-95bc-cb54de41ea57'),  -- The Cafe Bite's
  ('9b8da998-577e-4283-9234-66673b2f693d'),  -- Karaman Datça duplicate
  ('d57ef9a3-fb32-4ff9-8053-e7005a466650'),  -- sirenertanistanbul
  ('731d388d-c66f-4e4b-acb2-00e804fb7d78'),  -- Poly Türkbükü
  ('bdce6508-bb08-49ba-8bef-1d8dd326ec51'),  -- Orfoz Bodrum
  ('dfa4e1b2-acff-42f4-9567-ef9e7d044a88'),  -- Poly Türkbükü duplicate
  ('ce54371c-0482-4180-b7cd-69c3378cdc75');  -- Slicesoftheworld

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
