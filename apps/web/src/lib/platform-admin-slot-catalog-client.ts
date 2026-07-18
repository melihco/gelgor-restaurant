/**
 * Platform admin client — slot catalog BFF helpers (no UI).
 * Uses auth-gated `/api/admin/slot-catalog` for tenant management surfaces.
 */

import { getRequestContextHeaders } from '@/lib/runtime-config';
import type {
  CanonicalSector,
  ProductionSlotDefinition,
  TenantSlotAssignment,
  TenantSlotAssignmentUpsert,
} from '@/lib/production-slot-catalog';

export interface LibraryShelf {
  key: string;
  label_tr: string;
  label_en: string;
  format: string;
  sort_order: number;
}

export interface FacilityOption {
  key: string;
  enabled: boolean;
  label_tr: string;
  hint_tr: string;
}

export interface BrandSlotFacilitiesResponse {
  workspace_id: string;
  sector_id: string | null;
  facilities: Record<string, boolean>;
  options: FacilityOption[];
  defaults: Record<string, boolean>;
}

export interface ShelfSummary extends LibraryShelf {
  catalog_count: number;
  assigned_count: number;
  assignment_enabled_count: number;
  effective_count: number;
  facility_blocked_count: number;
}

export interface CoverageInfo {
  effective_enabled_count: number;
  has_post: boolean;
  has_story: boolean;
  ok: boolean;
  errors: string[];
}

export interface TenantSlotEffective {
  slot_key: string;
  slot: ProductionSlotDefinition;
  assigned: boolean;
  assignment_enabled: boolean | null;
  assignment_source: string | null;
  priority: number | null;
  facility_blocked: boolean;
  required_facilities: string[];
  effective_enabled: boolean;
  blocked_by: 'assignment' | 'facility' | 'not_default' | 'inactive' | null;
}

export interface TenantSlotAdminOverview {
  workspace_id: string;
  sector_id: string | null;
  facilities: Record<string, boolean>;
  facility_options: FacilityOption[];
  shelves: ShelfSummary[];
  slots: TenantSlotEffective[];
  coverage: CoverageInfo;
  assignment_row_count: number;
  using_sector_defaults: boolean;
}

export interface TenantSlotPreview extends Omit<
  TenantSlotAdminOverview,
  'facility_options' | 'assignment_row_count'
> {
  would_enable: string[];
  would_disable_by_assignment: string[];
  would_disable_by_facility: string[];
  recommended_disable_by_facility: string[];
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...getRequestContextHeaders(),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `admin slot-catalog ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchAdminCatalogSectors(): Promise<CanonicalSector[]> {
  return adminFetch<CanonicalSector[]>('/api/admin/slot-catalog?view=sectors');
}

export async function fetchAdminLibraryShelves(): Promise<LibraryShelf[]> {
  return adminFetch<LibraryShelf[]>('/api/admin/slot-catalog?view=library_shelves');
}

export async function fetchAdminSectorSlots(sectorId: string): Promise<ProductionSlotDefinition[]> {
  return adminFetch<ProductionSlotDefinition[]>(
    `/api/admin/slot-catalog?sector_id=${encodeURIComponent(sectorId)}`,
  );
}

export async function fetchAdminTenantSlotAssignments(
  workspaceId: string,
): Promise<TenantSlotAssignment[]> {
  return adminFetch<TenantSlotAssignment[]>(
    `/api/admin/slot-catalog?view=assignments&workspace_id=${encodeURIComponent(workspaceId)}`,
  );
}

export async function fetchAdminTenantSlotOverview(
  workspaceId: string,
): Promise<TenantSlotAdminOverview> {
  return adminFetch<TenantSlotAdminOverview>(
    `/api/admin/slot-catalog?view=overview&workspace_id=${encodeURIComponent(workspaceId)}`,
  );
}

export async function fetchAdminTenantFacilities(
  workspaceId: string,
): Promise<BrandSlotFacilitiesResponse> {
  return adminFetch<BrandSlotFacilitiesResponse>(
    `/api/admin/slot-catalog?view=facilities&workspace_id=${encodeURIComponent(workspaceId)}`,
  );
}

export async function bootstrapAdminTenantSlots(
  workspaceId: string,
  sectorId?: string,
): Promise<{ created: number; updated: number; enabled_count: number; sector_id: string }> {
  return adminFetch('/api/admin/slot-catalog', {
    method: 'POST',
    body: JSON.stringify({
      action: 'bootstrap',
      workspace_id: workspaceId,
      ...(sectorId ? { sector_id: sectorId } : {}),
    }),
  });
}

export async function previewAdminTenantSlots(
  workspaceId: string,
  input: {
    facilities?: Record<string, boolean> | null;
    assignments?: TenantSlotAssignmentUpsert[] | null;
  },
): Promise<TenantSlotPreview> {
  return adminFetch('/api/admin/slot-catalog', {
    method: 'POST',
    body: JSON.stringify({
      action: 'preview',
      workspace_id: workspaceId,
      facilities: input.facilities ?? null,
      assignments: input.assignments ?? null,
    }),
  });
}

export async function syncAdminTenantFacilities(
  workspaceId: string,
): Promise<{
  workspace_id: string;
  sector_id: string | null;
  disabled: number;
  disabled_slot_keys: string[];
  coverage: CoverageInfo;
}> {
  return adminFetch('/api/admin/slot-catalog', {
    method: 'POST',
    body: JSON.stringify({
      action: 'sync_facilities',
      workspace_id: workspaceId,
    }),
  });
}

export async function resetAdminTenantSlotDefaults(
  workspaceId: string,
  opts?: {
    sectorId?: string;
    resetFacilities?: boolean;
    resetAssignments?: boolean;
    forceOperator?: boolean;
  },
): Promise<{
  workspace_id: string;
  sector_id: string;
  facilities_reset: boolean;
  created: number;
  updated: number;
  disabled: number;
  enabled_count: number;
  facilities: Record<string, boolean>;
}> {
  return adminFetch('/api/admin/slot-catalog', {
    method: 'POST',
    body: JSON.stringify({
      action: 'reset_defaults',
      workspace_id: workspaceId,
      sector_id: opts?.sectorId ?? null,
      reset_facilities: opts?.resetFacilities !== false,
      reset_assignments: opts?.resetAssignments !== false,
      force_operator: opts?.forceOperator !== false,
    }),
  });
}

export async function saveAdminTenantSlotAssignments(
  workspaceId: string,
  assignments: TenantSlotAssignmentUpsert[],
): Promise<TenantSlotAssignment[]> {
  return adminFetch('/api/admin/slot-catalog', {
    method: 'PUT',
    body: JSON.stringify({
      target: 'assignments',
      workspace_id: workspaceId,
      assignments,
    }),
  });
}

export async function saveAdminTenantFacilities(
  workspaceId: string,
  facilities: Record<string, boolean>,
  opts?: { syncAssignments?: boolean },
): Promise<{
  workspace_id: string;
  sector_id: string | null;
  facilities: Record<string, boolean>;
  options: FacilityOption[];
  synced_disabled: number;
  coverage_ok: boolean;
  coverage_errors: string[];
}> {
  return adminFetch('/api/admin/slot-catalog', {
    method: 'PUT',
    body: JSON.stringify({
      target: 'facilities',
      workspace_id: workspaceId,
      facilities,
      sync_assignments: Boolean(opts?.syncAssignments),
    }),
  });
}
