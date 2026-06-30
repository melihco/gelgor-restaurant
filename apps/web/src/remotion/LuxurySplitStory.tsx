/**
 * LuxurySplitStory — photo top + brand panel bottom.
 *
 * Typography lives ONLY in the bottom panel (never on the photo).
 * Photo zone: image + optional logo + soft bottom fade into panel.
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
import { HeadlineStack, headlineSize, stableScale, stableTextOpacity, cinematicGradeFilter, CinematicLightLayer, FilmGrainOverlay } from './shared/story-primitives';
import { StoryAudioLayer } from './shared/story-audio';

/** Photo share of frame height — panel gets the rest for headline/subtitle/CTA */
const PHOTO_HEIGHT_RATIO = 0.56;

export const LuxurySplitStory: React.FC<StoryProps> = ({
  photoUrl,
  headline,
  subtitle = '',
  categoryLabel = '',
  brandName,
  location = '',
  accentColor = '#c9a96e',
  primaryColor = '#1a2b4a',
  fontFamily = 'Bodoni Moda',
  bodyFont,
  headlineWeight = 800,
  headlineScale = 1.0,
  logoUrl = '',
  cta = '',
  audioMood,
  voiceoverUrl,
}) => {
  const { hero, body } = useRemotionFonts('serif_editorial', fontFamily, bodyFont);
  const frame = useCurrentFrame();
  const { fps, durationInFrames, height: frameHeight } = useVideoConfig();

  const photoHeightPx = Math.round(frameHeight * PHOTO_HEIGHT_RATIO);
  const panelHeightPx = frameHeight - photoHeightPx;

  const photoScale = stableScale(interpolate(frame, [0, durationInFrames], [1.04, 1.0], {
    extrapolateRight: 'clamp',
  }));

  const lineWidth = Math.round(interpolate(frame, [8, 32], [0, 100], { extrapolateRight: 'clamp' }));
  const panelOpacity = stableTextOpacity(frame, 0, 16);
  const metaOpacity = stableTextOpacity(frame, 8, 24);
  const subOpacity = stableTextOpacity(frame, 28, 44);
  const ctaOpacity = stableTextOpacity(frame, 38, 54);

  const charCount = headline.length;
  const fontSize = headlineSize(headline, headlineScale ?? 1.0);
  const headlineText = charCount <= 28 ? headline.toUpperCase() : headline;
  const panelBg = primaryColor || '#1a2b4a';

  return (
    <AbsoluteFill style={{ background: panelBg, overflow: 'hidden' }}>

      {/* ── Photo zone (no typography) ── */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: photoHeightPx,
        overflow: 'hidden',
      }}>
        <div style={{
          transform: `scale(${photoScale})`,
          transformOrigin: 'center center',
          width: '100%',
          height: '100%',
        }}>
          <Img src={photoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: cinematicGradeFilter('subtle') }} />
        </div>
        <CinematicLightLayer warmth="neutral" intensity={0.65} origin="50% 16%" />
        <FilmGrainOverlay opacity={0.05} fine />
        {/* Fade photo into panel — no text here */}
        <div style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '22%',
          background: `linear-gradient(to bottom, transparent 0%, ${panelBg} 100%)`,
          pointerEvents: 'none',
        }} />
      </div>

      <StoryLogoTopCenter
        logoUrl={logoUrl}
        brandName={brandName}
        fontFamily={hero}
        opacity={metaOpacity}
        paddingTop="6.5%"
      />

      {/* Accent separator at panel top */}
      <div style={{
        position: 'absolute',
        top: photoHeightPx - 2,
        left: 0,
        width: `${lineWidth}%`,
        height: 3,
        background: accentColor,
        zIndex: 5,
      }} />

      {/* ── Brand panel — all copy lives here ── */}
      <div style={{
        position: 'absolute',
        top: photoHeightPx,
        left: 0,
        right: 0,
        height: panelHeightPx,
        background: panelBg,
        opacity: panelOpacity,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 56px 40px',
        boxSizing: 'border-box',
        textAlign: 'center',
        zIndex: 4,
      }}>
        {categoryLabel ? (
          <span style={{
            fontFamily: body, fontWeight: 600, fontSize: 13, letterSpacing: 14,
            textTransform: 'uppercase',
            color: accentColor,
            opacity: metaOpacity,
            marginBottom: 16,
          }}>
            {categoryLabel}
          </span>
        ) : null}

        {!categoryLabel && brandName && !logoUrl ? (
          <span style={{
            fontFamily: body, fontWeight: 300, fontSize: 18, letterSpacing: 10,
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.45)',
            opacity: metaOpacity,
            marginBottom: 14,
          }}>
            {brandName}
          </span>
        ) : null}

        <div style={{ maxWidth: '100%' }}>
          <HeadlineStack
            headline={headlineText}
            fontFamily={hero}
            fontWeight={headlineWeight ?? 800}
            fontSize={fontSize}
            color="#fff"
            primaryColor={primaryColor}
            accentColor={accentColor}
            uppercase={false}
            tracking={charCount <= 14 ? 0.08 : 0.02}
            frame={frame}
            fps={fps}
            startFrame={14}
            lineGap={1.08}
          />
        </div>

        {subtitle ? (
          <span style={{
            fontFamily: hero, fontWeight: 300, fontStyle: 'italic', fontSize: 28,
            color: accentColor,
            letterSpacing: 0.5,
            lineHeight: 1.35,
            marginTop: 18,
            opacity: subOpacity,
            maxWidth: '88%',
            display: 'block',
          }}>
            {subtitle}
          </span>
        ) : null}

        {cta ? (
          <div style={{
            marginTop: 24,
            opacity: ctaOpacity,
            padding: '12px 28px',
            borderRadius: 999,
            border: `1.5px solid ${accentColor}`,
            background: `${accentColor}22`,
          }}>
            <span style={{
              fontFamily: body, fontWeight: 700, fontSize: 18, letterSpacing: 3,
              textTransform: 'uppercase',
              color: '#fff',
            }}>
              {cta}
            </span>
          </div>
        ) : null}

        {location ? (
          <span style={{
            fontFamily: body, fontWeight: 400, fontSize: 16,
            color: 'rgba(255,255,255,0.42)',
            letterSpacing: 2,
            textTransform: 'uppercase',
            marginTop: 20,
            opacity: subOpacity,
          }}>
            {location}
          </span>
        ) : null}

        <span style={{
          fontFamily: body, fontWeight: 300, fontSize: 22,
          color: 'rgba(255,255,255,0.22)',
          letterSpacing: 12,
          marginTop: 'auto',
          paddingTop: 16,
          opacity: subOpacity,
        }}>
          · · ·
        </span>
      </div>
      <StoryAudioLayer audioMood={audioMood} voiceoverUrl={voiceoverUrl} />
    </AbsoluteFill>
  );
};
