'use client';

/**
 * Next-gen social layouts — fullscreen type, bento grid, neon night.
 * Targets 2024–26 Instagram/TikTok production bar (not 2019 gradient templates).
 */
import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { RemotionLayoutSpec } from '../lib/remotion-template-types';
import type { StoryProps } from './types';
import { StoryLogoMark } from './StoryLogo';
import {
  FilmGrainOverlay,
  HeadlineStack,
  KenBurnsPhoto,
  MeshGradientLayer,
  headlineSize,
  neonGlowStyle,
  staggerOpacity,
  stableTextLayerStyle,
} from './shared/story-primitives';
import { useStoryFonts } from './shared/useRemotionFonts';

type Props = StoryProps & { layoutSpec: RemotionLayoutSpec };

function galleryUrls(photoUrl: string, extras?: string[]): string[] {
  const out: string[] = [];
  for (const u of [photoUrl, ...(extras ?? [])]) {
    if (u && !out.includes(u)) out.push(u);
  }
  return out.slice(0, 4);
}

/** Oversized stacked type + circular hero photo — Spotify/Apple vibe */
export function VibeFullscreenLayout({
  photoUrl, headline, subtitle = '', categoryLabel = '', brandName,
  primaryColor = '#0a0a0f', accentColor = '#c9a96e', headlineWeight, headlineScale = 1,
  logoUrl = '', location = '', layoutSpec: spec,
}: Props & { layoutSpec: RemotionLayoutSpec }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fonts = useStoryFonts();
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 1.35);
  const photoScale = interpolate(frame, [8, 40], [0.6, 1], { extrapolateRight: 'clamp' });
  const photoOp = staggerOpacity(frame, 10, 28);

  return (
    <AbsoluteFill style={{ background: primaryColor }}>
      <MeshGradientLayer primary={primaryColor} accent={accentColor} />
      <KenBurnsPhoto photoUrl={photoUrl} scaleMax={1.15} origin="50% 40%" driftY={20} />
      <AbsoluteFill style={{ background: `linear-gradient(to bottom, ${primaryColor}dd 0%, transparent 35%, ${primaryColor}ee 78%)` }} />
      <FilmGrainOverlay opacity={0.1} />
      <AbsoluteFill style={{ padding: '8% 7% 10%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          {categoryLabel ? (
            <span style={{
              fontFamily: fonts.body, fontSize: 10, letterSpacing: 14, textTransform: 'uppercase',
              color: accentColor, padding: '8px 14px', border: `1px solid ${accentColor}66`, borderRadius: 999,
              opacity: staggerOpacity(frame, 0, 14),
            }}>
              {categoryLabel}
            </span>
          ) : null}
          <StoryLogoMark logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.85} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', marginTop: -40 }}>
          <HeadlineStack
            headline={headline}
            fontFamily={fonts.hero}
            fontWeight={headlineWeight ?? 900}
            fontSize={fontSize}
            color="#fff"
            uppercase={spec.heroUppercase}
            tracking={0.02}
            frame={frame}
            fps={fps}
            startFrame={12}
            lineGap={0.82}
          />
          {subtitle ? (
            <span style={{
              fontFamily: fonts.body, fontSize: 20, color: 'rgba(255,255,255,0.55)', marginTop: 20,
              opacity: staggerOpacity(frame, 32, 48), letterSpacing: 1,
            }}>
              {subtitle}
            </span>
          ) : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          {spec.showLocation && location ? (
            <span style={{ fontFamily: fonts.body, fontSize: 11, letterSpacing: 4, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
              {location}
            </span>
          ) : <span />}
          <div style={{
            width: 168, height: 168, borderRadius: '50%', overflow: 'hidden',
            border: `3px solid ${accentColor}`, boxShadow: `0 0 0 6px ${primaryColor}, 0 20px 50px rgba(0,0,0,0.5)`,
            transform: `scale(${photoScale})`, opacity: photoOp,
          }}>
            <Img src={photoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** Bento grid — 4 asymmetric cells + type block (2025 feed native) */
export function BentoStoryLayout({
  photoUrl, galleryPhotoUrls, headline, subtitle = '', categoryLabel = '',
  primaryColor = '#1a2b4a', accentColor = '#c9a96e', headlineWeight, headlineScale = 1,
  brandName, logoUrl = '', layoutSpec: spec,
}: Props) {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const fonts = useStoryFonts();
  const photos = galleryUrls(photoUrl, galleryPhotoUrls);
  const p0 = photos[0]!;
  const p1 = photos[1] ?? p0;
  const p2 = photos[2] ?? p1;
  const p3 = photos[3] ?? p0;
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 0.78);
  const gap = 8;
  const gridH = Math.round(height * 0.52);
  const bandH = height - gridH - gap * 3;
  const cellIn = (delay: number) => staggerOpacity(frame, delay, delay + 16);

  return (
    <AbsoluteFill style={{ background: primaryColor, padding: gap, boxSizing: 'border-box' }}>
      <div style={{ height: gridH, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gridTemplateRows: '1fr 1fr', gap }}>
        <div style={{ gridRow: 'span 2', borderRadius: 12, overflow: 'hidden', opacity: cellIn(0) }}>
          <KenBurnsPhoto photoUrl={p0} scaleMax={1.08} origin="40% 50%" driftY={14} />
        </div>
        <div style={{ borderRadius: 12, overflow: 'hidden', opacity: cellIn(6) }}>
          <KenBurnsPhoto photoUrl={p1} scaleMax={1.05} origin="center" driftY={8} />
        </div>
        <div style={{ borderRadius: 12, overflow: 'hidden', opacity: cellIn(10) }}>
          <KenBurnsPhoto photoUrl={p2} scaleMax={1.05} origin="60% 40%" driftY={8} />
        </div>
      </div>
      <div style={{
        marginTop: gap,
        height: bandH,
        background: `linear-gradient(135deg, ${accentColor}22, ${primaryColor})`,
        borderRadius: 16,
        border: `1px solid ${accentColor}44`,
        padding: '22px 26px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        opacity: cellIn(18),
        ...stableTextLayerStyle,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          {categoryLabel ? (
            <span style={{ fontFamily: fonts.body, fontSize: 9, letterSpacing: 12, textTransform: 'uppercase', color: accentColor }}>
              {categoryLabel}
            </span>
          ) : null}
          <StoryLogoMark logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.9} />
        </div>
        <HeadlineStack
          headline={headline}
          fontFamily={fonts.hero}
          fontWeight={headlineWeight ?? 800}
          fontSize={fontSize}
          color="#fff"
          frame={frame}
          fps={fps}
          startFrame={20}
          lineGap={0.95}
        />
        {subtitle ? (
          <span style={{ fontFamily: fonts.body, fontSize: 16, color: 'rgba(255,255,255,0.65)', marginTop: 10 }}>
            {subtitle.slice(0, 90)}
          </span>
        ) : null}
      </div>
      <div style={{ position: 'absolute', top: gridH + gap * 2 + 12, right: gap + 12, width: 72, height: 72, borderRadius: 10, overflow: 'hidden', opacity: cellIn(14), boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
        <Img src={p3} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <FilmGrainOverlay opacity={0.08} />
    </AbsoluteFill>
  );
}

/** Nightlife / DJ — mesh + neon glow type + pulse accent */
export function NeonNightLayout({
  photoUrl, headline, subtitle = '', categoryLabel = '', brandName,
  primaryColor = '#1e1b4b', accentColor = '#a78bfa', headlineWeight, headlineScale = 1,
  logoUrl = '', cta = '', eventDate, eventTime, layoutSpec: spec,
}: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fonts = useStoryFonts();
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 1.15);
  const pulse = 0.85 + 0.15 * Math.sin((frame / fps) * Math.PI * 2.5);

  return (
    <AbsoluteFill style={{ background: '#030308' }}>
      <KenBurnsPhoto photoUrl={photoUrl} scaleMax={1.12} origin="50% 55%" driftY={10} />
      <MeshGradientLayer primary={primaryColor} accent={accentColor} opacity={0.92} />
      <AbsoluteFill style={{ background: 'rgba(0,0,0,0.45)' }} />
      <FilmGrainOverlay opacity={0.18} />
      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '12% 40px', textAlign: 'center',
      }}>
        <div style={{ position: 'absolute', top: '6%', opacity: 0.9 }}>
          <StoryLogoMark logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} />
        </div>
        {categoryLabel ? (
          <span style={{
            fontFamily: fonts.body, fontSize: 11, letterSpacing: 18, textTransform: 'uppercase',
            color: accentColor, marginBottom: 16, opacity: staggerOpacity(frame, 4, 18),
            textShadow: neonGlowStyle(accentColor, 0.6),
          }}>
            {categoryLabel}
          </span>
        ) : null}
        <div style={{ ...stableTextLayerStyle }}>
          <HeadlineStack
            headline={headline}
            fontFamily={fonts.hero}
            fontWeight={headlineWeight ?? 900}
            fontSize={fontSize}
            color="#fff"
            uppercase
            tracking={0.06}
            frame={frame}
            fps={fps}
            startFrame={12}
            lineGap={0.88}
            textShadow={neonGlowStyle(accentColor, pulse)}
          />
        </div>
        {subtitle ? (
          <span style={{
            fontFamily: fonts.body, fontSize: 18, color: 'rgba(255,255,255,0.7)', marginTop: 16,
            opacity: staggerOpacity(frame, 30, 44),
          }}>
            {subtitle}
          </span>
        ) : null}
        {(eventDate || eventTime) ? (
          <span style={{
            marginTop: 20, padding: '12px 22px', borderRadius: 8,
            border: `1px solid ${accentColor}`, background: `${accentColor}22`,
            fontFamily: fonts.body, fontSize: 14, fontWeight: 700, color: '#fff',
            opacity: staggerOpacity(frame, 36, 50),
            boxShadow: neonGlowStyle(accentColor, 0.4),
          }}>
            {[eventDate, eventTime].filter(Boolean).join(' · ')}
          </span>
        ) : null}
        {spec.showCtaPill && cta ? (
          <span style={{
            marginTop: 18, padding: '14px 32px', borderRadius: 999,
            background: accentColor, color: primaryColor,
            fontFamily: fonts.body, fontSize: 13, fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase',
            opacity: staggerOpacity(frame, 42, 56),
          }}>
            {cta}
          </span>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
