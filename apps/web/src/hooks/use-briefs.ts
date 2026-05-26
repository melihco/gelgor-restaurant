'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Brief, BriefCreateRequest } from '@/types';

export function useBriefs(officeId: string) {
  return useQuery({
    queryKey: ['briefs', officeId],
    queryFn: () => apiClient.getBriefs(officeId),
    enabled: !!officeId,
    staleTime: 30000,
  });
}

export function useBrief(briefId: string) {
  return useQuery({
    queryKey: ['brief', briefId],
    queryFn: () => apiClient.getBrief(briefId),
    enabled: !!briefId,
    staleTime: 30000,
  });
}

export function useCreateBrief() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ officeId, data }: { officeId: string; data: BriefCreateRequest }) =>
      apiClient.createBrief(officeId, data),
    onSuccess: (newBrief) => {
      queryClient.invalidateQueries({
        queryKey: ['briefs'],
      });
      queryClient.setQueryData(['brief', newBrief.id], newBrief);
    },
  });
}

export function useSubmitBrief() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (briefId: string) => apiClient.submitBrief(briefId),
    onSuccess: (_data, briefId) => {
      queryClient.invalidateQueries({
        queryKey: ['brief', briefId],
      });
      queryClient.invalidateQueries({
        queryKey: ['briefs'],
      });
    },
  });
}
