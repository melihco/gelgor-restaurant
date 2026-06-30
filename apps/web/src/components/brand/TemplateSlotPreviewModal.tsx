'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import type { BrandTemplateLibrary, BrandTemplateLibrarySlot } from '@/lib/brand-template-library';
import { slotTypographyPreviewLabel } from '@/lib/brand-template-slot-typography';
import { prepareGalleryDisplayUrls } from '@/lib/gallery-display-url';
import { resolveBrandProductionTokens } from '@/lib/brand-production-tokens';
import { TemplateColorBehaviorPreview } from '@/components/brand/TemplateColorBehaviorPreview';

function parseGalleryUrls(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter((u) => u.startsWith('http'));
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed.map(String).filter((u) => u.startsWith('http')) : [];
      } catch {
        return [];
      }
    }
    return trimmed.split(/[,\n;]+/).map((s) => s.trim()).filter((u) => u.startsWith('http'));
  }
  return [];
}

function slotTemplateId(slot: BrandTemplateLibrarySlot): string {
  return slot.format === 'post' ? (slot.posterTemplateId ?? '') : (slot.storyTemplateId ?? '');
}

export function TemplateSlotPreviewModal({
  open,
  onClose,
  workspaceId,
  kitId,
  slot,
  previewLibrary,
  isMobile,
  theme,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  kitId: string;
  slot: BrandTemplateLibrarySlot;
  previewLibrary: BrandTemplateLibrary;
  isMobile?: boolean;
  theme?: {
    accent: string;
    separator: string;
    textPrimary: string;
    textMuted: string;
    isDark: boolean;
  };
}) {
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [showLogo, setShowLogo] = useState(slot.showLogo !== false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const templateId = slotTemplateId(slot);
  const isPoster = slot.format === 'post';

  const { data: galleryUrls = [], isLoading: galleryLoading } = useQuery({
    queryKey: ['template-preview-gallery', workspaceId],
    queryFn: async () => {
      const r = await fetch(`/api/brand-context-data/${workspaceId}`, {
        headers: { 'X-Tenant-Id': workspaceId },
      });
      if (!r.ok) return [];
      const ctx = await r.json() as { reference_image_urls?: unknown };
      return prepareGalleryDisplayUrls(parseGalleryUrls(ctx.reference_image_urls));
    },
    enabled: open && Boolean(workspaceId),
    staleTime: 60_000,
  });

  const { data: brandPreview } = useQuery({
    queryKey: ['template-preview-brand-tokens', workspaceId],
    queryFn: async () => {
      const [ctxRes, themeRes] = await Promise.all([
        fetch(`/api/brand-context-data/${workspaceId}`, { headers: { 'X-Tenant-Id': workspaceId } }),
        fetch(`/api/brand-context/${workspaceId}/theme`, { headers: { 'X-Tenant-Id': workspaceId } }),
      ]);
      const ctx = ctxRes.ok ? await ctxRes.json() : {};
      const themePayload = themeRes.ok ? await themeRes.json() : {};
      return resolveBrandProductionTokens({
        brandContext: ctx as Record<string, unknown>,
        brandTheme: (themePayload.theme ?? null) as Record<string, unknown> | null,
      });
    },
    enabled: open && Boolean(workspaceId),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!open) return;
    setShowLogo(slot.showLogo !== false);
    setPreviewUrl(null);
    setError(null);
    setSelectedPhoto(null);
  }, [open, slot.key, slot.showLogo]);

  useEffect(() => {
    if (!open || selectedPhoto || !galleryUrls.length) return;
    setSelectedPhoto(galleryUrls[0] ?? null);
  }, [open, galleryUrls, selectedPhoto]);

  const previewSlot = useMemo(
    (): BrandTemplateLibrarySlot => ({ ...slot, showLogo }),
    [slot, showLogo],
  );

  const runPreview = useCallback(async () => {
    if (!templateId) {
      setError('Önce bir şablon seçin.');
      return;
    }
    if (!selectedPhoto) {
      setError('Galeriden bir fotoğraf seçin.');
      return;
    }
    setRendering(true);
    setError(null);
    setPreviewUrl(null);
    try {
      const libraryWithSlot: BrandTemplateLibrary = {
        ...previewLibrary,
        slots: previewLibrary.slots.map((s) => (s.key === slot.key ? previewSlot : s)),
      };
      const res = await fetch('/api/remotion/showcase/render-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          kitId,
          slotKey: slot.key,
          workspaceId,
          kind: isPoster ? 'poster' : 'story',
          format: isPoster ? 'post' : undefined,
          photoUrl: selectedPhoto,
          previewLibrary: libraryWithSlot,
          preferCachedPreview: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Önizleme render edilemedi');
      setPreviewUrl(data.url as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Önizleme hatası');
    } finally {
      setRendering(false);
    }
  }, [templateId, selectedPhoto, kitId, slot.key, workspaceId, isPoster, previewLibrary, previewSlot]);

  useEffect(() => {
    if (!open) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'contain';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overscrollBehavior = prevBodyOverscroll;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const border = isMobile
    ? `0.5px solid ${theme?.separator ?? 'rgba(255,255,255,0.1)'}`
    : '1px solid rgba(255,255,255,0.1)';
  const bg = isMobile ? (theme?.isDark ? '#0C1018' : '#FFFFFF') : '#14141f';
  const textPrimary = theme?.textPrimary ?? '#f1f5f9';
  const textMuted = theme?.textMuted ?? '#94a3b8';
  const accent = theme?.accent ?? '#a78bfa';

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${slot.labelTr} önizleme`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        width: '100vw', height: '100dvh', overflow: 'hidden',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: isMobile ? '12px 0 0' : 16,
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)',
        overscrollBehavior: 'contain',
      }}
    >
      <div style={{
        width: '100%', maxWidth: isMobile ? '100%' : 520,
        maxHeight: isMobile ? 'calc(100dvh - 12px)' : '92dvh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        borderRadius: isMobile ? '22px 22px 0 0' : 20, background: bg,
        border: isMobile ? 'none' : border, boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
          padding: isMobile ? 'calc(env(safe-area-inset-top,0px) + 16px) 16px 12px' : '18px 20px 14px',
          borderBottom: border,
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {slot.format === 'post' ? 'Feed post' : 'Story'} · Slot {slot.slot}
            </div>
            <h2 style={{ margin: '4px 0 0', fontSize: isMobile ? 20 : 18, fontWeight: 700, color: textPrimary }}>
              {slot.labelTr}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: textMuted, fontFamily: 'monospace' }}>
              {templateId || 'Şablon seçilmedi'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" style={{
            width: 34, height: 34, borderRadius: '50%', border, background: 'transparent',
            color: textMuted, cursor: 'pointer', fontSize: 18, lineHeight: 1,
          }}>×</button>
        </div>

        <div style={{
          padding: isMobile ? '16px 16px calc(env(safe-area-inset-bottom,0px) + 16px)' : '18px 20px 20px',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
              Galeri fotoğrafı
            </div>
            {galleryLoading ? (
              <p style={{ fontSize: 12, color: textMuted }}>Galeri yükleniyor…</p>
            ) : galleryUrls.length === 0 ? (
              <p style={{ fontSize: 12, color: textMuted, lineHeight: 1.5 }}>
                Önizleme için Marka → Galeri sekmesinden en az bir fotoğraf ekleyin.
              </p>
            ) : (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {galleryUrls.slice(0, 12).map((url) => {
                  const active = selectedPhoto === url;
                  return (
                    <button key={url} type="button" onClick={() => setSelectedPhoto(url)} style={{
                      flexShrink: 0, width: 72, height: 96, borderRadius: 10, overflow: 'hidden', padding: 0,
                      border: active ? `2px solid ${accent}` : border, cursor: 'pointer', opacity: active ? 1 : 0.75,
                    }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
            marginBottom: 16, padding: '12px 14px', borderRadius: 12, border,
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: textPrimary, cursor: 'pointer' }}>
              <input type="checkbox" checked={showLogo} onChange={(e) => setShowLogo(e.target.checked)} />
              Logo göster
            </label>
            <span style={{ fontSize: 12, color: textMuted }}>
              Font: {slotTypographyPreviewLabel(previewSlot)}
            </span>
            {brandPreview && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                <span style={{ fontSize: 11, color: textMuted }}>Renkler</span>
                <span title={brandPreview.primaryColor} style={{ width: 18, height: 18, borderRadius: 6, background: brandPreview.primaryColor, border }} />
                <span title={brandPreview.accentColor} style={{ width: 18, height: 18, borderRadius: 6, background: brandPreview.accentColor, border }} />
              </div>
            )}
            <div style={{ flexBasis: '100%' }}>
              <TemplateColorBehaviorPreview
                templateId={isPoster ? undefined : previewSlot.storyTemplateId}
                posterTemplateId={isPoster ? previewSlot.posterTemplateId : undefined}
                tokens={brandPreview ?? undefined}
                isMobile={Boolean(isMobile)}
                theme={theme}
                compact
              />
            </div>
          </div>

          <button type="button" onClick={() => void runPreview()}
            disabled={rendering || !templateId || !selectedPhoto}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 12, border: 'none',
              cursor: rendering || !templateId || !selectedPhoto ? 'not-allowed' : 'pointer',
              background: rendering ? '#334155' : accent, color: '#fff', fontWeight: 700, fontSize: 14,
              opacity: !templateId || !selectedPhoto ? 0.5 : 1,
            }}>
            {rendering ? 'Önizleme hazırlanıyor…' : 'Bu şablonu önizle'}
          </button>

          {error && <p style={{ marginTop: 12, fontSize: 12, color: '#f87171', lineHeight: 1.5 }}>{error}</p>}

          {previewUrl && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 11, color: textMuted, marginBottom: 8 }}>Önizleme — yalnızca bu slot şablonu</div>
              <div style={{
                borderRadius: 14, overflow: 'hidden', border, background: '#0a0a0f',
                maxHeight: isMobile ? '42dvh' : 420, display: 'flex', justifyContent: 'center',
              }}>
                {isPoster || previewUrl.endsWith('.png') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt={`${slot.labelTr} önizleme`}
                    style={{ maxWidth: '100%', maxHeight: isMobile ? '42dvh' : 420, objectFit: 'contain' }} />
                ) : (
                  <video src={previewUrl.split('?')[0]} autoPlay loop muted playsInline
                    style={{ maxWidth: '100%', maxHeight: isMobile ? '42dvh' : 420, objectFit: 'contain' }} />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
