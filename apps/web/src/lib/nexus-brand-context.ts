import { API_BASE_URL, DEFAULT_TENANT_ID } from '@/lib/runtime-config';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { CanvaTemplateDatasetField, CanvaTemplateMetadata } from '@/lib/canva-template-selection';

interface NexusCanvaTemplateAssignment {
  officeId?: string | null;
  canvaTemplateId: string;
  /** ISO from Nexus CanvaTemplateAssignment.UpdatedAt — stable across refetches */
  updatedAt?: string;
  name: string;
  contentKinds: string;
  useCases: string;
  templateFamilyId: string;
  allowedIntents: string;
  allowedChannels: string;
  requiredAssetIntents: string;
  riskTier: 'low' | 'medium' | 'high' | 'blocked';
  status: 'draft' | 'approved' | 'disabled' | 'needs_review';
  manualApprovalRequired: boolean;
  aspectRatio: string;
  datasetContract: string;
  enabled: boolean;
  priority: number;
  brandFitScore: number;
  notes: string;
}

/** When the API returns both a tenant-wide row (officeId null) and an office-specific row for the same template, collapse to one row so Maps and React keys stay consistent. */
export function coalesceCanvaTemplateAssignments<T extends {
  canvaTemplateId: string;
  officeId?: string | null;
  priority?: number;
  brandFitScore?: number;
}>(assignments: T[], officeId?: string | null): T[] {
  const norm = (id: string | null | undefined) => (id ? id.toLowerCase() : '');
  const targetOffice = norm(officeId);

  const groups = new Map<string, T[]>();
  for (const row of assignments) {
    const tid = row.canvaTemplateId?.trim();
    if (!tid) continue;
    const list = groups.get(tid) ?? [];
    list.push(row);
    groups.set(tid, list);
  }

  const pick = (rows: T[]): T => {
    const sortByPriority = (a: T, b: T) =>
      (b.priority ?? 0) - (a.priority ?? 0) || (b.brandFitScore ?? 0) - (a.brandFitScore ?? 0);

    if (rows.length === 1) return rows[0] as T;

    if (targetOffice) {
      const forOffice = rows.filter((r) => norm(r.officeId as string | null | undefined) === targetOffice);
      if (forOffice.length > 0) {
        return [...forOffice].sort(sortByPriority)[0] as T;
      }
      const globalRows = rows.filter((r) => r.officeId == null || r.officeId === '');
      if (globalRows.length > 0) {
        return [...globalRows].sort(sortByPriority)[0] as T;
      }
    }

    return [...rows].sort(sortByPriority)[0] as T;
  };

  return [...groups.values()].map(pick);
}

interface NexusTenantMediaAsset {
  officeId?: string | null;
  assetType: string;
  storageKey: string;
  url: string;
  isApproved: boolean;
  priority: number;
}

export async function mergeNexusTemplateAssignments(
  templates: CanvaTemplateMetadata[],
  tenantId = useWorkspaceStore.getState().tenantId || DEFAULT_TENANT_ID,
  officeId?: string | null,
): Promise<CanvaTemplateMetadata[]> {
  const assignmentsRaw = await fetchNexusJson<NexusCanvaTemplateAssignment[]>(
    `/api/brand-context/canva-templates${queryString({ officeId: officeId ?? undefined, includeDisabled: 'true' })}`,
    tenantId,
  ).catch(() => []);
  const assignments = coalesceCanvaTemplateAssignments(assignmentsRaw, officeId);
  if (assignments.length === 0) return templates;

  const byTemplateId = new Map(assignments.map((assignment) => [assignment.canvaTemplateId, assignment]));
  const knownIds = new Set(templates.map((template) => template.id));
  const merged = templates.map((template) => {
    const assignment = byTemplateId.get(template.id);
    return assignment ? applyAssignment(template, assignment, tenantId) : template;
  });

  for (const assignment of assignments) {
    if (!knownIds.has(assignment.canvaTemplateId)) {
      merged.push(applyAssignment({
        id: assignment.canvaTemplateId,
        title: assignment.name,
      }, assignment, tenantId));
    }
  }

  return merged;
}

export async function resolveNexusCanvaAssetIds(
  input: {
    assetIntent?: string;
    kind?: string;
    templateUseCase?: string;
  },
  tenantId = useWorkspaceStore.getState().tenantId || DEFAULT_TENANT_ID,
  officeId?: string | null,
): Promise<{
  imageAssetId?: string;
  heroImageAssetId?: string;
  productImageAssetId?: string;
  backgroundImageAssetId?: string;
  logoAssetId?: string;
}> {
  const assets = await fetchNexusJson<NexusTenantMediaAsset[]>(
    `/api/brand-context/assets${queryString({ officeId: officeId ?? undefined })}`,
    tenantId,
  ).catch(() => []);
  const approved = assets
    .filter((asset) => asset.isApproved && asset.storageKey)
    .sort((a, b) => scoreAsset(b, input, officeId) - scoreAsset(a, input, officeId));

  const logo = approved.find((asset) => asset.assetType === 'logo');
  const hero = approved.find((asset) => asset.assetType === input.assetIntent) ??
    approved.find((asset) => asset.assetType === 'venue_reference') ??
    approved.find((asset) => asset.assetType === 'hero_image') ??
    approved.find((asset) => asset.assetType === 'brand_background');
  const product = approved.find((asset) => asset.assetType === 'product_image');
  const background = approved.find((asset) => asset.assetType === 'brand_background' || asset.assetType === 'background_image');

  return {
    imageAssetId: hero?.storageKey,
    heroImageAssetId: hero?.storageKey,
    productImageAssetId: product?.storageKey,
    backgroundImageAssetId: background?.storageKey,
    logoAssetId: logo?.storageKey,
  };
}

function applyAssignment(
  template: CanvaTemplateMetadata,
  assignment: NexusCanvaTemplateAssignment,
  tenantId: string,
): CanvaTemplateMetadata {
  const dataset = parseJsonObject(assignment.datasetContract);
  return {
    ...template,
    tenantId,
    title: assignment.name || template.title,
    enabled: assignment.enabled,
    contentKinds: parseJsonArray(assignment.contentKinds) as CanvaTemplateMetadata['contentKinds'] ?? template.contentKinds,
    useCases: parseJsonArray(assignment.useCases) ?? template.useCases,
    templateFamilyId: assignment.templateFamilyId || template.templateFamilyId,
    allowedIntents: parseJsonArray(assignment.allowedIntents) ?? template.allowedIntents,
    allowedChannels: parseJsonArray(assignment.allowedChannels) ?? template.allowedChannels,
    requiredAssetIntents: parseJsonArray(assignment.requiredAssetIntents) ?? template.requiredAssetIntents,
    riskTier: assignment.riskTier ?? template.riskTier,
    status: assignment.status ?? template.status,
    manualApprovalRequired: assignment.manualApprovalRequired ?? template.manualApprovalRequired,
    aspectRatio: assignment.aspectRatio as CanvaTemplateMetadata['aspectRatio'] ?? template.aspectRatio,
    dataset: Object.keys(dataset).length > 0 ? dataset : template.dataset,
    priority: assignment.priority,
    brandFit: assignment.brandFitScore,
    notes: assignment.notes || template.notes,
    registryUpdatedAt: assignment.updatedAt ?? template.registryUpdatedAt,
  };
}

function scoreAsset(asset: NexusTenantMediaAsset, input: { assetIntent?: string; templateUseCase?: string }, officeId?: string | null) {
  let score = asset.priority ?? 0;
  if (officeId && asset.officeId === officeId) score += 100;
  if (input.assetIntent && asset.assetType === input.assetIntent) score += 60;
  if ((input.templateUseCase === 'product_showcase' || input.templateUseCase === 'product_highlight' || input.templateUseCase === 'menu_share') && asset.assetType === 'product_image') score += 30;
  if (input.templateUseCase === 'event_announcement' && asset.assetType === 'artist_photo') score += 30;
  return score;
}

async function fetchNexusJson<T>(endpoint: string, tenantId: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': tenantId,
      'X-User-Id': process.env.NEXT_PUBLIC_USER_ID || DEFAULT_USER_ID,
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Nexus brand context request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function queryString(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

function parseJsonArray(value: string): string[] | undefined {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : undefined;
  } catch {
    return undefined;
  }
}

function parseJsonObject(value: string): Record<string, CanvaTemplateDatasetField> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
