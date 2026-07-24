'use client';

/**
 * Editorial menu index — Marka hub + More menu.
 * Avoids generic AI list rows (icon box + progress bar + chevron).
 */
import React from 'react';
import type { T } from './theme-context';

function EndMark({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className="sa-menu-row__end">
      <path
        d="M5 3.2 9.2 7 5 10.8"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.45}
      />
    </svg>
  );
}

export function SaMenuIndex({ children }: { children: React.ReactNode }) {
  return (
    <div className="sa-menu-index sa-chrome-card">
      {children}
    </div>
  );
}

export function SaMenuRow({
  t,
  label,
  accent,
  icon,
  onClick,
  badge,
  badgeKind,
  danger,
  disabled,
}: {
  t: T;
  label: string;
  accent: string;
  icon: React.ReactNode;
  onClick: () => void;
  badge?: string | number;
  badgeKind?: 'warn' | 'count';
  danger?: boolean;
  disabled?: boolean;
}) {
  const hasBadge = badge !== undefined && badge !== '';
  const isWarn = hasBadge && (badgeKind ?? 'warn') === 'warn';
  const isCount = hasBadge && badgeKind === 'count';
  const labelColor = danger ? t.danger : t.textPrimary;
  const accentUse = danger ? t.danger : accent;

  return (
    <button
      type="button"
      className="sa-menu-row"
      data-danger={danger ? '1' : '0'}
      disabled={disabled}
      onClick={onClick}
      style={{
        ['--row-accent' as string]: accentUse,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <span className="sa-menu-row__rail" aria-hidden />
      <span
        className="sa-menu-row__glyph"
        style={{ color: accentUse }}
      >
        {icon}
        {isCount ? (
          <span className="sa-menu-row__count" aria-label={`${badge} bildirim`}>
            {badge}
          </span>
        ) : null}
      </span>
      <span className="sa-menu-row__body">
        <span className="sa-menu-row__label" style={{ color: labelColor }}>
          {label}
        </span>
        {isWarn ? (
          <span
            className="sa-menu-row__warn"
            style={{
              background: t.warningDim,
              color: t.warning,
            }}
          >
            {badge}
          </span>
        ) : null}
      </span>
      <EndMark color={danger ? t.danger : t.textTertiary} />
    </button>
  );
}
