'use client';

import React, { useCallback, useEffect, useState } from 'react';
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

type ThemeRecord = Record<string, unknown>;

function ParamGroup({
  title,
  hint,
  t,
  children,
}: {
  title: string;
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
        {hint && (
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 3, lineHeight: 1.45 }}>{hint}</div>
        )}
      </div>
      {children}
    </div>
  );
}

function OptionButton({
  selected,
  disabled,
  onClick,
  title,
  subtitle,
  badge,
  t,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  badge?: string | number;
  t: T;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '10px 12px',
        borderRadius: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left',
        background: selected
          ? 'rgba(90,130,160,0.14)'
          : (t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'),
        border: `1px solid ${selected ? 'rgba(90,130,160,0.45)' : t.separator}`,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {badge != null && (
        <span style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 800,
          color: selected ? '#9DBECE' : t.textMuted,
          background: selected ? 'rgba(90,130,160,0.2)' : 'transparent',
          border: `1px solid ${selected ? 'rgba(90,130,160,0.35)' : t.separator}`,
        }}
        >
          {badge}
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block',
          fontSize: 13,
          fontWeight: 600,
          color: selected ? '#9DBECE' : t.textPrimary,
        }}
        >
          {title}
        </span>
        {subtitle && (
          <span style={{ display: 'block', fontSize: 11, color: t.textMuted, marginTop: 2 }}>
            {subtitle}
          </span>
        )}
      </span>
    </button>
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
  onSaved?: () => void;
}) {
  const resolved = resolveFalTemplateProductionSettings(theme);
  const [local, setLocal] = useState<BrandFalTemplateProductionConfig>(resolved);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'success' | 'error' | 'info'>('info');

  useEffect(() => {
    setLocal(resolveFalTemplateProductionSettings(theme));
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
        setStatusKind('success');
        setStatus('Üretim parametreleri kaydedildi');
        onSaved?.();
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

  const themeReady = Boolean(
    theme?.workspaceId || theme?.workspace_id || theme?.derivedAt || theme?.derived_at,
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: t.textMuted }}>
        fal.ai şablon üretimi ve mission tasarımları bu parametrelere göre çalışır.
        Değişiklikler bir sonraki <strong style={{ color: t.textSecondary }}>Yeniden üret</strong>
        {' '}veya mission üretiminde uygulanır.
      </p>

      {!themeReady && (
        <p style={{ margin: 0, fontSize: 12, color: t.warning }}>
          Marka teması yükleniyor…
        </p>
      )}

      <ParamGroup
        title="Tasarım yoğunluğu"
        hint="Fotoğraf ile tipografi dengesi — kanal bazında"
        t={t}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(['story', 'reel', 'post'] as FalDesignChannel[]).map((channel) => (
            <div key={channel}>
              <p style={{
                fontSize: 10,
                fontWeight: 700,
                color: t.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                margin: '0 0 6px',
              }}
              >
                {FAL_DESIGN_CHANNEL_LABELS[channel]}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {FAL_DESIGN_INTENSITY_LEVELS.map((level) => {
                  const meta = FAL_DESIGN_INTENSITY_LABELS[level];
                  return (
                    <OptionButton
                      key={level}
                      t={t}
                      selected={local.intensity[channel] === level}
                      disabled={saving || !themeReady}
                      badge={meta.level}
                      title={meta.tr}
                      subtitle={meta.desc}
                      onClick={() => void updateIntensity(channel, level)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ParamGroup>

      <ParamGroup title="Görsel yüzey" hint="Galeri fotoğrafı yokken veya overlay tercihi" t={t}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(Object.keys(FAL_TEMPLATE_BACKGROUND_LABELS) as TypographyBackgroundStyle[]).map((style) => {
            const meta = FAL_TEMPLATE_BACKGROUND_LABELS[style];
            return (
              <OptionButton
                key={style}
                t={t}
                selected={local.background_style === style}
                disabled={saving || !themeReady}
                title={meta.tr}
                subtitle={meta.desc}
                onClick={() => void update({ background_style: style })}
              />
            );
          })}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 8,
            fontSize: 12,
            color: t.textSecondary,
            cursor: (saving || !themeReady) ? 'not-allowed' : 'pointer',
          }}
          >
            <input
              type="checkbox"
              checked={local.prefer_gallery_photo}
              disabled={saving || !themeReady}
              onChange={(e) => void update({ prefer_gallery_photo: e.target.checked })}
            />
            Galeri fotoğrafı varsa her zaman fotoğraf üstü kullan
          </label>
        </div>
      </ParamGroup>

      <ParamGroup title="Logo" hint="Şablon önizlemelerinde logo davranışı" t={t}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(Object.keys(FAL_TEMPLATE_LOGO_LABELS) as LogoTreatment[]).map((treatment) => {
            const meta = FAL_TEMPLATE_LOGO_LABELS[treatment];
            return (
              <OptionButton
                key={treatment}
                t={t}
                selected={local.logo_treatment === treatment}
                disabled={saving || !themeReady}
                title={meta.tr}
                subtitle={meta.desc}
                onClick={() => void update({ logo_treatment: treatment })}
              />
            );
          })}
        </div>
      </ParamGroup>

      <ParamGroup title="Batch üretim" hint="Şablon seti oluştururken kullanılır" t={t}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: t.textMuted, margin: '0 0 6px' }}>
              Önizleme sayısı
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {FAL_TEMPLATE_PREVIEW_CAP_OPTIONS.map((cap) => (
                <button
                  key={cap}
                  type="button"
                  disabled={saving || !themeReady}
                  onClick={() => void update({ preview_cap: cap })}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: (saving || !themeReady) ? 'not-allowed' : 'pointer',
                    border: `1px solid ${local.preview_cap === cap ? t.accentBorder : t.separator}`,
                    background: local.preview_cap === cap
                      ? (t.isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.1)')
                      : 'transparent',
                    color: local.preview_cap === cap ? t.accent : t.textMuted,
                  }}
                >
                  {cap}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: t.textMuted, margin: '0 0 6px' }}>
              Paralel üretim
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {FAL_TEMPLATE_CONCURRENCY_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={saving || !themeReady}
                  onClick={() => void update({ concurrency: c })}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: (saving || !themeReady) ? 'not-allowed' : 'pointer',
                    border: `1px solid ${local.concurrency === c ? t.accentBorder : t.separator}`,
                    background: local.concurrency === c
                      ? (t.isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.1)')
                      : 'transparent',
                    color: local.concurrency === c ? t.accent : t.textMuted,
                  }}
                >
                  {c}×
                </button>
              ))}
            </div>
          </div>
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
