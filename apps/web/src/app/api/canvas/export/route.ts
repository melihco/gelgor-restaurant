/**
 * Canvas Export API — server-side React → SVG → PNG via Satori + resvg.
 *
 * POST /api/canvas/export
 * Body: { content: CanvasOutput, theme: BrandTheme, format?: "png" | "webp" }
 *
 * Returns: image/png or image/webp binary
 *
 * Architecture:
 *   1. Satori renders a React tree (JSX element) to SVG — runs in Node.js edge-like env
 *   2. @resvg/resvg-js converts SVG to PNG — WASM-based, no native deps
 *   3. Response is a binary image (not base64) for direct display/download
 *
 * Font loading:
 *   Fonts are loaded from the /public/fonts/ folder (server-side read).
 *   Required fonts must be copied there during build. See scripts/copy-fonts.js.
 *   Falls back gracefully if a font file is missing.
 */

import { NextRequest, NextResponse } from 'next/server';
import satori, { type Font } from 'satori';
import { renderAsync } from '@resvg/resvg-js';
import type { BrandTheme, LayoutId } from '@/types/brand-theme';
import type { CanvasOutput } from '@/types/canvas-output';
import { loadSatoriFont } from '@/lib/satori-fonts';

export const runtime = 'nodejs';
export const maxDuration = 30;

// ── Canvas dimensions by layout ──────────────────────────────────────────────

const LAYOUT_DIMENSIONS: Record<LayoutId, { width: number; height: number }> = {
  feed_square:          { width: 1080, height: 1080 },
  story_full:           { width: 1080, height: 1920 },
  carousel_slide:       { width: 1080, height: 1080 },
  event_card:           { width: 1080, height: 1080 },
  weekly_brief:         { width: 1080, height: 1350 },
  review_showcase:      { width: 1080, height: 1080 },
  ad_banner_horizontal: { width: 1200, height: 628 },
};

// ── Satori JSX element builders ───────────────────────────────────────────────

function buildFeedSquareElement(content: CanvasOutput, theme: BrandTheme) {
  const { palette, overlay } = theme;
  return {
    type: 'div',
    props: {
      style: {
        width: '100%', height: '100%',
        background: palette.primary,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'flex-end',
        position: 'relative',
        borderRadius: theme.layout.borderRadius,
        overflow: 'hidden',
      },
      children: [
        // Gradient overlay
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute', inset: 0,
              background: `linear-gradient(to top, ${overlay.color}cc 0%, transparent 55%)`,
            },
          },
        },
        // Text block
        {
          type: 'div',
          props: {
            style: {
              position: 'relative',
              padding: theme.layout.spacingBase * 2,
              display: 'flex', flexDirection: 'column', gap: 8,
            },
            children: [
              content.subline ? {
                type: 'p',
                props: {
                  style: { margin: 0, fontSize: 22, letterSpacing: '0.1em', textTransform: 'uppercase', color: palette.accent, fontWeight: 600 },
                  children: content.subline,
                },
              } : null,
              {
                type: 'h2',
                props: {
                  style: { margin: 0, fontSize: 52, fontWeight: 700, color: palette.neutral, lineHeight: 1.15 },
                  children: content.headline,
                },
              },
              content.cta ? {
                type: 'div',
                props: {
                  style: {
                    display: 'flex', alignItems: 'center',
                    padding: '12px 28px', borderRadius: 40,
                    background: palette.accent, color: '#fff',
                    fontSize: 24, fontWeight: 700, letterSpacing: '0.04em',
                    alignSelf: 'flex-start',
                  },
                  children: content.cta,
                },
              } : null,
            ].filter(Boolean),
          },
        },
      ],
    },
  };
}

function buildStoryFullElement(content: CanvasOutput, theme: BrandTheme) {
  const { palette, overlay } = theme;
  return {
    type: 'div',
    props: {
      style: {
        width: '100%', height: '100%',
        background: palette.primary,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden',
      },
      children: [
        // Top accent bar
        { type: 'div', props: { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: palette.accent } } },
        // Overlay
        { type: 'div', props: { style: { position: 'absolute', inset: 0, background: overlay.color, opacity: overlay.opacity } } },
        // Center content
        {
          type: 'div',
          props: {
            style: {
              position: 'relative',
              padding: theme.layout.spacingBase * 4,
              textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
            },
            children: [
              {
                type: 'h1',
                props: {
                  style: { margin: 0, fontSize: 72, fontWeight: 800, color: palette.neutral, lineHeight: 1.1, textAlign: 'center' },
                  children: content.headline,
                },
              },
              content.subline ? {
                type: 'p',
                props: {
                  style: { margin: 0, fontSize: 32, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
                  children: content.subline,
                },
              } : null,
              content.cta ? {
                type: 'div',
                props: {
                  style: {
                    padding: '18px 48px', borderRadius: 48,
                    background: palette.accent, color: '#fff',
                    fontSize: 28, fontWeight: 800, letterSpacing: '0.05em',
                  },
                  children: content.cta,
                },
              } : null,
            ].filter(Boolean),
          },
        },
      ],
    },
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────

interface ExportRequest {
  content: CanvasOutput;
  theme: BrandTheme;
  format?: 'png' | 'webp';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: ExportRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { content, theme, format = 'png' } = body;
  if (!content || !theme) {
    return NextResponse.json({ error: 'content and theme required' }, { status: 400 });
  }

  const layoutId = (content.layoutId ?? theme.layout.defaultLayoutId) as LayoutId;
  const dims = LAYOUT_DIMENSIONS[layoutId] ?? LAYOUT_DIMENSIONS.feed_square;

  // Load fonts for Satori
  const fonts: Font[] = [];
  const headingFont = theme.typography.headingFont;
  const bodyFont = theme.typography.bodyFont;
  for (const [name, weight] of [[headingFont, 700], [bodyFont, 400]] as [string, number][]) {
    const buf = await loadSatoriFont(name, weight as 400 | 700);
    if (buf) {
      fonts.push({ name, data: buf, weight: weight as Font['weight'], style: 'normal' });
    }
  }

  // Fallback: load Inter if nothing else available
  if (fonts.length === 0) {
    const interBuf = await loadSatoriFont('Inter', 400);
    if (interBuf) fonts.push({ name: 'Inter', data: interBuf, weight: 400, style: 'normal' });
  }

  // Build element based on layout
  const element = layoutId === 'story_full'
    ? buildStoryFullElement(content, theme)
    : buildFeedSquareElement(content, theme);

  try {
    const svg = await satori(element as Parameters<typeof satori>[0], {
      width: dims.width,
      height: dims.height,
      fonts,
    });

    // Worker-thread rasterization — same bytes as the sync API without
    // blocking the event loop while a large canvas exports.
    const pngData = await renderAsync(svg, {
      fitTo: { mode: 'width', value: dims.width },
    });
    const pngBuffer = Buffer.from(pngData.asPng());

    return new NextResponse(pngBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': format === 'webp' ? 'image/webp' : 'image/png',
        'Content-Disposition': `attachment; filename="canvas-${layoutId}-${Date.now()}.${format}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[canvas/export] Satori render failed:', err);
    return NextResponse.json(
      { error: 'Render failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
