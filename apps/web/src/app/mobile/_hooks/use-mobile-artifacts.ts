'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { OutputArtifact } from '@/types';
import { getSessionTenantId } from '@/lib/runtime-config';
import { useWorkspaceStore } from '@/stores/workspace-store';
import {
  getMobileArtifactsQueryOptions,
  type MobileArtifactListParams,
} from '../_lib/mobile-artifacts';

/** JWT tenant wins over persisted workspace store — must match API request context. */
function useArtifactTenantId(): string | null {
  const storeTenantId = useWorkspaceStore((s) => s.tenantId);
  const [sessionTenantId, setSessionTenantId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? getSessionTenantId() : null,
  );

  useEffect(() => {
    const sync = () => setSessionTenantId(getSessionTenantId());
    sync();
    window.addEventListener('smartagency-auth-changed', sync);
    return () => window.removeEventListener('smartagency-auth-changed', sync);
  }, []);

  return sessionTenantId || storeTenantId || null;
}

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
  const tenantId = useArtifactTenantId();
  const storeTenantId = useWorkspaceStore((s) => s.tenantId);
  const base = getMobileArtifactsQueryOptions(tenantId ?? '', options?.params);
  return useQuery({
    ...base,
    enabled: (options?.enabled ?? true) && Boolean(tenantId),
    refetchInterval: options?.subscribeOnly ? false : base.refetchInterval,
    queryFn: async () => {
      const { apiClient } = await import('@/lib/api-client');
      const merged = { limit: 100, ...options?.params };
      return apiClient.getArtifacts(merged);
    },
  });
}

export type UseMobileArtifactsResult = ReturnType<typeof useMobileArtifacts>;
