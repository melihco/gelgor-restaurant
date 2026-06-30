'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { T } from '@/app/mobile/_components/theme-context';
import { fetchTenantBff } from '@/lib/bff-fetch';
import { resolveDesignTemplatePresets } from '@/lib/brand-design-template-presets';
import {
  DESIGN_TEMPLATE_TYPE_LABELS,
  normalizeDesignTemplateRow,
  type BrandDesignTemplateRow,
} from '@/lib/fal-archetype-gallery';

type FormatFilter = 'all' | 'post' | 'story' | 'reel';

const FORMAT_LABELS: Record<Exclude<FormatFilter, 'all'>, string> = {
  post: 'Post',
  story: 'Story',
  reel: 'Reels',
};

function formatBadgeLabel(format: string): string {
  if (format === 'reel_cover') return 'Reels';
  if (format === 'story') return 'Story';
  if (format === 'post') return 'Post';
  return format;
}

export function BrandFalTemplateGalleryPanel({
  tenantId,
  sector,
  t,
}: {
  tenantId: string;
  sector: string;
  t: T;
}) {
  const queryClient = useQueryClient();
  const galleryRef = useRef<HTMLDivElement>(null);
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'success' | 'error' | 'info'>('info');

  const presetSlots = useMemo(() => resolveDesignTemplatePresets(sector), [sector]);

  const { data: brandTemplates = [], isLoading, isError } = useQuery({
    queryKey: ['brand-design-templates', tenantId],
    queryFn: async (): Promise<BrandDesignTemplateRow[]> => {
      const res = await fetchTenantBff(
        `/api/brand-context/${tenantId}/design-templates`,
        tenantId,
      );
      if (!res.ok) throw new Error('design-templates fetch failed');
      const raw = (await res.json()) as Record<string, unknown>[];
      if (!Array.isArray(raw)) return [];
      return raw
        .map((row) => normalizeDesignTemplateRow(row))
        .filter((row) => row.status !== 'archived');
    },
    enabled: Boolean(tenantId),
    staleTime: 60_000,
  });

  const generateBrandSet = async () => {
    if (!tenantId || generating) return;
    setGenerating(true);
    setStatus('');
    setStatusKind('info');

    const runGenerate = async (payload: Record<string, unknown>) => {
      const res = await fetchTenantBff(
        `/api/brand-context/${tenantId}/generate-design-templates`,
        tenantId,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = res.ok ? ((await res.json()) as Record<string, unknown>) : null;
      return { res, data };
    };

    let completedSuccessfully = false;

    try {
      setStatus('Smoke test: 1 şablon üretiliyor…');
      const smoke = await runGenerate({
        limit: 1,
        concurrency: 1,
        locale: 'tr',
        archiveExisting: false,
      });
      if (!smoke.res.ok) {
        setStatusKind('error');
        setStatus('Şablon üretimi başarısız — galeri fotoğrafı ve API anahtarlarını kontrol edin.');
        return;
      }
      const smokeGenerated = Number(smoke.data?.generated ?? 0);
      if (smokeGenerated < 1) {
        setStatusKind('error');
        setStatus('Smoke test başarısız — önizleme üretilemedi (FAL/OpenAI anahtarlarını kontrol edin).');
        return;
      }

      setStatus('Smoke test OK — kalan şablonlar üretiliyor… (3–8 dk sürebilir)');
      const full = await runGenerate({ concurrency: 2, locale: 'tr' });
      if (!full.res.ok) {
        setStatusKind('error');
        setStatus('Tam set üretimi başarısız — smoke test geçti, tekrar deneyin.');
        return;
      }

      setStatusKind('success');
      completedSuccessfully = true;
      const total = Number(full.data?.generated ?? 0);
      const previewCount = Array.isArray(full.data?.templates)
        ? full.data.templates.filter((row) => {
            const normalized = normalizeDesignTemplateRow(row as Record<string, unknown>);
            return normalized.status !== 'archived' && Boolean(normalized.thumbnail_url);
          }).length
        : total;
      setStatus(`Marka şablon seti hazır — ${previewCount} önizleme aşağıda.`);

      const freshRows = Array.isArray(full.data?.templates)
        ? full.data.templates
            .map((row) => normalizeDesignTemplateRow(row as Record<string, unknown>))
            .filter((row) => row.status !== 'archived')
        : null;
      if (freshRows?.length) {
        queryClient.setQueryData(['brand-design-templates', tenantId], freshRows);
      }
      await queryClient.refetchQueries({ queryKey: ['brand-design-templates', tenantId] });
      setFormatFilter('all');
      requestAnimationFrame(() => {
        galleryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch {
      setStatusKind('error');
      setStatus('Bağlantı hatası — Python servisi çalışıyor mu?');
    } finally {
      setGenerating(false);
      setTimeout(() => setStatus(''), completedSuccessfully ? 30_000 : 8000);
    }
  };

  const filteredBrandTemplates = brandTemplates.filter((tmpl) => {
    if (formatFilter === 'all') return true;
    if (formatFilter === 'reel') return tmpl.format === 'reel_cover';
    return tmpl.format === formatFilter;
  });

  const templatesByType = new Map(brandTemplates.map((row) => [row.template_type, row]));
  const previewMissingCount = brandTemplates.filter((tmpl) => !tmpl.thumbnail_url).length;
  const needsPreviewGeneration = brandTemplates.length > 0 && previewMissingCount > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: t.textMuted }}>
        Onboarding&apos;de üretilen fal.ai şablon seti mission üretiminde kilitlenir —
        aynı layout, değişen fotoğraf ve metin (kampanya, özel gün, günlük story, reel kapağı).
        Remotion ucuz alternatif olarak ayrı slotlarda kalır.
      </p>

      {needsPreviewGeneration && (
        <div style={{
          padding: '12px 14px',
          borderRadius: 12,
          border: `1px solid ${t.accentBorder}`,
          background: t.isDark ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
        >
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: t.textSecondary }}>
            {previewMissingCount === brandTemplates.length
              ? `${brandTemplates.length} şablon kayıtlı ama fal.ai önizlemesi henüz üretilmemiş. Aşağıdaki butona basın — 3–8 dk sürebilir.`
              : `${previewMissingCount} şablonda önizleme eksik — yeniden üretin.`}
          </p>
          <button
            type="button"
            disabled={generating}
            onClick={() => void generateBrandSet()}
            style={{
              alignSelf: 'flex-start',
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: t.accent,
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: generating ? 'wait' : 'pointer',
              opacity: generating ? 0.75 : 1,
            }}
          >
            {generating ? 'Üretiliyor…' : 'Önizlemeleri üret'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(['all', 'post', 'story', 'reel'] as FormatFilter[]).map((f) => {
          const active = formatFilter === f;
          const label = f === 'all' ? 'Tümü' : FORMAT_LABELS[f];
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFormatFilter(f)}
              style={{
                padding: '5px 10px',
                borderRadius: 999,
                fontSize: 11,
                cursor: 'pointer',
                border: `1px solid ${active ? t.accentBorder : t.separator}`,
                background: active ? (t.isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.1)') : 'transparent',
                color: active ? t.accent : t.textMuted,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 12, color: t.textSecondary }}>
          {brandTemplates.length
            ? `${brandTemplates.length} kilitli şablon — mission fal slotlarında kullanılır`
            : 'Henüz set yok — onboarding veya aşağıdaki buton'}
        </span>
        <button
          type="button"
          disabled={generating}
          onClick={() => void generateBrandSet()}
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            border: 'none',
            background: t.accent,
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            cursor: generating ? 'wait' : 'pointer',
            opacity: generating ? 0.75 : 1,
            flexShrink: 0,
          }}
        >
          {generating ? 'Üretiliyor…' : brandTemplates.length ? 'Yeniden üret' : 'Seti oluştur'}
        </button>
      </div>

      {isLoading && (
        <p style={{ margin: 0, fontSize: 12, color: t.textMuted }}>Yükleniyor…</p>
      )}
      {isError && (
        <p style={{ margin: 0, fontSize: 12, color: t.warning }}>
          Marka şablonları yüklenemedi.
        </p>
      )}

      {brandTemplates.length > 0 ? (
        <div
          ref={galleryRef}
          style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 10,
        }}
        >
          {filteredBrandTemplates.map((tmpl) => {
            const meta = DESIGN_TEMPLATE_TYPE_LABELS[tmpl.template_type];
            return (
              <div
                key={tmpl.id}
                style={{
                  borderRadius: 14,
                  overflow: 'hidden',
                  border: `0.5px solid ${t.separator}`,
                  background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                }}
              >
                <div style={{
                  aspectRatio: tmpl.format === 'post' ? '4/5' : '9/16',
                  background: t.isDark ? '#111' : '#eee',
                  position: 'relative',
                }}
                >
                  {tmpl.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={tmpl.thumbnail_url}
                      alt={tmpl.template_name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    ) : (
                      <div style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        fontSize: 11,
                        color: t.textMuted,
                        padding: 12,
                        textAlign: 'center',
                      }}
                      >
                        <span>Önizleme yok</span>
                        <span style={{ fontSize: 10, opacity: 0.85 }}>
                          &quot;Yeniden üret&quot; ile oluşturun
                        </span>
                      </div>
                    )}
                  <span style={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 999,
                    background: 'rgba(0,0,0,0.55)',
                    color: '#fff',
                  }}
                  >
                    {formatBadgeLabel(tmpl.format)}
                  </span>
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary, lineHeight: 1.3 }}>
                    {meta?.tr ?? tmpl.template_name}
                  </div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4, lineHeight: 1.4 }}>
                    {meta?.desc ?? tmpl.template_name}
                  </div>
                  {tmpl.usage_count != null && tmpl.usage_count > 0 && (
                    <div style={{ fontSize: 10, color: t.textTertiary, marginTop: 6 }}>
                      {tmpl.usage_count}× mission üretiminde
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 8,
        }}
        >
          {presetSlots.map((preset) => {
            const meta = DESIGN_TEMPLATE_TYPE_LABELS[preset.templateType];
            const produced = templatesByType.get(preset.templateType);
            return (
              <div
                key={preset.templateType}
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: `0.5px dashed ${t.separator}`,
                  background: t.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: t.textPrimary }}>
                  {meta?.tr ?? preset.name}
                </div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4, lineHeight: 1.4 }}>
                  {meta?.desc ?? preset.intent}
                </div>
                <div style={{ fontSize: 10, color: t.textTertiary, marginTop: 6 }}>
                  {formatBadgeLabel(preset.format)}
                  {produced ? ' · üretildi' : ' · bekliyor'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {status && (
        <p style={{
          margin: 0,
          fontSize: 12,
          color: statusKind === 'error' ? t.danger : statusKind === 'success' ? t.success : t.textMuted,
        }}
        >
          {status}
        </p>
      )}
    </div>
  );
}
