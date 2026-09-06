/**
 * Deterministic shell compose — gallery photo stays, type sits in layout boxes.
 *
 * JPEG replica is not used. Geometry comes from design_spec.layout
 * (or archetype seed). Multi-tenant: archetype + copy + colors only.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import satori from 'satori';
import { renderAsync } from '@resvg/resvg-js';
import sharp from '@/lib/sharp-runtime';
import { persistImageBuffer } from '@/lib/persist-enhanced-images';
import { fetchExternalImageBuffer } from '@/lib/external-image-fetch';
import { resolveExternalGalleryPhotoTarget } from '@/lib/media-url';
import { fontsForVibe, loadSatoriFontSet } from '@/lib/satori-fonts';
import type { TypographyVibe } from '@/types/brand-theme';
import {
  fitMissionCopyToLayout,
  type DesignSpecCopyFitResult,
} from '@/lib/design-spec-copy-fit';
import {
  hasUsableDesignSpecLayout,
  resolveDesignSpecLayout,
  type DesignSpecLayout,
  type DesignSpecPanelRole,
} from '@/lib/design-spec-layout';
import { hexToRgb, pickReadableTextColor } from '@/lib/local-typography-renderer';

export const DESIGN_SPEC_SHELL_ENGINE = 'design_spec_shell' as const;

export type ShellComposeMode = 'auto' | 'off' | 'only';

type SNode = {
  type: string;
  props: Record<string, unknown>;
};

export interface DesignSpecShellComposeInput {
  headline: string;
  subtitle?: string | null;
  brandColors: { primary: string; accent: string };
  vibe?: TypographyVibe | string | null;
  layout?: DesignSpecLayout | null;
  archetypeId?: string | null;
  format?: string | null;
  layoutPattern?: string | null;
  photoBuffer?: Buffer | null;
  photoUrl?: string | null;
  photoPath?: string | null;
  workspaceId?: string;
  persist?: boolean;
}

export interface DesignSpecShellComposeResult {
  buffer: Buffer;
  imageUrl: string | null;
  engine: typeof DESIGN_SPEC_SHELL_ENGINE;
  fit: DesignSpecCopyFitResult;
  layout: DesignSpecLayout;
}

function zonePx(
  zone: { x: number; y: number; width: number; height: number },
  canvasW: number,
  canvasH: number,
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.round(zone.x * canvasW),
    y: Math.round(zone.y * canvasH),
    width: Math.max(8, Math.round(zone.width * canvasW)),
    height: Math.max(8, Math.round(zone.height * canvasH)),
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(20,16,12,${alpha})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

export function panelFillForRole(
  role: DesignSpecPanelRole,
  colors: { primary: string; accent: string },
): string {
  switch (role) {
    case 'scrim':
      return 'rgba(12,10,8,0.40)';
    case 'frosted':
      return 'rgba(255,248,240,0.42)';
    case 'color_block':
      return hexToRgba(colors.primary, 0.90);
    case 'shape':
      return hexToRgba(colors.accent, 0.62);
    case 'banner':
      return hexToRgba(colors.primary, 0.84);
    case 'ticket':
      return hexToRgba(colors.primary, 0.92);
    case 'polaroid_frame':
      return 'rgba(255,252,247,0.94)';
    case 'wedge':
      return hexToRgba(colors.accent, 0.70);
    default:
      return 'rgba(12,10,8,0.36)';
  }
}

export function textColorForPanel(
  role: DesignSpecPanelRole,
  colors: { primary: string; accent: string },
): string {
  if (role === 'scrim' || role === 'wedge' || role === 'shape') return '#F4EFE6';
  if (role === 'frosted' || role === 'polaroid_frame') return pickReadableTextColor('#FFF8F0');
  return pickReadableTextColor(colors.primary);
}

/** Same box, extra wrap lines when a motto is longer than the seed maxLines. */
export function fitCopyIntoLayoutBoxes(
  layout: DesignSpecLayout,
  mission: { headline: string; subtitle?: string | null },
): { layout: DesignSpecLayout; fit: DesignSpecCopyFitResult } {
  let current = layout;
  let fit = fitMissionCopyToLayout(current, mission);
  let guard = 0;
  while (!fit.ok && fit.failReason === 'headline_overflow' && guard < 2) {
    current = {
      ...current,
      textSlots: current.textSlots.map((slot) => (
        slot.role === 'headline'
          ? { ...slot, maxLines: Math.min(3, slot.maxLines + 1) }
          : slot
      )),
    };
    fit = fitMissionCopyToLayout(current, mission);
    guard += 1;
  }
  return { layout: current, fit };
}

export function planDesignSpecShell(input: {
  layout: DesignSpecLayout;
  headline: string;
  subtitle?: string | null;
  brandColors: { primary: string; accent: string };
}): {
  canvas: { width: number; height: number };
  photo: { x: number; y: number; width: number; height: number };
  panels: Array<{ id: string; role: DesignSpecPanelRole; fill: string; box: ReturnType<typeof zonePx> }>;
  texts: Array<{
    role: string;
    lines: string[];
    fontSize: number;
    align: 'left' | 'center' | 'right';
    color: string;
    box: ReturnType<typeof zonePx>;
  }>;
  fit: DesignSpecCopyFitResult;
  layout: DesignSpecLayout;
} {
  const { layout, fit } = fitCopyIntoLayoutBoxes(input.layout, {
    headline: input.headline,
    subtitle: input.subtitle,
  });
  const { width, height } = layout.canvas;
  const headlineSlot = layout.textSlots.find((s) => s.role === 'headline');
  const covering = (role: DesignSpecPanelRole) => (
    layout.panels.find((p) => p.role === role)
    ?? layout.panels[0]
    ?? { id: 'scrim', role: 'scrim' as const, zone: { x: 0, y: 0, w: 1, h: 1 } }
  );
  const headlinePanel = covering('scrim');
  const subtitlePanel = layout.panels.find((p) => p.role === 'scrim' && p.id !== headlinePanel.id)
    ?? headlinePanel;

  return {
    canvas: { width, height },
    photo: zonePx(layout.photoSlot, width, height),
    panels: layout.panels.map((p) => ({
      id: p.id,
      role: p.role,
      fill: panelFillForRole(p.role, input.brandColors),
      box: zonePx(p.zone, width, height),
    })),
    texts: [
      fit.headline
        ? {
          role: 'headline',
          lines: fit.headline.fit.lines,
          fontSize: fit.headline.fit.fontSize,
          align: headlineSlot?.align ?? 'left',
          color: textColorForPanel(headlinePanel.role, input.brandColors),
          box: fit.headline.zonePx,
        }
        : null,
      fit.subtitle
        ? {
          role: 'subtitle',
          lines: fit.subtitle.fit.lines,
          fontSize: fit.subtitle.fit.fontSize,
          align: layout.textSlots.find((s) => s.role === 'subtitle')?.align ?? 'left',
          color: textColorForPanel(subtitlePanel.role, input.brandColors),
          box: fit.subtitle.zonePx,
        }
        : null,
    ].filter((row): row is NonNullable<typeof row> => Boolean(row)),
    fit,
    layout,
  };
}

function alignToFlex(align: 'left' | 'center' | 'right'): 'flex-start' | 'center' | 'flex-end' {
  if (align === 'center') return 'center';
  if (align === 'right') return 'flex-end';
  return 'flex-start';
}

function buildOverlayElement(
  plan: ReturnType<typeof planDesignSpecShell>,
  headingFont: string,
  bodyFont: string,
): SNode {
  const children: SNode[] = plan.panels.map((panel) => ({
    type: 'div',
    props: {
      style: {
        position: 'absolute',
        left: panel.box.x,
        top: panel.box.y,
        width: panel.box.width,
        height: panel.box.height,
        backgroundColor: panel.fill,
        display: 'flex',
      },
    },
  }));

  for (const text of plan.texts) {
    const family = text.role === 'headline' ? headingFont : bodyFont;
    children.push({
      type: 'div',
      props: {
        style: {
          position: 'absolute',
          left: text.box.x,
          top: text.box.y,
          width: text.box.width,
          height: text.box.height,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: alignToFlex(text.align),
        },
        children: text.lines.map((line) => ({
          type: 'div',
          props: {
            style: {
              display: 'flex',
              color: text.color,
              fontSize: text.fontSize,
              fontFamily: family,
              fontWeight: text.role === 'headline' ? 700 : 500,
              lineHeight: 1.15,
              letterSpacing: text.role === 'headline' ? '0.01em' : '0.02em',
            },
            children: line,
          },
        })),
      },
    });
  }

  return {
    type: 'div',
    props: {
      style: {
        width: plan.canvas.width,
        height: plan.canvas.height,
        position: 'relative',
        display: 'flex',
      },
      children,
    },
  };
}

async function loadPhotoBuffer(input: DesignSpecShellComposeInput): Promise<Buffer | null> {
  if (input.photoBuffer && input.photoBuffer.length > 32) return input.photoBuffer;
  if (input.photoPath) {
    try {
      return await readFile(input.photoPath);
    } catch {
      return null;
    }
  }
  const url = String(input.photoUrl ?? '').trim();
  if (!url) return null;
  const publicMatch = url.match(/\/(tmp-multi|tmp-sarnic|tmp-compare)\/([^/?#]+)/);
  if (publicMatch?.[1] && publicMatch[2]) {
    const folder = publicMatch[1];
    const file = publicMatch[2];
    const candidates = [
      path.resolve(process.cwd(), 'public', folder, file),
      path.resolve(process.cwd(), 'apps/web/public', folder, file),
    ];
    for (const disk of candidates) {
      try {
        return await readFile(disk);
      } catch {
        /* try next */
      }
    }
  }
  if (/127\.0\.0\.1|localhost/.test(url)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      /* fall through */
    }
  }
  const external = resolveExternalGalleryPhotoTarget(url);
  if (external) return fetchExternalImageBuffer(external, 20_000);
  return null;
}

export function resolveShellLayout(input: {
  layout?: DesignSpecLayout | null;
  archetypeId?: string | null;
  format?: string | null;
  layoutPattern?: string | null;
}): DesignSpecLayout | null {
  if (hasUsableDesignSpecLayout(input.layout)) return input.layout;
  return resolveDesignSpecLayout({
    archetypeId: input.archetypeId,
    format: input.format,
    layoutPattern: input.layoutPattern,
    pinMode: 'hard',
  });
}

export async function composeDesignSpecShell(
  input: DesignSpecShellComposeInput,
): Promise<DesignSpecShellComposeResult | null> {
  const layout = resolveShellLayout(input);
  if (!layout) return null;
  const photo = await loadPhotoBuffer(input);
  if (!photo) return null;

  const plan = planDesignSpecShell({
    layout,
    headline: input.headline,
    subtitle: input.subtitle,
    brandColors: input.brandColors,
  });
  if (!plan.fit.fittedHeadline.trim()) return null;

  const vibe = (input.vibe ?? 'minimal_modern') as TypographyVibe;
  const pair = fontsForVibe(vibe);
  const fonts = await loadSatoriFontSet([
    { name: pair.heading, weight: 700 },
    { name: pair.body, weight: 500 },
    { name: pair.body, weight: 400 },
  ]);
  if (fonts.length === 0) return null;

  const svg = await satori(
    buildOverlayElement(plan, pair.heading, pair.body) as Parameters<typeof satori>[0],
    {
      width: plan.canvas.width,
      height: plan.canvas.height,
      fonts,
    },
  );
  const overlay = await renderAsync(svg, {
    fitTo: { mode: 'width', value: plan.canvas.width },
  });
  const overlayPng = Buffer.from(overlay.asPng());

  const canvasBg = hexToRgb(input.brandColors.primary) ?? { r: 32, g: 24, b: 18 };
  const base = await sharp({
    create: {
      width: plan.canvas.width,
      height: plan.canvas.height,
      channels: 3,
      background: canvasBg,
    },
  }).jpeg({ quality: 92 }).toBuffer();

  const photoLayer = await sharp(photo)
    .rotate()
    .resize(plan.photo.width, plan.photo.height, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 92 })
    .toBuffer();

  const buffer = await sharp(base)
    .composite([
      { input: photoLayer, left: plan.photo.x, top: plan.photo.y },
      { input: overlayPng, left: 0, top: 0 },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();

  let imageUrl: string | null = null;
  if (input.persist && input.workspaceId) {
    imageUrl = await persistImageBuffer(buffer, input.workspaceId, 'image/jpeg');
  }

  return {
    buffer,
    imageUrl,
    engine: DESIGN_SPEC_SHELL_ENGINE,
    fit: plan.fit,
    layout: plan.layout,
  };
}
