/**
 * Platform admin client — slot catalog BFF helpers.
 */

import { getRequestContextHeaders } from '@/lib/runtime-config';
import type {
  CanonicalSector,
  ProductionSlotDefinition,
  TenantSlotAssignment,
  TenantSlotAssignmentUpsert,
} from '@/lib/production-slot-catalog';

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

export async function fetchAdminSectorSlots(sectorId: string): Promise<ProductionSlotDefinition[]> {
  return adminFetch<ProductionSlotDefinition[]>(
    `/api/admin/slot-catalog?sector_id=${encodeURIComponent(sectorId)}`,
  );
}

export async function fetchAdminTenantSlotAssignments(
  workspaceId: string,
): Promise<TenantSlotAssignment[]> {
  const res = await fetch(
    `/api/brand-context/${workspaceId}/slot-catalog`,
    {
      headers: {
        Accept: 'application/json',
        ...getRequestContextHeaders(),
      },
    },
  );
  if (!res.ok) throw new Error(`tenant assignments ${res.status}`);
  return res.json() as Promise<TenantSlotAssignment[]>;
}

export async function bootstrapAdminTenantSlots(
  workspaceId: string,
  sectorId?: string,
): Promise<{ created: number; updated: number; enabled_count: number; sector_id: string }> {
  const res = await fetch(`/api/brand-context/${workspaceId}/slot-catalog`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...getRequestContextHeaders(),
    },
    body: JSON.stringify(sectorId ? { sector_id: sectorId } : {}),
  });
  if (!res.ok) throw new Error(`bootstrap failed ${res.status}`);
  return res.json() as Promise<{
    created: number;
    updated: number;
    enabled_count: number;
    sector_id: string;
  }>;
}

export async function saveAdminTenantSlotAssignments(
  workspaceId: string,
  assignments: TenantSlotAssignmentUpsert[],
): Promise<TenantSlotAssignment[]> {
  const res = await fetch(`/api/brand-context/${workspaceId}/slot-catalog`, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...getRequestContextHeaders(),
    },
    body: JSON.stringify({ assignments }),
  });
  if (!res.ok) throw new Error(`save assignments ${res.status}`);
  return res.json() as Promise<TenantSlotAssignment[]>;
}
