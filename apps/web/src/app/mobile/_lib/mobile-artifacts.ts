import type { UseQueryOptions } from '@tanstack/react-query';
import { apiClient, type GetArtifactsParams } from '@/lib/api-client';
import type { OutputArtifact } from '@/types';
import {
  dedupeProductionBundles,
  isBundleRendering,
  resolveStoryVideoUrl,
} from '@/lib/mission-feed-package';
import { mobileQueryDefaults } from './mobile-query';

/** Default list cap — full history on Outputs uses a higher screen-specific limit. */
export const MOBILE_ARTIFACT_LIST_LIMIT = 100;

/** Feed / home: pending cards only need the recent window. */
export const MOBILE_ARTIFACT_FEED_LIMIT = 80;

/** Outputs archive: slightly larger window when that tab is active. */
export const MOBILE_ARTIFACT_OUTPUTS_LIMIT = 150;

export function mobileArtifactsListLimitForScreen(screen: string): number {
  if (screen === 'feed') return MOBILE_ARTIFACT_FEED_LIMIT;
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
    queryFn: () => apiClient.getArtifacts(merged),
    staleTime: 15_000,
    retry: 1,
    ...mobileQueryDefaults,
  };
}

/** Screens that benefit from live artifact polling (single poller in AppShell). */
export const ARTIFACT_POLL_SCREENS = new Set([
  'feed',
  'outputs',
  'missions',
  'mission-factory',
  'platform-preview',
  'creative-preview',
  'approval',
  'reels-studio',
]);

export function shouldPollArtifactsForScreen(screen: string): boolean {
  return ARTIFACT_POLL_SCREENS.has(screen);
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
    const backoffStep = Math.min(Math.floor(unchangedPolls / 3), 3);
    return Math.min(12_000 * Math.pow(2, backoffStep), 60_000);
  }

  if (screen === 'outputs') return 60_000;
  return 60_000;
}
