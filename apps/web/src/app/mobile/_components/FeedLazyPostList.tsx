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
  /** Parent still has older pages to fetch from the API. */
  hasMoreRemote?: boolean;
  loadMoreLabel?: string;
}

/**
 * Renders feed posts incrementally as the user scrolls.
 * Keeps first paint fast without mounting hundreds of heavy previews.
 * When the parent grows `items` (API window expand), scroll position is preserved.
 */
export function FeedLazyPostList<T>({
  items,
  itemKey,
  renderItem,
  pageSize = DEFAULT_PAGE,
  onNearEnd,
  hasMoreRemote = false,
  loadMoreLabel = 'Daha fazla yükleniyor…',
}: FeedLazyPostListProps<T>) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const nearEndFiredRef = useRef(false);
  const prevLenRef = useRef(items.length);
  const prevHeadRef = useRef(items.length ? itemKey(items[0]!, 0) : '');

  useEffect(() => {
    const head = items.length ? itemKey(items[0]!, 0) : '';
    const sameHead = head === prevHeadRef.current;
    const grewOrSame = items.length >= prevLenRef.current && sameHead;
    if (!grewOrSame) {
      setVisibleCount(pageSize);
    }
    nearEndFiredRef.current = false;
    prevLenRef.current = items.length;
    prevHeadRef.current = head;
  }, [items, pageSize, itemKey]);

  useEffect(() => {
    if (items.length === 0) return;
    const nearDomEnd = visibleCount >= Math.max(0, items.length - pageSize);
    const paintedAll = visibleCount >= items.length;
    if (!nearDomEnd && !paintedAll) return;
    if (!hasMoreRemote && paintedAll) return;
    if (nearEndFiredRef.current) return;
    nearEndFiredRef.current = true;
    onNearEnd?.();
  }, [visibleCount, items.length, pageSize, onNearEnd, hasMoreRemote]);

  const hasMoreDom = visibleCount < items.length;
  const showSentinel = hasMoreDom || hasMoreRemote;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMoreDom) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setVisibleCount((prev) => Math.min(prev + pageSize, items.length));
      },
      { rootMargin: '480px 0px', threshold: 0.01 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [items.length, visibleCount, pageSize, hasMoreDom]);

  // When DOM is fully painted but older API pages remain, keep asking for more
  // while the sentinel stays in view (IntersectionObserver alone won't fire again).
  useEffect(() => {
    if (!hasMoreRemote || hasMoreDom) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        if (nearEndFiredRef.current) return;
        nearEndFiredRef.current = true;
        onNearEnd?.();
      },
      { rootMargin: '480px 0px', threshold: 0.01 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMoreRemote, hasMoreDom, onNearEnd, items.length]);

  const visible = items.slice(0, visibleCount);

  return (
    <>
      {visible.map((item, idx) => (
        <React.Fragment key={itemKey(item, idx)}>
          {renderItem(item, idx)}
        </React.Fragment>
      ))}
      {showSentinel && (
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
