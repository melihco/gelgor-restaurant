'use client';

import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useActiveTenantId } from '@/hooks/useActiveTenantId';
import { useMobileStore } from './mobile-store';
import { resolveClientScreen } from './mobile-client-config';
import type { OutputArtifact } from '@/types';
import {
  getMobileArtifactsQueryOptions,
  mobileArtifactsListLimitForScreen,
  mobileArtifactsPollIntervalMs,
  shouldPollArtifactsForScreen,
} from '../_lib/mobile-artifacts';

/**
 * Single artifact poll loop for /mobile — only active on feed/mission/output screens.
 * Implements exponential backoff: when artifact count is stable (no new items),
 * the poll interval doubles every 3 polls, up to 90 s. Active renders reset to 8 s.
 */
export function MobileArtifactsPoller() {
  const screen = resolveClientScreen(useMobileStore((s) => s.screen));
  const tenantId = useActiveTenantId();
  const poll = shouldPollArtifactsForScreen(screen);

  // Track consecutive polls where artifact count didn't change → drive backoff.
  const unchangedPollsRef = useRef(0);
  const lastArtifactCountRef = useRef<number | null>(null);

  const listLimit = mobileArtifactsListLimitForScreen(screen);

  useQuery({
    ...getMobileArtifactsQueryOptions(tenantId ?? '', { limit: listLimit }),
    enabled: Boolean(tenantId) && poll,
    refetchInterval: (query) => {
      if (!poll) return false;
      const artifacts = query.state.data as OutputArtifact[] | undefined;
      const count = artifacts?.length ?? 0;

      if (lastArtifactCountRef.current === count) {
        unchangedPollsRef.current += 1;
      } else {
        // New data arrived — reset backoff.
        unchangedPollsRef.current = 0;
        lastArtifactCountRef.current = count;
      }

      return mobileArtifactsPollIntervalMs(screen, artifacts, unchangedPollsRef.current);
    },
  });

  return null;
}
