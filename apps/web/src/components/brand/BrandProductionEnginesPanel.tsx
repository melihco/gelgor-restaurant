'use client';

import React, { useState } from 'react';
import {
  defaultProductionEngines,
  type BrandProductionEnginesConfig,
} from '@/lib/brand-production-engines';
import type { T } from '@/app/mobile/_components/theme-context';

type ThemeRecord = Record<string, unknown>;

function readEngines(theme: ThemeRecord): BrandProductionEnginesConfig {
  const raw = (theme.production_engines ?? theme.productionEngines) as
    Partial<BrandProductionEnginesConfig> | undefined;
  const defaults = defaultProductionEngines();
  if (!raw) return defaults;
  return {
    fal: { ...defaults.fal, ...raw.fal },
    satori: { ...defaults.satori, ...raw.satori },
    showcase: { ...defaults.showcase!, ...raw.showcase },
    throughput: {
      factory_drain_batch: raw.throughput?.factory_drain_batch ?? defaults.throughput?.factory_drain_batch,
    },
  };
}

export function BrandProductionEnginesPanel({
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
  const engines = readEngines(theme);
  const [saving, setSaving] = useState(false);

  const save = async (next: BrandProductionEnginesConfig) => {
    if (!tenantId) return;
    setSaving(true);
    try {
      await fetch(`/api/brand-context/${tenantId}/theme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
        body: JSON.stringify({
          theme: {
            ...theme,
            production_engines: next,
            productionEngines: next,
          },
        }),
      });
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const savePatch = (patch: Partial<BrandProductionEnginesConfig>) => {
    void save({
      ...engines,
      ...patch,
      fal: { ...engines.fal, ...patch.fal },
      satori: { ...engines.satori, ...patch.satori },
      showcase: { ...engines.showcase!, ...patch.showcase },
      throughput: { ...engines.throughput, ...patch.throughput },
    });
  };

  const toggleStyle = (on: boolean, color = t.accent) => ({
    width: 44, height: 26, borderRadius: 13, border: 'none',
    cursor: saving ? 'default' : 'pointer',
    background: on ? color : t.separator,
    position: 'relative' as const,
    opacity: saving ? 0.7 : 1,
  });

  return (
    <div>
      <div style={{ fontSize: 12, color: t.textTertiary, lineHeight: 1.6, marginBottom: 16 }}>
        Aktif: <strong>Satori</strong> (lokal tipografi), Mission Hub vitrin ve üretim hızı.
        Şablon seçimi Template Kütüphanesi&apos;nden; FAL motor varsayılanları sistemde sabit.
      </div>

      {/* Satori local typography */}
      <div style={{ fontSize: 11, color: t.labelColor, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        Satori — Lokal Tipografi
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px', borderRadius: 12, marginBottom: 14,
        border: `0.5px solid ${t.separator}`,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>Story & tipografi slotları</div>
        </div>
        <button
          type="button"
          aria-pressed={engines.satori.local_typography_enabled}
          disabled={saving}
          onClick={() => savePatch({
            satori: { local_typography_enabled: !engines.satori.local_typography_enabled },
          })}
          style={toggleStyle(engines.satori.local_typography_enabled, '#0D9488')}
        >
          <span style={{
            position: 'absolute', top: 3, left: engines.satori.local_typography_enabled ? 21 : 3,
            width: 20, height: 20, borderRadius: 10, background: '#fff',
            transition: 'left 0.15s ease',
          }} />
        </button>
      </div>

      {/* Mission Hub slot showcase (flip cards) */}
      <div style={{ fontSize: 11, color: t.labelColor, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        Mission Hub — Üretim Galerisi
      </div>
      {[
        {
          key: 'enabled' as const,
          label: 'Flip kart galerisi',
        },
        {
          key: 'format_filters_enabled' as const,
          label: 'Format filtreleri',
        },
      ].map(({ key, label }) => {
        const showcase = engines.showcase ?? { enabled: true, format_filters_enabled: true };
        const on = showcase[key];
        return (
          <div key={key} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 12px', borderRadius: 12, marginBottom: 6,
            border: `0.5px solid ${t.separator}`,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary }}>{label}</div>
            </div>
            <button
              type="button"
              aria-pressed={on}
              disabled={saving}
              onClick={() => savePatch({ showcase: { ...showcase, [key]: !on } })}
              style={toggleStyle(on, '#C9A96E')}
            >
              <span style={{
                position: 'absolute', top: 3, left: on ? 21 : 3,
                width: 20, height: 20, borderRadius: 10, background: '#fff',
                transition: 'left 0.15s ease',
              }} />
            </button>
          </div>
        );
      })}
      <div style={{ height: 8 }} />

      {/* Throughput */}
      <div style={{ fontSize: 11, color: t.labelColor, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        Üretim Hızı
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 4 }}>Factory batch (slot/batch)</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={saving}
              onClick={() => savePatch({ throughput: { ...engines.throughput, factory_drain_batch: n } })}
              style={{
                flex: 1, padding: '6px 0', borderRadius: 8, border: 'none',
                background: (engines.throughput?.factory_drain_batch ?? 4) === n ? '#10B981' : t.separator,
                color: (engines.throughput?.factory_drain_batch ?? 4) === n ? '#fff' : t.textMuted,
                fontSize: 12, fontWeight: 600, cursor: saving ? 'default' : 'pointer',
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
