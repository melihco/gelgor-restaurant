'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
import { BrandChromeCombobox } from '@/components/brand/BrandChromeCombobox';

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
  onSaved?: (theme?: ThemeRecord | null) => void;
}) {
  const resolved = resolveFalDesignIntensityConfig(theme);
  const [local, setLocal] = useState<Required<BrandFalDesignIntensityConfig>>(resolved);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'success' | 'error' | 'info'>('info');

  useEffect(() => {
    if (saving) return;
    setLocal(resolveFalDesignIntensityConfig(theme));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync from theme only
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
        const data = (await res.json().catch(() => null)) as {
          theme?: ThemeRecord | null;
        } | null;
        if (data?.theme && typeof data.theme === 'object') {
          setLocal(resolveFalDesignIntensityConfig(data.theme));
        }
        setStatusKind('success');
        setStatus('Tasarım yoğunluğu kaydedildi');
        onSaved?.(data?.theme ?? null);
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

  const controlsLocked = saving || !tenantId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {(['story', 'reel', 'post'] as FalDesignChannel[]).map((channel) => (
        <BrandChromeCombobox
          key={channel}
          t={t}
          label={FAL_DESIGN_CHANNEL_LABELS[channel]}
          value={local[channel]}
          options={intensityOptions}
          disabled={controlsLocked}
          onChange={(level) => void saveLevel(channel, level)}
        />
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
