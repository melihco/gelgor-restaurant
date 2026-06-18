'use client';

import React, { useEffect, useRef, useState } from 'react';

const DEFAULT_PAGE = 6;

export interface FeedLazyPostListProps<T> {
  items: T[];
  /** Stable key per item */
  itemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  pageSize?: number;
  /** Called when user scrolls near the end — parent can prefetch more artifacts. */
  onNearEnd?: () => void;
  loadMoreLabel?: string;
}

/**
 * Renders feed posts incrementally as the user scrolls.
 * Keeps first paint fast (6 cards) without mounting hundreds of heavy previews.
 */
export function FeedLazyPostList<T>({
  items,
  itemKey,
  renderItem,
  pageSize = DEFAULT_PAGE,
  onNearEnd,
  loadMoreLabel = 'Daha fazla yükleniyor…',
}: FeedLazyPostListProps<T>) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const nearEndFiredRef = useRef(false);

  useEffect(() => {
    setVisibleCount(pageSize);
    nearEndFiredRef.current = false;
  }, [items, pageSize]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visibleCount >= items.length) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setVisibleCount((prev) => {
          const next = Math.min(prev + pageSize, items.length);
          if (next >= items.length - pageSize && !nearEndFiredRef.current) {
            nearEndFiredRef.current = true;
            onNearEnd?.();
          }
          return next;
        });
      },
      { rootMargin: '480px 0px', threshold: 0.01 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [items.length, visibleCount, pageSize, onNearEnd]);

  const visible = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  return (
    <>
      {visible.map((item, idx) => (
        <React.Fragment key={itemKey(item, idx)}>
          {renderItem(item, idx)}
        </React.Fragment>
      ))}
      {hasMore && (
        <div
          ref={sentinelRef}
          aria-hidden
          style={{
            padding: '20px 16px 32px',
            textAlign: 'center',
            fontSize: 12,
            opacity: 0.45,
            color: '#fff',
          }}
        >
          {loadMoreLabel}
        </div>
      )}
    </>
  );
}
