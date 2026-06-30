'use client';
/**
 * StoryNavigation — Instagram-story-style navigation wrapper.
 *
 * Renders segmented progress bars at the top, supports tap-left/right and
 * horizontal swipe to move between screens, and optional auto-advance. The
 * component is controlled: the parent owns `index` and renders the current
 * screen as children. Used to make the onboarding flow feel like a story.
 */
import { useCallback, useEffect, useRef } from 'react';

export interface StoryNavigationProps {
  /** Total number of screens. */
  count: number;
  /** Active screen index (controlled). */
  index: number;
  /** Called with the next index when navigating within bounds. */
  onIndexChange: (next: number) => void;
  /** Called when advancing past the last screen. */
  onComplete?: () => void;
  /**
   * Auto-advance delay in ms for the current screen. When null/undefined the
   * screen waits for manual navigation (e.g. a form step).
   */
  autoAdvanceMs?: number | null;
  /** Pause auto-advance + the fill animation (e.g. while loading). */
  paused?: boolean;
  /** Disable tap/swipe back navigation (forward-only flows). */
  disableBack?: boolean;
  /** Accent color for the active/filled progress segment. */
  accentColor?: string;
  children: React.ReactNode;
}

export function StoryNavigation({
  count,
  index,
  onIndexChange,
  onComplete,
  autoAdvanceMs,
  paused = false,
  disableBack = false,
  accentColor = '#8AABBD',
  children,
}: StoryNavigationProps) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const goNext = useCallback(() => {
    if (index >= count - 1) {
      onComplete?.();
      return;
    }
    onIndexChange(index + 1);
  }, [index, count, onComplete, onIndexChange]);

  const goPrev = useCallback(() => {
    if (disableBack) return;
    if (index <= 0) return;
    onIndexChange(index - 1);
  }, [index, disableBack, onIndexChange]);

  // Auto-advance timer for the current screen.
  useEffect(() => {
    if (paused || autoAdvanceMs == null || autoAdvanceMs <= 0) return;
    const t = setTimeout(goNext, autoAdvanceMs);
    return () => clearTimeout(t);
  }, [paused, autoAdvanceMs, goNext, index]);

  // Keyboard arrows for desktop preview.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
    touchStartY.current = e.touches[0]?.clientY ?? null;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const startX = touchStartX.current;
    const startY = touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (startX == null || startY == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? startX) - startX;
    const dy = (e.changedTouches[0]?.clientY ?? startY) - startY;
    // Horizontal swipe only (ignore vertical scrolls).
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) goNext();
    else goPrev();
  }

  return (
    <div
      className="story-nav"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <style>{`
        .story-nav { position: relative; width: 100%; height: 100dvh; overflow: hidden; }
        .story-nav-bars {
          position: absolute; top: 0; left: 0; right: 0; z-index: 30;
          display: flex; gap: 4px; padding: 10px 12px;
          padding-top: max(10px, env(safe-area-inset-top));
        }
        .story-nav-bar {
          flex: 1; height: 2.5px; border-radius: 2px;
          background: rgba(255,255,255,0.22); overflow: hidden;
        }
        .story-nav-bar-fill {
          display: block; height: 100%; width: 100%;
          background: var(--story-accent, #8AABBD); transform-origin: left center;
        }
        .story-nav-bar-fill--done { transform: scaleX(1); }
        .story-nav-bar-fill--pending { transform: scaleX(0); }
        .story-nav-bar-fill--active-instant { transform: scaleX(1); }
        .story-nav-bar-fill--active-timed {
          animation: storyBarFill var(--story-duration, 4000ms) linear forwards;
        }
        .story-nav-bar-fill--paused { animation-play-state: paused; }
        @keyframes storyBarFill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .story-nav-tap {
          position: absolute; top: 0; bottom: 0; z-index: 20;
          width: 32%; background: transparent; border: none; padding: 0; cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .story-nav-tap--prev { left: 0; }
        .story-nav-tap--next { right: 0; width: 40%; }
        .story-nav-content { position: absolute; inset: 0; z-index: 10; }
      `}</style>

      <div className="story-nav-bars" style={{ ['--story-accent' as string]: accentColor }}>
        {Array.from({ length: count }).map((_, i) => {
          const timed = autoAdvanceMs != null && autoAdvanceMs > 0;
          let fillClass = 'story-nav-bar-fill--pending';
          if (i < index) fillClass = 'story-nav-bar-fill--done';
          else if (i === index) {
            fillClass = timed
              ? `story-nav-bar-fill--active-timed${paused ? ' story-nav-bar-fill--paused' : ''}`
              : 'story-nav-bar-fill--active-instant';
          }
          return (
            <div key={i} className="story-nav-bar">
              <span
                className={`story-nav-bar-fill ${fillClass}`}
                style={timed && i === index ? { ['--story-duration' as string]: `${autoAdvanceMs}ms` } : undefined}
              />
            </div>
          );
        })}
      </div>

      {!disableBack && (
        <button
          type="button"
          aria-label="Önceki"
          className="story-nav-tap story-nav-tap--prev"
          onClick={goPrev}
        />
      )}
      <button
        type="button"
        aria-label="Sonraki"
        className="story-nav-tap story-nav-tap--next"
        onClick={goNext}
      />

      <div className="story-nav-content">{children}</div>
    </div>
  );
}
