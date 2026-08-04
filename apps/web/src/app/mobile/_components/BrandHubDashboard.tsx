'use client';

import React from 'react';
import type { T } from './theme-context';
import { PRODUCTION_PROFILE_THRESHOLD } from '@/lib/brand-readiness';
import { resolveGalleryImageSrc } from '@/lib/gallery-display-url';
import { SA_CHROME, SA_STUDIO_ACCENTS } from './sa-chrome';
import { MobileBrandNavbar } from './MobileBrandNavbar';
import { BrandVisionerNavRow } from './BrandVisionerNavRow';
import { SaMenuIndex } from './SaMenuIndex';

type BrandTab = 'identity' | 'content' | 'design' | 'gallery' | 'strategy' | 'chatbot';

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
    case 'strategy':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="5.5" height="16" rx="1.4" />
          <rect x="11.2" y="8" width="5.5" height="12" rx="1.4" />
          <rect x="18.4" y="6" width="1.6" height="14" rx="0.8" />
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

function BrandHubTile({
  item,
  t,
  onOpen,
}: {
  item: BrandHubNavItem;
  t: T;
  onOpen: (tab: BrandTab) => void;
}) {
  return (
    <BrandVisionerNavRow
      t={t}
      label={item.label}
      accent={item.accent}
      icon={<SectionIcon name={item.key} color={item.accent} size={18} />}
      onClick={() => onOpen(item.target)}
    />
  );
}

export function ReadinessRing({ score, accent, track, size = 54 }: {
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

/** Production brand modules only — never include chatbot (messaging path). */
export function buildBrandHubNavItems(input: {
  constitutionConfirmedAt: string | null | undefined;
  pillarsCount: number;
  ctasCount: number;
  pprReady: boolean;
  pprScore: number;
  photoCount: number;
  /** @deprecated Ignored — chatbot is not a production module. Kept for call-site compat. */
  hasChatbot?: boolean;
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
      label: 'İçerik DNA',
      accent: SA_STUDIO_ACCENTS.content,
      status: contentDone ? 'done' : 'warn',
      completion: contentDone ? 1 : Math.min(0.85, (input.pillarsCount / 2) * 0.55 + (input.ctasCount > 0 ? 0.25 : 0)),
    },
    {
      key: 'design',
      target: 'design',
      label: 'Görünüm',
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
  ];
}

/** Ideation strategy — campaign / competitors / special days (not production engines). */
export function buildBrandHubStrategyNavItem(input: {
  goalsFilled: boolean;
  competitorCount: number;
}): BrandHubNavItem {
  const filled = input.goalsFilled || input.competitorCount > 0;
  return {
    key: 'strategy',
    target: 'strategy',
    label: 'Strateji',
    accent: SA_STUDIO_ACCENTS.strategy,
    status: filled ? 'done' : 'neutral',
    completion: filled ? 1 : 0.22,
  };
}

/** Messaging / Mertcafe assistant — separate from feed & design production. */
export function buildBrandHubAssistantNavItem(hasChatbot: boolean): BrandHubNavItem {
  return {
    key: 'chatbot',
    target: 'chatbot',
    label: 'Müşteri Asistanı',
    accent: SA_STUDIO_ACCENTS.chatbot,
    status: hasChatbot ? 'done' : 'neutral',
    completion: hasChatbot ? 1 : 0.18,
  };
}

export interface BrandHubDashboardProps {
  t: T;
  showStackBack: boolean;
  onBack: () => void;
  brandName: string;
  logoUrl?: string | null;
  monogram: string;
  brandPrimary: string;
  /** Corporate secondary — drives hero aurora / rule with primary. */
  brandAccent?: string | null;
  industryLabel?: string | null;
  locationLabel?: string | null;
  /** Feed / design production modules (Kimlik → Galeri). */
  navItems: BrandHubNavItem[];
  /** Campaign / competitors / special days — outside production modules. */
  strategyItem?: BrandHubNavItem | null;
  /** Optional messaging assistant row — rendered outside production modules. */
  assistantItem?: BrandHubNavItem | null;
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
  brandAccent,
  industryLabel,
  locationLabel,
  navItems,
  strategyItem = null,
  assistantItem = null,
  constitutionConfirmedAt,
  confirmingConstitution,
  constitutionConfirmError,
  onConfirmConstitution,
  onOpenSection,
  showPprBanner,
  pprScore,
  statusBanners,
}: BrandHubDashboardProps) {
  // Production modules only — Kimlik / İçerik DNA / Görünüm / Galeri.
  const hubItems = navItems;

  return (
    <div
      className="brand-hub-root"
      style={{
        /* Tab-root Marka: no SA logo bar — brand hero is the identity. */
        paddingTop: showStackBack
          ? 0
          : 'calc(env(safe-area-inset-top, 0px) + 8px)',
      }}
    >
      {showStackBack ? (
        <MobileBrandNavbar
          dark={t.isDark}
          logoCentered
          title="Marka"
          style={{
            background: t.bg,
            borderBottom: `0.5px solid ${t.separator}`,
          }}
          leftSlot={(
            <button
              type="button"
              onClick={onBack}
              aria-label="Geri"
              style={{
                width: 44, height: 44, borderRadius: 14,
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
        />
      ) : null}

      <div style={{ padding: '14px 18px 0' }}>
      {/* Hero — brand mark first; readiness only when incomplete + labeled */}
      <div
        className="brand-hub-hero sa-chrome-card"
        style={{
          position: 'relative',
          marginBottom: 22,
          padding: '20px 18px 16px',
          borderRadius: 26,
          overflow: 'hidden',
          ['--hub-brand' as string]: brandPrimary || SA_CHROME.steel300,
          ['--hub-accent' as string]: brandAccent || brandPrimary || SA_CHROME.steel500,
          background: t.isDark
            ? `radial-gradient(120% 90% at 50% -8%, ${brandPrimary}55 0%, transparent 52%),
               radial-gradient(90% 70% at 85% 110%, ${brandAccent || brandPrimary}40 0%, transparent 55%),
               radial-gradient(70% 55% at 12% 95%, ${brandPrimary}22 0%, transparent 50%),
               linear-gradient(165deg, rgba(12,16,22,0.98) 0%, rgba(5,7,12,1) 100%)`
            : `radial-gradient(120% 90% at 50% -8%, ${brandPrimary}32 0%, transparent 52%),
               radial-gradient(90% 70% at 85% 110%, ${brandAccent || brandPrimary}28 0%, transparent 55%),
               radial-gradient(70% 55% at 12% 95%, ${brandPrimary}14 0%, transparent 50%),
               linear-gradient(165deg, rgba(255,255,255,0.98) 0%, rgba(244,246,250,0.98) 100%)`,
          boxShadow: t.isDark
            ? `0 0 0 0.5px color-mix(in srgb, ${brandPrimary} 35%, transparent),
               0 24px 48px rgba(0, 0, 0, 0.38),
               0 0 40px color-mix(in srgb, ${brandPrimary} 18%, transparent),
               inset 0 1px 0 rgba(255, 255, 255, 0.08)`
            : `0 0 0 0.5px color-mix(in srgb, ${brandAccent || brandPrimary} 22%, transparent),
               0 18px 36px rgba(15, 23, 42, 0.1),
               0 0 28px color-mix(in srgb, ${brandPrimary} 12%, transparent),
               inset 0 1px 0 rgba(255, 255, 255, 0.85)`,
        }}
      >
        <div className="brand-hub-hero-aurora" aria-hidden />
        <div className="brand-hub-hero-aurora-2" aria-hidden />
        <div className="brand-hub-hero-grid" aria-hidden />

        <div
          className="brand-hub-hero-inner"
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            width: '100%',
            paddingTop: 2,
            paddingInline: 8,
            gap: 10,
          }}
        >
          <div
            className="brand-hub-hero-mark"
            style={{ position: 'relative', flexShrink: 0 }}
          >
            <div className="brand-hub-hero-glow" aria-hidden />
            <div className="brand-hub-hero-glow brand-hub-hero-glow-accent" aria-hidden />
            <div style={{
              width: 112,
              height: 112,
              borderRadius: 28,
              overflow: 'hidden',
              position: 'relative',
              background: logoUrl
                ? 'transparent'
                : `linear-gradient(145deg, ${brandPrimary}, ${brandAccent || brandPrimary})`,
              border: 'none',
              boxShadow: 'none',
            }}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveGalleryImageSrc(logoUrl)}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }}
                />
              ) : (
                <div style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 34,
                  fontWeight: 800,
                  color: '#fff',
                  letterSpacing: '-0.05em',
                }}
                >
                  {monogram}
                </div>
              )}
            </div>
          </div>

          {!logoUrl && (
            <h1
              className="brand-hub-hero-title"
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '-0.035em',
                lineHeight: 1.15,
                color: t.textPrimary,
                textAlign: 'center',
                maxWidth: '100%',
              }}
            >
              {brandName || 'Markanız'}
            </h1>
          )}

          {(industryLabel || locationLabel) && (
            <p
              className="brand-hub-hero-meta"
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.14em',
                color: t.textMuted,
                textAlign: 'center',
                lineHeight: 1.4,
                textTransform: 'uppercase' as const,
                maxWidth: '100%',
              }}
            >
              {[industryLabel, locationLabel].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        <div className="brand-hub-hero-rule" aria-hidden style={{ marginTop: 16 }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {!constitutionConfirmedAt && (
            <button
              type="button"
              onClick={() => void onConfirmConstitution()}
              disabled={confirmingConstitution}
              style={{
                marginTop: 14, width: '100%', padding: '13px 18px', borderRadius: 16, border: 'none',
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
            Görünüm profili tamamlanmalı
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

      <div className="sa-chrome-eyebrow" style={{ marginBottom: 10 }}>
        Üretim
      </div>
      <SaMenuIndex>
        {hubItems.map((item) => (
          <div key={item.key} className="sa-menu-index__slot">
            <BrandHubTile
              item={item}
              t={t}
              onOpen={(tab) => onOpenSection(tab)}
            />
          </div>
        ))}
      </SaMenuIndex>

      {strategyItem ? (
        <div style={{ marginTop: 22 }}>
          <div className="sa-chrome-eyebrow" style={{ marginBottom: 10 }}>
            Strateji
          </div>
          <SaMenuIndex>
            <div className="sa-menu-index__slot">
              <BrandHubTile
                item={strategyItem}
                t={t}
                onOpen={(tab) => onOpenSection(tab)}
              />
            </div>
          </SaMenuIndex>
        </div>
      ) : null}

      {assistantItem ? (
        <div style={{ marginTop: 22 }}>
          <div className="sa-chrome-eyebrow" style={{ marginBottom: 10 }}>
            Müşteri kanalları
          </div>
          <SaMenuIndex>
            <div className="sa-menu-index__slot">
              <BrandHubTile
                item={assistantItem}
                t={t}
                onOpen={(tab) => onOpenSection(tab)}
              />
            </div>
          </SaMenuIndex>
        </div>
      ) : null}
      </div>
    </div>
  );
}
