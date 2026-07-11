'use client';

import type { ReactNode } from 'react';
import { useMobileStore } from './mobile-store';
import { useTenantBrandContext } from './TenantBrandProvider';
import { IcoGrid } from './Icons';
import { resolveClientMediaUrl } from '@/lib/media-url';
import {
  brandNavbarBackground,
  useBrandThemePalette,
  type BrandThemePalette,
} from './use-brand-theme-palette';

const SLOT_W = 44;

function BrandNavLogo({
  logoUrl,
  brandName,
  palette,
  dark,
  size = 34,
}: {
  logoUrl?: string;
  brandName: string;
  palette: BrandThemePalette;
  dark: boolean;
  size?: number;
}) {
  const initial = brandName.trim()[0]?.toUpperCase() || 'M';
  const ring = `linear-gradient(135deg, ${palette.primary}, ${palette.accent} 55%, ${palette.secondary})`;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        padding: 2,
        background: ring,
        flexShrink: 0,
        boxShadow: `0 4px 18px ${palette.primary}44`,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          overflow: 'hidden',
          border: `2px solid ${dark ? '#000' : '#fff'}`,
          background: dark ? '#141418' : '#f4f4f8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            referrerPolicy="no-referrer"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{
            fontSize: size * 0.38,
            fontWeight: 800,
            color: palette.primary,
            lineHeight: 1,
          }}>
            {initial}
          </span>
        )}
      </div>
    </div>
  );
}

export function MobileNavMenuButton({
  onClick,
  dark,
  label = 'Menü',
}: {
  onClick: () => void;
  dark: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        width: SLOT_W,
        height: SLOT_W,
        borderRadius: 14,
        border: `0.5px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
        background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
      }}
    >
      <IcoGrid size={18} color={dark ? '#fff' : '#1a1a22'} strokeWidth={1.8} />
    </button>
  );
}

export function MobileBrandNavbar({
  dark = true,
  title,
  subtitle,
  showLogo = true,
  showBrandName = true,
  rightSlot,
  onMenu,
  className,
  style,
}: {
  dark?: boolean;
  title?: string;
  subtitle?: string;
  showLogo?: boolean;
  showBrandName?: boolean;
  rightSlot?: ReactNode;
  onMenu?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const navigate = useMobileStore((s) => s.navigate);
  const tenantBrand = useTenantBrandContext();
  const palette = useBrandThemePalette();

  const logoUrl = tenantBrand.logoUrl
    ? (resolveClientMediaUrl(tenantBrand.logoUrl) ?? tenantBrand.logoUrl)
    : undefined;
  const displayTitle = title ?? tenantBrand.brandName ?? 'Marka';
  const handle = tenantBrand.displayHandle
    ? `@${tenantBrand.displayHandle.replace(/^@/, '')}`
    : '';

  const textPrimary = dark ? '#fff' : '#111118';
  const textMuted = dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';

  return (
    <div
      className={className}
      style={{
        ...brandNavbarBackground(palette, { dark }),
        padding: 'calc(env(safe-area-inset-top, 0px) + 6px) 12px 10px',
        borderBottom: `0.5px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`,
        ...style,
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        minHeight: 44,
      }}>
        <MobileNavMenuButton
          onClick={onMenu ?? (() => navigate('more'))}
          dark={dark}
        />

        <div style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
        }}>
          {showLogo && (
            <BrandNavLogo
              logoUrl={logoUrl}
              brandName={displayTitle}
              palette={palette}
              dark={dark}
            />
          )}
          <div style={{ minWidth: 0, textAlign: showLogo ? 'left' : 'center' }}>
            <div style={{
              fontSize: showLogo ? 15 : 20,
              fontWeight: 800,
              color: textPrimary,
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {displayTitle}
            </div>
            {(subtitle || (showBrandName && handle)) && (
              <div style={{
                fontSize: 11,
                fontWeight: 600,
                color: textMuted,
                marginTop: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {subtitle ?? handle}
              </div>
            )}
          </div>
        </div>

        <div style={{
          minWidth: SLOT_W,
          minHeight: SLOT_W,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          flexShrink: 0,
        }}>
          {rightSlot}
        </div>
      </div>
    </div>
  );
}

/** Feed header actions — pending vs published toggle. */
export function FeedNavbarActions({
  showApproved,
  pendingCount,
  approvedCount,
  onShowPending,
  onShowPublished,
}: {
  showApproved: boolean;
  pendingCount: number;
  approvedCount: number;
  onShowPending: () => void;
  onShowPublished: () => void;
}) {
  const iconBtn = (active: boolean): React.CSSProperties => ({
    background: 'none',
    border: 'none',
    padding: 4,
    cursor: 'pointer',
    position: 'relative',
    opacity: active ? 1 : 0.55,
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <button type="button" aria-label="Onay bekleyen içerikler" onClick={onShowPending} style={iconBtn(!showApproved)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill={!showApproved ? '#fff' : 'none'}
          stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        {pendingCount > 0 && !showApproved && (
          <span style={{
            position: 'absolute', top: 2, right: 2, width: 7, height: 7, borderRadius: '50%',
            background: '#E1306C', border: '1.5px solid #000',
          }} />
        )}
      </button>
      <button
        type="button"
        aria-label="Yayındaki içerikler"
        onClick={onShowPublished}
        disabled={approvedCount === 0}
        style={{ ...iconBtn(showApproved), opacity: approvedCount === 0 ? 0.25 : showApproved ? 1 : 0.55 }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>
  );
}
