'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import {
  buildTenantBrandContext,
  emptyTenantBrandContext,
  type TenantBrandContext,
} from '@/lib/tenant-brand-context';
import type { CompanyProfile } from '@/types';

/**
 * Loads merged tenant brand context (Nexus profile + Python brand_context).
 * Use everywhere instead of hardcoded sector/handle/location defaults.
 */
export function useTenantBrand(workspaceId?: string | null): TenantBrandContext {
  const storeTenantId = useWorkspaceStore((s) => s.tenantId);
  const tenantId = workspaceId ?? storeTenantId;

  const { data: profile } = useQuery<CompanyProfile | null>({
    queryKey: ['company-profile', tenantId],
    queryFn: async () => {
      try {
        return await apiClient.getCompanyProfile();
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60_000,
    enabled: Boolean(tenantId),
  });

  const { data: brandCtx } = useQuery<Record<string, unknown> | null>({
    queryKey: ['brand-context-data', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      try {
        return await apiClient.getBrandContextData(tenantId);
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60_000,
    enabled: Boolean(tenantId),
  });

  if (!tenantId) return emptyTenantBrandContext();
  return buildTenantBrandContext(profile, brandCtx);
}
