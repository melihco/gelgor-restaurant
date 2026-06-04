'use client';

import { SmartAgencyLogo } from '@/components/brand/SmartAgencyLogo';

/**
 * Minimal brand loader — flat black, logo only, no card/glow layers.
 */
export function BrandLoadingScreen({
  label = 'Yükleniyor',
  fillViewport = true,
}: {
  label?: string;
  /** false when embedded in a scroll region (e.g. feed) */
  fillViewport?: boolean;
}) {
  return (
    <div
      style={{
        ...(fillViewport ? { minHeight: '100dvh', height: '100dvh' } : { minHeight: '55dvh' }),
        width: '100%',
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: '0 32px',
      }}
    >
      <div className="splash-logo-minimal" style={{ lineHeight: 0 }}>
        <SmartAgencyLogo
          variant="full"
          priority
          className="block h-auto w-[min(220px,72vw)] max-w-[220px]"
        />
      </div>
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: 'rgba(255,255,255,0.28)',
          letterSpacing: '0.01em',
        }}
      >
        {label}
      </span>
    </div>
  );
}
