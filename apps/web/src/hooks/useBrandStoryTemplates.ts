'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ensureBrandTemplateLibrary,
  parseBrandTemplateLibraryFromTheme,
  type BrandTemplateLibrary,
} from '@/lib/brand-template-library';
import { listEnabledStorySlots } from '@/lib/mission-story-template';
import { resolveKitForSector } from '@/lib/story-template-registry';
import { tenantKitSeed } from '@/lib/tenant-template-seed';

export function useBrandStoryTemplates(
  workspaceId: string | null | undefined,
  sector: string,
) {
  const kitId = resolveKitForSector(sector, tenantKitSeed(workspaceId ?? undefined));

  const query = useQuery({
    queryKey: ['brand-story-templates', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;
      const res = await fetch(`/api/brand-context/${workspaceId}/theme`, {
        headers: { 'X-Tenant-Id': workspaceId },
      });
      if (!res.ok) return null;
      const data = await res.json() as { theme?: Record<string, unknown> | null };
      return data.theme ?? null;
    },
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
  });

  const library = useMemo((): BrandTemplateLibrary | null => {
    if (!workspaceId) return null;
    return ensureBrandTemplateLibrary(query.data, {
      sector,
      kitId,
      tenantId: workspaceId,
    });
  }, [workspaceId, query.data, sector, kitId]);

  const savedLibrary = parseBrandTemplateLibraryFromTheme(query.data);
  const storySlots = library ? listEnabledStorySlots(library) : [];

  return {
    theme: query.data,
    library,
    storySlots,
    kitId,
    isLocked: Boolean(savedLibrary?.locked),
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
