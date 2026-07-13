'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type PlaybackController = {
  pause: () => void;
  id: string;
};

type MediaPlaybackContextValue = {
  /** Global unmute preference across feed + reels. */
  preferUnmuted: boolean;
  setPreferUnmuted: (value: boolean) => void;
  /** When true, all registered players should pause (sheets, tab blur, story open). */
  globallyPaused: boolean;
  setGloballyPaused: (paused: boolean) => void;
  /** Only one active video id may play. */
  activeMediaId: string | null;
  setActiveMediaId: (id: string | null) => void;
  registerController: (id: string, pause: () => void) => () => void;
  pauseAll: () => void;
};

const MediaPlaybackContext = createContext<MediaPlaybackContextValue | null>(null);

const MUTE_PREF_KEY = 'sa-feed-prefer-unmuted';

export function MediaPlaybackProvider({ children }: { children: React.ReactNode }) {
  const [preferUnmuted, setPreferUnmutedState] = useState(false);
  const [globallyPaused, setGloballyPaused] = useState(false);
  const [activeMediaId, setActiveMediaId] = useState<string | null>(null);
  const controllersRef = useRef(new Map<string, () => void>());

  useEffect(() => {
    try {
      setPreferUnmutedState(sessionStorage.getItem(MUTE_PREF_KEY) === '1');
    } catch {
      /* private mode */
    }
  }, []);

  const setPreferUnmuted = useCallback((value: boolean) => {
    setPreferUnmutedState(value);
    try {
      sessionStorage.setItem(MUTE_PREF_KEY, value ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  const registerController = useCallback((id: string, pause: () => void) => {
    controllersRef.current.set(id, pause);
    return () => {
      controllersRef.current.delete(id);
    };
  }, []);

  const pauseAll = useCallback(() => {
    controllersRef.current.forEach((pause) => {
      try {
        pause();
      } catch {
        /* ignore */
      }
    });
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setGloballyPaused(true);
        pauseAll();
      } else {
        setGloballyPaused(false);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [pauseAll]);

  const value = useMemo<MediaPlaybackContextValue>(() => ({
    preferUnmuted,
    setPreferUnmuted,
    globallyPaused,
    setGloballyPaused,
    activeMediaId,
    setActiveMediaId,
    registerController,
    pauseAll,
  }), [
    preferUnmuted,
    setPreferUnmuted,
    globallyPaused,
    activeMediaId,
    registerController,
    pauseAll,
  ]);

  return (
    <MediaPlaybackContext.Provider value={value}>
      {children}
    </MediaPlaybackContext.Provider>
  );
}

export function useMediaPlayback(): MediaPlaybackContextValue {
  const ctx = useContext(MediaPlaybackContext);
  if (!ctx) {
    return {
      preferUnmuted: false,
      setPreferUnmuted: () => undefined,
      globallyPaused: false,
      setGloballyPaused: () => undefined,
      activeMediaId: null,
      setActiveMediaId: () => undefined,
      registerController: () => () => undefined,
      pauseAll: () => undefined,
    };
  }
  return ctx;
}

export type { PlaybackController };
