'use client';
import { useEffect, useRef } from 'react';

/** Left-edge zone (px) where a back-swipe may begin — mirrors iOS UIScreenEdgePanGestureRecognizer. */
const EDGE_START_PX = 32;
/** Movement needed before we lock the gesture direction (horizontal vs vertical scroll). */
const DIRECTION_LOCK_PX = 12;
/** Release past this fraction of screen width commits the back navigation. */
const COMMIT_RATIO = 0.3;
/** Or a fast flick (px/ms) commits regardless of distance. */
const COMMIT_VELOCITY = 0.5;

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

export interface EdgeSwipeBackOptions {
  /** Stable container that hosts the stack layers (listeners attach here once). */
  hostRef: React.RefObject<HTMLElement | null>;
  /** Top stack layer being dragged. */
  getLayer: () => HTMLElement | null;
  /** Optional screen revealed beneath (gets iOS-style parallax). */
  getUnderlay: () => HTMLElement | null;
  isEnabled: () => boolean;
  onSwipeStart: () => void;
  onCommit: () => void;
  onCancel: () => void;
}

/**
 * Interactive iOS-style edge-swipe-back: the top stack layer follows the
 * finger from the left edge; releasing past the threshold (or flicking)
 * slides it off-screen and triggers goBack().
 */
export function useEdgeSwipeBack(options: EdgeSwipeBackOptions) {
  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    const host = optsRef.current.hostRef.current;
    if (!host) return;

    let tracking = false;   // touch began at the edge, direction not locked yet
    let dragging = false;   // horizontal drag in progress
    let startX = 0;
    let startY = 0;
    let curX = 0;
    let lastX = 0;
    let lastTime = 0;
    let velocity = 0;
    let width = 1;

    const setUnderlayProgress = (progress: number, animate: boolean) => {
      const under = optsRef.current.getUnderlay();
      if (!under) return;
      under.style.transition = animate
        ? `transform 260ms ${EASE}, opacity 260ms ease`
        : 'none';
      under.style.transform = `translate3d(${-28 + 28 * progress}%, 0, 0)`;
      under.style.opacity = String(0.6 + 0.4 * progress);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (dragging || !optsRef.current.isEnabled()) return;
      const touch = e.touches[0];
      if (!touch || e.touches.length > 1) return;
      const hostLeft = host.getBoundingClientRect().left;
      if (touch.clientX - hostLeft > EDGE_START_PX) return;
      tracking = true;
      startX = touch.clientX;
      startY = touch.clientY;
      lastX = startX;
      lastTime = e.timeStamp;
      velocity = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      if (!dragging) {
        if (Math.abs(dy) > DIRECTION_LOCK_PX && Math.abs(dy) > Math.abs(dx)) {
          tracking = false; // vertical scroll wins
          return;
        }
        if (dx <= DIRECTION_LOCK_PX) return;
        const layer = optsRef.current.getLayer();
        if (!layer) {
          tracking = false;
          return;
        }
        dragging = true;
        width = layer.offsetWidth || window.innerWidth;
        layer.style.transition = 'none';
        layer.style.willChange = 'transform';
        optsRef.current.onSwipeStart();
      }

      e.preventDefault();
      const layer = optsRef.current.getLayer();
      if (!layer) return;

      curX = Math.max(0, dx);
      layer.style.transform = `translate3d(${curX}px, 0, 0)`;
      setUnderlayProgress(Math.min(1, curX / width), false);

      const dt = e.timeStamp - lastTime;
      if (dt > 0) {
        velocity = (touch.clientX - lastX) / dt;
        lastX = touch.clientX;
        lastTime = e.timeStamp;
      }
    };

    const onTouchEnd = () => {
      if (!dragging) {
        tracking = false;
        return;
      }
      tracking = false;
      dragging = false;

      const layer = optsRef.current.getLayer();
      if (!layer) {
        optsRef.current.onCancel();
        return;
      }

      const commit = curX > width * COMMIT_RATIO || velocity > COMMIT_VELOCITY;
      layer.style.transition = `transform 260ms ${EASE}`;

      if (commit) {
        layer.style.transform = 'translate3d(100%, 0, 0)';
        setUnderlayProgress(1, true);
        window.setTimeout(() => optsRef.current.onCommit(), 240);
      } else {
        layer.style.transform = 'translate3d(0, 0, 0)';
        setUnderlayProgress(0, true);
        window.setTimeout(() => {
          layer.style.transition = '';
          layer.style.transform = '';
          layer.style.willChange = '';
          optsRef.current.onCancel();
        }, 280);
      }
      curX = 0;
    };

    host.addEventListener('touchstart', onTouchStart, { passive: true });
    host.addEventListener('touchmove', onTouchMove, { passive: false });
    host.addEventListener('touchend', onTouchEnd);
    host.addEventListener('touchcancel', onTouchEnd);
    return () => {
      host.removeEventListener('touchstart', onTouchStart);
      host.removeEventListener('touchmove', onTouchMove);
      host.removeEventListener('touchend', onTouchEnd);
      host.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);
}
