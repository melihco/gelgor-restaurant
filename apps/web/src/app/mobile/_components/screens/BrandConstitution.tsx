'use client';
/**
 * BRAND CONSTITUTION — Full tenant profile: view + edit.
 * Shows ALL analysis fields. Every section editable from mobile.
 */
import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

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
import { filterBrandGalleryUrls } from '@/lib/gallery-upload';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useActiveTenantId } from '@/hooks/useActiveTenantId';
import type { CompanyProfile, SaveCompanyProfileRequest, ApprovalMode } from '@/types';
import type { T } from '../theme-context';
import { normalizeSectorId } from '@/lib/announcement-template-library';
import {
  buildCompanyProfilePatchFromPython,
  isCompanyProfileSparse,
} from '@/lib/sync-company-profile-from-python';
import { shouldRefreshIndustryFromPython } from '@/lib/canonical-sector';
import { TENANT_INDUSTRY_PLAYBOOKS } from '@/lib/tenant-operating-policy';
import {
  MOTION_STYLE_OPTIONS,
  applyMotionStylePreset,
  motionProfileToThemeJson,
  parseMotionProfileFromTheme,
  type MotionStyle,
} from '@/lib/brand-motion-profile';
import { StoryAudioSettingsPanel } from '@/components/brand/StoryAudioSettingsPanel';
import { ReelMotionSettingsPanel } from '@/components/brand/ReelMotionSettingsPanel';
import { BrandProductShowcasePanel } from '@/components/brand/BrandProductShowcasePanel';
import { BrandProductionEnginesPanel } from '@/components/brand/BrandProductionEnginesPanel';
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
import { BrandFalDesignIntensityPanel } from '@/components/brand/BrandFalDesignIntensityPanel';
import { BrandFalTemplateGalleryPanel } from '@/components/brand/BrandFalTemplateGalleryPanel';
import { BrandContentStrategyPanel } from '@/components/brand/BrandContentStrategyPanel';
import { BrandSpecialDaysPanel } from '@/components/brand/BrandSpecialDaysPanel';
import { brandReadinessFixToBrandTab, PRODUCTION_PROFILE_THRESHOLD, type ProductionProfileReadinessResult } from '@/lib/brand-readiness';
import { isCanvaEnabledClient } from '@/lib/canva-config';
import { prepareGalleryDisplayUrls, resolveGalleryImageSrc, upscaleCdnUrl, galleryUrlIdentityKey } from '@/lib/gallery-display-url';
import { themeFlag, themeString, themeStringArray, resolveVisualSourceMode } from '@/lib/brand-theme-ai-settings';
import type { VisualSourceMode } from '@/lib/brand-theme-ai-settings';
import { invalidateBrandContextWriteQueries } from '@/lib/query-client-bridge';
import { resolveBrandLogoDisplayUrl } from '@/lib/brand-logo-production';
import { BrandLoadingScreen } from '../BrandLoadingScreen';
import { BrandSectionIntro } from '../BrandSectionIntro';
import type { BrandPostDesignDefaults, TypographyVibe, BrandDesignTypographyConfig } from '@/types/brand-theme';
import { TYPOGRAPHY_VIBE_LABELS, defaultTypographyVibeForSector } from '@/types/brand-theme';

const BrandChatbotProfileCard = dynamic(
  () => import('../BrandChatbotProfileCard').then((m) => ({ default: m.BrandChatbotProfileCard })),
  { ssr: false },
);

const BrandScheduledTemplatesPanel = dynamic(
  () => import('@/components/brand/BrandScheduledTemplatesPanel').then((m) => ({ default: m.BrandScheduledTemplatesPanel })),
  { ssr: false },
);

const POST_FONT_OPTIONS: Array<{ id: BrandPostDesignDefaults['font_preset']; label: string; desc: string; functionText: string }> = [
  { id: 'poster_3d', label: 'Poster 3D', desc: 'Kalın, kampanya afişi gibi', functionText: 'Post ve story ara görsellerinde büyük headline için Anton/Archivo tabanlı poster yazısı kullanır.' },
  { id: 'sticker_pop', label: 'Sticker Pop', desc: 'Daha eğlenceli ve sosyal', functionText: 'Bangers tarzı daha organik, etiket/sticker hissi veren yazı dili üretir.' },
  { id: 'condensed_impact', label: 'Condensed', desc: 'Dar, güçlü, satış odaklı', functionText: 'Dar ve yüksek harflerle daha fazla vurgu sağlar; kampanya ve duyuru postlarına uygundur.' },
  { id: 'elegant_serif', label: 'Editorial', desc: 'Premium ve dergi hissi', functionText: 'Playfair tabanlı serif başlıkla lüks, restoran ve lifestyle içeriklerini daha editorial gösterir.' },
  { id: 'clean_sans', label: 'Clean Sans', desc: 'Sade, kurumsal, minimal', functionText: 'Inter tabanlı sade başlık kullanır; klinik, kurumsal ve minimal markalar için daha güvenlidir.' },
];

const POST_EFFECT_OPTIONS: Array<{ id: BrandPostDesignDefaults['text_effect']; label: string; desc: string; functionText: string }> = [
  { id: 'extrude_3d', label: '3D Extrude', desc: 'Derinlikli, dikkat çekici başlık', functionText: 'Canvas render sırasında başlığı çok katmanlı gölge ve stroke ile gerçek 3D derinlikli çizer.' },
  { id: 'gradient_stack', label: 'Gradient Stack', desc: 'Renk geçişli poster yazısı', functionText: 'Başlıkta beyazdan marka aksan rengine inen gradient ve derinlik katmanı uygular.' },
  { id: 'neon_3d', label: 'Neon Glow', desc: 'Gece/story enerjisi', functionText: 'Başlığa parlama/glow uygular; gece etkinliği, bar, beach club ve story/reel girişleri için daha çarpıcıdır.' },
  { id: 'editorial_outline', label: 'Outline', desc: 'Lüks, ince konturlu başlık', functionText: 'Başlık etrafına zarif kontur ve kontrollü gölge verir; premium ama sakin görünür.' },
  { id: 'soft_shadow', label: 'Soft Shadow', desc: 'Daha sakin okunabilirlik', functionText: 'Sadece yumuşak okunabilirlik gölgesi kullanır; daha az agresif ve güvenli üretim modudur.' },
];

const POST_LOGO_OPTIONS: Array<{ id: BrandPostDesignDefaults['logo_position']; label: string; desc: string; functionText: string }> = [
  { id: 'top_left', label: 'Sol üst', desc: 'Feed için güvenli klasik alan', functionText: 'Logo gerçek dosya olarak canvas üstüne çizilir; Instagram UI ve metin alanıyla en az çakışan varsayılan konumdur.' },
  { id: 'top_center', label: 'Üst orta', desc: 'Story/reel girişlerinde güçlü', functionText: 'Logo üst merkezde yer alır; story açılış kartlarında marka imzası gibi çalışır.' },
  { id: 'top_right', label: 'Sağ üst', desc: 'Sol başlık alanı boş kalır', functionText: 'Başlık sola yaslandığında logoyu sağ üstte tutarak kompozisyon dengesini korur.' },
  { id: 'bottom_right', label: 'Sağ alt', desc: 'Minimal ve editorial işler', functionText: 'Logo daha az baskın görünür; minimal postlarda fotoğrafı bozmadan marka imzası bırakır.' },
];

interface BrandPostTemplateSummary {
  id: string;
  name: string;
  format: string;
  template_kind: string;
  layout_spec?: Record<string, unknown>;
  thumbnail_url?: string | null;
  example_artifact_url?: string | null;
  usage_count?: number;
}

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

function cleanProfileText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function uniqueNonEmpty(items: Array<unknown>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const text = cleanProfileText(item);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function buildAiBrandDescription(input: {
  brandName: string;
  industry: string;
  location?: string;
  websiteSummary?: string;
  instagramBio?: string;
  targetAudience?: string;
  brandTone?: string;
  visualStyle?: string;
  contentPillars?: string[];
  defaultCtas?: string[];
}): string {
  const intro = uniqueNonEmpty([
    input.brandName && `${input.brandName}${input.location ? `, ${input.location}` : ''} merkezli ${input.industry || 'yerel işletme'} markasıdır.`,
    input.websiteSummary,
    input.instagramBio && `Instagram bio: ${input.instagramBio}`,
  ]).join(' ');

  const productionContext = uniqueNonEmpty([
    input.targetAudience && `Hedef kitle: ${input.targetAudience}.`,
    input.brandTone && `Marka tonu: ${input.brandTone}.`,
    input.visualStyle && `Görsel dünya: ${input.visualStyle}.`,
    input.contentPillars?.length ? `İçerik üretiminde ana odaklar: ${input.contentPillars.slice(0, 8).join(', ')}.` : '',
    input.defaultCtas?.length ? `Kampanya ve CTA yönü: ${input.defaultCtas.slice(0, 6).join(', ')}.` : '',
  ]).join(' ');

  return uniqueNonEmpty([intro, productionContext]).join('\n\n').slice(0, 1900);
}

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

function ParameterHelpModal({
  t,
  title,
  body,
  bullets,
  onClose,
}: {
  t: T;
  title: string;
  body: string;
  bullets: string[];
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.48)',
        padding: 14,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 430,
          borderRadius: 24,
          padding: 18,
          background: t.isDark ? '#111827' : '#ffffff',
          border: `0.5px solid ${t.separator}`,
          boxShadow: '0 24px 70px rgba(0,0,0,0.34)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: t.accent, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
              Üretim Parametresi
            </div>
            <div style={{ fontSize: 18, color: t.textPrimary, fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              border: 'none',
              cursor: 'pointer',
              color: t.textSecondary,
              background: t.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
              fontSize: 18,
              lineHeight: '32px',
            }}
          >
            ×
          </button>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.6, color: t.textMuted }}>{body}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {bullets.map((item) => (
            <div
              key={item}
              style={{
                padding: '10px 12px',
                borderRadius: 14,
                background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                color: t.textSecondary,
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ParameterGroupHeader({
  t,
  title,
  subtitle,
  onHelp,
}: {
  t: T;
  title: string;
  subtitle: string;
  onHelp: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.01em' }}>{title}</div>
        <div style={{ fontSize: 10, color: t.textMuted, marginTop: 3, lineHeight: 1.35 }}>{subtitle}</div>
      </div>
      <button
        type="button"
        onClick={onHelp}
        aria-label={`${title} açıklaması`}
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          border: `0.5px solid ${t.accentBorder}`,
          background: t.accentDim,
          color: t.accent,
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 800,
          lineHeight: '22px',
          flexShrink: 0,
        }}
      >
        ?
      </button>
    </div>
  );
}

function ParameterOptionCard({
  t,
  active,
  label,
  desc,
  functionText,
  onClick,
}: {
  t: T;
  active: boolean;
  label: string;
  desc?: string;
  functionText?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: '12px',
        borderRadius: 16,
        cursor: 'pointer',
        border: `0.5px solid ${active ? t.accentBorder : t.separator}`,
        background: active
          ? (t.isDark ? 'linear-gradient(135deg, rgba(77,112,136,0.22), rgba(77,112,136,0.08))' : 'linear-gradient(135deg, rgba(77,112,136,0.13), rgba(77,112,136,0.04))')
          : (t.isDark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.025)'),
        boxShadow: active ? '0 12px 28px rgba(0,0,0,0.12)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: desc ? 5 : 0 }}>
        <span style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          background: active ? t.accent : t.separator,
          boxShadow: active ? `0 0 0 4px ${t.accentDim}` : 'none',
          flexShrink: 0,
        }} />
        <div style={{ fontSize: 13, fontWeight: 800, color: active ? t.accent : t.textPrimary }}>{label}</div>
      </div>
      {desc ? <div style={{ fontSize: 10, color: t.textMuted, lineHeight: 1.35, marginLeft: 16 }}>{desc}</div> : null}
      {functionText ? <div style={{ fontSize: 10, color: t.textTertiary, lineHeight: 1.35, marginLeft: 16, marginTop: 6 }}>{functionText}</div> : null}
    </button>
  );
}

/**
 * Katlanabilir grup — gelişmiş / teknik kartları varsayılan kapalı gösterir.
 * Kullanıcı yalnızca ilgilendiği grubu açar; ekran karmaşası dramatik düşer.
 */
function CollapsibleGroup({
  t,
  title,
  subtitle,
  defaultOpen = false,
  accent,
  children,
}: {
  t: T;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  accent?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={{ marginBottom: open ? 24 : 12 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          borderRadius: 16,
          cursor: 'pointer',
          textAlign: 'left',
          background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          border: `0.5px solid ${open ? (accent ? accent + '55' : t.accentBorder) : t.separator}`,
          transition: 'border-color 180ms ease',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.02em' }}>{title}</div>
          {subtitle ? (
            <div style={{ fontSize: 12, color: t.textTertiary, marginTop: 3, lineHeight: 1.4 }}>{subtitle}</div>
          ) : null}
        </div>
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 200ms ease',
          }}
        >
          <ChevronRight color={accent ?? t.textMuted} />
        </span>
      </button>
      {open ? <div style={{ marginTop: 14 }}>{children}</div> : null}
    </section>
  );
}

function PostDesignDefaultsPanel({
  t,
  workspaceId,
  theme,
  onSave,
}: {
  t: T;
  workspaceId?: string | null;
  theme: Record<string, unknown>;
  onSave: (next: BrandPostDesignDefaults) => void;
}) {
  const raw = (theme.post_design_defaults ?? theme.postDesignDefaults ?? {}) as Partial<BrandPostDesignDefaults>;
  const active: BrandPostDesignDefaults = {
    font_preset: raw.font_preset ?? 'poster_3d',
    text_effect: raw.text_effect ?? 'extrude_3d',
    logo_position: raw.logo_position ?? 'top_left',
    accent_color: raw.accent_color,
    default_template_id: raw.default_template_id ?? raw.defaultTemplateId,
  };
  const savePatch = (patch: Partial<BrandPostDesignDefaults>) => onSave({ ...active, ...patch });
  const { data: postTemplates = [] } = useQuery<BrandPostTemplateSummary[]>({
    queryKey: ['brandPostTemplates', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const res = await fetchTenantBff(`/api/brand-context/${workspaceId}/post-templates`, workspaceId, {
        headers: { 'X-Tenant-Id': workspaceId },
      });
      if (!res.ok) return [];
      return await res.json() as BrandPostTemplateSummary[];
    },
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
  });
  const [helpTopic, setHelpTopic] = useState<'template' | 'font' | 'effect' | 'logo' | null>(null);
  const selectedFont = POST_FONT_OPTIONS.find((opt) => opt.id === active.font_preset) ?? POST_FONT_OPTIONS[0]!;
  const selectedEffect = POST_EFFECT_OPTIONS.find((opt) => opt.id === active.text_effect) ?? POST_EFFECT_OPTIONS[0]!;
  const selectedLogo = POST_LOGO_OPTIONS.find((opt) => opt.id === active.logo_position) ?? POST_LOGO_OPTIONS[0]!;
  const selectedTemplate = postTemplates.find((tmpl) => tmpl.id === active.default_template_id) ?? null;
  const helpCopy = {
    template: {
      title: 'Varsayılan Post Template',
      body: 'Bu seçim markanın post üretiminde hangi kayıtlı şablonun önce kullanılacağını belirler.',
      bullets: [
        'Otomatik seçilirse sistem sadece marka font/efekt/logo standardını kullanır ve içerik tipine göre tasarım seçer.',
        'Bir template seçilirse MissionContentFactory o şablonun canvas/agency spec değerlerini varsayılan üretim davranışına taşır.',
        'Template kütüphanesi, onaylanan post tasarımlarından büyür; iyi çalışan tasarımları kaydettikçe marka standardı güçlenir.',
      ],
    },
    font: {
      title: 'Yazı Karakteri',
      body: 'Bu seçim markanın post ve story ara görsellerindeki headline karakterini belirler. Üretim sırasında Canvas renderer bu preset’i gerçek font ailesine çevirir.',
      bullets: [
        'MissionContentFactory post, carousel ve story→reel ara kartlarında varsayılan font olarak kullanılır.',
        'Kayıtlı bir post şablonu kendi fontunu taşıyorsa şablon değeri marka standardının önüne geçer.',
        'Amaç her firmanın postlarında story şablonları gibi tutarlı bir tipografi imzası oluşturmak.',
      ],
    },
    effect: {
      title: 'Yazı Efekti',
      body: 'Bu seçim başlığın Canvas üzerinde nasıl çizileceğini belirler: 3D derinlik, glow, outline, gradient veya sade gölge.',
      bullets: [
        'AI prompt’a bırakılmaz; gerçek render katmanları Canvas içinde deterministik çizilir.',
        '3D Extrude ve Gradient Stack daha kampanya/poster odaklıdır; Outline ve Soft Shadow daha premium/minimaldir.',
        'Reel için Runway’e giden prompt image da bu yazı efektini taşıdığı için hareketli içerik standardını etkiler.',
      ],
    },
    logo: {
      title: 'Logo Alanı',
      body: 'Bu seçim gerçek marka logosunun post/story canvasında hangi güvenli alana yerleşeceğini belirler.',
      bullets: [
        'Logo URL varsa dosya olarak çizilir; modelin logoyu hayal etmesine bırakılmaz.',
        'Top-left feed için en güvenli default; top-center story girişlerinde daha güçlü marka imzası verir.',
        'Minimal postlarda bottom-right daha az baskın ve daha editorial görünür.',
      ],
    },
  } as const;

  return (
    <SCard t={t} title="Post Tasarım Standardı" accent={t.accent}>
      <div style={{ padding: 14 }}>
        <div style={{
          borderRadius: 18,
          padding: 14,
          marginBottom: 14,
          background: t.isDark ? 'rgba(77,112,136,0.13)' : 'rgba(77,112,136,0.07)',
          border: `0.5px solid ${t.accentBorder}`,
        }}>
          <div style={{ fontSize: 11, color: t.accent, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            Aktif Marka Standardı
          </div>
          <div style={{ fontSize: 13, color: t.textPrimary, fontWeight: 750, lineHeight: 1.45 }}>
            {selectedFont.label} · {selectedEffect.label} · Logo: {selectedLogo.label}
          </div>
          <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.45, marginTop: 6 }}>
            Template: {selectedTemplate?.name ?? 'Otomatik'} · Bu standart post, carousel ve story→reel ara görsellerinde üretim karakterini belirler.
          </div>
        </div>

        <ParameterGroupHeader
          t={t}
          title="Varsayılan Post Template"
          subtitle="Mission üretiminde önce kullanılacak kayıtlı post şablonu"
          onHelp={() => setHelpTopic('template')}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          <ParameterOptionCard
            t={t}
            active={!active.default_template_id}
            label="Otomatik"
            desc="İçeriğe göre en uygun tasarım seçilsin"
            functionText={!active.default_template_id ? 'Mission üretimi mevcut marka font/efekt standardını kullanır, sabit bir template zorlamaz.' : undefined}
            onClick={() => savePatch({ default_template_id: undefined, defaultTemplateId: undefined })}
          />
          {postTemplates.slice(0, 7).map((tmpl) => {
            const spec = tmpl.layout_spec ?? {};
            const isActive = active.default_template_id === tmpl.id;
            return (
              <ParameterOptionCard
                key={tmpl.id}
                t={t}
                active={isActive}
                label={tmpl.name || 'Post Template'}
                desc={`${tmpl.template_kind || spec.source || 'canvas'} · ${tmpl.format || spec.contentType || 'post'}`}
                functionText={isActive ? 'Bu template, MissionContentFactory içinde varsayılan tasarım şablonu olarak uygulanır.' : undefined}
                onClick={() => savePatch({ default_template_id: tmpl.id, defaultTemplateId: tmpl.id })}
              />
            );
          })}
        </div>
        {!postTemplates.length && (
          <div style={{
            padding: '11px 12px',
            borderRadius: 14,
            background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
            color: t.textMuted,
            fontSize: 11,
            lineHeight: 1.45,
            marginBottom: 14,
          }}>
            Henüz kayıtlı post template yok. Mission ekranında bir tasarımı çıktılara kaydedince burada varsayılan olarak seçilebilir.
          </div>
        )}

        <ParameterGroupHeader
          t={t}
          title="Yazı Karakteri"
          subtitle="Markanın headline font imzası"
          onHelp={() => setHelpTopic('font')}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          {POST_FONT_OPTIONS.map((opt) => (
            <ParameterOptionCard
              key={opt.id}
              t={t}
              active={active.font_preset === opt.id}
              label={opt.label}
              desc={opt.desc}
              functionText={active.font_preset === opt.id ? opt.functionText : undefined}
              onClick={() => savePatch({ font_preset: opt.id })}
            />
          ))}
        </div>

        <ParameterGroupHeader
          t={t}
          title="Yazı Efekti"
          subtitle="3D, glow, outline ve okunabilirlik davranışı"
          onHelp={() => setHelpTopic('effect')}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          {POST_EFFECT_OPTIONS.map((opt) => (
            <ParameterOptionCard
              key={opt.id}
              t={t}
              active={active.text_effect === opt.id}
              label={opt.label}
              desc={opt.desc}
              functionText={active.text_effect === opt.id ? opt.functionText : undefined}
              onClick={() => savePatch({ text_effect: opt.id })}
            />
          ))}
        </div>

        <ParameterGroupHeader
          t={t}
          title="Logo Alanı"
          subtitle="Gerçek logo dosyasının güvenli yerleşimi"
          onHelp={() => setHelpTopic('logo')}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {POST_LOGO_OPTIONS.map((opt) => (
            <ParameterOptionCard
              key={opt.id}
              t={t}
              active={active.logo_position === opt.id}
              label={opt.label}
              desc={opt.desc}
              functionText={active.logo_position === opt.id ? opt.functionText : undefined}
              onClick={() => savePatch({ logo_position: opt.id })}
            />
          ))}
        </div>
      </div>
      {helpTopic && (
        <ParameterHelpModal
          t={t}
          title={helpCopy[helpTopic].title}
          body={helpCopy[helpTopic].body}
          bullets={[...helpCopy[helpTopic].bullets]}
          onClose={() => setHelpTopic(null)}
        />
      )}
    </SCard>
  );
}

// ─── Typography Design Panel ─────────────────────────────────────────────

const TYPOGRAPHY_VIBE_OPTIONS: Array<{ id: TypographyVibe; label: string; desc: string; emoji: string }> = [
  { id: 'bubble_3d', label: 'Balon 3D', desc: 'Şişirilmiş 3D harfler, Gen Z, eğlenceli', emoji: '🫧' },
  { id: 'chrome_gradient', label: 'Krom Gradient', desc: 'Metalik yansıma, premium lüks', emoji: '✨' },
  { id: 'neon_glow', label: 'Neon Glow', desc: 'Neon tüp aydınlatma, gece hayatı', emoji: '💡' },
  { id: 'editorial_serif', label: 'Editöryal Serif', desc: 'Dergi stili, dramatik boyut', emoji: '📰' },
  { id: 'street_bold', label: 'Sokak Kalın', desc: 'Kentsel, sıkıştırılmış, güçlü', emoji: '🏋️' },
  { id: 'handwritten', label: 'El Yazısı', desc: 'Fırça kaligrafi, doğal sıcaklık', emoji: '✍️' },
  { id: 'retro_poster', label: 'Retro Poster', desc: 'Vintage poster yazısı, nostalji', emoji: '🎨' },
  { id: 'minimal_modern', label: 'Minimal Modern', desc: 'Ultra-temiz sans, İsviçre tasarım', emoji: '◻️' },
];

const BACKGROUND_STYLE_OPTIONS: Array<{ id: BrandDesignTypographyConfig['background_style']; label: string }> = [
  { id: 'gradient_mesh', label: 'Gradient Mesh' },
  { id: 'photo_overlay', label: 'Fotoğraf Üzeri' },
  { id: 'solid_brand', label: 'Düz Marka Rengi' },
  { id: 'transparent', label: 'Transparan' },
];

function TypographyDesignPanel({
  t,
  theme,
  sector,
  onSave,
}: {
  t: T;
  theme: Record<string, unknown>;
  sector: string;
  onSave: (next: BrandDesignTypographyConfig) => void;
}) {
  const raw = (theme.typography_design ?? theme.typographyDesign ?? {}) as Partial<BrandDesignTypographyConfig>;
  const suggestedVibe = defaultTypographyVibeForSector(sector);
  const active: BrandDesignTypographyConfig = {
    vibe: raw.vibe ?? suggestedVibe,
    text_effect: raw.text_effect ?? 'gradient_stack',
    accent_color: raw.accent_color,
    background_style: raw.background_style ?? 'gradient_mesh',
    logo_treatment: raw.logo_treatment ?? 'watermark',
  };
  const savePatch = (patch: Partial<BrandDesignTypographyConfig>) => onSave({ ...active, ...patch });

  return (
    <SCard t={t} title="AI Tipografi Tasarımı" accent={t.accent}>
      <div style={{ padding: 14 }}>
        <div style={{
          borderRadius: 18,
          padding: 14,
          marginBottom: 14,
          background: t.isDark ? 'rgba(120,80,200,0.10)' : 'rgba(120,80,200,0.06)',
          border: `0.5px solid ${t.accentBorder}`,
        }}>
          <div style={{ fontSize: 11, color: t.accent, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            Aktif Tipografi Stili
          </div>
          <div style={{ fontSize: 13, color: t.textPrimary, fontWeight: 750, lineHeight: 1.45 }}>
            {TYPOGRAPHY_VIBE_LABELS[active.vibe].emoji} {TYPOGRAPHY_VIBE_LABELS[active.vibe].tr} · {active.background_style}
          </div>
          <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.45, marginTop: 6 }}>
            Sektör önerisi: {TYPOGRAPHY_VIBE_LABELS[suggestedVibe].tr} · AI (Ideogram V4) ile üretilen sosyal medya tipografi postları bu stili kullanır.
          </div>
        </div>

        <ParameterGroupHeader
          t={t}
          title="Tipografi Stili"
          subtitle="AI tasarım postlarında kullanılacak yazı efekti"
          onHelp={() => {}}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          {TYPOGRAPHY_VIBE_OPTIONS.map((opt) => (
            <ParameterOptionCard
              key={opt.id}
              t={t}
              active={active.vibe === opt.id}
              label={`${opt.emoji} ${opt.label}`}
              desc={opt.desc}
              onClick={() => savePatch({ vibe: opt.id })}
            />
          ))}
        </div>

        <ParameterGroupHeader
          t={t}
          title="Arka Plan Stili"
          subtitle="Tasarım postlarının arka plan tipi"
          onHelp={() => {}}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {BACKGROUND_STYLE_OPTIONS.map((opt) => (
            <ParameterOptionCard
              key={opt.id}
              t={t}
              active={active.background_style === opt.id}
              label={opt.label}
              desc=""
              onClick={() => savePatch({ background_style: opt.id })}
            />
          ))}
        </div>
      </div>
    </SCard>
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

type Tab = 'identity' | 'content' | 'design' | 'gallery' | 'chatbot';

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
  const galleryFileInputRef = useRef<HTMLInputElement>(null);
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

  // Reference images from Python brand context (http + persisted /api/media R2 URLs)
  const refUrls: string[] = (() => {
    const raw = (pyCtx as any)?.reference_image_urls ?? [];
    if (Array.isArray(raw)) return filterBrandGalleryUrls(raw.filter((u: unknown) => typeof u === 'string'));
    try {
      return filterBrandGalleryUrls(JSON.parse(String(raw)).filter((u: unknown) => typeof u === 'string'));
    } catch {
      return [];
    }
  })();

  const galleryUrlKey = galleryUrlIdentityKey;

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
    const urls = filterBrandGalleryUrls(allUrls as string[]);
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

  // Poll gallery-analysis after background upload so tags appear without manual refresh.
  async function pollGalleryAnalysisAfterUpload(expectedNew: number) {
    const baseline = Object.keys(
      (await fetchTenantBff(`/api/brand-context/${tenantId}/gallery-analysis`, tenantId)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({}))) as Record<string, unknown>,
    ).length;
    const target = baseline + expectedNew;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      try {
        const cacheRes = await fetchTenantBff(`/api/brand-context/${tenantId}/gallery-analysis`, tenantId);
        if (!cacheRes.ok) continue;
        const meta = await cacheRes.json() as Record<string, unknown>;
        const count = Object.keys(meta).length;
        if (count >= target) {
          setAnalyzeStatus(`✓ ${expectedNew} fotoğraf yüklendi ve AI etiketleme tamamlandı.`);
          await invalidateBrandContextWriteQueries(queryClient, tenantId, [['gallery-analysis', tenantId]]);
          return;
        }
      } catch { /* keep polling */ }
    }
    setAnalyzeStatus((prev) =>
      prev.includes('arka planda')
        ? `✓ ${expectedNew} fotoğraf yüklendi. AI etiketleme sürüyor — birkaç dakika sonra "AI ile Analiz Et" ile kontrol edin.`
        : prev,
    );
  }

  // Upload one or more photos — R2 persist; vision analysis runs in background
  async function handleUpload(files: File | File[]) {
    if (uploadGate?.decision === 'blocked') {
      setAnalyzeStatus('Bu fotoğraf türü işletme politikanızda kapalı. Marka → Üretim → Galeri yönetimi açık olmalı.');
      return;
    }
    const fileList = Array.isArray(files) ? files : [files];
    setUploading(true);
    try {
      const formData = new FormData();
      for (const file of fileList) formData.append('file', file);

      setAnalyzeStatus(`${fileList.length} fotoğraf yükleniyor…`);
      const res = await fetchTenantBff(
        `/api/brand-context/${tenantId}/gallery-upload`,
        tenantId,
        { method: 'POST', body: formData },
      );
      const data = await res.json().catch(() => ({})) as {
        ok?: boolean;
        error?: string;
        uploaded?: number;
        analyzed?: number;
        analysisPending?: boolean;
        total?: number;
        urls?: string[];
        errors?: Array<{ url: string; error: string }>;
      };

      if (!res.ok) {
        throw new Error(data.error || `Yükleme başarısız (${res.status})`);
      }

      const uploaded = data.uploaded ?? data.urls?.length ?? 0;
      const total = data.total ?? uploaded;
      if (data.analysisPending && uploaded > 0) {
        setAnalyzeStatus(`✓ ${uploaded} fotoğraf yüklendi (galeri: ${total}). AI etiketleme arka planda devam ediyor…`);
      } else if ((data.analyzed ?? 0) > 0) {
        setAnalyzeStatus(`✓ ${uploaded} fotoğraf yüklendi, ${data.analyzed} tanesi AI ile analiz edildi.`);
      } else if (uploaded > 0) {
        setAnalyzeStatus(`✓ ${uploaded} fotoğraf yüklendi; analiz sonucu boş — "AI ile Analiz Et" ile tekrar deneyin.`);
      } else {
        setAnalyzeStatus('Yükleme tamamlandı.');
      }

      await invalidateBrandContextWriteQueries(
        queryClient,
        tenantId,
        [['media-assets-mobile', tenantId], ['gallery-analysis', tenantId]],
      );

      if (data.analysisPending && uploaded > 0) {
        void pollGalleryAnalysisAfterUpload(uploaded);
      }
    } catch (e) {
      setAnalyzeStatus(e instanceof Error ? e.message : 'Yükleme hatası');
    } finally {
      setUploading(false);
      if (galleryFileInputRef.current) galleryFileInputRef.current.value = '';
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
          width: '100%', padding: '13px 14px', borderRadius: 14, cursor: uploading ? 'default' : 'pointer',
          opacity: uploading ? 0.6 : 1,
          background: 'rgba(255,255,255,0.03)', border: `0.5px solid ${t.separator}`,
          color: t.textSecondary, fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          pointerEvents: uploading ? 'none' : 'auto',
        }}>
          {uploading ? '⏳ Yükleniyor…' : '📷 Yeni Fotoğraf Yükle'}
          <input
            ref={galleryFileInputRef}
            type="file"
            accept="image/*"
            multiple
            disabled={uploading}
            style={{ display: 'none' }}
            onChange={e => {
              const fs = Array.from(e.target.files ?? []);
              if (fs.length > 0) void handleUpload(fs);
            }}
          />
        </label>
        <p style={{ fontSize: 11, color: t.textMuted, textAlign: 'center', marginTop: 6 }}>
          JPG, PNG, WebP · max 10MB · yükleme sonrası otomatik AI analiz
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
                      src={resolveGalleryImageSrc(url)}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        const img = e.currentTarget as HTMLImageElement;
                        if (!img.dataset.fallback) {
                          img.dataset.fallback = '1';
                          const direct = url.startsWith('http') ? upscaleCdnUrl(url) : url;
                          if (direct !== img.src) {
                            img.src = resolveGalleryImageSrc(direct);
                            return;
                          }
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

// ─── Advanced Visual Settings (collapsible sub-component) ───────────────
function AdvancedVisualSettings({ t, aiEnabled, aiLevel, aiGalleryRevise, aiUseIdentity, aiBriefDrives, aiEmbedLogo, aiSubject, aiCaptionDriven: _aiCaptionDriven, aiAdaptiveScene, aiAdaptiveMode, aiFormats, currentTheme, saveAiSetting, toggleFormat }: {
  t: T; aiEnabled: boolean; aiLevel: string; aiGalleryRevise: boolean;
  aiUseIdentity: boolean; aiBriefDrives: boolean; aiEmbedLogo: boolean;
  aiSubject: string; aiCaptionDriven: boolean; aiAdaptiveScene: boolean;
  aiAdaptiveMode: string; aiFormats: Set<string>;
  currentTheme: Record<string, unknown>;
  saveAiSetting: (patch: Record<string, unknown>) => void;
  toggleFormat: (fmt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: `0.5px solid ${t.separator}`, paddingTop: 12, marginTop: 4 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 0', background: 'transparent', border: 'none', cursor: 'pointer',
        }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: t.textSecondary }}>İleri Ayarlar</span>
        <span style={{ fontSize: 14, color: t.textMuted, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>{'\u25BC'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', borderRadius: 14, marginBottom: 12,
            background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
            border: `0.5px solid ${aiEnabled ? (t as any).accentBorder ?? t.accent : t.separator}`,
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>AI Fotoğraf İyileştirme</div>
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
                {aiEnabled ? 'Aktif' : 'Kapalı — ham galeri / passthrough'}
              </div>
            </div>
            <button
              onClick={() => saveAiSetting({ ai_photo_enhance: !aiEnabled, ai_enhance_gallery_selected: !aiEnabled })}
              style={{ width: 50, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer', background: aiEnabled ? t.accent : t.separator, position: 'relative' }}>
              <div style={{ position: 'absolute', top: 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', left: aiEnabled ? 25 : 3, transition: 'left 0.2s' }} />
            </button>
          </div>

          {aiEnabled && (
            <div>
              <div style={{ fontSize: 11, color: (t as any).labelColor ?? t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Geliştirme Seviyesi</div>
              {[
                { level: 'subtle', label: 'Hafif', desc: 'Işık ve renk iyileştirmesi' },
                { level: 'moderate', label: 'Orta', desc: 'Sahne atmosferi güçlendirme' },
                { level: 'full', label: 'Tam', desc: 'Tam sahne değişimi' },
              ].map(({ level, label, desc }) => {
                const isActive = aiLevel === level;
                return (
                  <button key={level} onClick={() => saveAiSetting({ ai_photo_enhance_level: level })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', marginBottom: 6, background: isActive ? (t as any).accentDim ?? 'rgba(139,171,189,0.1)' : 'transparent', border: `0.5px solid ${isActive ? t.accent : t.separator}` }}>
                    <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? t.accent : t.textPrimary }}>{label}</div>
                    <div style={{ fontSize: 11, color: t.textMuted }}>{desc}</div>
                  </button>
                );
              })}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 14, margin: '14px 0 8px', background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: `0.5px solid ${aiGalleryRevise ? t.accent : t.separator}` }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>Galeri fotoğrafını düzelt</div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{aiGalleryRevise ? 'GPT images.edit ile iyileştirilir' : 'Kapalı'}</div>
                </div>
                <button onClick={() => saveAiSetting({ ai_enhance_gallery_selected: !aiGalleryRevise })}
                  style={{ width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', background: aiGalleryRevise ? '#10B981' : t.separator, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', left: aiGalleryRevise ? 21 : 3, transition: 'left 0.2s' }} />
                </button>
              </div>

              <div style={{ fontSize: 11, color: (t as any).labelColor ?? t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '16px 0 10px' }}>Görsel standardı</div>
              {[
                { key: 'ai_use_brand_identity', on: aiUseIdentity, title: 'Marka kimliği' },
                { key: 'ai_brief_drives_scene', on: aiBriefDrives, title: 'Brief sahneyi yönetir' },
                { key: 'ai_embed_logo', on: aiEmbedLogo, title: 'Logo yerleştir' },
              ].map(({ key, on, title }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 12, marginBottom: 6, border: `0.5px solid ${t.separator}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary }}>{title}</div>
                  <button onClick={() => saveAiSetting({ [key]: !on })}
                    style={{ width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', background: on ? t.accent : t.separator, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', left: on ? 21 : 3, transition: 'left 0.2s' }} />
                  </button>
                </div>
              ))}

              <div style={{ fontSize: 11, color: (t as any).labelColor ?? t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '12px 0 8px' }}>Görsel konu</div>
              {[
                { id: 'auto', label: 'Otomatik' },
                { id: 'venue_ambiance', label: 'Mekan / ambiyans' },
                { id: 'product_hero', label: 'Ürün hero' },
              ].map(({ id, label }) => {
                const active = aiSubject === id;
                return (
                  <button key={id} onClick={() => saveAiSetting({ ai_visual_subject: id })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', marginBottom: 6, background: active ? (t as any).accentDim ?? 'rgba(139,171,189,0.1)' : 'transparent', border: `0.5px solid ${active ? t.accent : t.separator}` }}>
                    <div style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? t.accent : t.textPrimary }}>{label}</div>
                  </button>
                );
              })}

              <div style={{ fontSize: 11, color: (t as any).labelColor ?? t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '16px 0 10px' }}>AI Sahne Uyarlama</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 14, marginBottom: 10, background: t.isDark ? 'rgba(77,112,136,0.08)' : 'rgba(77,112,136,0.06)', border: `0.5px solid ${aiAdaptiveScene ? 'rgba(77,112,136,0.35)' : t.separator}` }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>Caption&apos;a uygun sahne</div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{aiAdaptiveScene ? 'Aktif' : 'Kapalı'}</div>
                </div>
                <button onClick={() => saveAiSetting({ ai_adaptive_scene: !aiAdaptiveScene })}
                  style={{ width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', background: aiAdaptiveScene ? '#4D7088' : t.separator, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', left: aiAdaptiveScene ? 21 : 3, transition: 'left 0.2s' }} />
                </button>
              </div>
              {aiAdaptiveScene && (
                <div style={{ marginBottom: 12 }}>
                  {[
                    { id: 'auto', label: 'Otomatik' },
                    { id: 'venue_context', label: 'Mekan / operasyon' },
                    { id: 'product_showcase', label: 'Ürün vitrin' },
                    { id: 'lifestyle_composite', label: 'Lifestyle kompozit' },
                  ].map(({ id, label }) => {
                    const active = aiAdaptiveMode === id;
                    return (
                      <button key={id} onClick={() => saveAiSetting({ ai_adaptive_scene_mode: id })}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', marginBottom: 6, background: active ? 'rgba(77,112,136,0.12)' : 'transparent', border: `0.5px solid ${active ? 'rgba(77,112,136,0.35)' : t.separator}` }}>
                        <div style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? '#4D7088' : t.textPrimary }}>{label}</div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div style={{ fontSize: 11, color: (t as any).labelColor ?? t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '12px 0 8px' }}>AI formatları</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(['post', 'story', 'carousel', 'reel'] as const).map((fmt) => {
                  const on = aiFormats.has(fmt);
                  const labels = { post: 'Post', story: 'Story', carousel: 'Carousel', reel: 'Reel' };
                  return (
                    <button key={fmt} onClick={() => toggleFormat(fmt)} style={{ padding: '8px 12px', borderRadius: 20, border: `0.5px solid ${on ? t.accent : t.separator}`, background: on ? (t as any).accentDim ?? 'rgba(139,171,189,0.1)' : 'transparent', fontSize: 12, fontWeight: on ? 700 : 500, color: on ? t.accent : t.textMuted, cursor: 'pointer' }}>
                      {labels[fmt]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `0.5px solid ${t.separator}` }}>
            <div style={{ fontSize: 11, color: (t as any).labelColor ?? t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Visual Production Director</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 14, background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: `0.5px solid ${themeFlag(currentTheme, 'enable_visual_production_director') ? t.accent : t.separator}` }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>Crew görsel direktör</div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{themeFlag(currentTheme, 'enable_visual_production_director') ? 'Açık' : 'Kapalı'}</div>
              </div>
              <button onClick={() => saveAiSetting({ enable_visual_production_director: !themeFlag(currentTheme, 'enable_visual_production_director') })}
                style={{ width: 50, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer', background: themeFlag(currentTheme, 'enable_visual_production_director') ? t.accent : t.separator, position: 'relative' }}>
                <div style={{ position: 'absolute', top: 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', left: themeFlag(currentTheme, 'enable_visual_production_director') ? 25 : 3, transition: 'left 0.2s' }} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────
export function BrandConstitution() {
  const { t } = useTheme();
  const queryClient = useQueryClient();
  const { tenantId: storeTenantId } = useWorkspaceStore();
  const tenantId = useActiveTenantId() ?? storeTenantId;
  const { goBack, brandReadinessFix, clearBrandReadinessFix } = useMobileStore();
  const [tab, setTab] = useState<Tab>('identity');
  const [view, setView] = useState<'dashboard' | 'section'>('dashboard');
  const [saved, setSaved] = useState(false);

  const openSection = React.useCallback((next: Tab) => {
    setTab(next);
    setView('section');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }, []);
  const [analyzeFeedback, setAnalyzeFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [descriptionAiFeedback, setDescriptionAiFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [newCompetitor, setNewCompetitor] = useState('');
  const [confirmingConstitution, setConfirmingConstitution] = useState(false);
  const [constitutionConfirmError, setConstitutionConfirmError] = useState<string | null>(null);

  useEffect(() => {
    if (!brandReadinessFix) return;
    const nextTab = brandReadinessFixToBrandTab(brandReadinessFix);
    if (nextTab) { setTab(nextTab); setView('section'); }
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

  const { data: productionReadiness } = useQuery<{
    productionProfile?: ProductionProfileReadinessResult;
  }>({
    queryKey: ['brand-readiness', tenantId],
    queryFn: async () => {
      if (!tenantId) return {};
      const r = await fetchTenantBff(`/api/brand-readiness/${tenantId}`, tenantId);
      if (!r.ok) return {};
      return r.json();
    },
    staleTime: 60_000,
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

  const descriptionAiMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId || !profile) throw new Error('tenant_required');
      setDescriptionAiFeedback(null);

      const current = profile as CompanyProfile & Record<string, unknown>;
      const websiteUrl = cleanProfileText(current.websiteUrl || (pyCtx as Record<string, unknown> | undefined)?.website_url);
      const instagramHandle = cleanProfileText(
        current.instagramHandle || (pyCtx as Record<string, unknown> | undefined)?.instagram_handle,
      ).replace(/^@/, '');
      const googleBusinessUrl = cleanProfileText(
        current.googleBusinessUrl || (pyCtx as Record<string, unknown> | undefined)?.google_business_url,
      );
      if (!websiteUrl && !instagramHandle && !googleBusinessUrl) {
        throw new Error('AI analizi için web sitesi, Instagram veya Google Business bilgisi ekleyin.');
      }

      try {
        await apiClient.discoverBrand({
          websiteUrl: websiteUrl || undefined,
          instagramHandle: instagramHandle || undefined,
          googleBusinessUrl: googleBusinessUrl || undefined,
          applyToProfile: true,
        });
      } catch {
        // Python analysis below is the source of truth for this field.
      }

      const analysis = await apiClient.analyzeBrandContext(tenantId, {
        websiteUrl,
        instagramHandle,
        googleBusinessUrl,
        brandName: cleanProfileText(current.brandName || (pyCtx as Record<string, unknown> | undefined)?.business_name),
      });
      const ctx = (analysis.brand_context ?? {}) as Record<string, unknown>;
      const pillars = analysis.content_pillars?.length
        ? analysis.content_pillars
        : parseArr(ctx.content_pillars);
      const ctas = analysis.default_ctas?.length
        ? analysis.default_ctas
        : parseArr(ctx.default_ctas);
      const industry = cleanProfileText(current.industry)
        || cleanProfileText(analysis.inferred_industry)
        || cleanProfileText(ctx.business_type)
        || cleanProfileText(ctx.industry);
      const nextDescription = buildAiBrandDescription({
        brandName: cleanProfileText(current.brandName || ctx.business_name),
        industry,
        location: cleanProfileText(current.location || ctx.location),
        websiteSummary: cleanProfileText(analysis.website_summary || ctx.website_summary || ctx.description),
        instagramBio: cleanProfileText(analysis.instagram_bio || ctx.instagram_bio),
        targetAudience: cleanProfileText(current.targetAudience || ctx.target_audience),
        brandTone: cleanProfileText(analysis.inferred_tone || ctx.brand_tone || current.brandTone),
        visualStyle: cleanProfileText(current.visualStyle || ctx.visual_style),
        contentPillars: pillars,
        defaultCtas: ctas,
      });

      if (!nextDescription) throw new Error('AI analizinden açıklama üretilemedi.');

      const updates: Partial<SaveCompanyProfileRequest> = {
        description: nextDescription,
      };
      if (!cleanProfileText(current.targetAudience) && cleanProfileText(ctx.target_audience)) {
        updates.targetAudience = cleanProfileText(ctx.target_audience).slice(0, 500);
      }
      if (!cleanProfileText(current.visualStyle) && cleanProfileText(ctx.visual_style)) {
        updates.visualStyle = cleanProfileText(ctx.visual_style).slice(0, 200);
      }
      if (!cleanProfileText(current.campaignGoals) && ctas.length) {
        updates.campaignGoals = ctas.join(', ').slice(0, 1000);
      }
      if (!cleanProfileText(current.contentNeeds) && pillars.length) {
        updates.contentNeeds = JSON.stringify(pillars);
      }

      await apiClient.saveCompanyProfile({ ...(current as any), ...updates } as SaveCompanyProfileRequest);
      patchPythonBrandFields({
        description: nextDescription,
        ...(updates.targetAudience ? { target_audience: updates.targetAudience } : {}),
        ...(updates.visualStyle ? { visual_style: updates.visualStyle } : {}),
      });
      return nextDescription;
    },
    onSuccess: () => {
      setDescriptionAiFeedback({ kind: 'ok', text: 'AI açıklaması oluşturuldu ve kaydedildi.' });
      queryClient.invalidateQueries({ queryKey: ['company-profile', tenantId] });
      void invalidateBrandContextWriteQueries(queryClient, tenantId);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) => {
      setDescriptionAiFeedback({
        kind: 'err',
        text: err instanceof Error ? err.message : 'AI açıklama analizi başarısız oldu.',
      });
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
    const profileRec = profile as unknown as Record<string, unknown>;
    const needsIndustrySync = Boolean(
      pyCtx && !pyCtxLoadFailed
      && shouldRefreshIndustryFromPython(profileRec, pyCtx as Record<string, unknown>),
    );
    if (!isCompanyProfileSparse(profileRec) && !needsIndustrySync) return;
    if (pyCtx && !pyCtxLoadFailed) {
      const patch = buildCompanyProfilePatchFromPython(profileRec, pyCtx as Record<string, unknown>);
      if (patch) {
        hydratedFromPythonRef.current = true;
        saveMutation.mutate(patch);
        return;
      }
    }
    hydratedFromPythonRef.current = true;
    hydrateMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot hydrate when profile sparse or sector stale
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
    { id: 'content', label: 'İçerik' },
    { id: 'design', label: 'Tasarım' },
    { id: 'gallery', label: 'Galeri' },
    { id: 'chatbot', label: 'Chatbot' },
  ];
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

  // ── Section navigation metadata (dashboard grid) ──
  const pprReady = productionReadiness?.productionProfile?.isProductionReady ?? false;
  const pprScore = productionReadiness?.productionProfile?.score ?? 0;
  const pillarsCount = (parseArr((pyCtx as any)?.content_pillars).length || contentNeeds.length);
  const ctasCount = parseArr((pyCtx as any)?.default_ctas).length;
  const photoCount = brandImages.length;
  const hasChatbot = Boolean((pyCtx as any)?.chatbot_profile);
  const channelsConnected = Boolean(websiteDisplay && instagramDisplay);

  type NavStatus = 'done' | 'warn' | 'neutral';
  type NavItem = { key: string; target: Tab; icon: string; label: string; status: NavStatus; hint: string; accent: string };
  const NAV_ITEMS: NavItem[] = [
    { key: 'identity', target: 'identity', icon: '🏢', label: 'Kimlik', accent: '#5A82A0',
      status: constitutionConfirmedAt ? 'done' : 'warn', hint: constitutionConfirmedAt ? 'Onaylı' : 'Onay bekliyor' },
    { key: 'content', target: 'content', icon: '✍️', label: 'İçerik', accent: '#7C9A7E',
      status: (pillarsCount >= 2 && ctasCount >= 1) ? 'done' : 'warn', hint: `${pillarsCount} sütun · ${ctasCount} CTA` },
    { key: 'design', target: 'design', icon: '🎨', label: 'Tasarım', accent: '#B08D57',
      status: pprReady ? 'done' : 'warn', hint: pprReady ? 'Üretime hazır' : `Profil ${pprScore}/${PRODUCTION_PROFILE_THRESHOLD}` },
    { key: 'gallery', target: 'gallery', icon: '📷', label: 'Galeri', accent: '#6E8CA0',
      status: photoCount >= 8 ? 'done' : 'warn', hint: `${photoCount} fotoğraf` },
    { key: 'chatbot', target: 'chatbot', icon: '🤖', label: 'Chatbot', accent: '#8E7CC3',
      status: hasChatbot ? 'done' : 'neutral', hint: hasChatbot ? 'Aktif' : 'Kurulmadı' },
    { key: 'channels', target: 'identity', icon: '🔗', label: 'Kanallar', accent: '#5FA8A0',
      status: channelsConnected ? 'done' : 'warn', hint: channelsConnected ? 'Bağlı' : 'Eksik bağlantı' },
  ];
  const activeNavLabel = NAV_ITEMS.find((n) => n.target === tab)?.label
    ?? TABS.find((tb) => tb.id === tab)?.label ?? 'Marka';

  const statusColor = (s: NavStatus): string =>
    s === 'done' ? t.success : s === 'warn' ? '#F59E0B' : t.textMuted;
  const statusGlyph = (s: NavStatus): string =>
    s === 'done' ? '✓' : s === 'warn' ? '!' : '·';

  const monogram = (brandNameDisplay || 'B').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const brandPrimary = String((pyCtx as any)?.brand_primary_color || (p as any).brandColors || t.accent).match(/#[0-9a-fA-F]{3,8}/)?.[0] || t.accent;
  const brsGood = Number(score) >= 80;

  const sharedStatusBanners = (
    <>
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
            onClick={() => { hydratedFromPythonRef.current = false; hydrateMutation.mutate(); }}
            disabled={hydrateMutation.isPending}
            style={{ display: 'block', marginTop: 8, padding: '8px 12px', borderRadius: 10, border: 'none', background: '#F59E0B', color: '#1a1200', fontWeight: 600, fontSize: 13, cursor: hydrateMutation.isPending ? 'wait' : 'pointer' }}
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
    </>
  );

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 96, transition: 'background 250ms' }}>

      {/* ── DASHBOARD VIEW ── */}
      {view === 'dashboard' && (
        <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 8px) 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <button
              type="button"
              onClick={goBack}
              aria-label="Geri"
              style={{ width: 36, height: 36, borderRadius: 12, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', color: t.textSecondary, flexShrink: 0 }}
            >
              <svg width="9" height="15" viewBox="0 0 9 15" fill="none" aria-hidden><path d="M7.5 1.5 1.5 7.5l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.03em', margin: 0, lineHeight: 1.1 }}>
              Marka Ayarları
            </h1>
          </div>

          {/* Brand hero card */}
          <div style={{
            position: 'relative', marginBottom: 20, padding: 18, borderRadius: 22, overflow: 'hidden',
            ...t.surfaceGroup,
          }}>
            <div style={{ position: 'absolute', inset: 0, background: brandPrimary, opacity: 0.04, pointerEvents: 'none' }} />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{
                width: 80, height: 80, borderRadius: 24, overflow: 'hidden', flexShrink: 0,
                background: logoUrl ? (t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : `linear-gradient(135deg, ${brandPrimary}, ${t.accent})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: t.isDark ? '0 4px 16px rgba(0,0,0,0.35)' : '0 4px 16px rgba(0,0,0,0.12)',
              }}>
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolveGalleryImageSrc(logoUrl)} alt={brandNameDisplay} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <span style={{ fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{monogram}</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                    {brandNameDisplay || 'Marka adı'}
                  </span>
                  <span style={{
                    padding: '3px 9px', borderRadius: 8, fontSize: 12, fontWeight: 700, letterSpacing: '-0.01em',
                    background: brsGood ? t.successDim : 'rgba(245,158,11,0.14)', color: brsGood ? t.success : '#F59E0B',
                  }}>
                    BRS {score}{brsGood ? ' ✓' : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {industryDisplay && (
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: t.accentDim, color: t.accent }}>
                      {industryDisplay}
                    </span>
                  )}
                  {locationDisplay && (
                    <span style={{ fontSize: 12.5, color: t.textTertiary }}>{locationDisplay}</span>
                  )}
                </div>
                {descriptionDisplay && (
                  <p style={{ fontSize: 13, color: t.textTertiary, lineHeight: 1.45, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {descriptionDisplay}
                  </p>
                )}
              </div>
            </div>

            {/* Quick stats */}
            <div style={{ position: 'relative', display: 'flex', gap: 0, marginTop: 16, paddingTop: 14, borderTop: `0.5px solid ${t.separator}` }}>
              {[
                { n: photoCount, l: 'Fotoğraf' },
                { n: pillarsCount, l: 'İçerik sütunu' },
                { n: ctasCount, l: 'CTA' },
              ].map((s, i) => (
                <div key={s.l} style={{ flex: 1, textAlign: 'center', borderLeft: i > 0 ? `0.5px solid ${t.separator}` : 'none' }}>
                  <div style={{ fontSize: 19, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{s.n}</div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Inline constitution CTA */}
            {!constitutionConfirmedAt && (
              <button
                type="button"
                onClick={() => void handleConfirmConstitution()}
                disabled={confirmingConstitution}
                style={{
                  position: 'relative', width: '100%', marginTop: 14, padding: '11px 16px', borderRadius: 12, border: 'none',
                  cursor: confirmingConstitution ? 'wait' : 'pointer', fontSize: 14, fontWeight: 600, color: '#fff',
                  background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                }}
              >
                {confirmingConstitution ? 'Onaylanıyor…' : 'Marka Anayasasını Onayla · +20 puan'}
              </button>
            )}
            {constitutionConfirmError && (
              <div style={{ position: 'relative', marginTop: 10, fontSize: 12.5, color: t.danger, lineHeight: 1.4 }}>{constitutionConfirmError}</div>
            )}
          </div>

          {sharedStatusBanners}

          {/* Production readiness — most important missing thing */}
          {productionReadiness?.productionProfile && !pprReady && (
            <button
              type="button"
              onClick={() => openSection('design')}
              style={{
                width: '100%', textAlign: 'left', marginBottom: 20, padding: '14px 16px', borderRadius: 16, cursor: 'pointer',
                background: 'rgba(245,158,11,0.08)', border: '0.5px solid rgba(245,158,11,0.28)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>
                  Üretim tasarım profili eksik ({pprScore}/{PRODUCTION_PROFILE_THRESHOLD})
                </span>
                <ChevronRight color={t.textTertiary} />
              </div>
              <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.45, marginTop: 4 }}>
                Fal story/post üretimi için service profile, visual_dna ve theme katmanlarını tamamla.
              </div>
            </button>
          )}

          {/* 2×3 section nav grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => openSection(item.target)}
                style={{
                  position: 'relative', textAlign: 'left', padding: '14px 14px 14px 16px', borderRadius: 16, cursor: 'pointer',
                  ...t.surfaceGroup, borderLeft: `3px solid ${item.accent}`,
                  display: 'flex', flexDirection: 'column', gap: 8, minHeight: 96,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 24, lineHeight: 1 }}>{item.icon}</span>
                  <span style={{
                    width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, color: '#fff', background: statusColor(item.status),
                  }}>{statusGlyph(item.status)}</span>
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.01em' }}>{item.label}</div>
                  <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 2 }}>{item.hint}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── SECTION HEADER (sticky) ── */}
      {view === 'section' && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 20,
          padding: 'calc(env(safe-area-inset-top,0px) + 8px) 16px 10px',
          background: t.isDark ? 'rgba(20,20,22,0.82)' : 'rgba(250,250,252,0.82)',
          backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          borderBottom: `0.5px solid ${t.separator}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <button
            type="button"
            onClick={() => setView('dashboard')}
            aria-label="Marka ayarlarına dön"
            style={{ display: 'flex', alignItems: 'center', gap: 3, border: 'none', background: 'none', cursor: 'pointer', color: t.accent, fontSize: 15, fontWeight: 500, padding: '4px 4px 4px 0', flexShrink: 0 }}
          >
            <svg width="9" height="15" viewBox="0 0 9 15" fill="none" aria-hidden><path d="M7.5 1.5 1.5 7.5l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Marka
          </button>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.02em', textAlign: 'center' }}>
            {activeNavLabel}
          </div>
          <div style={{ minWidth: 44, display: 'flex', justifyContent: 'flex-end' }}>
            {saveMutation.isPending ? (
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${t.separator}`, borderTopColor: t.accent, animation: 'spinSlow 0.8s linear infinite' }} />
            ) : saved ? (
              <span style={{ fontSize: 14, fontWeight: 600, color: t.success }}>✓</span>
            ) : null}
          </div>
        </div>
      )}

      {/* ── SECTION CONTENT ── */}
      {view === 'section' && (
      <div style={{ padding: '20px 20px 0' }}>
        {sharedStatusBanners}

        {tab === 'design' && productionReadiness?.productionProfile
          && !productionReadiness.productionProfile.isProductionReady && (
          <div style={{
            marginBottom: 16,
            padding: '14px 16px',
            borderRadius: 14,
            background: t.isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.06)',
            border: `0.5px solid ${t.isDark ? 'rgba(239,68,68,0.28)' : 'rgba(239,68,68,0.22)'}`,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary, marginBottom: 4 }}>
              Üretim tasarım profili eksik ({productionReadiness.productionProfile.score}/{PRODUCTION_PROFILE_THRESHOLD})
            </div>
            <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.45, marginBottom: 8 }}>
              Fal story/post üretimi için service profile, production visual_dna ve theme katmanları tamamlanmalı.
            </div>
            {(productionReadiness.productionProfile.missing ?? []).slice(0, 3).map((item) => (
              <div key={item.id} style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.4, marginTop: 4 }}>
                · {item.label}: {item.detail}
              </div>
            ))}
          </div>
        )}

        {/* IDENTITY */}
        {tab === 'identity' && (
          <>
            <BrandSectionIntro
              t={t}
              title="Kimlik"
              description="Marka adı, iletişim kanalları ve temel tanım. Mission ve Feed üretimi bu bilgileri referans alır."
            />
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
              <div style={{ padding: '14px 16px 0' }}>
                <button
                  type="button"
                  onClick={() => descriptionAiMutation.mutate()}
                  disabled={descriptionAiMutation.isPending}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 14,
                    border: `0.5px solid ${t.accentBorder}`,
                    background: t.accentDim,
                    color: t.accent,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: descriptionAiMutation.isPending ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  {descriptionAiMutation.isPending ? 'AI markayı analiz ediyor…' : 'AI ile analiz et ve doldur'}
                </button>
                {descriptionAiFeedback && (
                  <div style={{
                    marginTop: 8,
                    padding: '9px 11px',
                    borderRadius: 10,
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: descriptionAiFeedback.kind === 'err' ? '#b45309' : t.textSecondary,
                    background: descriptionAiFeedback.kind === 'err'
                      ? 'rgba(245,158,11,0.12)'
                      : (t.isDark ? 'rgba(16,185,129,0.10)' : 'rgba(16,185,129,0.08)'),
                    border: `0.5px solid ${descriptionAiFeedback.kind === 'err' ? 'rgba(245,158,11,0.35)' : 'rgba(16,185,129,0.28)'}`,
                  }}>
                    {descriptionAiFeedback.text}
                  </div>
                )}
              </div>
              <Field t={t} label="Açıklama & Ürünler" value={descriptionDisplay} onSave={save('description')} multiline hint="Markanızı tanımlayın; ürün/hizmet kataloğunu da buraya ekleyin — ajanlar bunu kullanır." />
            </SCard>

            <SCard t={t} title="Logo & Görseller">
              <Field t={t} label="Logo URL" value={String(logoCandidate || '')} onSave={save('logoUrl')} />
              <Field t={t} label="Marka Görselleri (virgülle)" value={(p as any).brandImageUrls ?? ''} onSave={save('brandImageUrls')} hint="https://..." multiline />
              {brandImages.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  {brandImages.slice(0, 6).map((url, i) => (
                    <div key={i} style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', background: t.isDark ? '#121220' : '#F0F0F6' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={resolveGalleryImageSrc(url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                    </div>
                  ))}
                </div>
              )}
            </SCard>
          </>
        )}

        {tab === 'content' && (
          <>
            <BrandSectionIntro
              t={t}
              title="İçerik"
              description="Ses tonu, hedef kitle ve kampanya odağı. Mission ve Feed caption'ları bu stratejiye göre üretilir."
            />

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

            <SCard t={t} title="Hedef Kitle">
              <Field t={t} label="Hedef Kitle" value={p.targetAudience || (pyCtx as any)?.target_audience || ''} onSave={save('targetAudience')} multiline hint="Kim için üretiyoruz?" />
            </SCard>

            <SCard t={t} title="Kampanya Hedefleri">
              <Field t={t} label="Hedefler" value={p.campaignGoals || (pyCtx as any)?.campaign_goals || ''} onSave={save('campaignGoals')} multiline hint="Ne başarmak istiyoruz?" />
            </SCard>

            {tenantId && (
              <SCard t={t} title="İçerik Stratejisi" accent={t.accent}>
                <BrandContentStrategyPanel
                  tenantId={tenantId}
                  t={t}
                  pyCtx={pyCtx as Record<string, unknown> | undefined}
                  sector={industrySlug || 'restaurant_cafe'}
                  onSaved={() => {
                    void queryClient.invalidateQueries({ queryKey: ['brand-context-data', tenantId] });
                    void queryClient.invalidateQueries({ queryKey: ['brand-readiness', tenantId] });
                  }}
                />
              </SCard>
            )}

            {tenantId && (
              <SCard t={t} title="Özel Günler">
                <BrandSpecialDaysPanel tenantId={tenantId} t={t} />
              </SCard>
            )}

            {tenantId && (
              <BrandScheduledTemplatesPanel
                tenantId={tenantId}
                t={t}
                sector={industrySlug || 'restaurant'}
              />
            )}

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
          </>
        )}

        {tab === 'design' && (
          <>
            <BrandSectionIntro
              t={t}
              title="Görünüm"
              description="Renk paleti, tipografi ve şablon kütüphanesi. Story / Reel / Post tasarımlarının görünümü buradan gelir. Üretim kontrolleri (görsel kaynağı, onay modu, motorlar) bu sayfanın altındadır."
            />

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

            {tenantId && (
              <SCard t={t} title="fal.ai Şablon Galerisi" accent={t.accent}>
                <BrandFalTemplateGalleryPanel
                  tenantId={tenantId}
                  sector={normalizeSectorId(String(p.industry ?? (pyCtx as any)?.business_type ?? ''))}
                  t={t}
                />
              </SCard>
            )}

            {tenantId && (
              <SCard t={t} title="Tasarım Yoğunluğu (fal.ai)" accent={t.accent}>
                <BrandFalDesignIntensityPanel
                  tenantId={tenantId}
                  theme={(brandThemePayload?.theme ?? {}) as Record<string, unknown>}
                  t={t}
                  onSaved={() => {
                    queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
                  }}
                />
              </SCard>
            )}

            <CollapsibleGroup
              t={t}
              title="Yazı tipi & başlık stili"
              subtitle="Başlık fontu, 3D/efekt, logo konumu, tipografi vibe'ı ve ana/ikincil fontlar"
            >
            {tenantId && (
              <PostDesignDefaultsPanel
                t={t}
                workspaceId={tenantId}
                theme={(brandThemePayload?.theme ?? {}) as Record<string, unknown>}
                onSave={async (next) => {
                  const currentTheme = (brandThemePayload?.theme ?? {}) as Record<string, unknown>;
                  await fetchTenantBff(`/api/brand-context/${tenantId}/theme`, tenantId, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
                    body: JSON.stringify({
                      theme: {
                        ...currentTheme,
                        post_design_defaults: next,
                        postDesignDefaults: next,
                      },
                    }),
                  }).catch(() => {/* non-fatal */});
                  queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
                }}
              />
            )}

            {tenantId && (
              <TypographyDesignPanel
                t={t}
                theme={(brandThemePayload?.theme ?? {}) as Record<string, unknown>}
                sector={normalizeSectorId(p.sector || (pyCtx as any)?.business_type || '')}
                onSave={async (next) => {
                  const currentTheme = (brandThemePayload?.theme ?? {}) as Record<string, unknown>;
                  await fetchTenantBff(`/api/brand-context/${tenantId}/theme`, tenantId, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
                    body: JSON.stringify({
                      theme: {
                        ...currentTheme,
                        typography_design: next,
                        typographyDesign: next,
                      },
                    }),
                  }).catch(() => {/* non-fatal */});
                  queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
                }}
              />
            )}

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
            </CollapsibleGroup>

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

            <CollapsibleGroup
              t={t}
              title="Marka DNA & görsel dil"
              subtitle="Marka karakterini özetleyen görsel DNA ve vibe analizi"
            >
            <VibeDnaTab t={t} tenantId={tenantId} pyCtx={pyCtx} queryClient={queryClient} />
            </CollapsibleGroup>
          </>
        )}

        {tab === 'design' && (
          <>
            <BrandSectionIntro
              t={t}
              title="Üretim"
              description="Günlük kullanımda yalnızca iki ayar önemli: Görsel Kaynağı ve Onay Modu. Gelişmiş tasarım motorları, kurallar ve analiz verileri aşağıdaki katlanabilir gruplarda toplanır."
            />
            <CollapsibleGroup
              t={t}
              title="Kurallar, yetenekler & şablonlar"
              subtitle="Özel kurallar, risk sınırları, işletme yetenekleri ve Canva şablonları"
            >
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
            </CollapsibleGroup>
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

            <CollapsibleGroup
              t={t}
              title="Analiz & performans"
              subtitle="AI değerlendirmesi, sistem analizi, ham veriler ve Meta reklam özeti"
            >
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
            </CollapsibleGroup>

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

            {/* Mertcafe entegrasyonu → Chatbot sekmesine taşındı */}

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
                <SCard t={t} title="Görsel Kaynak Tercihi" accent={t.accent}>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, color: t.textTertiary, lineHeight: 1.6, marginBottom: 16 }}>
                      Üretimde kullanılacak görsel kaynağını seçin. Galeri boşsa AI görseller otomatik üretilir.
                    </div>

                    {/* ── 3-mode radio cards ── */}
                    {(() => {
                      const currentMode = resolveVisualSourceMode(currentTheme);
                      const modes: { id: VisualSourceMode; icon: string; title: string; desc: string }[] = [
                        { id: 'gallery_only', icon: '\u{1F4F7}', title: 'Mekan fotoğrafları', desc: 'Galeri / Instagram\'dan gelen gerçek mekan görselleri' },
                        { id: 'gallery_enhanced', icon: '\u2728', title: 'Mekan foto + AI düzeltme', desc: 'Gerçek fotoğraflara ışık, mood ve sahne düzeltmesi' },
                        { id: 'ai_generated', icon: '\u{1F916}', title: 'AI üretimi', desc: 'Caption\'dan sıfırdan yapay zeka görseli oluştur' },
                      ];
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                          {modes.map(({ id, icon, title, desc }) => {
                            const active = currentMode === id;
                            return (
                              <button key={id}
                                onClick={() => saveAiSetting({ visual_source_mode: id })}
                                style={{
                                  width: '100%', padding: '14px 16px', borderRadius: 14, cursor: 'pointer',
                                  textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14,
                                  background: active
                                    ? (t.isDark ? 'rgba(139,171,189,0.12)' : 'rgba(59,130,246,0.06)')
                                    : 'transparent',
                                  border: `1.5px solid ${active ? t.accent : t.separator}`,
                                  transition: 'all 0.2s',
                                }}>
                                <div style={{ fontSize: 24, lineHeight: 1, flexShrink: 0 }}>{icon}</div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 14, fontWeight: active ? 700 : 600, color: active ? t.accent : t.textPrimary }}>{title}</div>
                                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2, lineHeight: 1.4 }}>{desc}</div>
                                </div>
                                <div style={{
                                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                                  border: `2px solid ${active ? t.accent : t.separator}`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                  {active && <div style={{ width: 10, height: 10, borderRadius: '50%', background: t.accent }} />}
                                </div>
                              </button>
                            );
                          })}
                          {currentMode === 'gallery_enhanced' && (
                            <div style={{ fontSize: 10, color: t.textMuted, padding: '0 4px', lineHeight: 1.5 }}>
                              Varsayılan mod — galeri fotoğrafları GPT images.edit ile iyileştirilir.
                            </div>
                          )}
                          {(currentMode === 'gallery_only' || currentMode === 'gallery_enhanced') && (() => {
                            const rawRefs = (pyCtx as any)?.reference_image_urls;
                            const hasGallery = Array.isArray(rawRefs) ? rawRefs.length > 0 : Boolean(rawRefs);
                            if (hasGallery) return null;
                            return (
                              <div style={{
                                padding: '10px 14px', borderRadius: 12, marginTop: 8,
                                background: t.isDark ? 'rgba(251,191,36,0.08)' : 'rgba(251,191,36,0.06)',
                                border: '0.5px solid rgba(251,191,36,0.3)',
                                display: 'flex', alignItems: 'flex-start', gap: 10,
                              }}>
                                <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{'\u26A0\uFE0F'}</span>
                                <div style={{ fontSize: 11, color: t.textSecondary, lineHeight: 1.5 }}>
                                  Henüz mekan fotoğrafınız yok. <strong>Galeri</strong> sekmesinden yükleyin —
                                  o zamana kadar AI görseller otomatik üretilir.
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })()}

                    {/* ── İleri Ayarlar (collapsible) ── */}
                    <AdvancedVisualSettings
                      t={t}
                      aiEnabled={aiEnabled}
                      aiLevel={aiLevel}
                      aiGalleryRevise={aiGalleryRevise}
                      aiUseIdentity={aiUseIdentity}
                      aiBriefDrives={aiBriefDrives}
                      aiEmbedLogo={aiEmbedLogo}
                      aiSubject={aiSubject}
                      aiCaptionDriven={aiCaptionDriven}
                      aiAdaptiveScene={aiAdaptiveScene}
                      aiAdaptiveMode={aiAdaptiveMode}
                      aiFormats={aiFormats}
                      currentTheme={currentTheme}
                      saveAiSetting={saveAiSetting}
                      toggleFormat={toggleFormat}
                    />

                  </div>
                </SCard>
              );
            })()}

            <CollapsibleGroup
              t={t}
              title="Tasarım motorları & hareket"
              subtitle="Ürün vitrini, Remotion · FAL · Runway, motion stili, reel hareketi, story sesi ve logo kuralları"
              accent="#8B5CF6"
            >
            {tenantId && (
              <SCard t={t} title="Ürün Vitrin (Product Showcase)" accent="#10B981">
                <BrandProductShowcasePanel
                  tenantId={tenantId}
                  theme={((brandThemePayload?.theme ?? {}) as Record<string, unknown>)}
                  t={t}
                  onSaved={() => {
                    queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
                  }}
                />
              </SCard>
            )}

            {tenantId && (
              <SCard t={t} title="Üretim Motorları (Remotion · FAL · Runway)" accent="#8B5CF6">
                <BrandProductionEnginesPanel
                  tenantId={tenantId}
                  theme={((brandThemePayload?.theme ?? {}) as Record<string, unknown>)}
                  t={t}
                  onSaved={() => {
                    queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
                  }}
                />
              </SCard>
            )}

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
                const base = parseMotionProfileFromTheme(currentTheme, { sector: sectorNorm, tenantId: tenantId ?? undefined });
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
              <SCard t={t} title="Reel Motion (Runway)">
                <ReelMotionSettingsPanel
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
            </CollapsibleGroup>
          </>
        )}

        {tab === 'chatbot' && tenantId && (
          <>
            <BrandSectionIntro
              t={t}
              title="Instagram Chatbot"
              description="DM chatbot ve ilerideki agent/voice aramaları için marka bilgisi. Analiz sonucu veritabanında saklanır."
            />
            <BrandChatbotProfileCard
              t={t}
              workspaceId={tenantId}
              brandName={brandNameDisplay}
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
          </>
        )}

        {tab === 'gallery' && (
          <GalleryTab t={t} tenantId={tenantId} pyCtx={pyCtx} queryClient={queryClient} companyProfile={profile as CompanyProfile} />
        )}
      </div>
      )}
    </div>
  );
}
