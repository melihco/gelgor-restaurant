'use client';
/**
 * BRAND CONSTITUTION — Full tenant profile: view + edit.
 * Shows ALL analysis fields. Every section editable from mobile.
 */
import React, { useState, useEffect, useRef } from 'react';

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
import { useMobileStore } from '../mobile-store';
import { apiClient } from '@/lib/api-client';
import { getTenantBffHeaders } from '@/lib/runtime-config';
import { fetchTenantBff } from '@/lib/bff-fetch';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { CompanyProfile, SaveCompanyProfileRequest, ApprovalMode } from '@/types';
import type { T } from '../theme-context';
import { normalizeSectorId } from '@/lib/announcement-template-library';
import {
  buildCompanyProfilePatchFromPython,
  isCompanyProfileSparse,
} from '@/lib/sync-company-profile-from-python';
import { TENANT_INDUSTRY_PLAYBOOKS } from '@/lib/tenant-operating-policy';
import {
  MOTION_STYLE_OPTIONS,
  applyMotionStylePreset,
  motionProfileToThemeJson,
  parseMotionProfileFromTheme,
  type MotionStyle,
} from '@/lib/brand-motion-profile';
import { StoryAudioSettingsPanel } from '@/components/brand/StoryAudioSettingsPanel';
import { MertcafeIntegrationsCard } from '../MertcafeIntegrationsCard';
import {
  deriveBrandTemplateLibrary,
  ensureBrandTemplateLibrary,
} from '@/lib/brand-template-library';
import { TenantOperatingCapabilitiesEditor } from '@/components/brand/TenantOperatingCapabilitiesEditor';
import { TenantGalleryPolicyBanner } from '@/components/brand/TenantGalleryPolicyBanner';
import {
  evaluateGalleryAssetPolicy,
  resolveTenantOperatingProfile,
} from '@/lib/tenant-operating-policy';
import { resolveKitForSector } from '@/lib/remotion-template-registry';
import { tenantKitSeed } from '@/lib/tenant-template-seed';
import { BrandTemplateLibraryPanel } from '@/components/brand/BrandTemplateLibraryPanel';
import { BrandColorPalettePicker } from '@/components/brand/BrandColorPalettePicker';
import { brandReadinessFixToBrandTab } from '@/lib/brand-readiness';
import { isCanvaEnabledClient } from '@/lib/canva-config';
import { prepareGalleryDisplayUrls, upscaleCdnUrl } from '@/lib/gallery-display-url';
import { themeFlag, themeString, themeStringArray } from '@/lib/brand-theme-ai-settings';
import { invalidateBrandContextWriteQueries } from '@/lib/query-client-bridge';
import { resolveBrandLogoDisplayUrl } from '@/lib/brand-logo-production';
import { BrandLoadingScreen } from '../BrandLoadingScreen';

// ─── Helpers ──────────────────────────────────────────────────────────
function ChevronRight({ color }: { color: string }) {
  return (
    <svg width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M1 1.5 5.5 6 1 10.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.38} />
    </svg>
  );
}

function SLabel({ t, text, accent }: { t: T; text: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px', marginBottom: 8 }}>
      {accent ? <div style={{ width: 4, height: 4, borderRadius: '50%', background: accent }} /> : null}
      <span style={{ fontSize: 13, fontWeight: 600, color: t.textSecondary, letterSpacing: '-0.01em' }}>{text}</span>
    </div>
  );
}
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

// ─── Inline field editor (iOS Settings row) ─────────────────────────────
function Field({ t, label, value, onSave, multiline = false, hint }: {
  t: T; label: string; value: string; onSave: (v: string) => void;
  multiline?: boolean; hint?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <div style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: t.textTertiary, marginBottom: 8 }}>{label}</div>
        {multiline ? (
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={4}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 12, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontSize: 16, lineHeight: 1.45, background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', border: 'none', color: t.textPrimary }} autoFocus
          />
        ) : (
          <input value={draft} onChange={e => setDraft(e.target.value)}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 12, outline: 'none', boxSizing: 'border-box', fontSize: 16, background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', border: 'none', color: t.textPrimary }} autoFocus
          />
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" onClick={() => { onSave(draft); setEditing(false); }} style={{ flex: 1, padding: '11px 16px', borderRadius: 12, cursor: 'pointer', background: t.accent, border: 'none', color: '#fff', fontSize: 15, fontWeight: 600 }}>
            Kaydet
          </button>
          <button type="button" onClick={() => { setDraft(value); setEditing(false); }} style={{ padding: '11px 16px', borderRadius: 12, cursor: 'pointer', background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', border: 'none', color: t.textSecondary, fontSize: 15, fontWeight: 500 }}>
            İptal
          </button>
        </div>
      </div>
    );
  }

  const display = value || hint || 'Ekle';
  const isPlaceholder = !value;

  return (
    <button type="button" onClick={() => { setDraft(value); setEditing(true); }} style={{
      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: '13px 16px', minHeight: 44, cursor: 'pointer', background: 'transparent', border: 'none', textAlign: 'left',
    }}>
      <span style={{ fontSize: 16, fontWeight: 400, color: t.textPrimary, flexShrink: 0, maxWidth: '42%' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1, justifyContent: 'flex-end' }}>
        <span style={{
          fontSize: 16, color: isPlaceholder ? t.textMuted : t.textTertiary,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', textAlign: 'right',
        }}>
          {display}
        </span>
        <ChevronRight color={t.textMuted} />
      </div>
    </button>
  );
}
Field.displayName = 'Field';

// ─── Read-only info row ────────────────────────────────────────────────
function InfoRow({ t, label, value, color }: { t: T; label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '13px 16px', minHeight: 44 }}>
      <span style={{ fontSize: 16, color: t.textPrimary, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 16, color: color ?? t.textTertiary, textAlign: 'right', lineHeight: 1.45 }}>{value}</span>
    </div>
  );
}

// ─── Section card (iOS grouped list) ───────────────────────────────────
function SCard({ t, title, children, accent }: { t: T; title: string; children: React.ReactNode; accent?: string }) {
  const items = React.Children.toArray(children);
  const allFields = items.length > 0 && items.every(
    (c) => React.isValidElement(c) && (c.type as { displayName?: string }).displayName === 'Field',
  );

  return (
    <section style={{ marginBottom: 28 }}>
      <SLabel t={t} text={title} accent={accent} />
      {allFields ? (
        <div className="brand-grouped-fields" style={{ ...t.surfaceGroup }}>
          {children}
        </div>
      ) : (
        <div style={{ ...t.surfaceCard, padding: '16px' }}>
          {children}
        </div>
      )}
    </section>
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

type Tab = 'identity' | 'brand' | 'gallery';

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
  'Great Vibes', 'Allura', 'Anton', 'Bebas Neue',
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
  const [editOverlayOpacity, setEditOverlayOpacity] = React.useState(0.28);
  const [editHeadlineColor, setEditHeadlineColor] = React.useState('#ffffff');

  const fetchTheme = React.useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const r = await fetchTenantBff(`/api/brand-context/${tenantId}/theme`, tenantId, {
        headers: getTenantBffHeaders(tenantId),
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
          const headlineColor = ty?.headlineColor ?? ty?.headline_color;
          if (headingFont) setEditHeadingFont(headingFont);
          if (bodyFont) setEditBodyFont(bodyFont);
          if (density) setEditDensity(density as 'minimal' | 'medium' | 'dense');
          if (headlineColor) setEditHeadlineColor(headlineColor);
          const ov = t2.overlay as Record<string, unknown> | undefined;
          if (typeof ov?.opacity === 'number') setEditOverlayOpacity(ov.opacity);
        } else {
          // Tema yoksa marka renklerinden başlangıç değerlerini al
          try {
            const ctxRes = await fetchTenantBff(`/api/brand-context-data/${tenantId}`, tenantId);
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
          headline_color: normalizeHex(editHeadlineColor, '#ffffff'),
          personality: (existingTypography?.personality as string)
            ?? (existingTypography as Record<string, string> | undefined)?.personality
            ?? '',
        },
        composition: {
          primary_pattern: (existingComposition?.primaryPattern as string)
            ?? (existingComposition as Record<string, string> | undefined)?.primary_pattern
            ?? 'centered subject',
          text_safe_area_fraction: editDensity === 'minimal' ? 0.32 : editDensity === 'dense' ? 0.68 : 0.52,
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
          opacity: editOverlayOpacity,
          color: shadow,
        },
        motion_profile: {
          ...((theme?.motion_profile ?? theme?.motionProfile) as Record<string, unknown> ?? {}),
          text_density: editDensity,
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
    await fetchTenantBff(`/api/brand-context-data/${tenantId}`, tenantId, {
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
      const r = await fetchTenantBff(`/api/brand-context/${tenantId}/theme`, tenantId, {
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
      const r = await fetchTenantBff(`/api/brand-context/${tenantId}/theme/derive`, tenantId, {
        method: 'POST',
        headers: getTenantBffHeaders(tenantId),
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
  const headlineColorDisplay = (typography?.headlineColor ?? typography?.headline_color ?? editHeadlineColor) as string;
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
                <strong>Vurgu</strong> rengi altın çizgiler, çerçeve ve CTA vurgusudur. <strong>Ana renk</strong> panel/arka plan tonları içindir.
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: t.textMuted }}>Başlık rengi</span>
              <span style={{
                fontSize: 13, fontWeight: 600, color: headlineColorDisplay,
                fontFamily: `'${headingFontDisplay}', serif`,
              }}>
                {headlineColorDisplay}
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: t.textMuted }}>Metin Yoğunluğu</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(['minimal', 'medium', 'dense'] as const).map(d => (
                        <button
                          key={d}
                          onClick={() => {
                            setEditDensity(d);
                            setEditOverlayOpacity(d === 'minimal' ? 0.28 : d === 'dense' ? 0.58 : 0.45);
                          }}
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
                  <div style={{ fontSize: 10, color: t.textTertiary, lineHeight: 1.45 }}>
                    {editDensity === 'minimal'
                      ? 'Ürün/fotoğraf önde kalır; başlık altta ince panelde.'
                      : editDensity === 'dense'
                        ? 'Büyük kampanya başlığı, güçlü overlay.'
                        : 'Dengeli post/story görünümü.'}
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: t.textMuted }}>Overlay koyuluğu</span>
                    <span style={{ fontSize: 11, color: t.textSecondary, fontVariantNumeric: 'tabular-nums' }}>
                      {Math.round(editOverlayOpacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={18}
                    max={65}
                    value={Math.round(editOverlayOpacity * 100)}
                    onChange={(e) => setEditOverlayOpacity(Number(e.target.value) / 100)}
                    style={{ width: '100%', accentColor: t.accent }}
                  />
                </div>
                <PaletteColorEditor
                  label="Başlık metin rengi"
                  value={editHeadlineColor}
                  fallback="#ffffff"
                  onChange={setEditHeadlineColor}
                  t={t}
                />
                <div style={{ fontSize: 10, color: t.textTertiary, lineHeight: 1.45 }}>
                  Vurgu rengi (yukarıdaki palet) dekoratif çizgileri belirler — örn. altın şeritler.
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
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
              alignItems: 'center',
              padding: 16,
            }}>
              <div style={{
                position: 'absolute', inset: 0,
                background: `linear-gradient(to top, ${displayPalette.shadow ?? '#000000'}cc 0%, transparent 55%)`,
              }} />
              <div style={{
                position: 'absolute', left: '12%', right: '12%', top: '38%',
                height: 2, background: displayPalette.accent, opacity: 0.75,
              }} />
              <div style={{
                position: 'absolute', left: '12%', right: '12%', top: '58%',
                height: 2, background: displayPalette.accent, opacity: 0.75,
              }} />
              <div style={{ position: 'relative', textAlign: 'center', marginBottom: 8 }}>
                <div style={{
                  fontFamily: `'${headingFontDisplay}', serif`,
                  fontSize: 20, fontWeight: 600,
                  color: headlineColorDisplay,
                  lineHeight: 1.15,
                  textShadow: '0 2px 12px rgba(0,0,0,0.45)',
                }}>
                  Marka Başlığı
                </div>
              </div>
              <div style={{ position: 'relative' }}>
                <div style={{
                  fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: displayPalette.accent, fontWeight: 600, marginBottom: 4,
                }}>
                  {typography ? (typography.personality as string)?.split(',')[0] ?? '' : ''}
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

function GalleryTab({ t, tenantId, pyCtx, queryClient, companyProfile }: {
  t: T;
  tenantId: string;
  pyCtx: Record<string, unknown> | undefined;
  queryClient: ReturnType<typeof useQueryClient>;
  companyProfile?: CompanyProfile | null;
}) {
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStatus, setAnalyzeStatus] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [page, setPage] = useState(0);
  const [deleteMode, setDeleteMode] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  const [uploadAssetType, setUploadAssetType] = useState<'venue_photo' | 'client_photo' | 'before_after_image'>('venue_photo');
  const PAGE_SIZE = 18;

  const operatingProfile = companyProfile
    ? resolveTenantOperatingProfile({
        tenantId,
        industry: companyProfile.industry,
        contentNeedsJson: companyProfile.contentNeeds,
        operatingCapabilitiesJson: companyProfile.operatingCapabilities,
        galleryPolicyJson: companyProfile.galleryPolicy,
        riskRulesJson: companyProfile.riskRules,
        customRules: companyProfile.customRules,
      })
    : null;

  const uploadGate = operatingProfile
    ? evaluateGalleryAssetPolicy(operatingProfile, uploadAssetType)
    : null;

  // Reference images from Python brand context
  const refUrls: string[] = (() => {
    const raw = (pyCtx as any)?.reference_image_urls ?? [];
    if (Array.isArray(raw)) return raw.filter((u: unknown) => typeof u === 'string' && (u as string).startsWith('http'));
    try { return JSON.parse(String(raw)).filter((u: unknown) => typeof u === 'string'); } catch { return []; }
  })();

  const galleryUrlKey = (u: string) => (upscaleCdnUrl(u).split('?')[0] ?? u);

  // Delete a single URL from reference_image_urls
  async function deleteImage(urlToRemove: string) {
    setDeletingUrl(urlToRemove);
    try {
      const key = galleryUrlKey(urlToRemove);
      const updated = refUrls.filter(u => galleryUrlKey(u) !== key);
      await fetchTenantBff(`/api/brand-context-data/${tenantId}`, tenantId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference_image_urls: JSON.stringify(updated) }),
      });
      await invalidateBrandContextWriteQueries(queryClient, tenantId);
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
    const urls = allUrls.filter((u: string) => u.startsWith('http'));
    if (!urls.length) {
      setAnalyzeStatus('Galeri boş — önce fotoğraf yükleyin.');
      return;
    }

    setAnalyzing(true);
    setAnalyzeStatus(`${urls.length} fotoğraf kontrol ediliyor…`);

    // Load persisted analysis — only analyze NEW photos
    let existingAnalysis: Record<string, unknown> = {};
    try {
      const cacheRes = await fetchTenantBff(`/api/brand-context/${tenantId}/gallery-analysis`, tenantId);
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
      await fetchTenantBff(`/api/brand-context/${tenantId}/gallery-analysis`, tenantId, {
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
      await invalidateBrandContextWriteQueries(queryClient, tenantId, [['gallery-analysis', tenantId]]);
    } catch (e) {
      setAnalyzeStatus(`Hata: ${e instanceof Error ? e.message : 'Bilinmeyen hata'}`);
    } finally {
      setAnalyzing(false);
    }
  }

  // Upload one or more photos
  async function handleUpload(files: File | File[]) {
    if (uploadGate?.decision === 'blocked') {
      setAnalyzeStatus('Bu fotoğraf türü işletme politikanızda kapalı.');
      return;
    }
    const fileList = Array.isArray(files) ? files : [files];
    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (let i = 0; i < fileList.length; i++) {
        if (fileList.length > 1) setAnalyzeStatus(`${i + 1}/${fileList.length} yükleniyor…`);
        const file = fileList[i]!;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('tenantId', tenantId);
        formData.append('type', 'image');
        const res = await fetch('/api/media/upload', { method: 'POST', body: formData });
        if (!res.ok) { console.warn('[upload] failed', file.name); continue; }
        const uploaded = await res.json() as { url?: string };
        if (uploaded.url?.startsWith('http')) newUrls.push(uploaded.url);
      }

      if (newUrls.length === 0) throw new Error('Hiçbir fotoğraf yüklenemedi');

      const updatedRefs = [...newUrls, ...refUrls.filter(u => !newUrls.includes(u))];
      await fetchTenantBff(`/api/brand-context-data/${tenantId}`, tenantId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference_image_urls: JSON.stringify(updatedRefs) }),
      });

      setAnalyzeStatus(`${newUrls.length} fotoğraf analiz ediliyor…`);
      let existingAnalysis: Record<string, unknown> = {};
      try {
        const cacheRes = await fetchTenantBff(`/api/brand-context/${tenantId}/gallery-analysis`, tenantId);
        if (cacheRes.ok) existingAnalysis = await cacheRes.json();
      } catch { /* proceed without cache */ }

      const analysisRes = await fetch('/api/analyze-gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetUrls: newUrls, maxImages: newUrls.length, existingAnalysis }),
      });
      if (analysisRes.ok) {
        const data = await analysisRes.json();
        const results = Array.isArray(data?.results) ? data.results : [];
        if (results.length > 0) {
          await fetchTenantBff(`/api/brand-context/${tenantId}/gallery-analysis`, tenantId, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ results }),
          });
          setAnalyzeStatus(`✓ ${results.length} fotoğraf galeri analizine eklendi.`);
        } else {
          setAnalyzeStatus('Fotoğraf(lar) yüklendi; analiz sonucu boş döndü.');
        }
      } else {
        setAnalyzeStatus(`Fotoğraf(lar) yüklendi; analiz daha sonra tekrar denenebilir (${analysisRes.status}).`);
      }
      await invalidateBrandContextWriteQueries(
        queryClient,
        tenantId,
        [['media-assets-mobile', tenantId], ['gallery-analysis', tenantId]],
      );
    } catch (e) {
      setAnalyzeStatus(e instanceof Error ? e.message : 'Yükleme hatası');
    } finally {
      setUploading(false);
    }
  }

  const displayUrls = prepareGalleryDisplayUrls(
    refUrls.length > 0 ? refUrls : (assets.map((a: any) => a.url).filter(Boolean) as string[]),
  );

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

      {operatingProfile && (
        <SCard t={t} title="Galeri kuralları" accent={t.accent}>
          <TenantGalleryPolicyBanner profile={operatingProfile} variant="mobile" theme={t} />
        </SCard>
      )}

      {/* Upload button */}
      <SCard t={t} title="Fotoğraf Yükle">
        {operatingProfile && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {(
              [
                { id: 'venue_photo' as const, label: 'Mekan' },
                { id: 'client_photo' as const, label: 'Müşteri sonucu' },
                { id: 'before_after_image' as const, label: 'Önce/sonra' },
              ] as const
            ).map((opt) => {
              const gate = evaluateGalleryAssetPolicy(operatingProfile, opt.id);
              const blocked = gate.decision === 'blocked';
              const active = uploadAssetType === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={blocked}
                  onClick={() => setUploadAssetType(opt.id)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: blocked ? 'not-allowed' : 'pointer',
                    opacity: blocked ? 0.35 : 1,
                    border: `0.5px solid ${active ? t.accentBorder : t.separator}`,
                    background: active ? t.accentDim : 'transparent',
                    color: active ? t.accent : t.textMuted,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
        {uploadGate?.decision === 'approval_required' && (
          <p style={{ fontSize: 11, color: t.warning, marginBottom: 10 }}>
            Bu tür görseller onay bekleyecek şekilde işlenir.
          </p>
        )}
        <label style={{
          width: '100%', padding: '13px 14px', borderRadius: 14, cursor: 'pointer',
          background: 'rgba(255,255,255,0.03)', border: `0.5px solid ${t.separator}`,
          color: t.textSecondary, fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {uploading ? '⏳ Yükleniyor…' : '📷 Yeni Fotoğraf Yükle'}
          <input type="file" accept="image/*" multiple style={{ display: 'none' }}
            onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length > 0) handleUpload(fs); }} />
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
                    <img
                      src={`/api/media-proxy?url=${encodeURIComponent(url)}`}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        const img = e.currentTarget as HTMLImageElement;
                        if (!img.dataset.fallback) {
                          img.dataset.fallback = '1';
                          img.src = `/api/media-proxy?url=${encodeURIComponent(url)}`;
                          return;
                        }
                        img.style.opacity = '0.3';
                      }}
                    />

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
                await fetchTenantBff(`/api/brand-context-data/${tenantId}`, tenantId, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ reference_image_urls: JSON.stringify(clean) }),
                });
                void invalidateBrandContextWriteQueries(queryClient, tenantId);
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
      const res = await fetchTenantBff(`/api/brand-context/${tenantId}/extract-vibe`, tenantId, {
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
      await invalidateBrandContextWriteQueries(queryClient, tenantId);
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
  const { goBack, brandReadinessFix, clearBrandReadinessFix } = useMobileStore();
  const [tab, setTab] = useState<Tab>('identity');
  const [saved, setSaved] = useState(false);
  const [analyzeFeedback, setAnalyzeFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [newCompetitor, setNewCompetitor] = useState('');
  const [confirmingConstitution, setConfirmingConstitution] = useState(false);
  const [constitutionConfirmError, setConstitutionConfirmError] = useState<string | null>(null);

  useEffect(() => {
    if (!brandReadinessFix) return;
    const nextTab = brandReadinessFixToBrandTab(brandReadinessFix);
    if (nextTab) setTab(nextTab);
    clearBrandReadinessFix();
  }, [brandReadinessFix, clearBrandReadinessFix]);

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

  const { data: pyCtx, isError: pyCtxLoadFailed, error: pyCtxLoadError } = useQuery({
    queryKey: ['brand-context-data', tenantId],
    queryFn: () => apiClient.getBrandContextData(tenantId!),
    staleTime: 5 * 60_000,
    enabled: Boolean(tenantId),
    retry: 1,
  });

  const { data: brandThemePayload } = useQuery({
    queryKey: ['brand-theme-kit', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const r = await fetchTenantBff(`/api/brand-context/${tenantId}/theme`, tenantId, {
        headers: getTenantBffHeaders(tenantId),
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
    enabled: isCanvaEnabledClient(),
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
    const profileName = String(p.brandName || '').trim();
    const pyName = String(b.business_name || '').trim();
    if (profileName && profileName !== pyName) patch.business_name = profileName;
    if (!b.location && p.location?.trim()) patch.location = p.location.trim();
    if (!b.description && p.description?.trim()) patch.description = p.description.trim();
    if (!b.target_audience && p.targetAudience?.trim()) patch.target_audience = p.targetAudience.trim();
    if (!b.brand_tone && p.brandTone?.trim()) {
      patch.brand_tone = TONE_TO_PYTHON[p.brandTone] || p.brandTone;
    }
    const nexusLang = String(p.languages || '').split(',')[0]?.trim().toLowerCase();
    const pyLang = String(b.languages || '').split(',')[0]?.trim().toLowerCase();
    if (nexusLang && nexusLang !== pyLang && (nexusLang === 'en' || nexusLang === 'tr' || nexusLang === 'de')) {
      fetchTenantBff(`/api/brand-context/${tenantId}/set-language`, tenantId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: nexusLang }),
      }).then(() => {
        void invalidateBrandContextWriteQueries(queryClient, tenantId);
      }).catch(() => {/* non-fatal */});
    }
    if (Object.keys(patch).length === 0) { backfilledRef.current = true; return; }
    backfilledRef.current = true;
    fetchTenantBff(`/api/brand-context-data/${tenantId}`, tenantId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then(() => {
      void invalidateBrandContextWriteQueries(queryClient, tenantId);
    }).catch(() => {/* non-fatal */});
  }, [tenantId, profile, pyCtx, queryClient]);

  // Mutation to save profile
  const saveMutation = useMutation({
    mutationFn: (data: Partial<SaveCompanyProfileRequest>) =>
      apiClient.saveCompanyProfile({ ...(profile as any), ...data } as SaveCompanyProfileRequest),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['company-profile', tenantId] });
      const name = String(variables.brandName || '').trim();
      if (name && tenantId) {
        fetchTenantBff(`/api/brand-context-data/${tenantId}`, tenantId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_name: name }),
        }).then(() => {
          void invalidateBrandContextWriteQueries(queryClient, tenantId);
        }).catch(() => {/* non-fatal */});
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  // Python → Nexus: UI reads CompanyProfile; discovery lives in brand_contexts.
  const hydratedFromPythonRef = useRef(false);
  const hydrateMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error('tenant_required');
      return apiClient.hydrateCompanyProfileFromPython(tenantId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-profile', tenantId] });
      void invalidateBrandContextWriteQueries(queryClient, tenantId);
    },
  });

  useEffect(() => {
    if (hydratedFromPythonRef.current || !tenantId || !profile || hydrateMutation.isPending) return;
    if (!isCompanyProfileSparse(profile as unknown as Record<string, unknown>)) return;
    if (pyCtx && !pyCtxLoadFailed) {
      const patch = buildCompanyProfilePatchFromPython(
        profile as unknown as Record<string, unknown>,
        pyCtx as Record<string, unknown>,
      );
      if (patch) {
        hydratedFromPythonRef.current = true;
        saveMutation.mutate(patch);
        return;
      }
    }
    hydratedFromPythonRef.current = true;
    hydrateMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot hydrate when profile sparse
  }, [tenantId, profile, pyCtx, pyCtxLoadFailed]);

  const brandKitEnrichedRef = useRef(false);
  useEffect(() => {
    if (brandKitEnrichedRef.current || !tenantId || !profile) return;
    const p = profile as CompanyProfile & Record<string, unknown>;
    const b = pyCtx as Record<string, unknown> | undefined;
    const website = String(p.websiteUrl || b?.website_url || '').trim();
    if (!website) return;

    const themeTypo = (brandThemePayload?.theme as Record<string, unknown> | undefined)?.typography as Record<string, string> | undefined;
    const hasPrimaryFont = Boolean(
      String(p.primaryFont || b?.brand_font_family || themeTypo?.heading_font || '').trim(),
    );
    const hasSecondaryFont = Boolean(
      String(p.secondaryFont || themeTypo?.body_font || '').trim(),
    );
    const hasColors = Boolean(b?.brand_primary_color && b?.brand_accent_color);
    if (hasPrimaryFont && hasSecondaryFont && hasColors) return;

    brandKitEnrichedRef.current = true;
    fetchTenantBff(`/api/brand-context/${tenantId}/enrich-brand-kit`, tenantId, { method: 'POST' })
      .then(async (r) => (r.ok ? r.json() : null))
      .then((data: {
        ok?: boolean;
        primary_font?: string;
        secondary_font?: string;
        brand_colors?: string;
        accent_color?: string;
      } | null) => {
        if (!data?.ok) return;
        const updates: Partial<SaveCompanyProfileRequest> = {};
        if (!String(p.primaryFont || '').trim() && data.primary_font) updates.primaryFont = data.primary_font;
        if (!String(p.secondaryFont || '').trim() && data.secondary_font) updates.secondaryFont = data.secondary_font;
        if (!String(p.brandColors || '').trim() && data.brand_colors) updates.brandColors = data.brand_colors;
        if (!String(p.accentColors || '').trim() && data.accent_color) updates.accentColors = data.accent_color;
        if (Object.keys(updates).length === 0) return;
        return saveMutation.mutateAsync(updates);
      })
      .then(() => {
        void invalidateBrandContextWriteQueries(queryClient, tenantId);
        queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
        queryClient.invalidateQueries({ queryKey: ['company-profile', tenantId] });
      })
      .catch(() => { brandKitEnrichedRef.current = false; });
  }, [tenantId, profile, pyCtx, brandThemePayload, queryClient, saveMutation]);

  // Re-analyze mutation
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      setAnalyzeFeedback(null);
      const websiteUrl       = ((profile as any)?.websiteUrl ?? '').trim();
      const instagramHandle  = ((profile as any)?.instagramHandle ?? '').trim();
      const googleUrl        = ((profile as any)?.googleBusinessUrl ?? '').trim();

      if (!websiteUrl && !instagramHandle && !googleUrl) {
        throw new Error('Marka analizi için web sitesi veya Instagram bilgisi gerekli.');
      }

      // Step 1: .NET discovery (applyToProfile persists CompanyProfile + brand memory).
      try {
        await apiClient.discoverBrand({
          websiteUrl: websiteUrl || undefined,
          instagramHandle: instagramHandle || undefined,
          googleBusinessUrl: googleUrl || undefined,
          applyToProfile: true,
        });
      } catch {
        await apiClient.analyzeBrand();
      }

      // Step 2: Python deep crawl + persist brand_context.
      if (tenantId) {
        return apiClient.analyzeBrandContext(tenantId, {
          websiteUrl,
          instagramHandle,
          googleBusinessUrl: googleUrl,
          brandName: String((profile as any)?.brandName || ''),
        });
      }
      return null;
    },
    onSuccess: () => {
      setAnalyzeFeedback({ kind: 'ok', text: 'Marka analizi tamamlandı.' });
      queryClient.invalidateQueries({ queryKey: ['company-profile', tenantId] });
      void invalidateBrandContextWriteQueries(queryClient, tenantId);
    },
    onError: (err) => {
      setAnalyzeFeedback({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Marka analizi başarısız oldu.',
      });
    },
  });


  if (isLoading) {
    return (
      <div style={{ minHeight: '100dvh', background: t.bg, display: 'flex' }}>
        <BrandLoadingScreen fillParent showLabel label="Marka profili yükleniyor…" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{ height: '100dvh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, padding: '0 32px' }}>
        <div style={{ fontSize: 36, opacity: 0.2 }}>!</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary, textAlign: 'center' }}>Profil yüklenemedi</div>
        <div style={{ fontSize: 13, color: t.textMuted, textAlign: 'center', lineHeight: 1.6 }}>
          Bağlantı sorunu olabilir. Geri dönüp tekrar deneyin.
        </div>
        <button
          onClick={goBack}
          style={{ marginTop: 8, padding: '10px 24px', borderRadius: 30, border: 'none', cursor: 'pointer',
            background: t.accent, color: '#fff', fontSize: 13, fontWeight: 700 }}>
          Geri Dön
        </button>
      </div>
    );
  }

  const p = profile as CompanyProfile & Record<string, unknown>;
  const brandNameDisplay = String(p.brandName || (pyCtx as any)?.business_name || '');
  const industrySlug = String(p.industry || (pyCtx as any)?.industry || (pyCtx as any)?.business_type || '');
  const industryDisplay =
    TENANT_INDUSTRY_PLAYBOOKS.find((pb) => pb.id === industrySlug)?.label || industrySlug;
  const locationDisplay = String(p.location || (pyCtx as any)?.location || '');
  const websiteDisplay = String(p.websiteUrl || (pyCtx as any)?.website_url || '');
  const instagramDisplay = String((p as any).instagramHandle || (pyCtx as any)?.instagram_handle || '');
  const descriptionDisplay = String(p.description || (pyCtx as any)?.description || (pyCtx as any)?.website_summary || '');
  const score         = scoreData?.score ?? (p as any).discoveryConfidence ?? 0;
  const logoCandidate = p.logoUrl || (pyCtx as any)?.logo_url || '';
  const logoUrl = resolveBrandLogoDisplayUrl(logoCandidate);
  const contentNeeds  = parseArr((p as any).contentNeeds);
  const templateFams  = parseArr((p as any).templateFamilies);
  const riskRules     = parseObj((p as any).riskRules);
  const brandImages   = parseArr((p as any).brandImageUrls).filter(u => u.startsWith('http'));

  const contentLanguage = String((pyCtx as any)?.languages ?? p.languages ?? 'tr').trim().toLowerCase();

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
    fetchTenantBff(`/api/brand-context-data/${tenantId}`, tenantId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(() => {
      void invalidateBrandContextWriteQueries(queryClient, tenantId);
      queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
    }).catch(() => {/* non-fatal */});
  }

  async function syncSecondaryFontToTheme(bodyFont: string) {
    if (!tenantId || !bodyFont.trim()) return;
    const existing = brandThemePayload?.theme as Record<string, unknown> | undefined;
    const typo = { ...((existing?.typography as Record<string, unknown>) ?? {}) };
    typo.body_font = bodyFont.trim();
    const palette = (existing?.palette as Record<string, unknown>) ?? {};
    const payload = {
      theme: {
        workspace_id: tenantId,
        derived_at: new Date().toISOString(),
        source: 'manual_colors',
        typography: typo,
        palette,
        composition: existing?.composition ?? {},
        grading: existing?.grading ?? {},
        overlay: existing?.overlay ?? { opacity: 0.25, color: '#000000' },
        layout: existing?.layout ?? { border_radius: 12, spacing_base: 8, default_layout_id: 'feed_square' },
        caption_voice_rules: existing?.caption_voice_rules ?? [],
        anti_patterns: existing?.anti_patterns ?? [],
        contrast_valid: true,
      },
    };
    await fetchTenantBff(`/api/brand-context/${tenantId}/theme`, tenantId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
      body: JSON.stringify(payload),
    }).catch(() => {/* non-fatal */});
    queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
  }

  function syncToPython(field: string, value: string) {
    if (!tenantId) return;

    if (field === 'brandColors') {
      const hexes = [...value.matchAll(/#[0-9a-fA-F]{3,8}\b/gi)].map((m) => m[0]);
      const patch: Record<string, string> = {};
      if (hexes[0]) patch.brand_primary_color = hexes[0];
      if (hexes[1]) patch.brand_accent_color = hexes[1];
      if (Object.keys(patch).length) patchPythonBrandFields(patch);
      return;
    }
    if (field === 'accentColors') {
      const hex = value.match(/#[0-9a-fA-F]{3,8}\b/)?.[0];
      if (hex) patchPythonBrandFields({ brand_accent_color: hex });
      return;
    }
    if (field === 'secondaryFont') {
      void syncSecondaryFontToTheme(value);
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
        fetchTenantBff(`/api/brand-context/${tenantId}/set-language`, tenantId, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: value }),
        }).then(() => {
          void invalidateBrandContextWriteQueries(queryClient, tenantId);
          queryClient.invalidateQueries({ queryKey: ['python-brand-ctx-display', tenantId] });
        }).catch(() => {/* non-fatal */});
      }
    };
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'identity', label: 'Kimlik' },
    { id: 'gallery',  label: 'Galeri' },
    { id: 'brand',    label: 'Görsel' },
  ];
  const [showAdvanced, setShowAdvanced] = useState(false);
  const constitutionConfirmedAt = (pyCtx as { brand_constitution_confirmed_at?: string | null } | undefined)
    ?.brand_constitution_confirmed_at;

  const handleConfirmConstitution = async () => {
    if (!tenantId || confirmingConstitution) return;
    setConfirmingConstitution(true);
    setConstitutionConfirmError(null);
    try {
      await apiClient.confirmBrandConstitution(tenantId);
      await invalidateBrandContextWriteQueries(queryClient, tenantId);
      queryClient.invalidateQueries({ queryKey: ['brand-readiness', tenantId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Onay başarısız';
      setConstitutionConfirmError(
        msg.includes('503') || msg.toLowerCase().includes('reach')
          ? 'Marka servisi şu an ulaşılamıyor. Birkaç dakika sonra tekrar deneyin.'
          : msg,
      );
    } finally {
      setConfirmingConstitution(false);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 96, transition: 'background 250ms' }}>

      {/* ── HEADER ── */}
      <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 8px) 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
          <h1 style={{ fontSize: 34, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.04em', margin: 0, lineHeight: 1.05 }}>
            Marka
          </h1>
          <div style={{
            padding: '6px 12px', borderRadius: 20, fontSize: 15, fontWeight: 600,
            background: t.accentDim, color: t.accent, letterSpacing: '-0.02em',
          }}>
            {score}
          </div>
        </div>
        <p style={{ fontSize: 15, color: t.textTertiary, margin: '0 0 20px', letterSpacing: '-0.01em' }}>
          {brandNameDisplay || 'Marka profili'}
          {(industryDisplay || locationDisplay) ? ` · ${[industryDisplay, locationDisplay].filter(Boolean).join(' · ')}` : ''}
        </p>

        {/* Profile hero card */}
        <div style={{ ...t.surfaceGroup, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, overflow: 'hidden', flexShrink: 0,
              background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={brandNameDisplay} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <span style={{ fontSize: 17, fontWeight: 700, color: t.accent }}>
                  {(brandNameDisplay || 'B').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: t.textPrimary, letterSpacing: '-0.02em', marginBottom: 2 }}>
                {brandNameDisplay || 'Marka adı'}
              </div>
              <div style={{ fontSize: 13, color: t.textTertiary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {[websiteDisplay, instagramDisplay ? `@${String(instagramDisplay).replace(/^@/, '')}` : ''].filter(Boolean).join(' · ') || 'Web ve sosyal bağlantı ekleyin'}
              </div>
            </div>
          </div>
        </div>

        {/* Save success */}
        {saved && (
          <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 12, background: t.successDim, fontSize: 14, color: t.success, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
            ✓ Kaydedildi
          </div>
        )}

        {(pyCtxLoadFailed || hydrateMutation.isPending) && (
          <div style={{ marginBottom: 12, padding: '12px 14px', borderRadius: 12, background: 'rgba(245,158,11,0.12)', border: '0.5px solid rgba(245,158,11,0.35)', fontSize: 13, color: '#F59E0B', lineHeight: 1.5 }}>
            {hydrateMutation.isPending
              ? 'Kayıtlı marka analizi profilinize aktarılıyor…'
              : (
                <>
                  Analiz verisi veritabanında duruyor; ekran boş çünkü Python servisi veya profil senkronu eksik.
                  {pyCtxLoadError instanceof Error ? ` (${pyCtxLoadError.message})` : ''}
                </>
              )}
            <button
              type="button"
              onClick={() => {
                hydratedFromPythonRef.current = false;
                hydrateMutation.mutate();
              }}
              disabled={hydrateMutation.isPending}
              style={{
                display: 'block', marginTop: 8, padding: '8px 12px', borderRadius: 10,
                border: 'none', background: '#F59E0B', color: '#1a1200', fontWeight: 600,
                fontSize: 13, cursor: hydrateMutation.isPending ? 'wait' : 'pointer',
              }}
            >
              Kayıtlı veriyi yükle
            </button>
          </div>
        )}

        {saveMutation.isPending && (
          <div style={{ marginBottom: 12, fontSize: 13, color: t.textTertiary, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', border: `1.5px solid ${t.separator}`, borderTopColor: t.accent, animation: 'spinSlow 0.8s linear infinite' }} />
            Kaydediliyor…
          </div>
        )}

        {(p.brandTone || p.targetAudience || (pyCtx as any)?.target_audience) && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {p.brandTone && (
              <button
                type="button"
                onClick={() => setTab('identity')}
                style={{ padding: '6px 12px', borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none', background: t.accentDim, color: t.accent }}
              >
                {p.brandTone}
              </button>
            )}
            {(p.targetAudience || (pyCtx as any)?.target_audience) && (
              <button
                type="button"
                onClick={() => setTab('identity')}
                style={{ padding: '6px 12px', borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none', background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', color: t.textSecondary, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {String(p.targetAudience || (pyCtx as any)?.target_audience || '').slice(0, 48)}
              </button>
            )}
          </div>
        )}

        {/* iOS-style segmented control */}
        <div style={{
          display: 'flex', gap: 3, padding: 3, marginBottom: 4,
          borderRadius: 10,
          background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
        }}>
          {TABS.map((tb) => {
            const isActive = tab === tb.id;
            return (
              <button
                key={tb.id}
                type="button"
                onClick={() => setTab(tb.id)}
                aria-current={isActive ? 'page' : undefined}
                style={{
                  flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em',
                  color: isActive ? t.textPrimary : t.textTertiary,
                  background: isActive
                    ? (t.isDark ? 'rgba(255,255,255,0.12)' : '#FFFFFF')
                    : 'transparent',
                  boxShadow: isActive ? (t.isDark ? '0 1px 4px rgba(0,0,0,0.25)' : '0 1px 3px rgba(0,0,0,0.08)') : 'none',
                  transition: 'background 180ms ease, color 180ms ease, box-shadow 180ms ease',
                }}
              >
                {tb.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── TAB CONTENT ── */}
      <div style={{ padding: '20px 20px 0' }}>

        {/* IDENTITY */}
        {tab === 'identity' && (
          <>
            {!constitutionConfirmedAt && (
              <div style={{
                marginBottom: 20,
                padding: '16px',
                borderRadius: 16,
                background: t.isDark ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.06)',
                border: `0.5px solid ${t.isDark ? 'rgba(245,158,11,0.28)' : 'rgba(245,158,11,0.22)'}`,
              }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: t.textPrimary, marginBottom: 6, letterSpacing: '-0.02em' }}>
                  Marka Anayasası onay bekliyor
                </div>
                <div style={{ fontSize: 13, color: t.textTertiary, lineHeight: 1.5, marginBottom: 14 }}>
                  Kimlik bilgilerini gözden geçirip onaylayın — Mission Hub skoruna +20 puan ekler.
                </div>
                {constitutionConfirmError && (
                  <div style={{
                    fontSize: 13,
                    color: t.danger,
                    lineHeight: 1.45,
                    marginBottom: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: t.dangerDim,
                  }}>
                    {constitutionConfirmError}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void handleConfirmConstitution()}
                  disabled={confirmingConstitution}
                  style={{
                    width: '100%',
                    padding: '13px 16px',
                    borderRadius: 12,
                    border: 'none',
                    cursor: confirmingConstitution ? 'wait' : 'pointer',
                    fontSize: 16,
                    fontWeight: 600,
                    color: '#fff',
                    background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                  }}
                >
                  {confirmingConstitution ? 'Onaylanıyor…' : 'Anayasayı Onayla'}
                </button>
              </div>
            )}

            <SCard t={t} title="Temel Bilgiler">
              <Field t={t} label="Marka Adı"  value={brandNameDisplay} onSave={save('brandName')} />
              <Field t={t} label="Sektör"      value={industryDisplay}  onSave={save('industry')} />
              <Field t={t} label="Konum"        value={locationDisplay}  onSave={save('location')} />
              <Field t={t} label="Web Sitesi"   value={websiteDisplay} onSave={save('websiteUrl')} />
              <Field t={t} label="Instagram" value={instagramDisplay} onSave={save('instagramHandle')} hint="örn: sunuevent" />
              <Field t={t} label="Google Business" value={(p as any).googleBusinessUrl ?? ''} onSave={save('googleBusinessUrl')} />
            </SCard>

            <SLabel t={t} text="İçerik Dili" />
            <div style={{
              display: 'flex', gap: 3, padding: 3, marginBottom: 28, borderRadius: 10,
              background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            }}>
              {(['tr', 'en'] as const).map(lang => {
                const active = contentLanguage === lang;
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => save('languages')(lang)}
                    style={{
                      flex: 1,
                      padding: '10px 0',
                      borderRadius: 8,
                      border: 'none',
                      background: active ? (t.isDark ? 'rgba(255,255,255,0.12)' : '#FFFFFF') : 'transparent',
                      color: active ? t.textPrimary : t.textTertiary,
                      fontWeight: 600,
                      fontSize: 15,
                      cursor: 'pointer',
                      boxShadow: active ? (t.isDark ? '0 1px 4px rgba(0,0,0,0.25)' : '0 1px 3px rgba(0,0,0,0.08)') : 'none',
                      transition: 'background 180ms ease, color 180ms ease',
                    }}
                  >
                    {lang === 'tr' ? 'Türkçe' : 'English'}
                  </button>
                );
              })}
            </div>

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

            {/* ── Gelişmiş toggle ── */}
            <div style={{ ...t.surfaceGroup, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setShowAdvanced(v => !v)}
                style={{
                  width: '100%', padding: '13px 16px', minHeight: 44, cursor: 'pointer',
                  background: 'transparent', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <span style={{ fontSize: 16, fontWeight: 400, color: t.textPrimary }}>Gelişmiş</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 220ms ease', opacity: 0.5 }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
            </div>
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
                          background: isSelected ? 'rgba(90,130,160,0.14)' : (t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'),
                          border: `1px solid ${isSelected ? 'rgba(90,130,160,0.4)' : t.separator}`,
                          transition: 'all 0.15s',
                        }}>
                        <div style={{ fontSize: 18, marginBottom: 3 }}>{opt.emoji}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: isSelected ? '#9DBECE' : t.textSecondary }}>{opt.label}</div>
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

            <BrandTemplateLibraryPanel
              workspaceId={tenantId}
              sector={normalizeSectorId(String(p.industry ?? (pyCtx as any)?.business_type ?? ''))}
              variant="mobile"
              mobileTheme={{
                accent: t.accent,
                accentBorder: t.accentBorder,
                accentDim: t.accentDim,
                separator: t.separator,
                textPrimary: t.textPrimary,
                textMuted: t.textMuted,
                textTertiary: t.textTertiary,
                isDark: t.isDark,
              }}
            />

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
                value={String(
                  p.primaryFont
                  || (pyCtx as any)?.brand_font_family
                  || ((brandThemePayload?.theme as Record<string, unknown> | undefined)?.typography as Record<string, string> | undefined)?.heading_font
                  || '',
                )}
                onSave={save('primaryFont')} hint="örn: Nunito, Playfair Display" />
              <Field t={t} label="İkincil Font"
                value={String(
                  p.secondaryFont
                  || ((brandThemePayload?.theme as Record<string, unknown> | undefined)?.typography as Record<string, string> | undefined)?.body_font
                  || '',
                )}
                onSave={save('secondaryFont')} hint="örn: Lato, Inter" />
            </SCard>

            <SCard t={t} title="Renk Paleti" accent={t.accent}>
              <BrandColorPalettePicker
                tenantId={tenantId!}
                sector={industrySlug || industryDisplay}
                brandName={brandNameDisplay}
                brandColors={String(p.brandColors || '')}
                accentColors={String(p.accentColors || '')}
                brandPrimary={(pyCtx as any)?.brand_primary_color as string | undefined}
                brandAccent={(pyCtx as any)?.brand_accent_color as string | undefined}
                themePalette={(brandThemePayload?.theme as Record<string, unknown> | undefined)?.palette as Record<string, string> | undefined}
                existingTheme={brandThemePayload?.theme as Record<string, unknown> | undefined}
                t={t}
                onSaved={(_palette, profileFields) => {
                  saveMutation.mutate({
                    brandColors: profileFields.brandColors,
                    accentColors: profileFields.accentColors,
                  } as Partial<SaveCompanyProfileRequest>);
                  void invalidateBrandContextWriteQueries(queryClient, tenantId!);
                  queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
                }}
              />
            </SCard>
          </>
        )}

        {tab === 'identity' && showAdvanced && (
          <>
            <SCard t={t} title="İçerik Üretimi" accent={t.accent}>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: t.textMuted }}>
                Post ve story görselleri Remotion ile otomatik üretilir — şablon seçimi veya tasarım ayarı gerekmez.
                Hareket kütüphanesi için <strong>Görsel</strong> sekmesine bakın.
              </p>
            </SCard>

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

            <SCard t={t} title="İşletme yetenekleri" accent={t.accent}>
              <TenantOperatingCapabilitiesEditor
                variant="mobile"
                theme={t}
                tenantId={tenantId!}
                industry={industryDisplay || String(p.industry || '')}
                contentNeedsJson={String((p as any).contentNeeds ?? '[]')}
                operatingCapabilitiesJson={String((p as any).operatingCapabilities ?? '[]')}
                galleryPolicyJson={String((p as any).galleryPolicy ?? '{}')}
                riskRulesJson={String((p as any).riskRules ?? '{}')}
                customRules={String(p.customRules ?? '')}
                saving={saveMutation.isPending}
                onSave={(payload) => {
                  saveMutation.mutate(payload as Partial<SaveCompanyProfileRequest>);
                }}
              />
            </SCard>

            {contentNeeds.length > 0 && (
              <SCard t={t} title="Kayıtlı içerik ihtiyaçları">
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

        {tab === 'identity' && showAdvanced && (
          <>
            {/* Re-analyze button */}
            <button
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
              style={{ width: '100%', padding: '14px', borderRadius: 16, cursor: 'pointer', marginBottom: analyzeFeedback ? 8 : 14, background: t.accentDim, border: `0.5px solid ${t.accentBorder}`, color: t.accent, fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {analyzeMutation.isPending ? (
                <><div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${t.accent}40`, borderTop: `2px solid ${t.accent}`, animation: 'spinSlow 0.8s linear infinite' }} /> Analiz Ediliyor...</>
              ) : '✦ Markayı Yeniden Analiz Et'}
            </button>
            {analyzeFeedback && (
              <div style={{
                marginBottom: 14,
                padding: '10px 12px',
                borderRadius: 12,
                fontSize: 12,
                lineHeight: 1.5,
                color: analyzeFeedback.kind === 'err' ? '#b45309' : t.textSecondary,
                background: analyzeFeedback.kind === 'err' ? 'rgba(245,158,11,0.12)' : t.surface,
                border: `0.5px solid ${analyzeFeedback.kind === 'err' ? 'rgba(245,158,11,0.35)' : t.separator}`,
              }}>
                {analyzeFeedback.text}
              </div>
            )}

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
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#9DBECE', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
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
          <GalleryTab t={t} tenantId={tenantId} pyCtx={pyCtx} queryClient={queryClient} companyProfile={profile as CompanyProfile} />
        )}

        {/* VIBE DNA */}
        {tab === 'brand' && (
          <VibeDnaTab t={t} tenantId={tenantId} pyCtx={pyCtx} queryClient={queryClient} />
        )}

        {tab === 'identity' && showAdvanced && (
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

            {tenantId && (
              <MertcafeIntegrationsCard
                t={t}
                workspaceId={tenantId}
                brandName={brandNameDisplay}
                businessMenu={String((p as Record<string, unknown>).menu ?? (pyCtx as Record<string, unknown>)?.website_summary ?? '').slice(0, 500) || undefined}
                businessHours={String((p as Record<string, unknown>).hours ?? '09:00 - 22:00')}
                businessAddress={String(p.location ?? (pyCtx as Record<string, unknown>)?.location ?? '')}
                businessPhone={String((p as Record<string, unknown>).phone ?? '')}
                saveThemePatch={async (patch) => {
                  const prev = brandThemePayload?.theme ?? null;
                  const optimistic = { ...(prev ?? {}), ...patch };
                  queryClient.setQueryData(['brand-theme-kit', tenantId], { theme: optimistic });
                  try {
                    const res = await fetchTenantBff(`/api/brand-context/${tenantId}/theme/ai-settings`, tenantId, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
                      body: JSON.stringify(patch),
                    });
                    if (!res.ok) {
                      queryClient.setQueryData(['brand-theme-kit', tenantId], { theme: prev });
                      return;
                    }
                    const data = await res.json() as { theme?: Record<string, unknown> | null };
                    if (data.theme) {
                      queryClient.setQueryData(['brand-theme-kit', tenantId], { theme: data.theme });
                    }
                  } catch {
                    queryClient.setQueryData(['brand-theme-kit', tenantId], { theme: prev });
                  }
                }}
              />
            )}

            {/* ── AI Görsel Geliştirme ── */}
            {(() => {
              // Read from brand_theme JSON (Python-side) — auto-produce also reads from here
              const currentTheme = (brandThemePayload?.theme ?? {}) as Record<string, unknown>;
              const saveAiSetting = async (patch: Record<string, unknown>) => {
                if (!tenantId) return;
                const prev = brandThemePayload?.theme ?? null;
                const optimistic = { ...(prev ?? {}), ...patch };
                queryClient.setQueryData(
                  ['brand-theme-kit', tenantId],
                  (old: { theme?: Record<string, unknown> | null } | null | undefined) => ({
                    ...(old ?? {}),
                    theme: optimistic,
                  }),
                );
                try {
                  const res = await fetchTenantBff(`/api/brand-context/${tenantId}/theme/ai-settings`, tenantId, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
                    body: JSON.stringify(patch),
                  });
                  if (!res.ok) {
                    const err = await res.text().catch(() => '');
                    console.warn('[BrandConstitution] AI settings save failed:', res.status, err);
                    queryClient.setQueryData(['brand-theme-kit', tenantId], { theme: prev });
                    return;
                  }
                  const data = await res.json() as { theme?: Record<string, unknown> | null };
                  if (data.theme) {
                    queryClient.setQueryData(['brand-theme-kit', tenantId], { theme: data.theme });
                  }
                } catch (e) {
                  console.warn('[BrandConstitution] AI settings save error:', e);
                  queryClient.setQueryData(['brand-theme-kit', tenantId], { theme: prev });
                }
              };

              const aiEnabled = themeFlag(currentTheme, 'ai_photo_enhance');
              const aiLevel = themeString(currentTheme, 'ai_photo_enhance_level', 'moderate');
              const themeBoolDefault = (key: string, defaultOn = true) => {
                const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
                if (key in currentTheme || camel in currentTheme) return themeFlag(currentTheme, key);
                return defaultOn;
              };
              const aiGalleryRevise = aiEnabled && themeBoolDefault('ai_enhance_gallery_selected', true);
              const aiUseIdentity = themeBoolDefault('ai_use_brand_identity');
              const aiBriefDrives = themeBoolDefault('ai_brief_drives_scene');
              const aiEmbedLogo = themeBoolDefault('ai_embed_logo');
              const aiSubject = themeString(currentTheme, 'ai_visual_subject', 'auto');
              const aiCaptionDriven = themeBoolDefault('ai_caption_driven_visual', false);
              const aiAdaptiveScene = themeBoolDefault('ai_adaptive_scene', false);
              const aiAdaptiveMode = themeString(currentTheme, 'ai_adaptive_scene_mode', 'auto');
              const aiFormats = new Set(
                themeStringArray(currentTheme, 'ai_enhance_formats', ['post', 'story', 'carousel', 'reel']),
              );
              const toggleFormat = (fmt: string) => {
                const next = new Set(aiFormats);
                if (next.has(fmt)) {
                  if (next.size <= 1) return;
                  next.delete(fmt);
                } else {
                  next.add(fmt);
                }
                void saveAiSetting({ ai_enhance_formats: [...next] });
              };

              return (
                <SCard t={t} title="AI Görsel Geliştirme" accent={t.accent}>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, color: t.textTertiary, lineHeight: 1.6, marginBottom: 14 }}>
                      Açıkken Mission üretimi galeri fotoğrafını caption + marka parametreleriyle GPT ile düzenler;
                      Feed&apos;de bu görsel kullanılır. Story/reel tasarımı Remotion ile devam eder.
                      Kapalıyken ham galeri + yalnızca şablon/sunum katmanı.
                    </div>

                    {/* Toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 14px', borderRadius: 14, marginBottom: 12,
                      background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                      border: `0.5px solid ${aiEnabled ? t.accentBorder : t.separator}`,
                    }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>AI Fotoğraf İyileştirme</div>
                        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
                          {aiEnabled ? 'Aktif — Mission Hub üretimleri bu standardı kullanır' : 'Kapalı — ham galeri / passthrough'}
                        </div>
                      </div>
                      <button
                        onClick={() => saveAiSetting({
                          ai_photo_enhance: !aiEnabled,
                          ai_enhance_gallery_selected: !aiEnabled ? true : false,
                        })}
                        style={{
                          width: 50, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer',
                          background: aiEnabled ? t.accent : t.separator,
                          position: 'relative', transition: 'background 0.2s',
                        }}>
                        <div style={{
                          position: 'absolute', top: 3, width: 22, height: 22, borderRadius: '50%',
                          background: '#fff',
                          left: aiEnabled ? 25 : 3,
                          transition: 'left 0.2s',
                        }} />
                      </button>
                    </div>

                    {/* Enhancement level */}
                    {aiEnabled && (
                      <div>
                        <div style={{ fontSize: 11, color: t.labelColor, letterSpacing: '0.06em',
                          textTransform: 'uppercase', marginBottom: 10 }}>Geliştirme Seviyesi</div>
                        {[
                          { level: 'subtle', label: 'Hafif', desc: 'Işık ve renk iyileştirmesi — arka plan korunur' },
                          { level: 'moderate', label: 'Orta', desc: 'Bağlamsal arka plan + profesyonel ışık' },
                          { level: 'full', label: 'Tam', desc: 'Tam sahne değişimi — ürün orijinal kalır' },
                        ].map(({ level, label, desc }) => {
                          const isActive = aiLevel === level;
                          return (
                            <button key={level}
                              onClick={() => saveAiSetting({ ai_photo_enhance_level: level })}
                              style={{
                                width: '100%', padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                                textAlign: 'left', marginBottom: 6,
                                background: isActive ? t.accentDim : 'transparent',
                                border: `0.5px solid ${isActive ? t.accentBorder : t.separator}`,
                              }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 14, height: 14, borderRadius: '50%',
                                  border: `2px solid ${isActive ? t.accent : t.textMuted}`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {isActive && <div style={{ width: 7, height: 7, borderRadius: '50%', background: t.accent }} />}
                                </div>
                                <div>
                                  <span style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? t.accent : t.textPrimary }}>
                                    {label}
                                  </span>
                                  <span style={{ fontSize: 11, color: t.textMuted, marginLeft: 6 }}>{desc}</span>
                                </div>
                              </div>
                            </button>
                          );
                        })}

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '12px 14px', borderRadius: 14, margin: '14px 0 12px',
                          background: t.isDark ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.06)',
                          border: `0.5px solid ${aiGalleryRevise ? 'rgba(16,185,129,0.35)' : t.separator}`,
                        }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>Galeri fotoğrafını iyileştir</div>
                            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2, lineHeight: 1.45 }}>
                              {aiGalleryRevise
                                ? 'Matcher\'ın seçtiği galeri fotoğrafı GPT images.edit ile iyileştirilir — Remotion üstüne biner'
                                : 'Kapalı — galeri skoru yüksekse veya poster slotunda enhance atlanabilir'}
                            </div>
                          </div>
                          <button
                            onClick={() => saveAiSetting({ ai_enhance_gallery_selected: !aiGalleryRevise })}
                            disabled={!aiEnabled}
                            style={{
                              width: 44, height: 26, borderRadius: 13, border: 'none',
                              cursor: aiEnabled ? 'pointer' : 'not-allowed',
                              background: aiGalleryRevise && aiEnabled ? '#10B981' : t.separator,
                              position: 'relative', opacity: aiEnabled ? 1 : 0.45,
                            }}>
                            <div style={{
                              position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%',
                              background: '#fff', left: aiGalleryRevise && aiEnabled ? 21 : 3, transition: 'left 0.2s',
                            }} />
                          </button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '12px 14px', borderRadius: 14, margin: '14px 0 12px',
                          background: t.isDark ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.06)',
                          border: `0.5px solid ${aiCaptionDriven && aiEnabled ? 'rgba(59,130,246,0.35)' : t.separator}`,
                        }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>Caption&apos;a özel AI görsel</div>
                            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2, lineHeight: 1.45 }}>
                              {aiCaptionDriven && aiEnabled
                                ? 'Galeri olsa bile feed postları caption + marka DNA ile sıfırdan üretilir'
                                : 'Kapalı — önce galeri matcher, sonra enhance'}
                            </div>
                          </div>
                          <button
                            onClick={() => saveAiSetting({ ai_caption_driven_visual: !aiCaptionDriven })}
                            disabled={!aiEnabled}
                            style={{
                              width: 44, height: 26, borderRadius: 13, border: 'none',
                              cursor: aiEnabled ? 'pointer' : 'not-allowed',
                              background: aiCaptionDriven && aiEnabled ? '#3B82F6' : t.separator,
                              position: 'relative', opacity: aiEnabled ? 1 : 0.45,
                            }}>
                            <div style={{
                              position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%',
                              background: '#fff', left: aiCaptionDriven && aiEnabled ? 21 : 3, transition: 'left 0.2s',
                            }} />
                          </button>
                        </div>

                        <div style={{ fontSize: 11, color: t.labelColor, letterSpacing: '0.06em',
                          textTransform: 'uppercase', margin: '16px 0 10px' }}>Görsel standardı</div>

                        {[
                          { key: 'ai_use_brand_identity', on: aiUseIdentity, title: 'Marka kimliği', desc: 'Logo, hikaye, işletme, vibe — her üretimde' },
                          { key: 'ai_brief_drives_scene', on: aiBriefDrives, title: 'Brief sahneyi yönetir', desc: 'Caption & headline ışık/mood/props karar verir' },
                          { key: 'ai_embed_logo', on: aiEmbedLogo, title: 'Logo yerleştir', desc: 'Geliştirilmiş fotoğrafa marka logosu' },
                        ].map(({ key, on, title, desc }) => (
                          <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 12px', borderRadius: 12, marginBottom: 6,
                            border: `0.5px solid ${t.separator}`,
                          }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary }}>{title}</div>
                              <div style={{ fontSize: 11, color: t.textMuted }}>{desc}</div>
                            </div>
                            <button
                              onClick={() => saveAiSetting({ [key]: !on })}
                              style={{
                                width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                                background: on ? t.accent : t.separator, position: 'relative',
                              }}>
                              <div style={{
                                position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%',
                                background: '#fff', left: on ? 21 : 3, transition: 'left 0.2s',
                              }} />
                            </button>
                          </div>
                        ))}

                        <div style={{ fontSize: 11, color: t.labelColor, letterSpacing: '0.06em',
                          textTransform: 'uppercase', margin: '12px 0 8px' }}>Görsel konu</div>
                        {[
                          { id: 'auto', label: 'Otomatik', desc: 'Sektöre göre mekan veya ürün' },
                          { id: 'venue_ambiance', label: 'Mekan / ambiyans', desc: 'Berber, restoran, otel — mekan korunur' },
                          { id: 'product_hero', label: 'Ürün hero', desc: 'Ambalaj ve ürün etiketi korunur' },
                        ].map(({ id, label, desc }) => {
                          const active = aiSubject === id;
                          return (
                            <button key={id}
                              onClick={() => saveAiSetting({ ai_visual_subject: id })}
                              style={{
                                width: '100%', padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                                textAlign: 'left', marginBottom: 6,
                                background: active ? t.accentDim : 'transparent',
                                border: `0.5px solid ${active ? t.accentBorder : t.separator}`,
                              }}>
                              <div style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? t.accent : t.textPrimary }}>{label}</div>
                              <div style={{ fontSize: 11, color: t.textMuted }}>{desc}</div>
                            </button>
                          );
                        })}

                        <div style={{ fontSize: 11, color: t.labelColor, letterSpacing: '0.06em',
                          textTransform: 'uppercase', margin: '16px 0 10px' }}>AI Sahne Uyarlama</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '12px 14px', borderRadius: 14, marginBottom: 10,
                          background: t.isDark ? 'rgba(77,112,136,0.08)' : 'rgba(77,112,136,0.06)',
                          border: `0.5px solid ${aiAdaptiveScene ? 'rgba(77,112,136,0.35)' : t.separator}`,
                        }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>Caption&apos;a uygun sahne</div>
                            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2, lineHeight: 1.45 }}>
                              {aiAdaptiveScene
                                ? 'Galeri zayıf veya stok ise sıfırdan sahne üretimi — caption + sektör kompoziti'
                                : 'Kapalı — galeri iyileştirme veya ham foto + Remotion katmanı'}
                            </div>
                          </div>
                          <button
                            onClick={() => saveAiSetting({ ai_adaptive_scene: !aiAdaptiveScene })}
                            style={{
                              width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                              background: aiAdaptiveScene ? '#4D7088' : t.separator, position: 'relative',
                            }}>
                            <div style={{
                              position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%',
                              background: '#fff', left: aiAdaptiveScene ? 21 : 3, transition: 'left 0.2s',
                            }} />
                          </button>
                        </div>
                        {aiAdaptiveScene && (
                          <div style={{ marginBottom: 12 }}>
                            {[
                              { id: 'auto', label: 'Otomatik', desc: 'Sektör + caption (nakliyat→mekan, zeytinyağı→ürün/lifestyle)' },
                              { id: 'venue_context', label: 'Mekan / operasyon', desc: 'Depo, rota, salon, mutfak — caption mekanını yansıtır' },
                              { id: 'product_showcase', label: 'Ürün vitrin', desc: 'Kolye, ambalaj, kozmetik — Instagram ürün tanıtımı' },
                              { id: 'lifestyle_composite', label: 'Lifestyle kompozit', desc: 'Zeytin ağacı, atölye, doğal ortam — tek fotoğraf hissi' },
                            ].map(({ id, label, desc }) => {
                              const active = aiAdaptiveMode === id;
                              return (
                                <button key={id}
                                  onClick={() => saveAiSetting({ ai_adaptive_scene_mode: id })}
                                  style={{
                                    width: '100%', padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                                    textAlign: 'left', marginBottom: 6,
                                    background: active ? 'rgba(77,112,136,0.12)' : 'transparent',
                                    border: `0.5px solid ${active ? 'rgba(77,112,136,0.35)' : t.separator}`,
                                  }}>
                                  <div style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? '#4D7088' : t.textPrimary }}>{label}</div>
                                  <div style={{ fontSize: 11, color: t.textMuted }}>{desc}</div>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        <div style={{ fontSize: 11, color: t.labelColor, letterSpacing: '0.06em',
                          textTransform: 'uppercase', margin: '12px 0 8px' }}>AI formatları</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {(['post', 'story', 'carousel', 'reel'] as const).map((fmt) => {
                            const on = aiFormats.has(fmt);
                            const labels = { post: 'Post', story: 'Story', carousel: 'Carousel', reel: 'Reel' };
                            return (
                              <button key={fmt} onClick={() => toggleFormat(fmt)} style={{
                                padding: '8px 12px', borderRadius: 20, border: `0.5px solid ${on ? t.accentBorder : t.separator}`,
                                background: on ? t.accentDim : 'transparent', fontSize: 12,
                                fontWeight: on ? 700 : 500, color: on ? t.accent : t.textMuted, cursor: 'pointer',
                              }}>
                                {labels[fmt]}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Info banner */}
                    <div style={{ padding: '10px 12px', borderRadius: 10, marginTop: 8,
                      background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                      fontSize: 11, color: t.textMuted, lineHeight: 1.55 }}>
                      Kimlik + brief → enhance prompt; format chip hangi slotlarda edit yapılır.
                      Sahne uyarlama açıkken zayıf galeri eşleşmesi de AI ile düzeltilir (Mission Hub).
                      Gerçek işletme fotoğrafı yükleyin — stok tek başına zayıf eşleşir. Maliyet: ~$0.21/görsel.
                    </div>

                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: `0.5px solid ${t.separator}` }}>
                      <div style={{ fontSize: 11, color: t.labelColor, letterSpacing: '0.06em',
                        textTransform: 'uppercase', marginBottom: 8 }}>Deneme — Visual Production Director</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 14px', borderRadius: 14,
                        background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                        border: `0.5px solid ${themeFlag(currentTheme, 'enable_visual_production_director') ? t.accentBorder : t.separator}`,
                      }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>Crew görsel direktör</div>
                          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2, lineHeight: 1.45 }}>
                            {themeFlag(currentTheme, 'enable_visual_production_director')
                              ? 'Açık — Mission üretiminde ek VPS zenginleştirme'
                              : 'Kapalı — mevcut üretim (değişiklik yok)'}
                          </div>
                        </div>
                        <button
                          onClick={() => saveAiSetting({
                            enable_visual_production_director: !themeFlag(currentTheme, 'enable_visual_production_director'),
                          })}
                          style={{
                            width: 50, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer',
                            background: themeFlag(currentTheme, 'enable_visual_production_director') ? t.accent : t.separator,
                            position: 'relative',
                          }}>
                          <div style={{
                            position: 'absolute', top: 3, width: 22, height: 22, borderRadius: '50%',
                            background: '#fff',
                            left: themeFlag(currentTheme, 'enable_visual_production_director') ? 25 : 3,
                            transition: 'left 0.2s',
                          }} />
                        </button>
                      </div>
                      <div style={{ fontSize: 10, color: t.textMuted, marginTop: 8, lineHeight: 1.5 }}>
                        İçerik ideasyonundaki görsel spec korunur; sadece boş alanlar doldurulur. Hata olursa üretim eskisi gibi devam eder.
                      </div>
                    </div>
                  </div>
                </SCard>
              );
            })()}

            {(() => {
              const currentTheme = (brandThemePayload?.theme ?? {}) as Record<string, unknown>;
              const motionRaw = (currentTheme.motion_profile ?? currentTheme.motionProfile) as Record<string, unknown> | undefined;
              const activeStyle = String(motionRaw?.motion_style ?? motionRaw?.motionStyle ?? 'editorial') as MotionStyle;
              const purePhotoPct = Math.round(
                Number(motionRaw?.prefer_pure_photo_stories ?? motionRaw?.preferPurePhotoStories ?? 0.72) * 100,
              );
              const sectorNorm = normalizeSectorId(String(p.industry ?? ''));

              const saveMotionStyle = async (style: MotionStyle) => {
                if (!tenantId) return;
                const base = parseMotionProfileFromTheme(currentTheme, { sector: sectorNorm });
                const next = applyMotionStylePreset(base, style);
                const kitId = resolveKitForSector(sectorNorm, tenantKitSeed(tenantId ?? undefined));
                const library = ensureBrandTemplateLibrary(currentTheme, { sector: sectorNorm, kitId, motionStyle: style, tenantId: tenantId ?? undefined });
                const motion_profile = motionProfileToThemeJson({
                  ...next,
                  operatorOverride: true,
                });
                await fetchTenantBff(`/api/brand-context/${tenantId}/theme`, tenantId, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
                  body: JSON.stringify({
                    theme: {
                      ...currentTheme,
                      motion_profile,
                      template_library: library.locked ? library : deriveBrandTemplateLibrary({ kitId, sector: sectorNorm, motionStyle: style, tenantId: tenantId ?? undefined }),
                    },
                  }),
                }).catch(() => {/* non-fatal */});
                queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
              };

              return (
                <SCard t={t} title="Motion Stili (Remotion)" accent={t.accent}>
                  <div style={{ fontSize: 12, color: t.textTertiary, lineHeight: 1.6, marginBottom: 14 }}>
                    Remotion story motion ve composition ağırlıkları. Hangi tasarımın kullanılacağı yukarıdaki Template Kütüphanesi (5) slotlarından seçilir — kayıt sonrası feed üretimi bu şablonları sabitler.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                    {MOTION_STYLE_OPTIONS.map(({ id, label, desc }) => {
                      const isActive = activeStyle === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => saveMotionStyle(id)}
                          style={{
                            textAlign: 'left', padding: '12px 14px', borderRadius: 14, cursor: 'pointer',
                            border: `0.5px solid ${isActive ? t.accentBorder : t.separator}`,
                            background: isActive
                              ? (t.isDark ? 'rgba(77,112,136,0.12)' : 'rgba(77,112,136,0.08)')
                              : (t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                          }}
                        >
                          <div style={{ fontSize: 14, fontWeight: isActive ? 700 : 600, color: isActive ? t.accent : t.textPrimary }}>
                            {label}
                          </div>
                          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 3 }}>{desc}</div>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: t.textMuted }}>
                    Saf fotoğraf story hedefi: ~{purePhotoPct}% · Aktif stil: <strong>{activeStyle}</strong>
                  </div>
                </SCard>
              );
            })()}

            {tenantId && (
              <SCard t={t} title="Story Ses Ayarları">
                <StoryAudioSettingsPanel
                  tenantId={tenantId}
                  theme={((brandThemePayload?.theme ?? {}) as Record<string, unknown>)}
                  sector={normalizeSectorId(String(p.industry ?? ''))}
                  t={t}
                  onSaved={() => {
                    queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
                  }}
                />
              </SCard>
            )}

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
