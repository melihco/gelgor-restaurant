'use client';

import { useQuery } from '@tanstack/react-query';
import { useActiveTenantId } from '@/hooks/useActiveTenantId';
import {
  getMobileArtifactsQueryOptions,
  type MobileArtifactListParams,
} from '../_lib/mobile-artifacts';

type Options = {
  params?: MobileArtifactListParams;
  /** Subscribe only — polling handled by MobileArtifactsPoller when on an artifact screen. */
  subscribeOnly?: boolean;
  enabled?: boolean;
};

/**
 * Shared artifact list for /mobile. Use the same params as MobileArtifactsPoller
 * for cache hits (limit varies by screen — see mobileArtifactsListLimitForScreen).
 */
export function useMobileArtifacts(options?: Options) {
  const tenantId = useActiveTenantId();
  const base = getMobileArtifactsQueryOptions(tenantId ?? '', options?.params);
  return useQuery({
    ...base,
    enabled: (options?.enabled ?? true) && Boolean(tenantId),
    refetchInterval: options?.subscribeOnly ? false : base.refetchInterval,
    queryFn: async () => {
      const { apiClient } = await import('@/lib/api-client');
      const merged = { limit: 100, ...options?.params };
      return apiClient.getArtifacts(merged, tenantId!);
    },
  });
}

export type UseMobileArtifactsResult = ReturnType<typeof useMobileArtifacts>;
