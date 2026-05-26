'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { TaskItem, TaskUpdateRequest } from '@/types';

export function useTasks(briefId: string) {
  return useQuery({
    queryKey: ['tasks', briefId],
    queryFn: () => apiClient.getTasks(briefId),
    enabled: !!briefId,
    staleTime: 30000,
  });
}

export function useTask(taskId: string) {
  return useQuery({
    queryKey: ['task', taskId],
    queryFn: () => apiClient.getTask(taskId),
    enabled: !!taskId,
    staleTime: 30000,
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: TaskUpdateRequest }) =>
      apiClient.updateTaskStatus(taskId, data),
    onSuccess: (updatedTask) => {
      queryClient.setQueryData(['task', updatedTask.id], updatedTask);
      queryClient.invalidateQueries({
        queryKey: ['tasks'],
      });
    },
  });
}

export function useAssignTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, agentId }: { taskId: string; agentId: string }) =>
      apiClient.assignTask(taskId, agentId),
    onSuccess: (updatedTask) => {
      queryClient.setQueryData(['task', updatedTask.id], updatedTask);
      queryClient.invalidateQueries({
        queryKey: ['tasks'],
      });
    },
  });
}
