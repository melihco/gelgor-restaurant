'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient, ApiRequestError } from '@/lib/api-client';
import {
  mapDashboardAgent,
  mapDashboardTask,
  sortAgentsForLayout,
  type DashboardAgent,
  type DashboardArtifact,
} from '@/lib/dashboard-mappers';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { TaskItem, OutputArtifact } from '@/types';

interface DashboardSnapshot {
  agents: DashboardAgent[];
  tasks: TaskItem[];
  artifacts: DashboardArtifact[];
  pendingArtifacts: DashboardArtifact[];
  tasksQuotaBlocked: boolean;
}

export function useDashboardSnapshot(officeIdOverride?: string) {
  const workspaceOfficeId = useWorkspaceStore((s) => s.officeId);
  const officeId = officeIdOverride ?? workspaceOfficeId;

  return useQuery<DashboardSnapshot>({
    queryKey: ['dashboard-snapshot', officeId],
    queryFn: async () => {
      const [rawAgentsResult, rawBriefsResult, rawArtifactsResult] = await Promise.allSettled([
        apiClient.getAgents(officeId) as Promise<any[]>,
        apiClient.getBriefs(officeId) as Promise<any[]>,
        apiClient.getArtifacts() as Promise<OutputArtifact[]>,
      ]);

      const rawAgents =
        rawAgentsResult.status === 'fulfilled' ? rawAgentsResult.value : [];
      const rawBriefs =
        rawBriefsResult.status === 'fulfilled' ? rawBriefsResult.value : [];
      const rawArtifacts =
        rawArtifactsResult.status === 'fulfilled' ? rawArtifactsResult.value : [];

      let tasksQuotaBlocked = false;
      const rawTasks = await apiClient.getRecentTasks(120).catch((error: unknown) => {
        // Avoid N+1 fallback during rate-limit windows; it amplifies 429 traffic.
        if (error instanceof ApiRequestError && (error.status === 402 || error.status === 429)) {
          tasksQuotaBlocked = true;
          return [] as TaskItem[];
        }
        return [] as TaskItem[];
      });

      const agents = sortAgentsForLayout(
        rawAgents
          .map((agent) => mapDashboardAgent(agent))
          .filter((agent): agent is DashboardAgent => Boolean(agent))
      );

      const tasks = rawTasks.map((task) => mapDashboardTask(task, agents));
      const artifacts = rawArtifacts as DashboardArtifact[];

      return {
        agents,
        tasks,
        artifacts,
        pendingArtifacts: artifacts.filter(
          (artifact) => artifact.status === 'pending_review'
        ),
        tasksQuotaBlocked,
      };
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}
