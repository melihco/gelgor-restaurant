/**
 * Deterministic Canva-grade geometric composer (Satori).
 *
 * Brand color canvas + photo in geometric mask + sharp type/craft.
 * Marketing type is NEVER painted by GPT Image on this path.
 */

import satori from 'satori';
import { renderAsync } from '@resvg/resvg-js';
import sharp from '@/lib/sharp-runtime';
import { persistImageBuffer } from '@/lib/persist-enhanced-images';
import { fetchExternalImageBuffer } from '@/lib/external-image-fetch';
import { resolveExternalGalleryPhotoTarget } from '@/lib/media-url';
import { fontsForVibe, loadSatoriFontSet } from '@/lib/satori-fonts';
import type { TypographyVibe } from '@/types/brand-theme';
import {
  getGeometricShell,
  resolveGeometricCanvasColor,
  resolveGeometricShell,
  type GeometricShellContract,
  type GeometricShellId,
} from '@/lib/canva-geometric-layouts';
import type { SlotLookKind } from '@/lib/slot-look-directive';

export type GeometricComposeInput = {
  workspaceId: string;
  headline: string;
  subtitle?: string | null;
  cta?: string | null;
  brandName: string;
  brandColors: { primary: string; accent: string };
  vibe?: TypographyVibe | string | null;
  aspectRatio: '9:16' | '4:5' | '1:1';
  referencePhotoUrl: string;
  logoUrl?: string | null;
  catalogSlotKey?: string | null;
  slotLook?: SlotLookKind | null;
  announcementType?: string | null;
  /** Force a shell id (tests / smoke). */
  shellId?: GeometricShellId | null;
};

export type GeometricComposeResult = {
  imageUrl: string;
  shellId: GeometricShellId;
  typographyModel: 'satori_geometric';
  falDesignEngine: 'satori_geometric';
};

function mediaProxyKeyFromUrl(url: string): string | null {
  try {
    const u = new URL(url, 'http://local');
    if (!u.pathname.includes('/api/media')) return null;
    const key = u.searchParams.get('key');
    return key?.trim() || null;
  } catch {
    return null;
  }
}

async function fetchPhotoBuffer(url: string): Promise<Buffer | null> {
  const key = mediaProxyKeyFromUrl(url);
  if (key) {
    const { readR2ObjectBuffer } = await import('@/lib/r2-storage');
    const buf = await readR2ObjectBuffer(key);
    if (buf) return buf;
  }
  // Local public files (dev smoke)
  if (/\/tmp-sarnic\//.test(url) || url.includes('127.0.0.1') || url.includes('localhost')) {
    try {
      const res = await fetch(url);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch { /* fall through */ }
  }
  const external = resolveExternalGalleryPhotoTarget(url);
  if (external) return fetchExternalImageBuffer(external, 20_000);
  return null;
}

function canvasDims(aspect: GeometricComposeInput['aspectRatio']): { width: number; height: number } {
  if (aspect === '9:16') return { width: 1080, height: 1920 };
  if (aspect === '1:1') return { width: 1080, height: 1080 };
  return { width: 1080, height: 1350 };
}

function photoBorderRadius(shell: GeometricShellContract, photoH: number): number | string {
  switch (shell.photoMask) {
    case 'circle':
      return '50%';
    case 'arch':
      // Tall arch: large top radii
      return `${Math.round(photoH * 0.48)}px ${Math.round(photoH * 0.48)}px 0 0`;
    case 'rounded_rect':
      return 28;
    case 'rect':
    default:
      return 0;
  }
}

type SNode = {
  type: string;
  props: Record<string, unknown>;
};

function textNode(
  text: string,
  style: Record<string, unknown>,
): SNode {
  return { type: 'div', props: { style, children: text } };
}

function buildGeometricElement(input: {
  shell: GeometricShellContract;
  dims: { width: number; height: number };
  photoDataUrl: string;
  headline: string;
  subtitle: string;
  cta: string;
  brandName: string;
  colors: { canvas: string; ink: string; accent: string; cream: string };
  headingFont: string;
  bodyFont: string;
}): SNode {
  const { shell, dims, colors } = input;
  const pz = shell.photoZone;
  const photoW = Math.round(pz.w * dims.width);
  const photoH = Math.round(pz.h * dims.height);
  const photoLeft = Math.round(pz.x * dims.width);
  const photoTop = Math.round(pz.y * dims.height);
  const radius = photoBorderRadius(shell, photoH);
  const pad = Math.round(dims.width * 0.08);

  const photoFrame: SNode = {
    type: 'div',
    props: {
      style: {
        position: 'absolute',
        left: photoLeft,
        top: photoTop,
        width: photoW,
        height: photoH,
        borderRadius: radius,
        overflow: 'hidden',
        border: shell.photoMask === 'rect' && shell.id !== 'editorial_overlap_card'
          ? undefined
          : `6px solid ${colors.cream}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      },
      children: [{
        type: 'img',
        props: {
          src: input.photoDataUrl,
          width: photoW,
          height: photoH,
          style: {
            width: photoW,
            height: photoH,
            objectFit: 'cover',
            borderRadius: radius,
          },
        },
      }],
    },
  };

  const children: SNode[] = [photoFrame];

  // Accent triangle chip (circle lockup / badge)
  if (shell.showOverlappingBadge) {
    children.push({
      type: 'div',
      props: {
        style: {
          position: 'absolute',
          left: Math.round(dims.width * 0.08),
          top: Math.round(dims.height * (shell.id === 'badge_overlap_offer' ? 0.1 : 0.48)),
          background: colors.accent,
          padding: '14px 22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
        children: [
          textNode(
            (input.cta || input.subtitle || 'NEW').toUpperCase().slice(0, 18),
            {
              fontFamily: input.bodyFont,
              fontSize: 22,
              fontWeight: 700,
              color: colors.ink === colors.cream ? colors.cream : '#1A1A1A',
              letterSpacing: 2,
            },
          ),
        ],
      },
    });
  }

  // Vertical eyebrow
  if (shell.showVerticalEyebrow) {
    children.push({
      type: 'div',
      props: {
        style: {
          position: 'absolute',
          left: Math.round(dims.width * 0.04),
          top: Math.round(dims.height * 0.22),
          width: 36,
          height: Math.round(dims.height * 0.35),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
        children: [
          textNode(
            (input.subtitle || input.brandName).toUpperCase().slice(0, 16),
            {
              fontFamily: input.bodyFont,
              fontSize: 18,
              fontWeight: 600,
              color: colors.ink,
              letterSpacing: 4,
              transform: 'rotate(-90deg)',
              whiteSpace: 'nowrap',
            },
          ),
        ],
      },
    });
  }

  // Type block
  const typeBlock = buildTypeBlock(input, pad, photoTop, photoH);
  children.push(typeBlock);

  // Thin accent rule under headline area (always — craft beat)
  if (shell.typePlacement !== 'overlap_card') {
    const ruleTop = shell.typePlacement === 'top_band'
      ? Math.round(dims.height * 0.28)
      : Math.round(photoTop + photoH + dims.height * 0.04);
    children.push({
      type: 'div',
      props: {
        style: {
          position: 'absolute',
          left: pad,
          top: ruleTop,
          width: Math.round(dims.width * 0.22),
          height: 3,
          background: colors.accent,
        },
        children: '',
      },
    });
  }

  return {
    type: 'div',
    props: {
      style: {
        width: dims.width,
        height: dims.height,
        background: colors.canvas,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      },
      children,
    },
  };
}

function buildTypeBlock(
  input: {
    shell: GeometricShellContract;
    dims: { width: number; height: number };
    headline: string;
    subtitle: string;
    cta: string;
    brandName: string;
    colors: { canvas: string; ink: string; accent: string; cream: string };
    headingFont: string;
    bodyFont: string;
  },
  pad: number,
  photoTop: number,
  photoH: number,
): SNode {
  const { shell, dims, colors } = input;
  const headlineSize = dims.height >= 1800 ? 72 : 64;

  if (shell.typePlacement === 'top_band') {
    return {
      type: 'div',
      props: {
        style: {
          position: 'absolute',
          left: pad,
          top: Math.round(dims.height * 0.08),
          width: dims.width - pad * 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        },
        children: [
          textNode(input.subtitle.toUpperCase().slice(0, 28) || input.brandName.toUpperCase(), {
            fontFamily: input.bodyFont,
            fontSize: 20,
            fontWeight: 600,
            color: colors.ink,
            letterSpacing: 3,
          }),
          textNode(input.headline, {
            fontFamily: input.headingFont,
            fontSize: headlineSize,
            fontWeight: 800,
            color: colors.ink,
            lineHeight: 1.05,
          }),
          textNode(input.cta || 'DM', {
            fontFamily: input.bodyFont,
            fontSize: 24,
            fontWeight: 600,
            color: colors.ink,
            letterSpacing: 2,
            marginTop: 8,
          }),
        ],
      },
    };
  }

  if (shell.typePlacement === 'overlap_card') {
    return {
      type: 'div',
      props: {
        style: {
          position: 'absolute',
          left: pad,
          top: Math.round(photoTop + photoH * 0.55),
          width: Math.round(dims.width * 0.62),
          background: 'rgba(245, 239, 228, 0.94)',
          padding: '28px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          borderLeft: `4px solid ${colors.accent}`,
        },
        children: [
          textNode(input.headline, {
            fontFamily: input.headingFont,
            fontSize: Math.round(headlineSize * 0.85),
            fontWeight: 800,
            color: '#1A1A1A',
            lineHeight: 1.1,
          }),
          textNode(input.subtitle || input.cta || '', {
            fontFamily: input.bodyFont,
            fontSize: 22,
            fontWeight: 500,
            color: '#333333',
          }),
          {
            type: 'div',
            props: {
              style: { width: 48, height: 3, background: colors.accent, marginTop: 6 },
              children: '',
            },
          },
        ],
      },
    };
  }

  // below_photo / beside_photo
  return {
    type: 'div',
    props: {
      style: {
        position: 'absolute',
        left: pad,
        top: Math.round(photoTop + photoH + dims.height * 0.05),
        width: dims.width - pad * 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      },
      children: [
        textNode(input.subtitle.toUpperCase().slice(0, 32) || input.brandName.toUpperCase().slice(0, 24), {
          fontFamily: input.bodyFont,
          fontSize: 18,
          fontWeight: 600,
          color: colors.ink,
          letterSpacing: 3,
          opacity: 0.85,
        }),
        textNode(input.headline, {
          fontFamily: input.headingFont,
          fontSize: headlineSize,
          fontWeight: 800,
          color: colors.ink,
          lineHeight: 1.05,
        }),
        textNode((input.cta || 'DM').toUpperCase(), {
          fontFamily: input.bodyFont,
          fontSize: 22,
          fontWeight: 600,
          color: colors.ink,
          letterSpacing: 3,
          marginTop: 6,
        }),
      ],
    },
  };
}

/**
 * Render a geometric Canva-grade designed post. Returns null on failure
 * (caller may fall back — production prefers withhold over caption-on-photo).
 */
export async function renderGeometricDesignedPost(
  input: GeometricComposeInput,
): Promise<GeometricComposeResult | null> {
  const headline = input.headline?.trim();
  if (!headline || !input.referencePhotoUrl?.trim()) return null;

  try {
    const format = input.aspectRatio === '9:16' ? 'story' : 'post';
    const shell = input.shellId
      ? getGeometricShell(input.shellId)
      : resolveGeometricShell({
        catalogSlotKey: input.catalogSlotKey,
        slotLook: input.slotLook,
        format,
        headline,
        announcementType: input.announcementType,
      });

    const dims = canvasDims(input.aspectRatio);
    const colors = resolveGeometricCanvasColor(shell, input.brandColors);

    const photoBuf = await fetchPhotoBuffer(input.referencePhotoUrl);
    if (!photoBuf || photoBuf.length < 100) {
      console.warn('[geometric-compose] photo unreachable', input.referencePhotoUrl.slice(0, 80));
      return null;
    }

    const pz = shell.photoZone;
    const photoW = Math.round(pz.w * dims.width);
    const photoH = Math.round(pz.h * dims.height);
    const cropped = await sharp(photoBuf)
      .resize(photoW, photoH, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 90 })
      .toBuffer();
    const photoDataUrl = `data:image/jpeg;base64,${cropped.toString('base64')}`;

    const vibe = (input.vibe as TypographyVibe | null) ?? 'editorial_serif';
    const { heading, body } = fontsForVibe(vibe);
    const fonts = await loadSatoriFontSet([
      { name: heading, weight: 800 },
      { name: heading, weight: 700 },
      { name: body, weight: 600 },
      { name: body, weight: 500 },
      { name: body, weight: 400 },
    ]);
    if (fonts.length === 0) return null;

    const element = buildGeometricElement({
      shell,
      dims,
      photoDataUrl,
      headline: headline.slice(0, 48),
      subtitle: String(input.subtitle ?? '').trim().slice(0, 40),
      cta: String(input.cta ?? '').trim().slice(0, 24),
      brandName: input.brandName,
      colors,
      headingFont: heading,
      bodyFont: body,
    });

    const svg = await satori(element as Parameters<typeof satori>[0], {
      width: dims.width,
      height: dims.height,
      fonts,
    });
    const png = await renderAsync(svg, { fitTo: { mode: 'width', value: dims.width } });
    let out = Buffer.from(png.asPng());

    // Logo badge bottom-right
    if (input.logoUrl?.trim()) {
      try {
        const logoBuf = await fetchPhotoBuffer(input.logoUrl.trim());
        if (logoBuf && logoBuf.length > 40) {
          const logoSize = Math.round(dims.width * 0.12);
          const logoResized = await sharp(logoBuf)
            .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer();
          out = await sharp(out)
            .composite([{
              input: logoResized,
              top: dims.height - logoSize - Math.round(dims.height * 0.04),
              left: dims.width - logoSize - Math.round(dims.width * 0.06),
            }])
            .png()
            .toBuffer();
        }
      } catch { /* logo optional */ }
    }

    const jpeg = await sharp(out).jpeg({ quality: 92 }).toBuffer();
    const imageUrl = await persistImageBuffer(jpeg, input.workspaceId, 'image/jpeg');
    if (!imageUrl) return null;

    console.log(
      `[geometric-compose] shell=${shell.id} ${input.aspectRatio} "${headline.slice(0, 40)}"`,
    );

    return {
      imageUrl,
      shellId: shell.id,
      typographyModel: 'satori_geometric',
      falDesignEngine: 'satori_geometric',
    };
  } catch (err) {
    console.warn(
      '[geometric-compose] failed:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
