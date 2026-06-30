'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { parseMotionProfileFromTheme } from '@/lib/brand-motion-profile';
import { storyMusicPreviewPath } from '@/lib/story-audio-catalog';
import { resolveStoryAudioMood } from '@/lib/story-audio-mood';
import { useActiveTenantId } from '@/hooks/useActiveTenantId';
import { fetchTenantBff } from '@/lib/bff-fetch';

/**
 * Resolves the tenant's selected story background music from brand_theme.motion_profile.
 * Used by feed / preview story players (matches Marka → Arka plan müziği selection).
 */
export function useBrandStoryAudio(workspaceId?: string | null) {
  const storeTenantId = useActiveTenantId();
  const tenantId = workspaceId ?? storeTenantId;

  const { data: theme, isPending } = useQuery({
    queryKey: ['brand-theme', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const res = await fetchTenantBff(`/api/brand-context/${tenantId}/theme`, tenantId);
      if (!res.ok) return null;
      const data = (await res.json()) as { theme?: Record<string, unknown> };
      return data.theme ?? null;
    },
    staleTime: 60_000,
    enabled: Boolean(tenantId),
  });

  const profile = useMemo(
    () => parseMotionProfileFromTheme(theme),
    [theme],
  );

  const trackId = useMemo(
    () => resolveStoryAudioMood({
      selected: profile.storyAudioMood,
      pool: profile.audioMoodPool,
    }),
    [profile.storyAudioMood, profile.audioMoodPool],
  );

  const storyMusicUrl = useMemo(
    () => storyMusicPreviewPath(trackId),
    [trackId],
  );

  return {
    storyMusicUrl,
    trackId,
    profile,
    isPending,
  };
}
