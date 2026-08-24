'use client';

import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { parseMotionProfileFromTheme } from '@/lib/brand-motion-profile';
import { storyMusicPreviewPath } from '@/lib/story-audio-catalog';
import {
  resolveStoryAudioMood,
  storyAudioSlotIndexFromId,
} from '@/lib/story-audio-mood';
import { useActiveTenantId } from '@/hooks/useActiveTenantId';
import { fetchTenantBff } from '@/lib/bff-fetch';

export type StoryAudioResolveInput = {
  /** Produce-time stamp on artifact metadata */
  explicit?: string | null;
  /** Mission idea / story slot index */
  slotIndex?: number | null;
  /** Fallback hash seed when idea_index missing */
  artifactId?: string | null;
};

/**
 * Resolves the tenant's story/reel background music from brand_theme.motion_profile.
 * Rotates across `audioMoodPool` so each mission story can play a different track.
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

  const resolveTrackId = useCallback((input?: StoryAudioResolveInput) => {
    const slotIndex = typeof input?.slotIndex === 'number' && Number.isFinite(input.slotIndex)
      ? Math.max(0, Math.floor(input.slotIndex))
      : storyAudioSlotIndexFromId(input?.artifactId);
    return resolveStoryAudioMood({
      explicit: input?.explicit,
      selected: profile.storyAudioMood,
      pool: profile.audioMoodPool,
      slotIndex,
    });
  }, [profile.storyAudioMood, profile.audioMoodPool]);

  const resolveMusicUrl = useCallback((input?: StoryAudioResolveInput) => (
    storyMusicPreviewPath(resolveTrackId(input))
  ), [resolveTrackId]);

  const trackId = useMemo(() => resolveTrackId({ slotIndex: 0 }), [resolveTrackId]);
  const storyMusicUrl = useMemo(() => storyMusicPreviewPath(trackId), [trackId]);

  return {
    storyMusicUrl,
    trackId,
    resolveTrackId,
    resolveMusicUrl,
    profile,
    isPending,
  };
}

/** Read produce-time / idea index fields from artifact metadata. */
export function storyAudioResolveFromArtifactMeta(
  meta: Record<string, unknown> | null | undefined,
  artifactId?: string | null,
): StoryAudioResolveInput {
  const m = meta ?? {};
  const explicit = String(
    m.story_audio_mood ?? m.storyAudioMood ?? m.audio_mood ?? '',
  ).trim() || null;
  const slotRaw = m.idea_index ?? m.ideaIndex ?? m.story_index ?? m.storyIndex;
  const slotIndex = typeof slotRaw === 'number' && Number.isFinite(slotRaw)
    ? slotRaw
    : (typeof slotRaw === 'string' && slotRaw.trim() && Number.isFinite(Number(slotRaw))
      ? Number(slotRaw)
      : null);
  return { explicit, slotIndex, artifactId: artifactId ?? null };
}

/**
 * True when the produced video file already carries its music bed.
 *
 * Previews mute the video and run a parallel `<audio>` loop, which is the only
 * way to score a still or a legacy silent render. Doing that over a muxed file
 * would stack two beds out of sync, so those players must unmute instead.
 */
export function artifactCarriesEmbeddedAudio(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  const m = meta ?? {};
  return m.story_audio_muxed === true || m.storyAudioMuxed === true;
}
