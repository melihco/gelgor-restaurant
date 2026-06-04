/**
 * CinematicStory — Photo baskın, tek merkezi ifade, minimal overlay.
 *
 * Layout:
 *   - Slight reverse Ken Burns (103% → 100%) — peaceful zoom-out
 *   - Minimal radial vignette — photo breathes
 *   - Top / bottom safe-zone fades
 *   - Brand name — ultra-thin, top
 *   - Thin accent separator line mid-frame (fade-in)
 *   - Centered bold headline — simple fade
 *   - Light italic mood tagline below
 *   - Location / brand wordmark at very bottom
 *   - Accent bar bottom-right
 *
 * Best for: sunset, beach, atmosphere, nature content.
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
import {
  HeadlineStack,
  headlineSize,
  stableScale,
  stableTextLayerStyle,
  stableTextOpacity,
} from './shared/story-primitives';

export const CinematicStory: React.FC<StoryProps> = ({
  photoUrl,
  headline,
  subtitle = '',
  brandName,
  location = '',
  accentColor = '#c9a96e',
  fontFamily = 'Bodoni Moda',
  bodyFont,
  overlayOpacity,
  logoUrl = '',
}) => {
  const { hero, body } = useRemotionFonts('serif_editorial', fontFamily, bodyFont);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Reverse Ken Burns: 104% → 100% over 8s — deeply peaceful
  const photoScale = stableScale(interpolate(frame, [0, durationInFrames], [1.04, 1.00], {
    extrapolateRight: 'clamp',
  }));

  // Dynamic overlay based on headline length — more text = more opacity needed
  const dynamicOverlay = overlayOpacity ?? (headline.length > 12 ? 0.58 : 0.45);

  // Brand / logo — top center
  const logoOpacity = stableTextOpacity(frame, 0, 24);

  const lineOpacity = stableTextOpacity(frame, 10, 30);
  const subtitleOpacity = stableTextOpacity(frame, 34, 56);
  const locationOpacity = stableTextOpacity(frame, 50, 68);
  const accentOpacity = stableTextOpacity(frame, 22, 38);

  const fontSize = headlineSize(headline, 1);

  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>

      {/* Photo — reverse Ken Burns */}
      <AbsoluteFill style={{
        transform: `scale(${photoScale})`,
        transformOrigin: 'center center',
      }}>
        <Img src={photoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>

      {/* Full-frame base overlay — scales with photo brightness */}
      <AbsoluteFill style={{
        background: `rgba(0,0,0,${dynamicOverlay * 0.60})`,
      }} />

      {/* Center text zone darkening — focused gradient for headline area */}
      <AbsoluteFill style={{
        background: `radial-gradient(ellipse at 50% 45%, rgba(0,0,0,${dynamicOverlay * 0.55}) 0%, transparent 70%)`,
      }} />

      {/* Radial edge vignette */}
      <AbsoluteFill style={{
        background: 'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.45) 100%)',
      }} />

      {/* Top safe-zone fade */}
      <AbsoluteFill style={{
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 22%)',
      }} />

      {/* Bottom safe-zone fade */}
      <AbsoluteFill style={{
        background: 'linear-gradient(to top, rgba(0,0,0,0.40) 0%, transparent 20%)',
      }} />

      {/* Bottom safe-zone fade */}
      <AbsoluteFill style={{
        background: 'linear-gradient(to bottom, transparent 78%, rgba(0,0,0,0.58) 100%)',
      }} />

      <StoryLogoTopCenter
        logoUrl={logoUrl}
        brandName={brandName}
        fontFamily={hero}
        opacity={logoOpacity}
        paddingTop="4%"
      />

      {/* Center accent separator — thin line above headline */}
      <AbsoluteFill style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        paddingBottom: '15%', opacity: lineOpacity,
      }}>
        <div style={{ width: '6%', height: 2, borderRadius: 1, background: accentColor }} />
      </AbsoluteFill>

      <AbsoluteFill style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        paddingTop: '8%',
      }}>
        <div style={{ textAlign: 'center', padding: '0 11%', ...stableTextLayerStyle }}>
          <HeadlineStack
            headline={headline.toUpperCase()}
            fontFamily={hero}
            fontWeight={700}
            fontSize={fontSize}
            color="#fff"
            uppercase={false}
            tracking={0.12}
            frame={frame}
            fps={fps}
            startFrame={16}
            lineGap={1.15}
          />
        </div>
      </AbsoluteFill>

      {/* Subtitle — mood/tagline */}
      {subtitle ? (
        <AbsoluteFill style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          paddingTop: '38%',
        }}>
          <span style={{
            fontFamily: hero, fontWeight: 300, fontStyle: 'italic', fontSize: 28,
            color: 'rgba(255,255,255,0.92)', letterSpacing: 2,
            opacity: subtitleOpacity,
            ...stableTextLayerStyle,
            textAlign: 'center', maxWidth: '60%',
          }}>
            {subtitle}
          </span>
        </AbsoluteFill>
      ) : null}

      {/* Location tag at bottom */}
      <AbsoluteFill style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        paddingBottom: '4%', opacity: locationOpacity,
      }}>
        <span style={{
          fontFamily: body, fontWeight: 300, fontSize: 20,
          color: 'rgba(255,255,255,0.45)', letterSpacing: 7, textTransform: 'uppercase',
        }}>
          {location || brandName}
        </span>
      </AbsoluteFill>

      {/* Accent bar — bottom center */}
      <AbsoluteFill style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        paddingBottom: '2%', opacity: accentOpacity,
      }}>
        <div style={{ width: '10%', height: 2, borderRadius: 1, background: accentColor }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
