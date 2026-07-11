'use client';

import React, { useState } from 'react';
import {
  motionProfileToThemeJson,
  parseMotionProfileFromTheme,
  type BrandMotionProfile,
} from '@/lib/brand-motion-profile';
import {
  describeBrandReelPolicy,
  REEL_CAMERA_OPTIONS,
  REEL_PACE_OPTIONS,
} from '@/lib/brand-reel-motion-profile';
import { describeSectorReelMotionStandard } from '@/lib/sector-reel-motion-standard';
import type { ReelMontageStrategy } from '@/lib/reel-multi-production';
import type { ReelPacing } from '@/lib/sector-production-profile';
import type { T } from '@/app/mobile/_components/theme-context';

type ThemeRecord = Record<string, unknown>;

const STRATEGY_OPTIONS: { id: ReelMontageStrategy | 'auto'; label: string; desc: string }[] = [
  { id: 'auto', label: 'Otomatik', desc: 'Fotoğraf sayısı ve pace\'e göre seçilir' },
  { id: 'single', label: 'Tek klip', desc: 'Sürekli sinematik reel' },
  { id: 'sequential', label: 'Montaj', desc: 'Her fotoğraf ayrı klip, ardışık montaj' },
  { id: 'multi_ref', label: 'Multi-ref', desc: 'Legacy blend (gen4_turbo ilk kare)' },
];

export function ReelMotionSettingsPanel({
  tenantId,
  theme,
  sector,
  t,
  onSaved,
}: {
  tenantId: string;
  theme: ThemeRecord;
  sector?: string;
  t: T;
  onSaved?: () => void;
}) {
  const profile = parseMotionProfileFromTheme(theme, { sector, tenantId });
  const sectorStandardHint = describeSectorReelMotionStandard(sector);
  const [saving, setSaving] = useState(false);

  const activePace = profile.reelPace && profile.reelPace !== 'auto'
    ? profile.reelPace
    : 'auto';
  const activeCamera = profile.reelCameraMotion && profile.reelCameraMotion !== 'auto'
    ? profile.reelCameraMotion
    : 'auto';
  const activeStrategy = profile.reelStrategy && profile.reelStrategy !== 'auto'
    ? profile.reelStrategy
    : 'auto';
  const productSpotlightOn = profile.productSpotlightReel === true;

  const save = async (patch: Partial<BrandMotionProfile>) => {
    if (!tenantId) return;
    setSaving(true);
    try {
      const base = parseMotionProfileFromTheme(theme, { sector, tenantId });
      const next = { ...base, ...patch, operatorOverride: true };
      const motion_profile = motionProfileToThemeJson(next);
      await fetch(`/api/brand-context/${tenantId}/theme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
        body: JSON.stringify({
          theme: {
            ...theme,
            motion_profile,
          },
        }),
      });
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const chipStyle = (active: boolean) => ({
    textAlign: 'left' as const,
    padding: '10px 12px',
    borderRadius: 12,
    cursor: saving ? 'default' : 'pointer',
    border: `0.5px solid ${active ? t.accentBorder : t.separator}`,
    background: active
      ? (t.isDark ? 'rgba(77,112,136,0.12)' : 'rgba(77,112,136,0.08)')
      : (t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
    opacity: saving ? 0.7 : 1,
  });

  return (
    <div>
      <div style={{ fontSize: 12, color: t.textTertiary, lineHeight: 1.6, marginBottom: 14 }}>
        fal.ai reel üretiminde varsayılan tempo, kamera ve montaj stratejisi. İçerik fikrindeki
        reel_motion_spec bu ayarların üzerine yazabilir.
      </div>
      <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 16 }}>
        Aktif politika: {describeBrandReelPolicy(profile, sector ?? '')}
        {sectorStandardHint ? (
          <span style={{ display: 'block', marginTop: 6, color: t.textMuted }}>
            Sektör standardı: {sectorStandardHint}
          </span>
        ) : null}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Ürün reklam filmi (fal.ai I2V)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {([
          { on: true, label: 'Açık', desc: 'Gerçek ürün galeri karelerinde TVC tarzı dolly-in ve macro motion' },
          { on: false, label: 'Kapalı', desc: 'Standart venue/fidelity kuralları — ürün TVC director prompt yok' },
        ] as const).map(({ on, label, desc }) => {
          const active = productSpotlightOn === on;
          return (
            <button
              key={label}
              type="button"
              disabled={saving}
              onClick={() => void save({ productSpotlightReel: on })}
              style={chipStyle(active)}
            >
              <div style={{ fontSize: 13, fontWeight: active ? 700 : 600, color: active ? t.accent : t.textPrimary }}>
                {label}
              </div>
              <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>{desc}</div>
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Reel tempo
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save({ reelPace: 'auto' })}
          style={chipStyle(activePace === 'auto')}
        >
          <div style={{ fontSize: 13, fontWeight: activePace === 'auto' ? 700 : 600, color: activePace === 'auto' ? t.accent : t.textPrimary }}>
            Otomatik (motion stili / sektör)
          </div>
        </button>
        {REEL_PACE_OPTIONS.map(({ id, label, desc }) => {
          const active = activePace === id;
          return (
            <button
              key={id}
              type="button"
              disabled={saving}
              onClick={() => void save({ reelPace: id as ReelPacing })}
              style={chipStyle(active)}
            >
              <div style={{ fontSize: 13, fontWeight: active ? 700 : 600, color: active ? t.accent : t.textPrimary }}>
                {label}
              </div>
              <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>{desc}</div>
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Varsayılan kamera
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save({ reelCameraMotion: 'auto' })}
          style={{ ...chipStyle(activeCamera === 'auto'), flex: '1 1 100%' }}
        >
          <div style={{ fontSize: 13, fontWeight: activeCamera === 'auto' ? 700 : 600, color: activeCamera === 'auto' ? t.accent : t.textPrimary }}>
            Otomatik
          </div>
        </button>
        {REEL_CAMERA_OPTIONS.map(({ id, label }) => {
          const active = activeCamera === id;
          return (
            <button
              key={id}
              type="button"
              disabled={saving}
              onClick={() => void save({ reelCameraMotion: id })}
              style={{ ...chipStyle(active), flex: '1 1 calc(50% - 4px)', minWidth: 120 }}
            >
              <div style={{ fontSize: 12, fontWeight: active ? 700 : 600, color: active ? t.accent : t.textPrimary }}>
                {label}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Montaj stratejisi
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {STRATEGY_OPTIONS.map(({ id, label, desc }) => {
          const active = activeStrategy === id;
          return (
            <button
              key={id}
              type="button"
              disabled={saving}
              onClick={() => void save({
                reelStrategy: id === 'auto' ? 'auto' : id,
              })}
              style={chipStyle(active)}
            >
              <div style={{ fontSize: 13, fontWeight: active ? 700 : 600, color: active ? t.accent : t.textPrimary }}>
                {label}
              </div>
              <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>{desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
