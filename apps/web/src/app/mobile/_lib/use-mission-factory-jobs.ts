import { useQuery } from '@tanstack/react-query';
import { apiClient, type MissionProductionJobsSummary } from '@/lib/api-client';

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
      return 8_000;
    },
    staleTime: 5_000,
    retry: 1,
  });
  return { data, isLoading };
}
