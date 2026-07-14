'use client';

import React from 'react';
import type { T } from './theme-context';
import { PRODUCTION_PROFILE_THRESHOLD } from '@/lib/brand-readiness';
import { resolveGalleryImageSrc } from '@/lib/gallery-display-url';
import { SA_CHROME, SA_STUDIO_ACCENTS } from './sa-chrome';

type BrandTab = 'identity' | 'content' | 'design' | 'gallery' | 'chatbot';

type NavStatus = 'done' | 'warn' | 'neutral';

export interface BrandHubNavItem {
  key: string;
  target: BrandTab;
  label: string;
  status: NavStatus;
  accent: string;
  /** 0–1 visual completion for the bottom accent bar (no status copy). */
  completion: number;
}

function SectionIcon({ name, color, size = 22 }: { name: string; color: string; size?: number }) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none' as const,
    stroke: color, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'identity':
      return (
        <svg {...common}>
          <path d="M5 9.5 6.4 4.5h11.2L19 9.5" />
          <path d="M4.6 9.5h14.8v0a2.4 2.4 0 0 1-4.8 0 2.4 2.4 0 0 1-4.8 0 2.4 2.4 0 0 1-4.8 0Z" />
          <path d="M6 11.4V19.5h12V11.4" />
          <path d="M10 19.5v-4.6h4v4.6" />
        </svg>
      );
    case 'content':
      return (
        <svg {...common}>
          <path d="M15.5 4.5 19.5 8.5 9 19l-4.5 1L5.5 15.5 15.5 4.5Z" />
          <path d="M13.6 6.4 17.6 10.4" />
          <path d="M4 21.5h9" />
        </svg>
      );
    case 'design':
      return (
        <svg {...common}>
          <path d="M12 3.2c-4.9 0-8.8 3.7-8.8 8.4 0 4.6 3.7 8 8.2 8 1.3 0 2.2-1 2.2-2.1 0-.6-.2-1-.6-1.4-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.9-1.8h1.4c2.6 0 4.6-2 4.6-4.6 0-3.2-3.5-5.6-8.4-5.6Z" />
          <circle cx="7.4" cy="11.8" r="1.05" fill={color} stroke="none" />
          <circle cx="9.8" cy="7.8" r="1.05" fill={color} stroke="none" />
          <circle cx="14.4" cy="7.6" r="1.05" fill={color} stroke="none" />
        </svg>
      );
    case 'gallery':
      return (
        <svg {...common}>
          <rect x="3.2" y="5.2" width="17.6" height="13.6" rx="2.8" />
          <circle cx="8.4" cy="10" r="1.6" />
          <path d="M4 16.5 8.8 11.9l3.6 3.4 3.1-2.4 4.5 4.1" />
        </svg>
      );
    case 'chatbot':
      return (
        <svg {...common}>
          <path d="M4.5 5.5h15v9.5h-9.5L5 19.5V5.5Z" />
          <circle cx="9.6" cy="10.2" r="1.05" fill={color} stroke="none" />
          <circle cx="14.4" cy="10.2" r="1.05" fill={color} stroke="none" />
        </svg>
      );
    case 'channels':
      return (
        <svg {...common}>
          <path d="M9.4 14.6 14.6 9.4" />
          <path d="M8.4 10 6.6 11.8a3.6 3.6 0 0 0 5.1 5.1l1.8-1.8" />
          <path d="M15.6 14 17.4 12.2a3.6 3.6 0 0 0-5.1-5.1L10.5 8.9" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

function ReadinessRing({ score, accent, track, size = 54 }: {
  score: number; accent: string; track: string; size?: number;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (clamped / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={track} strokeWidth={stroke}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={accent} strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

export function buildBrandHubNavItems(input: {
  constitutionConfirmedAt: string | null | undefined;
  pillarsCount: number;
  ctasCount: number;
  pprReady: boolean;
  pprScore: number;
  photoCount: number;
  hasChatbot: boolean;
  channelsConnected: boolean;
}): BrandHubNavItem[] {
  const contentDone = input.pillarsCount >= 2 && input.ctasCount >= 1;
  const galleryDone = input.photoCount >= 8;

  return [
    {
      key: 'identity',
      target: 'identity',
      label: 'Kimlik',
      accent: SA_STUDIO_ACCENTS.identity,
      status: input.constitutionConfirmedAt ? 'done' : 'warn',
      completion: input.constitutionConfirmedAt ? 1 : 0.42,
    },
    {
      key: 'content',
      target: 'content',
      label: 'İçerik',
      accent: SA_STUDIO_ACCENTS.content,
      status: contentDone ? 'done' : 'warn',
      completion: contentDone ? 1 : Math.min(0.85, (input.pillarsCount / 2) * 0.55 + (input.ctasCount > 0 ? 0.25 : 0)),
    },
    {
      key: 'design',
      target: 'design',
      label: 'Tasarım',
      accent: SA_STUDIO_ACCENTS.design,
      status: input.pprReady ? 'done' : 'warn',
      completion: Math.min(1, input.pprScore / PRODUCTION_PROFILE_THRESHOLD),
    },
    {
      key: 'gallery',
      target: 'gallery',
      label: 'Galeri',
      accent: SA_STUDIO_ACCENTS.gallery,
      status: galleryDone ? 'done' : 'warn',
      completion: Math.min(1, input.photoCount / 8),
    },
    {
      key: 'chatbot',
      target: 'chatbot',
      label: 'Chatbot',
      accent: SA_STUDIO_ACCENTS.chatbot,
      status: input.hasChatbot ? 'done' : 'neutral',
      completion: input.hasChatbot ? 1 : 0.18,
    },
    {
      key: 'channels',
      target: 'identity',
      label: 'Kanallar',
      accent: SA_STUDIO_ACCENTS.channels,
      status: input.channelsConnected ? 'done' : 'warn',
      completion: input.channelsConnected ? 1 : 0.38,
    },
  ];
}

export interface BrandHubDashboardProps {
  t: T;
  showStackBack: boolean;
  onBack: () => void;
  brandName: string;
  logoUrl?: string | null;
  monogram: string;
  brandPrimary: string;
  industryLabel?: string | null;
  locationLabel?: string | null;
  readinessScore: number;
  navItems: BrandHubNavItem[];
  constitutionConfirmedAt: string | null | undefined;
  confirmingConstitution: boolean;
  constitutionConfirmError: string | null;
  onConfirmConstitution: () => void;
  onOpenSection: (
    tab: BrandTab,
    opts?: { identityGroup?: 'channels' | null },
  ) => void;
  showPprBanner: boolean;
  pprScore: number;
  statusBanners: React.ReactNode;
}

export function BrandHubDashboard({
  t,
  showStackBack,
  onBack,
  brandName,
  logoUrl,
  monogram,
  brandPrimary,
  industryLabel,
  locationLabel,
  readinessScore,
  navItems,
  constitutionConfirmedAt,
  confirmingConstitution,
  constitutionConfirmError,
  onConfirmConstitution,
  onOpenSection,
  showPprBanner,
  pprScore,
  statusBanners,
}: BrandHubDashboardProps) {
  const readinessGood = readinessScore >= 80;
  const accentGlow = readinessGood ? 'rgba(138,171,189,0.45)' : 'rgba(245,158,11,0.4)';

  return (
    <div
      className="brand-hub-root"
      style={{ padding: `calc(env(safe-area-inset-top,0px) + ${showStackBack ? 10 : 16}px) 18px 0` }}
    >
      {showStackBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Geri"
          style={{
            width: 44, height: 44, borderRadius: 14, marginBottom: 14,
            border: `0.5px solid ${t.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
            color: t.textSecondary,
          }}
        >
          <svg width="9" height="15" viewBox="0 0 9 15" fill="none" aria-hidden>
            <path d="M7.5 1.5 1.5 7.5l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {/* Hero */}
      <div className="brand-hub-hero sa-chrome-card" style={{
        position: 'relative', marginBottom: 22, padding: '28px 20px 22px', borderRadius: 28, overflow: 'hidden',
        background: t.isDark
          ? 'radial-gradient(120% 90% at 50% -20%, rgba(138,171,189,0.12) 0%, rgba(7,9,15,0.98) 58%)'
          : 'radial-gradient(120% 90% at 50% -20%, rgba(255,255,255,0.98) 0%, rgba(244,246,250,0.98) 58%)',
      }}
      >
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `conic-gradient(from 210deg at 80% 0%, ${brandPrimary}22, transparent 42%, ${t.accent}14, transparent 78%)`,
        }} />

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <div style={{
              position: 'absolute', inset: -8, borderRadius: 36,
              background: `radial-gradient(circle, ${accentGlow} 0%, transparent 70%)`,
              filter: 'blur(8px)',
            }} />
            <div style={{
              width: 108, height: 108, borderRadius: 28, overflow: 'hidden', position: 'relative',
              background: logoUrl
                ? (t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.92)')
                : `linear-gradient(145deg, ${brandPrimary}, ${t.accent})`,
              border: `1px solid ${t.isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.06)'}`,
              boxShadow: t.isDark ? '0 16px 40px rgba(0,0,0,0.45)' : '0 14px 32px rgba(15,23,42,0.12)',
            }}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveGalleryImageSrc(logoUrl)}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 14 }}
                />
              ) : (
                <div style={{
                  width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 34, fontWeight: 800, color: '#fff', letterSpacing: '-0.05em',
                }}
                >
                  {monogram}
                </div>
              )}
            </div>
            <div style={{
              position: 'absolute', right: -6, bottom: -6,
              width: 58, height: 58, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: t.isDark ? 'rgba(12,14,18,0.92)' : 'rgba(255,255,255,0.94)',
              border: `0.5px solid ${t.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
              boxShadow: t.isDark ? '0 8px 24px rgba(0,0,0,0.35)' : '0 8px 20px rgba(15,23,42,0.1)',
            }}
            >
              <div style={{ position: 'relative', width: 54, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ReadinessRing
                  score={readinessScore}
                  accent={readinessGood ? SA_CHROME.steel300 : '#F59E0B'}
                  track={t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'}
                />
                <span style={{
                  position: 'absolute', fontSize: 15, fontWeight: 800, letterSpacing: '-0.04em',
                  color: t.textPrimary, fontVariantNumeric: 'tabular-nums',
                }}
                >
                  {readinessScore}
                </span>
              </div>
            </div>
          </div>

          <h1 style={{
            margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1.05,
            color: t.textPrimary, textAlign: 'center', maxWidth: '100%',
          }}
          >
            {brandName || 'Markanız'}
          </h1>

          {(industryLabel || locationLabel) && (
            <p style={{
              margin: '10px 0 0', fontSize: 13, fontWeight: 500, letterSpacing: '0.02em',
              color: t.textMuted, textAlign: 'center', lineHeight: 1.45,
            }}
            >
              {[industryLabel, locationLabel].filter(Boolean).join(' · ')}
            </p>
          )}

          {!constitutionConfirmedAt && (
            <button
              type="button"
              onClick={() => void onConfirmConstitution()}
              disabled={confirmingConstitution}
              style={{
                marginTop: 18, width: '100%', padding: '13px 18px', borderRadius: 16, border: 'none',
                cursor: confirmingConstitution ? 'wait' : 'pointer',
                fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', color: '#1a1200',
                background: 'linear-gradient(135deg, #F5D08A 0%, #E8B86D 48%, #D4A055 100%)',
                boxShadow: '0 12px 28px rgba(212,160,85,0.28), inset 0 1px 0 rgba(255,255,255,0.35)',
              }}
            >
              {confirmingConstitution ? 'Onaylanıyor…' : 'Marka anayasasını kilitle'}
            </button>
          )}
          {constitutionConfirmError && (
            <p style={{ marginTop: 10, fontSize: 12, color: t.danger, textAlign: 'center', lineHeight: 1.4 }}>
              {constitutionConfirmError}
            </p>
          )}
        </div>
      </div>

      {statusBanners}

      {showPprBanner && (
        <button
          type="button"
          onClick={() => onOpenSection('design')}
          className="brand-hub-alert"
          style={{
            width: '100%', textAlign: 'left', marginBottom: 18, padding: '16px 18px', borderRadius: 20,
            cursor: 'pointer', border: `0.5px solid ${t.isDark ? 'rgba(245,158,11,0.28)' : 'rgba(217,119,6,0.22)'}`,
            background: t.isDark ? 'rgba(245,158,11,0.07)' : 'rgba(255,251,235,0.85)',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.02em' }}>
            Tasarım profili tamamlanmalı
          </div>
          <div style={{
            marginTop: 8, height: 3, borderRadius: 999, overflow: 'hidden',
            background: t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          }}
          >
            <div style={{
              width: `${Math.min(100, (pprScore / PRODUCTION_PROFILE_THRESHOLD) * 100)}%`,
              height: '100%', borderRadius: 999,
              background: 'linear-gradient(90deg, #F59E0B, #FBBF24)',
            }} />
          </div>
        </button>
      )}

      <div style={{ margin: '4px 2px 14px' }}>
        <h2 className="sa-chrome-eyebrow" style={{ margin: 0 }}>
          Stüdyo
        </h2>
      </div>

      <div className="brand-hub-grid" style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 12,
      }}
      >
        {navItems.map((item) => {
          const barColor = item.status === 'done' ? item.accent : item.status === 'warn' ? '#F59E0B' : t.textMuted;
          return (
            <button
              key={item.key}
              type="button"
              className="brand-hub-tile sa-chrome-card"
              onClick={() => {
                if (item.key === 'channels') {
                  onOpenSection('identity', { identityGroup: 'channels' });
                } else {
                  onOpenSection(item.target);
                }
              }}
              style={{
                position: 'relative', minHeight: 118, padding: '16px 14px 14px', borderRadius: 20,
                cursor: 'pointer', textAlign: 'left', overflow: 'hidden',
              }}
            >
              <div style={{
                position: 'absolute', right: -18, top: -18, width: 72, height: 72, borderRadius: '50%',
                background: item.accent, opacity: t.isDark ? 0.12 : 0.08, filter: 'blur(2px)', pointerEvents: 'none',
              }} />
              <div style={{
                width: 42, height: 42, borderRadius: 14, marginBottom: 22,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: t.isDark ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.72)',
                border: `0.5px solid ${t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'}`,
              }}
              >
                <SectionIcon name={item.key} color={item.accent} size={21} />
              </div>
              <div style={{
                fontSize: 15, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.03em', lineHeight: 1.15,
              }}
              >
                {item.label}
              </div>
              <div style={{
                position: 'absolute', left: 14, right: 14, bottom: 12, height: 2.5, borderRadius: 999,
                background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)', overflow: 'hidden',
              }}
              >
                <div style={{
                  width: `${Math.max(8, item.completion * 100)}%`, height: '100%', borderRadius: 999,
                  background: barColor, opacity: item.status === 'neutral' ? 0.45 : 0.95,
                  boxShadow: item.status === 'done' ? `0 0 10px ${item.accent}55` : 'none',
                }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
