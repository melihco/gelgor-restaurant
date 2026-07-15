'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { productionSnapshotToLegacyBrandContext } from '@/lib/production-snapshot-compat';
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
        return await apiClient.getCompanyProfile(tenantId ?? undefined);
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60_000,
    enabled: Boolean(tenantId),
  });

  const { data: productionSnapshot } = useQuery({
    queryKey: ['production-context-snapshot', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      try {
        return await apiClient.getProductionBrandContextSnapshot(tenantId);
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60_000,
    enabled: Boolean(tenantId),
  });

  const { data: brandContextData } = useQuery({
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

  return useMemo(() => {
    if (!tenantId) return emptyTenantBrandContext();
    const snapshotCtx = productionSnapshotToLegacyBrandContext(productionSnapshot);
    const mergedCtx: Record<string, unknown> = {
      ...(snapshotCtx ?? {}),
      ...(brandContextData ?? {}),
    };
    if (!mergedCtx.logo_url && brandContextData?.logo_url) {
      mergedCtx.logo_url = brandContextData.logo_url;
    }
    return buildTenantBrandContext(profile, mergedCtx);
  }, [tenantId, profile, productionSnapshot, brandContextData]);
}
