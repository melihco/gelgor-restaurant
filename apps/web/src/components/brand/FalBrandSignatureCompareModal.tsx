'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { T } from '@/app/mobile/_components/theme-context';
import { fetchTenantBff } from '@/lib/bff-fetch';
import { resolveClientMediaUrl } from '@/lib/media-url';
import type { CatalogDesignGalleryRow } from '@/lib/catalog-design-template-gallery';

interface SignatureVariant {
  label: string;
  arm?: 'baseline' | 'signature';
  thumbnail_url: string | null;
}

interface SignatureSummary {
  grading?: string;
  composition?: string;
  agencyLevel?: string;
  captionVoice?: string;
  typePersonality?: string;
}

export function FalBrandSignatureCompareModal({
  tenantId,
  sector,
  row,
  t,
  onClose,
  /** When true (default), start the 2-arm Fal compare as soon as the sheet opens. */
  autoStart = true,
}: {
  tenantId: string;
  sector: string;
  row: CatalogDesignGalleryRow;
  t: T;
  onClose: () => void;
  autoStart?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<SignatureVariant[]>([]);
  const [summary, setSummary] = useState<SignatureSummary | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const startedForKey = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const runCompare = async () => {
    setLoading(true);
    setError('');
    setStatus('Mevcut + marka imzası üretiliyor… (2 Fal çağrısı, üretim etkilenmez)');
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
            mode: 'compare_signature',
            persist: false,
          }),
        },
      );
      const data = res.ok ? ((await res.json()) as {
        variants?: SignatureVariant[];
        signature_summary?: SignatureSummary | null;
        error?: string;
        message?: string;
      }) : null;
      if (!res.ok || !data?.variants?.length) {
        setError(data?.message ?? data?.error ?? 'Karşılaştırma üretilemedi');
        setVariants([]);
        return;
      }
      setVariants(data.variants);
      setSummary(data.signature_summary ?? null);
      const ready = data.variants.filter((v) => v.thumbnail_url).length;
      setStatus(`${ready}/${data.variants.length} hazır · kayıt yok · mission üretimine yazılmaz`);
    } catch {
      setError('Bağlantı hatası');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!autoStart) return;
    if (startedForKey.current === row.slotKey) return;
    startedForKey.current = row.slotKey;
    void runCompare();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once per opened slot
  }, [autoStart, row.slotKey]);

  const summaryBits = summary
    ? [
        summary.grading ? `Grading: ${summary.grading}` : '',
        summary.composition ? `Kompozisyon: ${summary.composition}` : '',
        summary.typePersonality ? `Tipografi: ${summary.typePersonality}` : '',
        summary.agencyLevel ? `Agency: ${summary.agencyLevel}` : '',
      ].filter(Boolean)
    : [];

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal
      aria-label="Marka imzası karşılaştırma"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10050,
        background: 'rgba(0,0,0,0.62)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 16,
        paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 640,
          maxHeight: '90dvh',
          overflow: 'auto',
          borderRadius: 18,
          background: t.isDark ? '#131A24' : '#fff',
          border: `0.5px solid ${t.separator}`,
          padding: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary }}>{row.labelTr}</div>
            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4, lineHeight: 1.4 }}>
              Marka imzası denemesi · mevcut üretim etkilenmez · {row.slotKey}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: t.textMuted,
              fontSize: 22,
              lineHeight: 1,
              cursor: 'pointer',
              minWidth: 44,
              minHeight: 44,
            }}
          >
            ×
          </button>
        </div>

        <p style={{ margin: '0 0 12px', fontSize: 12, color: t.textSecondary, lineHeight: 1.45 }}>
          Aynı slot için iki önizleme: solda bugünkü recipe, sağda vibe/grading/composition imza paketi.
          Sonuçlar sadece bu ekranda kalır.
        </p>

        <button
          type="button"
          disabled={loading}
          onClick={() => void runCompare()}
          style={{
            width: '100%',
            minHeight: 44,
            padding: '12px 14px',
            borderRadius: 12,
            border: 'none',
            background: t.gold,
            color: '#111',
            fontWeight: 700,
            fontSize: 13,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.75 : 1,
            marginBottom: 12,
          }}
        >
          {loading ? 'Üretiliyor…' : variants.length ? 'Tekrar üret ve karşılaştır' : 'Ekranda üret ve karşılaştır'}
        </button>

        {loading && (
          <p style={{ margin: '0 0 10px', fontSize: 12, color: t.textMuted }}>{status || 'Üretiliyor…'}</p>
        )}
        {error && (
          <p style={{ margin: '0 0 10px', fontSize: 12, color: t.danger }}>{error}</p>
        )}
        {!loading && status && !error && (
          <p style={{ margin: '0 0 10px', fontSize: 12, color: t.success }}>{status}</p>
        )}

        {summaryBits.length > 0 && (
          <div style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 10,
            background: t.isDark ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.1)',
            border: `1px solid ${t.goldBorder}`,
          }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: t.gold, marginBottom: 6 }}>
              İmza paketi (preview)
            </div>
            {summaryBits.map((bit) => (
              <div key={bit} style={{ fontSize: 11, color: t.textSecondary, lineHeight: 1.4, marginTop: 2 }}>
                {bit}
              </div>
            ))}
          </div>
        )}

        {variants.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
            {variants.map((variant, idx) => {
              const url = resolveClientMediaUrl(variant.thumbnail_url ?? undefined)
                ?? variant.thumbnail_url;
              const isSignature = variant.arm === 'signature' || idx === 1;
              return (
                <div
                  key={`${variant.arm ?? variant.label}-${idx}`}
                  style={{
                    border: `1.5px solid ${isSignature ? t.goldBorder : t.separator}`,
                    borderRadius: 12,
                    overflow: 'hidden',
                    background: 'transparent',
                  }}
                >
                  <div style={{ aspectRatio: row.format === 'post' ? '4/5' : '9/16', background: '#111' }}>
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={variant.label}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        color: t.textMuted,
                        padding: 10,
                        textAlign: 'center',
                      }}
                      >
                        Önizleme yok
                      </div>
                    )}
                  </div>
                  <div style={{ padding: '8px 10px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: t.textPrimary }}>
                      {variant.label}
                    </div>
                    <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>
                      {isSignature ? 'Vibe + grading + composition' : 'Bugünkü fal recipe'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
