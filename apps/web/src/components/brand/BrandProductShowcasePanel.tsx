'use client';

import React, { useState } from 'react';
import type { BrandProductShowcaseConfig } from '@/types/brand-theme';
import type { T } from '@/app/mobile/_components/theme-context';

type ThemeRecord = Record<string, unknown>;

const BG_STYLE_OPTIONS: Array<{
  id: BrandProductShowcaseConfig['background_style'];
  label: string;
  desc: string;
}> = [
  { id: 'venue_location', label: 'Mekan / Lokasyon', desc: 'Datça, sahil, şehir manzarası — ürün ön planda' },
  { id: 'lifestyle_scene', label: 'Lifestyle', desc: 'Ürünün kullanıldığı doğal ortam' },
  { id: 'studio_clean', label: 'Stüdyo', desc: 'Temiz gradient, premium ürün fotoğrafı' },
  { id: 'auto', label: 'Otomatik', desc: 'Sektör + konuma göre arka plan seçimi' },
];

function readConfig(theme: ThemeRecord): BrandProductShowcaseConfig {
  const raw = (theme.product_showcase ?? theme.productShowcase ?? {}) as Partial<BrandProductShowcaseConfig>;
  return {
    enabled: raw.enabled === true,
    posts_per_mission: raw.posts_per_mission ?? 2,
    stories_per_mission: raw.stories_per_mission ?? 2,
    background_style: raw.background_style ?? 'auto',
    product_gallery_tags: raw.product_gallery_tags,
    product_photo_urls: raw.product_photo_urls,
  };
}

export function BrandProductShowcasePanel({
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
  const active = readConfig(theme);
  const [saving, setSaving] = useState(false);

  const save = async (patch: Partial<BrandProductShowcaseConfig>) => {
    if (!tenantId) return;
    setSaving(true);
    try {
      const next = { ...active, ...patch };
      await fetch(`/api/brand-context/${tenantId}/theme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
        body: JSON.stringify({
          theme: {
            ...theme,
            product_showcase: next,
            productShowcase: next,
          },
        }),
      });
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const chipStyle = (on: boolean) => ({
    textAlign: 'left' as const,
    padding: '10px 12px',
    borderRadius: 12,
    cursor: saving ? 'default' : 'pointer',
    border: `0.5px solid ${on ? t.accentBorder : t.separator}`,
    background: on
      ? (t.isDark ? 'rgba(16,185,129,0.10)' : 'rgba(16,185,129,0.06)')
      : (t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
    opacity: saving ? 0.7 : 1,
  });

  const countBtn = (value: number, field: 'posts_per_mission' | 'stories_per_mission') => (
    <div style={{ display: 'flex', gap: 6 }}>
      {[0, 1, 2, 3, 4].map((n) => (
        <button
          key={n}
          type="button"
          disabled={saving}
          onClick={() => save({ [field]: n })}
          style={{
            flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: saving ? 'default' : 'pointer',
            background: value === n ? t.accent : t.separator,
            color: value === n ? '#fff' : t.textMuted,
            fontWeight: value === n ? 700 : 500,
            fontSize: 13,
          }}
        >
          {n}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 12, color: t.textTertiary, lineHeight: 1.6, marginBottom: 14 }}>
        Ürün fotoğrafını koruyarak arka planı AI ile değiştirir. Her mission&apos;a ek post + story slotları ekler.
        Logo ve ambalaj yazıları değiştirilmez.
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', borderRadius: 14, marginBottom: 14,
        background: t.isDark ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.06)',
        border: `0.5px solid ${active.enabled ? 'rgba(16,185,129,0.35)' : t.separator}`,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>Ürün Vitrin Üretimi</div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
            {active.enabled
              ? `Mission başına ${active.posts_per_mission} post + ${active.stories_per_mission} story`
              : 'Kapalı — standart mission slotları kullanılır'}
          </div>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => save({ enabled: !active.enabled })}
          style={{
            width: 50, height: 28, borderRadius: 14, border: 'none',
            cursor: saving ? 'default' : 'pointer',
            background: active.enabled ? '#10B981' : t.separator,
            position: 'relative',
          }}
        >
          <div style={{
            position: 'absolute', top: 3, width: 22, height: 22, borderRadius: '50%',
            background: '#fff', left: active.enabled ? 25 : 3, transition: 'left 0.2s',
          }} />
        </button>
      </div>

      {active.enabled && (
        <>
          <div style={{ fontSize: 11, color: t.labelColor, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
            Post sayısı / mission
          </div>
          <div style={{ marginBottom: 14 }}>{countBtn(active.posts_per_mission, 'posts_per_mission')}</div>

          <div style={{ fontSize: 11, color: t.labelColor, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
            Story sayısı / mission
          </div>
          <div style={{ marginBottom: 14 }}>{countBtn(active.stories_per_mission, 'stories_per_mission')}</div>

          <div style={{ fontSize: 11, color: t.labelColor, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
            Arka plan stili
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {BG_STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={saving}
                onClick={() => save({ background_style: opt.id })}
                style={chipStyle(active.background_style === opt.id)}
              >
                <div style={{ fontSize: 13, fontWeight: active.background_style === opt.id ? 700 : 500, color: t.textPrimary }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{opt.desc}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
