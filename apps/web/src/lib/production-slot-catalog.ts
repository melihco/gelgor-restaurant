/**
 * Production slot catalog — DB-backed sector/slot definitions + tenant assignments.
 *
 * Sector IDs align with normalizeSectorId() / sector-production-profile.ts.
 * Production pipeline reads assignments in Faz 5; this module is read/bootstrap only.
 */

import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import {
  resolveBrandSlotFacilities,
  synthesizeSectorSlotDefinitions,
  type BrandSlotFacilities,
} from '@/lib/sector-slot-pack';

export interface CanonicalSector {
  sector_id: string;
  label_tr: string;
  label_en: string;
  aliases: string[];
  is_active: boolean;
  sort_order: number;
}

export interface ProductionSlotDefinition {
  slot_key: string;
  sector_id: string;
  label_tr: string;
  label_en: string;
  format: 'post' | 'story' | 'reel' | 'carousel';
  pipeline: string;
  slot_role: string;
  design_template_type: string;
  library_slot_key: string | null;
  tier: 'standard' | 'premium';
  match_signals: Record<string, unknown>;
  prompt_pack: Record<string, unknown>;
  optional_tags?: string[];
  enabled_by_default: boolean;
  sort_order: number;
  status: string;
  /** null = sector-global; set = brand-private custom slot */
  owner_workspace_id?: string | null;
}

export type SlotCatalogScope = 'visible' | 'global' | 'brand' | 'all';

export interface CatalogSlotCreateInput {
  sector_id: string;
  slot_key?: string;
  suffix?: string;
  label_tr: string;
  label_en: string;
  format: 'post' | 'story' | 'reel' | 'carousel';
  pipeline?: string;
  slot_role?: string;
  design_template_type?: string;
  library_slot_key?: string | null;
  tier?: 'standard' | 'premium';
  match_signals?: Record<string, unknown>;
  prompt_pack?: Record<string, unknown>;
  optional_tags?: string[];
  enabled_by_default?: boolean;
  sort_order?: number;
  owner_workspace_id?: string | null;
  assign_to_owner?: boolean;
  priority?: number;
  notes?: string | null;
}

export interface BrandCustomSlotCreateInput {
  suffix: string;
  label_tr: string;
  label_en: string;
  format: 'post' | 'story' | 'reel' | 'carousel';
  pipeline?: string;
  slot_role?: string;
  design_template_type?: string;
  library_slot_key?: string | null;
  tier?: 'standard' | 'premium';
  match_signals?: Record<string, unknown>;
  prompt_pack?: Record<string, unknown>;
  optional_tags?: string[];
  sort_order?: number;
  priority?: number;
  notes?: string | null;
  sector_id?: string;
}

export function resolveSectorSlotsWithPackFallback(
  sectorId: string,
  dbSlots: ProductionSlotDefinition[],
  facilities?: BrandSlotFacilities | Record<string, unknown> | null,
): ProductionSlotDefinition[] {
  const resolvedFacilities = resolveBrandSlotFacilities(facilities);
  const packSlots = synthesizeSectorSlotDefinitions(sectorId, resolvedFacilities);
  if (dbSlots.length === 0) {
    return packSlots;
  }
  return enrichDbSlotsWithSectorPackDefaults(sectorId, dbSlots, facilities);
}

/**
 * Overlay sector-pack prompt_pack (and pipeline hints) when live DB rows are stale,
 * and append pack slots that were never seeded into the DB (common after catalog updates).
 */
export function enrichDbSlotsWithSectorPackDefaults(
  sectorId: string,
  dbSlots: ProductionSlotDefinition[],
  facilities?: BrandSlotFacilities | Record<string, unknown> | null,
): ProductionSlotDefinition[] {
  const packSlots = synthesizeSectorSlotDefinitions(
    sectorId,
    resolveBrandSlotFacilities(facilities),
  );
  if (packSlots.length === 0) return dbSlots;

  const packByKey = new Map(packSlots.map((s) => [s.slot_key, s]));
  const dbKeys = new Set(dbSlots.map((s) => s.slot_key));

  const enriched = dbSlots.map((slot) => {
    const pack = packByKey.get(slot.slot_key);
    if (!pack) return slot;

    const dbPack = slot.prompt_pack && typeof slot.prompt_pack === 'object' ? slot.prompt_pack : {};
    const packPack = pack.prompt_pack && typeof pack.prompt_pack === 'object' ? pack.prompt_pack : {};
    const needsPremium = packPack.require_premium_composition === true
      && dbPack.require_premium_composition !== true;

    if (!needsPremium) return slot;

    return {
      ...slot,
      pipeline: pack.pipeline || slot.pipeline,
      slot_role: pack.slot_role || slot.slot_role,
      design_template_type: pack.design_template_type || slot.design_template_type,
      prompt_pack: { ...dbPack, ...packPack },
    };
  });

  const missing = packSlots.filter((s) => !dbKeys.has(s.slot_key));
  if (missing.length === 0) return enriched;

  return [...enriched, ...missing].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.slot_key.localeCompare(b.slot_key),
  );
}

export interface TenantSlotAssignment {
  id: string;
  workspace_id: string;
  slot_key: string;
  enabled: boolean;
  priority: number;
  assignment_source: 'auto_default' | 'operator' | 'onboarding' | string;
  notes: string | null;
  slot: ProductionSlotDefinition | null;
  created_at?: string;
  updated_at?: string;
}

export async function fetchCanonicalSectors(
  workspaceId: string,
): Promise<CanonicalSector[]> {
  const res = await fetchCrewBackendJson<CanonicalSector[]>(
    '/api/v1/slot-catalog/sectors',
    { workspaceId, timeoutMs: 10_000 },
  );
  return res.ok && Array.isArray(res.data) ? res.data : [];
}

export async function fetchSectorSlotDefinitions(
  workspaceId: string,
  sectorId: string,
  opts?: {
    facilities?: BrandSlotFacilities | Record<string, unknown> | null;
    scope?: SlotCatalogScope;
    includeArchived?: boolean;
  },
): Promise<ProductionSlotDefinition[]> {
  const params = new URLSearchParams();
  params.set('scope', opts?.scope ?? 'visible');
  params.set('workspace_id', workspaceId);
  if (opts?.includeArchived) params.set('include_archived', 'true');
  const res = await fetchCrewBackendJson<ProductionSlotDefinition[]>(
    `/api/v1/slot-catalog/sectors/${encodeURIComponent(sectorId)}/slots?${params}`,
    { workspaceId, timeoutMs: 10_000 },
  );
  const dbSlots = res.ok && Array.isArray(res.data) ? res.data : [];
  return resolveSectorSlotsWithPackFallback(sectorId, dbSlots, opts?.facilities);
}

export async function createCatalogSlot(
  workspaceId: string,
  input: CatalogSlotCreateInput,
): Promise<ProductionSlotDefinition | null> {
  const res = await fetchCrewBackendJson<ProductionSlotDefinition>(
    '/api/v1/slot-catalog/slots',
    {
      workspaceId,
      method: 'POST',
      timeoutMs: 20_000,
      body: input,
    },
  );
  return res.ok && res.data ? res.data : null;
}

export async function patchCatalogSlot(
  workspaceId: string,
  slotKey: string,
  patch: Partial<CatalogSlotCreateInput>,
): Promise<ProductionSlotDefinition | null> {
  const res = await fetchCrewBackendJson<ProductionSlotDefinition>(
    `/api/v1/slot-catalog/slots/${encodeURIComponent(slotKey)}`,
    {
      workspaceId,
      method: 'PATCH',
      timeoutMs: 15_000,
      body: patch,
    },
  );
  return res.ok && res.data ? res.data : null;
}

export async function archiveCatalogSlot(
  workspaceId: string,
  slotKey: string,
): Promise<ProductionSlotDefinition | null> {
  const res = await fetchCrewBackendJson<ProductionSlotDefinition>(
    `/api/v1/slot-catalog/slots/${encodeURIComponent(slotKey)}/archive`,
    { workspaceId, method: 'POST', timeoutMs: 15_000, body: {} },
  );
  return res.ok && res.data ? res.data : null;
}

export async function activateCatalogSlot(
  workspaceId: string,
  slotKey: string,
): Promise<ProductionSlotDefinition | null> {
  const res = await fetchCrewBackendJson<ProductionSlotDefinition>(
    `/api/v1/slot-catalog/slots/${encodeURIComponent(slotKey)}/activate`,
    { workspaceId, method: 'POST', timeoutMs: 15_000, body: {} },
  );
  return res.ok && res.data ? res.data : null;
}

export async function cloneCatalogSlot(
  workspaceId: string,
  sourceSlotKey: string,
  input: {
    suffix?: string;
    slot_key?: string;
    sector_id?: string;
    owner_workspace_id?: string | null;
    label_tr?: string;
    label_en?: string;
    assign_to_owner?: boolean;
  },
): Promise<ProductionSlotDefinition | null> {
  const res = await fetchCrewBackendJson<ProductionSlotDefinition>(
    `/api/v1/slot-catalog/slots/${encodeURIComponent(sourceSlotKey)}/clone`,
    {
      workspaceId,
      method: 'POST',
      timeoutMs: 20_000,
      body: input,
    },
  );
  return res.ok && res.data ? res.data : null;
}

export async function createBrandCustomSlot(
  workspaceId: string,
  input: BrandCustomSlotCreateInput,
): Promise<ProductionSlotDefinition | null> {
  const res = await fetchCrewBackendJson<ProductionSlotDefinition>(
    `/api/v1/slot-catalog/tenants/${workspaceId}/custom-slots`,
    {
      workspaceId,
      method: 'POST',
      timeoutMs: 20_000,
      body: input,
    },
  );
  return res.ok && res.data ? res.data : null;
}

export async function createCatalogSector(
  workspaceId: string,
  input: {
    sector_id: string;
    label_tr: string;
    label_en: string;
    aliases?: string[];
    is_active?: boolean;
    sort_order?: number;
  },
): Promise<CanonicalSector | null> {
  const res = await fetchCrewBackendJson<CanonicalSector>(
    '/api/v1/slot-catalog/sectors',
    {
      workspaceId,
      method: 'POST',
      timeoutMs: 15_000,
      body: input,
    },
  );
  return res.ok && res.data ? res.data : null;
}

export async function fetchTenantSlotAssignments(
  workspaceId: string,
  opts?: { enabledOnly?: boolean },
): Promise<TenantSlotAssignment[]> {
  const qs = opts?.enabledOnly ? '?enabled_only=true' : '';
  const res = await fetchCrewBackendJson<TenantSlotAssignment[]>(
    `/api/v1/slot-catalog/tenants/${workspaceId}/assignments${qs}`,
    { workspaceId, timeoutMs: 10_000 },
  );
  return res.ok && Array.isArray(res.data) ? res.data : [];
}

export async function bootstrapTenantSlotAssignments(
  workspaceId: string,
  sectorId?: string,
): Promise<{ created: number; updated: number; enabled_count: number; sector_id: string } | null> {
  const res = await fetchCrewBackendJson<{
    created: number;
    updated: number;
    enabled_count: number;
    sector_id: string;
  }>(
    `/api/v1/slot-catalog/tenants/${workspaceId}/bootstrap${sectorId ? `?sector_id=${encodeURIComponent(sectorId)}` : ''}`,
    {
      workspaceId,
      method: 'POST',
      timeoutMs: 15_000,
      body: {},
    },
  );
  return res.ok && res.data ? res.data : null;
}

export interface TenantSlotAssignmentUpsert {
  slot_key: string;
  enabled: boolean;
  priority?: number;
  assignment_source?: 'operator' | 'onboarding' | 'auto_default';
  notes?: string | null;
}

export async function upsertTenantSlotAssignments(
  workspaceId: string,
  assignments: TenantSlotAssignmentUpsert[],
): Promise<TenantSlotAssignment[]> {
  const res = await fetchCrewBackendJson<TenantSlotAssignment[]>(
    `/api/v1/slot-catalog/tenants/${workspaceId}/assignments`,
    {
      workspaceId,
      method: 'PUT',
      timeoutMs: 20_000,
      body: { assignments },
    },
  );
  return res.ok && Array.isArray(res.data) ? res.data : [];
}

/** Fixed 7-shelf legend from Python SSOT. */
export async function fetchLibraryShelves(
  workspaceId: string,
): Promise<Array<{
  key: string;
  label_tr: string;
  label_en: string;
  format: string;
  sort_order: number;
}>> {
  const res = await fetchCrewBackendJson<Array<{
    key: string;
    label_tr: string;
    label_en: string;
    format: string;
    sort_order: number;
  }>>('/api/v1/slot-catalog/library-shelves', { workspaceId, timeoutMs: 10_000 });
  return res.ok && Array.isArray(res.data) ? res.data : [];
}

export async function fetchTenantSlotFacilities(
  workspaceId: string,
): Promise<{
  workspace_id: string;
  sector_id: string | null;
  facilities: Record<string, boolean>;
  options: Array<{ key: string; enabled: boolean; label_tr: string; hint_tr: string }>;
  defaults: Record<string, boolean>;
} | null> {
  const res = await fetchCrewBackendJson<{
    workspace_id: string;
    sector_id: string | null;
    facilities: Record<string, boolean>;
    options: Array<{ key: string; enabled: boolean; label_tr: string; hint_tr: string }>;
    defaults: Record<string, boolean>;
  }>(`/api/v1/slot-catalog/tenants/${workspaceId}/facilities`, {
    workspaceId,
    timeoutMs: 10_000,
  });
  return res.ok && res.data ? res.data : null;
}

export async function upsertTenantSlotFacilities(
  workspaceId: string,
  facilities: Record<string, boolean>,
  opts?: { syncAssignments?: boolean },
): Promise<{
  facilities: Record<string, boolean>;
  synced_disabled: number;
  coverage_ok: boolean;
  coverage_errors: string[];
} | null> {
  const res = await fetchCrewBackendJson<{
    facilities: Record<string, boolean>;
    synced_disabled: number;
    coverage_ok: boolean;
    coverage_errors: string[];
  }>(`/api/v1/slot-catalog/tenants/${workspaceId}/facilities`, {
    workspaceId,
    method: 'PUT',
    timeoutMs: 15_000,
    body: {
      facilities,
      sync_assignments: Boolean(opts?.syncAssignments),
    },
  });
  return res.ok && res.data ? res.data : null;
}

export async function fetchTenantSlotOverview(
  workspaceId: string,
): Promise<Record<string, unknown> | null> {
  const res = await fetchCrewBackendJson<Record<string, unknown>>(
    `/api/v1/slot-catalog/tenants/${workspaceId}/overview`,
    { workspaceId, timeoutMs: 15_000 },
  );
  return res.ok && res.data ? res.data : null;
}

export async function previewTenantSlotChanges(
  workspaceId: string,
  input: {
    facilities?: Record<string, boolean> | null;
    assignments?: TenantSlotAssignmentUpsert[] | null;
  },
): Promise<Record<string, unknown> | null> {
  const res = await fetchCrewBackendJson<Record<string, unknown>>(
    `/api/v1/slot-catalog/tenants/${workspaceId}/preview`,
    {
      workspaceId,
      method: 'POST',
      timeoutMs: 15_000,
      body: {
        facilities: input.facilities ?? null,
        assignments: input.assignments ?? null,
      },
    },
  );
  return res.ok && res.data ? res.data : null;
}
