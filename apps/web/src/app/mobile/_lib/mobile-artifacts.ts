import type { UseQueryOptions } from '@tanstack/react-query';
import { apiClient, type GetArtifactsParams } from '@/lib/api-client';
import type { OutputArtifact } from '@/types';
import {
  dedupeProductionBundles,
  isBundleRendering,
  resolveStoryVideoUrl,
} from '@/lib/mission-feed-package';
import { mobileQueryDefaults } from './mobile-query';

/** Recent feed window — avoids loading 200+ rows on every poll. */
export const MOBILE_ARTIFACT_LIST_LIMIT = 120;

export type MobileArtifactListParams = Pick<
  GetArtifactsParams,
  'limit' | 'missionId' | 'since' | 'agentRunId'
>;

export function mobileArtifactsQueryKey(params?: MobileArtifactListParams) {
  return ['artifacts', 'list', params ?? { limit: MOBILE_ARTIFACT_LIST_LIMIT }] as const;
}

export function getMobileArtifactsQueryOptions(
  params?: MobileArtifactListParams,
): UseQueryOptions<OutputArtifact[], Error, OutputArtifact[], ReturnType<typeof mobileArtifactsQueryKey>> {
  const merged: MobileArtifactListParams = {
    limit: MOBILE_ARTIFACT_LIST_LIMIT,
    ...params,
  };
  return {
    queryKey: mobileArtifactsQueryKey(merged),
    queryFn: () => apiClient.getArtifacts(merged),
    staleTime: 15_000,
    retry: 1,
    ...mobileQueryDefaults,
  };
}

/** Screens that benefit from live artifact polling (single poller in AppShell). */
export const ARTIFACT_POLL_SCREENS = new Set([
  'home',
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

export function mobileArtifactsPollIntervalMs(
  screen: string,
  artifacts: OutputArtifact[] | undefined,
): number | false {
  if (!shouldPollArtifactsForScreen(screen)) return false;
  if (screen === 'feed') {
    const deduped = dedupeProductionBundles(artifacts ?? []);
    const hasRendering = deduped.some(
      (a) => isBundleRendering(a) && !resolveStoryVideoUrl(a),
    );
    return hasRendering ? 5_000 : 15_000;
  }
  if (screen === 'missions' || screen === 'mission-factory') return 20_000;
  return 30_000;
}
