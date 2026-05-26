'use client';
/**
 * BRAND CONSTITUTION — Full tenant profile: view + edit.
 * Shows ALL analysis fields. Every section editable from mobile.
 */
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Tone seçenekleri — Setup Wizard ile aynı değerler
const TONE_OPTIONS = [
  { value: 'professional', label: 'Profesyonel', desc: 'Kurumsal, güven veren', emoji: '🏢' },
  { value: 'friendly',     label: 'Samimi',      desc: 'Sıcak, erişilebilir',  emoji: '😊' },
  { value: 'energetic',    label: 'Enerjik',     desc: 'Dinamik, heyecanlı',   emoji: '⚡' },
  { value: 'luxury',       label: 'Premium',     desc: 'Lüks, sofistike',       emoji: '✨' },
  { value: 'casual',       label: 'Rahat',       desc: 'Doğal, gündelik',      emoji: '☀️' },
];
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { apiClient } from '@/lib/api-client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { CompanyProfile, SaveCompanyProfileRequest, ApprovalMode } from '@/types';
import type { T } from '../theme-context';
import { AnnouncementTemplateLibrarySection } from './AnnouncementTemplateLibrarySection';
import { resolveAnnouncementBrandKit } from '@/lib/announcement-brand-kit';
import { normalizeSectorId } from '@/lib/announcement-template-library';

// ─── Helpers ──────────────────────────────────────────────────────────
function parseArr(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) {
      try { const p = JSON.parse(trimmed); return Array.isArray(p) ? p.map(String) : []; } catch {}
    }
    return trimmed.split(/[,\n;]+/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function parseObj(raw: unknown): Record<string, string> {
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, string>;
  return {};
}

function arrToStr(arr: string[]): string { return arr.join(', '); }

// ─── Inline field editor ───────────────────────────────────────────────
function Field({ t, label, value, onSave, multiline = false, hint }: {
  t: T; label: string; value: string; onSave: (v: string) => void;
  multiline?: boolean; hint?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: t.accent, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
        {multiline ? (
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={4}
            style={{ width: '100%', padding: '11px 13px', borderRadius: 12, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontSize: 14, lineHeight: 1.55, background: t.isDark ? 'rgba(255,255,255,0.06)' : '#fff', border: `1px solid ${t.accent}40`, color: t.textPrimary }} autoFocus
          />
        ) : (
          <input value={draft} onChange={e => setDraft(e.target.value)}
            style={{ width: '100%', padding: '11px 13px', borderRadius: 12, outline: 'none', boxSizing: 'border-box', fontSize: 14, background: t.isDark ? 'rgba(255,255,255,0.06)' : '#fff', border: `1px solid ${t.accent}40`, color: t.textPrimary }} autoFocus
          />
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={() => { onSave(draft); setEditing(false); }} style={{ padding: '8px 16px', borderRadius: 10, cursor: 'pointer', background: t.accentDim, border: `0.5px solid ${t.accentBorder}`, color: t.accent, fontSize: 13, fontWeight: 600 }}>
            Kaydet
          </button>
          <button onClick={() => { setDraft(value); setEditing(false); }} style={{ padding: '8px 12px', borderRadius: 10, cursor: 'pointer', background: 'transparent', border: `0.5px solid ${t.separator}`, color: t.textMuted, fontSize: 13 }}>
            İptal
          </button>
        </div>
      </div>
    );
  }

  return (
    <button onClick={() => { setDraft(value); setEditing(true); }} style={{
      width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
      background: 'transparent', border: `0.5px solid ${t.separator}`,
      marginBottom: 10,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: t.labelColor, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: value ? t.textPrimary : t.textMuted, lineHeight: 1.5 }}>
        {value || hint || 'Ekle...'}
      </div>
      <div style={{ fontSize: 10, color: t.accent, marginTop: 4, fontWeight: 600 }}>Düzenle →</div>
    </button>
  );
}

// ─── Read-only info row ────────────────────────────────────────────────
function InfoRow({ t, label, value, color }: { t: T; label: string; value: string; color?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: t.labelColor, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: color ?? t.textSecondary, lineHeight: 1.55 }}>{value}</div>
    </div>
  );
}

// ─── Section card ──────────────────────────────────────────────────────
function SCard({ t, title, children, accent }: { t: T; title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div style={{ ...t.surfaceCard, padding: '18px', marginBottom: 12 }}>
      {accent ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: accent }} />
          <div style={{ fontSize: 12, fontWeight: 700, color: accent, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{title}</div>
        </div>
      ) : (
        <div style={{ fontSize: 12, fontWeight: 700, color: t.labelColor, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>{title}</div>
      )}
      {children}
    </div>
  );
}

// ─── Tag chip ─────────────────────────────────────────────────────────
function TagChip({ text, color, t }: { text: string; color: string; t: T }) {
  return (
    <span style={{ padding: '5px 12px', borderRadius: 30, fontSize: 12, fontWeight: 500, background: `${color}0d`, border: `0.5px solid ${color}22`, color, display: 'inline-block' }}>
      {text.replace(/_/g, ' ')}
    </span>
  );
}

type Tab = 'identity' | 'brand' | 'content' | 'analysis' | 'gallery' | 'settings' | 'vibe' | 'brand_kit';

// ─── Brand Kit Tab ───────────────────────────────────────────────────────────

function ColorSwatch({ hex, label }: { hex: string; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: hex,
        border: '0.5px solid rgba(0,0,0,0.12)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
      }} />
      <span style={{ fontSize: 9, opacity: 0.6, fontFamily: 'monospace' }}>{hex}</span>
      <span style={{ fontSize: 9, opacity: 0.5 }}>{label}</span>
    </div>
  );
}

function normalizeHex(value: string, fallback: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match?.[1]) return fallback;
  let hex = match[1].toLowerCase();
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  return `#${hex}`;
}

function PaletteColorEditor({
  label,
  value,
  fallback,
  onChange,
  t,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (hex: string) => void;
  t: T;
}) {
  const safe = normalizeHex(value, fallback);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
      <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 600 }}>{label}</span>
      <input
        type="color"
        value={safe}
        onChange={e => onChange(e.target.value)}
        style={{
          width: 48, height: 48, borderRadius: 12, border: 'none',
          cursor: 'pointer', padding: 2, background: 'transparent',
        }}
      />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => onChange(normalizeHex(value, safe))}
        placeholder="#000000"
        spellCheck={false}
        style={{
          width: '100%', maxWidth: 92, textAlign: 'center',
          fontSize: 10, fontFamily: 'monospace', padding: '6px 8px',
          borderRadius: 8, border: `0.5px solid ${t.separator}`,
          background: t.isDark ? '#1e1e1e' : '#f5f5f5',
          color: t.textPrimary,
        }}
      />
    </div>
  );
}

const BRAND_SAFE_FONTS = [
  'Playfair Display', 'Montserrat', 'Lora', 'Raleway', 'Cormorant Garamond',
  'DM Sans', 'DM Serif Display', 'Libre Baskerville', 'Poppins', 'Fraunces',
  'Space Grotesk', 'Inter', 'Josefin Sans', 'Syne',
] as const;

function BrandKitTab({ t, tenantId }: { t: T; tenantId: string | null }) {
  const [theme, setTheme] = React.useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [deriving, setDeriving] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<string>('');
  const [editMode, setEditMode] = React.useState(false);
  const [paletteEditMode, setPaletteEditMode] = React.useState(false);
  // Editable overrides
  const [editPrimary, setEditPrimary] = React.useState('#1a1a1a');
  const [editAccent, setEditAccent] = React.useState('#4f8ef7');
  const [editNeutral, setEditNeutral] = React.useState('#f5f5f5');
  const [editShadow, setEditShadow] = React.useState('#000000');
  const [editHeadingFont, setEditHeadingFont] = React.useState('Playfair Display');
  const [editBodyFont, setEditBodyFont] = React.useState('DM Sans');
  const [editDensity, setEditDensity] = React.useState<'minimal' | 'medium' | 'dense'>('minimal');

  const fetchTheme = React.useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/brand-context/${tenantId}/theme`, {
        headers: { 'X-Tenant-Id': tenantId },
      });
      if (r.ok) {
        const data = await r.json();
        const t2 = data.theme as Record<string, unknown> | null;
        setTheme(t2 ?? null);
        if (t2) {
          const p = t2.palette as Record<string, string> | undefined;
          const ty = t2.typography as Record<string, string> | undefined;
          if (p?.primary)  setEditPrimary(p.primary);
          if (p?.accent)   setEditAccent(p.accent);
          if (p?.neutral)  setEditNeutral(p.neutral);
          if (p?.shadow)   setEditShadow(p.shadow);
          const headingFont = ty?.headingFont ?? ty?.heading_font;
          const bodyFont = ty?.bodyFont ?? ty?.body_font;
          const density = ty?.textOverlayDensity ?? ty?.text_overlay_density;
          if (headingFont) setEditHeadingFont(headingFont);
          if (bodyFont) setEditBodyFont(bodyFont);
          if (density) setEditDensity(density as 'minimal' | 'medium' | 'dense');
        } else {
          // Tema yoksa marka renklerinden başlangıç değerlerini al
          try {
            const ctxRes = await fetch(`/api/brand-context-data/${tenantId}`);
            if (ctxRes.ok) {
              const ctx = await ctxRes.json() as Record<string, string | undefined>;
              if (ctx.brand_primary_color) setEditPrimary(ctx.brand_primary_color);
              if (ctx.brand_accent_color) setEditAccent(ctx.brand_accent_color);
            }
          } catch { /* */ }
        }
      }
    } catch { /* */ }
    setLoading(false);
  }, [tenantId]);

  const buildThemeSavePayload = React.useCallback(() => {
    if (!tenantId) return null;

    const primary = normalizeHex(editPrimary, '#1a1a1a');
    const accent = normalizeHex(editAccent, '#4f8ef7');
    const neutral = normalizeHex(editNeutral, '#f5f5f5');
    const shadow = normalizeHex(editShadow, '#000000');

    const existingPalette = theme?.palette as Record<string, unknown> | undefined;
    const existingTypography = theme?.typography as Record<string, unknown> | undefined;
    const existingComposition = theme?.composition as Record<string, unknown> | undefined;
    const existingGrading = theme?.grading as Record<string, unknown> | undefined;
    const existingLayout = theme?.layout as Record<string, unknown> | undefined;

    return {
      theme: {
        workspace_id: tenantId,
        derived_at: new Date().toISOString(),
        source: 'manual_colors',
        palette: {
          primary,
          accent,
          neutral,
          shadow,
          description: (existingPalette?.description as string) || 'Manuel renk paleti',
        },
        typography: {
          heading_font: editHeadingFont,
          body_font: editBodyFont,
          text_overlay_density: editDensity,
          personality: (existingTypography?.personality as string)
            ?? (existingTypography as Record<string, string> | undefined)?.personality
            ?? '',
        },
        composition: {
          primary_pattern: (existingComposition?.primaryPattern as string)
            ?? (existingComposition as Record<string, string> | undefined)?.primary_pattern
            ?? 'centered subject',
          text_safe_area_fraction: (existingComposition?.textSafeAreaFraction as number)
            ?? (existingComposition as Record<string, number> | undefined)?.text_safe_area_fraction
            ?? 0.6,
          subject_focus: (existingComposition?.subjectFocus as string)
            ?? (existingComposition as Record<string, string> | undefined)?.subject_focus
            ?? 'main subject sharp, background softly blurred',
        },
        grading: {
          look: (existingGrading?.look as string) ?? 'natural editorial',
          lut_directive: (existingGrading?.lutDirective as string)
            ?? (existingGrading as Record<string, string> | undefined)?.lut_directive
            ?? 'natural colors, balanced exposure',
        },
        overlay: {
          opacity: 0.25,
          color: shadow,
        },
        layout: {
          border_radius: (existingLayout?.borderRadius as number)
            ?? (existingLayout as Record<string, number> | undefined)?.border_radius
            ?? 12,
          spacing_base: (existingLayout?.spacingBase as number)
            ?? (existingLayout as Record<string, number> | undefined)?.spacing_base
            ?? 8,
          default_layout_id: (existingLayout?.defaultLayoutId as string)
            ?? (existingLayout as Record<string, string> | undefined)?.default_layout_id
            ?? 'feed_square',
        },
        caption_voice_rules: (theme?.captionVoiceRules as string[])
          ?? (theme?.caption_voice_rules as string[])
          ?? [],
        anti_patterns: (theme?.antiPatterns as string[])
          ?? (theme?.anti_patterns as string[])
          ?? [],
        contrast_valid: true,
      },
    };
  }, [
    tenantId, theme, editPrimary, editAccent, editNeutral, editShadow,
    editHeadingFont, editBodyFont, editDensity,
  ]);

  const syncBrandContextColors = async (primary: string, accent: string) => {
    if (!tenantId) return;
    await fetch(`/api/brand-context-data/${tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand_primary_color: primary,
        brand_accent_color: accent,
      }),
    }).catch(() => {/* non-fatal */});
  };

  const handleSavePalette = async (successMessage = 'Renk paleti güncellendi ✓') => {
    if (!tenantId) return;
    const payload = buildThemeSavePayload();
    if (!payload) return;

    const primary = normalizeHex(editPrimary, '#1a1a1a');
    const accent = normalizeHex(editAccent, '#4f8ef7');
    const neutral = normalizeHex(editNeutral, '#f5f5f5');
    const shadow = normalizeHex(editShadow, '#000000');
    setEditPrimary(primary);
    setEditAccent(accent);
    setEditNeutral(neutral);
    setEditShadow(shadow);

    setSaving(true);
    setStatus('Renk paleti kaydediliyor…');
    try {
      const r = await fetch(`/api/brand-context/${tenantId}/theme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        const data = await r.json();
        setTheme(data.theme ?? null);
        await syncBrandContextColors(primary, accent);
        setPaletteEditMode(false);
        setStatus(successMessage);
      } else {
        setStatus('Kayıt başarısız');
      }
    } catch { setStatus('Bağlantı hatası'); }
    setSaving(false);
    setTimeout(() => setStatus(''), 3000);
  };

  const handleSaveOverride = async () => {
    await handleSavePalette('Marka kiti güncellendi ✓');
    setEditMode(false);
  };

  React.useEffect(() => { void fetchTheme(); }, [fetchTheme]);

  const handleRederive = async () => {
    if (!tenantId) return;
    setDeriving(true);
    setStatus('Tema türetiliyor…');
    try {
      const r = await fetch(`/api/brand-context/${tenantId}/theme/derive`, {
        method: 'POST',
        headers: { 'X-Tenant-Id': tenantId },
      });
      if (r.ok) {
        const data = await r.json();
        setTheme(data.theme ?? null);
        setStatus('Tema güncellendi ✓');
      } else {
        setStatus('Hata oluştu');
      }
    } catch { setStatus('Bağlantı hatası'); }
    setDeriving(false);
    setTimeout(() => setStatus(''), 3000);
  };

  const palette = theme ? (theme.palette as Record<string, string>) : null;
  const typography = theme ? (theme.typography as Record<string, unknown>) : null;
  const grading = theme ? (theme.grading as Record<string, string>) : null;
  const displayPalette = {
    primary: palette?.primary ?? editPrimary,
    accent: palette?.accent ?? editAccent,
    neutral: palette?.neutral ?? editNeutral,
    shadow: palette?.shadow ?? editShadow,
    description: palette?.description ?? '',
  };

  const resetPaletteEdits = () => {
    if (palette) {
      if (palette.primary) setEditPrimary(palette.primary);
      if (palette.accent) setEditAccent(palette.accent);
      if (palette.neutral) setEditNeutral(palette.neutral);
      if (palette.shadow) setEditShadow(palette.shadow);
    }
    setPaletteEditMode(false);
  };

  const headingFontDisplay = (typography?.headingFont ?? typography?.heading_font ?? editHeadingFont) as string;
  const bodyFontDisplay = (typography?.bodyFont ?? typography?.body_font ?? editBodyFont) as string;
  const densityDisplay = (typography?.textOverlayDensity ?? typography?.text_overlay_density ?? editDensity) as string;
  const sourceLabel: Record<string, string> = {
    vibe_profile: 'Vibe DNA\'dan',
    visual_dna: 'Görsel Analiz\'den',
    manual_colors: 'Manuel Renkler\'den',
    sector_default: 'Sektör Varsayılanından',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 32 }}>

      {/* Header Card */}
      <SCard t={t} title="Marka Kiti" accent={t.accent}>
        <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.6, marginBottom: 16 }}>
          Vibe DNA, görsel analiz ve marka renkleri birleştirilerek otomatik türetilen tasarım token seti. Tüm üretilen görsellere ve layout şablonlarına uygulanır.
        </div>

        {theme && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 20,
            background: t.accentDim, marginBottom: 12,
          }}>
            <span style={{ fontSize: 10, color: t.accent, fontWeight: 600 }}>
              Kaynak: {sourceLabel[(theme.source as string) ?? ''] ?? (theme.source as string)}
            </span>
            {!(theme.contrastValid as boolean ?? theme.contrast_valid as boolean) && (
              <span style={{ fontSize: 10, color: '#f97316', fontWeight: 600, marginLeft: 6 }}>
                ⚠ Kontrast düzeltildi
              </span>
            )}
          </div>
        )}

        <button
          onClick={handleRederive}
          disabled={deriving || !tenantId}
          style={{
            width: '100%', padding: '12px 16px', borderRadius: 14,
            background: deriving ? t.accentDim : t.accent,
            color: '#fff', border: 'none', cursor: deriving ? 'wait' : 'pointer',
            fontSize: 13, fontWeight: 600,
          }}
        >
          {deriving ? 'Türetiliyor…' : '⟳  Yeniden Türet'}
        </button>
        {status && (
          <div style={{ marginTop: 8, fontSize: 12, color: t.textSecondary, textAlign: 'center' }}>{status}</div>
        )}
      </SCard>

      {loading && (
        <div style={{ textAlign: 'center', padding: 32, color: t.textMuted, fontSize: 13 }}>
          Yükleniyor…
        </div>
      )}

      {!loading && !theme && (
        <SCard t={t} title="Tema Yok" accent={t.warning}>
          <div style={{ fontSize: 13, color: t.textSecondary, marginBottom: 12 }}>
            Henüz otomatik tema türetilmedi. Aşağıdaki Renk Paleti bölümünden renkleri manuel kaydedebilir veya Vibe DNA analizi sonrası "Yeniden Türet" ile otomatik oluşturabilirsin.
          </div>
        </SCard>
      )}

      {palette && (
        <SCard t={t} title="Renk Paleti" accent={t.accent}>
          {!paletteEditMode ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-around', padding: '8px 0' }}>
                <ColorSwatch hex={displayPalette.primary} label="Ana Renk" />
                <ColorSwatch hex={displayPalette.accent} label="Vurgu" />
                <ColorSwatch hex={displayPalette.neutral} label="Nötr" />
                <ColorSwatch hex={displayPalette.shadow} label="Gölge" />
              </div>
              {displayPalette.description && (
                <div style={{ marginTop: 10, fontSize: 11, color: t.textMuted, textAlign: 'center', fontStyle: 'italic' }}>
                  {displayPalette.description}
                </div>
              )}
              <button
                onClick={() => setPaletteEditMode(true)}
                style={{
                  marginTop: 14, width: '100%', padding: '10px 16px', borderRadius: 12,
                  cursor: 'pointer', background: t.accentDim,
                  border: `0.5px solid ${t.accentBorder ?? t.accent}`,
                  color: t.accent, fontSize: 12, fontWeight: 600,
                }}
              >
                ✎  Renkleri Düzenle
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
                Ana ve vurgu renkleri duyuru şablonları, etkinlik kartları ve görsel üretimde kullanılır.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <PaletteColorEditor label="Ana Renk" value={editPrimary} fallback="#1a1a1a" onChange={setEditPrimary} t={t} />
                <PaletteColorEditor label="Vurgu" value={editAccent} fallback="#4f8ef7" onChange={setEditAccent} t={t} />
                <PaletteColorEditor label="Nötr" value={editNeutral} fallback="#f5f5f5" onChange={setEditNeutral} t={t} />
                <PaletteColorEditor label="Gölge" value={editShadow} fallback="#000000" onChange={setEditShadow} t={t} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button
                  onClick={() => void handleSavePalette()}
                  disabled={saving}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 12,
                    cursor: saving ? 'wait' : 'pointer',
                    background: t.accent, color: '#fff', border: 'none',
                    fontSize: 13, fontWeight: 700,
                  }}
                >
                  {saving ? 'Kaydediliyor…' : '💾 Kaydet'}
                </button>
                <button
                  onClick={resetPaletteEdits}
                  disabled={saving}
                  style={{
                    padding: '12px 16px', borderRadius: 12, cursor: 'pointer',
                    background: 'transparent', border: `0.5px solid ${t.separator}`,
                    color: t.textMuted, fontSize: 13,
                  }}
                >
                  İptal
                </button>
              </div>
            </>
          )}
        </SCard>
      )}

      {typography && (
        <SCard t={t} title="Tipografi" accent={t.accent}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 11, color: t.textMuted }}>Başlık Fontu</span>
              <span style={{
                fontSize: 18,
                fontFamily: `'${headingFontDisplay}', serif`,
                color: t.textPrimary,
                fontWeight: 600,
              }}>
                {headingFontDisplay}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 11, color: t.textMuted }}>Gövde Fontu</span>
              <span style={{
                fontSize: 14,
                fontFamily: `'${bodyFontDisplay}', sans-serif`,
                color: t.textPrimary,
              }}>
                {bodyFontDisplay}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: t.textMuted }}>Metin Yoğunluğu</span>
              <span style={{
                padding: '3px 10px', borderRadius: 20,
                background: t.accentDim, color: t.accent,
                fontSize: 11, fontWeight: 600,
              }}>
                {densityDisplay === 'minimal' ? 'Minimal'
                  : densityDisplay === 'medium' ? 'Orta'
                  : 'Yoğun'}
              </span>
            </div>
            {(typography.personality as string) && (
              <div style={{ fontSize: 11, color: t.textMuted, fontStyle: 'italic', borderTop: `0.5px solid ${t.separator}`, paddingTop: 8 }}>
                Ses tonu: {typography.personality as string}
              </div>
            )}
          </div>
        </SCard>
      )}

      {grading && (
        <SCard t={t} title="Görsel Grading" accent={t.accent}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: t.textMuted }}>Görünüm</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary }}>{grading.look}</span>
            </div>
            <div style={{
              padding: '10px 12px', borderRadius: 10,
              background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              border: `0.5px solid ${t.separator}`,
            }}>
              <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 4 }}>Image Gen Direktifi</div>
              <div style={{ fontSize: 11, color: t.textSecondary, lineHeight: 1.5 }}>{grading.lut_directive}</div>
            </div>
          </div>
        </SCard>
      )}

      {/* Manual typography override */}
      {tenantId && (
        <SCard t={t} title="Tipografi Düzenle" accent={t.accent}>
          <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 12 }}>
            Başlık ve gövde fontlarını manuel olarak ayarla. Renkler için yukarıdaki Renk Paleti bölümünü kullan.
          </div>
          <button
            onClick={() => setEditMode(v => !v)}
            style={{
              padding: '9px 16px', borderRadius: 12, cursor: 'pointer',
              background: editMode ? t.accentDim : 'transparent',
              border: `0.5px solid ${t.accentBorder ?? t.accent}`,
              color: t.accent, fontSize: 12, fontWeight: 600, width: '100%',
            }}
          >
            {editMode ? '▼ Düzenleme Modunu Kapat' : '✎  Fontları Düzenle'}
          </button>

          {editMode && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Font selectors */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: t.textMuted }}>Başlık Fontu</span>
                  <select
                    value={editHeadingFont}
                    onChange={e => setEditHeadingFont(e.target.value)}
                    style={{
                      fontSize: 12, fontFamily: `'${editHeadingFont}', serif`,
                      padding: '5px 8px', borderRadius: 8,
                      background: t.isDark ? '#1e1e1e' : '#f5f5f5',
                      color: t.textPrimary, border: `0.5px solid ${t.separator}`,
                      maxWidth: 160,
                    }}
                  >
                    {BRAND_SAFE_FONTS.map(f => <option key={f} value={f} style={{ fontFamily: `'${f}'` }}>{f}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: t.textMuted }}>Gövde Fontu</span>
                  <select
                    value={editBodyFont}
                    onChange={e => setEditBodyFont(e.target.value)}
                    style={{
                      fontSize: 12, padding: '5px 8px', borderRadius: 8,
                      background: t.isDark ? '#1e1e1e' : '#f5f5f5',
                      color: t.textPrimary, border: `0.5px solid ${t.separator}`,
                      maxWidth: 160,
                    }}
                  >
                    {BRAND_SAFE_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: t.textMuted }}>Metin Yoğunluğu</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['minimal', 'medium', 'dense'] as const).map(d => (
                      <button
                        key={d}
                        onClick={() => setEditDensity(d)}
                        style={{
                          padding: '4px 10px', borderRadius: 8, cursor: 'pointer', border: 'none',
                          fontSize: 10, fontWeight: 600,
                          background: editDensity === d ? t.accent : t.accentDim,
                          color: editDensity === d ? '#fff' : t.accent,
                        }}
                      >
                        {d === 'minimal' ? 'Min' : d === 'medium' ? 'Orta' : 'Yoğun'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Save button */}
              <button
                onClick={handleSaveOverride}
                disabled={saving}
                style={{
                  padding: '12px', borderRadius: 12, cursor: saving ? 'wait' : 'pointer',
                  background: t.accent, color: '#fff', border: 'none',
                  fontSize: 13, fontWeight: 700, marginTop: 4,
                }}
              >
                {saving ? 'Kaydediliyor…' : '💾  Değişiklikleri Kaydet'}
              </button>
            </div>
          )}
        </SCard>
      )}

      {theme && Array.isArray(theme.anti_patterns) && (theme.anti_patterns as string[]).length > 0 && (
        <SCard t={t} title="Anti-Pattern Kuralları" accent="#ef4444">
          <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 8 }}>Bu görseller üretilmemeli:</div>
          {(theme.anti_patterns as string[]).map((p, i) => (
            <div key={i} style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              padding: '6px 0', borderBottom: i < (theme.anti_patterns as string[]).length - 1 ? `0.5px solid ${t.separator}` : 'none',
            }}>
              <span style={{ color: '#ef4444', fontWeight: 700, flexShrink: 0 }}>✕</span>
              <span style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.4 }}>{p}</span>
            </div>
          ))}
        </SCard>
      )}

      {/* Layout preview */}
      {!loading && tenantId && (
        <SCard t={t} title="Layout Önizleme" accent={t.accent}>
          <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 12 }}>
            Bu markaya ait renk paleti ve tipografi ile feed post önizlemesi:
          </div>
          <div style={{
            borderRadius: 12, overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
            maxWidth: 240, margin: '0 auto',
          }}>
            {/* Mock feed card */}
            <div style={{
              width: '100%', aspectRatio: '1',
              background: displayPalette.primary,
              position: 'relative',
              display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
              padding: 16,
            }}>
              <div style={{
                position: 'absolute', inset: 0,
                background: `linear-gradient(to top, ${displayPalette.shadow ?? '#000000'}cc 0%, transparent 55%)`,
              }} />
              <div style={{ position: 'relative' }}>
                <div style={{
                  fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: displayPalette.accent, fontWeight: 600, marginBottom: 4,
                }}>
                  {typography ? (typography.personality as string)?.split(',')[0] ?? '' : ''}
                </div>
                <div style={{
                  fontFamily: `'${headingFontDisplay}', serif`,
                  fontSize: 18, fontWeight: 600,
                  color: displayPalette.neutral,
                  lineHeight: 1.2, marginBottom: 8,
                }}>
                  Marka Başlığı
                </div>
                <div style={{
                  display: 'inline-block',
                  padding: '4px 12px', borderRadius: 20,
                  background: displayPalette.accent,
                  color: '#fff', fontSize: 9, fontWeight: 700,
                }}>
                  Keşfet →
                </div>
              </div>
            </div>
          </div>
        </SCard>
      )}

    </div>
  );
}

// ─── Gallery Tab ────────────────────────────────────────────────────────────
// Patterns to auto-flag as non-product (harita, logo, footer, menu, etc.)
const AUTO_EXCLUDE = ['harita', '-map', 'map-', '_map', 'footer', 'menu.', 'fran', 'franchise',
  'bayilik', 'banner', 'icon', '-150x', '-300x', '-100x', 'logo'];

function GalleryTab({ t, tenantId, pyCtx, queryClient }: {
  t: T;
  tenantId: string;
  pyCtx: Record<string, unknown> | undefined;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStatus, setAnalyzeStatus] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [page, setPage] = useState(0);
  const [deleteMode, setDeleteMode] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  const PAGE_SIZE = 18;

  // Reference images from Python brand context
  const refUrls: string[] = (() => {
    const raw = (pyCtx as any)?.reference_image_urls ?? [];
    if (Array.isArray(raw)) return raw.filter((u: unknown) => typeof u === 'string' && (u as string).startsWith('http'));
    try { return JSON.parse(String(raw)).filter((u: unknown) => typeof u === 'string'); } catch { return []; }
  })();

  // Delete a single URL from reference_image_urls
  async function deleteImage(urlToRemove: string) {
    setDeletingUrl(urlToRemove);
    try {
      const updated = refUrls.filter(u => u !== urlToRemove);
      await fetch(`/api/brand-context-data/${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference_image_urls: JSON.stringify(updated) }),
      });
      queryClient.invalidateQueries({ queryKey: ['brand-context-data', tenantId] });
    } catch {
      /* non-fatal */
    } finally {
      setDeletingUrl(null);
    }
  }

  const { data: assets = [] } = useQuery({
    queryKey: ['media-assets-mobile', tenantId],
    queryFn: () => apiClient.getTenantMediaAssets({ officeId: '' }).catch(() => []),
    staleTime: 60_000,
    enabled: Boolean(tenantId),
  });

  // AI analyze all gallery photos — incremental: skip already-persisted entries
  async function analyzeGallery() {
    const allUrls = refUrls.length > 0 ? refUrls : assets.map((a: any) => a.url).filter(Boolean);
    const EPHEMERAL = ['cdninstagram.com', 'fbcdn.net', 'scontent-', 'instagram.f'];
    const urls = allUrls.filter((u: string) => !EPHEMERAL.some(h => u.toLowerCase().includes(h)));
    if (!urls.length) {
      setAnalyzeStatus(allUrls.length > 0
        ? 'Fotoğraflar Instagram CDN\'den geliyor (süresi dolmuş). "Markayı Yeniden Analiz Et" ile website görsellerini çek.'
        : 'Galeri boş — önce fotoğraf yükleyin.');
      return;
    }

    setAnalyzing(true);
    setAnalyzeStatus(`${urls.length} fotoğraf kontrol ediliyor…`);

    // Load persisted analysis — only analyze NEW photos
    let existingAnalysis: Record<string, unknown> = {};
    try {
      const cacheRes = await fetch(`/api/brand-context/${tenantId}/gallery-analysis`);
      if (cacheRes.ok) existingAnalysis = await cacheRes.json();
    } catch { /* proceed without cache */ }

    const normExisting = new Set(Object.keys(existingAnalysis).map(u => u.split('?')[0]));
    const newUrls = urls.filter(u => !normExisting.has(u.split('?')[0]));
    const cachedCount = urls.length - newUrls.length;

    if (newUrls.length === 0) {
      setAnalyzeStatus(`✓ ${cachedCount} fotoğraf zaten analiz edilmiş — yeniden analiz gerekmiyor.`);
      setAnalyzing(false);
      return;
    }

    setAnalyzeStatus(`${newUrls.length} yeni fotoğraf analiz ediliyor (${cachedCount} cache'den atlandı)…`);
    try {
      const BATCH = 25;
      let allResults: Array<{ url: string; contentTags?: string[]; description?: string; usageContext?: string }> = [];
      let allErrors: { url: string; error: string }[] = [];

      for (let i = 0; i < newUrls.length; i += BATCH) {
        const batch = newUrls.slice(i, i + BATCH);
        setAnalyzeStatus(`${Math.min(i + BATCH, newUrls.length)} / ${newUrls.length} yeni fotoğraf analiz ediliyor…`);
      const res = await fetch('/api/analyze-gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetUrls: batch, maxImages: BATCH, existingAnalysis }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
        const batchResults: typeof allResults = Array.isArray(data) ? data : data.results ?? [];
        allResults = allResults.concat(batchResults);
        allErrors = allErrors.concat(data.errors ?? []);
      }

      const results = allResults;
      const count = results.length;
      const errors = allErrors;
      const quotaError = errors.some((e: { error: string }) => e.error?.includes('429') || e.error?.includes('quota'));

      if (count > 0) {
      await fetch(`/api/brand-context/${tenantId}/gallery-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results }),
      }).catch((err) => console.warn('[gallery-analysis] persist failed:', err));
      }

      if (count === 0 && quotaError) {
        setAnalyzeStatus('⚠ OpenAI API kotası tükenmiş — kredi ekleyin ve tekrar deneyin.');
      } else if (count === 0 && errors.length > 0) {
        setAnalyzeStatus(`⚠ ${errors.length} fotoğraf analiz edilemedi: ${errors[0]?.error?.slice(0, 80)}`);
      } else {
        setAnalyzeStatus(`✓ ${count} yeni fotoğraf analiz edildi (${cachedCount} zaten vardı).`);
      }
      queryClient.invalidateQueries({ queryKey: ['brand-context-data', tenantId] });
    } catch (e) {
      setAnalyzeStatus(`Hata: ${e instanceof Error ? e.message : 'Bilinmeyen hata'}`);
    } finally {
      setAnalyzing(false);
    }
  }

  // Upload a new photo
  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tenantId', tenantId);
      formData.append('type', 'image');
      const res = await fetch('/api/media/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Yükleme başarısız');
      const uploaded = await res.json() as { url?: string };
      if (!uploaded.url || !uploaded.url.startsWith('http')) {
        throw new Error('Yüklenen fotoğraf URL oluşturamadı');
      }

      const updatedRefs = [uploaded.url, ...refUrls.filter(u => u !== uploaded.url)];
      await fetch(`/api/brand-context-data/${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference_image_urls: JSON.stringify(updatedRefs) }),
      });

      setAnalyzeStatus('Yeni fotoğraf analiz ediliyor…');
      let existingAnalysis: Record<string, unknown> = {};
      try {
        const cacheRes = await fetch(`/api/brand-context/${tenantId}/gallery-analysis`);
        if (cacheRes.ok) existingAnalysis = await cacheRes.json();
      } catch { /* proceed without cache */ }

      const analysisRes = await fetch('/api/analyze-gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetUrls: [uploaded.url], maxImages: 1, existingAnalysis }),
      });
      if (analysisRes.ok) {
        const data = await analysisRes.json();
        const results = Array.isArray(data?.results) ? data.results : [];
        if (results.length > 0) {
          await fetch(`/api/brand-context/${tenantId}/gallery-analysis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ results }),
          });
          setAnalyzeStatus('✓ Yeni fotoğraf galeri analizine eklendi.');
        } else {
          setAnalyzeStatus('Fotoğraf yüklendi; analiz sonucu boş döndü.');
        }
      } else {
        setAnalyzeStatus(`Fotoğraf yüklendi; analiz daha sonra tekrar denenebilir (${analysisRes.status}).`);
      }
      queryClient.invalidateQueries({ queryKey: ['media-assets-mobile', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['brand-context-data', tenantId] });
    } catch (e) {
      setAnalyzeStatus(e instanceof Error ? e.message : 'Yükleme hatası');
    } finally {
      setUploading(false);
    }
  }

  const displayUrls = refUrls.length > 0 ? refUrls : assets.map((a: any) => a.url).filter(Boolean) as string[];

  return (
    <>
      {/* AI Analiz butonu */}
      <SCard t={t} title="Fotoğraf Galerisi" accent={t.accent}>
        <p style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.6, marginBottom: 12 }}>
          AI ile tüm fotoğrafları analiz et — her görsele içerik etiketleri, kullanım bağlamı ve skorlar atanır. İçerik üretiminde doğru fotoğraf seçimi iyileşir.
        </p>
        <button
          onClick={analyzeGallery}
          disabled={analyzing}
          style={{
            width: '100%', padding: '13px 14px', borderRadius: 14, cursor: analyzing ? 'default' : 'pointer',
            background: analyzing ? t.accentDim : t.accentDim,
            border: `0.5px solid ${t.accentBorder}`,
            color: t.accent, fontSize: 13, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
          {analyzing
            ? <><div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${t.accentBorder}`, borderTop: `2px solid ${t.accent}`, animation: 'spinSlow 0.8s linear infinite' }} />Analiz ediliyor…</>
            : `✦ ${displayUrls.length} Fotoğrafı AI ile Analiz Et`}
        </button>
        {analyzeStatus && (
          <p style={{ fontSize: 12, color: analyzeStatus.startsWith('✓') ? '#10B981' : analyzeStatus.startsWith('Hata') ? '#EF4444' : t.textMuted, marginTop: 8, textAlign: 'center' }}>
            {analyzeStatus}
          </p>
        )}
      </SCard>

      {/* Upload button */}
      <SCard t={t} title="Fotoğraf Yükle">
        <label style={{
          width: '100%', padding: '13px 14px', borderRadius: 14, cursor: 'pointer',
          background: 'rgba(255,255,255,0.03)', border: `0.5px solid ${t.separator}`,
          color: t.textSecondary, fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {uploading ? '⏳ Yükleniyor…' : '📷 Yeni Fotoğraf Yükle'}
          <input type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
        </label>
        <p style={{ fontSize: 11, color: t.textMuted, textAlign: 'center', marginTop: 6 }}>
          JPG, PNG, WebP · max 10MB
        </p>
      </SCard>

      {/* Photo grid */}
      {displayUrls.length > 0 && (() => {
        const totalPages = Math.ceil(displayUrls.length / PAGE_SIZE);
        const pageUrls = displayUrls.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        const autoFlaggedCount = displayUrls.filter(u =>
          AUTO_EXCLUDE.some(p => u.toLowerCase().includes(p))).length;

        return (
          <SCard t={t} title={`Galeri (${displayUrls.length} fotoğraf)`}>
            {/* Edit mode toggle + auto-flag warning */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              {autoFlaggedCount > 0 && (
                <div style={{ flex: 1, fontSize: 11, color: t.warning,
                  background: 'rgba(245,158,11,0.08)', border: `0.5px solid rgba(245,158,11,0.2)`,
                  borderRadius: 8, padding: '6px 10px', lineHeight: 1.4 }}>
                  ⚠ {autoFlaggedCount} görsel harita/logo/footer içeriyor
                </div>
              )}
              <button onClick={() => setDeleteMode(d => !d)} style={{
                flexShrink: 0, padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
                background: deleteMode ? 'rgba(239,68,68,0.12)' : t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                border: `0.5px solid ${deleteMode ? 'rgba(239,68,68,0.3)' : t.separator}`,
                color: deleteMode ? '#F87171' : t.textMuted, fontSize: 11, fontWeight: 600,
              }}>
                {deleteMode ? '✓ Bitti' : '✎ Düzenle'}
              </button>
            </div>

            {/* Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {pageUrls.map((url, i) => {
                const isAutoFlagged = AUTO_EXCLUDE.some(p => url.toLowerCase().includes(p));
                const isDeleting = deletingUrl === url;
                return (
                  <div key={page * PAGE_SIZE + i} style={{ position: 'relative', aspectRatio: '1/1',
                    borderRadius: 10, overflow: 'hidden',
                    background: t.isDark ? '#111120' : '#E8E8EF',
                    border: isAutoFlagged && deleteMode ? '2px solid rgba(245,158,11,0.6)' : 'none',
                    opacity: isDeleting ? 0.4 : 1, transition: 'opacity 200ms' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/media-proxy?url=${encodeURIComponent(url)}`} alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0.3'; }} />

                    {/* Auto-flag badge */}
                    {isAutoFlagged && !deleteMode && (
                      <div style={{ position: 'absolute', top: 4, left: 4,
                        background: 'rgba(245,158,11,0.85)', borderRadius: 6,
                        fontSize: 8, fontWeight: 700, color: '#000', padding: '2px 5px' }}>
                        harita/logo
                      </div>
                    )}

                    {/* Delete button — shown in edit mode */}
                    {deleteMode && (
                      <button onClick={() => deleteImage(url)} disabled={isDeleting}
                        style={{
                          position: 'absolute', top: 4, right: 4, width: 24, height: 24,
                          borderRadius: '50%', border: 'none', cursor: 'pointer',
                          background: 'rgba(239,68,68,0.9)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 14, color: '#fff', fontWeight: 800, lineHeight: 1,
                        }}>
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination — only when more than one page */}
            {/* Bulk delete auto-flagged */}
            {deleteMode && autoFlaggedCount > 0 && (
              <button onClick={async () => {
                const clean = displayUrls.filter(u => !AUTO_EXCLUDE.some(p => u.toLowerCase().includes(p)));
                await fetch(`/api/brand-context-data/${tenantId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ reference_image_urls: JSON.stringify(clean) }),
                });
                queryClient.invalidateQueries({ queryKey: ['brand-context-data', tenantId] });
                setDeleteMode(false);
              }} style={{
                width: '100%', marginTop: 10, padding: '10px', borderRadius: 12, cursor: 'pointer',
                background: 'rgba(245,158,11,0.1)', border: '0.5px solid rgba(245,158,11,0.3)',
                color: t.warning, fontSize: 12, fontWeight: 700,
              }}>
                🧹 {autoFlaggedCount} harita/logo/footer görselini hepsini sil
              </button>
            )}

            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginTop: 12, padding: '8px 0' }}>
                <button
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                  style={{ padding: '7px 16px', borderRadius: 20, cursor: page === 0 ? 'default' : 'pointer',
                    background: page === 0 ? 'transparent' : t.accentDim,
                    border: `0.5px solid ${page === 0 ? t.separator : t.accentBorder}`,
                    color: page === 0 ? t.textMuted : t.accent, fontSize: 13, fontWeight: 600 }}>
                  ← Önceki
                </button>
                <span style={{ fontSize: 12, color: t.textMuted }}>
                  {page + 1} / {totalPages}
                  <span style={{ color: t.textTertiary }}> · {displayUrls.length} fotoğraf</span>
                </span>
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                  style={{ padding: '7px 16px', borderRadius: 20,
                    cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                    background: page >= totalPages - 1 ? 'transparent' : t.accentDim,
                    border: `0.5px solid ${page >= totalPages - 1 ? t.separator : t.accentBorder}`,
                    color: page >= totalPages - 1 ? t.textMuted : t.accent, fontSize: 13, fontWeight: 600 }}>
                  Sonraki →
                </button>
              </div>
            )}
          </SCard>
        );
      })()}

      {displayUrls.length === 0 && (
        <SCard t={t} title="">
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ fontSize: 32, marginBottom: 8 }}>📷</p>
            <p style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6 }}>
              Henüz galeri fotoğrafı yok.
              <br />Fotoğraf yükle veya "Markayı Yeniden Analiz Et" ile Instagram'dan çek.
            </p>
          </div>
        </SCard>
      )}
    </>
  );
}

// ─── Vibe DNA tab ──────────────────────────────────────────────────────
function VibeDnaTab({ t, tenantId, pyCtx, queryClient }: {
  t: T; tenantId: string | null; pyCtx: any; queryClient: ReturnType<typeof useQueryClient>;
}) {
  const existingVibe = (pyCtx as any)?.brand_vibe_profile as Record<string, any> | null | undefined;
  const vibeUpdatedAt = (pyCtx as any)?.brand_vibe_profile_updated_at as string | null | undefined;

  const [handles, setHandles] = useState<string[]>(
    existingVibe?.source_accounts?.length ? existingVibe.source_accounts : ['']
  );
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<Record<string, any> | null>(existingVibe ?? null);

  // Keep in sync when pyCtx reloads
  useEffect(() => {
    if (existingVibe && !result) setResult(existingVibe);
  }, [existingVibe]);

  async function extract() {
    const cleaned = handles.map(h => h.replace(/^@/, '').trim()).filter(Boolean);
    if (!cleaned.length) { setStatus('En az 1 Instagram hesabı girin.'); return; }
    if (!tenantId) { setStatus('Workspace bulunamadı.'); return; }
    setLoading(true);
    setStatus('Apify ile postlar çekiliyor…');
    try {
      const res = await fetch(`/api/brand-context/${tenantId}/extract-vibe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handles: cleaned, posts_per_handle: 10, max_images: 10, persist: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus(`Hata: ${data.message ?? data.error ?? 'Bilinmeyen hata'}`);
        return;
      }
      setResult(data.profile);
      queryClient.invalidateQueries({ queryKey: ['brand-context-data', tenantId] });
      setStatus(`✓ Tamamlandı — ${data.stats?.images_analyzed ?? '?'} görsel analiz edildi.`);
    } catch (e) {
      setStatus(`Hata: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  const swatch = (hex: string, label: string) => (
    <div key={hex} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 18, height: 18, borderRadius: 5, background: hex, flexShrink: 0, border: '1px solid rgba(0,0,0,0.1)' }} />
      <span style={{ fontSize: 11, color: t.textMuted, fontFamily: 'monospace' }}>{hex}</span>
      <span style={{ fontSize: 10, color: t.textTertiary }}>{label}</span>
    </div>
  );

  return (
    <>
      {/* Intro card */}
      <SCard t={t} title="Vibe DNA" accent={t.accent}>
        <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.6, marginBottom: 16 }}>
          Hangi ajans-kaliteli hesapların görsel tarzını taklit etmek istiyorsun? Instagram hesaplarını gir, yapay zeka görselleri analiz edip marka DNA'sını çıkaracak. Bundan sonra üretilen tüm görseller bu vibe'ı uygular.
        </div>

        {/* Handle inputs */}
        <div style={{ marginBottom: 12 }}>
          {handles.map((h, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: t.textMuted, pointerEvents: 'none' }}>@</span>
                <input
                  value={h}
                  onChange={e => { const next = [...handles]; next[i] = e.target.value; setHandles(next); }}
                  placeholder="thesummerroom.co"
                  disabled={loading}
                  style={{ width: '100%', paddingLeft: 28, paddingRight: 12, paddingTop: 11, paddingBottom: 11, borderRadius: 12, outline: 'none', boxSizing: 'border-box', fontSize: 14, background: t.isDark ? 'rgba(255,255,255,0.06)' : '#fff', border: `1px solid ${t.separator}`, color: t.textPrimary }}
                />
              </div>
              {handles.length > 1 && (
                <button onClick={() => setHandles(handles.filter((_, j) => j !== i))} disabled={loading}
                  style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)', color: '#EF4444', fontSize: 16, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  ×
                </button>
              )}
            </div>
          ))}
          {handles.length < 5 && (
            <button onClick={() => setHandles([...handles, ''])} disabled={loading}
              style={{ fontSize: 13, color: t.accent, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0', fontWeight: 600 }}>
              + hesap ekle
            </button>
          )}
        </div>

        {/* Extract button */}
        <button
          onClick={extract}
          disabled={loading || !tenantId}
          style={{ width: '100%', padding: '13px', borderRadius: 14, cursor: loading ? 'default' : 'pointer', fontWeight: 700, fontSize: 15, border: 'none', background: loading ? t.accentDim : t.accent, color: loading ? t.accent : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {loading ? (
            <>
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${t.accent}`, borderTop: '2px solid transparent', animation: 'spinSlow 0.8s linear infinite' }} />
              Analiz ediliyor…
            </>
          ) : 'Vibe DNA\'yı Çıkar'}
        </button>

        {/* Status */}
        {status && (
          <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.5,
            background: status.startsWith('✓') ? t.successDim : status.startsWith('Hata') ? 'rgba(239,68,68,0.08)' : t.accentDim,
            color: status.startsWith('✓') ? t.success : status.startsWith('Hata') ? '#EF4444' : t.accent,
            border: `0.5px solid ${status.startsWith('✓') ? t.success + '30' : status.startsWith('Hata') ? 'rgba(239,68,68,0.25)' : t.accentBorder}`,
          }}>
            {status}
          </div>
        )}
      </SCard>

      {/* Results card */}
      {result && (
        <SCard t={t} title="Çıkarılan Vibe" accent={t.success}>
          {/* Meta */}
          {(result.source_accounts?.length || vibeUpdatedAt || result.extracted_at) && (
            <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
              {result.source_accounts?.map((a: string) => (
                <span key={a} style={{ background: t.accentDim, color: t.accent, padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>@{a}</span>
              ))}
              {(result.extracted_at || vibeUpdatedAt) && (
                <span>{new Date((result.extracted_at ?? vibeUpdatedAt)!).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              )}
              {result.image_sample_count > 0 && <span>📷 {result.image_sample_count} görsel</span>}
            </div>
          )}

          {/* Palette */}
          {result.palette && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.accent, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Palet</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {swatch(result.palette.primary, 'ana renk')}
                {swatch(result.palette.accent, 'vurgu')}
                {swatch(result.palette.neutral, 'nötr')}
                {swatch(result.palette.shadow, 'gölge')}
              </div>
              {result.palette.palette_description && (
                <div style={{ fontSize: 12, color: t.textSecondary, marginTop: 8, lineHeight: 1.5 }}>{result.palette.palette_description}</div>
              )}
            </div>
          )}

          {/* Grading */}
          {result.grading && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.accent, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Renk Gradyanı</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ background: t.accentDim, color: t.accent, padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{result.grading.look}</span>
              </div>
              {result.grading.lut_directive && (
                <div style={{ fontSize: 12, color: t.textMuted, marginTop: 6, lineHeight: 1.5, fontStyle: 'italic' }}>{result.grading.lut_directive}</div>
              )}
            </div>
          )}

          {/* Composition */}
          {result.composition && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.accent, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Kompozisyon</div>
              <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.55 }}>
                {result.composition.framing_rules}
                {result.composition.subject_focus && <div style={{ marginTop: 4, color: t.textMuted, fontSize: 12 }}>{result.composition.subject_focus}</div>}
              </div>
            </div>
          )}

          {/* Content pillars */}
          {result.content_pillars_visual?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.accent, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Görsel Temalar</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {result.content_pillars_visual.map((p: string) => (
                  <span key={p} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', color: t.textSecondary }}>{p}</span>
                ))}
              </div>
            </div>
          )}

          {/* Anti-patterns */}
          {result.anti_patterns?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#EF4444', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Anti-Patterns</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {result.anti_patterns.map((p: string) => (
                  <span key={p} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '0.5px solid rgba(239,68,68,0.2)' }}>✗ {p}</span>
                ))}
              </div>
            </div>
          )}

          {/* What makes it agency level */}
          {result.what_makes_this_agency_level && (
            <div style={{ padding: '10px 12px', borderRadius: 12, background: t.successDim, border: `0.5px solid ${t.success}30` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.success, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Ajans Kalitesini Yapan</div>
              <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.55 }}>{result.what_makes_this_agency_level}</div>
            </div>
          )}
        </SCard>
      )}

      {/* Reference frames preview */}
      {result && result.reference_frames?.length > 0 && (
        <SCard t={t} title={`Referans Görseller (${result.reference_frames.length})`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {result.reference_frames.slice(0, 9).map((f: { url: string }, i: number) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={f.url} alt="" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', borderRadius: 10, display: 'block' }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            ))}
          </div>
        </SCard>
      )}
    </>
  );
}

// ─── Main component ────────────────────────────────────────────────────
export function BrandConstitution() {
  const { t } = useTheme();
  const queryClient = useQueryClient();
  const { tenantId } = useWorkspaceStore();
  const [tab, setTab] = useState<Tab>('identity');
  const [saved, setSaved] = useState(false);
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [newCompetitor, setNewCompetitor] = useState('');

  const { data: profile, isLoading } = useQuery({
    queryKey: ['company-profile', tenantId],
    queryFn: () => apiClient.getCompanyProfile(),
    staleTime: 60_000,
    enabled: Boolean(tenantId),
  });

  const { data: scoreData } = useQuery({
    queryKey: ['brand-style-score'],
    queryFn: async () => { try { return await apiClient.getBrandStyleScore(); } catch { return null; } },
    staleTime: 300_000,
  });

  const { data: pyCtx } = useQuery({
    queryKey: ['brand-context-data', tenantId],
    queryFn: () => apiClient.getBrandContextData(tenantId),
    staleTime: 5 * 60_000,
    enabled: Boolean(tenantId),
  });

  const { data: brandThemePayload } = useQuery({
    queryKey: ['brand-theme-kit', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const r = await fetch(`/api/brand-context/${tenantId}/theme`, {
        headers: { 'X-Tenant-Id': tenantId },
      });
      if (!r.ok) return null;
      return r.json() as Promise<{ theme?: Record<string, unknown> | null }>;
    },
    staleTime: 5 * 60_000,
    enabled: Boolean(tenantId),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['canva-templates'],
    queryFn: async () => { try { return await apiClient.getCanvaTemplateAssignments({ includeDisabled: false }); } catch { return []; } },
    staleTime: 120_000,
  });

  const { data: metaCampaigns = [] } = useQuery({
    queryKey: ['meta-campaigns', tenantId],
    queryFn: () => apiClient.getMetaCampaigns(tenantId),
    staleTime: 2 * 60_000,
    enabled: Boolean(tenantId),
  });

  // One-time backfill: push .NET profile fields into Python brand_context so
  // Mission Hub readiness checks (location, description, target_audience, brand_tone)
  // reflect the latest values even if the user never re-saved them.
  const backfilledRef = useRef(false);
  useEffect(() => {
    if (backfilledRef.current || !tenantId || !profile || !pyCtx) return;
    const p = profile as any;
    const b = pyCtx as any;
    const patch: Record<string, string> = {};
    if (!b.location && p.location?.trim()) patch.location = p.location.trim();
    if (!b.description && p.description?.trim()) patch.description = p.description.trim();
    if (!b.target_audience && p.targetAudience?.trim()) patch.target_audience = p.targetAudience.trim();
    if (!b.brand_tone && p.brandTone?.trim()) {
      patch.brand_tone = TONE_TO_PYTHON[p.brandTone] || p.brandTone;
    }
    if (Object.keys(patch).length === 0) { backfilledRef.current = true; return; }
    backfilledRef.current = true;
    fetch(`/api/brand-context-data/${tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['brand-context-data', tenantId] });
    }).catch(() => {/* non-fatal */});
  }, [tenantId, profile, pyCtx, queryClient]);

  // Mutation to save profile
  const saveMutation = useMutation({
    mutationFn: (data: Partial<SaveCompanyProfileRequest>) =>
      apiClient.saveCompanyProfile({ ...(profile as any), ...data } as SaveCompanyProfileRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-profile', tenantId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  // Re-analyze mutation
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const websiteUrl       = ((profile as any)?.websiteUrl ?? '').trim();
      const instagramHandle  = ((profile as any)?.instagramHandle ?? '').trim();
      const googleUrl        = ((profile as any)?.googleBusinessUrl ?? '').trim();

      // Step 1: Refresh .NET profile using live discovery data when URLs exist.
      if (websiteUrl || instagramHandle || googleUrl) {
        try {
          const discovery = await apiClient.discoverBrand({
            websiteUrl: websiteUrl || undefined,
            instagramHandle: instagramHandle || undefined,
            googleBusinessUrl: googleUrl || undefined,
            applyToProfile: true,
          });
          const r = discovery?.report;
          const current = profile as any;
          if (r) {
            const summary = `${r.brandName || current?.brandName || 'Marka'} için sektör ${r.industry || 'general_business'} olarak analiz edildi. Öncelikli hedefler: ${(r.primaryGoals ?? []).slice(0, 3).join(', ') || 'bilinirlik'}. Önerilen sosyal medya ihtiyaçları: ${(r.contentPillars ?? []).slice(0, 5).join(', ') || 'daily_story'}.`;
            await apiClient.saveCompanyProfile({
              ...current,
              brandName: r.brandName || current?.brandName || '',
              industry: r.industry || current?.industry || '',
              brandTone: r.brandTone || current?.brandTone || '',
              targetAudience: Array.isArray(r.targetAudience) ? r.targetAudience.join(', ') : (current?.targetAudience || ''),
              visualStyle: r.visualStyle || current?.visualStyle || '',
              campaignGoals: Array.isArray(r.primaryGoals) ? r.primaryGoals.join(', ') : (current?.campaignGoals || ''),
              websiteUrl: websiteUrl || current?.websiteUrl || '',
              instagramHandle: instagramHandle || current?.instagramHandle || '',
              googleBusinessUrl: googleUrl || current?.googleBusinessUrl || '',
              description: r.websiteSummary || current?.description || '',
              contentNeeds: Array.isArray(r.contentPillars) ? JSON.stringify(r.contentPillars) : (current?.contentNeeds || ''),
              riskRules: r.riskRules && Object.keys(r.riskRules).length ? JSON.stringify(r.riskRules) : (current?.riskRules || ''),
              customerVisibleSummary: summary,
              languages: discovery?.inferredLanguage || current?.languages || 'tr',
            } as SaveCompanyProfileRequest);
          }
        } catch {
          await apiClient.analyzeBrand();
        }
      } else {
        await apiClient.analyzeBrand();
      }

      // Step 2: Python deep crawl — only if we have at least a website or Instagram URL
      if (tenantId && (websiteUrl || instagramHandle)) {
        await apiClient.analyzeBrandContext(tenantId, {
          websiteUrl,
          instagramHandle,
          googleBusinessUrl: googleUrl,
        }).catch(() => {/* non-fatal */});
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-profile', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['brand-context-data', tenantId] });
    },
  });

  useEffect(() => {
    if (!showMoreSheet) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, [showMoreSheet]);

  if (isLoading || !profile) {
    return (
      <div style={{ height: '100dvh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: `2px solid ${t.separator}`, borderTop: `2px solid ${t.accent}`, animation: 'spinSlow 1s linear infinite' }} />
        <div style={{ fontSize: 13, color: t.textMuted }}>Marka profili yükleniyor</div>
      </div>
    );
  }

  const p = profile as CompanyProfile & Record<string, unknown>;
  const brandNameDisplay = String(p.brandName || (pyCtx as any)?.business_name || '');
  const industryDisplay = String(p.industry || (pyCtx as any)?.industry || (pyCtx as any)?.business_type || '');
  const locationDisplay = String(p.location || (pyCtx as any)?.location || '');
  const websiteDisplay = String(p.websiteUrl || (pyCtx as any)?.website_url || '');
  const instagramDisplay = String((p as any).instagramHandle || (pyCtx as any)?.instagram_handle || '');
  const descriptionDisplay = String(p.description || (pyCtx as any)?.description || (pyCtx as any)?.website_summary || '');
  const score         = scoreData?.score ?? (p as any).discoveryConfidence ?? 0;
  const logoCandidate = p.logoUrl || (pyCtx as any)?.logo_url || '';
  const logoUrl       = typeof logoCandidate === 'string' && logoCandidate.startsWith('http') ? logoCandidate : null;
  const contentNeeds  = parseArr((p as any).contentNeeds);
  const templateFams  = parseArr((p as any).templateFamilies);
  const riskRules     = parseObj((p as any).riskRules);
  const brandImages   = parseArr((p as any).brandImageUrls).filter(u => u.startsWith('http'));

  const announcementSamplePhoto =
    brandImages[0]
    ?? parseArr((pyCtx as { reference_image_urls?: unknown })?.reference_image_urls).find((u) => u.startsWith('http'))
    ?? null;

  const announcementBrandKit = resolveAnnouncementBrandKit({
    brandContext: (pyCtx ?? {}) as Record<string, unknown>,
    companyProfile: p as Record<string, unknown>,
    brandTheme: brandThemePayload?.theme ?? null,
  });

  const announcementLibrarySection = (
    <AnnouncementTemplateLibrarySection
      t={t}
      tenantId={tenantId}
      brandKit={announcementBrandKit}
      samplePhotoUrl={announcementSamplePhoto}
      sectorId={normalizeSectorId(industryDisplay)}
    />
  );

  // Field save helper
  // Tone preset → Turkish writing rule label for Python
  const TONE_TO_PYTHON: Record<string, string> = {
    professional: 'profesyonel, güvenilir, net',
    friendly:     'samimi, sıcak, kişisel',
    energetic:    'enerjik, dinamik, heyecanlı',
    luxury:       'premium, zarif, sofistike',
    casual:       'rahat, gündelik, doğal',
  };

  // .NET camelCase field → Python snake_case field mapping for fields the
  // Mission Hub readiness check reads from Python brand_contexts.
  const PYTHON_FIELD_MAP: Record<string, string> = {
    location:       'location',
    description:    'description',
    targetAudience: 'target_audience',
    brandTone:      'brand_tone',
    primaryFont:    'brand_font_family',
    logoUrl:        'logo_url',
  };

  function patchPythonBrandFields(body: Record<string, unknown>) {
    if (!tenantId) return;
    fetch(`/api/brand-context-data/${tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['brand-context-data', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
    }).catch(() => {/* non-fatal */});
  }

  function syncToPython(field: string, value: string) {
    if (!tenantId) return;

    if (field === 'brandColors') {
      const hex = value.match(/#[0-9a-fA-F]{3,8}\b/)?.[0];
      if (hex) patchPythonBrandFields({ brand_primary_color: hex });
      return;
    }
    if (field === 'accentColors') {
      const hex = value.match(/#[0-9a-fA-F]{3,8}\b/)?.[0];
      if (hex) patchPythonBrandFields({ brand_accent_color: hex });
      return;
    }

    const pythonKey = PYTHON_FIELD_MAP[field];
    if (!pythonKey) return;

    let pythonValue = value;
    if (field === 'brandTone') pythonValue = TONE_TO_PYTHON[value] || value;

    patchPythonBrandFields({ [pythonKey]: pythonValue });
  }

  function save(field: string) {
    return (value: string) => {
      saveMutation.mutate({ [field]: value } as any);

      // Sync mission-critical fields to Python so StrategistAgent has the latest values
      syncToPython(field, value);

      // Languages need the dedicated /set-language endpoint (not the generic PATCH)
      if (field === 'languages' && tenantId) {
        fetch(`/api/brand-context/${tenantId}/set-language`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: value }),
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ['brand-context-data', tenantId] });
          queryClient.invalidateQueries({ queryKey: ['python-brand-ctx-display', tenantId] });
        }).catch(() => {/* non-fatal */});
      }
    };
  }

  // Primary tabs (5) + overflow sheet (analysis, settings) — reduces horizontal tab crowding
  const TABS: { id: Tab; label: string }[] = [
    { id: 'identity',  label: 'Kimlik'    },
    { id: 'brand',     label: 'Marka'     },
    { id: 'content',   label: 'İçerik'   },
    { id: 'vibe',      label: 'Vibe DNA'  },
    { id: 'brand_kit', label: 'Marka Kiti' },
  ];
  const MORE_TABS: { id: Tab; label: string; icon: string; sub: string }[] = [
    { id: 'gallery',  label: 'Galeri',  icon: '🖼',  sub: 'Marka fotoğrafları & galeri yönetimi' },
    { id: 'analysis', label: 'Analiz',  icon: '📊', sub: 'AI değerlendirmesi & sistem analizi' },
    { id: 'settings', label: 'Ayarlar', icon: '⚙',  sub: 'Yapay zekâ ve gelişmiş tercihler' },
  ];
  const isMoreTab = MORE_TABS.some(m => m.id === tab);

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 96, transition: 'background 250ms' }}>

      {/* ── HEADER ── */}
      <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 20px) 22px 0', borderBottom: `0.5px solid ${t.separator}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
          {/* Logo */}
          <div style={{ width: 54, height: 54, borderRadius: 15, overflow: 'hidden', flexShrink: 0, background: t.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: t.isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.08)' }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={brandNameDisplay} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <span style={{ fontSize: 18, fontWeight: 800, color: t.accent }}>
                {(brandNameDisplay || 'B').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.025em', marginBottom: 4, lineHeight: 1.15 }}>{brandNameDisplay || 'Marka profili'}</h1>
            <div style={{ fontSize: 12, color: t.textTertiary }}>{industryDisplay || 'Sektör'} · {locationDisplay || 'Konum'}</div>
          </div>

          {/* Score ring */}
          <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
            <svg width="44" height="44" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="22" cy="22" r="17" fill="none" stroke={t.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)'} strokeWidth="5" />
              <circle cx="22" cy="22" r="17" fill="none" stroke={t.accent} strokeWidth="5"
                strokeDasharray={`${(score / 100) * 106.8} 106.8`} strokeLinecap="round" />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: t.accent }}>{score}</div>
          </div>
        </div>

        {/* Save success */}
        {saved && (
          <div style={{ marginBottom: 10, padding: '8px 14px', borderRadius: 10, background: t.successDim, border: `0.5px solid ${t.success}25`, fontSize: 13, color: t.success, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            ✓ Kaydedildi
          </div>
        )}

        {/* Saving indicator */}
        {saveMutation.isPending && (
          <div style={{ marginBottom: 10, fontSize: 12, color: t.accent, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', border: `1.5px solid ${t.accent}`, borderTop: '1.5px solid transparent', animation: 'spinSlow 0.8s linear infinite' }} />
            Kaydediliyor...
          </div>
        )}

        {/* Tab bar — 4 primary tabs + "Daha Fazla" entry for analysis/settings */}
        <div style={{ display: 'flex', gap: 0, marginLeft: -22, paddingLeft: 22, paddingRight: 22 }}>
          {TABS.map(tb => {
            const isActive = tab === tb.id;
            return (
              <button key={tb.id} onClick={() => setTab(tb.id)}
                aria-current={isActive ? 'page' : undefined}
                style={{ flex: 1, padding: '12px 6px', fontSize: 13, fontWeight: isActive ? 700 : 500,
                  color: isActive ? t.accent : t.textTertiary, background: 'transparent',
                  border: 'none', cursor: 'pointer', position: 'relative' }}>
                {tb.label}
                {isActive && <div style={{ position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2, borderRadius: '2px 2px 0 0', background: t.accent }} />}
              </button>
            );
          })}
          {/* Daha Fazla — opens bottom sheet */}
          <button onClick={() => setShowMoreSheet(true)}
            aria-haspopup="dialog"
            aria-current={isMoreTab ? 'page' : undefined}
            style={{ flex: 1, padding: '12px 6px', fontSize: 13,
              fontWeight: isMoreTab ? 700 : 500,
              color: isMoreTab ? t.accent : t.textTertiary,
              background: 'transparent', border: 'none', cursor: 'pointer',
              position: 'relative', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 4 }}>
            <span>Daha Fazla</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke={isMoreTab ? t.accent : t.textTertiary}
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            {isMoreTab && <div style={{ position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2, borderRadius: '2px 2px 0 0', background: t.accent }} />}
          </button>
        </div>
      </div>

      {/* ── DAHA FAZLA BOTTOM SHEET — portal: ebeveyn .screen-enter transform'u fixed'i kırıyordu; panel viewport dışında kalıyordu ── */}
      {showMoreSheet &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="brand-more-sheet-title"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 400,
              background: 'rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'flex-end',
              overscrollBehavior: 'contain',
            }}
            onClick={() => setShowMoreSheet(false)}>
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%',
                maxHeight: 'min(85dvh, 520px)',
                overflowY: 'auto',
                borderRadius: '20px 20px 0 0',
                background: t.isDark ? '#0d0d1a' : '#fff',
                border: `0.5px solid ${t.separator}`,
                padding: '20px 20px calc(env(safe-area-inset-bottom,0px) + 24px)',
                WebkitOverflowScrolling: 'touch',
              }}>
              <div style={{ width: 36, height: 4, borderRadius: 2,
                background: t.separator, margin: '0 auto 16px' }} />
              <p id="brand-more-sheet-title" style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary,
                marginBottom: 14 }}>Marka Detayları</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {MORE_TABS.map(m => {
                  const isSelected = tab === m.id;
                  return (
                    <button key={m.id}
                      onClick={() => { setTab(m.id); setShowMoreSheet(false); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 12,
                        padding: '13px 14px', borderRadius: 14, cursor: 'pointer',
                        background: isSelected
                          ? (t.isDark ? 'rgba(124,58,237,0.1)' : 'rgba(124,58,237,0.06)')
                          : 'transparent',
                        border: `0.5px solid ${isSelected ? t.accentBorder : 'transparent'}`,
                        textAlign: 'left' as const }}>
                      <span style={{ fontSize: 20, width: 32, textAlign: 'center' as const }}>{m.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600,
                          color: isSelected ? t.accent : t.textPrimary }}>{m.label}</div>
                        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{m.sub}</div>
                      </div>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                        stroke={t.textTertiary} strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setShowMoreSheet(false)}
                style={{ width: '100%', marginTop: 12, padding: '13px',
                  borderRadius: 14, cursor: 'pointer',
                  background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                  border: 'none', color: t.textMuted, fontSize: 13, fontWeight: 600 }}>
                İptal
              </button>
            </div>
          </div>,
          document.body,
        )}

      {/* ── TAB CONTENT ── */}
      <div style={{ padding: '16px 22px 0' }}>

        {/* IDENTITY */}
        {tab === 'identity' && (
          <>
            <button
              type="button"
              onClick={() => setTab('brand_kit')}
              style={{
                width: '100%',
                marginBottom: 14,
                padding: '14px 16px',
                borderRadius: 14,
                border: `0.5px solid ${t.accentBorder}`,
                background: t.accentDim,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: t.accent, marginBottom: 4 }}>
                🎨 Duyuru Tasarım Kütüphanesi
              </div>
              <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.4 }}>
                Etkinlik story, kampanya ve duyuru şablonlarını önizle → Marka Kiti sekmesinde
              </div>
            </button>

            <SCard t={t} title="Temel Bilgiler">
              <Field t={t} label="Marka Adı"  value={brandNameDisplay} onSave={save('brandName')} />
              <Field t={t} label="Sektör"      value={industryDisplay}  onSave={save('industry')} />
              <Field t={t} label="Konum"        value={locationDisplay}  onSave={save('location')} />
              <Field t={t} label="Web Sitesi"   value={websiteDisplay} onSave={save('websiteUrl')} />
              <Field t={t} label="Instagram Handle" value={instagramDisplay} onSave={save('instagramHandle')} hint="örn: sunuevent (@ olmadan)" />
              <Field t={t} label="Google Business URL" value={(p as any).googleBusinessUrl ?? ''} onSave={save('googleBusinessUrl')} />
              {/* Language toggle: TR / EN */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, color: t.textSecondary, fontWeight: 500 }}>İçerik Dili</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['tr', 'en'] as const).map(lang => {
                    const active = (p.languages ?? 'tr') === lang;
                    return (
                      <button
                        key={lang}
                        onClick={() => save('languages')(lang)}
                        style={{
                          flex: 1,
                          padding: '10px 0',
                          borderRadius: 10,
                          border: `1.5px solid ${active ? t.accent : t.separator}`,
                          background: active ? `${t.accent}18` : t.surface,
                          color: active ? t.accent : t.textSecondary,
                          fontWeight: active ? 700 : 400,
                          fontSize: 15,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        {lang === 'tr' ? '🇹🇷 Türkçe' : '🇬🇧 English'}
                      </button>
                    );
                  })}
                </div>
              </div>
            </SCard>

            <SCard t={t} title="Marka Açıklaması">
              <Field t={t} label="Açıklama" value={descriptionDisplay} onSave={save('description')} multiline hint="Markanızı tanımlayan birkaç cümle..." />
            </SCard>

            <SCard t={t} title="Logo & Görseller">
              <Field t={t} label="Logo URL" value={String(logoCandidate || '')} onSave={save('logoUrl')} />
              <Field t={t} label="Marka Görselleri (virgülle)" value={(p as any).brandImageUrls ?? ''} onSave={save('brandImageUrls')} hint="https://..." multiline />
              {brandImages.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  {brandImages.slice(0, 6).map((url, i) => (
                    <div key={i} style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', background: t.isDark ? '#121220' : '#F0F0F6' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                    </div>
                  ))}
                </div>
              )}
            </SCard>
          </>
        )}

        {/* BRAND */}
        {tab === 'brand' && (
          <>
            {/* ── Ürünler & Hizmetler — agents için en kritik alan ── */}
            <SCard t={t} title="Ürünler & Hizmetler" accent="#10B981">
              <p style={{ fontSize: 11, color: t.textMuted, marginBottom: 10, lineHeight: 1.5 }}>
                Bu alan ajanların ürettiği içeriklerin kalitesini doğrudan etkiler. Ne sattığınızı, hangi ürün/hizmetleriniz olduğunu, fiyat aralıklarını ve özel özelliklerinizi yazın.
              </p>
              <Field t={t} label="Ürün / Hizmet Kataloğu"
                value={p.description || (pyCtx as any)?.description || ''}
                onSave={save('description')}
                multiline
                hint="örn: Erken hasat sızma zeytinyağı (500ml-5lt), kekik balı, akasya balı, çam balı, Datça bademi, kuru incir. Hepsi Datça'dan, üreticiden direkt."
              />
              <Field t={t} label="Kampanya Hedefleri & Müşteri Profili"
                value={p.campaignGoals || (pyCtx as any)?.campaign_goals || ''}
                onSave={save('campaignGoals')}
                multiline
                hint="örn: Online siparişleri artır. Yöresel ürün arayan bilinçli tüketiciler, hediye almak isteyen ziyaretçiler, sağlıklı beslenmeye önem verenler."
              />
            </SCard>

            <SCard t={t} title="Ses & Ton">
              <div>
                <p style={{ fontSize: 11, color: t.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                  Marka Tonu
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                  {TONE_OPTIONS.map(opt => {
                    const isSelected = (p.brandTone ?? 'professional') === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => save('brandTone')(opt.value)}
                        style={{
                          padding: '10px 4px', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
                          background: isSelected ? 'rgba(99,102,241,0.14)' : (t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'),
                          border: `1px solid ${isSelected ? 'rgba(99,102,241,0.4)' : t.separator}`,
                          transition: 'all 0.15s',
                        }}>
                        <div style={{ fontSize: 18, marginBottom: 3 }}>{opt.emoji}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: isSelected ? '#a78bfa' : t.textSecondary }}>{opt.label}</div>
                        <div style={{ fontSize: 9, color: t.textMuted, marginTop: 1, lineHeight: 1.2 }}>{opt.desc}</div>
                      </button>
                    );
                  })}
                </div>
                {p.brandTone && !TONE_OPTIONS.find(o => o.value === p.brandTone) && (
                  <p style={{ fontSize: 11, color: t.textMuted, marginTop: 6 }}>
                    Özel ton: <span style={{ color: t.textSecondary }}>{p.brandTone}</span>
                  </p>
                )}
              </div>
            </SCard>

            <SCard t={t} title="Görsel Dil">
              <Field t={t} label="Görsel Stil" value={p.visualStyle || (pyCtx as any)?.visual_style || ''} onSave={save('visualStyle')} multiline hint="örn: minimal, luxury, cinematic..." />
            </SCard>

            <SCard t={t} title="Hedef Kitle">
              <Field t={t} label="Hedef Kitle" value={p.targetAudience || (pyCtx as any)?.target_audience || ''} onSave={save('targetAudience')} multiline hint="Kim için üretiyoruz?" />
            </SCard>

            <SCard t={t} title="Kampanya Hedefleri">
              <Field t={t} label="Hedefler" value={p.campaignGoals || (pyCtx as any)?.campaign_goals || ''} onSave={save('campaignGoals')} multiline hint="Ne başarmak istiyoruz?" />
            </SCard>

            <SCard t={t} title="Rakipler">
              {(() => {
                const confirmedRaw = p.competitors || (pyCtx as any)?.competitors || '';
                const confirmed: string[] = confirmedRaw
                  ? confirmedRaw.split(',').map((s: string) => s.trim()).filter(Boolean)
                  : [];
                const suggestedRaw = (pyCtx as any)?.suggested_competitors || '';
                let suggested: string[] = [];
                try { suggested = JSON.parse(suggestedRaw); } catch { suggested = []; }
                const unconfirmedSuggestions = suggested.filter((s: string) => !confirmed.includes(s));

                const saveCompetitors = (list: string[]) => {
                  save('competitors')(list.join(', '));
                };
                const addCompetitor = (name: string) => saveCompetitors([...confirmed, name]);
                const removeCompetitor = (name: string) => saveCompetitors(confirmed.filter(c => c !== name));


                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Confirmed chips */}
                    {confirmed.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {confirmed.map((name: string) => (
                          <div key={name} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '6px 12px', borderRadius: 20,
                            background: `${t.accent}20`, border: `1.5px solid ${t.accent}`,
                            color: t.accent, fontSize: 13, fontWeight: 500,
                          }}>
                            {name}
                            <button onClick={() => removeCompetitor(name)} style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: t.accent, fontSize: 16, lineHeight: 1, padding: 0,
                            }}>×</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* AI suggestions */}
                    {unconfirmedSuggestions.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <span style={{ fontSize: 11, color: t.textSecondary, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          AI Önerileri
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {unconfirmedSuggestions.map((name: string) => (
                            <button key={name} onClick={() => addCompetitor(name)} style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              padding: '6px 12px', borderRadius: 20,
                              background: t.surface, border: `1.5px dashed ${t.separator}`,
                              color: t.textSecondary, fontSize: 13, cursor: 'pointer',
                              transition: 'all 0.15s',
                            }}>
                              + {name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Manual add */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={newCompetitor}
                        onChange={e => setNewCompetitor(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && newCompetitor.trim()) {
                            addCompetitor(newCompetitor.trim());
                            setNewCompetitor('');
                          }
                        }}
                        placeholder="Rakip ekle… (Enter)"
                        style={{
                          flex: 1, padding: '8px 12px', borderRadius: 10,
                          border: `1.5px solid ${t.separator}`, background: t.surface,
                          color: t.textPrimary, fontSize: 13, outline: 'none',
                        }}
                      />
                      <button
                        onClick={() => {
                          if (newCompetitor.trim()) { addCompetitor(newCompetitor.trim()); setNewCompetitor(''); }
                        }}
                        style={{
                          padding: '8px 14px', borderRadius: 10,
                          background: t.accent, border: 'none',
                          color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600,
                        }}
                      >+</button>
                    </div>

                    {confirmed.length === 0 && unconfirmedSuggestions.length === 0 && (
                      <span style={{ fontSize: 12, color: t.textSecondary }}>
                        Rakip bulunamadı. Yukarıdan manuel ekleyebilirsin.
                      </span>
                    )}
                  </div>
                );
              })()}
            </SCard>

            <SCard t={t} title="Tipografi">
              <Field t={t} label="Ana Font"
                value={p.primaryFont || (pyCtx as any)?.brand_font_family || ''}
                onSave={save('primaryFont')} hint="örn: Nunito, Playfair Display" />
              <Field t={t} label="İkincil Font"
                value={p.secondaryFont || ''}
                onSave={save('secondaryFont')} hint="örn: Lato, Inter" />
            </SCard>

            <SCard t={t} title="Renkler">
              {/* Colour swatches from brand context */}
              {((pyCtx as any)?.brand_primary_color || (pyCtx as any)?.brand_accent_color) && (
                <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                  {[(pyCtx as any)?.brand_primary_color, (pyCtx as any)?.brand_accent_color].filter(Boolean).map((hex: string) => (
                    <div key={hex} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: hex,
                        border: `0.5px solid ${t.separator}`, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: t.textSecondary, fontFamily: 'monospace' }}>{hex}</span>
                    </div>
                  ))}
                </div>
              )}
              <Field t={t} label="Ana Renkler (hex, virgülle)"
                value={p.brandColors || [(pyCtx as any)?.brand_primary_color, (pyCtx as any)?.brand_accent_color].filter(Boolean).join(', ') || ''}
                onSave={save('brandColors')} hint="#1B4D6E, #F5A623" />
              <Field t={t} label="Vurgu Renkleri"
                value={p.accentColors || (pyCtx as any)?.brand_accent_color || ''}
                onSave={save('accentColors')} hint="#F5A623" />
            </SCard>
          </>
        )}

        {/* CONTENT */}
        {tab === 'content' && (
          <>
            {announcementLibrarySection}

            <SCard t={t} title="Özel Kurallar" accent={t.warning}>
              <Field t={t} label="Özel Kurallar & Kısıtlamalar" value={p.customRules ?? ''} onSave={save('customRules')} multiline hint="Yapılmaması gerekenler, özel talimatlar..." />
            </SCard>

            {Object.keys(riskRules).length > 0 && (
              <SCard t={t} title="Risk Kuralları" accent={t.danger}>
                <div style={{ marginBottom: 12 }}>
                  {Object.entries(riskRules).map(([key, value], i) => {
                    const isForbid = String(value).includes('forbid') || String(value).includes('block');
                    const isApproval = String(value).includes('approval');
                    const color = isForbid ? t.danger : isApproval ? t.warning : t.success;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: `${color}07`, border: `0.5px solid ${color}20`, marginBottom: 8 }}>
                        <span style={{ fontSize: 13, color, flexShrink: 0 }}>{isForbid ? '⛔' : isApproval ? '⚑' : '✓'}</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary }}>{key.replace(/_/g, ' ')}</div>
                          <div style={{ fontSize: 12, color, fontWeight: 500 }}>{String(value).replace(/_/g, ' ')}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Field t={t} label="Risk Kuralları (JSON)" value={JSON.stringify(riskRules, null, 2)} onSave={save('riskRules')} multiline />
              </SCard>
            )}

            {contentNeeds.length > 0 && (
              <SCard t={t} title="İçerik İhtiyaçları">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                  {contentNeeds.map(cn => <TagChip key={cn} text={cn} color="#34D399" t={t} />)}
                </div>
              </SCard>
            )}

            {templateFams.length > 0 && (
              <SCard t={t} title="Template Aileleri">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {templateFams.map((tf, i) => (
                    <div key={i} style={{ fontSize: 12, color: t.textTertiary, padding: '8px 12px', borderRadius: 10, background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', fontFamily: 'monospace' }}>
                      {tf}
                    </div>
                  ))}
                </div>
              </SCard>
            )}

            {templates.length > 0 && (
              <SCard t={t} title={`Canva Şablonları (${templates.length})`}>
                {(templates as any[]).slice(0, 8).map((tmpl, i) => (
                  <div key={tmpl.id ?? i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', borderBottom: i < templates.length - 1 ? `0.5px solid ${t.separator}` : 'none' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary, marginBottom: 2 }}>{tmpl.title ?? `Şablon ${i + 1}`}</div>
                      {tmpl.contentKinds?.length > 0 && <div style={{ fontSize: 11, color: t.textMuted }}>{tmpl.contentKinds.slice(0, 2).join(', ')}</div>}
                    </div>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: tmpl.enabled ? t.successDim : (t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'), color: tmpl.enabled ? t.success : t.textMuted, fontWeight: 600 }}>
                      {tmpl.enabled ? 'Aktif' : 'Pasif'}
                    </span>
                  </div>
                ))}
              </SCard>
            )}
          </>
        )}

        {/* ANALYSIS */}
        {tab === 'analysis' && (
          <>
            {/* Re-analyze button */}
            <button
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
              style={{ width: '100%', padding: '14px', borderRadius: 16, cursor: 'pointer', marginBottom: 14, background: t.accentDim, border: `0.5px solid ${t.accentBorder}`, color: t.accent, fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {analyzeMutation.isPending ? (
                <><div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${t.accent}40`, borderTop: `2px solid ${t.accent}`, animation: 'spinSlow 0.8s linear infinite' }} /> Analiz Ediliyor...</>
              ) : '✦ Markayı Yeniden Analiz Et'}
            </button>

            <SCard t={t} title="AI Değerlendirmesi" accent={t.accent}>
              <InfoRow t={t} label="Tamamlanma Skoru" value={`${score}%`} color={t.accent} />
              {(p as any).customerVisibleSummary && (
                <InfoRow t={t} label="Özet" value={(p as any).customerVisibleSummary} />
              )}
              {(p as any).brandAnalyzedAt && (
                <InfoRow t={t} label="Son Analiz" value={new Date((p as any).brandAnalyzedAt).toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
              )}
            </SCard>

            {/* Sistem Analizi — Python brand context (live, authoritative) */}
            <SCard t={t} title="Sistem Analizi">
              {pyCtx ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <InfoRow t={t} label="Sektör (Python)" value={pyCtx.industry ?? (pyCtx as any).business_type ?? '—'} color={t.accent} />
                  <InfoRow t={t} label="Ton" value={pyCtx.brand_tone ?? '—'} />
                  <InfoRow t={t} label="Lokasyon" value={pyCtx.location ?? '—'} />
                  <InfoRow t={t} label="Hedef Kitle" value={(pyCtx as any).target_audience ?? '—'} />
                  <InfoRow t={t} label="Content Pillars"
                    value={(() => {
                      const cp = pyCtx.content_pillars;
                      if (Array.isArray(cp)) return cp.join(', ');
                      if (typeof cp === 'string' && (cp as string).trim().startsWith('[')) {
                        try { const p = JSON.parse(cp); return Array.isArray(p) ? p.join(', ') : cp; } catch {}
                      }
                      return cp ? String(cp) : '—';
                    })()} />
                  <InfoRow t={t} label="Visual DNA"
                    value={(() => {
                      const vd = (pyCtx as any).visual_dna || (pyCtx as any).visual_style;
                      return vd ? String(vd).slice(0, 140) + (String(vd).length > 140 ? '…' : '') : '—';
                    })()} />
                </div>
              ) : (
                <p style={{ fontSize: 12, color: t.textMuted }}>Yükleniyor…</p>
              )}
            </SCard>

            {/* Marka Analiz Raporu — tüm analiz verisi */}
            <SCard t={t} title="Marka Analiz Raporu">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Website summary — full crawl output */}
                {pyCtx?.website_summary && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, color: t.accent, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                      🌐 Website Crawl
                    </p>
                    <pre style={{ fontSize: 11, color: t.textSecondary, lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', padding: '10px 12px', borderRadius: 10 }}>
                      {/* Safe HTML entity decode via <textarea> — no DOM parsing, no XSS exposure */}
                      {typeof document !== 'undefined'
                        ? (() => {
                            const ta = document.createElement('textarea');
                            ta.innerHTML = String(pyCtx.website_summary);
                            return ta.value || String(pyCtx.website_summary);
                          })()
                        : String(pyCtx.website_summary)}
                    </pre>
                  </div>
                )}

                {/* Instagram bio */}
                {pyCtx?.instagram_bio && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#E1306C', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                      📸 Instagram Bio
                    </p>
                    <p style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.6, background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', padding: '10px 12px', borderRadius: 10, margin: 0 }}>
                      {pyCtx.instagram_bio}
                    </p>
                  </div>
                )}

                {/* Visual DNA */}
                {pyCtx?.visual_dna && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#A78BFA', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                      🎨 Visual DNA
                    </p>
                    <p style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.6, background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', padding: '10px 12px', borderRadius: 10, margin: 0 }}>
                      {pyCtx.visual_dna}
                    </p>
                  </div>
                )}

                {/* Fallback: .NET brandAnalysis */}
                {!pyCtx?.website_summary && (p as any).brandAnalysis && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                      📋 Analiz (eski)
                    </p>
                    <pre style={{ fontSize: 11, color: t.textTertiary, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {String((p as any).brandAnalysis)}
                    </pre>
                  </div>
                )}

                {!pyCtx?.website_summary && !pyCtx?.instagram_bio && !(p as any).brandAnalysis && (
                  <p style={{ fontSize: 12, color: t.textMuted, textAlign: 'center', padding: '16px 0' }}>
                    Henüz analiz yapılmadı. "Markayı Yeniden Analiz Et" butonuna bas.
                  </p>
                )}
              </div>
            </SCard>

            {/* ── Meta Reklamları Özeti ── */}
            <SCard t={t} title="📣 Meta Reklamları">
              {metaCampaigns.length === 0 ? (
                <div style={{ padding: '8px 0', textAlign: 'center' }}>
                  <p style={{ fontSize: 12, color: t.textMuted, marginBottom: 10, lineHeight: 1.6 }}>
                    Henüz kampanya yok. Onaylı bir içerikten "Bu Görseli Tanıt" ile başlat.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Summary stats */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    {[
                      { label: 'Toplam',  value: metaCampaigns.length, color: t.accent },
                      { label: 'Aktif',   value: metaCampaigns.filter((c: any) => c.status === 'ACTIVE').length, color: '#10B981' },
                      { label: 'Harcama', value: `${metaCampaigns.reduce((s: number, c: any) => s + (c.spendTl || 0), 0).toFixed(0)}₺`, color: '#F59E0B' },
                    ].map(s => (
                      <div key={s.label} style={{ flex: 1, textAlign: 'center', padding: '10px 6px',
                        background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        borderRadius: 10, border: `0.5px solid ${t.separator}` }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: s.color, letterSpacing: '-0.03em' }}>{s.value}</div>
                        <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* Last 3 campaigns */}
                  {metaCampaigns.slice(0, 3).map((c: any) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 0', borderBottom: `0.5px solid ${t.separator}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: t.textSecondary,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.objective === 'OUTCOME_AWARENESS' ? 'Erişim' : c.objective === 'OUTCOME_ENGAGEMENT' ? 'Etkileşim' : 'Trafik'}
                          {' · '}{c.budgetTl}₺ / {c.durationDays}g
                        </div>
                        <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>
                          {c.actualReach > 0 ? `👁 ${c.actualReach.toLocaleString('tr-TR')} erişim` : `~${c.estimatedReach.toLocaleString('tr-TR')} tahmini`}
                          {c.spendTl > 0 ? ` · ${c.spendTl.toFixed(2)}₺ harcandı` : ''}
                        </div>
                      </div>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, flexShrink: 0,
                        marginLeft: 8, fontWeight: 700,
                        background: c.status === 'ACTIVE' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.1)',
                        color: c.status === 'ACTIVE' ? '#10B981' : '#F59E0B' }}>
                        {c.status === 'ACTIVE' ? 'Aktif' : 'Duraklatıldı'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SCard>
          </>
        )}

        {/* GALLERY */}
        {/* GALLERY */}
        {tab === 'gallery' && (
          <GalleryTab t={t} tenantId={tenantId} pyCtx={pyCtx} queryClient={queryClient} />
        )}

        {/* VIBE DNA */}
        {tab === 'vibe' && (
          <VibeDnaTab t={t} tenantId={tenantId} pyCtx={pyCtx} queryClient={queryClient} />
        )}

        {/* BRAND KIT */}
        {tab === 'brand_kit' && (
          <>
            {announcementLibrarySection}
            <BrandKitTab t={t} tenantId={tenantId} />
          </>
        )}

        {/* SETTINGS */}
        {tab === 'settings' && (
          <>
            <SCard t={t} title="Onay Modu" accent={t.warning}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: t.textTertiary, marginBottom: 12, lineHeight: 1.5 }}>
                  AI aksiyonları yayınlamadan önce onay gerekiyor mu?
                </div>
                {[
                  { mode: 0, label: 'Sadece Öner', desc: 'AI önerir, otomatik yayınlamaz' },
                  { mode: 1, label: 'Öner & Bekle', desc: 'AI önerir, onay bekler' },
                  { mode: 2, label: 'Otomatik Yayınla', desc: 'AI onay almadan yayınlar' },
                ].map(item => {
                  const isActive = Number(p.defaultApprovalMode ?? 1) === item.mode;
                  return (
                    <button key={item.mode} onClick={() => saveMutation.mutate({ defaultApprovalMode: item.mode } as any)} style={{ width: '100%', padding: '13px 14px', borderRadius: 14, cursor: 'pointer', textAlign: 'left', marginBottom: 8, background: isActive ? t.accentDim : (t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'), border: `0.5px solid ${isActive ? t.accentBorder : t.separator}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${isActive ? t.accent : t.textMuted}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {isActive && <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.accent }} />}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: isActive ? 700 : 500, color: isActive ? t.accent : t.textPrimary }}>{item.label}</div>
                          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 1 }}>{item.desc}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </SCard>

            <SCard t={t} title="Sosyal Medya Şablon Stili">
              <Field t={t} label="Şablon Stili" value={p.socialTemplateStyle ?? ''} onSave={save('socialTemplateStyle')} multiline />
            </SCard>

            <SCard t={t} title="Logo Kullanım Kuralları">
              <Field t={t} label="Logo Kuralları" value={p.logoUsageRules ?? ''} onSave={save('logoUsageRules')} multiline hint="Logo nasıl kullanılmalı, nasıl kullanılmamalı..." />
            </SCard>

            {(p as any).setupCompletedAt && (
              <SCard t={t} title="Kurulum Bilgisi">
                <InfoRow t={t} label="Kurulum Tamamlandı" value={new Date((p as any).setupCompletedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })} color={t.success} />
                <InfoRow t={t} label="Platform Profilleri" value={parseArr((p as any).platformProfiles).join(', ') || 'Bağlı değil'} />
              </SCard>
            )}
          </>
        )}
      </div>
    </div>
  );
}
