'use client';

import React, { useState } from 'react';
import type { T } from '@/app/mobile/_components/theme-context';
import { fetchTenantBff } from '@/lib/bff-fetch';
import { FAL_DESIGN_INTENSITY_LABELS, type FalDesignIntensityLevel } from '@/lib/fal-design-intensity';
import { intensityChannelForCatalogFormat } from '@/lib/fal-template-production-settings';
import type { CatalogDesignGalleryRow } from '@/lib/catalog-design-template-gallery';

interface PreviewVariant {
  label: string;
  intensity: FalDesignIntensityLevel;
  thumbnail_url: string | null;
}

export function FalSlotPreviewCompareModal({
  tenantId,
  sector,
  row,
  t,
  onClose,
  onApplied,
}: {
  tenantId: string;
  sector: string;
  row: CatalogDesignGalleryRow;
  t: T;
  onClose: () => void;
  onApplied?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'compare' | 'regenerate' | null>(null);
  const [variants, setVariants] = useState<PreviewVariant[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const runPreview = async (previewMode: 'compare' | 'regenerate') => {
    setLoading(true);
    setMode(previewMode);
    setError('');
    setStatus(previewMode === 'compare' ? 'Yoğunluk varyantları üretiliyor…' : 'Fal önizlemesi güncelleniyor…');
    try {
      const res = await fetchTenantBff(
        `/api/brand-context/${tenantId}/design-templates/preview-slot`,
        tenantId,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            catalog_slot_key: row.slotKey,
            sector,
            mode: previewMode,
          }),
        },
      );
      const data = res.ok ? ((await res.json()) as {
        variants?: PreviewVariant[];
        error?: string;
        message?: string;
      }) : null;
      if (!res.ok || !data?.variants?.length) {
        setError(data?.message ?? data?.error ?? 'Önizleme üretilemedi');
        setVariants([]);
        return;
      }
      setVariants(data.variants);
      setSelectedIdx(0);
      setStatus(`${data.variants.filter((v) => v.thumbnail_url).length} / ${data.variants.length} önizleme hazır`);
    } catch {
      setError('Bağlantı hatası');
    } finally {
      setLoading(false);
    }
  };

  const applySelected = async () => {
    const chosen = variants[selectedIdx];
    const templateId = row.template?.id;
    if (!chosen?.thumbnail_url || !templateId) {
      setError('Önce önizleme üretin veya şablon kaydı yok');
      return;
    }
    setLoading(true);
    setError('');
    setStatus('Seçilen tasarım kaydediliyor…');
    const channel = intensityChannelForCatalogFormat(row.format);
    try {
      const res = await fetchTenantBff(
        `/api/brand-context/${tenantId}/design-templates/preview-slot`,
        tenantId,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            catalog_slot_key: row.slotKey,
            sector,
            mode: 'regenerate',
            persist: true,
            template_id: templateId,
            parameter_overrides: mode === 'compare'
              ? { intensity: { [channel]: chosen.intensity } }
              : undefined,
          }),
        },
      );
      if (!res.ok) {
        setError('Kayıt başarısız');
        return;
      }
      setStatus('Şablon güncellendi — mission üretiminde kullanılacak');
      onApplied?.();
      setTimeout(onClose, 1200);
    } catch {
      setError('Bağlantı hatası');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: '88vh',
          overflow: 'auto',
          borderRadius: 18,
          background: t.isDark ? '#131A24' : '#fff',
          border: `0.5px solid ${t.separator}`,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary }}>{row.labelTr}</div>
            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>
              Fal parametre karşılaştırma · {row.slotKey}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', color: t.textMuted, fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button
            type="button"
            disabled={loading}
            onClick={() => void runPreview('regenerate')}
            style={actionBtnStyle(t, false)}
          >
            Fal ile güncelle
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void runPreview('compare')}
            style={actionBtnStyle(t, true)}
          >
            Yoğunlukları karşılaştır
          </button>
        </div>

        {loading && (
          <p style={{ margin: '0 0 10px', fontSize: 12, color: t.textMuted }}>{status || 'Üretiliyor…'}</p>
        )}
        {error && (
          <p style={{ margin: '0 0 10px', fontSize: 12, color: t.danger }}>{error}</p>
        )}
        {!loading && status && !error && (
          <p style={{ margin: '0 0 10px', fontSize: 12, color: t.success }}>{status}</p>
        )}

        {variants.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
            {variants.map((variant, idx) => {
              const selected = selectedIdx === idx;
              const meta = FAL_DESIGN_INTENSITY_LABELS[variant.intensity];
              return (
                <button
                  key={`${variant.intensity}-${idx}`}
                  type="button"
                  onClick={() => setSelectedIdx(idx)}
                  style={{
                    padding: 0,
                    border: `2px solid ${selected ? t.accent : t.separator}`,
                    borderRadius: 12,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    background: 'transparent',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ aspectRatio: row.format === 'post' ? '4/5' : '9/16', background: '#111' }}>
                    {variant.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={variant.thumbnail_url} alt={variant.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: t.textMuted }}>Önizleme yok</div>
                    )}
                  </div>
                  <div style={{ padding: '8px 10px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: t.textPrimary }}>{variant.label}</div>
                    <div style={{ fontSize: 10, color: t.textMuted }}>{meta?.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {variants.length > 0 && row.template?.id && (
          <button
            type="button"
            disabled={loading || !variants[selectedIdx]?.thumbnail_url}
            onClick={() => void applySelected()}
            style={{
              marginTop: 14,
              width: '100%',
              padding: '12px 14px',
              borderRadius: 12,
              border: 'none',
              background: t.accent,
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            Bu tasarımı kilitle
          </button>
        )}
      </div>
    </div>
  );
}

function actionBtnStyle(t: T, accent: boolean): React.CSSProperties {
  return {
    padding: '8px 12px',
    borderRadius: 10,
    border: `1px solid ${accent ? t.accentBorder : t.separator}`,
    background: accent ? (t.isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.1)') : 'transparent',
    color: accent ? t.accent : t.textSecondary,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  };
}
