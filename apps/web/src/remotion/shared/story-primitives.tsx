'use client';

import React, { useEffect } from 'react';
import {
  AbsoluteFill,
  Img,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { HeadlineTreatment } from '../../lib/remotion-template-types';
import { brandHeadlineGradientStyle } from '../../lib/brand-headline-gradient';
export { resolveFontStack } from '../../lib/premium-font-registry';

const STICKER_ROTATIONS = [-2.8, 2.2, -1.6, 1.4];

/** Typography entrance: opacity-only (no Y/scale on text — prevents MP4 letter shimmer). */
const TEXT_FADE_FRAMES_DEFAULT = 14;

/** Snap sub-pixel motion to whole pixels for crisp video text. */
export function stablePx(value: number): number {
  if (Math.abs(value) < 0.5) return 0;
  return Math.round(value);
}

export function stableScale(value: number): number {
  if (value >= 0.998) return 1;
  if (value <= 0.002) return 0;
  return Math.round(value * 1000) / 1000;
}

/**
 * Quantized opacity fade — avoids fractional-alpha text over moving backgrounds (shimmer).
 * After `end` frame, always returns 1.
 */
export function stableTextOpacity(frame: number, start: number, end: number): number {
  if (frame >= end) return 1;
  if (frame <= start) return 0;
  const t = (frame - start) / Math.max(1, end - start);
  // Smooth ease-out — coarse 1/8 steps caused visible stepping on quote/event cards.
  const eased = 1 - (1 - t) ** 2;
  return Math.round(eased * 100) / 100;
}

/** @deprecated Use stableTextOpacity — kept for call-site compatibility. */
export function staggerOpacity(frame: number, start: number, end: number): number {
  return stableTextOpacity(frame, start, end);
}

/** Cap frame for typography helpers (reserved for future motion). */
export function typographyFrame(frame: number, _fps: number, startFrame = 0): number {
  return frame;
}

/**
 * Video-safe vertical motion for text: disabled (returns 0).
 * Subpixel translate on glyphs causes visible jitter in H.264 exports.
 */
export function springSlideY(
  _frame: number,
  _fps: number,
  _delay: number,
  _fromY: number,
): number {
  return 0;
}

/** Text layers: no will-change (causes GPU re-raster jitter); force own compositor layer. */
export const stableTextLayerStyle: React.CSSProperties = {
  backfaceVisibility: 'hidden',
  WebkitBackfaceVisibility: 'hidden',
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
  textRendering: 'geometricPrecision',
  isolation: 'isolate',
  transform: 'translateZ(0)',
};

/** Keep typography above film grain / photo motion layers. */
export const storyTextLayerStyle: React.CSSProperties = {
  ...stableTextLayerStyle,
  position: 'relative',
  zIndex: 8,
};

export function stableTextTransform(_y = 0, _scale = 1): string {
  return 'translateZ(0)';
}

/** Stable outline without WebkitTextStroke (stroke shimmers frame-to-frame in video). */
export function outlineTextShadow(color: string, width = 2): string {
  const w = Math.max(1, Math.round(width));
  const parts: string[] = [];
  for (let dx = -w; dx <= w; dx += 1) {
    for (let dy = -w; dy <= w; dy += 1) {
      if (dx === 0 && dy === 0) continue;
      parts.push(`${dx}px ${dy}px 0 ${color}`);
    }
  }
  return parts.join(', ');
}

/** Opacity-only text reveal + compositor-safe wrapper styles. */
export function useStableTextReveal(
  frame: number,
  fps: number,
  startFrame = 18,
  fadeFrames = TEXT_FADE_FRAMES_DEFAULT,
): { opacity: number; visible: boolean; wrapperStyle: React.CSSProperties } {
  const end = startFrame + Math.max(6, Math.round(fadeFrames));
  const opacity = stableTextOpacity(frame, startFrame, end);
  return {
    opacity,
    visible: frame >= startFrame,
    wrapperStyle: {
      opacity,
      ...stableTextLayerStyle,
    },
  };
}

/** Marka theme / announcement kit → story metin renkleri. */
export function resolveStoryTextColors(props: {
  headlineColor?: string;
  subtitleColor?: string;
  categoryColor?: string;
  accentColor?: string;
}): {
  headline: string;
  subtitle: string;
  category: string;
  location: string;
} {
  const headline = props.headlineColor ?? '#ffffff';
  const subtitle = props.subtitleColor ?? 'rgba(255,255,255,0.86)';
  const accent = props.accentColor ?? '#c9a96e';
  return {
    headline,
    subtitle,
    category: props.categoryColor ?? accent,
    location: props.subtitleColor ? `${subtitle}88` : 'rgba(255,255,255,0.55)',
  };
}

export function useKenBurns(scaleMax = 1.08, origin = '40% 60%', driftY = 36) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = stableScale(interpolate(frame, [0, durationInFrames], [1.0, scaleMax], { extrapolateRight: 'clamp' }));
  const y = stablePx(interpolate(frame, [0, durationInFrames], [driftY, -driftY], { extrapolateRight: 'clamp' }));
  return { scale, y, origin };
}

/**
 * Cinematic photo grade — subtle CSS colour grade so every photo reads
 * "art-directed" rather than a raw camera snapshot. The single biggest cheap
 * signal that separates agency content from a stock template fill.
 */
export type PhotoGrade = 'none' | 'subtle' | 'warm' | 'cool' | 'mono' | 'vivid';

export function cinematicGradeFilter(grade: PhotoGrade = 'subtle'): string | undefined {
  switch (grade) {
    case 'none':
      return undefined;
    case 'warm':
      return 'contrast(1.08) saturate(1.14) brightness(1.01) sepia(0.07)';
    case 'cool':
      return 'contrast(1.08) saturate(1.06) brightness(1.0) hue-rotate(-6deg)';
    case 'mono':
      return 'grayscale(1) contrast(1.14) brightness(1.03)';
    case 'vivid':
      return 'contrast(1.12) saturate(1.22) brightness(1.0)';
    case 'subtle':
    default:
      return 'contrast(1.05) saturate(1.09) brightness(1.005)';
  }
}

export const KenBurnsPhoto: React.FC<{
  photoUrl: string;
  scaleMax?: number;
  origin?: string;
  driftY?: number;
  driftX?: number;
  /** Cinematic colour grade applied to the photo (default subtle). */
  grade?: PhotoGrade;
}> = ({ photoUrl, scaleMax = 1.08, origin = '40% 60%', driftY = 36, driftX = 0, grade = 'subtle' }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = stableScale(interpolate(frame, [0, durationInFrames], [1.0, scaleMax], { extrapolateRight: 'clamp' }));
  const y = stablePx(interpolate(frame, [0, durationInFrames], [driftY, -driftY], { extrapolateRight: 'clamp' }));
  const x = stablePx(interpolate(frame, [0, durationInFrames], [0, driftX], { extrapolateRight: 'clamp' }));
  const filter = cinematicGradeFilter(grade);

  useEffect(() => {
    if (!photoUrl?.trim()) return;
    const handle = delayRender(`kenburns-photo:${photoUrl}`);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => continueRender(handle);
    img.onerror = () => continueRender(handle);
    img.src = photoUrl;
    return () => cancelRender(handle);
  }, [photoUrl]);

  return (
    <AbsoluteFill style={{ transform: `scale(${scale}) translate3d(${x}px, ${y}px, 0)`, transformOrigin: origin }}>
      {photoUrl?.trim() ? (
        <Img src={photoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', filter }} />
      ) : (
        <AbsoluteFill style={{ background: 'linear-gradient(160deg, #1a1a2e 0%, #0d0d14 100%)' }} />
      )}
    </AbsoluteFill>
  );
};

/** Tracking spec → CSS letter-spacing (em, stable across frames). */
export function trackingToLetterSpacing(tracking: number): string {
  if (tracking >= 1) return `${Math.round(tracking)}px`;
  return `${tracking}em`;
}

/**
 * Auto-tracking for editorial headings: heavy weights (800+) benefit from
 * tight negative letter-spacing — the #1 signal of premium design.
 * Returns a CSS letter-spacing value.
 */
export function editorialTracking(fontWeight: number, fontSize: number, explicitTracking?: number): string {
  if (explicitTracking != null) return trackingToLetterSpacing(explicitTracking);
  if (fontWeight >= 900) {
    // Ultra-bold: tighten significantly (-0.025em to -0.04em based on size)
    const em = fontSize >= 60 ? -0.038 : fontSize >= 44 ? -0.028 : -0.018;
    return `${em}em`;
  }
  if (fontWeight >= 800) {
    const em = fontSize >= 60 ? -0.022 : fontSize >= 44 ? -0.016 : -0.010;
    return `${em}em`;
  }
  if (fontWeight >= 700) {
    const em = fontSize >= 60 ? -0.010 : fontSize >= 44 ? -0.006 : 0;
    return `${em}em`;
  }
  // Light / thin weights — open tracking
  if (fontWeight <= 300) return '0.06em';
  return '0em';
}

export function headlineSize(headline: string, scale = 1, fontWeight = 700): number {
  const n = headline.replace(/\n/g, '').length;
  const base =
    n <= 5  ? 96
    : n <= 8  ? 84
    : n <= 12 ? 72
    : n <= 17 ? 62
    : n <= 22 ? 54
    : n <= 30 ? 48
    : n <= 40 ? 42
    : 36;
  const lineCount = splitHeadlineLines(headline).length;
  const density = lineCount >= 4 ? 0.82 : lineCount >= 3 ? 0.9 : 1;
  // Heavy weights (800+) print denser — slight size reduction for refinement
  const weightMod = fontWeight >= 900 ? 0.96 : fontWeight >= 800 ? 0.98 : 1;
  return Math.max(40, Math.round(base * scale * density * weightMod));
}

/** Break headline into display lines — respects explicit \n, else word-wrap. */
export function splitHeadlineLines(headline: string, maxLines = 3, maxChars = 20): string[] {
  if (headline.includes('\n')) return headline.split('\n').slice(0, maxLines);
  const words = headline.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (/^\d{1,2}$/.test(w) && cur) {
      cur = `${cur} ${w}`;
      continue;
    }
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    } else {
      cur = next;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  const merged = lines.length ? lines : [headline];
  return merged.filter((line) => line.trim().length > 0 && !/^\d{1,2}$/.test(line.trim()));
}

/** Minimum line-height for display/script headlines — prevents ascender clipping in MP4 export. */
export function resolveHeadlineLineHeight(lineGap: number, fontWeight: number): number {
  const base = Number.isFinite(lineGap) && lineGap > 0 ? lineGap : 1.08;
  const weightFloor = fontWeight >= 900 ? 1.12 : fontWeight >= 800 ? 1.1 : 1.06;
  return Math.max(base, weightFloor);
}

/** Per-line wrapper — ascender/descender room for script & gradient display type. */
export function headlineLineBoxStyle(isLast: boolean): React.CSSProperties {
  return {
    display: 'block',
    overflow: 'visible',
    paddingTop: '0.1em',
    paddingBottom: '0.04em',
    marginBottom: isLast ? 0 : '0.08em',
  };
}

/** Multi-line hero — opacity-only entrance, single compositor layer. */
export const HeadlineStack: React.FC<{
  headline: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  color: string;
  uppercase?: boolean;
  tracking?: number;
  frame: number;
  fps: number;
  startFrame?: number;
  lineGap?: number;
  textShadow?: string;
  strokeColor?: string;
  strokeWidth?: number;
  /** Graphic designer wrap — rounded bubble pills or tilted stickers */
  headlineTreatment?: HeadlineTreatment;
  accentColor?: string;
  primaryColor?: string;
  align?: 'left' | 'center' | 'right';
  /** Parent already fades — skip nested opacity (prevents shimmer). */
  holdOpacity?: boolean;
}> = ({
  headline, fontFamily, fontWeight, fontSize, color, uppercase = false, tracking = 0,
  frame, fps, startFrame = 18, lineGap = 0.92, textShadow, strokeColor, strokeWidth,
  headlineTreatment = 'flat', accentColor = '#f472b6', primaryColor, align = 'left',
  holdOpacity = false,
}) => {
  const lines = splitHeadlineLines(headline);
  const fadeEnd = startFrame + Math.round(fps * 0.45);
  const opacity = holdOpacity ? 1 : stableTextOpacity(frame, startFrame, fadeEnd);
  const outlineShadow = strokeColor ? outlineTextShadow(strokeColor, strokeWidth ?? 2) : undefined;
  const isGraphic = headlineTreatment === 'bubble' || headlineTreatment === 'sticker';
  const solidHeadline = /^#(fff|ffffff)$/i.test(color.trim());
  const useBrandGradient = headlineTreatment === 'flat'
    && Boolean(primaryColor && accentColor && primaryColor !== accentColor)
    && !solidHeadline;
  const gradientStyle = useBrandGradient
    ? brandHeadlineGradientStyle(primaryColor, accentColor)
    : undefined;
  const accentContrastShadow = useBrandGradient || (!solidHeadline && color.trim().toLowerCase() !== '#ffffff')
    ? '0 2px 12px rgba(0,0,0,0.85), 0 4px 28px rgba(0,0,0,0.65)'
    : undefined;

  return (
    <div
      style={{
        opacity,
        maxWidth: '100%',
        textAlign: align,
        ...stableTextLayerStyle,
      }}
    >
      {lines.map((line, i) => {
        // More dramatic hierarchy: 1st line full, 2nd/3rd slightly smaller — keep readable on phone
        const lineSize = i === 0 ? fontSize : Math.round(fontSize * (i === 1 ? 0.94 : 0.88));
        const lineH = resolveHeadlineLineHeight(isGraphic ? Math.max(lineGap, 1.12) : lineGap, fontWeight);
        const lineBox = headlineLineBoxStyle(i >= lines.length - 1);
        const baseStyle: React.CSSProperties = {
          fontFamily,
          fontWeight,
          fontSize: lineSize,
          lineHeight: lineH,
          // Use editorial tracking for real premium feel (overrides explicit 0 tracking)
          letterSpacing: tracking === 0
            ? editorialTracking(fontWeight, lineSize)
            : trackingToLetterSpacing(tracking),
          textTransform: uppercase ? 'uppercase' : 'none',
          ...(!useBrandGradient && outlineShadow && headlineTreatment === 'flat'
            ? { textShadow: textShadow ? `${textShadow}, ${outlineShadow}` : outlineShadow }
            : !useBrandGradient && (textShadow || accentContrastShadow) && headlineTreatment === 'flat'
              ? { textShadow: [textShadow, accentContrastShadow].filter(Boolean).join(', ') }
              : useBrandGradient && accentContrastShadow
                ? { textShadow: accentContrastShadow }
              : {}),
        };

        if (headlineTreatment === 'bubble') {
          return (
            <span key={`${line}-${i}`} style={lineBox}>
              <span style={{
                ...baseStyle,
                display: 'inline-block',
                color: '#fff',
                background: accentColor,
                padding: '0.14em 0.58em',
                borderRadius: '0.4em',
                boxShadow: '0 8px 32px rgba(0,0,0,0.42)',
              }}>
                {line}
              </span>
            </span>
          );
        }

        if (headlineTreatment === 'sticker') {
          const rot = STICKER_ROTATIONS[i % STICKER_ROTATIONS.length] ?? 0;
          return (
            <span
              key={`${line}-${i}`}
              style={{ ...lineBox, transform: `rotate(${rot}deg)` }}
            >
              <span style={{
                ...baseStyle,
                display: 'inline-block',
                color: '#1a1a1a',
                background: '#fffef8',
                padding: '0.16em 0.68em',
                borderRadius: 8,
                border: `3px solid ${accentColor}`,
                boxShadow: `5px 5px 0 ${accentColor}99, 0 10px 36px rgba(0,0,0,0.28)`,
              }}>
                {line}
              </span>
            </span>
          );
        }

        const lineStyle: React.CSSProperties = {
          ...baseStyle,
          ...(gradientStyle ?? { color }),
          ...(gradientStyle
            ? {
              filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.92)) drop-shadow(0 6px 18px rgba(0,0,0,0.72))',
            }
            : textShadow
              ? {}
              : {}),
        };

        // Gradyan inline-block'a uygulanmalı — block + center align tüm satır
        // genişliğine gradyan yayar ve sol harfler koyu primary ile kaybolur.
        if (gradientStyle) {
          return (
            <span key={`${line}-${i}`} style={lineBox}>
              <span style={{ ...lineStyle, display: 'inline-block' }}>{line}</span>
            </span>
          );
        }

        return (
          <span key={`${line}-${i}`} style={{ ...lineStyle, ...lineBox }}>
            {line}
          </span>
        );
      })}
    </div>
  );
};

/** Aggressive shadow — for text directly on busy photos */
export const textShadowHeavy =
  '0 2px 12px rgba(0,0,0,1), 0 6px 32px rgba(0,0,0,0.9), 0 12px 60px rgba(0,0,0,0.75)';

/** Editorial shadow — refined single-direction drop, luxury magazines look */
export const textShadowEditorial =
  '0 2px 6px rgba(0,0,0,0.72), 0 4px 24px rgba(0,0,0,0.55)';

/** Subtle ambient shadow — text on solid/gradient panels */
export const textShadowAmbient =
  '0 1px 4px rgba(0,0,0,0.55), 0 2px 16px rgba(0,0,0,0.32)';

/**
 * Film grain on background — fine-grain version for editorial / luxury templates.
 * Must stay below text (zIndex > 3 caused glyph shimmer).
 * Tile size 256px = finer, more cinematic grain vs old 180px coarse grain.
 */
export const FilmGrainOverlay: React.FC<{ opacity?: number; fine?: boolean }> = ({
  opacity = 0.08,
  fine = true,
}) => (
  <AbsoluteFill
    style={{
      opacity,
      pointerEvents: 'none',
      zIndex: 1,
      mixBlendMode: 'overlay',
      backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
        fine
          ? '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(%23n)" opacity="0.45"/></svg>'
          : '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23n)" opacity="0.55"/></svg>',
      )}")`,
      backgroundSize: fine ? '256px 256px' : '180px 180px',
    }}
  />
);

/** Mesh gradient backdrop — 2024–26 social native look */
export const MeshGradientLayer: React.FC<{
  primary: string;
  accent: string;
  opacity?: number;
}> = ({ primary, accent, opacity = 1 }) => (
  <AbsoluteFill
    style={{
      opacity,
      background: `
        radial-gradient(ellipse 80% 60% at 15% 20%, ${accent}55 0%, transparent 55%),
        radial-gradient(ellipse 70% 50% at 85% 75%, ${primary}88 0%, transparent 50%),
        radial-gradient(ellipse 100% 80% at 50% 100%, ${primary} 0%, #050508 70%)
      `,
    }}
  />
);

export function neonGlowStyle(color: string, intensity = 1): string {
  const a = Math.round(40 * intensity);
  const b = Math.round(80 * intensity);
  return `0 0 ${a}px ${color}, 0 0 ${b}px ${color}88, 0 0 ${b * 2}px ${color}44`;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Premium editorial primitives — shared "designer" detailing that lifts plain
 * photo+gradient layouts to magazine / agency quality. All decoration layers
 * are pointer-safe, sit below text, and use brand colours (multi-tenant safe).
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * Cinematic light — soft directional top bloom + corner falloff that adds
 * dimensionality to flat photo backgrounds. The #1 cheap signal of a "graded"
 * cinematic frame vs a raw snapshot. Pure CSS, sits above the photo, below text.
 */
export const CinematicLightLayer: React.FC<{
  warmth?: 'warm' | 'cool' | 'neutral';
  intensity?: number;
  origin?: string;
}> = ({ warmth = 'neutral', intensity = 1, origin = '50% -8%' }) => {
  const tint =
    warmth === 'warm' ? '255,222,176' : warmth === 'cool' ? '178,206,255' : '255,255,255';
  const bloom = (0.18 * intensity).toFixed(3);
  return (
    <>
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          zIndex: 1,
          mixBlendMode: 'soft-light',
          background: `radial-gradient(ellipse 130% 78% at ${origin}, rgba(${tint},${bloom}) 0%, rgba(${tint},0) 52%)`,
        }}
      />
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          zIndex: 1,
          background: `radial-gradient(ellipse 118% 92% at 50% 42%, transparent 46%, rgba(0,0,0,${(
            0.42 * intensity
          ).toFixed(3)}) 100%)`,
        }}
      />
    </>
  );
};

/**
 * Editorial kicker — refined eyebrow row: short accent rule + dot + tracked
 * label. Replaces bare uppercase category spans for a print-magazine signature.
 */
export const EditorialKicker: React.FC<{
  label: string;
  accent: string;
  fontFamily: string;
  color?: string;
  align?: 'left' | 'center';
  opacity?: number;
  fontSize?: number;
}> = ({ label, accent, fontFamily, color, align = 'left', opacity = 1, fontSize = 12 }) => {
  if (!label?.trim()) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        gap: 10,
        opacity,
        marginBottom: 14,
        ...stableTextLayerStyle,
      }}
    >
      <span style={{ width: 26, height: 2, background: accent, borderRadius: 1 }} />
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: accent }} />
      <span
        style={{
          fontFamily,
          fontSize,
          letterSpacing: 6,
          textTransform: 'uppercase',
          fontWeight: 600,
          color: color ?? accent,
          textShadow: textShadowEditorial,
        }}
      >
        {label}
      </span>
    </div>
  );
};

/**
 * Corner registration ticks — L-shaped marks at the frame corners, a magazine /
 * print signature that frames the composition without a heavy border.
 */
export const CornerTicks: React.FC<{
  color: string;
  inset?: number;
  length?: number;
  thickness?: number;
  opacity?: number;
  corners?: Array<'tl' | 'tr' | 'bl' | 'br'>;
}> = ({
  color,
  inset = 34,
  length = 30,
  thickness = 2,
  opacity = 0.85,
  corners = ['tl', 'tr', 'bl', 'br'],
}) => {
  const h = { position: 'absolute' as const, height: thickness, width: length, background: color };
  const v = { position: 'absolute' as const, width: thickness, height: length, background: color };
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity, zIndex: 6 }}>
      {corners.includes('tl') && (
        <>
          <div style={{ ...h, top: inset, left: inset }} />
          <div style={{ ...v, top: inset, left: inset }} />
        </>
      )}
      {corners.includes('tr') && (
        <>
          <div style={{ ...h, top: inset, right: inset }} />
          <div style={{ ...v, top: inset, right: inset }} />
        </>
      )}
      {corners.includes('bl') && (
        <>
          <div style={{ ...h, bottom: inset, left: inset }} />
          <div style={{ ...v, bottom: inset, left: inset }} />
        </>
      )}
      {corners.includes('br') && (
        <>
          <div style={{ ...h, bottom: inset, right: inset }} />
          <div style={{ ...v, bottom: inset, right: inset }} />
        </>
      )}
    </AbsoluteFill>
  );
};

/**
 * Accent rule — animated hairline with a heavier leading tick. Use to separate
 * kicker / headline / meta blocks with an editorial cadence.
 */
export const AccentRule: React.FC<{
  accent: string;
  progress?: number;
  width?: number;
  align?: 'left' | 'center';
  opacity?: number;
}> = ({ accent, progress = 1, width = 64, align = 'left', opacity = 1 }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      justifyContent: align === 'center' ? 'center' : 'flex-start',
      opacity,
    }}
  >
    <span style={{ width: 8, height: 3, background: accent, borderRadius: 1 }} />
    <span
      style={{
        width: Math.round(width * Math.max(0, Math.min(1, progress))),
        height: 1,
        background: `linear-gradient(to right, ${accent}, ${accent}22)`,
      }}
    />
  </div>
);

/**
 * Editorial meta row — bottom byline with dot separators (brand · location ·
 * index). Anchors the composition and fills "dead" bottom space gracefully.
 */
export const EditorialMetaRow: React.FC<{
  items: Array<string | undefined>;
  fontFamily: string;
  color?: string;
  accent?: string;
  align?: 'left' | 'center';
  opacity?: number;
}> = ({ items, fontFamily, color = 'rgba(255,255,255,0.6)', accent, align = 'left', opacity = 1 }) => {
  const parts = items.filter((x): x is string => Boolean(x && x.trim()));
  if (!parts.length) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        gap: 9,
        opacity,
        ...stableTextLayerStyle,
      }}
    >
      {parts.map((p, i) => (
        <React.Fragment key={`${p}-${i}`}>
          {i > 0 && (
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: accent ?? color }} />
          )}
          <span
            style={{
              fontFamily,
              fontSize: 12,
              letterSpacing: 2.5,
              textTransform: 'uppercase',
              color,
              textShadow: textShadowAmbient,
            }}
          >
            {p}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
};
