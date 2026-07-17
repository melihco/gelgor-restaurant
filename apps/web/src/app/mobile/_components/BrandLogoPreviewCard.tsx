'use client';

import React, { useRef, useState } from 'react';
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
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(logoSource);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUrlField, setShowUrlField] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const displaySrc = logoUrl ? resolveGalleryImageSrc(logoUrl) : null;
  const hasLogo = Boolean(displaySrc);

  const openSheet = () => {
    setDraft(logoSource);
    setUploadError(null);
    setShowUrlField(false);
    setOpen(true);
  };

  const handleSaveUrl = () => {
    onSave(draft.trim());
    setOpen(false);
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Dosya okunamadı'));
        reader.readAsDataURL(file);
      });
      if (!dataUrl) throw new Error('Dosya okunamadı');

      const uploadRes = await fetch('/api/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, mimeType: file.type || 'image/png' }),
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || 'Yükleme başarısız');
      }
      const { imageUrl } = await uploadRes.json() as { imageUrl?: string };
      if (!imageUrl) throw new Error('Yükleme yanıtı boş');
      onSave(imageUrl);
      setDraft(imageUrl);
      setOpen(false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Yükleme başarısız');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          data-brand-fix="brand-logo"
          onClick={openSheet}
          className="brand-hub-gap-cta"
          style={{
            width: '100%',
            padding: '16px 18px',
            borderRadius: 20,
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            background: t.isDark
              ? 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.03) 100%)'
              : 'linear-gradient(135deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.02) 100%)',
            boxShadow: t.isDark
              ? 'inset 0 1px 0 rgba(255,255,255,0.06)'
              : 'inset 0 1px 0 rgba(255,255,255,0.65)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                flexShrink: 0,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.65)',
                border: `0.5px solid ${t.separator}`,
              }}
            >
              {displaySrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={displaySrc}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : (
                <span style={{ fontSize: 14, fontWeight: 700, color: t.textMuted }}>
                  {monogram.slice(0, 2).toUpperCase() || 'LG'}
                </span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.03em' }}>
                Logo
              </div>
              <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 3, letterSpacing: '-0.01em' }}>
                {hasLogo ? 'Önizle veya değiştir' : 'Yükle veya URL ekle'}
              </div>
            </div>
            <svg width="8" height="13" viewBox="0 0 9 15" fill="none" aria-hidden>
              <path
                d="M1.5 1.5 7.5 7.5l-6 6"
                stroke={t.textTertiary}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </button>
      </div>

      {open && (
        <ResponsiveAppSheet
          onClose={() => !uploading && setOpen(false)}
          title="Logo"
          subtitle={hasLogo ? 'Önizleme ve değiştirme' : 'Marka logosu ekle'}
          ariaLabel="Logo düzenle"
        >
          <div style={{ padding: '16px 16px calc(16px + env(safe-area-inset-bottom))' }}>
            <div
              style={{
                width: '100%',
                aspectRatio: '1.6',
                maxHeight: 200,
                borderRadius: 16,
                overflow: 'hidden',
                background: t.isDark ? '#121220' : '#F0F0F6',
                border: `0.5px solid ${t.separator}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              {displaySrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={displaySrc}
                  alt="Logo önizleme"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 20 }}
                />
              ) : (
                <div style={{ textAlign: 'center', padding: 20 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: t.textMuted, marginBottom: 8 }}>
                    {monogram.slice(0, 2).toUpperCase() || 'LG'}
                  </div>
                  <div style={{ fontSize: 13, color: t.textTertiary }}>Henüz logo yok</div>
                </div>
              )}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              style={{ display: 'none' }}
              onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
            />

            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              style={{
                width: '100%',
                minHeight: 48,
                padding: '0 16px',
                borderRadius: 12,
                border: 'none',
                cursor: uploading ? 'wait' : 'pointer',
                background: t.accent,
                color: '#fff',
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              {uploading ? 'Yükleniyor…' : hasLogo ? 'Değiştir — dosya yükle' : 'Dosya yükle'}
            </button>

            <button
              type="button"
              disabled={uploading}
              onClick={() => setShowUrlField((v) => !v)}
              style={{
                width: '100%',
                marginTop: 10,
                minHeight: 44,
                padding: '0 16px',
                borderRadius: 12,
                border: `0.5px solid ${t.separator}`,
                cursor: 'pointer',
                background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                color: t.textPrimary,
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              {showUrlField ? 'URL alanını gizle' : 'URL ile ekle'}
            </button>

            {showUrlField && (
              <div style={{ marginTop: 14 }}>
                <label
                  htmlFor="brand-logo-url"
                  style={{ display: 'block', fontSize: 13, fontWeight: 500, color: t.textTertiary, marginBottom: 8 }}
                >
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
                  disabled={uploading}
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
                />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={handleSaveUrl}
                  style={{
                    width: '100%',
                    marginTop: 12,
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
                  URL’yi kaydet
                </button>
              </div>
            )}

            {uploadError && (
              <div
                style={{
                  marginTop: 12,
                  padding: '12px 14px',
                  borderRadius: 12,
                  fontSize: 13,
                  color: t.danger,
                  background: t.dangerDim,
                }}
              >
                {uploadError}
              </div>
            )}
          </div>
        </ResponsiveAppSheet>
      )}
    </>
  );
}
