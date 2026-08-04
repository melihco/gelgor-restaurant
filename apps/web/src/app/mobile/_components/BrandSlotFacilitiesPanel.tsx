'use client';

/**
 * Mobile Marka — tesis profili (chip grid) + kompakt raf özeti.
 * Platform admin UI değil; /mobile BrandConstitution (Tasarım → Şablon) altında.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchTenantBff } from '@/lib/bff-fetch';
import { OPT_IN_SLOT_FACILITIES } from '@/lib/sector-slot-pack';
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

const OPT_IN_SET = new Set<string>(OPT_IN_SLOT_FACILITIES as readonly string[]);

function FacilityGlyph({ name, color }: { name: string; color: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: color,
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'pool':
      return (
        <svg {...common}>
          <path d="M3 14c1.5 0 2.5-1 4-1s2.5 1 4 1 2.5-1 4-1 2.5 1 4 1" />
          <path d="M3 18c1.5 0 2.5-1 4-1s2.5 1 4 1 2.5-1 4-1 2.5 1 4 1" />
          <path d="M8 6.5c1.2 1.8 2.4 2.7 4 2.7s2.8-.9 4-2.7" />
        </svg>
      );
    case 'dj_stage':
      return (
        <svg {...common}>
          <circle cx="8.5" cy="13" r="3.2" />
          <circle cx="15.5" cy="13" r="3.2" />
          <path d="M11.7 13h.6" />
          <path d="M8.5 9.8V6.5h3.2" />
        </svg>
      );
    case 'full_menu':
      return (
        <svg {...common}>
          <path d="M5 5.5h4v13H5z" />
          <path d="M7 5.5V18.5" />
          <path d="M13 5.5h2.2c1.8 0 3.3 1.5 3.3 3.3S17 12 15.2 12H13z" />
          <path d="M13 12v6.5" />
        </svg>
      );
    case 'private_events':
      return (
        <svg {...common}>
          <path d="M5 19V9.5l7-4 7 4V19" />
          <path d="M9.5 19v-5.5h5V19" />
        </svg>
      );
    case 'live_music':
      return (
        <svg {...common}>
          <path d="M10 17.5a2.5 2.5 0 1 1-2.5-2.5" />
          <path d="M12.5 15V5.5l6 1.4V14" />
          <path d="M18.5 15.5a2.5 2.5 0 1 1-2.5-2.5" />
        </svg>
      );
    case 'hiring':
      return (
        <svg {...common}>
          <rect x="4" y="8" width="16" height="12" rx="2" />
          <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
          <path d="M4 13h16" />
        </svg>
      );
    case 'events_calendar':
      return (
        <svg {...common}>
          <rect x="4" y="6" width="16" height="14" rx="2" />
          <path d="M8 4v4M16 4v4M4 11h16" />
        </svg>
      );
    case 'wedding_photography':
      return (
        <svg {...common}>
          <path d="M4 8.5h3l1.2-2h7.6l1.2 2H20v10H4z" />
          <circle cx="12" cy="13" r="3.2" />
        </svg>
      );
    case 'bar':
      return (
        <svg {...common}>
          <path d="M8 4h8l-1.5 9H9.5L8 4z" />
          <path d="M10 13v5M14 13v5M9 18h6" />
        </svg>
      );
    case 'spa':
      return (
        <svg {...common}>
          <path d="M12 19c-4-3.2-6.5-6-6.5-9A4.2 4.2 0 0 1 12 6.2 4.2 4.2 0 0 1 18.5 10c0 3-2.5 5.8-6.5 9Z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7.5" />
          <path d="M12 8.5v5M12 15.8h.01" />
        </svg>
      );
  }
}

function FacilityChip({
  opt,
  on,
  t,
  onToggle,
}: {
  opt: FacilityOption;
  on: boolean;
  t: T;
  onToggle: () => void;
}) {
  const accent = on ? '#8AABBD' : t.textMuted;
  return (
    <button
      type="button"
      className="brand-facility-chip"
      data-on={on ? '1' : '0'}
      aria-pressed={on}
      onClick={onToggle}
      title={opt.hint_tr || opt.label_tr}
    >
      <span className="brand-facility-chip__icon" style={{ color: accent }}>
        <FacilityGlyph name={opt.key} color={accent} />
      </span>
      <span className="brand-facility-chip__text">
        <span className="brand-facility-chip__label" style={{ color: on ? t.textPrimary : t.textSecondary }}>
          {opt.label_tr}
        </span>
        {opt.hint_tr ? (
          <span className="brand-facility-chip__hint" style={{ color: t.textMuted }}>
            {opt.hint_tr}
          </span>
        ) : null}
      </span>
      <span
        className="brand-facility-chip__check"
        style={{
          background: on ? 'rgba(138,171,189,0.22)' : 'transparent',
          borderColor: on ? 'rgba(138,171,189,0.45)' : t.separator,
          color: on ? '#9DBECE' : 'transparent',
        }}
        aria-hidden
      >
        ✓
      </span>
    </button>
  );
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
  const [shelvesOpen, setShelvesOpen] = useState(false);

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
    for (const opt of overview?.facility_options ?? []) {
      if (!opt.enabled) keys.add(opt.key);
    }
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

  const { venueOptions, serviceOptions } = useMemo(() => {
    const venue: FacilityOption[] = [];
    const service: FacilityOption[] = [];
    for (const opt of visibleOptions) {
      if (OPT_IN_SET.has(opt.key)) service.push(opt);
      else venue.push(opt);
    }
    return { venueOptions: venue, serviceOptions: service };
  }, [visibleOptions]);

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
        Tesis profili yükleniyor…
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
  const activeCount = visibleOptions.filter((o) => facilities[o.key] !== false).length;
  const recommendCount = preview?.recommended_disable_by_facility?.length
    ?? preview?.would_disable_by_facility?.length
    ?? 0;
  const coverage = preview?.coverage ?? overview.coverage;

  return (
    <div className="brand-facilities-studio" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header className="brand-facilities-studio__head">
        <div>
          <div className="sa-chrome-eyebrow" style={{ marginBottom: 4 }}>Tesis profili</div>
        </div>
        <div
          className="brand-facilities-studio__stats"
          style={{
            background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
            borderColor: t.separator,
          }}
        >
          <span style={{ color: t.textPrimary }}>{activeCount}/{visibleOptions.length}</span>
          <span style={{ color: t.textMuted }}>özellik</span>
          <span className="brand-facilities-studio__dot" style={{ background: t.separator }} />
          <span style={{ color: coverage.ok ? '#8AABBD' : t.warning }}>
            {coverage.effective_enabled_count} slot
          </span>
        </div>
      </header>

      {overview.using_sector_defaults && overview.assignment_row_count === 0 && (
        <div
          style={{
            padding: '11px 12px',
            borderRadius: 14,
            border: `0.5px solid ${t.separator}`,
            background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, color: t.textSecondary }}>
            Markaya özel slot kaydı yok — sektör varsayılanları kullanılıyor.
          </p>
          <button
            type="button"
            disabled={bootstrapping}
            onClick={() => void bootstrapDefaults()}
            style={{
              minHeight: 44,
              borderRadius: 12,
              border: `0.5px solid ${t.separator}`,
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

      {venueOptions.length > 0 && (
        <div className="brand-facility-grid">
          {venueOptions.map((opt) => (
            <FacilityChip
              key={opt.key}
              opt={opt}
              on={facilities[opt.key] !== false}
              t={t}
              onToggle={() => toggleFacility(opt.key)}
            />
          ))}
        </div>
      )}

      {serviceOptions.length > 0 && (
        <div>
          <div className="sa-chrome-eyebrow" style={{ marginBottom: 8 }}>Ek hizmetler</div>
          <div className="brand-facility-grid">
            {serviceOptions.map((opt) => (
              <FacilityChip
                key={opt.key}
                opt={opt}
                on={facilities[opt.key] !== false}
                t={t}
                onToggle={() => toggleFacility(opt.key)}
              />
            ))}
          </div>
        </div>
      )}

      {dirty && (
        <div
          className="brand-facilities-studio__save"
          style={{
            borderColor: t.accentBorder,
            background: t.isDark ? 'rgba(90,160,214,0.12)' : 'rgba(90,160,214,0.08)',
          }}
        >
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, color: t.textSecondary }}>
            {previewLoading
              ? 'Hesaplanıyor…'
              : recommendCount > 0
                ? `${recommendCount} slot kapanacak`
                : 'Kaydetmek için onaylayın'}
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
                border: `0.5px solid ${t.separator}`,
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

      <div
        className="brand-shelf-summary"
        style={{
          borderColor: t.separator,
          background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.03)',
        }}
      >
        <button
          type="button"
          className="brand-shelf-summary__toggle"
          onClick={() => setShelvesOpen((v) => !v)}
          aria-expanded={shelvesOpen}
        >
          <span>
            <span style={{ fontWeight: 700, color: t.textPrimary }}>Raf özeti</span>
            <span style={{ color: t.textMuted, fontWeight: 500 }}>
              {' · '}
              {coverage.effective_enabled_count} etkin
              {!coverage.ok ? ' · eksik format' : ''}
            </span>
          </span>
          <span style={{ color: t.textMuted, fontSize: 12 }}>{shelvesOpen ? 'Gizle' : 'Detay'}</span>
        </button>

        {!shelvesOpen && (
          <div className="brand-shelf-rail" aria-hidden>
            {(overview.shelves ?? []).map((shelf) => {
              const pct = shelf.catalog_count > 0
                ? Math.round((shelf.effective_count / shelf.catalog_count) * 100)
                : 0;
              return (
                <div key={shelf.key} className="brand-shelf-rail__item">
                  <div className="brand-shelf-rail__label" style={{ color: t.textMuted }}>
                    {shelf.format}
                  </div>
                  <div
                    className="brand-shelf-rail__bar"
                    style={{ background: t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)' }}
                  >
                    <div
                      style={{
                        width: `${Math.max(pct, shelf.effective_count > 0 ? 12 : 0)}%`,
                        background: shelf.effective_count > 0 ? '#8AABBD' : t.separator,
                      }}
                    />
                  </div>
                  <div style={{ color: shelf.effective_count > 0 ? t.textPrimary : t.textMuted, fontWeight: 700, fontSize: 11 }}>
                    {shelf.effective_count}/{shelf.catalog_count}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {shelvesOpen && (
          <div className="brand-shelf-detail">
            {(overview.shelves ?? []).map((shelf) => (
              <div
                key={shelf.key}
                className="brand-shelf-detail__row"
                style={{ borderColor: t.separator }}
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
                    color: shelf.effective_count > 0 ? '#8AABBD' : t.textMuted,
                    flexShrink: 0,
                  }}
                >
                  {shelf.effective_count}/{shelf.catalog_count}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
