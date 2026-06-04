'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deriveBrandTemplateLibrary,
  ensureBrandTemplateLibrary,
  listPosterTemplateOptions,
  listStoryTemplateOptions,
  patchLibrarySlot,
  type BrandTemplateLibrary,
  type BrandTemplateLibrarySlot,
} from '@/lib/brand-template-library';
import { parseMotionProfileFromTheme, type MotionStyle } from '@/lib/brand-motion-profile';
import { resolveKitForSector } from '@/lib/remotion-template-registry';
import { tenantKitSeed } from '@/lib/tenant-template-seed';

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
    onSuccess: async () => {
      setSaveMsg('Kütüphane kaydedildi ✓');
      queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['brand-readiness', workspaceId] });
      const palette = (theme as Record<string, unknown> | null)?.palette;
      if (workspaceId && !palette) {
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

  const isMobile = variant === 'mobile';
  const t = mobileTheme;
  const border = isMobile ? `0.5px solid ${t?.separator ?? 'rgba(255,255,255,0.1)'}` : '1px solid rgba(255,255,255,0.08)';
  const cardBg = isMobile
    ? (t?.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)')
    : 'rgba(255,255,255,0.02)';

  const content = (
    <>
      <div style={{ marginBottom: 14, fontSize: 12, lineHeight: 1.6, color: isMobile ? t?.textTertiary : 'rgb(100,116,139)' }}>
        Feed, story (Remotion MP4) ve kampanya post üretimi bu 5 slottan seçer. Motion stili Marka Anayasası → Motion Stili kartından gelir. Kaydetmeden üretime yansımaz.
        {draft?.locked && (
          <span style={{ display: 'block', marginTop: 6, color: isMobile ? t?.accent : '#a78bfa', fontWeight: 600 }}>
            Özel kütüphane aktif (operatör düzenlemesi)
          </span>
        )}
      </div>

      {isLoading || !draft ? (
        <p style={{ fontSize: 12, opacity: 0.6 }}>Yükleniyor…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {draft.slots.map((slot) => {
            const options = slot.format === 'post'
              ? listPosterTemplateOptions(sector, slot.key)
              : listStoryTemplateOptions(sector, slot.key);
            const value = slotTemplateId(slot);

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
                    <div style={{ fontSize: 13, fontWeight: 700, color: isMobile ? t?.textPrimary : '#f1f5f9' }}>
                      {slot.slot}. {slot.labelTr}
                    </div>
                    <div style={{ fontSize: 11, color: isMobile ? t?.textMuted : '#64748b', marginTop: 2 }}>
                      {slot.format === 'post' ? 'Feed post (PNG)' : 'Story (MP4)'}
                      {' · '}
                      {slot.useCase}
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: isMobile ? t?.textMuted : '#94a3b8', flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={slot.enabled}
                      onChange={(e) => updateSlot(slot.key, { enabled: e.target.checked })}
                    />
                    Aktif
                  </label>
                </div>

                <select
                  value={value}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (slot.format === 'post') {
                      updateSlot(slot.key, { posterTemplateId: id });
                    } else {
                      updateSlot(slot.key, { storyTemplateId: id });
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
                  {options.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label} · {opt.family}
                    </option>
                  ))}
                </select>

                <a
                  href={`/remotion-showcase?kit=${encodeURIComponent(kitId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: isMobile ? t?.accent : '#a78bfa',
                    textDecoration: 'none',
                  }}
                >
                  Showcase’de önizle →
                </a>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
        <button
          type="button"
          disabled={!draft || saveMutation.isPending}
          onClick={() => draft && saveMutation.mutate({ ...draft, locked: true })}
          style={{
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
    </>
  );

  if (isMobile && t) {
    return (
      <div
        style={{
          borderRadius: 16,
          border,
          padding: 16,
          background: t.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, color: t.textPrimary, marginBottom: 4 }}>
          Template Kütüphanesi (5)
        </div>
        {content}
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
