'use client';

import type React from 'react';
import { SmartAgencyLogo } from '@/components/brand/SmartAgencyLogo';
import { useTheme } from './theme-context';

/**
 * Branded splash / loading — minimal Apple-style logo breathe (no scan bar, no orbit).
 */
export function BrandLoadingScreen({
  fillViewport = true,
  compact = false,
  fillParent = false,
  showLabel = false,
  label,
}: {
  fillViewport?: boolean;
  compact?: boolean;
  fillParent?: boolean;
  showLabel?: boolean;
  label?: string;
}) {
  const { t } = useTheme();

  const shellStyle: React.CSSProperties = fillParent
    ? { flex: 1, width: '100%', minHeight: 0 }
    : fillViewport
      ? { minHeight: '100dvh', height: '100dvh', width: '100%' }
      : { minHeight: '55dvh', width: '100%' };

  return (
    <div
      style={{
        ...shellStyle,
        background: t.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: compact ? '32px 24px' : '0 24px',
      }}
    >
      <div className="brand-loader-breathe">
        <SmartAgencyLogo
          variant={compact ? 'mark' : 'full'}
          priority={!compact}
          framed={compact}
          className={`brand-loader-logo block h-auto${compact ? ' brand-loader-logo--sm' : ''}`}
        />
      </div>
      {showLabel && label ? (
        <span
          style={{
            fontSize: compact ? 12 : 13,
            fontWeight: 500,
            color: t.textMuted,
            letterSpacing: '-0.01em',
          }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}
