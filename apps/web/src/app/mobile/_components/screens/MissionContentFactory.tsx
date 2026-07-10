'use client';
/**
 * MISSION CONTENT FACTORY
 *
 * Takes the content ideas from a completed mission node (content_ideation output)
 * and turns each idea into a publishable Instagram creative:
 *
 *   Swipe through ideas  →  Generate visual  →  Preview  →  Save to Outputs
 *
 * Flow:
 *   MissionHub (completed mission) →  this screen  →  Outputs (pending_review)
 *   → ApprovalFeedback → Published
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProductionBrandContextSnapshot } from '@smartagency/contracts';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { useTenantBrandContext } from '../TenantBrandProvider';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { AutoProductionFeed } from './AutoProductionFeed';
import { apiClient } from '@/lib/api-client';
import type { BrandTheme } from '@/types/brand-theme';

import {
  buildGalleryUsageFromArtifacts,
  contentTypeToPostType,
  getExcludeUrlsForPostType,
  isGalleryUrlUsedForPostType,
  normalizeGalleryUrl,
} from '@/lib/gallery-usage-tracker';
import {
  matchPhotoToContent,
  resolveBestGalleryUrl,
  buildGalleryLookup,
  rankPhotosForContent,
  rankPhotosForContentSeeded,
  enrichGalleryAnalysis,
  type GalleryPhotoMeta,
  type MatchPhotoInput,
} from '@/lib/gallery-photo-matcher';
import { signalFromArtifact, type ArtifactIdea } from '@/components/artifacts/artifact-preview';
import type { MissionNodeProgress, MissionProgress } from '@/types';
import {
  DEFAULT_ANNOUNCEMENT_PREFERENCES,
  sectorTemplatesForUseCase,
  getFavoriteTemplates,
  getRecentTemplates,
  recordTemplateUsage,
  inferAnnouncementUseCase,
  parseAnnouncementPreferences,
  smartSelectTemplate,
  type AnnouncementTemplateId,
  type AnnouncementUseCase,
} from '@/lib/announcement-template-library';
import {
  resolveAnnouncementBrandKit,
} from '@/lib/announcement-brand-kit';
import { isUsableGalleryPhotoUrl, resolveBrowserImageSrc } from '@/lib/media-url';
import { parseBrandReferenceUrls } from '@/lib/gallery-upload';
import { useMobileArtifacts } from '../../_hooks/use-mobile-artifacts';
import {
  NON_VENUE_SECTORS,
} from '@/lib/sector-gallery-seed';
import {
  buildMultiReelPhotoInputs,
  callGenerateMultiReel,
  isUsableReelPhotoUrl,
  maxPhotosForStrategy,
  resolveRunwayReelStrategy,
} from '@/lib/reel-multi-production';
import { productionIdeaFromRecord } from '@/lib/production-idea-parse';
import {
  buildReelAgentVisualDirection,
  buildReelGenerateReelRequest,
  reelDirectorExtrasFromIdeaRecord,
} from '@/lib/reel-director-context';
import { nodeHasOutput, nodeOutputArray, nodeOutputObject } from '@/lib/mission-node-output';
import { extractObjectArrayFromSummary } from '@/lib/output-summary-array';
import {
  resolveAiVisualProductionStandard,
  type BrandContextForVisual,
} from '@/lib/ai-visual-production-standard';
import {
  auditRendererPayload,
  type RendererBrandContext,
  type RendererGalleryMeta,
} from '@/lib/renderer-payload';
import { inferProductionAssignment } from '@/lib/production-pipeline-router';
import { isGalleryOnlyVisualPolicy } from '@/lib/visual-overlay-policy';
import { productionSnapshotToLegacyBrandContext } from '@/lib/production-snapshot-compat';


// ── Design card prompt builder ────────────────────────────────────────────────
/**
 * Builds a professional graphic design prompt for text-on-brand-photo content.
 * The AI acts as a graphic designer: brand photo as base, typography overlaid
 * without covering the main subject.
 */
/**
 * Premium Canvas compositor — brand venue photo (pixel-perfect) + agency-quality typography.
 *
 * Design principles:
 * - Photo is the hero: text only in the bottom safe zone, never on main subject
 * - Cinema-quality gradient scrim (5-stop fade, no harsh cutoff)
 * - Pixel-accurate text wrapping using measureText (not character count)
 * - Story/Reel: CTA pill → decorative line → large headline (left-aligned)
 * - Post (1:1): same layout, proportionally scaled
 * - Thin accent bar on left edge for premium brand feel
 */
// ── Canvas Design Templates ───────────────────────────────────────────────────

// ── Design Template system ────────────────────────────────────────────────────
// Persists used designs so the same visual language can be reapplied to
// future content. Stored per brand (keyed by tenantId) in localStorage.
// Each saved template carries enough state to reproduce the same style:
//   Canvas: styleIdx → re-runs composeBrandPhotoCard with same params
//   Agency: agencyDesignSpec → re-uses image_edit_prompt skeleton with new copy

export interface DesignTemplate {
  id:               string;
  name:             string;     // e.g. "○ Soft Bottom · post"
  label:            string;     // display badge e.g. "○ Soft Bottom" or "⚡ Impact"
  source:           'canvas' | 'agency';
  canvasStyleIdx?:  number;     // for source='canvas'
  agencyDesignSpec?: Record<string, unknown>; // for source='agency' — sans specific headline
  thumbnail:        string;     // compressed preview URL or small base64
  contentType:      string;     // 'post' | 'story' | 'reel'
  savedAt:          string;
  exampleHeadline?: string;
  textEffect?:      TextEffectPreset;
  fontPreset?:      DisplayFontPreset;
  accentColor?:     string;
  logoPosition?:    LogoPosition;
}

type LogoPosition = 'top_left' | 'top_center' | 'top_right' | 'bottom_left' | 'bottom_center' | 'bottom_right';
type DisplayFontPreset = 'clean_sans' | 'elegant_serif' | 'condensed_impact' | 'bold_display' | 'poster_3d' | 'sticker_pop';
type TextEffectPreset = 'soft_shadow' | 'extrude_3d' | 'neon_3d' | 'editorial_outline' | 'gradient_stack';

interface SavedPostTemplateRecord {
  id: string;
  name: string;
  format: string;
  status: string;
  template_kind: string;
  layout_spec: Record<string, unknown>;
  thumbnail_url?: string | null;
  example_artifact_url?: string | null;
  usage_count?: number;
  last_used_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

// Compress a data:image URL or remote URL to a small 200px JPEG for preview storage
async function makeThumbnail(imageUrl: string, isVertical: boolean): Promise<string> {
  if (!imageUrl) return '';
  const TH_W = isVertical ? 80 : 140;
  const TH_H = isVertical ? 140 : 80;

  // For remote URLs, proxy them; data: URLs are used directly
  const src = resolveBrowserImageSrc(imageUrl);

  try {
    const res = await fetch(src);
    if (!res.ok) return imageUrl.startsWith('http') ? imageUrl : imageUrl.slice(0, 800);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);

    return await new Promise<string>((resolve) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objUrl);
        const c = document.createElement('canvas');
        c.width = TH_W; c.height = TH_H;
        const ctx = c.getContext('2d')!;
        const ir = img.width / img.height, cr = TH_W / TH_H;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (ir > cr) { sw = img.height * cr; sx = (img.width - sw) / 2; }
        else          { sh = img.width  / cr; sy = (img.height - sh) / 2; }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, TH_W, TH_H);
        resolve(c.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => { URL.revokeObjectURL(objUrl); resolve(''); };
      img.src = objUrl;
    });
  } catch { return ''; }
}

const TEMPLATE_STORAGE_KEY = 'sa_design_templates_v2';

export function loadSavedTemplates(tenantId?: string): DesignTemplate[] {
  try {
    const key = tenantId ? `${TEMPLATE_STORAGE_KEY}_${tenantId}` : TEMPLATE_STORAGE_KEY;
    const raw = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveDesignTemplate(tmpl: DesignTemplate, tenantId?: string) {
  try {
    const key = tenantId ? `${TEMPLATE_STORAGE_KEY}_${tenantId}` : TEMPLATE_STORAGE_KEY;
    const existing = loadSavedTemplates(tenantId);
    const next = [tmpl, ...existing.filter(t => t.id !== tmpl.id)].slice(0, 20);
    localStorage.setItem(key, JSON.stringify(next));
  } catch { /* ignore quota errors */ }
}

export function deleteDesignTemplate(id: string, tenantId?: string) {
  try {
    const key = tenantId ? `${TEMPLATE_STORAGE_KEY}_${tenantId}` : TEMPLATE_STORAGE_KEY;
    const existing = loadSavedTemplates(tenantId);
    localStorage.setItem(key, JSON.stringify(existing.filter(t => t.id !== id)));
  } catch { /* ignore */ }
}

// Legacy compat — old CanvasTemplate keys
export interface CanvasTemplate extends DesignTemplate { styleIdx: number; headline?: string; }
export function saveTemplate(tmpl: CanvasTemplate, tenantId?: string) { saveDesignTemplate(tmpl, tenantId); }

function designTemplateToPostTemplatePayload(tmpl: DesignTemplate) {
  return {
    name: tmpl.name || tmpl.label || 'Post template',
    format: tmpl.contentType || 'post',
    status: 'active',
    template_kind: tmpl.source,
    layout_spec: {
      source: tmpl.source,
      label: tmpl.label,
      canvasStyleIdx: tmpl.canvasStyleIdx,
      agencyDesignSpec: tmpl.agencyDesignSpec,
      contentType: tmpl.contentType,
      exampleHeadline: tmpl.exampleHeadline,
      textEffect: tmpl.textEffect,
      fontPreset: tmpl.fontPreset,
      accentColor: tmpl.accentColor,
      logoPosition: tmpl.logoPosition,
    },
    thumbnail_url: tmpl.thumbnail || null,
    example_artifact_url: tmpl.thumbnail?.startsWith('http') ? tmpl.thumbnail : null,
  };
}

function postTemplateRecordToDesignTemplate(record: SavedPostTemplateRecord): DesignTemplate {
  const spec = record.layout_spec ?? {};
  const source = spec.source === 'agency' ? 'agency' : 'canvas';
  return {
    id: record.id,
    name: record.name,
    label: String(spec.label ?? record.name),
    source,
    canvasStyleIdx: typeof spec.canvasStyleIdx === 'number' ? spec.canvasStyleIdx : undefined,
    agencyDesignSpec: typeof spec.agencyDesignSpec === 'object' && spec.agencyDesignSpec
      ? spec.agencyDesignSpec as Record<string, unknown>
      : undefined,
    thumbnail: record.thumbnail_url ?? record.example_artifact_url ?? '',
    contentType: String(spec.contentType ?? record.format ?? 'post'),
    savedAt: record.created_at ?? new Date().toISOString(),
    exampleHeadline: typeof spec.exampleHeadline === 'string' ? spec.exampleHeadline : undefined,
    textEffect: normalizeTextEffectPreset(typeof spec.textEffect === 'string' ? spec.textEffect : undefined),
    fontPreset: normalizeDisplayFontPreset(typeof spec.fontPreset === 'string' ? spec.fontPreset : undefined),
    accentColor: typeof spec.accentColor === 'string' ? spec.accentColor : undefined,
    logoPosition: (
      spec.logoPosition === 'top_center' || spec.logoPosition === 'top_right'
      || spec.logoPosition === 'bottom_left' || spec.logoPosition === 'bottom_center' || spec.logoPosition === 'bottom_right'
        ? spec.logoPosition
        : undefined
    ) as LogoPosition | undefined,
  };
}

async function createRemotePostTemplate(tenantId: string, tmpl: DesignTemplate): Promise<SavedPostTemplateRecord | null> {
  const res = await fetch(`/api/brand-context/${tenantId}/post-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
    body: JSON.stringify(designTemplateToPostTemplatePayload(tmpl)),
  });
  if (!res.ok) return null;
  return await res.json() as SavedPostTemplateRecord;
}

async function markRemotePostTemplateUsed(tenantId: string, templateId: string): Promise<void> {
  await fetch(`/api/brand-context/${tenantId}/post-templates/${templateId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
    body: JSON.stringify({ increment_usage: true }),
  }).catch(() => {});
}

async function deleteRemotePostTemplate(tenantId: string, templateId: string): Promise<boolean> {
  const res = await fetch(`/api/brand-context/${tenantId}/post-templates/${templateId}`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Id': tenantId },
  });
  return res.ok;
}

// ── 4 distinct canvas layout styles ──────────────────────────────────────────
//
// 0: CLASSIC BOTTOM   — bottom gradient + left accent bar + headline left
// 1: CENTRE CARD      — frosted glass panel in center of image
// 2: TOP CORNER       — gradient from top, text in top-left safe zone
// 3: MINIMAL STRIP    — ultra-thin bottom strip, clean minimal feel
//
// Each style is defined by a DrawStyle object passed into the compositor.

// ── Minimal-first design language ────────────────────────────────────────────
// Photo is always the hero. Overlays are soft fades, never heavy blocks.
// Text is clean, lighter weight, with letter-spacing for luxury feel.
// No pill CTAs, no separator bars, no accent bars.

interface DrawStyle {
  name:          string;
  icon:          string;
  scrimCoverage: number;   // fraction of canvas height, max 0.32
  scrimMaxAlpha: number;   // peak opacity of the gradient, max 0.55
  textZone:      'bottom' | 'top' | 'center';
  textAlign:     'left' | 'center';
  hlWeight:      string;   // font-weight for headline
  hlScale:       number;
  tracking:      number;   // letter-spacing px (0 = normal, 6-10 = luxury)
  showCta:       boolean;
}

export const CANVAS_STYLES: DrawStyle[] = [
  {
    // Soft bottom fade — thin text, luxury spacing, no decoration
    name: 'Soft Bottom', icon: '○',
    scrimCoverage: 0.30, scrimMaxAlpha: 0.48,
    textZone: 'bottom', textAlign: 'left',
    hlWeight: '600', hlScale: 0.82, tracking: 2, showCta: false,
  },
  {
    // Ghost center — no fade, pure text-shadow legibility in natural dark zone
    name: 'Ghost Center', icon: '◎',
    scrimCoverage: 0.0, scrimMaxAlpha: 0,
    textZone: 'center', textAlign: 'center',
    hlWeight: '300', hlScale: 0.78, tracking: 8, showCta: false,
  },
  {
    // Top whisper — ultra-light top fade, minimal headline top-left
    name: 'Top Line', icon: '—',
    scrimCoverage: 0.22, scrimMaxAlpha: 0.40,
    textZone: 'top', textAlign: 'left',
    hlWeight: '500', hlScale: 0.74, tracking: 4, showCta: false,
  },
  {
    // Pure type — no overlay, single bold statement, text-shadow only
    name: 'Pure Type', icon: '◻',
    scrimCoverage: 0.20, scrimMaxAlpha: 0.35,
    textZone: 'bottom', textAlign: 'left',
    hlWeight: '700', hlScale: 0.90, tracking: 0, showCta: true,
  },
];

// Draws the brand logo onto a canvas at the given position.
// Fetches via media-proxy so CORS doesn't taint the canvas.
// Position: top/bottom logo slots used by saved deterministic templates.
// maxWidthFraction: logo width as fraction of canvas W (e.g. 0.18 = 18%)
async function drawLogoOnCanvas(
  ctx: CanvasRenderingContext2D,
  logoUrl: string,
  canvasW: number,
  canvasH: number,
  position: LogoPosition = 'top_left',
  isVertical = false,
): Promise<void> {
  if (!logoUrl) return;
  try {
    const src = resolveBrowserImageSrc(logoUrl);
    const res = await fetch(src);
    if (!res.ok) return;
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);

    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objUrl);
        const PAD = isVertical ? 64 : 52;
        const maxW = Math.round(canvasW * (isVertical ? 0.22 : 0.18));
        const scale = Math.min(maxW / img.width, maxW / img.height);
        const lW = Math.round(img.width * scale);
        const lH = Math.round(img.height * scale);

        const isBottom = position.startsWith('bottom_');
        const lX = position === 'top_center' || position === 'bottom_center'
          ? Math.round((canvasW - lW) / 2)
          : position === 'top_right' || position === 'bottom_right'
            ? canvasW - lW - PAD
            : PAD;
        const lY = isBottom
          ? canvasH - lH - (isVertical ? 92 : 72)
          : (isVertical ? 80 : 60);

        // Subtle background pill for contrast (especially for dark logos on dark photos)
        const pillPad = 10;
        ctx.save();
        ctx.beginPath();
        const pR = (lH / 2) + pillPad;
        const pX = lX - pillPad, pY = lY - pillPad;
        const pW = lW + pillPad * 2, pH = lH + pillPad * 2;
        ctx.roundRect(pX, pY, pW, pH, pR);
        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        ctx.fill();
        ctx.restore();

        ctx.drawImage(img, lX, lY, lW, lH);
        resolve();
      };
      img.onerror = () => { URL.revokeObjectURL(objUrl); resolve(); };
      img.src = objUrl;
    });
  } catch { /* logo load failure is non-fatal */ }
}

// ── Web font loader for Canvas ────────────────────────────────────────────────
// Fetches Google Fonts CSS2 API → extracts current woff2 URL → loads into FontFace.
// This avoids hardcoded versioned URLs that break when Google updates font files.
let _fontsLoaded = false;

async function loadGoogleFont(family: string, weight: string): Promise<void> {
  if (typeof document === 'undefined') return;
  const familyParam = encodeURIComponent(`${family}:wght@${weight}`);
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${familyParam}&display=swap`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    ).then(r => r.text());
    // Extract first woff2 URL from the CSS response
    const match = css.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+\.woff2)\)/);
    if (!match?.[1]) return;
    const face = new FontFace(family, `url(${match[1]})`, { weight, style: 'normal' });
    await face.load();
    document.fonts.add(face);
  } catch { /* non-fatal */ }
}

async function ensureDesignFonts(): Promise<void> {
  if (_fontsLoaded || typeof document === 'undefined') return;
  _fontsLoaded = true; // set early to prevent concurrent calls
  await Promise.allSettled([
    loadGoogleFont('Oswald', '700'),
    loadGoogleFont('Oswald', '400'),
    loadGoogleFont('Playfair Display', '700'),
    loadGoogleFont('Inter', '400'),
    loadGoogleFont('Inter', '600'),
    loadGoogleFont('Anton', '400'),
    loadGoogleFont('Bebas Neue', '400'),
    loadGoogleFont('Bangers', '400'),
    loadGoogleFont('Archivo Black', '400'),
  ]);
}

import { upscaleCdnUrl } from '@/lib/gallery-display-url';
export { upscaleCdnUrl, toFullSizeGalleryUrl, prepareGalleryDisplayUrls } from '@/lib/gallery-display-url';

export function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function normalizeDisplayFontPreset(value?: string): DisplayFontPreset {
  if (value === 'poster_3d' || value === 'sticker_pop' || value === 'elegant_serif'
    || value === 'condensed_impact' || value === 'clean_sans' || value === 'bold_display') {
    return value;
  }
  return 'bold_display';
}

function normalizeTextEffectPreset(value?: string): TextEffectPreset {
  if (value === 'extrude_3d' || value === 'neon_3d' || value === 'editorial_outline' || value === 'gradient_stack') {
    return value;
  }
  return 'soft_shadow';
}

function resolvePostDesignDefaults(theme?: BrandTheme | null): {
  fontPreset: DisplayFontPreset;
  textEffect: TextEffectPreset;
  logoPosition: LogoPosition;
  accentColor?: string;
  defaultTemplateId?: string;
} {
  const raw = (theme?.post_design_defaults ?? theme?.postDesignDefaults ?? {}) as Record<string, unknown>;
  return {
    fontPreset: normalizeDisplayFontPreset(typeof raw.font_preset === 'string' ? raw.font_preset : undefined),
    textEffect: normalizeTextEffectPreset(typeof raw.text_effect === 'string' ? raw.text_effect : undefined),
    logoPosition: (
      raw.logo_position === 'top_center' || raw.logo_position === 'top_right'
      || raw.logo_position === 'bottom_left' || raw.logo_position === 'bottom_center' || raw.logo_position === 'bottom_right'
        ? raw.logo_position
        : 'top_left'
    ) as LogoPosition,
    accentColor: typeof raw.accent_color === 'string' ? raw.accent_color : theme?.palette?.accent,
    defaultTemplateId: typeof raw.default_template_id === 'string'
      ? raw.default_template_id
      : typeof raw.defaultTemplateId === 'string'
        ? raw.defaultTemplateId
        : undefined,
  };
}

function resolveDisplayFont(preset: DisplayFontPreset): { family: string; weight: string; lineHeight: number } {
  switch (preset) {
    case 'poster_3d':
      return { family: 'Anton, "Archivo Black", Impact, sans-serif', weight: '400', lineHeight: 1.02 };
    case 'sticker_pop':
      return { family: 'Bangers, "Arial Black", Impact, sans-serif', weight: '400', lineHeight: 1.04 };
    case 'condensed_impact':
      return { family: 'Bebas Neue, Oswald, "Arial Narrow", Arial, sans-serif', weight: '400', lineHeight: 1.02 };
    case 'elegant_serif':
      return { family: '"Playfair Display", Georgia, "Times New Roman", serif', weight: '700', lineHeight: 1.12 };
    case 'clean_sans':
      return { family: 'Inter, "Helvetica Neue", Helvetica, Arial, sans-serif', weight: '400', lineHeight: 1.18 };
    default:
      return { family: 'Archivo Black, Inter, "Helvetica Neue", Helvetica, Arial, sans-serif', weight: '400', lineHeight: 1.06 };
  }
}

function tintTextColor(color: string, fallback: string): string {
  if (!color) return fallback;
  if (color.startsWith('#')) return color;
  if (color.startsWith('rgb')) return color;
  return fallback;
}

function drawDisplayText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  opts: {
    size: number;
    family: string;
    weight: string;
    align: CanvasTextAlign;
    fill: string;
    accent: string;
    effect: TextEffectPreset;
    tracking?: number;
  },
) {
  const tracking = Math.max(0, opts.tracking ?? 0);
  const displayText = tracking > 0
    ? text.split('').join(String.fromCharCode(0x200A).repeat(Math.round(tracking / 2)))
    : text;
  const fill = tintTextColor(opts.fill, '#ffffff');
  const accent = tintTextColor(opts.accent, '#ff2f8f');

  ctx.save();
  ctx.textAlign = opts.align;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${opts.weight} ${opts.size}px ${opts.family}`;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  if (opts.effect === 'extrude_3d' || opts.effect === 'gradient_stack') {
    const depth = Math.max(8, Math.round(opts.size * 0.14));
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = Math.round(opts.size * 0.10);
    for (let d = depth; d >= 1; d--) {
      const alpha = 0.26 + (d / depth) * 0.34;
      ctx.fillStyle = `rgba(18,10,34,${alpha.toFixed(2)})`;
      ctx.fillText(displayText, x + d, y + d, maxW);
    }
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(5, Math.round(opts.size * 0.07));
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeText(displayText, x, y, maxW);
    const gradient = ctx.createLinearGradient(x, y - opts.size, x, y + opts.size * 0.2);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.46, fill);
    gradient.addColorStop(1, accent);
    ctx.fillStyle = gradient;
    ctx.fillText(displayText, x, y, maxW);
  } else if (opts.effect === 'neon_3d') {
    ctx.lineWidth = Math.max(4, Math.round(opts.size * 0.05));
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.shadowColor = accent;
    ctx.shadowBlur = Math.round(opts.size * 0.22);
    ctx.strokeText(displayText, x, y, maxW);
    ctx.shadowBlur = Math.round(opts.size * 0.10);
    ctx.fillStyle = fill;
    ctx.fillText(displayText, x, y, maxW);
  } else if (opts.effect === 'editorial_outline') {
    ctx.lineWidth = Math.max(3, Math.round(opts.size * 0.045));
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = Math.round(opts.size * 0.16);
    ctx.strokeText(displayText, x, y, maxW);
    ctx.shadowBlur = 0;
    ctx.fillStyle = fill;
    ctx.fillText(displayText, x, y, maxW);
  } else {
    const shadows = [
      { blur: 32, off: 0, a: 0.55 },
      { blur: 14, off: 2, a: 0.40 },
      { blur: 4, off: 1, a: 0.60 },
    ];
    for (const s of shadows) {
      ctx.shadowColor = `rgba(0,0,0,${s.a})`;
      ctx.shadowBlur = s.blur;
      ctx.shadowOffsetY = s.off;
      ctx.fillStyle = fill;
      ctx.fillText(displayText, x, y, maxW);
    }
  }

  ctx.restore();
}

export async function composeBrandPhotoCard(params: {
  photoUrl: string;
  headline: string;
  cta: string;
  contentType: 'post' | 'story' | 'reel';
  styleIdx?: number;
  logoUrl?: string;
  logoPosition?: LogoPosition;
  textEffect?: TextEffectPreset;
  fontPreset?: DisplayFontPreset;
  accentColor?: string;
}): Promise<string> {
  const {
    photoUrl, headline, cta, contentType, styleIdx = 0,
    logoUrl = '', logoPosition = 'top_left',
    textEffect = 'extrude_3d', fontPreset = 'poster_3d', accentColor = '#ff2f8f',
  } = params;
  const isV = contentType === 'story' || contentType === 'reel';
  const style = CANVAS_STYLES[styleIdx % CANVAS_STYLES.length]!;

  await ensureDesignFonts();

  const proxyUrl = resolveBrowserImageSrc(photoUrl);
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`skip:${res.status}`);
  // Expired Instagram CDN URLs — proxy returns 1×1 transparent GIF with X-Proxy-Status: expired
  if (res.headers.get('X-Proxy-Status') === 'expired') throw new Error('skip:expired');
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);

  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      // Reject tiny placeholder images (expired CDN returns 1×1 gif)
      if (img.width <= 4 || img.height <= 4) { reject(new Error('skip:placeholder')); return; }

      const W = 1080, H = isV ? 1920 : 1080;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d')!;
      const displayFont = resolveDisplayFont(fontPreset);
      const bodyFont = resolveDisplayFont('clean_sans');

      // ── 1. Photo — full cover, photo is the hero ─────────────────────────
      const ir = img.width / img.height, cr = W / H;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (ir > cr) { sw = img.height * cr; sx = (img.width - sw) / 2; }
      else          { sh = img.width  / cr; sy = (img.height - sh) / 2; }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);

      // ── 2. Soft fade only — never a solid block ───────────────────────────
      if (style.scrimCoverage > 0) {
        const cov = style.scrimCoverage;
        const peak = style.scrimMaxAlpha;
        const isTop = style.textZone === 'top';
        const g = isTop
          ? ctx.createLinearGradient(0, 0, 0, H * cov)
          : ctx.createLinearGradient(0, H * (1 - cov), 0, H);

        if (isTop) {
          g.addColorStop(0,   `rgba(0,0,0,${peak})`);
          g.addColorStop(0.5, `rgba(0,0,0,${(peak * 0.5).toFixed(2)})`);
          g.addColorStop(1,   'rgba(0,0,0,0)');
        } else {
          g.addColorStop(0,   'rgba(0,0,0,0)');
          g.addColorStop(0.4, `rgba(0,0,0,${(peak * 0.35).toFixed(2)})`);
          g.addColorStop(1,   `rgba(0,0,0,${peak})`);
        }
        ctx.fillStyle = g;
        ctx.fillRect(0, isTop ? 0 : H * (1 - cov), W, H * cov);
      }

      // ── 3. Text wrap ─────────────────────────────────────────────────────
      function wrapText(text: string, size: number, weight: string, maxW: number, maxLines: number): string[] {
        ctx.font = `${weight} ${size}px ${displayFont.family}`;
        const words = text.trim().split(/\s+/);
        const lines: string[] = [];
        let line = '';
        for (const word of words) {
          const test = line ? `${line} ${word}` : word;
          if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
          else line = test;
        }
        if (line) lines.push(line);
        return lines.slice(0, maxLines);
      }

      // ── 4. Sizes ──────────────────────────────────────────────────────────
      const PAD     = isV ? 80 : 64;
      const BASE_HL = isV ? 82  : 68;
      const HL_SIZE = Math.round(BASE_HL * style.hlScale);
      const maxTW   = W - PAD * 2;
      const TEXT_X  = style.textAlign === 'center' ? W / 2 : PAD;

      ctx.textBaseline = 'alphabetic';
      ctx.textAlign    = style.textAlign;

      // ── 5. Baseline Y ─────────────────────────────────────────────────────
      let curY = style.textZone === 'top'
        ? H * 0.10 + (isV ? 180 : 130)
        : style.textZone === 'center'
          ? H * 0.5 + (isV ? 40 : 28)
          : H - (isV ? 100 : 80);

      // ── 6. CTA — only on Pure Type style, simple text arrow ──────────────
      if (style.showCta && cta.trim()) {
        const ctaText = cta.trim().slice(0, 24) + ' →';
        const CTA_SIZE = Math.round(HL_SIZE * 0.42);
        ctx.font = `400 ${CTA_SIZE}px ${bodyFont.family}`;
        // Letter-spacing via char-by-char for wider feel
        ctx.fillStyle = 'rgba(255,255,255,0.62)';
        ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8;
        const ctaY = style.textZone === 'bottom' ? curY : curY + HL_SIZE * 2.4;
        ctx.fillText(ctaText, TEXT_X, ctaY);
        ctx.shadowBlur = 0;
        if (style.textZone === 'bottom') curY = ctaY - CTA_SIZE - (isV ? 18 : 14);
      }

      // ── 7. Headline — clean, multi-shadow for legibility without overlay ──
      const effect = normalizeTextEffectPreset(textEffect);
      const hlLines = wrapText(headline, HL_SIZE, displayFont.weight, maxTW, isV ? 3 : 2);
      const drawHlLine = (line: string, y: number) => drawDisplayText(ctx, line, TEXT_X, y, maxTW, {
        size: HL_SIZE,
        family: displayFont.family,
        weight: displayFont.weight,
        align: style.textAlign as CanvasTextAlign,
        fill: '#ffffff',
        accent: accentColor,
        effect,
        tracking: style.tracking,
      });

      if (style.textZone === 'top') {
        for (const line of hlLines) {
          drawHlLine(line, curY + HL_SIZE * 0.82);
          curY += HL_SIZE * displayFont.lineHeight;
        }
      } else {
        for (let i = hlLines.length - 1; i >= 0; i--) {
          curY -= HL_SIZE * displayFont.lineHeight;
          drawHlLine(hlLines[i]!, curY + HL_SIZE * 0.82);
        }
      }

      drawLogoOnCanvas(ctx, logoUrl, W, H, logoPosition, isV)
        .finally(() => resolve(canvas.toDataURL('image/jpeg', 0.95)));
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('skip:load')); };
    img.src = objectUrl;
  }) as Promise<string>;
}

// ── Agency Canvas compositor — applies agent design spec to brand photo ───────
//
// Unlike composeBrandPhotoCard (which uses fixed black scrims), this function
// honours the design spec produced by visual_design_cards agent:
//   overlayColor  — custom scrim colour (e.g. 'rgba(18,12,8,0.68)')
//   overlayOpacity — additional opacity multiplier
//   bgIntent      — layout variant: venue_full_bleed | venue_split_left | color_primary_with_logo
//   textColor     — headline/subline colour (not always white)
//   ctaColor      — CTA pill background colour
//   typoStyle     — bold_display | elegant_serif | clean_sans | condensed_impact
//   ctaStyle      — pill | underline | none
//
// Returns a canvas.toDataURL('image/jpeg', 0.95) — NO GPT/AI call made here.

export async function composeAgencyDesignCard(params: {
  photoUrl:       string;
  headline:       string;
  subline:        string;
  cta:            string;
  contentType:    'post' | 'story' | 'reel';
  overlayColor:   string;
  overlayOpacity: number;
  bgIntent:       string;
  textColor:      string;
  ctaColor:       string;
  typoStyle:      string;
  ctaStyle:       string;
  logoUrl?:       string;
  logoPosition?:  LogoPosition;
  textEffect?:    TextEffectPreset;
  fontPreset?:    DisplayFontPreset;
}): Promise<string> {
  const {
    photoUrl, headline, subline, cta, contentType,
    overlayColor, overlayOpacity, bgIntent,
    textColor, ctaColor, typoStyle, ctaStyle,
    logoUrl = '', logoPosition = 'top_left',
    textEffect = 'extrude_3d', fontPreset,
  } = params;

  const isV = contentType === 'story' || contentType === 'reel';
  const W = 1080, H = isV ? 1920 : 1080;

  await ensureDesignFonts();

  // ── Typography: web fonts first, system fallbacks second ───────────────────
  const resolvedPreset = fontPreset ?? normalizeDisplayFontPreset(typoStyle);
  const displayFont = resolveDisplayFont(resolvedPreset);
  const bodyFont = resolveDisplayFont('clean_sans');
  const FONT_FAMILY = displayFont.family;
  const HL_WEIGHT = displayFont.weight;
  const SUB_WEIGHT = resolvedPreset === 'clean_sans' ? '400' : '400';

  // ── Fetch image via server-side media proxy (avoids CORS taint) ────────────
  const proxyUrl = resolveBrowserImageSrc(photoUrl);
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`skip:${res.status}`);
  if (res.headers.get('X-Proxy-Status') === 'expired') throw new Error('skip:expired');
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);

  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (img.width <= 4 || img.height <= 4) { reject(new Error('skip:placeholder')); return; }

      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d')!;

      // ── 1. Draw photo: always cover the canvas ──────────────────────────────
      const ir = img.width / img.height, cr = W / H;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (ir > cr) { sw = img.height * cr; sx = (img.width - sw) / 2; }
      else          { sh = img.width  / cr; sy = (img.height - sh) / 2; }

      if (bgIntent === 'venue_split_left') {
        // Left half: photo; right half: solid overlay panel
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W / 2, H);
        // Duplicate right side for right panel base (dimmed)
        ctx.drawImage(img, sx, sy, sw, sh, W / 2, 0, W / 2, H);
        ctx.globalAlpha = 0.25;
        ctx.drawImage(img, sx, sy, sw, sh, W / 2, 0, W / 2, H);
        ctx.globalAlpha = 1;
      } else if (bgIntent === 'color_primary_with_logo') {
        // Solid background derived from overlayColor
        ctx.fillStyle = overlayColor;
        ctx.fillRect(0, 0, W, H);
        // Brand photo as small inset (top right corner)
        const insetW = Math.round(W * 0.42), insetH = Math.round(insetW * (img.height / img.width));
        const insetX = W - insetW - (isV ? 80 : 60), insetY = isV ? 120 : 90;
        ctx.save();
        ctx.beginPath();
        const r = 28;
        ctx.moveTo(insetX + r, insetY); ctx.lineTo(insetX + insetW - r, insetY);
        ctx.quadraticCurveTo(insetX + insetW, insetY, insetX + insetW, insetY + r);
        ctx.lineTo(insetX + insetW, insetY + insetH - r);
        ctx.quadraticCurveTo(insetX + insetW, insetY + insetH, insetX + insetW - r, insetY + insetH);
        ctx.lineTo(insetX + r, insetY + insetH);
        ctx.quadraticCurveTo(insetX, insetY + insetH, insetX, insetY + insetH - r);
        ctx.lineTo(insetX, insetY + r);
        ctx.quadraticCurveTo(insetX, insetY, insetX + r, insetY);
        ctx.closePath(); ctx.clip();
        // Center-crop for inset
        const isr = img.width / img.height, icr = insetW / insetH;
        let isx = 0, isy = 0, isw = img.width, ish = img.height;
        if (isr > icr) { isw = img.height * icr; isx = (img.width - isw) / 2; }
        else            { ish = img.width  / icr; isy = (img.height - ish) / 2; }
        ctx.drawImage(img, isx, isy, isw, ish, insetX, insetY, insetW, insetH);
        ctx.restore();
      } else {
        // venue_full_bleed (default): full photo behind everything
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
      }

      // ── 2. Minimal soft fade — never a solid block ─────────────────────────
      // Cap at 30% coverage, 0.42 peak opacity regardless of agent spec.
      // Photo must breathe — the scrim is just enough for text legibility.
      const finalOpacity = Math.min(0.42, Math.max(0, overlayOpacity));
      const scrimH = isV ? H * 0.30 : H * 0.28;
      const g = ctx.createLinearGradient(0, H - scrimH, 0, H);
      g.addColorStop(0,   overlayColor.replace(/[\d.]+\)$/, '0)'));
      g.addColorStop(0.45, overlayColor.replace(/[\d.]+\)$/, `${(finalOpacity * 0.45).toFixed(2)})`));
      g.addColorStop(1,   overlayColor.replace(/[\d.]+\)$/, `${finalOpacity.toFixed(2)})`));
      ctx.fillStyle = g;
      ctx.fillRect(0, H - scrimH, W, scrimH);

      // ── 3. Text helper ──────────────────────────────────────────────────────
      function wrapText(text: string, size: number, weight: string, font: string, maxW: number, maxLines: number): string[] {
        ctx.font = `${weight} ${size}px ${font}`;
        const words = text.trim().split(/\s+/);
        const lines: string[] = [];
        let line = '';
        for (const word of words) {
          const test = line ? `${line} ${word}` : word;
          if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
          else line = test;
        }
        if (line) lines.push(line);
        return lines.slice(0, maxLines);
      }

      // ── 4. Layout parameters ────────────────────────────────────────────────
      const PAD      = isV ? 80 : 66;
      const BASE_HL  = isV ? 92  : 76;
      const BASE_SUB = isV ? 44  : 36;
      const BASE_CTA = isV ? 38  : 32;
      const LINE_H   = typoStyle === 'condensed_impact' ? 1.08 : 1.22;

      // For split_left, text goes in right half
      const textX    = bgIntent === 'venue_split_left' ? W / 2 + PAD : PAD;
      const maxTW    = bgIntent === 'venue_split_left' ? W / 2 - PAD * 2 : W - PAD * 2;

      ctx.textBaseline = 'alphabetic';
      ctx.textAlign    = 'left';

      // Bottom text zone baseline — keep text in lower 28% max
      let curY = H - (isV ? 100 : 78);

      // ── 5. CTA — simple text arrow, no pill/button ──────────────────────────
      if (cta.trim() && ctaStyle !== 'none') {
        const ctaText = cta.trim().slice(0, 24) + '  →';
        const CTA_SIZE = Math.round(BASE_CTA * 0.72);
        ctx.font = `400 ${CTA_SIZE}px ${FONT_FAMILY}`;
        ctx.fillStyle = textColor.startsWith('#')
          ? textColor + 'aa' : textColor.replace(/[\d.]+\)$/, '0.65)');
        ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10;
        ctx.fillText(ctaText, textX, curY);
        ctx.shadowBlur = 0;
        curY -= CTA_SIZE + (isV ? 14 : 10);
      }

      // ── 6. Subline — lighter weight, smaller ────────────────────────────────
      if (subline.trim()) {
        const SUB_SIZE = Math.round(BASE_SUB * 0.82);
        const subLines = wrapText(subline, SUB_SIZE, SUB_WEIGHT, FONT_FAMILY, maxTW, 1);
        for (let i = subLines.length - 1; i >= 0; i--) {
          curY -= SUB_SIZE * LINE_H;
          ctx.font = `${SUB_WEIGHT} ${SUB_SIZE}px ${FONT_FAMILY}`;
          ctx.fillStyle = textColor.startsWith('#')
            ? textColor + 'cc' : textColor.replace(/[\d.]+\)$/, '0.75)');
          ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 12;
          ctx.fillText(subLines[i]!, textX, curY + SUB_SIZE * 0.82, maxTW);
          ctx.shadowBlur = 0;
        }
        curY -= isV ? 10 : 8;
      }

      // ── 7. Headline — clean, text-shadow only for legibility ────────────────
      const HL_USED = Math.round(BASE_HL * 0.88);
      const hlLines = wrapText(headline, HL_USED, HL_WEIGHT, FONT_FAMILY, maxTW, isV ? 3 : 2);
      ctx.font = `${HL_WEIGHT} ${HL_USED}px ${FONT_FAMILY}`;

      const effect = normalizeTextEffectPreset(textEffect);
      for (let i = hlLines.length - 1; i >= 0; i--) {
        curY -= HL_USED * Math.min(LINE_H, displayFont.lineHeight);
        drawDisplayText(ctx, hlLines[i]!, textX, curY + HL_USED * 0.82, maxTW, {
          size: HL_USED,
          family: FONT_FAMILY,
          weight: HL_WEIGHT,
          align: 'left',
          fill: textColor,
          accent: ctaColor || textColor,
          effect,
          tracking: resolvedPreset === 'poster_3d' || resolvedPreset === 'sticker_pop' ? 0 : 1,
        });
      }

      // ── Logo — drawn last so it sits on top of everything ──────────────────
      drawLogoOnCanvas(ctx, logoUrl, W, H, logoPosition, isV)
        .finally(() => resolve(canvas.toDataURL('image/jpeg', 0.95)));
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('skip:load')); };
    img.src = objectUrl;
  }) as Promise<string>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map normalized ArtifactIdea → raw record IdeaCard expects */
function artifactIdeaToRecord(idea: ArtifactIdea, raw?: Record<string, unknown>): Record<string, unknown> {
  const vps = idea.visualProductionSpec;
  const headline = idea.headline ?? idea.title ?? '';
  const caption = idea.caption ?? '';

  // Sprint 3 (ICS): preserve design-layer copy + intent that the agent produced.
  // Previously canvaFieldCopy / asset_intent / event_date were dropped here, so the
  // Canva autofill and announcement renderers had to re-synthesise everything.
  const canvaFieldCopy = idea.canvaFieldCopy
    ?? (raw?.canva_field_copy as Record<string, string> | undefined)
    ?? (raw?.canvaFieldCopy as Record<string, string> | undefined);
  const assetIntent = idea.assetIntent
    ?? (raw ? getIdeaField(raw, 'asset_intent', 'assetIntent', 'asset_recommendation') : '');
  const eventDate = idea.eventDate
    ?? (raw ? getIdeaField(raw, 'event_date', 'eventDate', 'date_suggestion') : '');
  const location = idea.location
    ?? (raw ? getIdeaField(raw, 'location') : '');

  return {
    headline,
    concept_title: idea.title ?? headline,
    idea_title: idea.title ?? headline,
    title: idea.title ?? headline,
    caption_draft: caption,
    caption,
    caption_draft_alt: idea.captionAlt
      ?? (raw ? getIdeaField(raw, 'caption_draft_alt', 'caption_alt', 'captionDraftAlt') : ''),
    cta: idea.cta ?? '',
    hashtags: idea.hashtags ?? [],
    content_type: idea.contentType ?? 'post',
    content_kind: idea.contentKind ?? idea.contentType ?? 'post',
    strategic_purpose: idea.purpose ?? '',
    visual_direction: idea.visualDirection ?? '',
    posting_time_suggestion: idea.postingTime ?? '',
    template_use_case: idea.templateUseCase ?? '',
    asset_intent: assetIntent || undefined,
    event_date: eventDate || undefined,
    location: location || undefined,
    // Emit under both casings so extractMissionIdeaFields and Canva autofill see it.
    ...(canvaFieldCopy ? { canva_field_copy: canvaFieldCopy, canvaFieldCopy } : {}),
    visual_production_spec: vps ? {
      treatment: vps.treatment,
      selected_gallery_url: vps.selectedGalleryUrl,
      image_edit_prompt: vps.imageEditPrompt,
      text_layers: vps.textLayers,
    } : (raw?.visual_production_spec ?? raw?.visualProductionSpec),
    engagement_prediction: idea.engagement ? { primary: idea.engagement } : raw?.engagement_prediction,
    selected_gallery_url: vps?.selectedGalleryUrl,
    mood: raw ? getIdeaField(raw, 'mood') : undefined,
  };
}

function parseIdeasLegacyArrays(output_summary: string): Record<string, unknown>[] {
  return extractObjectArrayFromSummary(output_summary).filter(isContentIdea);
}

function parseIdeas(output_summary: string | null): Record<string, unknown>[] {
  if (!output_summary?.trim()) return [];

  // Primary: same parser as Mission Hub cards (signalFromArtifact)
  try {
    const signal = signalFromArtifact({
      content: output_summary,
      artifactType: 'instagram_caption',
      title: 'Content ideation',
    });
    const fromSignal = (signal.ideas ?? []).filter(
      i => Boolean(i.caption?.trim() || i.headline?.trim() || i.title?.trim()),
    );
    if (fromSignal.length > 0) {
      const legacy = parseIdeasLegacyArrays(output_summary);
      return fromSignal.map((idea, idx) => artifactIdeaToRecord(idea, legacy[idx]));
    }
  } catch { /* fallback to legacy array extraction */ }

  return parseIdeasLegacyArrays(output_summary);
}

/** Filter out tool call objects and other non-content items */
function isContentIdea(item: unknown): item is Record<string, unknown> {
  if (typeof item !== 'object' || !item || Array.isArray(item)) return false;
  const obj = item as Record<string, unknown>;
  if ('recipient_name' in obj || 'tool_use_id' in obj || 'type' in obj && obj.type === 'tool_use') return false;
  // Require meaningful text — content_type alone is not enough (was causing empty "15 fikir" cards)
  return Boolean(
    getIdeaField(obj, 'headline', 'concept_title', 'idea_title', 'title', 'hook', 'theme')
    || getIdeaField(obj, 'caption_draft', 'caption', 'captionDraft', 'brief', 'body', 'description')
    || obj.day !== undefined,
  );
}

function getIdeaField(idea: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = idea[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

const FORMAT_COLOR: Record<string, string> = {
  post:     '#9DBECE',
  story:    '#F472B6',
  reel:     '#F59E0B',
  carousel: '#60A5FA',
};

// ── Single content idea card ──────────────────────────────────────────────────

function IdeaCard({
  idea,
  index,
  total,
  missionBrief,
  brandName,
  location,
  referenceImageUrls,
  prefetchedAgencyDesigns,
  onSaved,
}: {
  idea: Record<string, unknown>;
  index: number;
  total: number;
  missionBrief?: string;
  brandName?: string;
  location?: string;
  referenceImageUrls?: string[];
  prefetchedAgencyDesigns?: Record<string, unknown>[];
  onSaved: () => void;
}) {
  const { t } = useTheme();
  const { navigate } = useMobileStore();
  const missionIdFromStore = useMobileStore(
    (s) => (s as { missionContentMissionId?: string | null }).missionContentMissionId ?? null,
  );
  const queryClient = useQueryClient();

  const headlineBase = getIdeaField(idea, 'headline', 'concept_title', 'idea_title', 'title', 'hook', 'theme', 'subject');
  const captionBase  = getIdeaField(idea, 'caption_draft', 'caption', 'captionDraft', 'brief', 'body', 'description', 'copy', 'text', 'script');
  const [captionOverride, setCaptionOverride] = useState<string | null>(null);
  const [headlineOverride, setHeadlineOverride] = useState<string | null>(null);
  const [hashtagsOverride, setHashtagsOverride] = useState<string[] | null>(null);
  const headline = headlineOverride ?? headlineBase;
  const caption  = captionOverride ?? captionBase;
  const cta       = getIdeaField(idea, 'cta', 'call_to_action');
  // Normalise hashtags: backend returns 10-15 — keep all (cap at 15 like admin)
  const hashtags  = hashtagsOverride ?? (() => {
    const raw = idea.hashtags;
    if (Array.isArray(raw)) return (raw as string[]).map(h => h.startsWith('#') ? h : `#${h}`).slice(0, 15);
    if (typeof raw === 'string') return raw.split(/[\s,]+/).filter(h => h.length > 1).map(h => h.startsWith('#') ? h : `#${h}`).slice(0, 15);
    return [] as string[];
  })();
  const fmt       = getIdeaField(idea, 'content_type', 'content_kind') || 'post';
  const fmtClean  = fmt.replace('instagram_', '').replace(/_/g, ' ');

  // Format detection — handle all naming variants
  const fmtLower   = fmt.toLowerCase();
  const isPortrait = fmtLower.includes('story') || fmtLower.includes('reel');
  const isCarousel = fmtLower.includes('carousel');
  // Portrait: 9:16 centered column | Square: full width 1:1 | Carousel: full width 4:5
  const fmtColor  = FORMAT_COLOR[fmt.replace('instagram_', '')] ?? t.accent;
  const purpose   = getIdeaField(idea, 'strategic_purpose', 'hook');
  const visualDir = getIdeaField(idea, 'visual_direction', 'visual_production_spec');
  const imagePrompt = (() => {
    const spec = idea.visual_production_spec as any;
    if (spec && typeof spec === 'object') return spec.image_edit_prompt || spec.treatment || '';
    return getIdeaField(idea, 'image_edit_prompt', 'image_prompt');
  })();

  // visual_production_spec — agent-recommended gallery photo + edit prompt
  const vps = (idea as any)?.visual_production_spec as Record<string, unknown> | undefined;
  const agentGalleryUrlRaw: string | null = (() => {
    const url = vps?.selected_gallery_url as string | undefined;
    if (url && isUsableGalleryPhotoUrl(url)) return url;
    return null;
  })();
  const agentEditPrompt: string = (vps?.image_edit_prompt as string) || imagePrompt || visualDir || '';

  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [photoPickError, setPhotoPickError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [generateMode, setGenerateMode] = useState<'scratch' | 'brand'>('scratch');

  // ── "Tüm Formatları Üret" state ──────────────────────────────────────────
  const [allFormatsResult, setAllFormatsResult] = useState<{
    post?: string; story?: string; reel?: string; carousel?: string[];
  } | null>(null);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [allFormatsError, setAllFormatsError] = useState<string | null>(null);
  const [reelUrl, setReelUrl] = useState<string | null>(null);
  const [isGeneratingReel, setIsGeneratingReel] = useState(false);
  const [reelError, setReelError] = useState<string | null>(null);
  const [isGeneratingMultiReel, setIsGeneratingMultiReel] = useState(false);
  const [multiReelStrategy, setMultiReelStrategy] = useState<'multi_ref' | 'sequential'>('sequential');

  // ── Event Card (Canvas) ────────────────────────────────────────────────────
  const [showEventModal, setShowEventModal] = useState(false);
  const [isGeneratingEventCard, setIsGeneratingEventCard] = useState(false);
  const [eventCardUrl, setEventCardUrl] = useState<string | null>(null);
  const [eventCardError, setEventCardError] = useState<string | null>(null);
  const [eventPreviewUrl, setEventPreviewUrl] = useState<string | null>(null);
  const [eventPreviewLoading, setEventPreviewLoading] = useState(false);
  const [eventPreviewError, setEventPreviewError] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState({
    artistName: '', eventName: '', date: '', time: '', venueArea: '', tagline: '',
    contentType: 'story' as 'story' | 'post',
    templateId: 'luxury_bottom' as AnnouncementTemplateId,
    enhancePhoto: false,
    resolvedUseCase: 'event' as AnnouncementUseCase,
  });
  const [canvasStyleIdx, setCanvasStyleIdx] = useState(0);
  const [isFavourited, setIsFavourited] = useState(false);

  const [savedTemplates, setSavedTemplates] = useState<DesignTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [lastUsedTemplate, setLastUsedTemplate] = useState<Omit<DesignTemplate, 'id' | 'thumbnail' | 'savedAt'> | null>(null);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [activeCanvasTemplateStyle, setActiveCanvasTemplateStyle] = useState<Pick<DesignTemplate, 'textEffect' | 'fontPreset' | 'accentColor' | 'logoPosition'> | null>(null);
  const migratedTemplateTenants = useRef<Set<string>>(new Set());

  // ── Unused Gallery Caption Generation ────────────────────────────────────
  const [unusedCaptionSuggestions, setUnusedCaptionSuggestions] = useState<{
    photoUrl: string; caption: string; headline: string; hashtags: string[];
    contentType: 'post' | 'story' | 'reel'; mood: string;
  }[]>([]);
  const [isGeneratingUnusedCaptions, setIsGeneratingUnusedCaptions] = useState(false);
  const [showUnusedSection, setShowUnusedSection] = useState(false);

  // ── Carousel / Story Series ───────────────────────────────────────────────
  const [seriesSlides, setSeriesSlides] = useState<string[]>([]);   // generated image URLs
  const [activeSlide, setActiveSlide] = useState(0);
  const [isGeneratingSeries, setIsGeneratingSeries] = useState(false);
  const [seriesMode, setSeriesMode] = useState(false);  // true = showing carousel view

  // Brand context for design card generation (reference images + visual DNA)
  const { tenantId } = useWorkspaceStore();
  const { data: remotePostTemplates, isSuccess: remotePostTemplatesLoaded } = useQuery<SavedPostTemplateRecord[]>({
    queryKey: ['brandPostTemplates', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const res = await fetch(`/api/brand-context/${tenantId}/post-templates`, {
        headers: { 'X-Tenant-Id': tenantId },
      });
      if (!res.ok) throw new Error('Post template library could not be loaded');
      return await res.json() as SavedPostTemplateRecord[];
    },
    enabled: Boolean(tenantId),
    staleTime: 60_000,
  });
  const { data: productionSnapshot } = useQuery<ProductionBrandContextSnapshot | null>({
    queryKey: ['production-context-snapshot', tenantId],
    queryFn: () => apiClient.getProductionBrandContextSnapshot(tenantId),
    staleTime: 10 * 60_000,
    enabled: Boolean(tenantId),
  });

  const { data: brandTheme } = useQuery<BrandTheme | null>({
    queryKey: ['brandTheme', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      try {
        const res = await fetch(`/api/brand-context/${tenantId}/theme`, {
          headers: { 'X-Tenant-Id': tenantId },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return (data.theme ?? null) as BrandTheme | null;
      } catch { return null; }
    },
    staleTime: 5 * 60_000,
    enabled: Boolean(tenantId),
  });

  const aiVisualStandard = useMemo(
    () => resolveAiVisualProductionStandard(brandTheme as Record<string, unknown> | undefined),
    [brandTheme],
  );
  const postDesignDefaults = useMemo(
    () => resolvePostDesignDefaults(brandTheme),
    [brandTheme],
  );
  const defaultPostTemplate = useMemo(() => {
    if (!postDesignDefaults.defaultTemplateId) return null;
    const record = (remotePostTemplates ?? []).find((tmpl) => tmpl.id === postDesignDefaults.defaultTemplateId);
    return record ? postTemplateRecordToDesignTemplate(record) : null;
  }, [postDesignDefaults.defaultTemplateId, remotePostTemplates]);
  const brandCtx = useMemo(
    () => productionSnapshotToLegacyBrandContext(productionSnapshot),
    [productionSnapshot],
  );
  const pyCtx = brandCtx;
  const sector = String(pyCtx?.industry ?? pyCtx?.business_type ?? '');
  const brandCtxForVisual = useMemo((): BrandContextForVisual => ({
    business_name: brandName ?? String(pyCtx?.business_name ?? ''),
    business_type: sector,
    description: String(pyCtx?.description ?? ''),
    brand_tone: String(pyCtx?.brand_tone ?? ''),
    visual_style: String(pyCtx?.visual_style ?? ''),
    target_audience: String(pyCtx?.target_audience ?? ''),
    location: location ?? String(pyCtx?.location ?? ''),
    website_summary: String(pyCtx?.website_summary ?? ''),
    instagram_bio: String(pyCtx?.instagram_bio ?? ''),
    brand_dna: pyCtx?.brand_dna as string | Record<string, unknown> | undefined,
    visual_dna: String(pyCtx?.visual_dna ?? ''),
    logo_url: String(pyCtx?.logo_url ?? ''),
    brand_vibe_profile: pyCtx?.brand_vibe_profile as Record<string, unknown> | undefined,
    website_intelligence: pyCtx?.website_intelligence as Record<string, unknown> | string | null,
    content_pillars: Array.isArray(pyCtx?.content_pillars) ? (pyCtx.content_pillars as string[]) : undefined,
    default_ctas: Array.isArray(pyCtx?.default_ctas) ? (pyCtx.default_ctas as string[]) : undefined,
    custom_rules: String(pyCtx?.custom_rules ?? ''),
  }), [brandName, pyCtx, sector, location]);

  // Load saved templates from the persistent library, with localStorage as cache/fallback.
  useEffect(() => {
    if (!tenantId) {
      setSavedTemplates([]);
      return;
    }
    if (remotePostTemplatesLoaded) {
      setSavedTemplates((remotePostTemplates ?? []).map(postTemplateRecordToDesignTemplate));
      return;
    }
    setSavedTemplates(loadSavedTemplates(tenantId));
  }, [remotePostTemplates, remotePostTemplatesLoaded, tenantId]);

  useEffect(() => {
    if (!tenantId || !remotePostTemplatesLoaded || migratedTemplateTenants.current.has(tenantId)) return;
    migratedTemplateTenants.current.add(tenantId);
    const localTemplates = loadSavedTemplates(tenantId);
    if (!localTemplates.length) return;

    const existingKeys = new Set(
      (remotePostTemplates ?? []).map((record) => {
        const spec = record.layout_spec ?? {};
        return `${record.name}|${spec.source ?? record.template_kind}|${spec.canvasStyleIdx ?? ''}`;
      }),
    );
    const toMigrate = localTemplates.filter((tmpl) => (
      !existingKeys.has(`${tmpl.name}|${tmpl.source}|${tmpl.canvasStyleIdx ?? ''}`)
    ));
    if (!toMigrate.length) return;

    Promise.all(toMigrate.slice(0, 20).map((tmpl) => createRemotePostTemplate(tenantId, tmpl)))
      .then(() => queryClient.invalidateQueries({ queryKey: ['brandPostTemplates', tenantId] }))
      .catch(() => {});
  }, [queryClient, remotePostTemplates, remotePostTemplatesLoaded, tenantId]);

  useEffect(() => {
    if (!defaultPostTemplate) return;
    if (defaultPostTemplate.source === 'canvas' && defaultPostTemplate.canvasStyleIdx !== undefined) {
      setCanvasStyleIdx(defaultPostTemplate.canvasStyleIdx);
      setActiveCanvasTemplateStyle({
        textEffect: defaultPostTemplate.textEffect ?? postDesignDefaults.textEffect,
        fontPreset: defaultPostTemplate.fontPreset ?? postDesignDefaults.fontPreset,
        accentColor: defaultPostTemplate.accentColor ?? postDesignDefaults.accentColor ?? brandCtx?.brand_accent_color ?? '#ff2f8f',
        logoPosition: defaultPostTemplate.logoPosition ?? postDesignDefaults.logoPosition,
      });
    } else if (defaultPostTemplate.source === 'agency' && defaultPostTemplate.agencyDesignSpec) {
      setAgencyDesigns([defaultPostTemplate.agencyDesignSpec]);
      setAgencyDesignIdx(0);
      setActiveCanvasTemplateStyle(null);
    }
  }, [
    defaultPostTemplate?.id,
    postDesignDefaults.textEffect,
    postDesignDefaults.fontPreset,
    postDesignDefaults.logoPosition,
    postDesignDefaults.accentColor,
    brandCtx?.brand_accent_color,
  ]);

  const [savedPrefs, setSavedPrefs] = useState(DEFAULT_ANNOUNCEMENT_PREFERENCES);

  useEffect(() => {
    if (!tenantId) return;
    fetch(`/api/brand-context/${tenantId}/announcement-templates`, {
      headers: { 'X-Tenant-Id': tenantId },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const parsed = parseAnnouncementPreferences(data?.preferences);
        setSavedPrefs(parsed);
        const eventTpl = parsed.event;
        if (eventTpl) setEventForm((f) => ({ ...f, templateId: eventTpl }));
      })
      .catch(() => {
        setEventForm((f) => ({ ...f, templateId: DEFAULT_ANNOUNCEMENT_PREFERENCES.event }));
      });
  }, [tenantId]);

  // Already-used images — artifacts saved to Outputs (pending_review or approved)
  const { data: existingArtifacts = [] } = useMobileArtifacts({
    subscribeOnly: true,
  });
  // Gallery usage per post type — same gallery URL must not repeat within a type
  const galleryUsage = buildGalleryUsageFromArtifacts(
    existingArtifacts as unknown as Record<string, unknown>[],
  );

  // Check if this idea was already auto-produced to Feed
  const autoProducedArtifact = (() => {
    for (const a of existingArtifacts as any[]) {
      const meta = a.metadata ?? {};
      if (meta.auto_produced && meta.headline === headline) return a;
    }
    return null;
  })();

  // Gallery analysis — React Query cache, available synchronously in mutations
  // Enrich gallery metadata: derive contentTags/bestFor/usageContext from descriptions
  // when the stored analysis only has description + mood (missing structured tags).
  const galleryAnalysis = enrichGalleryAnalysis((productionSnapshot?.galleryAnalysis ?? {}) as Record<string, GalleryPhotoMeta>);

  // Parse brand reference images — exclude non-product assets (maps, logos, footers, menus)
  const EXCLUDE_PATTERNS = [
    'logo', 'harita', '-map', 'map-', '_map', 'footer', 'menu.',
    'fran', 'franchise', 'bayilik', 'anasayfa', 'banner', 'icon',
    '-150x', '-300x', '-100x',  // WordPress thumbnail suffixes
  ];
  const brandRefImages = (() => {
    const raw = brandCtx?.reference_image_urls ?? referenceImageUrls ?? [];
    let urls: string[];
    if (Array.isArray(raw)) {
      urls = raw as string[];
    } else if (typeof raw === 'string') {
      try { urls = JSON.parse(raw); } catch { urls = []; }
    } else {
      urls = [];
    }
    return urls
      .filter((u: unknown): u is string => {
        if (typeof u !== 'string' || !isUsableGalleryPhotoUrl(u)) return false;
        const lower = u.toLowerCase();
        return !EXCLUDE_PATTERNS.some(p => lower.includes(p));
      })
      .map(upscaleCdnUrl)
      .slice(0, 60) as string[];
  })();

  // Reverse lookup: upscaled URL → galleryAnalysis entry.
  // galleryAnalysis keys are ORIGINAL URLs; brandRefImages are upscaled.
  // We build a map from base URL (no query string) → analysis entry
  // so that matching works regardless of CDN transforms.
  const galleryBaseMap = new Map<string, { url: string; analysis: Record<string, unknown> }>();
  for (const [origUrl, analysis] of Object.entries(galleryAnalysis)) {
    const base = origUrl.split('?')[0] ?? origUrl;
    galleryBaseMap.set(base, { url: origUrl, analysis: analysis as Record<string, unknown> });
  }
  function findAnalysis(displayUrl: string): Record<string, unknown> | undefined {
    const direct = galleryAnalysis[displayUrl] as Record<string, unknown> | undefined;
    if (direct) return direct;
    const base = displayUrl.split('?')[0] ?? displayUrl;
    // Try exact base match
    const entry = galleryBaseMap.get(base);
    if (entry) return entry.analysis;
    // Try partial base match (CDN transforms may add path segments)
    for (const [key, val] of galleryBaseMap) {
      if (base.includes(key) || key.includes(base)) return val.analysis;
    }
    return undefined;
  }

  const contentTypeFmt = fmt.includes('story') ? 'story' : fmt.includes('reel') ? 'reel' : 'post';
  const blocksCanvasOverlay = useMemo(() => {
    if (!tenantId) return false;
    const ideaRecord = idea as Record<string, unknown>;
    const assignment = inferProductionAssignment(
      index,
      ideaRecord,
      missionIdFromStore ?? '',
      0,
      0,
      0,
      sector,
    );
    return isGalleryOnlyVisualPolicy(assignment, ideaRecord);
  }, [idea, index, missionIdFromStore, sector]);
  const postTypeBucket = contentTypeToPostType(contentTypeFmt);
  const usedForThisType = getExcludeUrlsForPostType(galleryUsage, postTypeBucket);
  const isUrlUsedForCurrentType = (url: string) =>
    isGalleryUrlUsedForPostType(galleryUsage, url, postTypeBucket);

  // Validate agent-recommended URL — semantic score + pool + usage rules
  const photoMatchInput: MatchPhotoInput = {
    caption,
    headline,
    mood: getIdeaField(idea, 'mood', 'tone', 'vibe'),
    contentType: contentTypeFmt,
    visualDirection: visualDir,
    templateUseCase: getIdeaField(idea, 'template_use_case'),
    strategicPurpose: purpose,
  };
  const eligiblePhotoPool = (() => {
    const fresh = brandRefImages.filter(u => {
      const lower = u.toLowerCase();
      if (lower.endsWith('.png') || lower.includes('logo') || lower.includes('icon')) return false;
      if (isUrlUsedForCurrentType(u)) return false;
      return true;
    });
    const basePool = brandRefImages.filter(u =>
      !u.toLowerCase().includes('logo') && !u.toLowerCase().includes('icon'),
    );
    return fresh.length > 0 ? fresh : basePool;
  })();
  const agentGalleryUrl: string | null = (() => {
    if (!eligiblePhotoPool.length) return null;
    const meta = galleryAnalysis as Record<string, GalleryPhotoMeta>;
    const resolved = resolveBestGalleryUrl(
      photoMatchInput,
      eligiblePhotoPool,
      meta,
      agentGalleryUrlRaw,
      { displayUrls: brandRefImages },
    );
    return resolved?.url ?? null;
  })();

  // Track which photos have been shown for this idea — so manual "Seç" rotates through all
  const [shownPhotoUrls, setShownPhotoUrls] = useState<Set<string>>(new Set());
  useEffect(() => {
    setShownPhotoUrls(new Set());
  }, [index]);

  // Auto-display agent's gallery pick when no image is generated yet
  const autoPhotoPickedRef = useRef(false);
  useEffect(() => {
    autoPhotoPickedRef.current = false;
  }, [index]);

  useEffect(() => {
    if (autoPhotoPickedRef.current || generatedUrl) return;
    if (!eligiblePhotoPool.length || (!caption && !headline)) return;

    const meta = galleryAnalysis as Record<string, GalleryPhotoMeta>;
    const autoMatch = matchPhotoToContent(
      photoMatchInput,
      eligiblePhotoPool,
      meta,
      { displayUrls: brandRefImages, bestEffort: true },
    );
    const url = agentGalleryUrl ?? autoMatch?.url ?? null;
    if (url) {
      autoPhotoPickedRef.current = true;
      setGeneratedUrl(url);
      setGenerateMode('brand');
    }
  }, [index, caption, headline, agentGalleryUrl, eligiblePhotoPool.length, brandRefImages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Standard generation (scratch or with reference photos)
  const generateMutation = useMutation({
    mutationFn: () => apiClient.generateInstagramImage({
      title: headline || `${brandName || ''} içerik`,
      caption,
      concept: imagePrompt || visualDir || purpose,
      campaignContext: missionBrief,
      brandName,
      location,
      visualStyle: visualDir,
      contentType: contentTypeFmt,
      referenceImageUrls: referenceImageUrls?.slice(0, 3),
    }),
    onSuccess: (data) => { setGeneratedUrl(data.imageUrl); setGenerateMode('scratch'); },
  });

  // Track which photo was used last — rotate on retry
  const [lastPhotoIdx, setLastPhotoIdx] = useState(0);

  // ── "Ajans Tasarımı" — Design Director spec → deterministic Canvas render ──
  //
  // Flow:
  //   1. POST /api/design-director/{tenantId} — GPT-4o produces 3 design variants
  //      (IMPACT / EDITORIAL / MINIMAL), each with image_edit_prompt + canvas_spec
  //   2. Pick the next variant (rotating through 3)
  //   3. Render real venue photo + 3D headline + actual brand logo in Canvas
  //
  // The brand photo is NEVER replaced — Canvas composes design layers above it.
  const [agencyDesigns, setAgencyDesigns] = useState<Record<string, unknown>[]>(() => prefetchedAgencyDesigns ?? []);
  const [agencyDesignIdx, setAgencyDesignIdx] = useState(() => (prefetchedAgencyDesigns?.length ? index % prefetchedAgencyDesigns.length : 0));
  const [agencyDesignLabel, setAgencyDesignLabel] = useState('');
  const [directorLogoUrl, setDirectorLogoUrl] = useState('');

  useEffect(() => {
    if (!prefetchedAgencyDesigns?.length) return;
    setAgencyDesigns(prefetchedAgencyDesigns);
    setAgencyDesignIdx(index % prefetchedAgencyDesigns.length);
  }, [prefetchedAgencyDesigns, index]);

  const agencyDesignMutation = useMutation({
    mutationFn: async (): Promise<{ imageUrl: string }> => {
      if (!brandRefImages.length) throw new Error('Marka fotoğrafı bulunamadı.');

      let designs = agencyDesigns;

      // Call Design Director if no specs cached
      if (!designs.length) {
        const directorRes = await fetch(`/api/design-director/${tenantId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            headline:            headline.slice(0, 50),
            cta:                 cta.slice(0, 30),
            caption_context:     caption.slice(0, 300),
            format:              contentTypeFmt,
            content_type_label:  fmtClean,
            // Mission & idea context — makes design vibe-aware
            mission_brief:       missionBrief?.slice(0, 300) ?? '',
            strategic_purpose:   purpose?.slice(0, 200) ?? '',
            visual_direction:    visualDir?.slice(0, 300) ?? '',
            agent_image_prompt:  imagePrompt?.slice(0, 400) ?? '',
            content_pillar:      getIdeaField(idea, 'content_pillar', 'pillar', 'theme')?.slice(0, 80) ?? '',
            mood:                getIdeaField(idea, 'mood', 'tone', 'vibe')?.slice(0, 80) ?? '',
          }),
        });
        if (!directorRes.ok) {
          const err = await directorRes.json().catch(() => ({}));
          throw new Error(err?.detail || `Design Director başlatılamadı (${directorRes.status})`);
        }
        const directorData = await directorRes.json();
        const newDesigns = directorData.designs ?? [];
        if (!newDesigns.length) throw new Error('Design Director çıktı üretemedi.');
        designs = newDesigns;
        setAgencyDesigns(newDesigns);
        setAgencyDesignIdx(0);
        // Cache brand logo URL from Director response (comes from tenant.logo_url)
        if (directorData.logo_url) setDirectorLogoUrl(directorData.logo_url);
      }

      // Pick next design (rotate: impact → editorial → minimal → impact ...)
      const designIdx = agencyDesignIdx % designs.length;
      const design = designs[designIdx] as Record<string, unknown>;
      setAgencyDesignIdx(i => i + 1);

      const templateName = (design.template as string) || 'impact';
      const labels: Record<string, string> = { impact: '⚡ Impact', editorial: '📐 Editorial', minimal: '○ Minimal' };
      setAgencyDesignLabel(labels[templateName] ?? templateName);

      const canvasSpec      = (design.canvas_spec        as Record<string, unknown>) || {};
      // Agency design: 1-3 word headline only — no CTA, no subline on image
      const rawHeadline    = (design.headline as string) || headline;
      // Enforce max 3 words — trim if GPT returned more
      const designHeadline = rawHeadline.split(/\s+/).slice(0, 3).join(' ');
      const designSubline  = ''; // Never render subline on image
      const designCta      = ''; // Never render CTA text on image
      const designAccent    = (design.accent_color        as string) || brandCtx?.brand_accent_color || '#c9a96e';
      const designPrimary   = (design.primary_color       as string) || brandCtx?.brand_primary_color || '#1a1a2e';

      // Pick brand photo — prefer photo_url suggested by agent if available
      const photoPool = brandRefImages.filter(u => !u.toLowerCase().endsWith('.png') && !u.toLowerCase().includes('logo'));
      const pool = photoPool.length ? photoPool : brandRefImages;
      const agentPhotoUrl = (design.photo_url as string) || '';
      const photoUrl = (agentPhotoUrl && pool.some(u => u === agentPhotoUrl || u.includes(agentPhotoUrl.split('/').pop() ?? '')))
        ? agentPhotoUrl
        : pool[designIdx % pool.length] ?? pool[0]!;

      // Resolve logo: canvas_spec may override, otherwise use cached Director logo
      const resolvedLogoUrl = (canvasSpec.logo_url as string) || directorLogoUrl || brandCtx?.logo_url || '';
      const resolvedLogoPos = ((canvasSpec.logo_position as string) || postDesignDefaults.logoPosition) as LogoPosition;

      // ── Deterministic template render ───────────────────────────────────────
      const overlayRgba   = (canvasSpec.overlay_rgba  as string) || `rgba(${hexToRgb(designPrimary)},0.6)`;
      const headlineColor = (canvasSpec.headline_color as string) || designAccent;
      const ctaBg         = (canvasSpec.cta_bg         as string) || designAccent;

      const typoMap: Record<string, DisplayFontPreset> = {
        impact:    'poster_3d',
        editorial: 'elegant_serif',
        minimal:   'clean_sans',
      };
      const effectMap: Record<string, TextEffectPreset> = {
        impact:    'extrude_3d',
        editorial: 'editorial_outline',
        minimal:   'gradient_stack',
      };
      const resolvedFontPreset = normalizeDisplayFontPreset((canvasSpec.font_preset as string) || typoMap[templateName] || postDesignDefaults.fontPreset);
      const resolvedTextEffect = normalizeTextEffectPreset((canvasSpec.text_effect as string) || effectMap[templateName] || postDesignDefaults.textEffect);

      const imageUrl = await composeAgencyDesignCard({
        photoUrl,
        headline:       designHeadline.slice(0, 25), // 1-3 words, ~25 chars max
        subline:        '',          // no subline — agency rule
        cta:            '',          // no CTA text on image — agency rule
        contentType:    contentTypeFmt,
        overlayColor:   overlayRgba,
        overlayOpacity: templateName === 'minimal' ? 0.0 : 0.5,
        bgIntent:       'venue_full_bleed',
        textColor:      headlineColor,
        ctaColor:       'transparent',
        typoStyle:      resolvedFontPreset,
        ctaStyle:       'none',      // no CTA button rendered
        logoUrl:        resolvedLogoUrl,
        logoPosition:   resolvedLogoPos,
        textEffect:     resolvedTextEffect,
        fontPreset:     resolvedFontPreset,
      });
      return { imageUrl };
    },
    onSuccess: (data) => {
      setGeneratedUrl(data.imageUrl);
      setGenerateMode('brand');
      setIsFavourited(false);
      setTemplateSaved(false);
      const usedDesign = agencyDesigns[agencyDesignIdx > 0 ? (agencyDesignIdx - 1) % Math.max(agencyDesigns.length, 1) : 0];
      const usedCanvasSpec = (usedDesign?.canvas_spec as Record<string, unknown> | undefined) ?? {};
      setLastUsedTemplate({
        name:             `${agencyDesignLabel || '✦ Ajans'} · ${contentTypeFmt}`,
        label:            agencyDesignLabel || '✦ Ajans',
        source:           'agency',
        agencyDesignSpec: usedDesign,
        contentType:      contentTypeFmt,
        exampleHeadline:  headline.slice(0, 40),
        textEffect:       normalizeTextEffectPreset(usedCanvasSpec.text_effect as string | undefined),
        fontPreset:       normalizeDisplayFontPreset(usedCanvasSpec.font_preset as string | undefined),
        accentColor:      (usedCanvasSpec.headline_color as string | undefined) ?? brandTheme?.palette?.accent ?? brandCtx?.brand_accent_color ?? '#ff2f8f',
        logoPosition:     ((usedCanvasSpec.logo_position as string | undefined) ?? postDesignDefaults.logoPosition) as LogoPosition,
      });
    },
    onError: (err: Error) => setSaveError(err.message?.slice(0, 100) ?? 'Ajans tasarımı başarısız'),
  });

  // ── "Fotoğraf Seç" — deterministic caption ↔ photo matching ──
  const pickPhotoMutation = useMutation({
    mutationFn: async (): Promise<{ imageUrl: string; matchScore?: number }> => {
      if (!brandRefImages.length) throw new Error('Marka fotoğrafı bulunamadı.');

      const meta = galleryAnalysis as Record<string, GalleryPhotoMeta>;
      const lookup = buildGalleryLookup(meta, brandRefImages);

      // Get all photos ranked by caption relevance, with seed so tie-breaks differ per idea
      const ranked = rankPhotosForContentSeeded(photoMatchInput, eligiblePhotoPool, lookup, index, new Set(), meta);

      // Find first photo not yet shown for this idea
      let next = ranked.find(r => !shownPhotoUrls.has(normalizeGalleryUrl(r.url)));

      if (!next) {
        // All photos shown — reset history and restart from top
        setShownPhotoUrls(new Set());
        next = ranked[0] ?? undefined;
      }

      if (!next) {
        // No ranked results (empty pool or no metadata) — cycle through pool sequentially
        const currentBase = generatedUrl ? normalizeGalleryUrl(generatedUrl) : null;
        const currentIdx = currentBase ? eligiblePhotoPool.findIndex(u => normalizeGalleryUrl(u) === currentBase) : -1;
        const nextIdx = (currentIdx + 1) % Math.max(1, eligiblePhotoPool.length);
        const fallback = eligiblePhotoPool[nextIdx];
        if (!fallback) throw new Error('Galeride uygun fotoğraf bulunamadı.');
        return { imageUrl: fallback, matchScore: 0 };
      }

      return { imageUrl: next.url, matchScore: next.score };
    },
    onSuccess: (data) => {
      setPhotoPickError(null);
      setGeneratedUrl(data.imageUrl);
      setGenerateMode('brand');
      // Mark this photo as shown so next click picks a different one
      setShownPhotoUrls(prev => new Set([...prev, normalizeGalleryUrl(data.imageUrl)]));
    },
    onError: (err: Error) => {
      setPhotoPickError(err.message?.slice(0, 120) ?? 'Fotoğraf seçilemedi');
    },
  });

  // ── Unused Gallery → Caption Generation ─────────────────────────────────────
  const generateUnusedCaptions = async () => {
    if (isGeneratingUnusedCaptions) return;
    setIsGeneratingUnusedCaptions(true);
    setUnusedCaptionSuggestions([]);
    try {
      const allPhotoUrls = Object.keys(galleryAnalysis);
      const unusedUrls = allPhotoUrls.filter(url => {
        const lower = url.toLowerCase();
        if (lower.includes('logo') || lower.includes('icon') || lower.endsWith('.png')) return false;
        return !isUrlUsedForCurrentType(url);
      });
      if (unusedUrls.length === 0) {
        setUnusedCaptionSuggestions([]);
        return;
      }
      const existingCaptions = (existingArtifacts as any[])
        .map(a => { try { return JSON.parse(a.content || '{}').caption || ''; } catch { return ''; } })
        .filter(Boolean);

      const res = await fetch('/api/generate-captions-from-gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unusedPhotoUrls: unusedUrls.slice(0, 8),
          galleryAnalysis,
          brandName: brandName || '',
          brandDescription: brandCtx?.website_summary || '',
          industry: brandCtx?.industry || '',
          existingCaptions,
          language: 'Turkish',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setUnusedCaptionSuggestions(data.suggestions ?? []);
      }
    } finally {
      setIsGeneratingUnusedCaptions(false);
    }
  };

  // ── Canvas Tasarım — brand photo + professional text overlay ────────────────
  const brandGenerateMutation = useMutation({
    mutationFn: async (): Promise<{ imageUrl: string }> => {
      if (blocksCanvasOverlay) {
        throw new Error(
          'Bu fikir galeri-only politika ile üretiliyor — canvas metin overlay kullanılmıyor. Feed\'de otomatik üretimi bekleyin veya «Fotoğraf Seç» ile ham galeri kullanın.',
        );
      }
      if (!brandRefImages.length) throw new Error('Marka fotoğrafı bulunamadı. Brand Hub\'dan fotoğraf yükleyin.');

      // Prefer real photos — skip logos and PNGs (vectors)
      const photoPool = brandRefImages.filter(u => {
        const low = u.toLowerCase();
        return !low.includes('logo') && !low.endsWith('.png') && !low.endsWith('.svg');
      });
      const pool = photoPool.length > 0 ? photoPool : brandRefImages;

      // Rotate starting point on each call — try up to 5 different photos
      const startIdx = lastPhotoIdx % pool.length;
      setLastPhotoIdx(startIdx + 1);

      const attempts = pool
        .slice(startIdx)
        .concat(pool.slice(0, startIdx))
        .slice(0, 5);

      let lastErr: Error = new Error('Hiçbir marka fotoğrafı yüklenemedi.');
      for (const photoUrl of attempts) {
        try {
          const imageUrl = await composeBrandPhotoCard({
            photoUrl,
            headline: headline.slice(0, 50),
            cta,
            contentType: contentTypeFmt,
            styleIdx: canvasStyleIdx,
            logoUrl: brandCtx?.logo_url ?? '',
            logoPosition: activeCanvasTemplateStyle?.logoPosition ?? postDesignDefaults.logoPosition,
            textEffect: activeCanvasTemplateStyle?.textEffect ?? postDesignDefaults.textEffect,
            fontPreset: activeCanvasTemplateStyle?.fontPreset ?? postDesignDefaults.fontPreset,
            accentColor: activeCanvasTemplateStyle?.accentColor ?? postDesignDefaults.accentColor ?? brandCtx?.brand_accent_color ?? '#ff2f8f',
          });
          return { imageUrl };
        } catch (e) {
          lastErr = e instanceof Error ? e : new Error(String(e));
        }
      }
      throw lastErr;
    },
    onSuccess: (data) => {
      setGeneratedUrl(data.imageUrl);
      setGenerateMode('brand');
      setIsFavourited(false);
      setTemplateSaved(false);
      const style = CANVAS_STYLES[canvasStyleIdx % CANVAS_STYLES.length]!;
      setLastUsedTemplate({
        name:        `${style.name} · ${contentTypeFmt}`,
        label:       `${style.icon} ${style.name}`,
        source:      'canvas',
        canvasStyleIdx: canvasStyleIdx % CANVAS_STYLES.length,
        contentType: contentTypeFmt,
        exampleHeadline: headline.slice(0, 40),
        textEffect: activeCanvasTemplateStyle?.textEffect ?? postDesignDefaults.textEffect,
        fontPreset: activeCanvasTemplateStyle?.fontPreset ?? postDesignDefaults.fontPreset,
        accentColor: activeCanvasTemplateStyle?.accentColor ?? postDesignDefaults.accentColor ?? brandCtx?.brand_accent_color ?? '#ff2f8f',
        logoPosition: activeCanvasTemplateStyle?.logoPosition ?? postDesignDefaults.logoPosition,
      });
    },
  });

  // ── "Ürün — Marka Arka Planı" ────────────────────────────────────────────────
  // Same logic as admin ContentPage: preserves product 100%, replaces background
  // with brand-consistent scene. Uses the best matching photo from gallery.
  const [isGeneratingProductBg, setIsGeneratingProductBg] = useState(false);
  const [productBgError, setProductBgError] = useState<string | null>(null);

  async function generateProductBackground() {
    if (!brandRefImages.length) return;
    setIsGeneratingProductBg(true);
    setProductBgError(null);
    try {
      // Pick best photo using same scoring as enhance
      const photoPool = brandRefImages.filter(u =>
        !u.toLowerCase().endsWith('.png') && !u.toLowerCase().includes('logo')
      );
      const photoUrl = photoPool[0] ?? brandRefImages[0]!;

      const res = await fetch('/api/generate-instagram-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:        headline || `${brandName} ürün`,
          caption,
          contentType:  contentTypeFmt,
          brandName,
          location,
          businessType: brandCtx?.industry ?? (brandCtx as any)?.business_type,
          visualDna:    brandCtx?.visual_dna,
          brandTone:    brandCtx?.brand_tone,
          logoUrl:      brandCtx?.logo_url ?? undefined,
          productBgMode: true,
          referenceImageUrls: [photoUrl],
          workspaceId:  tenantId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.imageUrl) throw new Error(data.detail ?? data.error ?? 'Arka plan oluşturulamadı');
      setGeneratedUrl(data.imageUrl);
      setGenerateMode('brand');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Hata';
      // If all photos expired, guide user to re-analyze
      if (msg.includes('indirilemedi') || msg.includes('süresi dolmuş') || msg.includes('expired')) {
        setProductBgError('Fotoğraflar süresi dolmuş. "Markayı Yeniden Analiz Et" ile yenile.');
      } else {
        setProductBgError(msg.slice(0, 100));
      }
    } finally {
      setIsGeneratingProductBg(false);
    }
  }

  // ── "Seri Üret" — generates 3-4 carousel slides from different brand photos ──
  // Each slide = different photo + progressive text (hook → story → CTA)
  async function generateSeries() {
    if (!brandRefImages.length) return;
    setIsGeneratingSeries(true);
    setSeriesSlides([]);
    setActiveSlide(0);

    const SLIDE_BRIEFS = [
      { role: 'hook',  textHint: headline.slice(0, 40),         ctaHint: '' },
      { role: 'story', textHint: (caption || visualDir || '').slice(0, 60), ctaHint: '' },
      { role: 'cta',   textHint: (purpose || '').slice(0, 40),  ctaHint: cta || 'Hemen İncele' },
    ];

    // Pick 3 distinct photos — score-diverse selection
    const photoPool = brandRefImages.filter(u => !u.toLowerCase().endsWith('.png') && !u.toLowerCase().includes('logo'));
    const pool = photoPool.length >= 3 ? photoPool : brandRefImages;
    const step = Math.max(1, Math.floor(pool.length / 3));
    const picked = [pool[0]!, pool[step] ?? pool[1] ?? pool[0]!, pool[step * 2] ?? pool[2] ?? pool[0]!];

    const slides: string[] = [];
    for (let i = 0; i < SLIDE_BRIEFS.length; i++) {
      const brief = SLIDE_BRIEFS[i]!;
      const photoUrl = picked[i]!;
      try {
        // Use Canvas for instant generation — consistent design across slides
        const url = await composeBrandPhotoCard({
          photoUrl,
          headline: brief.textHint || headline.slice(0, 40),
          cta: brief.ctaHint,
          contentType: 'post',  // carousel is always square
          styleIdx: i % CANVAS_STYLES.length,  // vary style per slide
          logoUrl: brandCtx?.logo_url ?? '',
          logoPosition: postDesignDefaults.logoPosition,
          textEffect: i % 2 === 0 ? postDesignDefaults.textEffect : 'gradient_stack',
          fontPreset: i % 2 === 0 ? postDesignDefaults.fontPreset : 'condensed_impact',
          accentColor: postDesignDefaults.accentColor ?? brandCtx?.brand_accent_color ?? '#ff2f8f',
        });
        slides.push(url);
        setSeriesSlides([...slides]);  // show slides as they arrive
      } catch {
        // Skip failed slide silently
      }
    }
    setSeriesMode(true);
    setIsGeneratingSeries(false);
  }

  // ── "Reel Üret" — auto montaj when 2+ gallery photos, else single Runway ──
  async function produceMultiPhotoReel(explicitStrategy?: 'multi_ref' | 'sequential') {
    const CDN_HOSTS = ['cdninstagram.com', 'fbcdn.net', 'scontent-'];
    const nonCdnPhotos = brandRefImages.filter(isUsableReelPhotoUrl);
    const promptImage =
      (generatedUrl && !generatedUrl.startsWith('blob:') ? generatedUrl : null) ||
      agentGalleryUrl ||
      nonCdnPhotos[0] ||
      null;

    if (!promptImage) {
      throw new Error('Reel için önce bir görsel üretin veya marka fotoğrafı seçin');
    }

    const extraUrls = brandRefImages.filter(
      (u) => isUsableReelPhotoUrl(u) && normalizeGalleryUrl(u) !== normalizeGalleryUrl(promptImage),
    );
    const montageUrls = [promptImage, ...extraUrls].filter(isUsableReelPhotoUrl).slice(0, 4);
    const photoInputs = buildMultiReelPhotoInputs(montageUrls, galleryAnalysis, normalizeGalleryUrl);

    if (photoInputs.length < 2) {
      throw new Error('Montaj reel için en az 2 kullanılabilir marka fotoğrafı gerekiyor');
    }

    const resolved = explicitStrategy ?? resolveRunwayReelStrategy({
      photoCount: photoInputs.length,
      treatment: (vps?.treatment as string) ?? purpose,
      templateUseCase: getIdeaField(idea, 'template_use_case'),
      mood: getIdeaField(idea, 'mood', 'tone'),
      contentType: fmtLower.includes('reel') ? 'reel' : fmt,
    });
    const montageStrategy = resolved === 'multi_ref' ? 'multi_ref' : 'sequential';
    const limit = maxPhotosForStrategy(resolved === 'single' ? 'multi_ref' : resolved);
    setMultiReelStrategy(montageStrategy);

    const directorExtras = reelDirectorExtrasFromIdeaRecord(idea, {
      sector,
      businessType: sector,
      aiVisualStandard,
      brandContextForVisual: brandCtxForVisual,
      vibeProfile: pyCtx?.brand_vibe_profile as Record<string, unknown> | undefined,
      brandThemeGrading: brandTheme?.grading
        ? {
            look: brandTheme.grading.look,
            lut_directive: (brandTheme.grading as { lutDirective?: string }).lutDirective ?? brandTheme.grading.look,
          }
        : undefined,
      workspaceId: tenantId,
      strategicPurpose: purpose,
    });
    const multi = await callGenerateMultiReel(window.location.origin, {
      workspaceId: tenantId,
      photos: photoInputs.slice(0, limit),
      headline,
      caption: caption.slice(0, 300),
      brandName: brandName ?? (brandCtx?.business_name as string | undefined) ?? '',
      brandLocation: brandCtx?.location ?? location ?? '',
      vibeProfile: pyCtx?.brand_vibe_profile as Record<string, unknown> | undefined,
      brandThemeGrading: brandTheme?.grading
        ? {
            look: brandTheme.grading.look,
            lut_directive: (brandTheme.grading as { lutDirective?: string }).lutDirective ?? brandTheme.grading.look,
          }
        : undefined,
      strategy: montageStrategy,
      ratio: '720:1280',
      duration: 5,
      agentVisualDirection: buildReelAgentVisualDirection(
        productionIdeaFromRecord({ ...idea, headline, caption_draft: caption, cta, hashtags, content_type: fmt }, index),
        { brandName: brandName ?? String(brandCtx?.business_name ?? ''), location: brandCtx?.location ?? location, missionBrief },
        {
          photoUrl: promptImage,
          description: String(findAnalysis(promptImage)?.description ?? ''),
          tags: (findAnalysis(promptImage)?.contentTags as string[] | undefined) ?? [],
        },
        directorExtras,
      ).slice(0, 400),
      businessType: sector,
      strategicPurpose: purpose,
      missionBrief,
      productType: directorExtras.productType,
    });

    if (!multi.videoUrl) {
      throw new Error(multi.error || 'Çoklu fotoğraf reel üretilemedi');
    }

    setReelUrl(multi.videoUrl);
    await apiClient.saveCreativeArtifact({
      title: `${headline || brandName} — ${montageStrategy === 'sequential' ? 'Montaj Reel' : 'Reel'}`,
      contentUrl: multi.videoUrl,
      platform: 'instagram',
      contentType: 'instagram_reel',
      content: JSON.stringify({
        videoUrl: multi.videoUrl,
        strategy: multi.strategy,
        photoCount: multi.photoCount,
        caption,
        kind: 'instagram_reel',
      }),
      metadata: {
        videoUrl: multi.videoUrl,
        strategy: multi.strategy,
        photoCount: multi.photoCount,
        caption,
        source: 'runway_multi_photo',
      },
    });
    queryClient.invalidateQueries({ queryKey: ['artifacts'] });
  }

  async function generateReelVideo() {
    setIsGeneratingReel(true);
    setReelError(null);
    try {
      const CDN_HOSTS = ['cdninstagram.com', 'fbcdn.net', 'scontent-'];
      const nonCdnPhotos = brandRefImages.filter(isUsableReelPhotoUrl);
      const promptImage =
        (generatedUrl && !generatedUrl.startsWith('blob:') ? generatedUrl : null) ||
        agentGalleryUrl ||
        nonCdnPhotos[0] ||
        null;

      if (!promptImage) {
        throw new Error('Reel için önce bir görsel üretin veya marka fotoğrafı seçin');
      }

      const extraUrls = brandRefImages.filter(
        (u) => isUsableReelPhotoUrl(u) && normalizeGalleryUrl(u) !== normalizeGalleryUrl(promptImage),
      );
      const montageUrls = [promptImage, ...extraUrls].filter(isUsableReelPhotoUrl);
      const photoInputs = buildMultiReelPhotoInputs(montageUrls, galleryAnalysis, normalizeGalleryUrl);

      if (photoInputs.length >= 2) {
        try {
          await produceMultiPhotoReel();
          return;
        } catch (multiErr: unknown) {
          const msg = multiErr instanceof Error ? multiErr.message : 'Montaj reel başarısız';
          console.warn('[MissionContentFactory] Multi-reel failed, falling back to single:', msg);
        }
      }

      const analysis = findAnalysis(promptImage);
      const pIdea = productionIdeaFromRecord(
        { ...idea, headline, caption_draft: caption, cta, hashtags, content_type: fmt, strategic_purpose: purpose },
        index,
      );
      const rendererBrand: RendererBrandContext = {
        brandName: brandName ?? String(brandCtx?.business_name ?? ''),
        location: brandCtx?.location ?? location ?? '',
        businessType: sector,
        missionBrief,
        brandTone: String(brandCtx?.brand_tone ?? 'friendly'),
        targetAudience: String(brandCtx?.target_audience ?? ''),
        vibeProfile: pyCtx?.brand_vibe_profile as Record<string, unknown> | undefined,
        themeGrading: brandTheme?.grading
          ? {
              look: brandTheme.grading.look,
              lutDirective: (brandTheme.grading as { lutDirective?: string }).lutDirective,
              paletteDescription: brandTheme.palette?.description,
            }
          : undefined,
        visualStyle: brandTheme?.grading?.look || String(brandCtx?.visual_style ?? 'warm natural'),
      };
      const galleryMeta: RendererGalleryMeta = {
        photoUrl: promptImage,
        description: String(analysis?.description ?? ''),
        tags: (analysis?.contentTags as string[] | undefined) ?? [],
      };
      const directorExtras = reelDirectorExtrasFromIdeaRecord(idea, {
        sector,
        businessType: sector,
        aiVisualStandard,
        brandContextForVisual: brandCtxForVisual,
        vibeProfile: pyCtx?.brand_vibe_profile as Record<string, unknown> | undefined,
        brandThemeGrading: brandTheme?.grading
          ? {
              look: brandTheme.grading.look,
              lut_directive: (brandTheme.grading as { lutDirective?: string }).lutDirective,
            }
          : undefined,
        workspaceId: tenantId,
        strategicPurpose: purpose,
      });
      const reelBody = buildReelGenerateReelRequest(
        pIdea,
        rendererBrand,
        galleryMeta,
        promptImage,
        directorExtras,
      );
      auditRendererPayload('runway', reelBody);

      const res = await fetch('/api/generate-reel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reelBody),
      });
      const data = await res.json();
      const resolvedVideoUrl: string | null = data.videoUrl ?? data.outputUrls?.[0] ?? null;
      if (!res.ok || !resolvedVideoUrl) {
        const msg = data.error || data.detail || 'Reel üretilemedi';
        const hint = data.hint ? ` · ${data.hint}` : '';
        throw new Error(msg + hint);
      }
      setReelUrl(resolvedVideoUrl);

      await apiClient.saveCreativeArtifact({
        title: `${headline || brandName} — Reel`,
        contentUrl: resolvedVideoUrl,
        platform: 'instagram',
        contentType: 'instagram_reel',
        content: JSON.stringify({ videoUrl: resolvedVideoUrl, caption, kind: 'instagram_reel' }),
        metadata: { videoUrl: resolvedVideoUrl, caption, source: 'runway' },
      });
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Runway hatası';
      setReelError(msg.slice(0, 100));
    } finally {
      setIsGeneratingReel(false);
    }
  }

  // ── Ajans Still → Runway Reel (2-step pipeline) ──────────────────────────
  const [isGeneratingAgencyReel, setIsGeneratingAgencyReel] = useState(false);
  const [agencyReelStep, setAgencyReelStep] = useState<'idle' | 'agency' | 'runway'>('idle');

  async function generateAgencyReel() {
    if (isGeneratingAgencyReel) return;
    setIsGeneratingAgencyReel(true);
    setAgencyReelStep('agency');
    setReelError(null);

    try {
      // Step 1: Produce a deterministic 9:16 agency design with real logo + 3D display type.
      const directorRes = await fetch(`/api/design-director/${tenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline:          headline.slice(0, 50),
          cta:               cta.slice(0, 30),
          caption_context:   caption.slice(0, 300),
          format:            'story',
          mission_brief:     (missionBrief ?? '').slice(0, 300),
          strategic_purpose: (purpose ?? '').slice(0, 200),
        }),
      });
      const directorData = directorRes.ok ? await directorRes.json() : {};
      const designs: Record<string, unknown>[] = directorData?.designs ?? [];
      const design = designs[0] ?? {};
      const canvasSpec = (design.canvas_spec as Record<string, unknown> | undefined) ?? {};

      // Pick best promptImage (non-CDN)
      const CDN_HOSTS = ['cdninstagram.com', 'fbcdn.net', 'scontent-'];
      const nonCdnPhotos = brandRefImages.filter(isUsableReelPhotoUrl);
      const baseImage = (generatedUrl && !generatedUrl.startsWith('blob:') ? generatedUrl : null) || nonCdnPhotos[0] || agentGalleryUrl;

      const agencyStillUrl = baseImage
        ? await composeAgencyDesignCard({
            photoUrl:       baseImage,
            headline:       headline.split(/\s+/).slice(0, 3).join(' '),
            subline:        '',
            cta:            '',
            contentType:    'story',
            overlayColor:   (canvasSpec.overlay_rgba as string) || `rgba(28,10,7,0.55)`,
            overlayOpacity: 0.55,
            bgIntent:       'venue_full_bleed',
            textColor:      (canvasSpec.headline_color as string) || brandTheme?.palette?.accent || '#c9813f',
            ctaColor:       'transparent',
            typoStyle:      (canvasSpec.font_preset as string) || 'poster_3d',
            ctaStyle:       'none',
            logoUrl:        (canvasSpec.logo_url as string) || directorData.logo_url || brandCtx?.logo_url || '',
            logoPosition:   ((canvasSpec.logo_position as string) || postDesignDefaults.logoPosition) as LogoPosition,
            textEffect:     normalizeTextEffectPreset((canvasSpec.text_effect as string) || postDesignDefaults.textEffect),
            fontPreset:     normalizeDisplayFontPreset((canvasSpec.font_preset as string) || postDesignDefaults.fontPreset),
          })
        : null;

      if (!agencyStillUrl) throw new Error('Ajans görseli üretilemedi');

      // Step 2: Animate with Runway
      setAgencyReelStep('runway');
      const vibeClause = brandTheme
        ? `Visual style: ${brandTheme.grading?.look ?? ''}. ${brandTheme.grading?.lutDirective ?? ''}. Color: ${brandTheme.palette?.description ?? ''}.`
        : '';
      const concept = [agentEditPrompt, vibeClause].filter(Boolean).join(' ') || caption;

      const reelRes = await fetch('/api/generate-reel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:        headline || `${brandName} Story Reel`,
          // caption carries the actual content story; director prompt will visualize it
          caption,
          concept,
          platform:     'instagram',
          contentType:  'reel',
          visualStyle:  brandTheme?.grading?.look ?? 'cinematic editorial',
          brandTone:    (brandCtx as any)?.brand_tone ?? 'friendly',
          duration:     5,
          cameraMotion: 'arc_right',
          ratio:        '720:1280',
          tags:         hashtags.slice(0, 5),
          promptImage:  agencyStillUrl,
          sceneMetadata: {
            brandName,
            location: (brandCtx as any)?.location ?? '',
          },
        }),
      });
      const reelData = await reelRes.json();
      const videoUrl: string | null = reelData.videoUrl ?? reelData.outputUrls?.[0] ?? null;
      if (!reelRes.ok || !videoUrl) throw new Error(reelData.error || 'Reel üretilemedi');

      setReelUrl(videoUrl);
      await apiClient.saveCreativeArtifact({
        title:       `${headline || brandName} — Ajans Story Reel`,
        contentUrl:  videoUrl,
        platform:    'instagram',
        contentType: 'instagram_reel',
        content:     JSON.stringify({ videoUrl, agencyStillUrl, caption, kind: 'instagram_reel' }),
        metadata:    { videoUrl, agencyStillUrl, caption, source: 'runway_agency_story' },
      });
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
    } catch (e: any) {
      setReelError(e?.message?.slice(0, 100) || 'Ajans reel hatası');
    } finally {
      setIsGeneratingAgencyReel(false);
      setAgencyReelStep('idle');
    }
  }

  // ── Çoklu Fotoğraf Reel (multi-reference veya sequential) ─────────────────
  async function generateMultiPhotoReel(strategy: 'multi_ref' | 'sequential' = 'multi_ref') {
    if (isGeneratingMultiReel || isGeneratingReel || isGeneratingAgencyReel) return;
    setIsGeneratingMultiReel(true);
    setReelError(null);
    try {
      await produceMultiPhotoReel(strategy);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Çoklu fotoğraf reel hatası';
      setReelError(msg.slice(0, 120));
    } finally {
      setIsGeneratingMultiReel(false);
    }
  }

  // ── Event Card (Canvas Story / Post) ─────────────────────────────────────
  const CDN_HOSTS = ['cdninstagram.com', 'fbcdn.net', 'scontent-'];

  function resolveEventCardPhotoUrl(): string | null {
    return (
      (generatedUrl && !generatedUrl.startsWith('blob:') ? generatedUrl : null) ||
      agentGalleryUrl ||
      brandRefImages.find(isUsableReelPhotoUrl) ||
      null
    );
  }

  async function resolvePhotoUrlForApi(photoUrl: string): Promise<string> {
    if (!photoUrl.includes('/api/media') || !photoUrl.includes('key=')) return photoUrl;
    try {
      const metaRes = await fetch(
        photoUrl.startsWith('/api/media')
          ? `${photoUrl}${photoUrl.includes('?') ? '&' : '?'}meta=1`
          : `/api/media-proxy?url=${encodeURIComponent(photoUrl)}&meta=1`,
      ).catch(() => null);
      if (metaRes?.ok) {
        const meta = await metaRes.json().catch(() => null);
        if (meta?.presignedUrl) return meta.presignedUrl as string;
      }
    } catch { /* keep original */ }
    return photoUrl;
  }

  async function buildEventCardRequestBody(photoUrl: string) {
    const b = brandCtx as Record<string, unknown> | undefined;
    const vibeProfile = b?.brand_vibe_profile ?? undefined;
    const resolvedPhotoUrl = await resolvePhotoUrlForApi(photoUrl);
    const resolvedBrandKit = resolveAnnouncementBrandKit({
      brandTheme: brandTheme as unknown as Record<string, unknown>,
      brandContext: b,
    });
    return {
      photoUrl: resolvedPhotoUrl,
      contentType: eventForm.contentType,
      templateId: eventForm.templateId,
      brandName: brandName ?? (b?.business_name as string | undefined) ?? '',
      location: (b?.location as string | undefined) ?? '',
      workspaceId: tenantId,
      artistName: eventForm.artistName || undefined,
      eventName: eventForm.eventName || headline || '',
      date: eventForm.date || undefined,
      time: eventForm.time || undefined,
      venueArea: eventForm.venueArea || undefined,
      tagline: eventForm.tagline || caption.slice(0, 60) || undefined,
      vibeProfile,
      enhancePhoto: false,
      brandKit: resolvedBrandKit,
    };
  }

  async function previewEventCard() {
    const photoUrl = resolveEventCardPhotoUrl();
    if (!photoUrl) {
      setEventPreviewError('Önizleme için önce bir marka fotoğrafı seçin veya üretin.');
      return;
    }
    if (!eventForm.eventName.trim()) {
      setEventPreviewError('Önizleme için etkinlik adı gerekli.');
      return;
    }

    setEventPreviewLoading(true);
    setEventPreviewError(null);
    setEventPreviewUrl(null);
    try {
      const body = await buildEventCardRequestBody(photoUrl);
      const res = await fetch('/api/generate-event-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      const data = await res.json();
      if (!res.ok || !data.imageUrl) throw new Error(data.error || 'Önizleme üretilemedi');
      setEventPreviewUrl(data.imageUrl as string);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Önizleme hatası';
      setEventPreviewError(msg.slice(0, 150));
    } finally {
      setEventPreviewLoading(false);
    }
  }

  async function generateEventCard() {
    const photoUrl = resolveEventCardPhotoUrl();

    if (!photoUrl) {
      setEventCardError('Etkinlik kartı için önce bir marka fotoğrafı seçin veya üretin.');
      return;
    }

    setIsGeneratingEventCard(true);
    setEventCardError(null);
    setEventCardUrl(null);

    try {
      const body = await buildEventCardRequestBody(photoUrl);
      const res = await fetch('/api/generate-event-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, enhancePhoto: eventForm.enhancePhoto }),
        signal: AbortSignal.timeout(120_000),
      });

      const data = await res.json();
      if (!res.ok || !data.imageUrl) throw new Error(data.error || 'Etkinlik kartı üretilemedi');

      setEventCardUrl(data.imageUrl);
      setEventPreviewUrl(data.imageUrl);
      setShowEventModal(false);

      // Save as artifact
      await apiClient.saveCreativeArtifact({
        title: `${eventForm.artistName || eventForm.eventName || headline} — Etkinlik ${eventForm.contentType === 'story' ? 'Story' : 'Post'}`,
        contentUrl: data.imageUrl,
        platform: 'instagram',
        contentType: eventForm.contentType === 'story' ? 'instagram_story' : 'instagram_post',
        content: JSON.stringify({ imageUrl: data.imageUrl, caption, kind: `instagram_${eventForm.contentType}`, eventForm }),
        metadata: { imageUrl: data.imageUrl, source: 'event_card', contentType: eventForm.contentType },
      });
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
    } catch (e: any) {
      setEventCardError(e?.message?.slice(0, 150) || 'Etkinlik kartı hatası');
    } finally {
      setIsGeneratingEventCard(false);
    }
  }


  // ── "Tüm Formatları Üret" — post + story + carousel paralel ─────────────
  async function generateAllFormats() {
    if (!brandRefImages.length && !agentGalleryUrl) return;
    setIsGeneratingAll(true);
    setAllFormatsError(null);
    setAllFormatsResult(null);

    const basePhoto = agentGalleryUrl || brandRefImages[0]!;
    const b = brandCtx as any;

    const commonParams = {
      title:              headline || `${brandName} içerik`,
      caption,
      brandName:          brandName || (b?.business_name as string | undefined) || '',
      location:           b?.location || location || '',
      visualStyle:        b?.visual_style || b?.visual_dna || visualDir || '',
      campaignContext:    agentEditPrompt || visualDir || purpose,
      referenceImageUrls: [basePhoto, ...(brandRefImages.slice(0, 2))].filter(Boolean),
      logoUrl:            b?.logo_url || undefined,
    };

    try {
      // Run post + story in parallel, carousel sequential (3 slides)
      const [postRes, storyRes] = await Promise.all([
        apiClient.generateInstagramImage({ ...commonParams, contentType: 'post',
          designCardPrompt: agentEditPrompt || undefined }),
        apiClient.generateInstagramImage({ ...commonParams, contentType: 'story',
          designCardPrompt: agentEditPrompt || undefined }),
      ]);

      const result: typeof allFormatsResult = {
        post:  postRes.imageUrl,
        story: storyRes.imageUrl,
      };

      // Carousel: 3 slides (hook, story, CTA) via Canvas — fast, consistent
      const carouselSlides: string[] = [];
      const SLIDE_ROLES = [
        { textHint: headline.slice(0, 40),        ctaHint: '' },
        { textHint: caption.slice(0, 60),         ctaHint: '' },
        { textHint: purpose.slice(0, 40),         ctaHint: cta || 'Hemen İncele' },
      ];
      const slidePhotos = brandRefImages.length >= 3
        ? [brandRefImages[0]!, brandRefImages[1]!, brandRefImages[2]!]
        : [basePhoto, basePhoto, basePhoto];

      for (let i = 0; i < SLIDE_ROLES.length; i++) {
        const s = SLIDE_ROLES[i]!;
        try {
          const url = await composeBrandPhotoCard({
            photoUrl: slidePhotos[i]!,
            headline: s.textHint || headline.slice(0, 40),
            cta: s.ctaHint,
            contentType: 'post',
            styleIdx: i % CANVAS_STYLES.length,
            logoUrl: brandCtx?.logo_url ?? '',
            logoPosition: postDesignDefaults.logoPosition,
            textEffect: i % 2 === 0 ? postDesignDefaults.textEffect : 'gradient_stack',
            fontPreset: i % 2 === 0 ? postDesignDefaults.fontPreset : 'condensed_impact',
            accentColor: postDesignDefaults.accentColor ?? brandCtx?.brand_accent_color ?? '#ff2f8f',
          });
          carouselSlides.push(url);
        } catch { /* skip */ }
      }
      result.carousel = carouselSlides;

      setAllFormatsResult(result);

      // Save all to outputs
      const saves = [
        postRes.imageUrl && apiClient.saveCreativeArtifact({
          title: `${headline || brandName} — Post`, contentUrl: postRes.imageUrl,
          platform: 'instagram', contentType: 'instagram_post',
          content: JSON.stringify({ imageUrl: postRes.imageUrl, caption, kind: 'instagram_post' }),
          metadata: { imageUrl: postRes.imageUrl, caption },
        }),
        storyRes.imageUrl && apiClient.saveCreativeArtifact({
          title: `${headline || brandName} — Story`, contentUrl: storyRes.imageUrl,
          platform: 'instagram', contentType: 'instagram_story',
          content: JSON.stringify({ imageUrl: storyRes.imageUrl, caption, kind: 'instagram_story' }),
          metadata: { imageUrl: storyRes.imageUrl, caption },
        }),
        carouselSlides.length > 0 && carouselSlides[0] && apiClient.saveCreativeArtifact({
          title: `${headline || brandName} — Carousel (${carouselSlides.length} slide)`,
          contentUrl: carouselSlides[0],
          platform: 'instagram', contentType: 'instagram_carousel',
          content: JSON.stringify({
            imageUrl: carouselSlides[0],
            caption,
            kind: 'instagram_carousel',
            slides: carouselSlides,
            carousel_urls: carouselSlides.length >= 2 ? carouselSlides : undefined,
            carousel_multi_photo: carouselSlides.length >= 2,
          }),
          metadata: {
            imageUrl: carouselSlides[0],
            caption,
            carousel_urls: carouselSlides.length >= 2 ? carouselSlides : undefined,
            carousel_multi_photo: carouselSlides.length >= 2,
          },
        }),
      ].filter(Boolean);

      await Promise.allSettled(saves as Promise<unknown>[]);
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
    } catch (e: any) {
      setAllFormatsError(e?.message?.slice(0, 100) || 'Üretim hatası');
    } finally {
      setIsGeneratingAll(false);
    }
  }

  // Normalise fmt → canonical kind string that signalFromArtifact + detectKind understand
  const canonicalKind = fmt.toLowerCase().includes('reel')
    ? 'instagram_reel'
    : fmt.toLowerCase().includes('story')
      ? 'instagram_story'
      : 'instagram_post';

  const [saveError, setSaveError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!generatedUrl) throw new Error('Görsel bulunamadı.');

      // If it's a data URL (canvas compositor output), upload to R2 first.
      // Never send base64 as contentUrl — it's too large and breaks .NET.
      let finalUrl = generatedUrl;
      if (generatedUrl.startsWith('data:')) {
        const uploadRes = await fetch('/api/upload-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl: generatedUrl, mimeType: 'image/jpeg' }),
        });
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({}));
          throw new Error(err.error || `Görsel yüklenemedi (${uploadRes.status})`);
        }
        const { imageUrl } = await uploadRes.json();
        finalUrl = imageUrl;
      }

      return apiClient.saveCreativeArtifact({
        title: headline || `${brandName} — ${fmtClean}`,
        contentUrl: finalUrl,
        // Content JSON — no base64, only URL reference
        content: JSON.stringify({
          kind:        canonicalKind,
          contentType: fmt,
          caption,
          hashtags,
          cta,
          imageUrl:    finalUrl,   // URL only, never base64
          headline,
        }),
        platform: 'instagram',
        contentType: fmt,
        metadata: {
          contentType: fmt,
          kind:        canonicalKind,
          platform:    'instagram',
          headline,
          caption: caption?.slice(0, 300),   // trim long captions
          cta,
          hashtags: hashtags?.slice(0, 10),
          strategic_purpose: purpose?.slice(0, 200),
          mission_brief: missionBrief?.slice(0, 200),
          idea_index: index,
          imageUrl: finalUrl,    // URL only
        },
      });
    },
    onSuccess: () => {
      setSaved(true);
      setSaveError(null);
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      // Auto-save design template when content is approved for Outputs
      if (lastUsedTemplate && generatedUrl && !templateSaved) {
        makeThumbnail(generatedUrl, isPortrait).then(thumb => {
          const tmpl: DesignTemplate = {
            ...lastUsedTemplate,
            id:        `tmpl_${Date.now()}`,
            thumbnail: thumb,
            savedAt:   new Date().toISOString(),
          };
          saveDesignTemplate(tmpl, tenantId);
          if (tenantId) {
            createRemotePostTemplate(tenantId, tmpl)
              .then(() => queryClient.invalidateQueries({ queryKey: ['brandPostTemplates', tenantId] }))
              .catch(() => setSavedTemplates(loadSavedTemplates(tenantId)));
          } else {
            setSavedTemplates(loadSavedTemplates(tenantId));
          }
          setTemplateSaved(true);
        }).catch(() => {/* ignore */});
      }
      onSaved();
    },
    onError: (err: Error) => {
      setSaveError(err.message?.slice(0, 100) ?? 'Kaydedilemedi');
    },
  });

  const captionAlt    = getIdeaField(idea, 'caption_draft_alt', 'caption_alt');
  const captionPrimary = caption; // alias for clarity
  const visualDirFull = getIdeaField(idea, 'visual_direction', 'visual_production_spec');
  const postingTime   = getIdeaField(idea, 'posting_time_suggestion', 'posting_time');
  const engPrimary    = (idea.engagement_prediction as any)?.primary ?? '';
  const engAlt        = (idea.engagement_prediction as any)?.alt ?? '';

  // ── New UX state ──────────────────────────────────────────────────────────
  const [activeTab,        setActiveTab]        = useState<'content' | 'brief'>('content');
  const [selectedCaption,  setSelectedCaption]  = useState<'primary' | 'alt'>('primary');
  const [showHashtagSheet, setShowHashtagSheet] = useState(false);
  const [showOverflowSheet,setShowOverflowSheet]= useState(false);
  const [copiedKey,        setCopiedKey]        = useState<string | null>(null);
  const [briefExpanded,    setBriefExpanded]    = useState<Record<string, boolean>>({});

  // Active caption follows selection
  const activeCaption = selectedCaption === 'alt' && captionAlt ? captionAlt : captionPrimary;

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    }).catch(() => {});
  }

  function toggleBrief(key: string) {
    setBriefExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }

  // Engagement color helper
  const ENG_COLOR: Record<string, string> = { high: '#10B981', medium: '#F59E0B', low: '#94A3B8' };
  const engColor = ENG_COLOR[engPrimary.toLowerCase()] ?? '#94A3B8';

  // Primary generate — sadece marka fotoğrafı, metin overlay yok
  // Tasarım seçenekleri (Canvas, Ajans, AI) overflow sheet'te
  function primaryGenerate() {
    if (agentGalleryUrl || brandRefImages.length > 0) {
      pickPhotoMutation.mutate();
    } else {
      generateMutation.mutate();
    }
  }

  const isAnyGenerating = generateMutation.isPending || brandGenerateMutation.isPending
    || pickPhotoMutation.isPending || agencyDesignMutation.isPending
    || isGeneratingAll || isGeneratingReel || isGeneratingSeries;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>

      {/* ═══ HEADER ═══════════════════════════════════════════════════════ */}
      <div style={{ flexShrink: 0, padding: '0 0 10px' }}>
        {/* Format badge row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20,
              background: `${fmtColor}14`, color: fmtColor, fontWeight: 700, letterSpacing: '0.04em' }}>
              {isPortrait ? (fmtLower.includes('reel') ? '▶ Reel' : '↕ Story') : isCarousel ? '⊞ Carousel' : '□ Post'}
            </span>
            <span style={{ fontSize: 9, color: t.textMuted, padding: '2px 6px',
              borderRadius: 10, border: `0.5px solid ${t.separator}` }}>
              {isPortrait ? '9:16' : isCarousel ? '4:5' : '1:1'}
            </span>
            {engPrimary && (
              <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10,
                background: `${engColor}14`, color: engColor, fontWeight: 700 }}>
                {engPrimary === 'high' ? 'Yüksek etki' : engPrimary === 'medium' ? 'Orta etki' : 'Düşük etki'}
              </span>
            )}
          </div>
          <span style={{ fontSize: 11, color: t.textMuted }}>{index + 1} / {total}</span>
        </div>

        {/* Auto-produced banner */}
        {autoProducedArtifact && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
            padding: '7px 10px', borderRadius: 10,
            background: 'rgba(138,171,189,0.06)', border: '0.5px solid rgba(138,171,189,0.2)',
          }}>
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 6,
              background: 'rgba(138,171,189,0.15)', color: '#8AABBD', fontWeight: 700 }}>AI</span>
            <span style={{ fontSize: 11, color: '#8AABBD', fontWeight: 500, flex: 1 }}>
              Feed'e otomatik eklendi
            </span>
            <button onClick={() => navigate('feed')} style={{
              padding: '3px 8px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'rgba(138,171,189,0.12)', color: '#8AABBD', fontSize: 10, fontWeight: 700,
            }}>
              Gor
            </button>
          </div>
        )}

        {/* Segmented control — İçerik | Brief */}
        <div style={{ display: 'flex', background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
          borderRadius: 10, padding: 3, gap: 2 }}>
          {(['content', 'brief'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              flex: 1, padding: '7px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, transition: 'all 160ms ease',
              background: activeTab === tab ? (t.isDark ? 'rgba(77,112,136,0.25)' : '#fff') : 'transparent',
              color: activeTab === tab ? t.accent : t.textMuted,
              boxShadow: activeTab === tab ? '0 1px 4px rgba(0,0,0,0.15)' : 'none',
            }}>
              {tab === 'content' ? 'İçerik' : 'Brief'}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ SCROLL AREA ══════════════════════════════════════════════════ */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 82 }}>

        {/* ─── İÇERİK sekmesi ─────────────────────────────────────────── */}
        {activeTab === 'content' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Başlık */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: t.textMuted,
                textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Başlık</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: t.textPrimary,
                lineHeight: 1.3, letterSpacing: '-0.02em', margin: 0 }}>
                {headline || '—'}
              </p>
            </div>

            {/* Caption Seçim Kartları */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: t.textMuted,
                textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Caption seçin
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { key: 'primary' as const, label: 'Ana caption', text: captionPrimary, eng: engPrimary },
                  ...(captionAlt ? [{ key: 'alt' as const, label: 'Alternatif caption', text: captionAlt, eng: engAlt }] : []),
                ].map(opt => {
                  const isSelected = selectedCaption === opt.key;
                  return (
                    <div key={opt.key} onClick={() => setSelectedCaption(opt.key)}
                      style={{
                        borderRadius: 14, padding: '12px 14px', cursor: 'pointer',
                        background: isSelected
                          ? (t.isDark ? 'rgba(77,112,136,0.1)' : 'rgba(77,112,136,0.06)')
                          : (t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                        border: `${isSelected ? '1.5px' : '0.5px'} solid ${isSelected ? 'rgba(77,112,136,0.45)' : t.separator}`,
                        transition: 'all 160ms ease',
                        position: 'relative',
                      }}>
                      {/* Header row */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          {/* Radio indicator */}
                          <div style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                            border: `2px solid ${isSelected ? t.accent : t.separator}`,
                            background: isSelected ? t.accent : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {isSelected && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />}
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700,
                            color: isSelected ? t.accent : t.textMuted }}>{opt.label}</span>
                        </div>
                        {/* Copy button */}
                        <button onClick={e => { e.stopPropagation(); copyText(opt.text, opt.key); }}
                          style={{ padding: '4px 10px', borderRadius: 8, border: `0.5px solid ${t.separator}`,
                            background: 'transparent', cursor: 'pointer', fontSize: 10,
                            color: copiedKey === opt.key ? '#10B981' : t.textMuted, fontWeight: 600,
                            transition: 'color 200ms' }}>
                          {copiedKey === opt.key ? 'Kopyalandı ✓' : 'Kopyala'}
                        </button>
                      </div>
                      {/* Caption text */}
                      <p style={{ fontSize: 13, color: isSelected ? t.textPrimary : t.textSecondary,
                        lineHeight: 1.6, margin: 0, opacity: isSelected ? 1 : 0.65 }}>
                        {opt.text || '—'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CTA */}
            {cta && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: t.textMuted,
                  textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>CTA</span>
                <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20,
                  background: `${fmtColor}14`, color: fmtColor, fontWeight: 700 }}>{cta}</span>
              </div>
            )}

            {/* Hashtag satırı — ilk 5 + overflow */}
            {hashtags.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {hashtags.slice(0, 5).map((h, i) => (
                    <span key={i} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20,
                      background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                      color: t.textTertiary, fontWeight: 500 }}>{h}</span>
                  ))}
                  {hashtags.length > 5 && (
                    <button onClick={() => setShowHashtagSheet(true)} style={{
                      fontSize: 11, padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                      background: 'transparent', border: `0.5px solid ${t.separator}`,
                      color: t.accent, fontWeight: 600 }}>
                      +{hashtags.length - 5} hashtag
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── BRIEF sekmesi ───────────────────────────────────────────── */}
        {activeTab === 'brief' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[
              { key: 'visual', icon: '📸', label: 'Görsel Yön', text: visualDirFull },
              { key: 'strategy', icon: '🎯', label: 'Strateji', text: purpose },
              { key: 'timing', icon: '🕐', label: 'Zamanlama', text: postingTime },
              { key: 'production', icon: '⚙', label: 'Prodüksiyon', text: agentEditPrompt },
            ].filter(row => row.text).map((row, i, arr) => {
              const isOpen = briefExpanded[row.key];
              return (
                <div key={row.key} style={{ borderBottom: i < arr.length - 1 ? `0.5px solid ${t.separator}` : 'none' }}>
                  <button onClick={() => toggleBrief(row.key)} style={{
                    width: '100%', padding: '12px 0', background: 'none', border: 'none',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                  }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{row.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: t.textSecondary, flex: 1 }}>{row.label}</span>
                    {!isOpen && (
                      <span style={{ fontSize: 11, color: t.textMuted, maxWidth: 160,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.text.slice(0, 40)}{row.text.length > 40 ? '…' : ''}
                      </span>
                    )}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={t.textMuted}
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      style={{ flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {isOpen && (
                    <p style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.65,
                      margin: '0 0 12px', paddingLeft: 24 }}>
                      {row.text}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ─── GÖRSEL ALANI ────────────────────────────────────────────── */}
        <div style={{ marginTop: 18 }}>
          {seriesMode && seriesSlides.length > 0 ? (
            /* Carousel slide viewer */
            <div>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6,
                scrollbarWidth: 'none', marginBottom: 8 }}>
                {seriesSlides.map((url, i) => (
                  <button key={i} onClick={() => setActiveSlide(i)} style={{
                    flexShrink: 0, width: 60, height: 60, borderRadius: 10, overflow: 'hidden',
                    border: `${activeSlide === i ? '2px' : '1px'} solid ${activeSlide === i ? t.accent : t.separator}`,
                    cursor: 'pointer', padding: 0, background: 'none',
                  }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
              <div style={{ borderRadius: 18, overflow: 'hidden', aspectRatio: '4/5',
                background: t.isDark ? '#0D0D1A' : '#F0F0F6' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={seriesSlides[activeSlide]!} alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            </div>
          ) : (
            /* Single visual frame */
            <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden',
              background: t.isDark ? '#0D0D1A' : '#F0F0F6',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              ...(isPortrait ? { height: 320, width: Math.round(320 * 9 / 16), margin: '0 auto' }
                : isCarousel ? { aspectRatio: '4/5' }
                : { aspectRatio: '1/1', maxHeight: 320 }),
            }}>
              {isAnyGenerating && !generatedUrl ? (
                /* Skeleton loading */
                <div style={{ position: 'absolute', inset: 0,
                  background: `linear-gradient(90deg, ${t.isDark ? '#111' : '#e8e8ef'} 25%, ${t.isDark ? '#1a1a2e' : '#f4f4f8'} 50%, ${t.isDark ? '#111' : '#e8e8ef'} 75%)`,
                  backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }}>
                  <div style={{ position: 'absolute', bottom: 16, left: 0, right: 0,
                    textAlign: 'center', fontSize: 12, color: t.textMuted }}>
                    Görsel üretiliyor…
                  </div>
                </div>
              ) : generatedUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={generatedUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {/* Regenerate overlay — top right */}
                  <button onClick={() => setShowOverflowSheet(true)}
                    style={{ position: 'absolute', top: 10, right: 10, width: 32, height: 32,
                      borderRadius: '50%', border: 'none', cursor: 'pointer',
                      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1 4 1 10 7 10"/>
                      <path d="M3.51 15a9 9 0 1 0 .49-3.68"/>
                    </svg>
                  </button>
                  {/* Design label badge */}
                  {generateMode === 'brand' && agencyDesignLabel && (
                    <div style={{ position: 'absolute', top: 10, left: 10, padding: '3px 9px',
                      borderRadius: 20, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
                      fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>
                      {agencyDesignLabel}
                    </div>
                  )}
                </>
              ) : (
                /* Empty placeholder */
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 28, opacity: 0.2 }}>🖼</div>
                  <p style={{ fontSize: 12, color: t.textMuted, textAlign: 'center', margin: 0 }}>
                    Görsel henüz üretilmedi
                  </p>
                  {photoPickError && (
                    <p style={{ fontSize: 11, color: '#F87171', textAlign: 'center', margin: 0, maxWidth: 260 }}>
                      ⚠ {photoPickError}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={primaryGenerate}
                      style={{ padding: '8px 16px', borderRadius: 20, cursor: 'pointer', border: 'none',
                        background: `${fmtColor}22`, color: fmtColor, fontSize: 12, fontWeight: 700 }}>
                      📸 Fotoğraf Seç
                    </button>
                    <button onClick={() => setShowOverflowSheet(true)}
                      style={{ padding: '8px 14px', borderRadius: 20, cursor: 'pointer',
                        background: 'transparent', border: `0.5px solid ${t.separator}`,
                        color: t.textMuted, fontSize: 12, fontWeight: 600 }}>
                      Diğer ▾
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Remotion Story Önizleme ─────────────────────────────────────── */}
        {(fmtLower.includes('story') || fmtLower.includes('reel')) && (
          <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 14,
            background: 'rgba(77,112,136,0.07)', border: '0.5px solid rgba(77,112,136,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 13 }}>▶</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#4D7088' }}>Remotion Story</span>
              <span style={{ fontSize: 10, color: t.textMuted, marginLeft: 'auto' }}>
                Creative Director + Grafiker Review dahil
              </span>
            </div>
            <p style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.5, margin: '0 0 0' }}>
              Story ve Reel üretimi Remotion ile yapılıyor. Mission'ı onayladığında
              otomatik olarak Creative Director agent devreye girer, template seçer
              ve Grafiker Review ile kalite kontrolü yapar. Feed'de ★ skor ile görünür.
            </p>
          </div>
        )}

        {/* Kayıtlı şablonlar — yatay scroll */}
        {savedTemplates.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: t.textMuted,
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              ★ Kayıtlı Şablonlar
            </p>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
              {savedTemplates.slice(0, 8).map(tmpl => (
                <div key={tmpl.id} role="button" tabIndex={0}
                  onClick={() => {
                    if (tenantId) {
                      markRemotePostTemplateUsed(tenantId, tmpl.id)
                        .then(() => queryClient.invalidateQueries({ queryKey: ['brandPostTemplates', tenantId] }))
                        .catch(() => {});
                    }
                    if (tmpl.source === 'canvas' && tmpl.canvasStyleIdx !== undefined) {
                      setActiveCanvasTemplateStyle({
                        textEffect: tmpl.textEffect ?? postDesignDefaults.textEffect,
                        fontPreset: tmpl.fontPreset ?? postDesignDefaults.fontPreset,
                        accentColor: tmpl.accentColor ?? postDesignDefaults.accentColor ?? brandCtx?.brand_accent_color ?? '#ff2f8f',
                        logoPosition: tmpl.logoPosition ?? postDesignDefaults.logoPosition,
                      });
                      setCanvasStyleIdx(tmpl.canvasStyleIdx);
                      setTimeout(() => brandGenerateMutation.mutate(), 30);
                    } else if (tmpl.source === 'agency' && tmpl.agencyDesignSpec) {
                      setActiveCanvasTemplateStyle(null);
                      setAgencyDesigns([tmpl.agencyDesignSpec]);
                      setAgencyDesignIdx(0);
                      setTimeout(() => agencyDesignMutation.mutate(), 30);
                    }
                  }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click(); }}
                  style={{ flexShrink: 0, cursor: 'pointer', borderRadius: 10, overflow: 'hidden',
                    position: 'relative', width: isPortrait ? 44 : 68, height: isPortrait ? 68 : 44,
                    background: t.isDark ? '#1a1a2e' : '#e8e8f0', border: `0.5px solid ${t.separator}` }}>
                  {tmpl.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={tmpl.thumbnail} alt={tmpl.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                  {/* Delete span */}
                  <span role="button" tabIndex={0}
                    onClick={e => {
                      e.stopPropagation();
                      if (tenantId) {
                        deleteRemotePostTemplate(tenantId, tmpl.id)
                          .then((ok) => {
                            deleteDesignTemplate(tmpl.id, tenantId);
                            if (ok) queryClient.invalidateQueries({ queryKey: ['brandPostTemplates', tenantId] });
                            else setSavedTemplates(loadSavedTemplates(tenantId));
                          })
                          .catch(() => {
                            deleteDesignTemplate(tmpl.id, tenantId);
                            setSavedTemplates(loadSavedTemplates(tenantId));
                          });
                      } else {
                        deleteDesignTemplate(tmpl.id, tenantId);
                        setSavedTemplates(loadSavedTemplates(tenantId));
                      }
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); e.currentTarget.click(); } }}
                    style={{ position: 'absolute', top: 2, right: 2, width: 14, height: 14, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 10, color: '#fff', cursor: 'pointer', lineHeight: 1 }}>
                    ×
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tüm Formatlar sonuçları */}
        {allFormatsResult && (
          <div style={{ marginTop: 14, padding: '10px', borderRadius: 14,
            background: 'rgba(16,185,129,0.06)', border: '0.5px solid rgba(16,185,129,0.2)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#10B981',
              textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              ✓ Üretildi — Çıktılara kaydedildi
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { label: 'Post', url: allFormatsResult.post },
                { label: 'Story', url: allFormatsResult.story },
                { label: 'Slide 1', url: allFormatsResult.carousel?.[0] },
              ].filter(x => x.url).map(x => (
                <div key={x.label} style={{ flex: 1, textAlign: 'center' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={x.url!} alt={x.label} onClick={() => setGeneratedUrl(x.url!)}
                    style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover',
                      borderRadius: 8, marginBottom: 3, cursor: 'pointer' }} />
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>{x.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reel sonucu */}
        {reelUrl && (
          <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10,
            background: 'rgba(16,185,129,0.06)', border: '0.5px solid rgba(16,185,129,0.2)',
            fontSize: 11, color: '#10B981', textAlign: 'center', fontWeight: 600 }}>
            ✓ Reel üretildi — Çıktılara eklendi
          </div>
        )}

        {/* Etkinlik kartı üretiliyor */}
        {isGeneratingEventCard && (
          <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10,
            background: 'rgba(157,190,206,0.06)', border: '0.5px solid rgba(157,190,206,0.2)',
            display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
              border: '2px solid rgba(157,190,206,0.3)', borderTop: '2px solid #8AABBD',
              animation: 'spinSlow 0.8s linear infinite' }} />
            <span style={{ fontSize: 11, color: '#8AABBD', fontWeight: 600 }}>
              Etkinlik kartı üretiliyor — GPT-image-1 + SVG overlay...
            </span>
          </div>
        )}

        {/* Etkinlik kartı sonucu */}
        {eventCardUrl && (
          <div style={{ marginTop: 10, borderRadius: 14, overflow: 'hidden',
            border: '0.5px solid rgba(157,190,206,0.3)' }}>
            <img src={eventCardUrl} alt="Event card"
              style={{ width: '100%', display: 'block', borderRadius: 14 }} />
            <div style={{ padding: '8px 12px', background: 'rgba(157,190,206,0.06)',
              fontSize: 11, color: '#8AABBD', textAlign: 'center', fontWeight: 600 }}>
              ✓ Etkinlik kartı üretildi — Çıktılara eklendi
            </div>
          </div>
        )}

        {/* Etkinlik kartı hatası */}
        {eventCardError && (
          <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 10,
            background: 'rgba(239,68,68,0.06)', border: '0.5px solid rgba(239,68,68,0.2)',
            fontSize: 11, color: '#EF4444', fontWeight: 600 }}>
            ⚠ {eventCardError}
          </div>
        )}


        {/* ── Unused Gallery Photos → Caption Suggestions ─────────────── */}
        {Object.keys(galleryAnalysis).length > 0 && (
          <div style={{ marginTop: 14 }}>
            <button
              onClick={() => {
                setShowUnusedSection(s => !s);
                if (!showUnusedSection && unusedCaptionSuggestions.length === 0 && !isGeneratingUnusedCaptions) {
                  generateUnusedCaptions();
                }
              }}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 12,
                border: `0.5px solid ${t.separator}`, cursor: 'pointer',
                background: t.isDark ? 'rgba(138,171,189,0.06)' : 'rgba(138,171,189,0.04)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                color: t.textSecondary, fontSize: 12, fontWeight: 600,
              }}
            >
              <span>Kullanılmamış Görseller için İçerik Oluştur</span>
              <span style={{ fontSize: 10, transform: showUnusedSection ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                ▼
              </span>
            </button>

            {showUnusedSection && (
              <div style={{ marginTop: 8 }}>
                {isGeneratingUnusedCaptions && (
                  <div style={{ padding: '20px', textAlign: 'center', color: t.textMuted, fontSize: 11 }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%',
                      border: `2px solid ${t.separator}`, borderTop: '2px solid #8AABBD',
                      animation: 'spinSlow 0.8s linear infinite', margin: '0 auto 8px' }} />
                    AI görselleri analiz ediyor...
                  </div>
                )}

                {!isGeneratingUnusedCaptions && unusedCaptionSuggestions.length === 0 && (
                  <div style={{ padding: '14px', textAlign: 'center', color: t.textMuted, fontSize: 11,
                    background: t.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                    borderRadius: 10, border: `0.5px solid ${t.separator}` }}>
                    Tüm görseller zaten kullanılmış veya analiz verisi bulunamadı.
                  </div>
                )}

                {unusedCaptionSuggestions.map((suggestion, idx) => (
                  <div key={idx} style={{
                    marginBottom: 8, padding: '10px 12px', borderRadius: 12,
                    border: `0.5px solid ${t.separator}`,
                    background: t.isDark ? 'rgba(255,255,255,0.02)' : '#fff',
                  }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={suggestion.photoUrl} alt="" style={{
                        width: 52, height: 52, borderRadius: 8, objectFit: 'cover', flexShrink: 0,
                        border: `0.5px solid ${t.separator}`,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: t.textPrimary, margin: '0 0 3px' }}>
                          {suggestion.headline}
                        </p>
                        <p style={{ fontSize: 10, color: t.textSecondary, margin: 0, lineHeight: 1.4,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {suggestion.caption}
                        </p>
                        <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8,
                            background: 'rgba(138,171,189,0.1)', color: '#8AABBD', fontWeight: 600 }}>
                            {suggestion.contentType}
                          </span>
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8,
                            background: 'rgba(59,130,246,0.1)', color: '#3B82F6', fontWeight: 600 }}>
                            {suggestion.mood}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setGeneratedUrl(suggestion.photoUrl);
                          setGenerateMode('brand');
                          setCaptionOverride(suggestion.caption);
                          setHeadlineOverride(suggestion.headline);
                          setHashtagsOverride(suggestion.hashtags);
                        }}
                        style={{
                          flexShrink: 0, padding: '6px 10px', borderRadius: 8,
                          border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700,
                          background: 'linear-gradient(135deg, #8AABBDcc, #8AABBD88)',
                          color: '#fff',
                        }}
                      >
                        Kullan
                      </button>
                    </div>
                  </div>
                ))}

                {!isGeneratingUnusedCaptions && unusedCaptionSuggestions.length > 0 && (
                  <button
                    onClick={generateUnusedCaptions}
                    style={{
                      width: '100%', padding: '8px', borderRadius: 10,
                      border: `0.5px solid ${t.separator}`, cursor: 'pointer',
                      background: 'transparent', color: '#8AABBD',
                      fontSize: 11, fontWeight: 600, marginTop: 4,
                    }}
                  >
                    Yeniden Oluştur
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ STICKY ACTION BAR ════════════════════════════════════════════ */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '10px 0 0',
        background: t.isDark
          ? 'linear-gradient(to top, rgba(5,5,15,1) 70%, rgba(5,5,15,0) 100%)'
          : 'linear-gradient(to top, rgba(248,248,252,1) 70%, rgba(248,248,252,0) 100%)',
        zIndex: 20,
      }}>
        {/* Inline errors */}
        {reelError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
            padding: '7px 12px', borderRadius: 10,
            background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.25)' }}>
            <span style={{ fontSize: 11, color: '#F87171', flex: 1 }}>⚠ {reelError.slice(0, 80)}</span>
            <button onClick={generateReelVideo} style={{ fontSize: 11, color: '#F87171', fontWeight: 700,
              background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Tekrar dene</button>
            <button onClick={() => setReelError(null)} style={{ fontSize: 14, color: 'rgba(248,113,113,0.5)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
          </div>
        )}
        {saveError && (
          <div style={{ fontSize: 11, color: '#F87171', textAlign: 'center', marginBottom: 6 }}>
            ⚠ {saveError} — <button onClick={() => saveMutation.mutate()}
              style={{ color: '#F87171', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}>
              Tekrar dene
            </button>
          </div>
        )}

        {saved ? (
          <div style={{ padding: '14px', borderRadius: 16, textAlign: 'center',
            background: 'rgba(16,185,129,0.10)', color: '#10B981', fontSize: 14, fontWeight: 700 }}>
            ✓ Çıktılara Eklendi
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            {/* Primary: Üret */}
            <button onClick={primaryGenerate} disabled={isAnyGenerating}
              style={{
                flex: 2, padding: '14px 10px', borderRadius: 16, border: 'none',
                cursor: isAnyGenerating ? 'default' : 'pointer',
                background: isAnyGenerating
                  ? (t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)')
                  : `linear-gradient(135deg, ${fmtColor}dd, ${fmtColor}99)`,
                color: isAnyGenerating ? t.textMuted : '#fff',
                fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: isAnyGenerating ? 'none' : `0 3px 14px ${fmtColor}40`,
              }}>
              {isAnyGenerating
                ? <><div style={{ width: 13, height: 13, borderRadius: '50%',
                    border: `2px solid ${t.separator}`, borderTop: `2px solid ${fmtColor}`,
                    animation: 'spinSlow 0.8s linear infinite' }} />Üretiliyor…</>
                : generatedUrl ? 'Yeniden Üret' : (agentGalleryUrl || brandRefImages.length > 0) ? '📸 Fotoğraf Seç' : '🎨 AI ile Üret'
              }
            </button>

            {/* Secondary: Diğer seçenekler */}
            <button onClick={() => setShowOverflowSheet(true)} disabled={isAnyGenerating}
              style={{
                width: 48, height: 48, borderRadius: 16, border: `0.5px solid ${t.separator}`,
                cursor: 'pointer', background: 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                color: t.textSecondary, fontSize: 16, flexShrink: 0,
              }}>
              ⊞
            </button>

            {/* Save */}
            <button onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !generatedUrl}
              style={{
                flex: 2, padding: '14px 10px', borderRadius: 16, border: 'none',
                cursor: (saveMutation.isPending || !generatedUrl) ? 'default' : 'pointer',
                background: !generatedUrl
                  ? (t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)')
                  : saveMutation.isPending
                    ? 'rgba(16,185,129,0.12)'
                    : 'linear-gradient(135deg, #10B981cc, #10B98188)',
                color: !generatedUrl ? t.textMuted : '#fff',
                fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: (!generatedUrl || saveMutation.isPending) ? 'none' : '0 3px 14px rgba(16,185,129,0.35)',
              }}>
              {saveMutation.isPending
                ? <><div style={{ width: 13, height: 13, borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff',
                    animation: 'spinSlow 0.8s linear infinite' }} />Ekleniyor…</>
                : autoProducedArtifact
                  ? (generatedUrl ? 'Feed\'de Güncelle' : 'Feed\'de Güncelle')
                  : (!generatedUrl ? 'Çıktılara Ekle' : '✓ Çıktılara Ekle')
              }
            </button>
          </div>
        )}
      </div>

      {/* ═══ HASHTAG SHEET ════════════════════════════════════════════════ */}
      {showHashtagSheet && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end' }}
          onClick={() => setShowHashtagSheet(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', borderRadius: '20px 20px 0 0', padding: '20px 20px 32px',
            background: t.isDark ? '#0d0d1a' : '#fff',
            border: `0.5px solid ${t.separator}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>
                Hashtagler ({hashtags.length})
              </span>
              <button onClick={() => {
                copyText(hashtags.join(' '), 'all-hashtags');
              }} style={{ fontSize: 12, color: copiedKey === 'all-hashtags' ? '#10B981' : t.accent,
                fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>
                {copiedKey === 'all-hashtags' ? 'Kopyalandı ✓' : 'Tümünü kopyala'}
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {hashtags.map((h, i) => (
                <span key={i} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 20,
                  background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                  color: t.textSecondary, fontWeight: 500 }}>{h}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ OVERFLOW SHEET (Diğer formatlar) ════════════════════════════ */}
      {/* ── Event Card Modal ─────────────────────────────────────────────── */}
      {showEventModal && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 60,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end' }}
          onClick={() => setShowEventModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', borderRadius: '20px 20px 0 0', padding: '20px 20px 36px',
            background: t.isDark ? '#0d0d1a' : '#fff', border: `0.5px solid ${t.separator}`,
            maxHeight: '88dvh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: t.textPrimary }}>🎭 Etkinlik Kartı</div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>DJ · Konser · Lansman · Duyuru</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['story', 'post'] as const).map(ct => (
                  <button key={ct} onClick={() => setEventForm(f => ({ ...f, contentType: ct }))}
                    style={{ padding: '5px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                      background: eventForm.contentType === ct ? t.accent : 'transparent',
                      border: `0.5px solid ${eventForm.contentType === ct ? t.accent : t.separator}`,
                      color: eventForm.contentType === ct ? '#fff' : t.textMuted }}>
                    {ct === 'story' ? '9:16 Story' : '4:5 Post'}
                  </button>
                ))}
              </div>
            </div>

            {/* Arka plan foto + canlı önizleme */}
            {(() => {
              const bgPhoto = resolveEventCardPhotoUrl();
              const previewAspect = eventForm.contentType === 'story' ? '9/16' : '4/5';
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    {bgPhoto ? (
                      <>
                        <div style={{
                          width: 44, height: 56, borderRadius: 8, overflow: 'hidden',
                          border: `0.5px solid ${t.separator}`, flexShrink: 0,
                        }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={resolveBrowserImageSrc(bgPhoto)}
                            alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: t.textPrimary }}>Arka plan fotoğrafı</div>
                          <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>
                            {generatedUrl ? 'Üretilen görsel' : agentGalleryUrl ? 'Galeri eşleşmesi' : 'Marka galerisi'}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 11, color: '#F87171' }}>
                        Önizleme için önce &quot;Marka Fotoğrafı Seç&quot; veya görsel üretin.
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => void previewEventCard()}
                      disabled={!bgPhoto || !eventForm.eventName.trim() || eventPreviewLoading}
                      style={{
                        padding: '8px 12px', borderRadius: 10, border: 'none', cursor: bgPhoto ? 'pointer' : 'default',
                        background: bgPhoto && eventForm.eventName.trim() ? t.accent : 'rgba(157,190,206,0.25)',
                        color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0,
                        opacity: bgPhoto && eventForm.eventName.trim() ? 1 : 0.55,
                      }}
                    >
                      {eventPreviewLoading ? 'Önizleniyor…' : 'Canlı önizle'}
                    </button>
                  </div>

                  {eventPreviewError && (
                    <div style={{ fontSize: 10, color: '#F87171', marginBottom: 8 }}>{eventPreviewError}</div>
                  )}

                  {eventPreviewUrl && (
                    <div style={{
                      borderRadius: 14, overflow: 'hidden', border: `0.5px solid ${t.separator}`,
                      background: t.isDark ? '#0D0D1A' : '#F0F0F6',
                      maxWidth: eventForm.contentType === 'story' ? 180 : 220,
                      margin: '0 auto',
                    }}>
                      <div style={{ aspectRatio: previewAspect, position: 'relative' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={eventPreviewUrl} alt="Şablon önizlemesi"
                          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                      </div>
                      <div style={{ fontSize: 9, color: t.textMuted, textAlign: 'center', padding: '6px 8px' }}>
                        Seçili şablon + marka fotoğrafı · Sharp+SVG
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Form fields */}
            {[
              { key: 'artistName', label: 'Sanatçı / İsim', placeholder: 'DJ Shadow, The Weeknd, ...', required: false },
              { key: 'eventName', label: 'Etkinlik Adı', placeholder: 'Sensational, Summer Bash, ...', required: true },
              { key: 'date', label: 'Tarih', placeholder: 'WED 1 JULY / Çarşamba 1 Temmuz', required: false },
              { key: 'time', label: 'Saat', placeholder: '22:00 – 03:00', required: false },
              { key: 'venueArea', label: 'Mekan / Alan', placeholder: 'BEACH · TERRACE · POOLSIDE', required: false },
              { key: 'tagline', label: 'Tagline', placeholder: 'Be part of the night...', required: false },
            ].map(field => (
              <div key={field.key} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: t.textMuted, marginBottom: 4 }}>
                  {field.label}{field.required && <span style={{ color: '#EF4444' }}> *</span>}
                </div>
                <input
                  value={eventForm[field.key as keyof typeof eventForm] as string}
                  onChange={e => setEventForm(f => ({ ...f, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 10, outline: 'none',
                    background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    border: `0.5px solid ${t.separator}`, color: t.textPrimary, fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}

            <div style={{ marginBottom: 12 }}>
              {/* Smart use-case inference */}
              {(() => {
                const ideaAny = idea as Record<string, unknown> | undefined;
                const uc = inferAnnouncementUseCase({
                  strategicPurpose: (ideaAny?.strategic_purpose ?? ideaAny?.strategicPurpose) as string | undefined,
                  hasEventDetails: Boolean(eventForm.artistName || eventForm.date),
                });
                const ucLabel = uc === 'event' ? 'Etkinlik' : uc === 'campaign' ? 'Kampanya' : 'Duyuru';
                const sectorId = brandCtx?.industry ?? (brandCtx as { business_type?: string })?.business_type;
                const smartResult = smartSelectTemplate(
                  uc,
                  { headline, caption, mood: (ideaAny?.mood as string | undefined), hasEventDetails: Boolean(eventForm.artistName || eventForm.date) },
                  { sectorId: sectorId ?? undefined },
                );
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: t.textMuted }}>
                        Tasarım şablonu · 200+ ajans şablonu
                      </div>
                      <div style={{ fontSize: 9, padding: '2px 8px', borderRadius: 12, background: t.accentDim, color: t.accent, fontWeight: 700 }}>
                        {ucLabel}
                      </div>
                    </div>

                    {/* AI recommendation */}
                    {smartResult.templateId !== eventForm.templateId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEventForm((f) => ({ ...f, templateId: smartResult.templateId, resolvedUseCase: uc }));
                          recordTemplateUsage(smartResult.templateId, tenantId ?? undefined);
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 10,
                          border: `1px dashed ${t.accent}`,
                          background: t.accentDim,
                          color: t.accent,
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                          marginBottom: 8,
                          textAlign: 'left',
                        }}
                      >
                        AI Önerisi: {smartResult.reason} → uygula
                      </button>
                    )}

                    {/* Use-case quick switch */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      {(['event', 'campaign', 'announcement'] as AnnouncementUseCase[]).map((ucOpt) => {
                        const active = uc === ucOpt || eventForm.resolvedUseCase === ucOpt;
                        const label = ucOpt === 'event' ? 'Etkinlik' : ucOpt === 'campaign' ? 'Kampanya' : 'Duyuru';
                        return (
                          <button
                            key={ucOpt}
                            type="button"
                            onClick={() => {
                              const tplId = savedPrefs[ucOpt];
                              setEventForm((f) => ({ ...f, templateId: tplId, resolvedUseCase: ucOpt }));
                            }}
                            style={{
                              flex: 1,
                              padding: '5px 8px',
                              borderRadius: 8,
                              border: `0.5px solid ${active ? t.accent : t.separator}`,
                              background: active ? t.accentDim : 'transparent',
                              color: active ? t.accent : t.textMuted,
                              fontSize: 10,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                );
              })()}

              {/* Favorites row */}
              {(() => {
                const uc = eventForm.resolvedUseCase ?? 'event';
                const favs = getFavoriteTemplates(tenantId ?? undefined).filter((ft) => ft.useCases.includes(uc));
                if (favs.length === 0) return null;
                return (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: t.accent, marginBottom: 4 }}>★ FAVORİLERİNİZ</div>
                    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                      {favs.map((tmpl) => (
                        <button
                          key={tmpl.id}
                          type="button"
                          onClick={() => { setEventForm((f) => ({ ...f, templateId: tmpl.id })); recordTemplateUsage(tmpl.id, tenantId ?? undefined); }}
                          style={{
                            flex: '0 0 auto',
                            padding: '8px 12px',
                            borderRadius: 12,
                            cursor: 'pointer',
                            fontSize: 11,
                            fontWeight: 700,
                            background: eventForm.templateId === tmpl.id ? t.accentDim : 'transparent',
                            border: `1px solid ${eventForm.templateId === tmpl.id ? t.accent : '#FFD700'}`,
                            color: eventForm.templateId === tmpl.id ? t.accent : t.textMuted,
                          }}
                        >
                          ★ {tmpl.icon} {tmpl.nameTr}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Recent row */}
              {(() => {
                const uc = eventForm.resolvedUseCase ?? 'event';
                const recents = getRecentTemplates(tenantId ?? undefined).filter((rt) => rt.useCases.includes(uc)).slice(0, 4);
                if (recents.length === 0) return null;
                return (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: t.textMuted, marginBottom: 4 }}>SON KULLANILANLAR</div>
                    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                      {recents.map((tmpl) => (
                        <button
                          key={tmpl.id}
                          type="button"
                          onClick={() => { setEventForm((f) => ({ ...f, templateId: tmpl.id })); recordTemplateUsage(tmpl.id, tenantId ?? undefined); }}
                          style={{
                            flex: '0 0 auto',
                            padding: '8px 12px',
                            borderRadius: 12,
                            cursor: 'pointer',
                            fontSize: 11,
                            fontWeight: 600,
                            background: eventForm.templateId === tmpl.id ? t.accentDim : 'transparent',
                            border: `0.5px solid ${eventForm.templateId === tmpl.id ? t.accent : t.separator}`,
                            color: eventForm.templateId === tmpl.id ? t.accent : t.textMuted,
                          }}
                        >
                          {tmpl.icon} {tmpl.nameTr}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Sector recommendations — filtered by resolved use case */}
              <div style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: t.textMuted, marginBottom: 4 }}>SEKTÖR ÖNERİLERİ</div>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                  {sectorTemplatesForUseCase(
                    brandCtx?.industry ?? (brandCtx as { business_type?: string })?.business_type,
                    eventForm.resolvedUseCase ?? 'event',
                  ).map((tmpl) => (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => { setEventForm((f) => ({ ...f, templateId: tmpl.id })); recordTemplateUsage(tmpl.id, tenantId ?? undefined); }}
                      style={{
                        flex: '0 0 auto',
                        padding: '8px 12px',
                        borderRadius: 12,
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 700,
                        background: eventForm.templateId === tmpl.id ? t.accentDim : 'transparent',
                        border: `0.5px solid ${eventForm.templateId === tmpl.id ? t.accent : t.separator}`,
                        color: eventForm.templateId === tmpl.id ? t.accent : t.textMuted,
                      }}
                    >
                      {tmpl.icon} {tmpl.nameTr}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={eventForm.enhancePhoto}
                onChange={e => setEventForm(f => ({ ...f, enhancePhoto: e.target.checked }))}
              />
              <span style={{ fontSize: 11, color: t.textMuted }}>
                Premium renk grading (GPT-image) — opsiyonel, +~$0.04
              </span>
            </label>

            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button onClick={() => setShowEventModal(false)} style={{
                flex: 1, padding: '12px', borderRadius: 14, cursor: 'pointer',
                background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                border: 'none', color: t.textMuted, fontSize: 13, fontWeight: 600,
              }}>İptal</button>
              <button
                onClick={() => { generateEventCard(); setShowEventModal(false); }}
                disabled={!eventForm.eventName.trim()}
                style={{
                  flex: 2, padding: '12px', borderRadius: 14, cursor: eventForm.eventName.trim() ? 'pointer' : 'default',
                  background: eventForm.eventName.trim() ? t.accent : 'rgba(157,190,206,0.2)',
                  border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
                  opacity: eventForm.eventName.trim() ? 1 : 0.5,
                }}>
                🎭 Etkinlik Kartı Üret
              </button>
            </div>
          </div>
        </div>
      )}

      {showOverflowSheet && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end' }}
          onClick={() => setShowOverflowSheet(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', borderRadius: '20px 20px 0 0', padding: '20px 20px 32px',
            background: t.isDark ? '#0d0d1a' : '#fff',
            border: `0.5px solid ${t.separator}`,
          }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary, marginBottom: 4 }}>
              Gelişmiş Üretim
            </p>
            <p style={{ fontSize: 11, color: t.textMuted, marginBottom: 14, lineHeight: 1.4 }}>
              Otonom üretim dışında kalan manuel seçenekler. Günlük akış için &quot;Otonom&quot; modunu kullanın.
            </p>


            {/* ── Görsel seçenekler ── */}
            <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, paddingLeft: 4 }}>
              Görsel
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
              {([
                {
                  icon: '📸', label: 'Marka Fotoğrafı Seç', sub: 'Caption\'a uygun galeriden otomatik seç',
                  disabled: !brandRefImages.length,
                  action: () => { pickPhotoMutation.mutate(); setShowOverflowSheet(false); },
                },
                {
                  icon: `${CANVAS_STYLES[canvasStyleIdx % CANVAS_STYLES.length]!.icon}`, label: `Canvas: ${CANVAS_STYLES[canvasStyleIdx % CANVAS_STYLES.length]!.name}`,
                  sub: blocksCanvasOverlay
                    ? 'Galeri-only — auto-produce kullanın'
                    : 'Tipografi + marka fotoğrafı overlay',
                  disabled: !brandRefImages.length || blocksCanvasOverlay,
                  action: () => { brandGenerateMutation.mutate(); setShowOverflowSheet(false); },
                },
                {
                  icon: '✦', label: 'Ajans Tasarımı', sub: 'GPT-image-1 · Impact / Editorial / Minimal',
                  disabled: !brandRefImages.length,
                  action: () => { setAgencyDesigns([]); agencyDesignMutation.mutate(); setShowOverflowSheet(false); },
                },
              ] as { icon: string; label: string; sub: string; disabled: boolean; action: () => void }[]).map((item, i) => (
                <button key={i} onClick={item.disabled ? undefined : item.action} disabled={item.disabled}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 13, cursor: item.disabled ? 'default' : 'pointer', background: 'transparent', border: `0.5px solid ${item.disabled ? 'transparent' : t.separator}`, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', opacity: item.disabled ? 0.35 : 1 }}>
                  <span style={{ fontSize: 17, flexShrink: 0, width: 26, textAlign: 'center' }}>{item.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>{item.sub}</div>
                  </div>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={t.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ))}
            </div>

            {/* ── Format paketleri ── */}
            <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, paddingLeft: 4 }}>
              Format Paketi
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
              {([
                {
                  icon: '⚡', label: 'Tüm Formatları Üret', sub: 'Post + Story + Carousel aynı anda',
                  disabled: (!brandRefImages.length && !agentGalleryUrl) || isGeneratingAll,
                  action: () => { generateAllFormats(); setShowOverflowSheet(false); },
                },
                {
                  icon: '⊞', label: 'Story Serisi · 3 Slide', sub: 'Hook → Hikaye → CTA (min. 2 fotoğraf)',
                  disabled: brandRefImages.length < 2 || isGeneratingSeries,
                  action: () => { setSeriesSlides([]); generateSeries(); setShowOverflowSheet(false); },
                },
                {
                  icon: '🎭', label: 'Etkinlik Kartı', sub: 'DJ · konser · lansman · duyuru',
                  disabled: isGeneratingEventCard,
                  action: () => {
                    setEventForm(f => ({ ...f, eventName: f.eventName || headline.slice(0, 50), tagline: f.tagline || caption.slice(0, 60) }));
                    setShowEventModal(true);
                    setShowOverflowSheet(false);
                  },
                },
              ] as { icon: string; label: string; sub: string; disabled: boolean; action: () => void }[]).map((item, i) => (
                <button key={i} onClick={item.disabled ? undefined : item.action} disabled={item.disabled}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 13, cursor: item.disabled ? 'default' : 'pointer', background: 'transparent', border: `0.5px solid ${item.disabled ? 'transparent' : t.separator}`, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', opacity: item.disabled ? 0.35 : 1 }}>
                  <span style={{ fontSize: 17, flexShrink: 0, width: 26, textAlign: 'center' }}>{item.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>{item.sub}</div>
                  </div>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={t.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ))}
            </div>

            {/* ── Video / Reels ── */}
            <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, paddingLeft: 4 }}>
              Video · Reels
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {([
                {
                  icon: '▶',
                  label: brandRefImages.filter(isUsableReelPhotoUrl).length >= 2 ? 'Reel Üret (Montaj)' : 'Reel Üret',
                  sub: brandRefImages.filter(isUsableReelPhotoUrl).length >= 2
                    ? `${Math.min(brandRefImages.filter(isUsableReelPhotoUrl).length, 3)} foto → Runway montaj veya blend`
                    : 'Seçili fotoğraf → Runway video',
                  disabled: isGeneratingReel || isGeneratingMultiReel,
                  action: () => { generateReelVideo(); setShowOverflowSheet(false); },
                },
                ...(isPortrait ? [{
                  icon: '🎬', label: 'Ajans Story → Reel', sub: '3D logo story kartı → Runway gen4',
                  disabled: isGeneratingAgencyReel || isGeneratingReel || isGeneratingMultiReel,
                  action: () => { generateAgencyReel(); setShowOverflowSheet(false); },
                }] : []),
                ...(brandRefImages.filter(isUsableReelPhotoUrl).length >= 2 ? [{
                  icon: '🎞', label: 'Sıralı Montaj Reel', sub: '3 ayrı klip → FFmpeg birleştir · Runway',
                  disabled: isGeneratingMultiReel || isGeneratingReel || isGeneratingAgencyReel,
                  action: () => { generateMultiPhotoReel('sequential'); setShowOverflowSheet(false); },
                }] : []),
              ] as { icon: string; label: string; sub: string; disabled: boolean; action: () => void }[]).map((item, i) => (
                <button key={i} onClick={item.disabled ? undefined : item.action} disabled={item.disabled}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 13, cursor: item.disabled ? 'default' : 'pointer', background: 'transparent', border: `0.5px solid ${item.disabled ? 'transparent' : t.separator}`, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', opacity: item.disabled ? 0.35 : 1 }}>
                  <span style={{ fontSize: 17, flexShrink: 0, width: 26, textAlign: 'center' }}>{item.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>{item.sub}</div>
                  </div>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={t.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ))}
            </div>

            <button onClick={() => setShowOverflowSheet(false)} style={{
              width: '100%', marginTop: 14, padding: '13px', borderRadius: 14, cursor: 'pointer',
              background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
              border: 'none', color: t.textMuted, fontSize: 13, fontWeight: 600,
            }}>İptal</button>
          </div>
        </div>
      )}
    </div>
  );
}


// ── Main screen ───────────────────────────────────────────────────────────────

export function MissionContentFactory() {
  const { t } = useTheme();
  const tenantBrand = useTenantBrandContext();
  const { goBack, navigate } = useMobileStore();
  const { tenantId } = useWorkspaceStore();
  const queryClient = useQueryClient();

  // Read mission + node data from store (set before navigating here)
  const missionId    = useMobileStore(s => (s as any).missionContentMissionId as string | null);
  const nodeKey      = useMobileStore(s => (s as any).missionContentNodeKey as string | null);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [viewMode, setViewMode] = useState<'auto' | 'advanced'>('auto');

  const { data: prog } = useQuery({
    queryKey: ['mission-progress', missionId],
    queryFn: () => apiClient.getMissionProgress(tenantId, missionId!, { includePayload: true }),
    enabled: Boolean(missionId),
    staleTime: 60_000,
  });

  // Get company profile for image generation context
  const { data: profile } = useQuery({
    queryKey: ['company-profile'],
    queryFn: () => apiClient.getCompanyProfile(),
    staleTime: 5 * 60_000,
  });

  // Find the target node
  const node = prog?.nodes.find(n => n.node_key === nodeKey) ?? null;
  const mission = prog;

  // Get mission creative brief from strategy node
  const strategyNode = prog?.nodes.find(n => n.task_type === 'content_strategy');
  let missionBrief = '';
  const strategyPayload = nodeOutputObject(strategyNode);
  if (strategyPayload) {
    missionBrief = String(strategyPayload.mission_brief ?? strategyPayload.weekly_theme ?? '').trim();
  }

  const ideas = node
    ? (() => {
      const payloadIdeas = nodeOutputArray(node);
      return payloadIdeas.length > 0 ? payloadIdeas : parseIdeas(node.output_summary);
    })()
    : [];
  const visualDesignNode = prog?.nodes.find(
    (n) => n.task_type === 'visual_design_cards' && n.status === 'completed' && nodeHasOutput(n),
  );
  const missionDesignCards = useMemo(
    () => {
      const payloadCards = visualDesignNode ? nodeOutputArray(visualDesignNode) : [];
      return payloadCards.length > 0 ? payloadCards : parseIdeas(visualDesignNode?.output_summary ?? null);
    },
    [visualDesignNode],
  );

  // Brand context + gallery for AutoProductionFeed
  const { data: mainProductionSnapshot } = useQuery<ProductionBrandContextSnapshot | null>({
    queryKey: ['production-context-snapshot', tenantId],
    queryFn: () => apiClient.getProductionBrandContextSnapshot(tenantId),
    staleTime: 10 * 60_000,
    enabled: Boolean(tenantId),
  });
  const mainBrandCtx = productionSnapshotToLegacyBrandContext(mainProductionSnapshot);
  const mainGallery = mainProductionSnapshot?.galleryAnalysis ?? {};

  // Build full reference image pool for AutoProductionFeed (Python gallery — AI-analyzed).
  const allBrandImages = (() => {
    const ctxUrls = parseBrandReferenceUrls(mainBrandCtx?.reference_image_urls);
    const seen = new Set<string>();
    return ctxUrls.filter((u) => {
      const base = u.split('?')[0] as string;
      if (seen.has(base)) return false;
      seen.add(base);
      return true;
    }).map(upscaleCdnUrl).slice(0, 80);
  })();

  const referenceImageUrls = parseBrandReferenceUrls(mainBrandCtx?.reference_image_urls)
    .map(upscaleCdnUrl)
    .slice(0, 3);

  const canAutoProduce = ideas.length > 0 && (
    allBrandImages.length > 0
    || NON_VENUE_SECTORS.has((mainBrandCtx?.business_type ?? tenantBrand.businessType ?? 'general_business').toLowerCase())
  );

  const galleryProvisionedRef = useRef(false);
  useEffect(() => {
    if (!tenantId || galleryProvisionedRef.current) return;
    const hasStock = allBrandImages.some((u) =>
      u.includes('unsplash.com') || u.includes('pexels.com') || u.includes('pixabay.com'),
    );
    if (!hasStock) return;
    galleryProvisionedRef.current = true;
    fetch(`/api/brand-context/${tenantId}/provision-gallery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analyze: false, allowSynthetic: false }),
    })
      .then((r) => r.json())
      .then((d: { stockRemoved?: number }) => {
        if ((d.stockRemoved ?? 0) > 0) {
          queryClient.invalidateQueries({ queryKey: ['production-context-snapshot', tenantId] });
        }
      })
      .catch(() => { galleryProvisionedRef.current = false; });
  }, [tenantId, allBrandImages, queryClient]);

  useEffect(() => {
    setCurrentIdx(0);
    setSavedCount(0);
    setViewMode('auto');
  }, [missionId, nodeKey]);

  useEffect(() => {
    if (!canAutoProduce) setViewMode('advanced');
  }, [canAutoProduce]);

  if (!missionId || !nodeKey) {
    return (
      <div style={{ minHeight: '100dvh', background: t.bg, display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 32 }}>⚠</div>
        <div style={{ fontSize: 14, color: t.textMuted }}>Mission seçilmedi</div>
        <button onClick={goBack} style={{ padding: '10px 20px', borderRadius: 30,
          background: t.accentDim, border: `0.5px solid ${t.accentBorder}`,
          color: t.accent, cursor: 'pointer', fontSize: 13 }}>← Geri</button>
      </div>
    );
  }

  if (!prog) {
    return (
      <div style={{ minHeight: '100dvh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%',
          border: `3px solid ${t.separator}`, borderTop: `3px solid ${t.accent}`,
          animation: 'spinSlow 1s linear infinite' }} />
      </div>
    );
  }

  if (ideas.length === 0) {
    return (
      <div style={{ minHeight: '100dvh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 12, padding: '0 22px' }}>
        <div style={{ fontSize: 32 }}>📭</div>
        <div style={{ fontSize: 14, color: t.textMuted, textAlign: 'center' }}>
          Bu node için içerik fikri bulunamadı.{'\n'}
          Mission yeniden çalıştırılabilir.
        </div>
        <button onClick={goBack} style={{ padding: '10px 20px', borderRadius: 30,
          background: t.accentDim, border: `0.5px solid ${t.accentBorder}`,
          color: t.accent, cursor: 'pointer', fontSize: 13 }}>← Geri</button>
      </div>
    );
  }

  // ── Default: Otonom üretim ────────────────────────────────────────────────
  if (viewMode === 'auto' && canAutoProduce) {
    return (
      <AutoProductionFeed
        ideas={ideas}
        brandRefImages={allBrandImages}
        galleryAnalysis={mainGallery}
        productionSnapshot={mainProductionSnapshot}
        tenantId={tenantId}
        brandName={tenantBrand.brandName || profile?.brandName || ''}
        location={(mainBrandCtx as { location?: string } | undefined)?.location}
        logoUrl={mainBrandCtx?.logo_url ?? profile?.logoUrl ?? undefined}
        missionBrief={missionBrief}
        onClose={goBack}
        onAdvanced={() => setViewMode('advanced')}
        onApproved={() => setSavedCount(c => c + 1)}
        onViewOutputs={() => navigate('feed')}
        sector={mainBrandCtx?.business_type ?? mainBrandCtx?.industry ?? tenantBrand.sector}
        missionId={missionId}
        nodeKey={nodeKey}
        serverProductionOnly={Boolean(
          missionId
          && prog?.nodes?.some(
            (n) => n.task_type === 'content_ideation' && n.status === 'completed',
          ),
        )}
      />
    );
  }

  // ── Gelişmiş: manuel fikir bazlı düzenleme ───────────────────────────────
  return (
    <div style={{ minHeight: '100dvh', background: t.bg, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top,0px) + 14px) 22px 0',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button onClick={canAutoProduce ? () => setViewMode('auto') : goBack}
            style={{ ...t.backBtn, cursor: 'pointer',
            width: 34, height: 34, borderRadius: '50%', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
            ←
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: t.textPrimary,
              letterSpacing: '-0.02em' }}>
              Gelişmiş Düzenleme
            </div>
            <div style={{ fontSize: 12, color: t.textMuted }}>
              {ideas.length} fikir · {savedCount} eklendi · manuel üretim
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {canAutoProduce && (
              <button onClick={() => setViewMode('auto')}
                style={{ padding: '8px 14px', borderRadius: 20, cursor: 'pointer', border: 'none',
                  background: `linear-gradient(135deg, ${t.accent}dd, ${t.accent}99)`,
                  color: '#fff', fontSize: 12, fontWeight: 700,
                  boxShadow: `0 2px 10px ${t.accent}40` }}>
                ⚡ Otonom
              </button>
            )}
            {savedCount > 0 && (
              <button onClick={() => navigate('feed')}
                style={{ padding: '7px 14px', borderRadius: 20, cursor: 'pointer',
                  background: 'rgba(16,185,129,0.10)', border: '0.5px solid rgba(16,185,129,0.22)',
                  color: '#10B981', fontSize: 12, fontWeight: 700 }}>
                {savedCount} Feed →
              </button>
            )}
          </div>
        </div>

        {!canAutoProduce && (
          <div style={{ padding: '8px 12px', borderRadius: 10, marginBottom: 14,
            background: 'rgba(245,158,11,0.08)', border: '0.5px solid rgba(245,158,11,0.25)',
            fontSize: 12, color: '#F59E0B', lineHeight: 1.5 }}>
            Marka galerisi boş — otonom üretim için Brand Hub&apos;dan fotoğraf ekleyin.
          </div>
        )}

        {/* Mission brief pill */}
        {missionBrief && (
          <div style={{ padding: '8px 12px', borderRadius: 10, marginBottom: 14,
            background: t.accentDim, border: `0.5px solid ${t.accentBorder}`,
            fontSize: 12, color: t.accent, lineHeight: 1.5 }}>
            ✦ {missionBrief.slice(0, 120)}
          </div>
        )}

        {/* Idea selector dots */}
        {ideas.length > 1 && (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 16 }}>
            {ideas.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIdx(i)}
                style={{
                  width: i === currentIdx ? 20 : 7, height: 7, borderRadius: 4,
                  background: i === currentIdx ? t.accent : t.separator,
                  border: 'none', cursor: 'pointer', padding: 0,
                  transition: 'width 0.2s ease, background 0.2s ease',
                }} />
            ))}
          </div>
        )}
      </div>

      {/* Content card */}
      <div style={{
        flex: 1,
        padding: ideas.length > 1
          ? '0 22px calc(56px + env(safe-area-inset-bottom, 0px) + 8px + 56px + 20px)'
          : '0 22px calc(56px + env(safe-area-inset-bottom, 0px) + 24px)',
        overflowY: 'auto',
      }}>
        <IdeaCard
          key={currentIdx}
          idea={ideas[currentIdx]!}
          index={currentIdx}
          total={ideas.length}
          missionBrief={missionBrief}
          brandName={profile?.brandName}
          location={profile?.location}
          referenceImageUrls={referenceImageUrls}
          prefetchedAgencyDesigns={missionDesignCards}
          onSaved={() => setSavedCount(c => c + 1)}
        />
      </div>

      {/* Önceki/Sonraki */}
      {ideas.length > 1 && (
        <div style={{
          position: 'fixed',
          left: 22,
          right: 22,
          bottom: 'calc(56px + env(safe-area-inset-bottom, 0px) + 8px)',
          display: 'flex',
          gap: 10,
          zIndex: 110,
        }}>
          <button
            onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
            disabled={currentIdx === 0}
            style={{ flex: 1, padding: '14px', borderRadius: 16, cursor: currentIdx === 0 ? 'default' : 'pointer',
              background: t.isDark ? 'rgba(255,255,255,0.07)' : '#fff',
              border: `0.5px solid ${t.separator}`, color: currentIdx === 0 ? t.textMuted : t.textPrimary,
              fontSize: 14, fontWeight: 700, backdropFilter: 'blur(20px)' }}>
            ← Önceki
          </button>
          <button
            onClick={() => setCurrentIdx(i => Math.min(ideas.length - 1, i + 1))}
            disabled={currentIdx === ideas.length - 1}
            style={{ flex: 1, padding: '14px', borderRadius: 16, cursor: currentIdx === ideas.length - 1 ? 'default' : 'pointer',
              background: currentIdx === ideas.length - 1
                ? (t.isDark ? 'rgba(255,255,255,0.07)' : '#fff')
                : `linear-gradient(135deg, ${t.accent}cc, ${t.accent}88)`,
              border: `0.5px solid ${t.separator}`, color: currentIdx === ideas.length - 1 ? t.textMuted : '#fff',
              fontSize: 14, fontWeight: 700, backdropFilter: 'blur(20px)' }}>
            Sonraki →
          </button>
        </div>
      )}
    </div>
  );
}
