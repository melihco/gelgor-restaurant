'use client';

import React, { useState } from 'react';
import {
  defaultProductionEngines,
  STORY_FAMILY_LABELS,
  TIER1_STORY_FAMILIES,
  TIER2_STORY_FAMILIES,
  TIER3_STORY_FAMILIES,
  type BrandProductionEnginesConfig,
} from '@/lib/brand-production-engines';
import type { RemotionLayoutFamily } from '@/lib/remotion-template-types';
import type { T } from '@/app/mobile/_components/theme-context';

type ThemeRecord = Record<string, unknown>;

const ALL_FAMILIES = [
  ...TIER1_STORY_FAMILIES,
  ...TIER2_STORY_FAMILIES,
  ...TIER3_STORY_FAMILIES,
  'event_ticket', 'noir_editorial', 'split_panel', 'editorial_left',
] as RemotionLayoutFamily[];

function readEngines(theme: ThemeRecord): BrandProductionEnginesConfig {
  const raw = (theme.production_engines ?? theme.productionEngines) as
    Partial<BrandProductionEnginesConfig> | undefined;
  const defaults = defaultProductionEngines();
  if (!raw) return defaults;
  return {
    fal: { ...defaults.fal, ...raw.fal },
    remotion: {
      premium_motion_families: raw.remotion?.premium_motion_families?.length
        ? raw.remotion.premium_motion_families
        : defaults.remotion.premium_motion_families,
      typography_fallback_families: raw.remotion?.typography_fallback_families?.length
        ? raw.remotion.typography_fallback_families
        : defaults.remotion.typography_fallback_families,
      blocked_story_families: raw.remotion?.blocked_story_families?.length
        ? raw.remotion.blocked_story_families
        : defaults.remotion.blocked_story_families,
    },
    runway: { ...defaults.runway, ...raw.runway },
    throughput: {
      factory_drain_batch: raw.throughput?.factory_drain_batch ?? defaults.throughput?.factory_drain_batch,
      remotion_max_concurrent: raw.throughput?.remotion_max_concurrent ?? defaults.throughput?.remotion_max_concurrent,
    },
  };
}

function tierForFamily(
  family: RemotionLayoutFamily,
  engines: BrandProductionEnginesConfig,
): 'premium' | 'typography' | 'blocked' | 'remotion_only' {
  if (engines.remotion.blocked_story_families.includes(family)) return 'blocked';
  if (engines.remotion.premium_motion_families.includes(family)) return 'premium';
  if (engines.remotion.typography_fallback_families.includes(family)) return 'typography';
  return 'remotion_only';
}

const TIER_CYCLE = ['premium', 'typography', 'remotion_only', 'blocked'] as const;

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
      remotion: { ...engines.remotion, ...patch.remotion },
      runway: { ...engines.runway, ...patch.runway },
      throughput: { ...engines.throughput, ...patch.throughput },
    });
  };

  const cycleFamily = (family: RemotionLayoutFamily) => {
    const current = tierForFamily(family, engines);
    const idx = TIER_CYCLE.indexOf(current);
    const nextTier = TIER_CYCLE[(idx + 1) % TIER_CYCLE.length]!;

    const premium = new Set(engines.remotion.premium_motion_families);
    const typo = new Set(engines.remotion.typography_fallback_families);
    const blocked = new Set(engines.remotion.blocked_story_families);

    premium.delete(family);
    typo.delete(family);
    blocked.delete(family);

    if (nextTier === 'premium') premium.add(family);
    else if (nextTier === 'typography') typo.add(family);
    else if (nextTier === 'blocked') blocked.add(family);

    savePatch({
      remotion: {
        premium_motion_families: [...premium],
        typography_fallback_families: [...typo],
        blocked_story_families: [...blocked],
      },
    });
  };

  const tierBadge = (tier: ReturnType<typeof tierForFamily>) => {
    const map = {
      premium: { label: 'FAL Motion', color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)' },
      typography: { label: 'FAL Tipografi', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
      remotion_only: { label: 'Şablon', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
      blocked: { label: 'Kapalı', color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
    };
    const m = map[tier];
    return (
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
        color: m.color, background: m.bg,
      }}>
        {m.label}
      </span>
    );
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
        Story ve reel kalitesini yöneten motorlar: <strong>fal.ai</strong> (story poster + motion plate + AI tipografi),
        <strong> Runway</strong> (reel video), <strong>şablon kütüphanesi</strong> (tipografi + layout).
        Şablon seçimi Template Kütüphanesi&apos;nden; motor önceliği buradan.
      </div>

      {/* FAL */}
      <div style={{ fontSize: 11, color: t.labelColor, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        FAL.ai — Story Premium
      </div>
      {[
        { key: 'motion_plates_enabled' as const, label: 'Motion Plate (I2V)', desc: 'Statik Ken Burns yerine video arka plan', color: '#8B5CF6' },
        { key: 'typography_design_enabled' as const, label: 'Tipografi Tasarımı', desc: 'Kısa headline için AI tipografi fallback', color: '#3B82F6' },
      ].map(({ key, label, desc, color }) => (
        <div key={key} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px', borderRadius: 12, marginBottom: 6,
          border: `0.5px solid ${t.separator}`,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary }}>{label}</div>
            <div style={{ fontSize: 11, color: t.textMuted }}>{desc}</div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => savePatch({ fal: { ...engines.fal, [key]: !engines.fal[key] } })}
            style={toggleStyle(engines.fal[key], color)}
          >
            <div style={{
              position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%',
              background: '#fff', left: engines.fal[key] ? 21 : 3, transition: 'left 0.2s',
            }} />
          </button>
        </div>
      ))}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '10px 0 16px' }}>
        {[
          { field: 'max_motion_plates_per_mission' as const, label: 'Max motion/mission' },
          { field: 'max_typography_per_mission' as const, label: 'Max tipografi/mission' },
        ].map(({ field, label }) => (
          <div key={field}>
            <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 4 }}>{label}</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={saving}
                  onClick={() => savePatch({ fal: { ...engines.fal, [field]: n } })}
                  style={{
                    flex: 1, padding: '6px 0', borderRadius: 8, border: 'none',
                    background: engines.fal[field] === n ? '#8B5CF6' : t.separator,
                    color: engines.fal[field] === n ? '#fff' : t.textMuted,
                    fontSize: 12, fontWeight: 600, cursor: saving ? 'default' : 'pointer',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Throughput */}
      <div style={{ fontSize: 11, color: t.labelColor, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        Üretim Hızı
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        <div>
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
        <div>
          <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 4 }}>Paralel tasarım</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2].map((n) => (
              <button
                key={n}
                type="button"
                disabled={saving}
                onClick={() => savePatch({ throughput: { ...engines.throughput, remotion_max_concurrent: n } })}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 8, border: 'none',
                  background: (engines.throughput?.remotion_max_concurrent ?? 2) === n ? '#10B981' : t.separator,
                  color: (engines.throughput?.remotion_max_concurrent ?? 2) === n ? '#fff' : t.textMuted,
                  fontSize: 12, fontWeight: 600, cursor: saving ? 'default' : 'pointer',
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Runway */}
      <div style={{ fontSize: 11, color: t.labelColor, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        Runway — Reel Video
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px', borderRadius: 12, marginBottom: 16,
        border: `0.5px solid ${t.separator}`,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary }}>Runway Reel Üretimi</div>
          <div style={{ fontSize: 11, color: t.textMuted }}>Tempo/kamera ayarları → Reel Motion paneli</div>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => savePatch({ runway: { enabled: !engines.runway.enabled } })}
          style={toggleStyle(engines.runway.enabled, '#F59E0B')}
        >
          <div style={{
            position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%',
            background: '#fff', left: engines.runway.enabled ? 21 : 3, transition: 'left 0.2s',
          }} />
        </button>
      </div>

      {/* Story layout families */}
      <div style={{ fontSize: 11, color: t.labelColor, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        Story Layout Aileleri — Dokun = sıra değişir
      </div>
      <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 10, lineHeight: 1.5 }}>
        FAL Motion → FAL Tipografi → Şablon → Kapalı
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
        {ALL_FAMILIES.map((family) => {
          const tier = tierForFamily(family, engines);
          const meta = STORY_FAMILY_LABELS[family];
          return (
            <button
              key={family}
              type="button"
              disabled={saving}
              onClick={() => cycleFamily(family)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px', borderRadius: 10, border: `0.5px solid ${t.separator}`,
                background: t.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                cursor: saving ? 'default' : 'pointer', textAlign: 'left',
              }}
            >
              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: t.textPrimary }}>
                  {meta?.tr ?? family}
                </span>
                {meta?.tier === 1 && (
                  <span style={{ fontSize: 9, marginLeft: 6, color: '#8B5CF6', fontWeight: 700 }}>★ Premium</span>
                )}
              </div>
              {tierBadge(tier)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
