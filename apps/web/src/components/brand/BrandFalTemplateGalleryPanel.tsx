'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { T } from '@/app/mobile/_components/theme-context';
import { fetchTenantBff } from '@/lib/bff-fetch';
import {
  buildCatalogDesignGalleryRows,
  catalogGalleryFormatMatches,
  collectOrphanDesignTemplates,
  galleryCoverageSummary,
  galleryRowSubtitle,
  galleryRowTitle,
  resolveAllCatalogSlotsForBrandHub,
  type CatalogDesignGalleryRow,
  type CatalogGalleryFormatFilter,
} from '@/lib/catalog-design-template-gallery';
import { resolveSectorSlotsWithPackFallback } from '@/lib/production-slot-catalog';
import type { BrandSlotFacilities } from '@/lib/sector-slot-pack';
import {
  DESIGN_TEMPLATE_TYPE_LABELS,
  normalizeDesignTemplateRow,
  type BrandDesignTemplateRow,
} from '@/lib/fal-archetype-gallery';
import type { ProductionSlotDefinition, TenantSlotAssignment } from '@/lib/production-slot-catalog';
import { BrandFalTemplateProductionPanel } from '@/components/brand/BrandFalTemplateProductionPanel';
import { FalSlotPreviewCompareModal } from '@/components/brand/FalSlotPreviewCompareModal';
import { resolveFalTemplateProductionSettings } from '@/lib/fal-template-production-settings';
import { resolveClientMediaUrl } from '@/lib/media-url';

type Variant = 'mobile' | 'desktop';

const FORMAT_LABELS: Record<Exclude<CatalogGalleryFormatFilter, 'all'>, string> = {
  post: 'Post',
  story: 'Story',
  reel: 'Reels',
};

const DESKTOP_THEME: T = {
  bg: '#0f1117',
  surface: 'rgba(255,255,255,0.04)',
  elevated: 'rgba(255,255,255,0.06)',
  glass: 'rgba(255,255,255,0.05)',
  textPrimary: '#f1f5f9',
  textSecondary: '#cbd5e1',
  textTertiary: '#94a3b8',
  textMuted: '#64748b',
  labelColor: '#94a3b8',
  accent: '#6366f1',
  accentGlow: 'rgba(99,102,241,0.35)',
  accentDim: 'rgba(99,102,241,0.12)',
  accentBorder: 'rgba(99,102,241,0.35)',
  gold: '#f59e0b',
  goldDim: 'rgba(245,158,11,0.12)',
  goldBorder: 'rgba(245,158,11,0.35)',
  cyan: '#22d3ee',
  cyanDim: 'rgba(34,211,238,0.12)',
  live: '#22c55e',
  liveDim: 'rgba(34,197,94,0.12)',
  warning: '#f59e0b',
  warningDim: 'rgba(245,158,11,0.12)',
  danger: '#ef4444',
  dangerDim: 'rgba(239,68,68,0.12)',
  success: '#22c55e',
  successDim: 'rgba(34,197,94,0.12)',
  info: '#38bdf8',
  infoDim: 'rgba(56,189,248,0.12)',
  separator: 'rgba(255,255,255,0.08)',
  separatorStrong: 'rgba(255,255,255,0.14)',
  pillActive: (color: string) => ({ background: `${color}22`, border: `1px solid ${color}55`, color }),
  pillIdle: { background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' },
  iconBtn: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' },
  backBtn: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' },
  surfaceCard: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' },
  surfaceGroup: { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' },
  surfaceRow: { background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  gradientAccent: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  gradientGold: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
  gradientSurface: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
  navBg: 'rgba(15,17,23,0.92)',
  navBorder: 'rgba(255,255,255,0.08)',
  navActiveColor: '#a5b4fc',
  navIdleColor: 'rgba(255,255,255,0.35)',
  isDark: true,
};

function formatBadgeLabel(format: string): string {
  if (format === 'reel' || format === 'reel_cover') return 'Reels';
  if (format === 'story') return 'Story';
  if (format === 'post') return 'Post';
  if (format === 'carousel') return 'Carousel';
  return format;
}

function previewAspectRatio(format: string): string {
  if (format === 'post' || format === 'carousel') return '4/5';
  return '9/16';
}

function GalleryCard({
  row,
  t,
  orphan,
  onPreviewSlot,
  onGenerateSlot,
  slotGenerating,
  onToggleSlot,
  slotSaving,
}: {
  row: CatalogDesignGalleryRow | null;
  template?: BrandDesignTemplateRow | null;
  t: T;
  orphan?: BrandDesignTemplateRow;
  onPreviewSlot?: (row: CatalogDesignGalleryRow) => void;
  onGenerateSlot?: (row: CatalogDesignGalleryRow) => void;
  slotGenerating?: boolean;
  onToggleSlot?: (row: CatalogDesignGalleryRow, enabled: boolean) => void;
  slotSaving?: boolean;
}) {
  const tmpl = orphan ?? row?.template ?? null;
  const title = orphan
    ? (DESIGN_TEMPLATE_TYPE_LABELS[orphan.template_type]?.tr ?? orphan.template_name)
    : row
      ? galleryRowTitle(row)
      : 'Şablon';
  const subtitle = orphan
    ? (DESIGN_TEMPLATE_TYPE_LABELS[orphan.template_type]?.desc ?? orphan.template_name)
    : row
      ? galleryRowSubtitle(row)
      : '';
  const format = orphan?.format ?? row?.format ?? 'post';
  const previewUrl = resolveClientMediaUrl(tmpl?.thumbnail_url ?? undefined) ?? tmpl?.thumbnail_url ?? null;
  const hasPreview = Boolean(previewUrl);
  const slotEnabled = row?.enabled ?? true;

  return (
    <div
      style={{
        borderRadius: 14,
        overflow: 'hidden',
        border: `0.5px solid ${hasPreview ? t.separator : t.separator}`,
        background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
        opacity: row && !slotEnabled ? 0.55 : 1,
      }}
    >
      <div style={{
        aspectRatio: previewAspectRatio(format),
        background: t.isDark ? '#111' : '#eee',
        position: 'relative',
      }}
      >
        {hasPreview && previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={title}
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
            border: tmpl ? undefined : `1px dashed ${t.separator}`,
          }}
          >
            <span>{tmpl ? 'Önizleme yok' : 'Henüz üretilmedi'}</span>
            <span style={{ fontSize: 10, opacity: 0.85 }}>
              {tmpl ? 'Karttaki Üret ile oluşturun' : 'Tek slot — maliyet düşük'}
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
          {formatBadgeLabel(format)}
        </span>
      </div>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary, lineHeight: 1.3 }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4, lineHeight: 1.4 }}>
          {subtitle}
        </div>
        {row?.facilityHint && (
          <div style={{ fontSize: 10, color: t.info, marginTop: 6, lineHeight: 1.35 }}>
            {row.facilityHint}
          </div>
        )}
        {row?.isOptional && (
          <div style={{ fontSize: 10, color: t.textMuted, marginTop: 4 }}>
            İsteğe bağlı slot
          </div>
        )}
        {row?.matchSource === 'catalog_key' && (
          <div style={{ fontSize: 10, color: t.success, marginTop: 6 }}>
            Katalog slot eşleşmesi
          </div>
        )}
        {row && !slotEnabled && (
          <div style={{ fontSize: 10, color: t.warning, marginTop: 6 }}>
            Üretimde kapalı — mission eşlemesinde kullanılmaz
          </div>
        )}
        {tmpl?.usage_count != null && tmpl.usage_count > 0 && (
          <div style={{ fontSize: 10, color: t.textTertiary, marginTop: 6 }}>
            {tmpl.usage_count}× mission üretiminde
          </div>
        )}
        {row && onToggleSlot && (
          <button
            type="button"
            disabled={slotSaving || slotGenerating}
            onClick={() => onToggleSlot(row, !slotEnabled)}
            style={{
              marginTop: 8,
              width: '100%',
              padding: '7px 10px',
              borderRadius: 8,
              border: `1px solid ${slotEnabled ? t.warning : t.success}`,
              background: 'transparent',
              color: slotEnabled ? t.warning : t.success,
              fontSize: 11,
              fontWeight: 700,
              cursor: (slotSaving || slotGenerating) ? 'wait' : 'pointer',
            }}
          >
            {slotSaving ? 'Kaydediliyor…' : slotEnabled ? 'Slotu kapat' : 'Slotu aç'}
          </button>
        )}
        {row && onGenerateSlot && slotEnabled && (
          <button
            type="button"
            disabled={slotGenerating}
            onClick={() => onGenerateSlot(row)}
            style={{
              marginTop: 8,
              width: '100%',
              padding: '8px 10px',
              borderRadius: 8,
              border: 'none',
              background: t.accent,
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              cursor: slotGenerating ? 'wait' : 'pointer',
              opacity: slotGenerating ? 0.7 : 1,
            }}
          >
            {slotGenerating
              ? 'Üretiliyor…'
              : hasPreview
                ? 'Yeniden üret'
                : 'Bu slotu üret'}
          </button>
        )}
        {row && onPreviewSlot && (
          <button
            type="button"
            disabled={slotGenerating}
            onClick={() => onPreviewSlot(row)}
            style={{
              marginTop: 6,
              width: '100%',
              padding: '7px 10px',
              borderRadius: 8,
              border: `1px solid ${t.separator}`,
              background: 'transparent',
              color: t.textMuted,
              fontSize: 11,
              fontWeight: 600,
              cursor: slotGenerating ? 'not-allowed' : 'pointer',
            }}
          >
            Yoğunlukları karşılaştır
          </button>
        )}
      </div>
    </div>
  );
}

export function BrandFalTemplateGalleryPanel({
  tenantId,
  sector,
  t: mobileTheme,
  variant = 'mobile',
  theme: themeProp,
}: {
  tenantId: string;
  sector: string;
  t?: T;
  variant?: Variant;
  /** When provided, skips theme fetch (BrandConstitution). */
  theme?: Record<string, unknown> | null;
}) {
  const t = variant === 'desktop' ? DESKTOP_THEME : (mobileTheme as T);
  const queryClient = useQueryClient();
  const galleryRef = useRef<HTMLDivElement>(null);
  const [formatFilter, setFormatFilter] = useState<CatalogGalleryFormatFilter>('all');
  const [generating, setGenerating] = useState(false);
  const [generatingSlotKey, setGeneratingSlotKey] = useState<string | null>(null);
  const [compareRow, setCompareRow] = useState<CatalogDesignGalleryRow | null>(null);
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'success' | 'error' | 'info'>('info');
  const [slotSavingKey, setSlotSavingKey] = useState<string | null>(null);

  const { data: fetchedTheme } = useQuery({
    queryKey: ['brand-theme-kit', tenantId],
    queryFn: async () => {
      const res = await fetchTenantBff(`/api/brand-context/${tenantId}/theme`, tenantId);
      if (!res.ok) return null;
      const data = (await res.json()) as { theme?: Record<string, unknown> | null };
      return data.theme ?? null;
    },
    enabled: Boolean(tenantId) && themeProp === undefined,
    staleTime: 60_000,
  });

  const brandTheme = themeProp ?? fetchedTheme ?? null;
  const productionSettings = useMemo(
    () => resolveFalTemplateProductionSettings(brandTheme),
    [brandTheme],
  );

  const { data: brandTemplates = [], isLoading: templatesLoading, isError: templatesError } = useQuery({
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

  const slotFacilities = useMemo((): BrandSlotFacilities | undefined => {
    if (!brandTheme || typeof brandTheme !== 'object') return undefined;
    const raw = (brandTheme as Record<string, unknown>).slot_facilities
      ?? (brandTheme as Record<string, unknown>).slotFacilities;
    return raw && typeof raw === 'object' ? raw as BrandSlotFacilities : undefined;
  }, [brandTheme]);

  const { data: catalogData, isLoading: catalogLoading } = useQuery({
    queryKey: ['catalog-gallery-slots', tenantId, sector],
    queryFn: async (): Promise<{
      sectorSlots: ProductionSlotDefinition[];
      assignments: TenantSlotAssignment[];
    }> => {
      let assignments: TenantSlotAssignment[] = [];
      let sectorSlots: ProductionSlotDefinition[] = [];

      try {
        const [assignmentsRes, sectorRes] = await Promise.all([
          fetchTenantBff(`/api/brand-context/${tenantId}/slot-catalog`, tenantId),
          fetchTenantBff(
            `/api/brand-context/${tenantId}/slot-catalog?view=sector_slots&sector_id=${encodeURIComponent(sector)}`,
            tenantId,
          ),
        ]);

        if (assignmentsRes.ok) {
          const raw = await assignmentsRes.json();
          assignments = Array.isArray(raw) ? raw as TenantSlotAssignment[] : [];
        }

        if (sectorRes.ok) {
          const raw = await sectorRes.json();
          sectorSlots = Array.isArray(raw) ? raw as ProductionSlotDefinition[] : [];
        }
      } catch {
        // Network / dev-server overload — sector pack fallback below keeps the gallery usable.
      }

      if (sectorSlots.length === 0 && assignments.length > 0) {
        sectorSlots = assignments
          .map((a) => a.slot)
          .filter((s): s is ProductionSlotDefinition => Boolean(s));
      }

      sectorSlots = resolveSectorSlotsWithPackFallback(sector, sectorSlots, slotFacilities);

      return { sectorSlots, assignments };
    },
    enabled: Boolean(tenantId && sector),
    staleTime: 120_000,
  });

  const slotEnabledByKey = useMemo(() => {
    const map = new Map<string, boolean>();
    const hubRows = resolveAllCatalogSlotsForBrandHub(
      catalogData?.sectorSlots ?? [],
      catalogData?.assignments,
      slotFacilities,
    );
    for (const row of hubRows) {
      map.set(row.slot.slot_key, row.enabled);
    }
    return map;
  }, [catalogData, slotFacilities]);

  const galleryRows = useMemo(
    () => buildCatalogDesignGalleryRows({
      slots: catalogData?.sectorSlots ?? [],
      templates: brandTemplates,
      slotEnabledByKey,
    }),
    [catalogData, brandTemplates, slotEnabledByKey],
  );

  const orphanTemplates = useMemo(
    () => collectOrphanDesignTemplates(brandTemplates, galleryRows),
    [brandTemplates, galleryRows],
  );

  const filteredRows = galleryRows.filter((row) => catalogGalleryFormatMatches(row, formatFilter));
  const enabledRows = galleryRows.filter((row) => row.enabled);
  const requiredRows = filteredRows.filter((row) => !row.isOptional);
  const optionalRows = filteredRows.filter((row) => row.isOptional);
  const coverage = galleryCoverageSummary(enabledRows);
  const enabledCount = enabledRows.length;
  const totalSlotCount = galleryRows.length;
  const templateReadyCount = enabledRows.filter((r) => Boolean(r.template?.thumbnail_url)).length;
  const isLoading = templatesLoading || catalogLoading;

  const toggleSlotPreference = async (row: CatalogDesignGalleryRow, enabled: boolean) => {
    if (!tenantId || slotSavingKey) return;
    setSlotSavingKey(row.slotKey);
    setStatus('');
    try {
      const res = await fetchTenantBff(
        `/api/brand-context/${tenantId}/slot-catalog`,
        tenantId,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assignments: [{
              slot_key: row.slotKey,
              enabled,
              priority: row.priority,
              assignment_source: 'onboarding',
            }],
          }),
        },
      );
      if (!res.ok) {
        setStatusKind('error');
        setStatus('Slot tercihi kaydedilemedi');
        return;
      }
      setStatusKind('success');
      setStatus(
        enabled
          ? `"${row.labelTr}" üretimde açıldı`
          : `"${row.labelTr}" kapatıldı — mission üretiminde eşlenmez`,
      );
      await queryClient.invalidateQueries({ queryKey: ['catalog-gallery-slots', tenantId, sector] });
    } catch {
      setStatusKind('error');
      setStatus('Bağlantı hatası');
    } finally {
      setSlotSavingKey(null);
      setTimeout(() => setStatus(''), 6000);
    }
  };

  const generateSingleSlot = async (row: CatalogDesignGalleryRow) => {
    if (!tenantId || generatingSlotKey) return;
    setGeneratingSlotKey(row.slotKey);
    setStatus('');
    setStatusKind('info');
    setStatus(`"${row.labelTr}" üretiliyor… (1 Fal çağrısı, ~1–3 dk sürebilir)`);
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
            template_id: row.template?.id,
          }),
        },
      );
      const data = res.ok ? ((await res.json()) as Record<string, unknown>) : null;
      if (!res.ok) {
        setStatusKind('error');
        const msg = String(data?.message ?? data?.error ?? '');
        if (res.status === 503 || msg.includes('unavailable')) {
          setStatus('Python servisi kapalı — birkaç saniye sonra tekrar deneyin.');
        } else if (data?.error === 'no_gallery_photos') {
          setStatus('Galeri fotoğrafı yok — önce Galeri sekmesine foto ekleyin.');
        } else {
          setStatus(msg || 'Slot üretimi başarısız — galeri ve API anahtarlarını kontrol edin.');
        }
        return;
      }
      if (!data?.persisted) {
        setStatusKind('error');
        setStatus('Önizleme üretildi ama kaydedilemedi — thumbnail boş olabilir.');
        return;
      }
      setStatusKind('success');
      const typoNote = data.typography_confirmed === false
        ? ' (sektör varsayılan tipografi — Renk & Tipografi onayı önerilir)'
        : '';
      setStatus(`"${row.labelTr}" hazır — mission üretiminde kullanılabilir.${typoNote}`);
      await queryClient.invalidateQueries({ queryKey: ['brand-design-templates', tenantId] });
    } catch {
      setStatusKind('error');
      setStatus('Bağlantı hatası');
    } finally {
      setGeneratingSlotKey(null);
      setTimeout(() => setStatus(''), 8000);
    }
  };

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

      setStatus('Smoke test OK — marka DNA, sektör, vibe ve tasarım yoğunluğu ayarlarıyla şablonlar üretiliyor… (3–8 dk sürebilir)');
      const full = await runGenerate({
        concurrency: productionSettings.concurrency,
        limit: productionSettings.preview_cap,
        locale: 'tr',
        archiveExisting: true,
      });
      if (!full.res.ok) {
        setStatusKind('error');
        setStatus('Tam set üretimi başarısız — smoke test geçti, tekrar deneyin.');
        return;
      }

      setStatusKind('success');
      completedSuccessfully = true;
      const catalogMeta = full.data?.catalog as Record<string, unknown> | undefined;
      const selected = Number(catalogMeta?.selected_slot_count ?? full.data?.generated ?? 0);
      const previewCount = Array.isArray(full.data?.templates)
        ? full.data.templates.filter((row) => {
            const normalized = normalizeDesignTemplateRow(row as Record<string, unknown>);
            return normalized.status !== 'archived' && Boolean(normalized.thumbnail_url);
          }).length
        : selected;
      setStatus(`Markaya özel Fal şablon seti hazır — ${previewCount} önizleme, katalog kaynağı: ${String(catalogMeta?.source ?? 'catalog')}.`);

      const freshRows = Array.isArray(full.data?.templates)
        ? full.data.templates
            .map((row) => normalizeDesignTemplateRow(row as Record<string, unknown>))
            .filter((row) => row.status !== 'archived')
        : null;
      if (freshRows?.length) {
        queryClient.setQueryData(['brand-design-templates', tenantId], freshRows);
      }
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['brand-design-templates', tenantId] }),
        queryClient.refetchQueries({ queryKey: ['catalog-gallery-slots', tenantId, sector] }),
      ]);
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

  const needsPreviewGeneration = coverage.previewCount < coverage.slotCount && brandTemplates.length > 0;

  const gridStyle: React.CSSProperties = variant === 'desktop'
    ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }
    : { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {brandTheme && (
        <BrandFalTemplateProductionPanel
          tenantId={tenantId}
          theme={brandTheme}
          t={t}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
          }}
        />
      )}

      <div style={{
        height: 1,
        background: t.separator,
        margin: '4px 0',
      }}
      />

      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: t.textMuted }}>
        Marka DNA, sektör, vibe, galeri analizi ve tasarım yoğunluğu ayarlarıyla üretilen fal.ai şablon seti.
        Mission üretiminde aynı marka reçetesi korunur; fotoğraf, metin ve slot amacı değişir.
        İhtiyacınız olmayan slotları (ör. havuz yoksa havuz slotları) kapatabilirsiniz; üretim yalnızca açık slotlara eşlenir.
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
            {coverage.missingCount} / {coverage.slotCount} slot önizlemesi eksik — yeniden üretin.
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
        {(['all', 'post', 'story', 'reel'] as CatalogGalleryFormatFilter[]).map((f) => {
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

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <span style={{ fontSize: 12, color: t.textSecondary, display: 'block' }}>
            {totalSlotCount
              ? `${enabledCount}/${totalSlotCount} etkin · ${templateReadyCount} şablon hazır · ${coverage.previewCount} önizlemeli`
              : isLoading
                ? 'Slot kataloğu yükleniyor…'
                : 'Sektör tanımsız — Kimlik sekmesinde sektör kaydedin'}
          </span>
          <span style={{ fontSize: 11, color: t.textMuted, display: 'block', marginTop: 4, lineHeight: 1.45 }}>
            Deneme için kartlardaki <strong style={{ color: t.textSecondary }}>Bu slotu üret</strong>
            {' '}(1 slot). Tüm set üstteki butonla ({productionSettings.preview_cap} slot).
          </span>
        </div>
        <button
          type="button"
          disabled={generating || Boolean(generatingSlotKey)}
          onClick={() => void generateBrandSet()}
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            border: `1px solid ${t.separator}`,
            background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            color: t.textSecondary,
            fontSize: 12,
            fontWeight: 700,
            cursor: (generating || generatingSlotKey) ? 'wait' : 'pointer',
            opacity: (generating || generatingSlotKey) ? 0.75 : 1,
            flexShrink: 0,
          }}
        >
          {generating ? 'Üretiliyor…' : `Tüm seti oluştur (${productionSettings.preview_cap})`}
        </button>
      </div>

      {isLoading && (
        <p style={{ margin: 0, fontSize: 12, color: t.textMuted }}>Yükleniyor…</p>
      )}
      {templatesError && (
        <p style={{ margin: 0, fontSize: 12, color: t.warning }}>
          Marka şablonları yüklenemedi.
        </p>
      )}

      {!isLoading && requiredRows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.textSecondary }}>
            Zorunlu slotlar ({requiredRows.filter((r) => r.enabled).length}/{requiredRows.length} etkin)
          </div>
          <div ref={galleryRef} style={gridStyle}>
            {requiredRows.map((row) => (
              <GalleryCard
                key={row.slotKey}
                row={row}
                t={t}
                onPreviewSlot={row.enabled ? setCompareRow : undefined}
                onGenerateSlot={row.enabled ? (r) => void generateSingleSlot(r) : undefined}
                onToggleSlot={(r, enabled) => void toggleSlotPreference(r, enabled)}
                slotGenerating={generatingSlotKey === row.slotKey}
                slotSaving={slotSavingKey === row.slotKey}
              />
            ))}
          </div>
        </div>
      )}

      {!isLoading && optionalRows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.textSecondary }}>
            İsteğe bağlı slotlar ({optionalRows.filter((r) => r.enabled).length}/{optionalRows.length} etkin)
          </div>
          <p style={{ margin: 0, fontSize: 11, color: t.textMuted, lineHeight: 1.45 }}>
            İşletmenizde olmayan olanaklara ait slotları kapatabilirsiniz (ör. havuz, DJ, spa).
          </p>
          <div style={gridStyle}>
            {optionalRows.map((row) => (
              <GalleryCard
                key={row.slotKey}
                row={row}
                t={t}
                onPreviewSlot={row.enabled ? setCompareRow : undefined}
                onGenerateSlot={row.enabled ? (r) => void generateSingleSlot(r) : undefined}
                onToggleSlot={(r, enabled) => void toggleSlotPreference(r, enabled)}
                slotGenerating={generatingSlotKey === row.slotKey}
                slotSaving={slotSavingKey === row.slotKey}
              />
            ))}
          </div>
        </div>
      )}

      {compareRow && (
        <FalSlotPreviewCompareModal
          tenantId={tenantId}
          sector={sector}
          row={compareRow}
          t={t}
          onClose={() => setCompareRow(null)}
          onApplied={() => {
            void queryClient.invalidateQueries({ queryKey: ['brand-design-templates', tenantId] });
          }}
        />
      )}

      {orphanTemplates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.textSecondary }}>
            Katalog dışı şablonlar ({orphanTemplates.length})
          </div>
          <div style={gridStyle}>
            {orphanTemplates
              .filter((tmpl) => {
                if (formatFilter === 'all') return true;
                if (formatFilter === 'reel') return tmpl.format === 'reel_cover';
                return tmpl.format === formatFilter;
              })
              .map((tmpl) => (
                <GalleryCard key={tmpl.id} row={null} orphan={tmpl} t={t} />
              ))}
          </div>
        </div>
      )}

      {!isLoading && filteredRows.length === 0 && (
        <p style={{ margin: 0, fontSize: 12, color: t.textMuted }}>
          Bu formatta etkin slot yok — filtreleri değiştirin veya operatör panelinden slot ataması yapın.
        </p>
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
