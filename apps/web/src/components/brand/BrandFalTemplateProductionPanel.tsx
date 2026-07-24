'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { T } from '@/app/mobile/_components/theme-context';
import { fetchTenantBff } from '@/lib/bff-fetch';
import {
  FAL_DESIGN_CHANNEL_LABELS,
  FAL_DESIGN_INTENSITY_LABELS,
  FAL_DESIGN_INTENSITY_LEVELS,
  type FalDesignChannel,
  type FalDesignIntensityLevel,
} from '@/lib/fal-design-intensity';
import {
  buildFalTemplateProductionPatch,
  FAL_TEMPLATE_BACKGROUND_LABELS,
  FAL_TEMPLATE_CONCURRENCY_OPTIONS,
  FAL_TEMPLATE_LOGO_LABELS,
  FAL_TEMPLATE_PREVIEW_CAP_OPTIONS,
  resolveFalTemplateProductionSettings,
  type BrandFalTemplateProductionConfig,
} from '@/lib/fal-template-production-settings';
import type { LogoTreatment, TypographyBackgroundStyle } from '@/types/brand-theme';
import { BrandChromeCombobox } from '@/components/brand/BrandChromeCombobox';

type ThemeRecord = Record<string, unknown>;

function ParamGroup({
  title,
  hint,
  t,
  children,
}: {
  title: string;
  /** @deprecated unused */
  hint?: string;
  t: T;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      borderRadius: 14,
      border: `0.5px solid ${t.separator}`,
      background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      padding: '14px 14px 12px',
    }}
    >
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

export function BrandFalTemplateProductionPanel({
  tenantId,
  theme,
  t,
  onSaved,
}: {
  tenantId: string;
  theme: ThemeRecord;
  t: T;
  /** Called after successful PATCH; receives saved theme when API returns it. */
  onSaved?: (theme?: ThemeRecord | null) => void;
}) {
  const resolved = resolveFalTemplateProductionSettings(theme);
  const [local, setLocal] = useState<BrandFalTemplateProductionConfig>(resolved);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'success' | 'error' | 'info'>('info');

  useEffect(() => {
    // Avoid clobbering in-flight optimistic edits while a PATCH is open.
    if (saving) return;
    setLocal(resolveFalTemplateProductionSettings(theme));
    // saving intentionally omitted: ending a save must not reset from a stale theme prop
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync from theme only
  }, [theme]);

  const persist = useCallback(async (next: BrandFalTemplateProductionConfig) => {
    if (!tenantId) return false;
    setSaving(true);
    setStatus('');
    try {
      const res = await fetchTenantBff(
        `/api/brand-context/${tenantId}/theme/ai-settings`,
        tenantId,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildFalTemplateProductionPatch(next)),
        },
      );
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as {
          theme?: ThemeRecord | null;
        } | null;
        if (data?.theme && typeof data.theme === 'object') {
          setLocal(resolveFalTemplateProductionSettings(data.theme));
        }
        setStatusKind('success');
        setStatus('Üretim parametreleri kaydedildi');
        onSaved?.(data?.theme ?? null);
        return true;
      }
      setStatusKind('error');
      setStatus(res.status === 422 ? 'Kayıt reddedildi — marka teması yüklenmedi.' : 'Kayıt başarısız');
      return false;
    } catch {
      setStatusKind('error');
      setStatus('Bağlantı hatası');
      return false;
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(''), 3500);
    }
  }, [tenantId, onSaved]);

  const update = async (patch: Partial<BrandFalTemplateProductionConfig>) => {
    const prev = local;
    const next: BrandFalTemplateProductionConfig = { ...local, ...patch };
    setLocal(next);
    const ok = await persist(next);
    if (!ok) setLocal(prev);
  };

  const updateIntensity = async (channel: FalDesignChannel, level: FalDesignIntensityLevel) => {
    if (local.intensity[channel] === level) return;
    await update({
      intensity: { ...local.intensity, [channel]: level },
    });
  };

  const intensityOptions = useMemo(
    () => FAL_DESIGN_INTENSITY_LEVELS.map((level) => {
      const meta = FAL_DESIGN_INTENSITY_LABELS[level];
      return {
        value: level,
        label: meta.tr,
        description: meta.desc,
        badge: meta.level,
      };
    }),
    [],
  );

  const backgroundOptions = useMemo(
    () => (Object.keys(FAL_TEMPLATE_BACKGROUND_LABELS) as TypographyBackgroundStyle[]).map((style) => {
      const meta = FAL_TEMPLATE_BACKGROUND_LABELS[style];
      return { value: style, label: meta.tr, description: meta.desc };
    }),
    [],
  );

  const logoOptions = useMemo(
    () => (Object.keys(FAL_TEMPLATE_LOGO_LABELS) as LogoTreatment[]).map((treatment) => {
      const meta = FAL_TEMPLATE_LOGO_LABELS[treatment];
      return { value: treatment, label: meta.tr, description: meta.desc };
    }),
    [],
  );

  const previewCapOptions = useMemo(
    () => FAL_TEMPLATE_PREVIEW_CAP_OPTIONS.map((cap) => ({
      value: String(cap),
      label: `${cap} önizleme`,
    })),
    [],
  );

  const concurrencyOptions = useMemo(
    () => FAL_TEMPLATE_CONCURRENCY_OPTIONS.map((c) => ({
      value: String(c),
      label: `${c}× paralel`,
    })),
    [],
  );

  const themeHydrated = Boolean(
    theme?.workspaceId || theme?.workspace_id || theme?.derivedAt || theme?.derived_at
    || theme?.falTemplateProduction || theme?.fal_template_production
    || theme?.falDesignIntensity || theme?.fal_design_intensity,
  );
  const controlsLocked = saving || !tenantId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!themeHydrated && (
        <p style={{ margin: 0, fontSize: 12, color: t.warning }}>
          Marka teması henüz tam yüklenmedi — seçimler yine de kaydedilir; ilk PATCH temayı oluşturur.
        </p>
      )}

      <ParamGroup
        title="Tasarım yoğunluğu"
        hint="Kanal bazlı tavan — slot bundan daha ağır olamaz"
        t={t}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(['story', 'reel', 'post'] as FalDesignChannel[]).map((channel) => (
            <BrandChromeCombobox
              key={channel}
              t={t}
              label={FAL_DESIGN_CHANNEL_LABELS[channel]}
              value={local.intensity[channel]}
              options={intensityOptions}
              disabled={controlsLocked}
              onChange={(level) => void updateIntensity(channel, level)}
            />
          ))}
        </div>
      </ParamGroup>

      <ParamGroup title="Görsel yüzey" hint="Galeri fotoğrafı yokken veya overlay tercihi" t={t}>
        <BrandChromeCombobox
          t={t}
          aria-label="Görsel yüzey"
          value={local.background_style}
          options={backgroundOptions}
          disabled={controlsLocked}
          onChange={(style) => void update({ background_style: style })}
        />
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 10,
          fontSize: 12,
          color: t.textSecondary,
          cursor: controlsLocked ? 'not-allowed' : 'pointer',
        }}
        >
          <input
            type="checkbox"
            checked={local.prefer_gallery_photo}
            disabled={controlsLocked}
            onChange={(e) => void update({ prefer_gallery_photo: e.target.checked })}
          />
          Galeri fotoğrafı varsa her zaman fotoğraf üstü kullan
        </label>
      </ParamGroup>

      <ParamGroup title="Logo" hint="Şablon önizlemelerinde logo davranışı" t={t}>
        <BrandChromeCombobox
          t={t}
          aria-label="Logo davranışı"
          value={local.logo_treatment}
          options={logoOptions}
          disabled={controlsLocked}
          onChange={(treatment) => void update({ logo_treatment: treatment })}
        />
      </ParamGroup>

      <ParamGroup title="Batch üretim" hint="Şablon seti oluştururken kullanılır" t={t}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <BrandChromeCombobox
            t={t}
            label="Önizleme sayısı"
            value={String(local.preview_cap)}
            options={previewCapOptions}
            disabled={controlsLocked}
            onChange={(cap) => void update({ preview_cap: Number(cap) })}
          />
          <BrandChromeCombobox
            t={t}
            label="Paralel üretim"
            value={String(local.concurrency)}
            options={concurrencyOptions}
            disabled={controlsLocked}
            onChange={(c) => void update({ concurrency: Number(c) })}
          />
        </div>
      </ParamGroup>

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
