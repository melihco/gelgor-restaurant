'use client';

import { useCallback, useRef, useState, type RefObject } from 'react';

const PULL_THRESHOLD_PX = 72;
const MAX_PULL_PX = 120;

export function useFeedPullToRefresh({
  scrollRef,
  onRefresh,
  disabled = false,
}: {
  scrollRef: RefObject<HTMLElement | null>;
  onRefresh: () => Promise<void> | void;
  disabled?: boolean;
}) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);

  const resetPull = useCallback(() => {
    pullingRef.current = false;
    setPullDistance(0);
  }, []);

  const onTouchStart = useCallback((event: React.TouchEvent) => {
    if (disabled || refreshing) return;
    const el = scrollRef.current;
    if (!el || el.scrollTop > 1) return;
    startYRef.current = event.touches[0]?.clientY ?? 0;
    pullingRef.current = true;
  }, [disabled, refreshing, scrollRef]);

  const onTouchMove = useCallback((event: React.TouchEvent) => {
    if (!pullingRef.current || disabled || refreshing) return;
    const el = scrollRef.current;
    if (!el || el.scrollTop > 1) {
      resetPull();
      return;
    }
    const delta = (event.touches[0]?.clientY ?? 0) - startYRef.current;
    if (delta <= 0) {
      setPullDistance(0);
      return;
    }
    event.preventDefault();
    setPullDistance(Math.min(MAX_PULL_PX, delta * 0.5));
  }, [disabled, refreshing, resetPull, scrollRef]);

  const onTouchEnd = useCallback(() => {
    if (!pullingRef.current) return;
    const shouldRefresh = pullDistance >= PULL_THRESHOLD_PX;
    pullingRef.current = false;
    if (!shouldRefresh || disabled) {
      resetPull();
      return;
    }
    void (async () => {
      setRefreshing(true);
      setPullDistance(PULL_THRESHOLD_PX);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        resetPull();
      }
    })();
  }, [disabled, onRefresh, pullDistance, resetPull]);

  const pullActive = pullDistance > 0 || refreshing;
  const pullReady = pullDistance >= PULL_THRESHOLD_PX || refreshing;

  return {
    pullDistance,
    pullActive,
    pullReady,
    refreshing,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}
