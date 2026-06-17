'use client';

import React from 'react';
import {
  paletteToProfileFields,
  syncBrandPaletteToProduction,
} from '@/lib/brand-palette-sync';
import {
  listPaletteOptionsForSector,
  paletteFromProfileFields,
  resolveSectorColorPreset,
  type BrandColorPalette,
} from '@/lib/sector-color-presets';

type ThemeTokens = {
  accent: string;
  accentDim?: string;
  accentBorder?: string;
  separator: string;
  textPrimary: string;
  textMuted: string;
  textSecondary?: string;
  isDark?: boolean;
  surface?: string;
};

function normalizeHex(value: string, fallback: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match?.[1]) return fallback;
  let hex = match[1].toLowerCase();
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  return `#${hex}`;
}

function PaletteSlot({
  label,
  value,
  fallback,
  onChange,
  t,
  large,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (hex: string) => void;
  t: ThemeTokens;
  large?: boolean;
}) {
  const safe = normalizeHex(value, fallback);
  const size = large ? 56 : 44;
  return (
    <button
      type="button"
      onClick={() => {
        const input = document.createElement('input');
        input.type = 'color';
        input.value = safe;
        input.onchange = () => onChange(input.value);
        input.click();
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      <div style={{
        width: size,
        height: size,
        borderRadius: 14,
        background: safe,
        border: `2px solid ${t.separator}`,
        boxShadow: `0 0 0 2px ${safe}33, 0 4px 14px rgba(0,0,0,0.2)`,
      }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: t.textMuted }}>{label}</span>
      <span style={{ fontSize: 9, fontFamily: 'monospace', color: t.textSecondary ?? t.textMuted }}>{safe}</span>
    </button>
  );
}

function StoryColorPreview({ palette, brandName }: { palette: BrandColorPalette; brandName?: string }) {
  return (
    <div style={{
      borderRadius: 16,
      overflow: 'hidden',
      aspectRatio: '9 / 16',
      maxHeight: 168,
      width: '100%',
      background: `linear-gradient(160deg, ${palette.primary} 0%, ${palette.shadow} 55%, ${palette.primary}ee 100%)`,
      position: 'relative',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `linear-gradient(to bottom, transparent 40%, ${palette.shadow}dd 100%)`,
      }} />
      <div style={{
        position: 'absolute',
        left: 14,
        right: 14,
        bottom: 16,
      }}>
        <div style={{ width: 36, height: 3, borderRadius: 2, background: palette.accent, marginBottom: 10 }} />
        <div style={{
          fontSize: 15,
          fontWeight: 800,
          color: palette.neutral,
          lineHeight: 1.15,
          textShadow: `0 2px 12px ${palette.shadow}`,
        }}>
          {brandName ? `${brandName.split(' ')[0]}` : 'Story'}
        </div>
        <div style={{
          marginTop: 8,
          display: 'inline-block',
          padding: '5px 12px',
          borderRadius: 999,
          border: `1.5px solid ${palette.accent}`,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: palette.neutral,
        }}>
          Önizleme
        </div>
      </div>
    </div>
  );
}

export interface BrandColorPalettePickerProps {
  tenantId: string;
  sector?: string;
  brandName?: string;
  brandColors?: string;
  accentColors?: string;
  brandPrimary?: string;
  brandAccent?: string;
  themePalette?: Partial<BrandColorPalette> | null;
  existingTheme?: Record<string, unknown> | null;
  t: ThemeTokens;
  onSaved?: (palette: BrandColorPalette, profileFields: ReturnType<typeof paletteToProfileFields>) => void;
}

export function BrandColorPalettePicker({
  tenantId,
  sector = '',
  brandName,
  brandColors,
  accentColors,
  brandPrimary,
  brandAccent,
  themePalette,
  existingTheme,
  t,
  onSaved,
}: BrandColorPalettePickerProps) {
  const initial = React.useMemo(
    () => paletteFromProfileFields({
      brandColors,
      accentColors,
      brandPrimary,
      brandAccent,
      themePalette,
    }),
    [brandColors, accentColors, brandPrimary, brandAccent, themePalette],
  );

  const [draft, setDraft] = React.useState<BrandColorPalette>(initial);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState('');

  React.useEffect(() => {
    setDraft(initial);
  }, [initial.primary, initial.accent, initial.neutral, initial.shadow]);

  const sectorPresets = React.useMemo(
    () => listPaletteOptionsForSector(sector),
    [sector],
  );

  const applyPreset = (preset: BrandColorPalette) => {
    setDraft({ ...preset });
  };

  const applySectorDefault = () => {
    applyPreset(resolveSectorColorPreset(sector));
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus('Kaydediliyor…');
    const normalized: BrandColorPalette = {
      ...draft,
      primary: normalizeHex(draft.primary, '#1a1a1a'),
      accent: normalizeHex(draft.accent, '#c9a96e'),
      neutral: normalizeHex(draft.neutral, '#f5f5f5'),
      shadow: normalizeHex(draft.shadow, '#000000'),
      labelTr: draft.labelTr || 'Marka paleti',
    };
    setDraft(normalized);

    const result = await syncBrandPaletteToProduction({
      tenantId,
      palette: normalized,
      existingTheme: existingTheme ?? null,
      description: `${normalized.labelTr} · story üretim paleti`,
    });

    if (result.ok) {
      const profileFields = paletteToProfileFields(normalized);
      onSaved?.(normalized, profileFields);
      setStatus('Palet kaydedildi — story üretimine bağlandı ✓');
    } else {
      setStatus(result.error ?? 'Kayıt başarısız');
    }
    setSaving(false);
    setTimeout(() => setStatus(''), 3500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: t.textMuted }}>
        Seçili renkler <strong style={{ color: t.textPrimary }}>Remotion story</strong> şablonlarına
        (panel, vurgu çizgisi, CTA, gradient) otomatik uygulanır. Sektör önerileri başlangıç içindir;
        markanıza göre özelleştirin.
      </p>

      {sector && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Sektör önerileri
          </span>
          {sectorPresets.map((preset) => {
            const active = draft.primary === preset.primary && draft.accent === preset.accent;
            return (
              <button
                key={`${preset.labelTr}-${preset.primary}`}
                type="button"
                onClick={() => applyPreset(preset)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: `1px solid ${active ? t.accent : t.separator}`,
                  background: active ? (t.accentDim ?? `${t.accent}22`) : 'transparent',
                  color: active ? t.accent : t.textSecondary ?? t.textMuted,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 14,
                  height: 14,
                  borderRadius: 4,
                  background: `linear-gradient(135deg, ${preset.primary}, ${preset.accent})`,
                  flexShrink: 0,
                }} />
                {preset.labelTr}
              </button>
            );
          })}
          <button
            type="button"
            onClick={applySectorDefault}
            style={{
              fontSize: 11,
              color: t.accent,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              textDecoration: 'underline',
            }}
          >
            Sektör varsayılanı
          </button>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 14,
        alignItems: 'start',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          padding: 14,
          borderRadius: 14,
          border: `0.5px solid ${t.separator}`,
          background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
        }}>
          <PaletteSlot label="Ana" value={draft.primary} fallback="#1a1a1a" onChange={(v) => setDraft((d) => ({ ...d, primary: v }))} t={t} large />
          <PaletteSlot label="Vurgu" value={draft.accent} fallback="#c9a96e" onChange={(v) => setDraft((d) => ({ ...d, accent: v }))} t={t} large />
          <PaletteSlot label="Metin" value={draft.neutral} fallback="#f5f5f5" onChange={(v) => setDraft((d) => ({ ...d, neutral: v }))} t={t} />
          <PaletteSlot label="Gölge" value={draft.shadow} fallback="#000000" onChange={(v) => setDraft((d) => ({ ...d, shadow: v }))} t={t} />
        </div>
        <StoryColorPreview palette={draft} brandName={brandName} />
      </div>

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        style={{
          width: '100%',
          padding: '12px 16px',
          borderRadius: 12,
          border: 'none',
          background: saving ? (t.accentDim ?? t.accent) : t.accent,
          color: '#fff',
          fontSize: 13,
          fontWeight: 700,
          cursor: saving ? 'wait' : 'pointer',
        }}
      >
        {saving ? 'Kaydediliyor…' : '💾 Paleti kaydet · Story üretimine uygula'}
      </button>

      {status && (
        <div style={{ fontSize: 12, color: t.textSecondary ?? t.textMuted, textAlign: 'center' }}>
          {status}
        </div>
      )}
    </div>
  );
}
