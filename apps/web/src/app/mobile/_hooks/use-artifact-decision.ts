'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export function useArtifactDecision(artifactId: string | null) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['artifacts'] });
    void queryClient.invalidateQueries({ queryKey: ['artifact', artifactId] });
  };

  const approveMutation = useMutation<void, Error, string | void>({
    mutationFn: async (note) => {
      if (!artifactId) return;
      await apiClient.approveArtifact(artifactId, (note as string | undefined) ?? 'Approved from mobile');
    },
    onSettled: invalidate,
  });

  const rejectMutation = useMutation<void, Error, string | void>({
    mutationFn: async (feedback) => {
      if (!artifactId) return;
      await apiClient.rejectArtifact(artifactId, (feedback as string | undefined) ?? 'Rejected from mobile');
    },
    onSettled: invalidate,
  });

  return { approveMutation, rejectMutation };
}
