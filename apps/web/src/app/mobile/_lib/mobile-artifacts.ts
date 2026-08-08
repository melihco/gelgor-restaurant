import { keepPreviousData, type UseQueryOptions } from '@tanstack/react-query';
import { apiClient, type GetArtifactsParams } from '@/lib/api-client';
import type { OutputArtifact } from '@/types';
import {
  dedupeProductionBundles,
  isBundleRendering,
  resolveStoryVideoUrl,
} from '@/lib/mission-feed-package';
import { mobileQueryDefaults } from './mobile-query';

/** Default list cap — mission hub / nav badge recent pool. */
export const MOBILE_ARTIFACT_LIST_LIMIT = 96;

/** Shared pool for mission hub, nav badges, and detail sheets — must match MobileArtifactsPoller on missions screen. */
export const MOBILE_ARTIFACT_MISSION_POOL_LIMIT = MOBILE_ARTIFACT_LIST_LIMIT;

/** Invalidate every artifact list window for the tenant (grown feed limits included). */
export function invalidateMobileArtifactPool(
  queryClient: { invalidateQueries: (opts: { queryKey: readonly unknown[] }) => void },
  tenantId: string,
) {
  queryClient.invalidateQueries({
    queryKey: ['artifacts', 'list', tenantId],
  });
}

/** Refetch feed pool + scheduled story templates (Akış tab tap / pull-to-refresh). */
export async function refetchMobileFeedPool(
  queryClient: {
    refetchQueries: (opts: { queryKey: readonly unknown[] }) => Promise<unknown>;
  },
  tenantId: string,
) {
  await Promise.all([
    queryClient.refetchQueries({
      queryKey: ['artifacts', 'list', tenantId],
    }),
    queryClient.refetchQueries({
      queryKey: ['scheduled-templates', tenantId],
    }),
  ]);
}

/**
 * Feed / profile first paint — matches mission pool so badge + Akış share one cache key.
 * Grows by `MOBILE_ARTIFACT_FEED_PAGE` on scroll until `MOBILE_ARTIFACT_FEED_LIMIT`.
 */
export const MOBILE_ARTIFACT_FEED_INITIAL = MOBILE_ARTIFACT_LIST_LIMIT;

/** Grow step when the user scrolls near the end of the loaded window. */
export const MOBILE_ARTIFACT_FEED_PAGE = 24;

/** Cards rendered per scroll sentinel (DOM lazy paint within the loaded API window). */
export const MOBILE_ARTIFACT_FEED_RENDER_PAGE = 5;

/** Feed / profile archive upper bound — matches ArtifactsController max Take(500). */
export const MOBILE_ARTIFACT_FEED_LIMIT = 500;

/** Outputs archive: slightly larger window when that tab is active. */
export const MOBILE_ARTIFACT_OUTPUTS_LIMIT = 150;

export function mobileArtifactsListLimitForScreen(screen: string): number {
  if (screen === 'feed' || screen === 'profile') return MOBILE_ARTIFACT_FEED_INITIAL;
  if (screen === 'outputs') return MOBILE_ARTIFACT_OUTPUTS_LIMIT;
  return MOBILE_ARTIFACT_LIST_LIMIT;
}

export type MobileArtifactListParams = Pick<
  GetArtifactsParams,
  'limit' | 'missionId' | 'since' | 'agentRunId'
>;

export function mobileArtifactsQueryKey(tenantId: string, params?: MobileArtifactListParams) {
  const merged: MobileArtifactListParams = {
    limit: MOBILE_ARTIFACT_LIST_LIMIT,
    ...params,
  };
  return ['artifacts', 'list', tenantId, merged] as const;
}

export function getMobileArtifactsQueryOptions(
  tenantId: string,
  params?: MobileArtifactListParams,
): UseQueryOptions<OutputArtifact[], Error, OutputArtifact[], ReturnType<typeof mobileArtifactsQueryKey>> {
  const merged: MobileArtifactListParams = {
    limit: MOBILE_ARTIFACT_LIST_LIMIT,
    ...params,
  };
  return {
    queryKey: mobileArtifactsQueryKey(tenantId, merged),
    queryFn: () => apiClient.getArtifacts(merged, tenantId, { timeoutMs: 15_000 }),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
    // Keep showing the current page while a larger window (grown limit) loads —
    // prevents an empty-feed flash during Instagram-style progressive loading.
    placeholderData: keepPreviousData,
    ...mobileQueryDefaults,
  };
}

/** Screens that benefit from live artifact polling (single poller in AppShell). */
export const ARTIFACT_POLL_SCREENS = new Set([
  'feed',
  'profile',
  'outputs',
  'missions',
  'mission-factory',
  'platform-preview',
  'creative-preview',
  'approval',
]);

export function shouldPollArtifactsForScreen(screen: string): boolean {
  return ARTIFACT_POLL_SCREENS.has(screen);
}

/** Poll only on artifact-heavy screens — no background fetch on Brand/More/Settings. */
export function shouldPollArtifactsGlobally(screen: string): boolean {
  return shouldPollArtifactsForScreen(screen);
}

/**
 * Adaptive poll interval with exponential backoff.
 *
 * When data is stable (no active renders, same artifact count), the interval
 * doubles every 3 unchanged polls — capped at 90 s. Active renders keep the
 * fast 8 s interval regardless of backoff level.
 *
 * @param unchangedPolls - consecutive polls that returned identical artifact count
 */
export function mobileArtifactsPollIntervalMs(
  screen: string,
  artifacts: OutputArtifact[] | undefined,
  unchangedPolls = 0,
): number | false {
  if (!shouldPollArtifactsForScreen(screen)) return false;

  if (screen === 'feed') {
    const deduped = dedupeProductionBundles(artifacts ?? []);
    const hasRendering = deduped.some(
      (a) => isBundleRendering(a) && !resolveStoryVideoUrl(a),
    );
    // Active render → always poll fast; otherwise back off.
    if (hasRendering) return 8_000;
    const backoffStep = Math.min(Math.floor(unchangedPolls / 3), 4);
    return Math.min(15_000 * Math.pow(2, backoffStep), 90_000);
  }

  if (screen === 'missions' || screen === 'mission-factory') {
    const deduped = dedupeProductionBundles(artifacts ?? []);
    const hasRendering = deduped.some(
      (a) => isBundleRendering(a) && !resolveStoryVideoUrl(a),
    );
    if (hasRendering) return 12_000;
    const backoffStep = Math.min(Math.floor(unchangedPolls / 3), 3);
    return Math.min(20_000 * Math.pow(2, backoffStep), 90_000);
  }

  if (screen === 'outputs') return 60_000;
  return 60_000;
}
