import type { UseQueryOptions } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { MissionProgress } from '@/types';
import { mobileQueryDefaults } from './mobile-query';

export function missionProgressQueryKey(missionId: string) {
  return ['mission-progress', missionId] as const;
}

export function missionHasRunningNodes(prog: MissionProgress | undefined): boolean {
  return (prog?.nodes ?? []).some((n) => n.status === 'running');
}

/**
 * Adaptive /progress poll — backs off when graph is idle; fast only while nodes run.
 */
export function missionProgressPollIntervalMs(
  missionStatus: string,
  prog: MissionProgress | undefined,
  unchangedPolls = 0,
): number | false {
  const inFlight = missionStatus === 'in_flight' || missionStatus === 'approved';
  if (!inFlight) return false;
  if (missionHasRunningNodes(prog)) return 20_000;
  const backoffStep = Math.min(Math.floor(unchangedPolls / 3), 3);
  return Math.min(35_000 * 2 ** backoffStep, 120_000);
}

type MissionProgressQueryOpts = {
  workspaceId: string;
  missionId: string;
  missionStatus: string;
  enabled?: boolean;
  /** When false, subscribe to cache only — another surface owns polling. */
  poll?: boolean;
};

export function getMissionProgressQueryOptions({
  workspaceId,
  missionId,
  missionStatus,
  enabled = true,
  poll = false,
}: MissionProgressQueryOpts): UseQueryOptions<
  MissionProgress,
  Error,
  MissionProgress,
  ReturnType<typeof missionProgressQueryKey>
> {
  return {
    queryKey: missionProgressQueryKey(missionId),
    queryFn: () => apiClient.getMissionProgress(workspaceId, missionId),
    enabled: enabled && Boolean(workspaceId && missionId),
    staleTime: poll ? 25_000 : 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
    refetchInterval: poll
      ? (query) => missionProgressPollIntervalMs(
        missionStatus,
        query.state.data as MissionProgress | undefined,
      )
      : false,
    ...mobileQueryDefaults,
  };
}
