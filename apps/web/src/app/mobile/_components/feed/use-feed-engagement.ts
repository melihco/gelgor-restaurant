'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  defaultEngagementForId,
  type FeedComment,
  type FeedEngagementState,
} from './types';

const STORAGE_KEY = 'sa-feed-engagement-v1';

type EngagementMap = Record<string, FeedEngagementState>;
type CommentMap = Record<string, FeedComment[]>;

function loadMap(): EngagementMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as EngagementMap;
  } catch {
    return {};
  }
}

function saveMap(map: EngagementMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function seedComments(id: string, count: number): FeedComment[] {
  const n = Math.min(6, Math.max(2, Math.floor(count / 40)));
  const samples = [
    'Harika görünüyor 👏',
    'Bu mekanı çok özledik',
    'Muhteşem kare!',
    'Ne zaman gidiyoruz?',
    'Atmosfer efsane',
    'Kaydettim 🔖',
  ];
  return Array.from({ length: n }, (_, i) => ({
    id: `${id}-c${i}`,
    author: ['deniz_k', 'ayca.m', 'cem_yil', 'sofra.club', 'gece_mavi', 'selin'][i % 6]!,
    text: samples[i % samples.length]!,
    createdAt: new Date(Date.now() - (i + 1) * 3_600_000).toISOString(),
  }));
}

/**
 * Optimistic like/save/comment UI state.
 * TODO(backend): persist via engagement API when available; rollback path is ready.
 */
export function useFeedEngagement() {
  const [map, setMap] = useState<EngagementMap>({});
  const [comments, setComments] = useState<CommentMap>({});
  const pendingOps = useRef(new Map<string, number>());
  const hydrated = useRef(false);

  useEffect(() => {
    setMap(loadMap());
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    saveMap(map);
  }, [map]);

  const get = useCallback((id: string): FeedEngagementState => {
    return map[id] ?? defaultEngagementForId(id);
  }, [map]);

  const getComments = useCallback((id: string): FeedComment[] => {
    if (comments[id]) return comments[id]!;
    const base = defaultEngagementForId(id);
    return seedComments(id, base.commentCount);
  }, [comments]);

  const toggleLike = useCallback(async (id: string) => {
    const token = (pendingOps.current.get(id) ?? 0) + 1;
    pendingOps.current.set(id, token);
    const prev = map[id] ?? defaultEngagementForId(id);
    const next: FeedEngagementState = {
      ...prev,
      isLiked: !prev.isLiked,
      likeCount: Math.max(0, prev.likeCount + (prev.isLiked ? -1 : 1)),
    };
    setMap((m) => ({ ...m, [id]: next }));

    // TODO(backend): POST /api/engagement/{id}/like
    try {
      await Promise.resolve();
      if (pendingOps.current.get(id) !== token) return;
    } catch {
      if (pendingOps.current.get(id) !== token) return;
      setMap((m) => ({ ...m, [id]: prev }));
    }
  }, [map]);

  const toggleSave = useCallback(async (id: string) => {
    const token = (pendingOps.current.get(`save:${id}`) ?? 0) + 1;
    pendingOps.current.set(`save:${id}`, token);
    const prev = map[id] ?? defaultEngagementForId(id);
    const next = { ...prev, isSaved: !prev.isSaved };
    setMap((m) => ({ ...m, [id]: next }));
    try {
      // TODO(backend): POST /api/engagement/{id}/save
      await Promise.resolve();
      if (pendingOps.current.get(`save:${id}`) !== token) return;
    } catch {
      if (pendingOps.current.get(`save:${id}`) !== token) return;
      setMap((m) => ({ ...m, [id]: prev }));
    }
  }, [map]);

  const addComment = useCallback(async (id: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const prevComments = getComments(id);
    const optimistic: FeedComment = {
      id: `local-${Date.now()}`,
      author: 'sen',
      text: trimmed,
      createdAt: new Date().toISOString(),
      isOwn: true,
    };
    const prevEng = map[id] ?? defaultEngagementForId(id);
    setComments((c) => ({ ...c, [id]: [...prevComments, optimistic] }));
    setMap((m) => ({
      ...m,
      [id]: { ...prevEng, commentCount: prevEng.commentCount + 1 },
    }));
    try {
      // TODO(backend): POST /api/engagement/{id}/comments
      await Promise.resolve();
    } catch {
      setComments((c) => ({ ...c, [id]: prevComments }));
      setMap((m) => ({ ...m, [id]: prevEng }));
    }
  }, [getComments, map]);

  return {
    get,
    getComments,
    toggleLike,
    toggleSave,
    addComment,
  };
}

export type FeedEngagementApi = ReturnType<typeof useFeedEngagement>;
