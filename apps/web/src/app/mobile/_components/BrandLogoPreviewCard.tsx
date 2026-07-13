'use client';

import React, { useState } from 'react';
import { ResponsiveAppSheet } from './responsive-app-sheet';
import type { T } from './theme-context';
import { resolveGalleryImageSrc } from '@/lib/gallery-display-url';

export function BrandLogoPreviewCard({
  t,
  logoUrl,
  logoSource,
  monogram,
  onSave,
}: {
  t: T;
  logoUrl: string;
  logoSource: string;
  monogram: string;
  onSave: (url: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(logoSource);

  const openEdit = () => {
    setDraft(logoSource);
    setEditing(true);
  };

  const handleSave = () => {
    onSave(draft.trim());
    setEditing(false);
  };

  const displaySrc = logoUrl ? resolveGalleryImageSrc(logoUrl) : null;

  return (
    <>
      <div
        data-brand-fix="brand-logo"
        style={{
          marginBottom: 16,
          borderRadius: 18,
          padding: '22px 20px 20px',
          ...t.surfaceGroup,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 20,
              overflow: 'hidden',
              background: t.isDark ? '#121220' : '#F0F0F6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `0.5px solid ${t.separator}`,
              flexShrink: 0,
            }}
          >
            {displaySrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={displaySrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <span style={{ fontSize: 28, fontWeight: 700, color: t.textMuted, letterSpacing: '-0.02em' }}>
                {monogram}
              </span>
            )}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.02em' }}>Logo</div>
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4, lineHeight: 1.45 }}>
              {logoUrl ? 'Marka logosu yüklü' : 'Henüz logo eklenmedi'}
            </div>
          </div>
          <button
            type="button"
            onClick={openEdit}
            style={{
              minHeight: 44,
              padding: '0 20px',
              borderRadius: 12,
              border: `0.5px solid ${t.separator}`,
              background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              color: t.textPrimary,
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Düzenle
          </button>
        </div>
      </div>

      {editing && (
        <ResponsiveAppSheet
          onClose={() => setEditing(false)}
          title="Logo URL"
          subtitle="PNG veya SVG tercih edilir"
          ariaLabel="Logo URL düzenle"
        >
          <div style={{ padding: '16px 16px calc(16px + env(safe-area-inset-bottom))' }}>
            <label htmlFor="brand-logo-url" style={{ display: 'block', fontSize: 13, fontWeight: 500, color: t.textTertiary, marginBottom: 8 }}>
              Logo adresi
            </label>
            <input
              id="brand-logo-url"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="https://..."
              inputMode="url"
              autoComplete="url"
              enterKeyHint="done"
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 12,
                outline: 'none',
                boxSizing: 'border-box',
                fontSize: 16,
                background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
                border: `0.5px solid ${t.separator}`,
                color: t.textPrimary,
              }}
              autoFocus
            />
            <button
              type="button"
              onClick={handleSave}
              style={{
                width: '100%',
                marginTop: 14,
                minHeight: 48,
                padding: '0 16px',
                borderRadius: 12,
                border: 'none',
                cursor: 'pointer',
                background: t.accent,
                color: '#fff',
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              Kaydet
            </button>
          </div>
        </ResponsiveAppSheet>
      )}
    </>
  );
}
