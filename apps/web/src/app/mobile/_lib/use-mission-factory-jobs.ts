import { useQuery } from '@tanstack/react-query';
import { apiClient, type MissionProductionJobsSummary } from '@/lib/api-client';

const BASE_POLL_MS = 12_000;
const MAX_POLL_MS = 60_000;

function isTransientProductionJobsError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return /\((502|503|504)\)/.test(msg);
}

/** Poll durable factory rollup for Mission Hub production status. */
export function useMissionFactoryJobs(
  workspaceId: string | undefined,
  missionId: string | undefined,
  enabled = true,
): { data: MissionProductionJobsSummary | undefined; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ['mission-production-jobs', workspaceId, missionId],
    queryFn: () => apiClient.getMissionProductionJobs(workspaceId!, missionId!),
    enabled: enabled && Boolean(workspaceId && missionId),
    refetchInterval: (query) => {
      const summary = query.state.data as MissionProductionJobsSummary | undefined;
      if (!summary?.total || summary.complete) return false;
      const failCount = query.state.errorUpdateCount ?? 0;
      if (failCount > 0) {
        return Math.min(MAX_POLL_MS, BASE_POLL_MS * 2 ** Math.min(failCount, 3));
      }
      return BASE_POLL_MS;
    },
    staleTime: 8_000,
    retry: (failureCount, error) =>
      isTransientProductionJobsError(error) ? failureCount < 3 : failureCount < 1,
    retryDelay: (attemptIndex) => Math.min(30_000, 2_000 * 2 ** attemptIndex),
    refetchOnWindowFocus: false,
  });
  return { data, isLoading };
}
