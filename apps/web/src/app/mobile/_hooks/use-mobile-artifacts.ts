'use client';

import { useQuery } from '@tanstack/react-query';
import type { OutputArtifact } from '@/types';
import { useMobileStore } from '../_components/mobile-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
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
 * for cache hits (default: recent 120).
 */
export function useMobileArtifacts(options?: Options) {
  const tenantId = useWorkspaceStore((s) => s.tenantId);
  const base = getMobileArtifactsQueryOptions(options?.params);
  return useQuery({
    ...base,
    enabled: (options?.enabled ?? true) && Boolean(tenantId),
    refetchInterval: options?.subscribeOnly ? false : base.refetchInterval,
  });
}

export type UseMobileArtifactsResult = ReturnType<typeof useMobileArtifacts>;
