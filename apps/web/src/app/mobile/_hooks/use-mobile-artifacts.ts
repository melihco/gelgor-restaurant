'use client';

import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useActiveTenantId } from '@/hooks/useActiveTenantId';
import type { OutputArtifact } from '@/types';
import { completedMissionFeedPollIntervalMs } from '../_lib/mobile-mission-progress';
import {
  getMobileArtifactsQueryOptions,
  type MobileArtifactListParams,
} from '../_lib/mobile-artifacts';

type Options = {
  params?: MobileArtifactListParams;
  /** Subscribe only — polling handled by MobileArtifactsPoller when on an artifact screen. */
  subscribeOnly?: boolean;
  enabled?: boolean;
  /** Poll artifact list while a mission feed package is being produced. */
  pollMissionFeed?: boolean;
};

/**
 * Shared artifact list for /mobile. Use the same params as MobileArtifactsPoller
 * for cache hits (limit varies by screen — see mobileArtifactsListLimitForScreen).
 */
export function useMobileArtifacts(options?: Options) {
  const tenantId = useActiveTenantId();
  const unchangedPollsRef = useRef(0);
  const lastSignatureRef = useRef<string | null>(null);
  const base = getMobileArtifactsQueryOptions(tenantId ?? '', options?.params);
  return useQuery({
    ...base,
    enabled: (options?.enabled ?? true) && Boolean(tenantId),
    refetchInterval: options?.pollMissionFeed
      ? (query) => {
          const artifacts = query.state.data as OutputArtifact[] | undefined;
          // Count alone misses churn when the pool is at its limit (new artifact
          // pushes an old one out) — include the newest artifact id in the signal.
          const signature = `${artifacts?.length ?? 0}:${artifacts?.[0]?.id ?? ''}`;
          if (lastSignatureRef.current === signature) {
            unchangedPollsRef.current += 1;
          } else {
            unchangedPollsRef.current = 0;
            lastSignatureRef.current = signature;
          }
          return completedMissionFeedPollIntervalMs(unchangedPollsRef.current);
        }
      : (options?.subscribeOnly ? false : base.refetchInterval),
  });
}

export type UseMobileArtifactsResult = ReturnType<typeof useMobileArtifacts>;
