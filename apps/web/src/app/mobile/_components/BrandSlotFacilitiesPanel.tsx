'use client';

/**
 * Mobile Marka — tesis özellikleri + 7 raf özeti.
 * Platform admin UI değil; /mobile BrandConstitution (Tasarım → Şablon) altında.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchTenantBff } from '@/lib/bff-fetch';
import type { T } from './theme-context';

interface FacilityOption {
  key: string;
  enabled: boolean;
  label_tr: string;
  hint_tr: string;
}

interface ShelfSummary {
  key: string;
  label_tr: string;
  format: string;
  catalog_count: number;
  effective_count: number;
  facility_blocked_count: number;
}

interface CoverageInfo {
  effective_enabled_count: number;
  has_post: boolean;
  has_story: boolean;
  ok: boolean;
  errors: string[];
}

interface OverviewResponse {
  workspace_id: string;
  sector_id: string | null;
  facilities: Record<string, boolean>;
  facility_options: FacilityOption[];
  shelves: ShelfSummary[];
  coverage: CoverageInfo;
  assignment_row_count: number;
  using_sector_defaults: boolean;
  slots?: Array<{
    slot_key: string;
    required_facilities: string[];
    facility_blocked: boolean;
    effective_enabled: boolean;
  }>;
}

interface PreviewResponse {
  would_disable_by_facility: string[];
  recommended_disable_by_facility: string[];
  coverage: CoverageInfo;
}

export function BrandSlotFacilitiesPanel({
  tenantId,
  sector,
  t,
}: {
  tenantId: string;
  sector?: string | null;
  t: T;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<string, boolean> | null>(null);
  const [saving, setSaving] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'info' | 'success' | 'error'>('info');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const overviewQuery = useQuery({
    queryKey: ['brand-slot-overview', tenantId],
    queryFn: async (): Promise<OverviewResponse> => {
      const res = await fetchTenantBff(
        `/api/brand-context/${tenantId}/slot-catalog?view=overview`,
        tenantId,
      );
      if (!res.ok) throw new Error(`overview ${res.status}`);
      return res.json() as Promise<OverviewResponse>;
    },
    enabled: Boolean(tenantId),
    staleTime: 30_000,
  });

  const overview = overviewQuery.data;

  useEffect(() => {
    if (overview?.facilities && !draft) {
      setDraft({ ...overview.facilities });
    }
  }, [overview, draft]);

  const dirty = useMemo(() => {
    if (!draft || !overview) return false;
    return Object.keys(draft).some((k) => draft[k] !== overview.facilities[k]);
  }, [draft, overview]);

  const relevantFacilityKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const slot of overview?.slots ?? []) {
      for (const f of slot.required_facilities ?? []) keys.add(f);
    }
    // Always surface opt-in service facilities (hiring / events calendar)
    for (const opt of overview?.facility_options ?? []) {
      if (!opt.enabled) keys.add(opt.key);
    }
    // Fallback: show common venue toggles even if catalog tags empty
    if (keys.size === 0) {
      for (const opt of overview?.facility_options ?? []) keys.add(opt.key);
    }
    return keys;
  }, [overview]);

  const visibleOptions = useMemo(() => {
    const opts = overview?.facility_options ?? [];
    if (relevantFacilityKeys.size === 0) return opts;
    const filtered = opts.filter((o) => relevantFacilityKeys.has(o.key));
    return filtered.length > 0 ? filtered : opts;
  }, [overview, relevantFacilityKeys]);

  const runPreview = useCallback(
    async (nextFacilities: Record<string, boolean>) => {
      if (!tenantId) return;
      setPreviewLoading(true);
      try {
        const res = await fetchTenantBff(
          `/api/brand-context/${tenantId}/slot-catalog`,
          tenantId,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'preview',
              facilities: nextFacilities,
            }),
          },
        );
        if (!res.ok) {
          setPreview(null);
          return;
        }
        setPreview(await res.json() as PreviewResponse);
      } catch {
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    },
    [tenantId],
  );

  useEffect(() => {
    if (!dirty || !draft) {
      setPreview(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void runPreview(draft);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [dirty, draft, runPreview]);

  const toggleFacility = (key: string) => {
    setDraft((prev) => {
      const base = prev ?? overview?.facilities ?? {};
      return { ...base, [key]: !(base[key] ?? true) };
    });
  };

  const invalidateSlotQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['brand-slot-overview', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-gallery-slots', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] }),
    ]);
  };

  const saveFacilities = async () => {
    if (!tenantId || !draft || saving) return;
    setSaving(true);
    setStatus('');
    try {
      const res = await fetchTenantBff(
        `/api/brand-context/${tenantId}/slot-catalog`,
        tenantId,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target: 'facilities',
            facilities: draft,
            sync_assignments: true,
          }),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        setStatusKind('error');
        setStatus(text || 'Tesis ayarları kaydedilemedi');
        return;
      }
      const data = await res.json() as {
        synced_disabled?: number;
        coverage_ok?: boolean;
      };
      setDraft(null);
      setPreview(null);
      setStatusKind('success');
      const synced = Number(data.synced_disabled ?? 0);
      setStatus(
        synced > 0
          ? `Kaydedildi — ${synced} slot tesis yüzünden kapatıldı`
          : 'Tesis ayarları kaydedildi',
      );
      await invalidateSlotQueries();
    } catch {
      setStatusKind('error');
      setStatus('Bağlantı hatası');
    } finally {
      setSaving(false);
      window.setTimeout(() => setStatus(''), 6000);
    }
  };

  const bootstrapDefaults = async () => {
    if (!tenantId || bootstrapping) return;
    setBootstrapping(true);
    setStatus('');
    try {
      const res = await fetchTenantBff(
        `/api/brand-context/${tenantId}/slot-catalog`,
        tenantId,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sector ? { sector_id: sector } : {}),
        },
      );
      if (!res.ok) {
        setStatusKind('error');
        setStatus('Varsayılan slotlar yüklenemedi');
        return;
      }
      setStatusKind('success');
      setStatus('Sektör varsayılan slotları yüklendi');
      setDraft(null);
      await invalidateSlotQueries();
    } catch {
      setStatusKind('error');
      setStatus('Bağlantı hatası');
    } finally {
      setBootstrapping(false);
      window.setTimeout(() => setStatus(''), 6000);
    }
  };

  if (overviewQuery.isLoading) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: t.textMuted }}>
        Tesis ve raf özeti yükleniyor…
      </p>
    );
  }

  if (overviewQuery.isError || !overview) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: t.warning }}>
        Tesis ayarları yüklenemedi. Python servisi çalışıyor mu?
      </p>
    );
  }

  const facilities = draft ?? overview.facilities;
  const recommendCount = preview?.recommended_disable_by_facility?.length
    ?? preview?.would_disable_by_facility?.length
    ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary }}>
        Tesis özellikleri
      </div>

      {overview.using_sector_defaults && overview.assignment_row_count === 0 && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 12,
            border: `1px solid ${t.separator}`,
            background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: t.textSecondary }}>
            Henüz markaya özel slot kaydı yok — sektör varsayılanları kullanılıyor.
          </p>
          <button
            type="button"
            disabled={bootstrapping}
            onClick={() => void bootstrapDefaults()}
            style={{
              minHeight: 44,
              padding: '10px 14px',
              borderRadius: 12,
              border: `1px solid ${t.separator}`,
              background: t.isDark ? 'rgba(255,255,255,0.06)' : '#fff',
              color: t.textPrimary,
              fontSize: 13,
              fontWeight: 700,
              cursor: bootstrapping ? 'wait' : 'pointer',
            }}
          >
            {bootstrapping ? 'Yükleniyor…' : 'Varsayılan slotları yükle'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visibleOptions.map((opt) => {
          const on = facilities[opt.key] !== false;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => toggleFacility(opt.key)}
              aria-pressed={on}
              style={{
                minHeight: 52,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 14,
                border: `1px solid ${on ? t.separator : t.accentBorder}`,
                background: on
                  ? (t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)')
                  : (t.isDark ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.08)'),
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>
                  {opt.label_tr}
                </div>
              </div>
              <div
                style={{
                  width: 50,
                  height: 28,
                  borderRadius: 14,
                  flexShrink: 0,
                  background: on ? t.accent : t.separator,
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 3,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: '#fff',
                    left: on ? 25 : 3,
                    transition: 'left 0.2s',
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {dirty && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 12,
            border: `1px solid ${t.accentBorder}`,
            background: t.isDark ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: t.textSecondary }}>
            {previewLoading
              ? 'Önizleme hesaplanıyor…'
              : recommendCount > 0
                ? `${recommendCount} slot tesis değişikliğiyle kapanacak / kapanması önerilir.`
                : 'Değişiklik kaydedildiğinde üretim seti güncellenir.'}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveFacilities()}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 12,
                border: 'none',
                background: t.accent,
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                cursor: saving ? 'wait' : 'pointer',
                opacity: saving ? 0.75 : 1,
              }}
            >
              {saving ? 'Kaydediliyor…' : 'Kaydet ve uygula'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setDraft({ ...overview.facilities });
                setPreview(null);
              }}
              style={{
                minHeight: 44,
                padding: '0 14px',
                borderRadius: 12,
                border: `1px solid ${t.separator}`,
                background: 'transparent',
                color: t.textSecondary,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {status && (
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: statusKind === 'error' ? t.danger : statusKind === 'success' ? t.success : t.textMuted,
          }}
        >
          {status}
        </p>
      )}

      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.textSecondary, marginBottom: 8 }}>
          7 raf özeti
          {overview.coverage && (
            <span style={{ fontWeight: 500, color: t.textMuted }}>
              {' · '}
              {overview.coverage.effective_enabled_count} etkin slot
              {!overview.coverage.ok ? ' · eksik format' : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(overview.shelves ?? []).map((shelf) => (
            <div
              key={shelf.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 12,
                border: `0.5px solid ${t.separator}`,
                minHeight: 44,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary }}>
                  {shelf.label_tr}
                </div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>
                  {shelf.format}
                  {shelf.facility_blocked_count > 0
                    ? ` · ${shelf.facility_blocked_count} tesis kapalı`
                    : ''}
                </div>
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: shelf.effective_count > 0 ? t.accent : t.textMuted,
                  flexShrink: 0,
                }}
              >
                {shelf.effective_count}/{shelf.catalog_count}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: 1, background: t.separator, margin: '2px 0' }} />
    </div>
  );
}
