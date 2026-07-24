'use client';

/**
 * CRM-style brand identity profile card for Marka Profili home.
 * Hero mark + name first; sector/location as editable meta — not a settings form.
 */
import React, { useState } from 'react';
import type { T } from './theme-context';
import type { BrandTonePreset } from '@/lib/sync-company-profile-from-python';
import { BrandLogoPreviewCard } from './BrandLogoPreviewCard';
import { BrandToneSigil } from './BrandToneSigil';
import { ReadinessRing } from './BrandHubDashboard';
import { resolveGalleryImageSrc } from '@/lib/gallery-display-url';
import { SA_CHROME } from './sa-chrome';

type EditField = 'brandName' | 'industry' | 'location' | null;

function Chevron({ color }: { color: string }) {
  return (
    <svg width="7" height="11" viewBox="0 0 9 15" fill="none" aria-hidden>
      <path
        d="M1.5 1.5 7.5 7.5l-6 6"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BrandIdentityProfileCard({
  t,
  brandName,
  industry,
  location,
  logoUrl,
  logoSource,
  monogram,
  brandPrimary,
  coverUrl,
  readinessScore,
  tonePreset,
  toneLabel,
  onSaveLogo,
  onSaveBrandName,
  onSaveIndustry,
  onSaveLocation,
}: {
  t: T;
  brandName: string;
  industry: string;
  location: string;
  logoUrl: string;
  logoSource: string;
  monogram: string;
  brandPrimary: string;
  coverUrl?: string | null;
  readinessScore?: number | null;
  tonePreset?: BrandTonePreset | string | null;
  toneLabel?: string | null;
  onSaveLogo: (url: string) => void;
  onSaveBrandName: (v: string) => void;
  onSaveIndustry: (v: string) => void;
  onSaveLocation: (v: string) => void;
}) {
  const [editing, setEditing] = useState<EditField>(null);
  const [draft, setDraft] = useState('');

  const primary = brandPrimary || t.accent;
  const coverSrc = coverUrl ? resolveGalleryImageSrc(coverUrl) : null;
  const score = typeof readinessScore === 'number' ? Math.max(0, Math.min(100, readinessScore)) : null;
  const showReadiness = score != null && score < 100;

  const startEdit = (field: Exclude<EditField, null>, value: string) => {
    setEditing(field);
    setDraft(value);
  };

  const commit = () => {
    if (!editing) return;
    const next = draft.trim();
    if (editing === 'brandName') onSaveBrandName(next);
    if (editing === 'industry') onSaveIndustry(next);
    if (editing === 'location') onSaveLocation(next);
    setEditing(null);
  };

  const editLabel =
    editing === 'brandName' ? 'Marka adı'
      : editing === 'industry' ? 'Sektör'
        : editing === 'location' ? 'Konum'
          : '';

  return (
    <section
      data-brand-form="service-profile"
      className="brand-identity-profile sa-chrome-card"
      style={{
        position: 'relative',
        borderRadius: 22,
        overflow: 'hidden',
        ['--bip-brand' as string]: primary,
        background: t.isDark
          ? 'linear-gradient(165deg, rgba(14,18,24,0.98) 0%, rgba(7,9,14,1) 100%)'
          : 'linear-gradient(165deg, rgba(255,255,255,0.98) 0%, rgba(244,247,250,0.98) 100%)',
      }}
    >
      {/* Cover / brand wash */}
      <div className="brand-identity-profile__cover" aria-hidden>
        {coverSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverSrc} alt="" className="brand-identity-profile__cover-img" />
        ) : null}
        <div
          className="brand-identity-profile__cover-wash"
          style={{
            background: coverSrc
              ? `linear-gradient(180deg, ${primary}55 0%, rgba(7,9,14,0.55) 55%, rgba(7,9,14,0.96) 100%)`
              : `radial-gradient(120% 90% at 20% 0%, ${primary}55 0%, transparent 55%),
                 linear-gradient(135deg, ${primary}33 0%, transparent 62%)`,
          }}
        />
        <div className="brand-identity-profile__cover-grid" />
      </div>

      <div className="brand-identity-profile__body">
        <div className="brand-identity-profile__top">
          <BrandLogoPreviewCard
            t={t}
            variant="mark"
            markSize={72}
            brandPrimary={primary}
            logoUrl={logoUrl}
            logoSource={logoSource}
            monogram={monogram}
            onSave={onSaveLogo}
          />

          <div className="brand-identity-profile__identity">
            <button
              type="button"
              className="brand-identity-profile__name"
              onClick={() => startEdit('brandName', brandName)}
              style={{ color: t.textPrimary }}
            >
              <span>{brandName.trim() || 'Marka adı ekle'}</span>
              <Chevron color={t.textMuted} />
            </button>

            <div className="brand-identity-profile__chips">
              <button
                type="button"
                className="brand-identity-profile__chip"
                onClick={() => startEdit('industry', industry)}
                style={{
                  color: t.textSecondary,
                  background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)',
                  borderColor: t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                }}
              >
                {industry.trim() || 'Sektör'}
              </button>
              <button
                type="button"
                className="brand-identity-profile__chip"
                onClick={() => startEdit('location', location)}
                style={{
                  color: t.textSecondary,
                  background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)',
                  borderColor: t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                }}
              >
                {location.trim() || 'Konum'}
              </button>
              {(tonePreset || toneLabel) ? (
                <BrandToneSigil
                  t={t}
                  tone={tonePreset || 'friendly'}
                  label={toneLabel}
                />
              ) : null}
              {showReadiness && (
                <span
                  className="brand-identity-profile__readiness"
                  aria-label={`Profil hazırlığı ${score}`}
                  style={{
                    borderColor: t.isDark ? 'rgba(245,158,11,0.35)' : 'rgba(217,119,6,0.28)',
                    background: t.isDark ? 'rgba(245,158,11,0.12)' : 'rgba(255,251,235,0.9)',
                    color: t.textPrimary,
                  }}
                >
                  <ReadinessRing
                    score={score!}
                    size={12}
                    accent={score! >= 80 ? SA_CHROME.steel300 : '#F59E0B'}
                    track={t.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.1)'}
                  />
                  {score}
                </span>
              )}
            </div>
          </div>
        </div>

        {editing && (
          <div
            className="brand-identity-profile__editor"
            style={{
              background: t.isDark ? 'rgba(0,0,0,0.28)' : 'rgba(15,23,42,0.04)',
              borderColor: t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.textMuted, marginBottom: 6 }}>
              {editLabel}
            </div>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              enterKeyHint="done"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit();
                }
                if (e.key === 'Escape') setEditing(null);
              }}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                minHeight: 44,
                padding: '10px 12px',
                borderRadius: 12,
                border: 'none',
                outline: 'none',
                fontSize: 16,
                color: t.textPrimary,
                background: t.isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={commit}
                style={{
                  flex: 1, minHeight: 44, borderRadius: 12, border: 'none', cursor: 'pointer',
                  fontSize: 14, fontWeight: 700, color: '#fff',
                  background: `linear-gradient(135deg, ${primary}, ${t.accent})`,
                }}
              >
                Kaydet
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                style={{
                  minHeight: 44, padding: '0 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  fontSize: 14, fontWeight: 600, color: t.textSecondary,
                  background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                }}
              >
                İptal
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
