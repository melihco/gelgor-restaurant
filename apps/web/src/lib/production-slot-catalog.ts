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
}

export function resolveSectorSlotsWithPackFallback(
  sectorId: string,
  dbSlots: ProductionSlotDefinition[],
  facilities?: BrandSlotFacilities | Record<string, unknown> | null,
): ProductionSlotDefinition[] {
  if (dbSlots.length === 0) {
    const resolvedFacilities = resolveBrandSlotFacilities(facilities);
    return synthesizeSectorSlotDefinitions(sectorId, resolvedFacilities);
  }
  return enrichDbSlotsWithSectorPackDefaults(sectorId, dbSlots, facilities);
}

/** Overlay sector-pack prompt_pack (and pipeline hints) when live DB rows are stale. */
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
  return dbSlots.map((slot) => {
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
  opts?: { facilities?: BrandSlotFacilities | Record<string, unknown> | null },
): Promise<ProductionSlotDefinition[]> {
  const res = await fetchCrewBackendJson<ProductionSlotDefinition[]>(
    `/api/v1/slot-catalog/sectors/${encodeURIComponent(sectorId)}/slots`,
    { workspaceId, timeoutMs: 10_000 },
  );
  const dbSlots = res.ok && Array.isArray(res.data) ? res.data : [];
  return resolveSectorSlotsWithPackFallback(sectorId, dbSlots, opts?.facilities);
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
