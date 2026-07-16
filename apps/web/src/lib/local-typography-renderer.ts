/**
 * Local typography renderer — Satori → SVG → resvg PNG + sharp photo composite.
 *
 * Replaces expensive gpt-image / Ideogram typography edits for text-heavy design
 * slots with deterministic, pixel-accurate local rendering:
 *   real gallery photo (sharp cover-resize) + brand-colored panel & typography
 *   (Satori overlay) + optional logo badge → R2.
 *
 * Text is rendered by the font engine, so Turkish diacritics never garble and no
 * vision QA / retry loop is needed. On any failure the orchestrator returns
 * `null` so callers fall back to the existing gpt-image pipeline.
 *
 * Multi-tenant: every decision is driven by format, template type, layout hint,
 * vibe, and brand colors — never by tenant id or brand name.
 */

import satori from 'satori';
import { renderAsync } from '@resvg/resvg-js';
import type { TypographyVibe } from '@/types/brand-theme';
import { serverConfig } from '@/lib/server-config';
import { fetchExternalImageBuffer } from '@/lib/external-image-fetch';
import { persistImageBuffer } from '@/lib/persist-enhanced-images';
import sharp from '@/lib/sharp-runtime';
import { fontsForVibe, loadSatoriFontSet } from '@/lib/satori-fonts';
import { isLocalTypographyEnabledForBrand } from '@/lib/brand-production-engines';
import { LOCAL_TYPOGRAPHY_ROLES } from '@/lib/local-typography-meta';

export type LayoutFamily = 'bottom_panel' | 'split_panel' | 'photo_top';
export type SlotFormat = 'story' | 'post';

// Client-safe helpers live in local-typography-meta.ts; re-exported for server callers.
export { isSatoriTypographyMeta, LOCAL_TYPOGRAPHY_ROLES } from '@/lib/local-typography-meta';

/**
 * Single routing authority. `designed_post` (hero) and any reel role stay on the
 * expensive external pipeline and are intentionally NOT in the role set.
 */
export function shouldUseLocalTypography(
  slotRole: string | null | undefined,
  pipeline?: string | null,
  brandTheme?: Record<string, unknown> | null,
): boolean {
  if (!serverConfig.localTypography?.enabled) return false;
  if (!isLocalTypographyEnabledForBrand(brandTheme)) return false;
  const role = String(slotRole ?? '').trim();
  if (role && LOCAL_TYPOGRAPHY_ROLES.has(role)) return true;
  // Pipeline-level fallback for callers that only know the pipeline id.
  const p = String(pipeline ?? '').trim();
  if (p === 'fal_only_story' || p === 'fal_only_post') return true;
  return false;
}

// ── Color utilities (deterministic contrast QA — no vision LLM) ───────────────

const WARM_CREAM = '#F5EFE4';
const DEEP_INK = '#241f1a';

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = String(hex).trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(m)) {
    const r = parseInt(m[0]! + m[0]!, 16);
    const g = parseInt(m[1]! + m[1]!, 16);
    const b = parseInt(m[2]! + m[2]!, 16);
    return { r, g, b };
  }
  if (/^[0-9a-fA-F]{6}$/.test(m)) {
    return {
      r: parseInt(m.slice(0, 2), 16),
      g: parseInt(m.slice(2, 4), 16),
      b: parseInt(m.slice(4, 6), 16),
    };
  }
  return null;
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return (
    0.2126 * channelLuminance(rgb.r) +
    0.7152 * channelLuminance(rgb.g) +
    0.0722 * channelLuminance(rgb.b)
  );
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Pick cream or deep-ink text for a panel color, whichever passes WCAG AA best. */
export function pickReadableTextColor(panelHex: string): string {
  const creamContrast = contrastRatio(panelHex, WARM_CREAM);
  const inkContrast = contrastRatio(panelHex, DEEP_INK);
  return inkContrast >= creamContrast ? DEEP_INK : WARM_CREAM;
}

/** Text color for a light cream panel — brand primary if legible, else deep ink. */
function textOnCream(primary: string): string {
  return contrastRatio(primary, WARM_CREAM) >= 4.5 ? primary : DEEP_INK;
}

// ── Layout selection ──────────────────────────────────────────────────────────

export function formatForAspect(aspectRatio: string): SlotFormat {
  return aspectRatio === '9:16' ? 'story' : 'post';
}

export function selectLayoutFamily(input: {
  format: SlotFormat;
  layoutFamilyHint?: string | null;
  templateType?: string | null;
}): LayoutFamily {
  const hint = String(input.layoutFamilyHint ?? '').toLowerCase();
  const templateType = String(input.templateType ?? '').toLowerCase();

  if (input.format === 'story') return 'bottom_panel';

  if (hint.includes('split') || hint.includes('side')) return 'split_panel';
  if (hint.includes('photo_top') || hint.includes('top') || hint.includes('stacked')) {
    return 'photo_top';
  }
  // Announcement / promo / event templates read best as bold side blocks.
  if (/event|promo|campaign|announce|special/.test(templateType)) return 'split_panel';
  return 'photo_top';
}

export function resolveCanvasDimensions(aspectRatio: string): { width: number; height: number } {
  if (aspectRatio === '9:16') return { width: 1080, height: 1920 };
  if (aspectRatio === '1:1') return { width: 1080, height: 1080 };
  return { width: 1080, height: 1350 };
}

function headlineFontSize(headline: string, format: SlotFormat): number {
  const len = headline.trim().length;
  if (format === 'story') {
    if (len > 40) return 52;
    if (len > 26) return 64;
    if (len > 16) return 78;
    return 94;
  }
  if (len > 40) return 40;
  if (len > 26) return 48;
  if (len > 16) return 58;
  return 70;
}

// ── Satori overlay element builder (pure — testable without fonts) ────────────

type SatoriNode = {
  type: string;
  props: { style: Record<string, unknown>; children?: unknown };
} | null;

export interface OverlayContent {
  family: LayoutFamily;
  format: SlotFormat;
  headline: string;
  subtitle?: string;
  overline: string;
  headingFontFamily: string;
  bodyFontFamily: string;
  panelColor: string;
  textColor: string;
  accentColor: string;
}

/**
 * Locale-aware uppercase: Turkish copy needs the dotted-İ mapping (i→İ, ı→I),
 * but tr-TR would corrupt English ("MISSION"→"MİSSİON"). The overline alone may
 * lack Turkish-specific letters ("Yeni Hasat"), so callers pass the slot's full
 * copy as the language signal.
 */
export function displayUppercase(text: string, languageSignal?: string): string {
  const sample = `${text} ${languageSignal ?? ''}`;
  return /[çğıİöşüÇĞÖŞÜ]/.test(sample) ? text.toLocaleUpperCase('tr-TR') : text.toUpperCase();
}

function overlineNode(content: OverlayContent): SatoriNode {
  if (!content.overline) return null;
  return {
    type: 'div',
    props: {
      style: {
        fontFamily: content.bodyFontFamily,
        fontWeight: 600,
        fontSize: content.format === 'story' ? 26 : 22,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        color: content.accentColor,
        display: 'flex',
      },
      children: displayUppercase(
        content.overline,
        `${content.headline} ${content.subtitle ?? ''}`,
      ).slice(0, 42),
    },
  };
}

function headlineNode(content: OverlayContent): SatoriNode {
  return {
    type: 'div',
    props: {
      style: {
        fontFamily: content.headingFontFamily,
        fontWeight: 800,
        fontSize: headlineFontSize(content.headline, content.format),
        lineHeight: 1.04,
        letterSpacing: '-0.02em',
        color: content.textColor,
        display: 'flex',
      },
      children: content.headline.trim(),
    },
  };
}

function accentDivider(content: OverlayContent): SatoriNode {
  return {
    type: 'div',
    props: {
      style: {
        width: 84,
        height: 6,
        borderRadius: 3,
        background: content.accentColor,
        display: 'flex',
      },
    },
  };
}

function subtitleNode(content: OverlayContent): SatoriNode {
  const text = content.subtitle?.trim();
  if (!text) return null;
  return {
    type: 'div',
    props: {
      style: {
        fontFamily: content.bodyFontFamily,
        fontWeight: 500,
        fontSize: content.format === 'story' ? 34 : 28,
        lineHeight: 1.3,
        color: content.textColor,
        opacity: 0.88,
        display: 'flex',
      },
      children: text.slice(0, 120),
    },
  };
}

function textStack(content: OverlayContent, align: 'flex-start' | 'center') {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: align,
        gap: 20,
      },
      children: [
        overlineNode(content),
        headlineNode(content),
        accentDivider(content),
        subtitleNode(content),
      ].filter(Boolean),
    },
  };
}

/**
 * Build the transparent-background overlay tree. The photo is composited by
 * sharp underneath, so all non-panel regions stay transparent.
 */
export function buildOverlayElement(content: OverlayContent) {
  if (content.family === 'split_panel') {
    return {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'row',
          background: 'transparent',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                width: '42%',
                height: '100%',
                background: content.panelColor,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: 64,
              },
              children: [textStack(content, 'flex-start')],
            },
          },
        ],
      },
    };
  }

  const panelHeight = content.family === 'bottom_panel' ? '36%' : '38%';
  return {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        background: 'transparent',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              width: '100%',
              height: panelHeight,
              background: content.panelColor,
              borderTop: `6px solid ${content.accentColor}`,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: content.format === 'story' ? 72 : 60,
            },
            children: [textStack(content, 'flex-start')],
          },
        },
      ],
    },
  };
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export interface LocalTypographyInput {
  workspaceId: string;
  headline: string;
  subtitle?: string;
  brandName: string;
  brandColors: { primary: string; accent: string };
  vibe: TypographyVibe | null;
  aspectRatio: '9:16' | '4:5' | '1:1';
  referencePhotoUrl: string;
  logoUrl?: string;
  sector?: string;
  occasion?: { name: string; mood?: string } | null;
  layoutFamilyHint?: string | null;
  templateType?: string | null;
  slotRole?: string;
}

export interface LocalTypographyResult {
  imageUrl: string;
  typographyModel: 'satori_local';
  grafikerScore: null;
  grafikerPass: true;
  layoutFamily: LayoutFamily;
  resolvedHeadline: string;
}

/** Resolve panel + text + accent colors for a layout family (deterministic QA). */
export function resolvePanelColors(
  family: LayoutFamily,
  brandColors: { primary: string; accent: string },
): { panelColor: string; textColor: string; accentColor: string } {
  const primary = hexToRgb(brandColors.primary) ? brandColors.primary : '#1f2a30';
  const accent = hexToRgb(brandColors.accent) ? brandColors.accent : '#c9813f';

  if (family === 'split_panel') {
    // Solid brand color block — pick a readable cream/ink for the text.
    const textColor = pickReadableTextColor(primary);
    // Accent must read against the panel too; fall back to the text color.
    const accentColor = contrastRatio(accent, primary) >= 2.2 ? accent : textColor;
    return { panelColor: primary, textColor, accentColor };
  }

  // Warm cream panel — brand primary text when legible, accent divider from brand.
  const textColor = textOnCream(primary);
  const accentColor = contrastRatio(accent, WARM_CREAM) >= 2.2 ? accent : primary;
  return { panelColor: WARM_CREAM, textColor, accentColor };
}

async function compositeLogoBadge(
  baseBuffer: Buffer,
  logoUrl: string | undefined,
  dims: { width: number; height: number },
): Promise<Buffer> {
  if (!logoUrl) return baseBuffer;
  try {
    const logoBuf = await fetchExternalImageBuffer(logoUrl, 12_000);
    if (!logoBuf) return baseBuffer;
    const badgeWidth = Math.round(dims.width * 0.16);
    const logo = await sharp(logoBuf)
      .resize(badgeWidth, badgeWidth, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    const pad = Math.round(dims.width * 0.05);
    return await sharp(baseBuffer)
      .composite([{ input: logo, top: pad, left: pad }])
      .jpeg({ quality: 92 })
      .toBuffer();
  } catch {
    return baseBuffer;
  }
}

/**
 * Render a text-heavy design still locally. Returns `null` on any failure so the
 * caller can fall back to the existing gpt-image / Ideogram pipeline.
 */
export async function renderLocalTypography(
  input: LocalTypographyInput,
): Promise<LocalTypographyResult | null> {
  const headline = input.headline?.trim();
  if (!headline || !input.referencePhotoUrl) return null;

  try {
    const dims = resolveCanvasDimensions(input.aspectRatio);
    const format = formatForAspect(input.aspectRatio);
    const family = selectLayoutFamily({
      format,
      layoutFamilyHint: input.layoutFamilyHint,
      templateType: input.templateType,
    });

    const photoBuf = await fetchExternalImageBuffer(input.referencePhotoUrl, 20_000);
    if (!photoBuf || photoBuf.length < 100) return null;

    const base = await sharp(photoBuf)
      .resize(dims.width, dims.height, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 90 })
      .toBuffer();

    const { heading, body } = fontsForVibe(input.vibe);
    const fonts = await loadSatoriFontSet([
      { name: heading, weight: 800 },
      { name: heading, weight: 700 },
      { name: body, weight: 600 },
      { name: body, weight: 500 },
      { name: body, weight: 400 },
    ]);
    if (fonts.length === 0) return null;

    const colors = resolvePanelColors(family, input.brandColors);
    const content: OverlayContent = {
      family,
      format,
      headline,
      subtitle: input.subtitle,
      overline: input.occasion?.name?.trim() || input.brandName?.trim() || '',
      headingFontFamily: heading,
      bodyFontFamily: body,
      ...colors,
    };

    const element = buildOverlayElement(content);
    const svg = await satori(element as Parameters<typeof satori>[0], {
      width: dims.width,
      height: dims.height,
      fonts,
    });
    const png = await renderAsync(svg, { fitTo: { mode: 'width', value: dims.width } });
    const overlayPng = Buffer.from(png.asPng());

    let composite = await sharp(base)
      .composite([{ input: overlayPng, top: 0, left: 0 }])
      .jpeg({ quality: 92 })
      .toBuffer();
    composite = await compositeLogoBadge(composite, input.logoUrl, dims);

    const imageUrl = await persistImageBuffer(composite, input.workspaceId, 'image/jpeg');
    if (!imageUrl) return null;

    console.log(
      `[local-typography] rendered ${family} ${input.aspectRatio} ` +
        `vibe=${input.vibe ?? 'default'} role=${input.slotRole ?? '-'} "${headline.slice(0, 40)}"`,
    );

    return {
      imageUrl,
      typographyModel: 'satori_local',
      grafikerScore: null,
      grafikerPass: true,
      layoutFamily: family,
      resolvedHeadline: headline,
    };
  } catch (err) {
    console.warn(
      '[local-typography] render failed, falling back:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
