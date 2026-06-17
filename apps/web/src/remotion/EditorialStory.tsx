/**
 * EditorialStory — Agency-grade editorial story composition.
 *
 * Design principles:
 *   - LEFT-ALIGNED text (asymmetric = premium, centered = amateur)
 *   - Dramatic weight contrast: micro category + mega headline
 *   - Vertical accent bar on left edge (brand identity anchor)
 *   - Horizontal rule separating category from headline
 *   - Three-layer gradient: photo breathes up top, blackout at bottom
 *   - Ken Burns origin: bottom-left (subject rises into frame)
 *   - Text shadows: layered for absolute legibility on any photo
 */
'use client';

import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Img,
} from 'remotion';
import type { StoryProps } from './types';
import { StoryLogoTopCenter } from './StoryLogo';
import { useRemotionFonts } from './shared/useRemotionFonts';
import { HeadlineStack, headlineSize, stablePx, stableScale, stableTextOpacity } from './shared/story-primitives';
import { StoryAudioLayer } from './shared/story-audio';

export const EditorialStory: React.FC<StoryProps> = ({
  photoUrl,
  headline,
  subtitle = '',
  categoryLabel = '',
  brandName,
  accentColor = '#c9a96e',
  primaryColor = '#1a2b4a',
  fontFamily = 'Cormorant Garamond',
  bodyFont,
  overlayOpacity = 0.68,
  headlineWeight = 900,
  headlineScale = 1.0,
  logoUrl = '',
  audioMood,
  voiceoverUrl,
}) => {
  const { hero, body } = useRemotionFonts('serif_editorial', fontFamily, bodyFont);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Ken Burns: slow rise from bottom-left — subject enters frame
  const photoScale = stableScale(interpolate(frame, [0, durationInFrames], [1.0, 1.09], { extrapolateRight: 'clamp' }));
  const photoYpx = stablePx(interpolate(frame, [0, durationInFrames], [38, -38], { extrapolateRight: 'clamp' }));

  // ── Animation timings ──────────────────────────────────────────────────────
  // Brand name: instant presence (frame 0)
  const brandOp = stableTextOpacity(frame, 0, 10);

  // Left accent bar: wipes down from top (frame 4-22)
  const barH    = interpolate(frame, [4, 22], [0, 100], { extrapolateRight: 'clamp' });

  // Horizontal rule: wipes right (frame 10-28)
  const ruleW   = interpolate(frame, [10, 28], [0, 100], { extrapolateRight: 'clamp' });

  // Category: fade in after rule (frame 18-32)
  const catOp   = stableTextOpacity(frame, 18, 32);

  const subOp   = stableTextOpacity(frame, 38, 54);

  const anchorOp = stableTextOpacity(frame, 50, 64);

  // ── Typography sizing ──────────────────────────────────────────────────────
  const charCount = headline.length;
  const fontSize  = headlineSize(headline, headlineScale ?? 1.0);
  // Extreme letter-spacing for short headlines — typographic drama
  const letterSp  = charCount <= 6 ? 6 : charCount <= 10 ? 3 : 1;
  const headlineText = charCount <= 24 ? headline.toUpperCase() : headline;

  // ── Layout constants ───────────────────────────────────────────────────────
  const SIDE_PAD  = 52;   // left margin in px (of 1080px frame)
  const RIGHT_PAD = 48;
  const GRADIENT_START = Math.round((overlayOpacity ?? 0.68) * 100 * 0.55); // dynamic start

  const textShadow = '0 2px 12px rgba(0,0,0,1), 0 6px 32px rgba(0,0,0,0.90), 0 12px 60px rgba(0,0,0,0.75)';

  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>

      {/* ── Photo — Ken Burns from bottom-left ── */}
      <AbsoluteFill style={{
        transform: `scale(${photoScale}) translate3d(0, ${photoYpx}px, 0)`,
        transformOrigin: '40% 60%',
      }}>
        <Img src={photoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>

      {/* ── Layer 1: Radial edge vignette (photo atmosphere) ── */}
      <AbsoluteFill style={{
        background: 'radial-gradient(ellipse at 60% 40%, transparent 35%, rgba(0,0,0,0.35) 100%)',
      }} />

      {/* ── Layer 2: Top safe-zone (brand name readable) ── */}
      <AbsoluteFill style={{
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.50) 0%, rgba(0,0,0,0.15) 12%, transparent 22%)',
      }} />

      {/* ── Layer 3: Bottom content zone (deep, textured gradient) ── */}
      <AbsoluteFill style={{
        background: `linear-gradient(
          to bottom,
          transparent ${GRADIENT_START}%,
          rgba(0,0,0,0.60) ${GRADIENT_START + 18}%,
          rgba(0,0,0,0.88) ${GRADIENT_START + 30}%,
          rgba(0,0,0,0.96) 100%
        )`,
      }} />

      <StoryLogoTopCenter
        logoUrl={logoUrl}
        brandName={brandName}
        fontFamily={hero}
        opacity={brandOp}
        paddingTop="3.8%"
      />

      {/* ── BOTTOM CONTENT ZONE — LEFT ALIGNED ── */}
      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        paddingLeft: `${SIDE_PAD}px`, paddingRight: `${RIGHT_PAD}px`,
        paddingBottom: '6.5%',
      }}>

        {/* Vertical accent bar — left edge identity anchor */}
        <div style={{
          position: 'absolute',
          left: 0, bottom: '6%',
          width: 4,
          height: `${Math.round(barH * 1.2)}px`,
          maxHeight: 180,
          background: accentColor,
          borderRadius: '0 2px 2px 0',
          opacity: catOp,
          transformOrigin: 'top center',
        }} />

        {/* Category + horizontal rule row */}
        {categoryLabel && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            marginBottom: 14, opacity: catOp,
          }}>
            {/* Category text — micro, ultra-tracked */}
            <span style={{
              fontFamily: body, fontWeight: 500, fontSize: 13,
              color: accentColor, letterSpacing: 14,
              textTransform: 'uppercase',
              textShadow,
            }}>
              {categoryLabel}
            </span>
            {/* Horizontal rule — wipes right */}
            <div style={{
              height: 1, background: `linear-gradient(to right, ${accentColor}CC, transparent)`,
              width: `${Math.round(ruleW * 2)}px`, maxWidth: 120,
              flexShrink: 0,
            }} />
          </div>
        )}

        {/* Headline — left-aligned, dramatic weight, spring slam-up */}
        <div style={{ overflow: 'hidden', marginBottom: subtitle ? 16 : 24 }}>
          <HeadlineStack
            headline={headlineText}
            fontFamily={hero}
            fontWeight={headlineWeight ?? 900}
            fontSize={fontSize}
            color="#ffffff"
            primaryColor={primaryColor}
            accentColor={accentColor}
            uppercase={false}
            tracking={letterSp >= 3 ? 0.2 : letterSp >= 1 ? 0.08 : 0.02}
            frame={frame}
            fps={fps}
            startFrame={22}
            lineGap={1.0}
            textShadow={textShadow}
          />
        </div>

        {/* Subtitle — light italic, slight indent */}
        {subtitle && (
          <div style={{ opacity: subOp, marginBottom: 28, paddingLeft: 2 }}>
            <span style={{
              fontFamily: hero, fontWeight: 300, fontStyle: 'italic', fontSize: 22,
              color: 'rgba(255,255,255,0.90)', letterSpacing: 1.2, lineHeight: 1.5,
              display: 'block', maxWidth: '88%',
              textShadow: '0 1px 8px rgba(0,0,0,0.95), 0 3px 20px rgba(0,0,0,0.80)',
            }}>
              {subtitle}
            </span>
          </div>
        )}

        {/* Bottom row: accent bar + brand wordmark */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, opacity: anchorOp,
        }}>
          <div style={{ width: 32, height: 2, background: accentColor, borderRadius: 1, flexShrink: 0 }} />
          <span style={{
            fontFamily: body, fontWeight: 400, fontSize: 15,
            color: 'rgba(255,255,255,0.65)', letterSpacing: 5, textTransform: 'uppercase',
          }}>
            {brandName}
          </span>
        </div>
      </AbsoluteFill>
      <StoryAudioLayer audioMood={audioMood} voiceoverUrl={voiceoverUrl} />
    </AbsoluteFill>
  );
};
