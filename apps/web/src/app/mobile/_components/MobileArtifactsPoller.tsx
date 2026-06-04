'use client';

import { useQuery } from '@tanstack/react-query';
import { useMobileStore } from './mobile-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { resolveClientScreen } from './mobile-client-config';
import type { OutputArtifact } from '@/types';
import {
  getMobileArtifactsQueryOptions,
  mobileArtifactsPollIntervalMs,
  shouldPollArtifactsForScreen,
} from '../_lib/mobile-artifacts';

/**
 * Single artifact poll loop for /mobile — only active on feed/mission/output screens.
 * Other screens use useMobileArtifacts({ subscribeOnly: true }) and read from cache.
 */
export function MobileArtifactsPoller() {
  const screen = resolveClientScreen(useMobileStore((s) => s.screen));
  const tenantId = useWorkspaceStore((s) => s.tenantId);
  const poll = shouldPollArtifactsForScreen(screen);

  useQuery({
    ...getMobileArtifactsQueryOptions(),
    enabled: Boolean(tenantId) && poll,
    refetchInterval: (query) => {
      if (!poll) return false;
      return mobileArtifactsPollIntervalMs(screen, query.state.data as OutputArtifact[] | undefined);
    },
  });

  return null;
}
