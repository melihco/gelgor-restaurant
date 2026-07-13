'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getMobilePortalRoot } from './mobile-client-config';
import { useTheme } from './theme-context';
import { MobileStackHeader } from './ui-primitives';

export function ResponsiveAppSheet({
  onClose,
  title,
  subtitle,
  headerRight,
  children,
  tall = false,
  ariaLabel = 'Detay',
}: {
  onClose: () => void;
  title: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  /** Taller panel for mission/plan detail (still not full-screen). */
  tall?: boolean;
  ariaLabel?: string;
}) {
  const { t } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!mounted || typeof window === 'undefined') return null;

  const panelClass = tall
    ? 'sa-responsive-sheet-panel sa-responsive-sheet-panel--tall'
    : 'sa-responsive-sheet-panel';

  const sheet = (
    <div className="sa-responsive-sheet-root" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <button
        type="button"
        className="sa-responsive-sheet-backdrop"
        aria-label="Kapat"
        onClick={onClose}
      />
      <div
        className={panelClass}
        style={{
          background: t.isDark ? '#0D0D1A' : '#f2f2f7',
          border: t.isDark ? '0.5px solid rgba(255,255,255,0.06)' : '0.5px solid rgba(0,0,0,0.08)',
          color: t.textPrimary,
        }}
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
        <MobileStackHeader t={t} title={title} onBack={onClose} right={headerRight} sticky={false} />
        {subtitle && (
          <div
            style={{
              padding: '0 16px 10px',
              fontSize: 12,
              color: t.textTertiary,
              lineHeight: 1.45,
              borderBottom: `0.5px solid ${t.separator}`,
            }}
          >
            {subtitle}
          </div>
        )}
        <div className="sa-responsive-sheet-body">{children}</div>
      </div>
    </div>
  );

  return createPortal(sheet, getMobilePortalRoot());
}
