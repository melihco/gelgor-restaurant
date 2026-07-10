import type { QueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { fetchTenantBff } from '@/lib/bff-fetch';
import { invalidateBrandContextWriteQueries } from '@/lib/query-client-bridge';
import type { SaveCompanyProfileRequest } from '@/types';

/** Parse contentNeeds / content_pillars JSON into slug list. */
export function parseContentIntentSlugs(raw: string | string[] | undefined | null): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Mirror Python SSOT pillars → Nexus CompanyProfile.contentNeeds (agent / operating policy). */
export async function mirrorPillarsToCompanyProfile(pillars: string[]): Promise<void> {
  const profile = await apiClient.getCompanyProfile();
  const next = JSON.stringify(pillars);
  if (profile.contentNeeds === next) return;
  await apiClient.saveCompanyProfile({
    ...(profile as SaveCompanyProfileRequest),
    contentNeeds: next,
  });
}

/** Mirror .NET contentNeeds → Python brand_contexts.content_pillars (auto-produce / readiness). */
export async function mirrorPillarsToPythonBrandContext(
  tenantId: string,
  pillars: string[],
): Promise<void> {
  await fetchTenantBff(`/api/brand-context-data/${tenantId}`, tenantId, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_pillars: JSON.stringify(pillars) }),
  });
}

export async function afterPillarsMirroredToPython(
  queryClient: QueryClient,
  tenantId: string,
): Promise<void> {
  await invalidateBrandContextWriteQueries(queryClient, tenantId);
  await queryClient.invalidateQueries({ queryKey: ['brand-readiness', tenantId] });
}

export async function afterPillarsMirroredToNexus(
  queryClient: QueryClient,
  tenantId: string,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ['company-profile', tenantId] });
  await queryClient.invalidateQueries({ queryKey: ['company-profile'] });
}
