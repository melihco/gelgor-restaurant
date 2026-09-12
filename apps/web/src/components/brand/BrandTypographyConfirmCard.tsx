'use client';

import { useMemo, useState } from 'react';
import type { T } from '@/app/mobile/_components/theme-context';
import { fetchTenantBff } from '@/lib/bff-fetch';
import {
  buildHubTypographyConfirmThemePatch,
  readThemePaletteColors,
  resolveSuggestedTypographyConfig,
  TYPOGRAPHY_VIBE_ONBOARDING_OPTIONS,
} from '@/lib/typography-design-policy';
import type { TypographyVibe } from '@/types/brand-theme';

export function BrandTypographyConfirmCard({
  tenantId,
  sector,
  theme,
  t,
  onConfirmed,
}: {
  tenantId: string;
  sector: string;
  theme: Record<string, unknown> | null;
  t: T;
  onConfirmed?: (nextTheme: Record<string, unknown>) => void;
}) {
  const suggested = useMemo(
    () => resolveSuggestedTypographyConfig(theme, sector),
    [theme, sector],
  );
  const initialPalette = useMemo(() => readThemePaletteColors(theme), [theme]);
  const [vibe, setVibe] = useState<TypographyVibe>(suggested.vibe);
  const [primary, setPrimary] = useState(initialPalette.primary);
  const [accent, setAccent] = useState(initialPalette.accent);
  const [neutral, setNeutral] = useState(initialPalette.neutral);
  const [shadow, setShadow] = useState(initialPalette.shadow);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const nextTheme = buildHubTypographyConfirmThemePatch({
        currentTheme: theme ?? {},
        typography: { ...suggested, vibe },
        palette: { primary, accent, neutral, shadow },
      });
      const res = await fetchTenantBff(`/api/brand-context/${tenantId}/theme`, tenantId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: nextTheme }),
      });
      if (!res.ok) throw new Error('Kaydedilemedi — tekrar dene.');
      const payload = (await res.json().catch(() => null)) as { theme?: Record<string, unknown> } | null;
      onConfirmed?.(payload?.theme ?? nextTheme);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi.');
    } finally {
      setSubmitting(false);
    }
  }

  const colors = [
    { label: 'Ana', value: primary, set: setPrimary },
    { label: 'Vurgu', value: accent, set: setAccent },
    { label: 'Nötr', value: neutral, set: setNeutral },
    { label: 'Gölge', value: shadow, set: setShadow },
  ] as const;

  return (
    <div
      style={{
        padding: 14,
        borderRadius: 14,
        border: `1px solid ${t.accentBorder}`,
        background: t.isDark ? 'rgba(245,158,11,0.10)' : 'rgba(245,158,11,0.07)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: t.textPrimary, lineHeight: 1.35 }}>
          Renk ve tipografiyi onayla
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.45, color: t.textSecondary }}>
          Görsel set buradan kilitlenir. Paleti ve vibe’ı seç, sonra onayla.
        </p>
      </div>

      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: t.textMuted,
            marginBottom: 8,
          }}
        >
          Renk paleti
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
          {colors.map((c) => (
            <label
              key={c.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                minHeight: 44,
              }}
            >
              <span
                style={{
                  height: 36,
                  borderRadius: 10,
                  background: c.value,
                  border: `1px solid ${t.separator}`,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <input
                  type="color"
                  value={c.value}
                  onChange={(e) => c.set(e.target.value)}
                  aria-label={c.label}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0,
                    cursor: 'pointer',
                  }}
                />
              </span>
              <span style={{ fontSize: 11, color: t.textMuted }}>{c.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: t.textMuted,
            marginBottom: 8,
          }}
        >
          Tipografi vibe
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {TYPOGRAPHY_VIBE_ONBOARDING_OPTIONS.map((opt) => {
            const active = vibe === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setVibe(opt.id)}
                style={{
                  minHeight: 44,
                  padding: '10px 12px',
                  borderRadius: 12,
                  textAlign: 'left',
                  cursor: 'pointer',
                  border: `1px solid ${active ? t.accent : t.separator}`,
                  background: active
                    ? (t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)')
                    : 'transparent',
                  color: t.textPrimary,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: active ? 800 : 600 }}>
                  {opt.emoji} {opt.label}
                </div>
                <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2, lineHeight: 1.35 }}>
                  {opt.desc}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p style={{ margin: 0, fontSize: 13, color: t.danger }}>{error}</p>
      )}

      <button
        type="button"
        disabled={submitting}
        onClick={() => void handleConfirm()}
        style={{
          minHeight: 48,
          padding: '0 16px',
          borderRadius: 12,
          border: 'none',
          background: t.accent,
          color: '#fff',
          fontSize: 16,
          fontWeight: 800,
          cursor: submitting ? 'wait' : 'pointer',
          opacity: submitting ? 0.75 : 1,
        }}
      >
        {submitting ? 'Kaydediliyor…' : 'Onayla — sonra seti üret'}
      </button>
    </div>
  );
}
