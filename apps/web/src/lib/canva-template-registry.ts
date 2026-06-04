import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeCanvaFieldName } from '@/lib/canva-field-dictionary';
import { DEFAULT_TENANT_ID } from '@/lib/runtime-config';
import type {
  CanvaAspectRatio,
  CanvaContentKind,
  CanvaTemplateMetadata,
  CanvaTemplateObjective,
  CanvaTemplateTone,
} from '@/lib/canva-template-selection';

/** Persisted field contract — survives between requests, derived from Canva dataset API */
export interface CanvaRegistryFieldContract {
  fieldName: string;
  standardName: string | null;
  type: 'text' | 'image';
  /** Actual visual character limit: from API characterLimit, or defaultText.length, or dictionary */
  maxLength: number;
  /** How the limit was determined */
  limitSource: 'api_characterLimit' | 'defaultText_length' | 'dictionary';
  required: boolean;
  /** The original default text from the Canva template design (most accurate length signal) */
  defaultText?: string;
  purpose?: string;
}

export interface CanvaTemplateRegistryEntry {
  templateId: string;
  tenantId: string;
  title?: string;
  enabled?: boolean;
  contentKinds?: CanvaContentKind[];
  aspectRatio?: CanvaAspectRatio;
  objectives?: CanvaTemplateObjective[];
  tones?: CanvaTemplateTone[];
  industries?: string[];
  useCases?: string[];
  templateFamilyId?: string;
  allowedIntents?: string[];
  allowedChannels?: string[];
  requiredAssetIntents?: string[];
  riskTier?: 'low' | 'medium' | 'high' | 'blocked';
  status?: 'draft' | 'approved' | 'disabled' | 'needs_review';
  manualApprovalRequired?: boolean;
  locale?: string;
  brandFit?: number;
  priority?: number;
  tags?: string[];
  notes?: string;
  /** Persisted field contracts — char limits derived from Canva dataset, never re-fetched */
  fieldContracts?: CanvaRegistryFieldContract[];
  fieldContractsSyncedAt?: string;
  previewUrl?: string;
  previewUpdatedAt?: string;
  previewStale?: boolean;
  previewRendererProvider?: string;
  previewDesignId?: string;
  previewJobId?: string;
  previewHash?: string;
  previewFormat?: 'png' | 'mp4';
  previewMimeType?: string;
  updatedAt: string;
}

interface CanvaTemplateRegistryFile {
  version: 1;
  tenants: Record<string, Record<string, CanvaTemplateRegistryEntry>>;
}

export function getCanvaTenantId(requestedTenantId?: string | null) {
  return requestedTenantId || process.env.NEXT_PUBLIC_TENANT_ID || DEFAULT_TENANT_ID;
}

export async function readCanvaTemplateRegistry(tenantId = getCanvaTenantId()): Promise<CanvaTemplateRegistryEntry[]> {
  const registry = await readRegistryFile();
  return Object.values(registry.tenants[tenantId] ?? {});
}

export async function upsertCanvaTemplateRegistryEntry(
  entry: Omit<CanvaTemplateRegistryEntry, 'tenantId' | 'updatedAt'> & { tenantId?: string; updatedAt?: string },
): Promise<CanvaTemplateRegistryEntry> {
  const tenantId = getCanvaTenantId(entry.tenantId);
  const registry = await readRegistryFile();
  const tenantEntries = registry.tenants[tenantId] ?? {};
  const updates = Object.fromEntries(
    Object.entries(entry).filter(([, value]) => value !== undefined),
  ) as Partial<CanvaTemplateRegistryEntry> & { templateId: string };
  const next: CanvaTemplateRegistryEntry = {
    ...tenantEntries[entry.templateId],
    ...updates,
    tenantId,
    updatedAt: entry.updatedAt ?? new Date().toISOString(),
  };

  tenantEntries[entry.templateId] = next;
  registry.tenants[tenantId] = tenantEntries;
  await writeRegistryFile(registry);
  return next;
}

/**
 * Extracts field contracts from a template dataset and persists them to the registry.
 * Call after hydrateTemplateDataset() so limits are available without re-fetching.
 */
export async function syncTemplateFieldContracts(
  templateId: string,
  dataset: Record<string, { type: string; characterLimit?: number; maxLength?: number; defaultText?: string; sampleText?: string; placeholder?: string; text?: string; value?: string; default?: string; required?: boolean; purpose?: string }>,
  tenantId = getCanvaTenantId(),
): Promise<void> {
  const contracts: CanvaRegistryFieldContract[] = [];

  for (const [fieldName, field] of Object.entries(dataset)) {
    let maxLength: number;
    let limitSource: CanvaRegistryFieldContract['limitSource'];

    if (field.characterLimit && field.characterLimit > 0) {
      maxLength = field.characterLimit;
      limitSource = 'api_characterLimit';
    } else {
      const sample = [field.defaultText, field.sampleText, field.placeholder, field.text, field.value, field.default]
        .find((v): v is string => typeof v === 'string' && v.trim().length > 0);
      if (sample) {
        maxLength = sample.trim().length;
        limitSource = 'defaultText_length';
      } else if (field.maxLength && field.maxLength > 0) {
        maxLength = field.maxLength;
        limitSource = 'dictionary';
      } else {
        maxLength = field.type === 'text' ? 200 : 0;
        limitSource = 'dictionary';
      }
    }

    const defaultText = [field.defaultText, field.sampleText]
      .find((v): v is string => typeof v === 'string' && v.trim().length > 0);

    contracts.push({
      fieldName,
      standardName: normalizeCanvaFieldName(fieldName),
      type: field.type === 'image' ? 'image' : 'text',
      maxLength,
      limitSource,
      required: field.required ?? false,
      defaultText,
      purpose: field.purpose,
    });
  }

  if (contracts.length === 0) return;

  try {
    await upsertCanvaTemplateRegistryEntry({
      templateId,
      tenantId,
      fieldContracts: contracts,
      fieldContractsSyncedAt: new Date().toISOString(),
    });
  } catch {
    // Non-fatal — field contracts are a cache, not required
  }
}

export async function mergeTemplateRegistry(
  templates: CanvaTemplateMetadata[],
  tenantId = getCanvaTenantId(),
): Promise<CanvaTemplateMetadata[]> {
  const entries = await readCanvaTemplateRegistry(tenantId);
  const byTemplateId = new Map(entries.map((entry) => [entry.templateId, entry]));

  return templates.map((template) => {
    const entry = byTemplateId.get(template.id);
    if (!entry) return { ...template, tenantId, enabled: true };

    // If registry marks the preview as a video file, the template IS a Reel —
    // override title-inferred contentKinds so it always shows in the Reel tab.
    const resolvedPreviewFormat = entry.previewFormat ?? template.previewFormat;
    const baseContentKinds = entry.contentKinds?.length ? entry.contentKinds : template.contentKinds ?? [];
    const resolvedContentKinds = resolvedPreviewFormat === 'mp4' && !baseContentKinds.includes('instagram_reel')
      ? ['instagram_reel', ...baseContentKinds.filter(k => k !== 'instagram_post' && k !== 'generic')]
      : baseContentKinds;

    return {
      ...template,
      tenantId,
      title: entry.title?.trim() || template.title,
      enabled: entry.enabled ?? true,
      contentKinds: resolvedContentKinds,
      aspectRatio: entry.aspectRatio ?? template.aspectRatio,
      objectives: entry.objectives?.length ? entry.objectives : template.objectives,
      tones: entry.tones?.length ? entry.tones : template.tones,
      industries: entry.industries?.length ? entry.industries : template.industries,
      useCases: entry.useCases?.length ? entry.useCases : template.useCases,
      templateFamilyId: entry.templateFamilyId ?? template.templateFamilyId,
      allowedIntents: entry.allowedIntents?.length ? entry.allowedIntents : template.allowedIntents,
      allowedChannels: entry.allowedChannels?.length ? entry.allowedChannels : template.allowedChannels,
      requiredAssetIntents: entry.requiredAssetIntents?.length ? entry.requiredAssetIntents : template.requiredAssetIntents,
      riskTier: entry.riskTier ?? template.riskTier,
      status: entry.status ?? template.status,
      manualApprovalRequired: entry.manualApprovalRequired ?? template.manualApprovalRequired,
      locale: entry.locale ?? template.locale,
      brandFit: entry.brandFit ?? template.brandFit,
      priority: entry.priority,
      tags: entry.tags,
      notes: entry.notes,
      previewUrl: entry.previewUrl,
      previewUpdatedAt: entry.previewUpdatedAt,
      previewStale: entry.previewStale,
      previewRendererProvider: entry.previewRendererProvider,
      previewDesignId: entry.previewDesignId,
      previewJobId: entry.previewJobId,
      previewHash: entry.previewHash,
      previewFormat: entry.previewFormat,
      previewMimeType: entry.previewMimeType,
      registryUpdatedAt: entry.updatedAt,
    };
  });
}

async function readRegistryFile(): Promise<CanvaTemplateRegistryFile> {
  try {
    const raw = await readFile(getRegistryPath(), 'utf8');
    const parsed = JSON.parse(raw) as CanvaTemplateRegistryFile;
    return {
      version: 1,
      tenants: parsed.tenants ?? {},
    };
  } catch {
    return { version: 1, tenants: {} };
  }
}

async function writeRegistryFile(registry: CanvaTemplateRegistryFile) {
  const registryPath = getRegistryPath();
  await mkdir(path.dirname(registryPath), { recursive: true });
  await writeFile(registryPath, JSON.stringify(registry, null, 2), { mode: 0o600 });
}

function getRegistryPath() {
  return process.env.CANVA_TEMPLATE_REGISTRY_PATH ?? path.join(process.cwd(), '.canva-template-registry.json');
}
