'use client';

/**
 * Marka Profili — Studio + yayın dili.
 * Companion to BrandIdentityProfileCard: one atelier surface, not settings rows.
 */
import React from 'react';
import type { T } from './theme-context';
import { SA_CHROME, SA_STUDIO_ACCENTS } from './sa-chrome';

export type BrandAtelierTile = {
  key: string;
  label: string;
  meta: string;
  accent: string;
  icon: 'channels' | 'content' | 'design' | 'gallery';
  onClick: () => void;
  ready?: boolean;
};

function AtelierIcon({ name, color }: { name: BrandAtelierTile['icon']; color: string }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: color,
    strokeWidth: 1.65,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'channels':
      return (
        <svg {...common}>
          <path d="M9.4 14.6 14.6 9.4" />
          <path d="M8.4 10 6.6 11.8a3.6 3.6 0 0 0 5.1 5.1l1.8-1.8" />
          <path d="M15.6 14 17.4 12.2a3.6 3.6 0 0 0-5.1-5.1L10.5 8.9" />
        </svg>
      );
    case 'content':
      return (
        <svg {...common}>
          <path d="M15.5 4.5 19.5 8.5 9 19l-4.5 1L5.5 15.5 15.5 4.5Z" />
          <path d="M13.6 6.4 17.6 10.4" />
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
    default:
      return null;
  }
}

function LocaleMark({ code, active }: { code: 'tr' | 'en'; active: boolean }) {
  if (code === 'tr') {
    return (
      <span className="brand-atelier-locale__mark" data-active={active ? '1' : '0'} aria-hidden>
        TR
      </span>
    );
  }
  return (
    <span className="brand-atelier-locale__mark" data-active={active ? '1' : '0'} aria-hidden>
      EN
    </span>
  );
}

export function BrandIdentityAtelier({
  t,
  brandPrimary,
  tiles,
  contentLanguage,
  onLanguageChange,
}: {
  t: T;
  brandPrimary: string;
  tiles: BrandAtelierTile[];
  contentLanguage: 'tr' | 'en' | string;
  onLanguageChange: (lang: 'tr' | 'en') => void;
}) {
  const primary = brandPrimary || SA_CHROME.steel300;
  const lang = contentLanguage === 'en' ? 'en' : 'tr';

  return (
    <section
      className="brand-atelier sa-chrome-card"
      style={{
        ['--atelier-brand' as string]: primary,
        background: t.isDark
          ? `radial-gradient(90% 70% at 100% 0%, ${primary}18 0%, transparent 55%),
             linear-gradient(165deg, rgba(12,16,22,0.98) 0%, rgba(7,9,14,1) 100%)`
          : `radial-gradient(90% 70% at 100% 0%, ${primary}12 0%, transparent 55%),
             linear-gradient(165deg, rgba(255,255,255,0.98) 0%, rgba(244,247,250,0.98) 100%)`,
      }}
    >
      <div className="brand-atelier__veil" aria-hidden />

      {tiles.length > 0 && (
        <>
          <header className="brand-atelier__head">
            <div className="sa-chrome-eyebrow">Kanallar</div>
          </header>

          <div className="brand-atelier__grid" data-single={tiles.length === 1 ? '1' : '0'}>
            {tiles.map((tile) => (
              <button
                key={tile.key}
                type="button"
                className="brand-atelier-tile"
                onClick={tile.onClick}
                style={{
                  ['--tile-accent' as string]: tile.accent,
                  borderColor: t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                  background: t.isDark
                    ? 'linear-gradient(160deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.02) 100%)'
                    : 'linear-gradient(160deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.9) 100%)',
                }}
              >
                <span className="brand-atelier-tile__glow" aria-hidden />
                <span className="brand-atelier-tile__top">
                  <span
                    className="brand-atelier-tile__icon"
                    style={{
                      background: `linear-gradient(145deg, ${tile.accent}33, ${tile.accent}12)`,
                      borderColor: `${tile.accent}44`,
                      color: tile.accent,
                    }}
                  >
                    <AtelierIcon name={tile.icon} color={tile.accent} />
                  </span>
                  {typeof tile.ready === 'boolean' && (
                    <span
                      className="brand-atelier-tile__pulse"
                      style={{
                        background: tile.ready ? 'rgba(138,171,189,0.9)' : 'rgba(245,158,11,0.85)',
                        boxShadow: tile.ready
                          ? '0 0 0 3px rgba(138,171,189,0.18)'
                          : '0 0 0 3px rgba(245,158,11,0.15)',
                      }}
                      aria-hidden
                    />
                  )}
                </span>
                <span className="brand-atelier-tile__label" style={{ color: t.textPrimary }}>
                  {tile.label}
                </span>
                <span className="brand-atelier-tile__meta" style={{ color: t.textMuted }}>
                  {tile.meta}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <div
        className="brand-atelier__locale"
        style={{ borderColor: t.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.07)' }}
      >
        <div className="sa-chrome-eyebrow">Yayın dili</div>

        <div
          className="brand-atelier-locale"
          role="radiogroup"
          aria-label="İçerik dili"
          style={{
            background: t.isDark ? 'rgba(0,0,0,0.28)' : 'rgba(15,23,42,0.05)',
            borderColor: t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
          }}
        >
          {([
            { id: 'tr' as const, label: 'Türkçe', native: 'Türkçe' },
            { id: 'en' as const, label: 'English', native: 'English' },
          ]).map((opt) => {
            const active = lang === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                className="brand-atelier-locale__btn"
                data-active={active ? '1' : '0'}
                onClick={() => onLanguageChange(opt.id)}
                style={{
                  color: active ? t.textPrimary : t.textMuted,
                  background: active
                    ? (t.isDark
                      ? `linear-gradient(135deg, ${primary}40, rgba(255,255,255,0.08))`
                      : `linear-gradient(135deg, ${primary}22, #FFFFFF)`)
                    : 'transparent',
                  boxShadow: active
                    ? (t.isDark
                      ? `inset 0 0 0 1px ${primary}55, 0 6px 16px rgba(0,0,0,0.28)`
                      : `inset 0 0 0 1px ${primary}40, 0 4px 12px rgba(15,23,42,0.08)`)
                    : 'none',
                }}
              >
                <LocaleMark code={opt.id} active={active} />
                <span className="brand-atelier-locale__name">{opt.native}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Default studio accents for atelier tiles. */
export const BRAND_ATELIER_ACCENTS = {
  channels: SA_STUDIO_ACCENTS.channels,
  content: SA_STUDIO_ACCENTS.content,
  design: SA_STUDIO_ACCENTS.design,
  gallery: SA_STUDIO_ACCENTS.gallery,
} as const;
