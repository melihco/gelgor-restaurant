'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getMobilePortalRoot } from './mobile-client-config';
import { useTheme } from './theme-context';
import { MobileStackHeader } from './ui-primitives';

const SWIPE_DISMISS_THRESHOLD = 96;
const MAX_SWIPE_DRAG = 180;

export function ResponsiveAppSheet({
  onClose,
  title,
  subtitle,
  headerRight,
  children,
  tall = false,
  fullScreen = false,
  closeButton = 'back',
  ariaLabel = 'Detay',
}: {
  onClose: () => void;
  title: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  /** Taller panel for mission/plan detail (still not full-screen). */
  tall?: boolean;
  /** Edge-to-edge sheet — mission detail, swipe down to dismiss. */
  fullScreen?: boolean;
  closeButton?: 'back' | 'x-right';
  ariaLabel?: string;
}) {
  const { t } = useTheme();
  const [mounted, setMounted] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const draggingRef = useRef(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const resetDrag = useCallback(() => {
    draggingRef.current = false;
    setIsDragging(false);
    setDragOffset(0);
  }, []);

  const onTouchStart = useCallback((event: React.TouchEvent) => {
    if (!fullScreen) return;
    const body = bodyRef.current;
    if (!body || body.scrollTop > 1) return;
    dragStartY.current = event.touches[0]?.clientY ?? 0;
    draggingRef.current = true;
    setIsDragging(true);
  }, [fullScreen]);

  const onTouchMove = useCallback((event: React.TouchEvent) => {
    if (!draggingRef.current || !fullScreen) return;
    const body = bodyRef.current;
    if (!body || body.scrollTop > 1) {
      resetDrag();
      return;
    }
    const delta = (event.touches[0]?.clientY ?? 0) - dragStartY.current;
    if (delta <= 0) {
      setDragOffset(0);
      return;
    }
    event.preventDefault();
    setDragOffset(Math.min(MAX_SWIPE_DRAG, delta));
  }, [fullScreen, resetDrag]);

  const onTouchEnd = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    if (dragOffset >= SWIPE_DISMISS_THRESHOLD) {
      onClose();
      setDragOffset(0);
      return;
    }
    setDragOffset(0);
  }, [dragOffset, onClose]);

  if (!mounted || typeof window === 'undefined') return null;

  const panelClass = fullScreen
    ? 'sa-responsive-sheet-panel sa-responsive-sheet-panel--fullscreen'
    : tall
      ? 'sa-responsive-sheet-panel sa-responsive-sheet-panel--tall'
      : 'sa-responsive-sheet-panel';

  const rootClass = fullScreen
    ? 'sa-responsive-sheet-root sa-responsive-sheet-root--fullscreen'
    : 'sa-responsive-sheet-root';

  const surfaceBg = t.isDark ? '#0D0D1A' : '#f2f2f7';
  const headerBg = t.isDark ? 'rgba(13,13,26,0.88)' : 'rgba(242,242,247,0.92)';

  const sheet = (
    <div className={rootClass} role="dialog" aria-modal="true" aria-label={ariaLabel}>
      {!fullScreen && (
        <button
          type="button"
          className="sa-responsive-sheet-backdrop"
          aria-label="Kapat"
          onClick={onClose}
        />
      )}
      <div
        className={panelClass}
        style={{
          background: surfaceBg,
          border: fullScreen
            ? 'none'
            : (t.isDark ? '0.5px solid rgba(255,255,255,0.06)' : '0.5px solid rgba(0,0,0,0.08)'),
          color: t.textPrimary,
          transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 220ms ease',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="sa-responsive-sheet-handle" aria-hidden>
          <span
            style={{
              display: 'block',
              width: 36,
              height: 4,
              borderRadius: 2,
              background: t.isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)',
            }}
          />
        </div>
        <MobileStackHeader
          t={t}
          title={title}
          onBack={onClose}
          right={headerRight}
          sticky={false}
          closeButton={fullScreen ? (closeButton === 'x-right' ? 'x-right' : closeButton) : 'back'}
          headerBackground={headerBg}
        />
        {subtitle && (
          <div
            style={{
              padding: '0 16px 10px',
              fontSize: 12,
              color: t.textTertiary,
              lineHeight: 1.45,
              borderBottom: `0.5px solid ${t.separator}`,
              background: surfaceBg,
            }}
          >
            {subtitle}
          </div>
        )}
        <div ref={bodyRef} className="sa-responsive-sheet-body">{children}</div>
      </div>
    </div>
  );

  return createPortal(sheet, getMobilePortalRoot());
}
