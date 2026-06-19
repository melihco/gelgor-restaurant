'use client';

import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useActiveTenantId } from '@/hooks/useActiveTenantId';
import { apiClient } from '@/lib/api-client';
import { useMobileStore } from './mobile-store';
import { resolveClientScreen } from './mobile-client-config';
import { mobileQueryDefaults } from '../_lib/mobile-query';
import type { OutputArtifact } from '@/types';
import {
  getMobileArtifactsQueryOptions,
  mobileArtifactsListLimitForScreen,
  mobileArtifactsPollIntervalMs,
  shouldPollArtifactsGlobally,
} from '../_lib/mobile-artifacts';

function hasActiveMissionProduction(
  missions: Array<{ status?: string }>,
): boolean {
  return missions.some(
    (m) => m.status === 'in_flight' || m.status === 'approved',
  );
}

/**
 * Single artifact poll loop for /mobile.
 * Polls on feed/mission screens AND globally while mission production runs.
 */
export function MobileArtifactsPoller() {
  const screen = resolveClientScreen(useMobileStore((s) => s.screen));
  const tenantId = useActiveTenantId();

  // MissionHub already polls missions — subscribe only to avoid duplicate listMissions calls.
  const { data: missions = [] } = useQuery({
    queryKey: ['missions', tenantId],
    queryFn: () => apiClient.listMissionsForHub(tenantId!),
    enabled: Boolean(tenantId),
    staleTime: 45_000,
    refetchInterval: false,
    ...mobileQueryDefaults,
  });

  const activeMissionProduction = hasActiveMissionProduction(missions);
  const poll = shouldPollArtifactsGlobally(screen, { activeMissionProduction });

  const unchangedPollsRef = useRef(0);
  const lastArtifactCountRef = useRef<number | null>(null);

  const listLimit = mobileArtifactsListLimitForScreen(screen);
  const globalMissionPoll = activeMissionProduction && !['feed', 'missions', 'mission-factory'].includes(screen);

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
        unchangedPollsRef.current = 0;
        lastArtifactCountRef.current = count;
      }

      return mobileArtifactsPollIntervalMs(
        screen,
        artifacts,
        unchangedPollsRef.current,
        { globalMissionPoll },
      );
    },
  });

  return null;
}
