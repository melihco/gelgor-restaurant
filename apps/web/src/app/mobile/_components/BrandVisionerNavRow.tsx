'use client';

/**
 * Shared visioner list row — same compact chrome as Marka hub tiles.
 * Used on hub + all BrandConstitution section indexes.
 */
import React from 'react';
import type { T } from './theme-context';

export function BrandVisionerNavRow({
  t,
  label,
  accent,
  completion,
  icon,
  onClick,
}: {
  t: T;
  label: string;
  /** @deprecated unused — row hints removed for density */
  hint?: string;
  accent: string;
  /** 0–1 progress bar; omit for title-only rows */
  completion?: number;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  const showBar = typeof completion === 'number';
  const barColor = completion != null && completion >= 0.95
    ? accent
    : completion != null && completion >= 0.4
      ? '#F59E0B'
      : t.textMuted;

  return (
    <button
      type="button"
      className="brand-hub-tile"
      onClick={onClick}
      style={{
        position: 'relative',
        width: '100%',
        cursor: 'pointer',
        textAlign: 'left',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        border: 'none',
        background: 'transparent',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -16,
          left: -16,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: accent,
          opacity: t.isDark ? 0.14 : 0.09,
          filter: 'blur(12px)',
          pointerEvents: 'none',
        }}
      />
      <div
        className="brand-hub-tile__icon"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(135deg, ${accent}2e, ${accent}14)`,
          border: `0.5px solid ${accent}3d`,
        }}
      >
        {icon}
      </div>
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <div className="brand-hub-tile__label" style={{ color: t.textPrimary }}>
          {label}
        </div>
        {showBar ? (
          <div
            className="brand-hub-tile__bar"
            style={{
              borderRadius: 999,
              overflow: 'hidden',
              background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
            }}
          >
            <div style={{
              width: `${Math.max(8, (completion ?? 0) * 100)}%`,
              height: '100%',
              borderRadius: 999,
              background: barColor,
              opacity: 0.95,
            }}
            />
          </div>
        ) : null}
      </div>
      <svg width="8" height="13" viewBox="0 0 9 15" fill="none" aria-hidden style={{ flexShrink: 0, opacity: 0.55 }}>
        <path
          d="M1.5 1.5 7.5 7.5l-6 6"
          stroke={t.textTertiary}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export function BrandVisionerList({ children }: { children: React.ReactNode }) {
  return (
    <div className="brand-hub-list" style={{ width: '100%', margin: 0 }}>
      {children}
    </div>
  );
}

export function BrandVisionerGroup({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="brand-hub-group sa-chrome-card"
      style={{ width: '100%', overflow: 'hidden' }}
    >
      {children}
    </div>
  );
}
