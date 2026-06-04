'use client';

import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
export { resolveFontStack } from '../../lib/premium-font-registry';

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
  return Math.round(t * 8) / 8;
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

export const KenBurnsPhoto: React.FC<{
  photoUrl: string;
  scaleMax?: number;
  origin?: string;
  driftY?: number;
  driftX?: number;
}> = ({ photoUrl, scaleMax = 1.08, origin = '40% 60%', driftY = 36, driftX = 0 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = stableScale(interpolate(frame, [0, durationInFrames], [1.0, scaleMax], { extrapolateRight: 'clamp' }));
  const y = stablePx(interpolate(frame, [0, durationInFrames], [driftY, -driftY], { extrapolateRight: 'clamp' }));
  const x = stablePx(interpolate(frame, [0, durationInFrames], [0, driftX], { extrapolateRight: 'clamp' }));

  return (
    <AbsoluteFill style={{ transform: `scale(${scale}) translate3d(${x}px, ${y}px, 0)`, transformOrigin: origin }}>
      <Img src={photoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </AbsoluteFill>
  );
};

/** Tracking spec → CSS letter-spacing (em, stable across frames). */
export function trackingToLetterSpacing(tracking: number): string {
  if (tracking >= 1) return `${Math.round(tracking)}px`;
  return `${tracking}em`;
}

export function headlineSize(headline: string, scale = 1): number {
  const n = headline.replace(/\n/g, '').length;
  const base = n <= 6 ? 104 : n <= 10 ? 88 : n <= 14 ? 72 : n <= 20 ? 58 : n <= 26 ? 48 : 42;
  return Math.round(base * scale);
}

/** Break headline into display lines — respects explicit \n, else word-wrap. */
export function splitHeadlineLines(headline: string, maxLines = 3, maxChars = 12): string[] {
  if (headline.includes('\n')) return headline.split('\n').slice(0, maxLines);
  const words = headline.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
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
  return lines.length ? lines : [headline];
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
}> = ({
  headline, fontFamily, fontWeight, fontSize, color, uppercase = false, tracking = 0,
  frame, fps, startFrame = 18, lineGap = 0.92, textShadow, strokeColor, strokeWidth,
}) => {
  const lines = splitHeadlineLines(headline);
  const fadeEnd = startFrame + Math.round(fps * 0.45);
  const opacity = stableTextOpacity(frame, startFrame, fadeEnd);
  const outlineShadow = strokeColor ? outlineTextShadow(strokeColor, strokeWidth ?? 2) : undefined;

  return (
    <div
      style={{
        opacity,
        maxWidth: '100%',
        ...stableTextLayerStyle,
      }}
    >
      {lines.map((line, i) => {
        const style: React.CSSProperties = {
          display: 'block',
          fontFamily,
          fontWeight,
          fontSize: i === 0 ? fontSize : Math.round(fontSize * (i === 1 ? 0.92 : 0.82)),
          color,
          lineHeight: lineGap,
          letterSpacing: trackingToLetterSpacing(tracking),
          textTransform: uppercase ? 'uppercase' : 'none',
          ...(outlineShadow
            ? { textShadow: textShadow ? `${textShadow}, ${outlineShadow}` : outlineShadow }
            : textShadow
              ? { textShadow }
              : {}),
        };
        return <span key={`${line}-${i}`} style={style}>{line}</span>;
      })}
    </div>
  );
};

export const textShadowHeavy =
  '0 2px 12px rgba(0,0,0,1), 0 6px 32px rgba(0,0,0,0.9), 0 12px 60px rgba(0,0,0,0.75)';

/** Film grain on background only — normal blend (overlay on text causes shimmer). */
export const FilmGrainOverlay: React.FC<{ opacity?: number }> = ({ opacity = 0.1 }) => (
  <AbsoluteFill
    style={{
      opacity,
      pointerEvents: 'none',
      zIndex: 3,
      mixBlendMode: 'normal',
      backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23n)" opacity="0.55"/></svg>',
      )}")`,
      backgroundSize: '180px 180px',
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
