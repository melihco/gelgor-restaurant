'use client';

import React, { useEffect, useState } from 'react';
import type { T } from '@/app/mobile/_components/theme-context';
import { fetchTenantBff } from '@/lib/bff-fetch';
import {
  FAL_DESIGN_CHANNEL_LABELS,
  FAL_DESIGN_INTENSITY_LABELS,
  FAL_DESIGN_INTENSITY_LEVELS,
  resolveFalDesignIntensityConfig,
  type BrandFalDesignIntensityConfig,
  type FalDesignChannel,
  type FalDesignIntensityLevel,
} from '@/lib/fal-design-intensity';

type ThemeRecord = Record<string, unknown>;

export function BrandFalDesignIntensityPanel({
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
  const resolved = resolveFalDesignIntensityConfig(theme);
  const [local, setLocal] = useState<Required<BrandFalDesignIntensityConfig>>(resolved);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'success' | 'error' | 'info'>('info');

  useEffect(() => {
    setLocal(resolveFalDesignIntensityConfig(theme));
  }, [theme]);

  const saveLevel = async (channel: FalDesignChannel, level: FalDesignIntensityLevel) => {
    if (!tenantId || local[channel] === level) return;
    const next: Required<BrandFalDesignIntensityConfig> = {
      ...local,
      [channel]: level,
    };
    const prev = local;
    setLocal(next);
    setSaving(true);
    setStatus('');
    try {
      const res = await fetchTenantBff(
        `/api/brand-context/${tenantId}/theme/ai-settings`,
        tenantId,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ falDesignIntensity: next }),
        },
      );
      if (res.ok) {
        setStatusKind('success');
        setStatus('Tasarım yoğunluğu kaydedildi');
        onSaved?.();
      } else {
        setLocal(prev);
        setStatusKind('error');
        const errBody = await res.text().catch(() => '');
        setStatus(
          errBody.includes('422') || res.status === 422
            ? 'Kayıt reddedildi — marka teması henüz yüklenmedi, sayfayı yenileyin.'
            : 'Kayıt başarısız',
        );
      }
    } catch {
      setLocal(prev);
      setStatusKind('error');
      setStatus('Bağlantı hatası');
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(''), 3000);
    }
  };

  const themeReady = Boolean(
    theme?.workspaceId || theme?.workspace_id || theme?.derivedAt || theme?.derived_at,
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: t.textMuted }}>
        fal.ai tasarımlarında fotoğraf ile tipografi arasındaki dengeyi kanal bazında ayarlayın.
        Varsayılan <strong style={{ color: t.textSecondary }}>Dengeli</strong> mevcut üretim kalitesine karşılık gelir.
      </p>

      {!themeReady && (
        <p style={{ margin: 0, fontSize: 12, color: t.warning }}>
          Marka teması yükleniyor… Seçim yapmadan önce birkaç saniye bekleyin.
        </p>
      )}

      {(['story', 'reel', 'post'] as FalDesignChannel[]).map((channel) => (
        <div key={channel}>
          <p style={{
            fontSize: 11,
            fontWeight: 700,
            color: t.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            margin: '0 0 8px',
          }}
          >
            {FAL_DESIGN_CHANNEL_LABELS[channel]}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {FAL_DESIGN_INTENSITY_LEVELS.map((level) => {
              const meta = FAL_DESIGN_INTENSITY_LABELS[level];
              const selected = local[channel] === level;
              return (
                <button
                  key={level}
                  type="button"
                  disabled={saving || !themeReady}
                  onClick={() => void saveLevel(channel, level)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 12,
                    cursor: (saving || !themeReady) ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    background: selected
                      ? 'rgba(90,130,160,0.14)'
                      : (t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'),
                    border: `1px solid ${selected ? 'rgba(90,130,160,0.45)' : t.separator}`,
                    opacity: (saving || !themeReady) ? 0.6 : 1,
                  }}
                >
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
                    {meta.level}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: 'block',
                      fontSize: 13,
                      fontWeight: 600,
                      color: selected ? '#9DBECE' : t.textPrimary,
                    }}
                    >
                      {meta.tr}
                    </span>
                    <span style={{ display: 'block', fontSize: 11, color: t.textMuted, marginTop: 2 }}>
                      {meta.desc}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

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
