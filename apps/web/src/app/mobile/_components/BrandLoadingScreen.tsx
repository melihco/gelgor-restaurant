'use client';

import type React from 'react';
import { SmartAgencyLogo } from '@/components/brand/SmartAgencyLogo';
import { useTheme } from './theme-context';

/**
 * App open / route splash — clean logo entrance (scale up), no orbit chrome.
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
        position: 'relative',
        background: t.isDark
          ? 'radial-gradient(ellipse 90% 70% at 50% 42%, rgba(77,112,136,0.16) 0%, transparent 58%), #07090F'
          : 'radial-gradient(ellipse 90% 70% at 50% 42%, rgba(214,228,238,0.55) 0%, transparent 58%), #F4F6F8',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: compact ? 10 : 18,
        padding: compact ? '32px 24px' : '0 24px',
        overflow: 'hidden',
      }}
    >
      <div className="brand-loader-entrance">
        <SmartAgencyLogo
          variant={compact ? 'mark' : 'full'}
          priority={!compact}
          framed={compact}
          className={`brand-loader-logo block h-auto${compact ? ' brand-loader-logo--sm' : ''}`}
        />
      </div>
      {showLabel && label ? (
        <span
          className="sa-chrome-eyebrow"
          style={{
            fontSize: compact ? 10 : 11,
            opacity: 0.85,
            animation: 'splashLogoIn 900ms cubic-bezier(0.16,1,0.3,1) both',
            animationDelay: '180ms',
          }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}
