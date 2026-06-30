'use client';

import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useActiveTenantId } from '@/hooks/useActiveTenantId';
import { useMobileStore } from './mobile-store';
import { resolveClientScreen } from './mobile-client-config';
import type { OutputArtifact } from '@/types';
import {
  getMobileArtifactsQueryOptions,
  MOBILE_ARTIFACT_MISSION_POOL_LIMIT,
  mobileArtifactsListLimitForScreen,
  mobileArtifactsPollIntervalMs,
  shouldPollArtifactsGlobally,
} from '../_lib/mobile-artifacts';

/**
 * Single artifact poll loop for /mobile — feed/mission screens only.
 * Brand/More/Settings do not poll (avoids 100-row fetches during background production).
 */
export function MobileArtifactsPoller() {
  const screen = resolveClientScreen(useMobileStore((s) => s.screen));
  const tenantId = useActiveTenantId();

  const poll = shouldPollArtifactsGlobally(screen);

  const unchangedPollsRef = useRef(0);
  const lastArtifactCountRef = useRef<number | null>(null);

  // Feed shares the mission pool cache key with MobileNav badge and PlatformFeed.
  const listLimit = screen === 'feed'
    ? MOBILE_ARTIFACT_MISSION_POOL_LIMIT
    : mobileArtifactsListLimitForScreen(screen);

  useQuery({
    ...getMobileArtifactsQueryOptions(tenantId ?? '', { limit: listLimit }),
    enabled: Boolean(tenantId) && poll,
    refetchOnMount: poll ? 'always' : false,
    refetchInterval: (query) => {
      if (!poll) return false;
      const artifacts = query.state.data as OutputArtifact[] | undefined;
      const count = artifacts?.length ?? 0;

      if (lastArtifactCountRef.current === count) {
        unchangedPollsRef.current += 1;
      } else {
        unchangedPollsRef.current = 0;
        lastArtifactCountRef.current = count;
      }

      return mobileArtifactsPollIntervalMs(
        screen,
        artifacts,
        unchangedPollsRef.current,
      );
    },
  });

  return null;
}
