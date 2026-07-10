'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deriveBrandTemplateLibrary,
  ensureBrandTemplateLibrary,
  listPosterTemplateOptions,
  listStoryTemplateOptions,
  patchLibrarySlot,
  defaultSlotTypographyPatch,
  type BrandTemplateLibrary,
  type BrandTemplateLibrarySlot,
} from '@/lib/brand-template-library';
import {
  FONT_PERSONALITY_LABELS_TR,
  HEADING_FONT_PICKER_OPTIONS,
  SLOT_FONT_MODE_LABELS,
  slotTypographyPreviewLabel,
  type SlotFontMode,
} from '@/lib/brand-template-slot-typography';
import { resolveBrandProductionTokens } from '@/lib/brand-production-tokens';
import type { MotionStyle } from '@/lib/brand-motion-profile';
import { resolveKitForSector } from '@/lib/remotion-template-registry';
import { tenantKitSeed } from '@/lib/tenant-template-seed';
import { TemplateSlotPreviewModal } from '@/components/brand/TemplateSlotPreviewModal';
import { TemplateColorBehaviorPreview } from '@/components/brand/TemplateColorBehaviorPreview';

type Variant = 'mobile' | 'desktop';

interface BrandTemplateLibraryPanelProps {
  workspaceId: string | null | undefined;
  sector: string;
  variant?: Variant;
  /** Mobile theme tokens from BrandConstitution */
  mobileTheme?: {
    accent: string;
    accentBorder: string;
    accentDim: string;
    separator: string;
    textPrimary: string;
    textMuted: string;
    textTertiary: string;
    isDark: boolean;
  };
}

function slotTemplateId(slot: BrandTemplateLibrarySlot): string {
  return slot.format === 'post' ? (slot.posterTemplateId ?? '') : (slot.storyTemplateId ?? '');
}

function optionLabelFor(options: { id: string; label: string }[], id: string): string {
  return options.find((o) => o.id === id)?.label ?? (id || 'Şablon seç…');
}

export function BrandTemplateLibraryPanel({
  workspaceId,
  sector,
  variant = 'desktop',
  mobileTheme,
}: BrandTemplateLibraryPanelProps) {
  const queryClient = useQueryClient();
  const kitId = resolveKitForSector(sector, tenantKitSeed(workspaceId ?? undefined));
  const [draft, setDraft] = useState<BrandTemplateLibrary | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [previewSlot, setPreviewSlot] = useState<BrandTemplateLibrarySlot | null>(null);
  const [expandedSlotKey, setExpandedSlotKey] = useState<string | null>(null);

  const { data: themePayload, isLoading } = useQuery({
    queryKey: ['brand-theme-kit', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;
      const r = await fetch(`/api/brand-context/${workspaceId}/theme`, {
        headers: { 'X-Tenant-Id': workspaceId },
      });
      if (!r.ok) return null;
      return r.json() as Promise<{ theme?: Record<string, unknown> | null }>;
    },
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
  });

  const { data: brandPreview } = useQuery({
    queryKey: ['brand-template-library-preview-tokens', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;
      const [ctxRes, themeRes] = await Promise.all([
        fetch(`/api/brand-context-data/${workspaceId}`, {
          headers: { 'X-Tenant-Id': workspaceId },
        }),
        fetch(`/api/brand-context/${workspaceId}/theme`, {
          headers: { 'X-Tenant-Id': workspaceId },
        }),
      ]);
      const ctx = ctxRes.ok ? await ctxRes.json() : {};
      const themePayload = themeRes.ok ? await themeRes.json() : {};
      return resolveBrandProductionTokens({
        brandContext: ctx as Record<string, unknown>,
        brandTheme: (themePayload.theme ?? null) as Record<string, unknown> | null,
        sector,
      });
    },
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
  });

  const theme = themePayload?.theme ?? null;
  const motionStyle = useMemo(() => {
    const motionRaw = (theme?.motion_profile ?? theme?.motionProfile) as Record<string, unknown> | undefined;
    return String(motionRaw?.motion_style ?? motionRaw?.motionStyle ?? 'editorial') as MotionStyle;
  }, [theme]);

  const baseline = useMemo(() => {
    if (!workspaceId) return null;
    return ensureBrandTemplateLibrary(theme, { sector, kitId, motionStyle, tenantId: workspaceId ?? undefined });
  }, [workspaceId, theme, sector, kitId, motionStyle]);

  useEffect(() => {
    if (baseline) setDraft(baseline);
  }, [baseline]);

  const isMobile = variant === 'mobile';
  const t = mobileTheme;

  useEffect(() => {
    if (!isMobile || !draft?.slots.length) return;
    setExpandedSlotKey((prev) => {
      if (prev && draft.slots.some((s) => s.key === prev)) return prev;
      return draft.slots[0]?.key ?? null;
    });
  }, [isMobile, draft?.slots]);

  const saveMutation = useMutation({
    mutationFn: async (library: BrandTemplateLibrary) => {
      if (!workspaceId) throw new Error('Workspace yok');
      const current = (theme ?? {}) as Record<string, unknown>;
      const res = await fetch(`/api/brand-context/${workspaceId}/theme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': workspaceId },
        body: JSON.stringify({
          theme: {
            ...current,
            template_library: { ...library, locked: true },
          },
        }),
      });
      if (!res.ok) throw new Error('Kayıt başarısız');
      return res.json();
    },
    onSuccess: async (_data, savedLibrary) => {
      setSaveMsg('Kütüphane kaydedildi ✓');
      queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['brand-readiness', workspaceId] });
      const palette = (theme as Record<string, unknown> | null)?.palette;
      const libraryWasLocked = Boolean(savedLibrary?.locked);
      if (workspaceId && !palette && !libraryWasLocked) {
        try {
          await fetch(`/api/brand-context/${workspaceId}/theme/derive`, {
            method: 'POST',
            headers: { 'X-Tenant-Id': workspaceId },
          });
          queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', workspaceId] });
          queryClient.invalidateQueries({ queryKey: ['brand-readiness', workspaceId] });
        } catch {
          /* theme derive is best-effort */
        }
      }
      setTimeout(() => setSaveMsg(null), 2500);
    },
    onError: () => setSaveMsg('Kayıt hatası'),
  });

  const updateSlot = useCallback((slotKey: string, patch: Parameters<typeof patchLibrarySlot>[2]) => {
    setDraft((prev) => (prev ? patchLibrarySlot(prev, slotKey, patch) : prev));
  }, []);

  const resetToAuto = useCallback(() => {
    const next = deriveBrandTemplateLibrary({ kitId, sector, motionStyle, tenantId: workspaceId ?? undefined });
    setDraft(next);
  }, [kitId, sector, motionStyle]);

  if (!workspaceId) {
    return <p style={{ fontSize: 12, opacity: 0.6 }}>Marka seçilmedi</p>;
  }

  const border = isMobile ? `0.5px solid ${t?.separator ?? 'rgba(255,255,255,0.1)'}` : '1px solid rgba(255,255,255,0.08)';
  const cardBg = isMobile
    ? (t?.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)')
    : 'rgba(255,255,255,0.02)';

  const enabledCount = draft?.slots.filter((s) => s.enabled).length ?? 0;

  const saveBar = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <button
        type="button"
        disabled={!draft || saveMutation.isPending}
        onClick={() => draft && saveMutation.mutate({ ...draft, locked: true })}
        style={{
          flex: isMobile ? 1 : undefined,
          minWidth: isMobile ? 0 : undefined,
          padding: '10px 16px',
          borderRadius: 10,
          border: 'none',
          cursor: saveMutation.isPending ? 'wait' : 'pointer',
          background: isMobile ? (t?.accent ?? '#7c3aed') : 'rgba(99,102,241,0.85)',
          color: '#fff',
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        {saveMutation.isPending ? 'Kaydediliyor…' : 'Kütüphaneyi kaydet'}
      </button>
      <button
        type="button"
        onClick={resetToAuto}
        style={{
          padding: '10px 16px',
          borderRadius: 10,
          cursor: 'pointer',
          background: 'transparent',
          border,
          color: isMobile ? t?.textMuted : '#94a3b8',
          fontSize: 13,
        }}
      >
        Sektöre göre sıfırla
      </button>
      {saveMsg && (
        <span style={{ fontSize: 12, color: isMobile ? t?.accent : '#86efac', alignSelf: 'center' }}>
          {saveMsg}
        </span>
      )}
    </div>
  );

  const renderSlotControls = (slot: BrandTemplateLibrarySlot, options: { id: string; label: string; tier?: string; group?: string }[]) => {
    const value = slotTemplateId(slot);
    return (
      <>
        <select
          value={value}
          onChange={(e) => {
            const id = e.target.value;
            const typoPatch = defaultSlotTypographyPatch(id, slot.format);
            if (slot.format === 'post') {
              updateSlot(slot.key, { posterTemplateId: id, ...typoPatch });
            } else {
              updateSlot(slot.key, { storyTemplateId: id, ...typoPatch });
            }
          }}
          style={{
            width: '100%',
            padding: '9px 10px',
            borderRadius: 10,
            border,
            background: isMobile ? (t?.isDark ? 'rgba(0,0,0,0.2)' : '#fff') : 'rgba(0,0,0,0.25)',
            color: isMobile ? t?.textPrimary : '#e2e8f0',
            fontSize: 12,
            marginBottom: 8,
          }}
        >
          {slot.format === 'post' ? (
            (() => {
              const sectorOpts = options.filter((o) => o.tier === 'sector');
              const rest = options.filter((o) => o.tier !== 'sector');
              return (
                <>
                  {sectorOpts.length > 0 ? (
                    <optgroup label="⭐ Sektör vibe seçkisi">
                      {sectorOpts.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </optgroup>
                  ) : null}
                  {rest.length > 0 ? (
                    <optgroup label={sectorOpts.length ? 'Diğer post şablonları' : 'Post şablonları'}>
                      {rest.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </optgroup>
                  ) : null}
                </>
              );
            })()
          ) : (
            (() => {
              const sectorOpts = options.filter((o) => o.tier === 'sector');
              const agencyOpts = options.filter((o) => o.tier === 'agency');
              const polaroid = options.filter((o) => o.group?.startsWith('Polaroid') && o.tier === 'default');
              const other = options.filter(
                (o) => o.tier === 'default' && !o.group?.startsWith('Polaroid'),
              );
              return (
                <>
                  {sectorOpts.length > 0 ? (
                    <optgroup label="⭐ Sektör vibe seçkisi">
                      {sectorOpts.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </optgroup>
                  ) : null}
                  {agencyOpts.length > 0 ? (
                    <optgroup label="⭐ Ajans seçkisi">
                      {agencyOpts.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </optgroup>
                  ) : null}
                  {polaroid.length > 0 ? (
                    <optgroup label="Polaroid">
                      {polaroid.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </optgroup>
                  ) : null}
                  {other.length > 0 ? (
                    <optgroup label="Ajans kataloğu (diğer)">
                      {other.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </optgroup>
                  ) : null}
                </>
              );
            })()
          )}
        </select>

        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: isMobile ? t?.textMuted : '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Tipografi
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(['template', 'brand', 'custom'] as SlotFontMode[]).map((mode) => {
              const active = (slot.fontMode ?? 'template') === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateSlot(slot.key, { fontMode: mode })}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 999,
                    border: `1px solid ${active ? (isMobile ? t?.accent : '#a78bfa') : border}`,
                    background: active ? (isMobile ? t?.accentDim : 'rgba(167,139,250,0.15)') : 'transparent',
                    color: active ? (isMobile ? t?.accent : '#e9d5ff') : (isMobile ? t?.textMuted : '#94a3b8'),
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {SLOT_FONT_MODE_LABELS[mode]}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: isMobile ? t?.textTertiary : '#64748b' }}>
            {slotTypographyPreviewLabel(slot)}
            {slot.fontPersonality && (slot.fontMode ?? 'template') === 'template' && (
              <span> · {FONT_PERSONALITY_LABELS_TR[slot.fontPersonality] ?? slot.fontPersonality}</span>
            )}
          </div>
          {(slot.fontMode ?? 'template') === 'custom' && (
            <select
              value={slot.headingFont ?? ''}
              onChange={(e) => updateSlot(slot.key, { headingFont: e.target.value, fontMode: 'custom' })}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 10,
                border,
                background: isMobile ? (t?.isDark ? 'rgba(0,0,0,0.2)' : '#fff') : 'rgba(0,0,0,0.25)',
                color: isMobile ? t?.textPrimary : '#e2e8f0',
                fontSize: 12,
              }}
            >
              <option value="">Başlık fontu seç…</option>
              {HEADING_FONT_PICKER_OPTIONS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          )}
        </div>

        <TemplateColorBehaviorPreview
          templateId={slot.format === 'post' ? undefined : slot.storyTemplateId}
          posterTemplateId={slot.format === 'post' ? slot.posterTemplateId : undefined}
          tokens={brandPreview ?? undefined}
          isMobile={isMobile}
          theme={t}
        />

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 4,
            fontSize: 11,
            color: isMobile ? t?.textMuted : '#94a3b8',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={slot.showLogo !== false}
            onChange={(e) => updateSlot(slot.key, { showLogo: e.target.checked })}
          />
          Logo göster (Marka Detayı logosu)
        </label>

        <button
          type="button"
          onClick={() => setPreviewSlot(slot)}
          style={{
            marginTop: 8,
            padding: 0,
            border: 'none',
            background: 'transparent',
            fontSize: 11,
            fontWeight: 600,
            color: isMobile ? t?.accent : '#a78bfa',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          Önizle →
        </button>
      </>
    );
  };

  const content = (
    <>
      <div style={{ marginBottom: 14, fontSize: 12, lineHeight: 1.6, color: isMobile ? t?.textTertiary : 'rgb(100,116,139)' }}>
        {isMobile ? (
          <>
            <span style={{ fontWeight: 600, color: t?.textMuted }}>
              {enabledCount}/{draft?.slots.length ?? 5} slot aktif
            </span>
            {' · '}
            Feed, story (Remotion) ve kampanya post üretimi bu slotlardan seçer. Kaydetmeden üretime yansımaz.
          </>
        ) : (
          <>
            Feed, story (Remotion MP4) ve kampanya post üretimi bu 5 slottan seçer. Font modu “Marka fontu” ise Remotion video, Marka Detayı’ndaki seçili font/post font standardıyla render alır; “Şablon fontu” seçilirse template kendi fontunu korur. Kaydetmeden üretime yansımaz.
          </>
        )}
        {draft?.locked && (
          <span style={{ display: 'block', marginTop: 6, color: isMobile ? t?.accent : '#a78bfa', fontWeight: 600 }}>
            Özel kütüphane aktif (operatör düzenlemesi)
          </span>
        )}
      </div>

      {isLoading || !draft ? (
        <p style={{ fontSize: 12, opacity: 0.6 }}>Yükleniyor…</p>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 88 }}>
          {draft.slots.map((slot) => {
            const options = slot.format === 'post'
              ? listPosterTemplateOptions(sector, slot.key)
              : listStoryTemplateOptions(sector, slot.key);
            const expanded = expandedSlotKey === slot.key;
            const templateName = optionLabelFor(options, slotTemplateId(slot));
            const formatLabel = slot.format === 'post' ? 'Post' : 'Story';

            return (
              <div
                key={slot.key}
                style={{
                  borderRadius: 14,
                  border,
                  background: cardBg,
                  opacity: slot.enabled ? 1 : 0.55,
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => setExpandedSlotKey(expanded ? null : slot.key)}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: 'none',
                    background: expanded ? (t?.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)') : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, color: t?.textMuted,
                          width: 20, height: 20, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          background: t?.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                        }}>
                          {slot.slot}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: t?.textPrimary, letterSpacing: '-0.02em' }}>
                          {slot.labelTr}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                          color: slot.format === 'post' ? '#2563eb' : '#9333ea',
                          background: slot.format === 'post' ? 'rgba(37,99,235,0.12)' : 'rgba(147,51,234,0.12)',
                        }}>
                          {formatLabel}
                        </span>
                      </div>
                      <div style={{
                        fontSize: 12, color: t?.textMuted, marginTop: 5, marginLeft: 28,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {templateName}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <label
                        onClick={(e) => e.stopPropagation()}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: t?.textMuted }}
                      >
                        <input
                          type="checkbox"
                          checked={slot.enabled}
                          onChange={(e) => updateSlot(slot.key, { enabled: e.target.checked })}
                        />
                        Aktif
                      </label>
                      <span style={{
                        fontSize: 14, color: t?.textTertiary, transform: expanded ? 'rotate(90deg)' : 'none',
                        transition: 'transform 0.15s ease',
                      }}>
                        ›
                      </span>
                    </div>
                  </div>
                </button>

                {expanded && (
                  <div style={{ padding: '0 14px 14px', borderTop: border }}>
                    <div style={{ fontSize: 11, color: t?.textMuted, margin: '10px 0 8px' }}>
                      {slot.format === 'post' ? 'Feed post (PNG)' : 'Story (MP4)'} · {slot.useCase}
                    </div>
                    {renderSlotControls(slot, options)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {draft.slots.map((slot) => {
            const options = slot.format === 'post'
              ? listPosterTemplateOptions(sector, slot.key)
              : listStoryTemplateOptions(sector, slot.key);

            return (
              <div
                key={slot.key}
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  border,
                  background: cardBg,
                  opacity: slot.enabled ? 1 : 0.55,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>
                      {slot.slot}. {slot.labelTr}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      {slot.format === 'post' ? 'Feed post (PNG)' : 'Story (MP4)'}
                      {' · '}
                      {slot.useCase}
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={slot.enabled}
                      onChange={(e) => updateSlot(slot.key, { enabled: e.target.checked })}
                    />
                    Aktif
                  </label>
                </div>
                {renderSlotControls(slot, options)}
              </div>
            );
          })}
        </div>
      )}

      {!isMobile && (
        <div style={{ marginTop: 16 }}>
          {saveBar}
        </div>
      )}
      {previewSlot && draft && (
        <TemplateSlotPreviewModal
          open
          onClose={() => setPreviewSlot(null)}
          workspaceId={workspaceId}
          kitId={kitId}
          slot={draft.slots.find((s) => s.key === previewSlot.key) ?? previewSlot}
          previewLibrary={draft}
          isMobile={isMobile}
          theme={t}
        />
      )}
    </>
  );

  if (isMobile && t) {
    return (
      <div style={{ position: 'relative' }}>
        {content}
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            zIndex: 20,
            marginTop: 8,
            padding: '12px 0 calc(12px + env(safe-area-inset-bottom, 0px))',
            borderTop: border,
            background: t.isDark ? 'rgba(18,18,20,0.92)' : 'rgba(255,255,255,0.94)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          {saveBar}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel-v2 overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.06]">
        <p className="text-[13px] font-semibold text-white">Template Kütüphanesi (5)</p>
        <p className="mt-0.5 text-[11px] text-slate-600">
          Marka feed & story üretim standardı — Mission Hub bu slotları kullanır
        </p>
      </div>
      <div className="p-4">{content}</div>
    </div>
  );
}
