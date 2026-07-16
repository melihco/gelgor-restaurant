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

/** Poll interval while a completed mission's feed package is being produced. */
export function completedMissionFeedPollIntervalMs(unchangedPolls = 0): number {
  const backoffStep = Math.min(Math.floor(unchangedPolls / 4), 4);
  return Math.min(15_000 * 2 ** backoffStep, 60_000);
}

export function isMissionFeedProductionActive(opts: {
  kickPending?: boolean;
  reproducePending?: boolean;
  slotRendering?: boolean;
  feedProductionLockActive?: boolean;
  productionState?: string;
  userKicked?: boolean;
}): boolean {
  const state = String(opts.productionState ?? '').toLowerCase();
  return Boolean(
    opts.kickPending
    || opts.reproducePending
    || opts.slotRendering
    || opts.feedProductionLockActive
    || state === 'draining'
    || state === 'queued'
    || opts.userKicked,
  );
}

/**
 * Should the mission detail surface poll the artifact pool so slot cards
 * fill in as production completes?
 *
 * - in_flight / approved: the factory produces during flight — always poll
 *   while the package is incomplete (progress polling alone doesn't refresh
 *   artifacts, which is what the flip cards render).
 * - completed: poll only while a re-production is actively running.
 */
export function shouldPollMissionFeedArtifacts(opts: {
  missionStatus: string;
  feedPackageIncomplete: boolean;
  feedProductionActive: boolean;
}): boolean {
  if (!opts.feedPackageIncomplete) return false;
  if (opts.missionStatus === 'in_flight' || opts.missionStatus === 'approved') return true;
  if (opts.missionStatus === 'completed') return opts.feedProductionActive;
  return false;
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
    // includePayload: structured node output (e.g. content_ideation ideas) is read
    // from output_payload — output_summary is truncated server-side (~12k chars) and a
    // 10-idea ideation array overflows that cap, yielding invalid JSON the Hub can't
    // parse ("İçerik fikri bulunamadı"). Shares the cache key with the other surfaces
    // that already request the payload (MissionContentFactory / PlatformFeed).
    queryFn: () => apiClient.getMissionProgress(workspaceId, missionId, { includePayload: true }),
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
