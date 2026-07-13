'use client';

import type { ReactNode } from 'react';
import { SmartAgencyLogo } from '@/components/brand/SmartAgencyLogo';
import { useMobileStore } from './mobile-store';
import { IcoGrid } from './Icons';
import {
  brandNavbarBackground,
  useBrandThemePalette,
} from './use-brand-theme-palette';

const SLOT_W = 44;

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
  showMenuButton = false,
  rightSlot,
  onMenu,
  className,
  style,
}: {
  dark?: boolean;
  title?: string;
  subtitle?: string;
  showLogo?: boolean;
  /** @deprecated Tenant adı artık üst barda gösterilmez — yalnızca Smart Agency logosu. */
  showBrandName?: boolean;
  /** Sol üst menü — varsayılan kapalı; Menü alt navbar'da. */
  showMenuButton?: boolean;
  rightSlot?: ReactNode;
  onMenu?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const navigate = useMobileStore((s) => s.navigate);
  const setTab = useMobileStore((s) => s.setTab);
  const palette = useBrandThemePalette();

  const textPrimary = dark ? '#fff' : '#111118';
  const textMuted = dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
  const hasCustomTitle = Boolean(title?.trim());

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
        {showMenuButton ? (
          <MobileNavMenuButton
            onClick={onMenu ?? (() => navigate('more'))}
            dark={dark}
          />
        ) : (
          <div style={{ width: SLOT_W, flexShrink: 0 }} aria-hidden />
        )}

        <div style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
        }}>
          {showLogo && !hasCustomTitle && (
            <button
              type="button"
              onClick={() => setTab('brand')}
              aria-label="Marka ayarları"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: 4,
                margin: 0,
                minHeight: 44,
              }}
            >
              <SmartAgencyLogo
                variant="full"
                priority
                className="h-8 max-w-[min(200px,58vw)]"
              />
            </button>
          )}
          {(hasCustomTitle || subtitle) && (
            <div style={{ minWidth: 0, textAlign: showLogo && !hasCustomTitle ? 'left' : 'center' }}>
              {hasCustomTitle && (
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
                  {title}
                </div>
              )}
              {subtitle && (
                <div style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: textMuted,
                  marginTop: hasCustomTitle ? 2 : 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {subtitle}
                </div>
              )}
            </div>
          )}
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
