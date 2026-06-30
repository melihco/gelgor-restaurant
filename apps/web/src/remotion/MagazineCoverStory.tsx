/**
 * MagazineCoverStory — Editorial magazine / Awwwards cover aesthetic.
 *
 * Logo top-center, giant left-aligned headline, vertical accent bar, issue-style category.
 * Best for: brand stories, chef features, lifestyle editorials, venue spotlights.
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
import { HeadlineStack, headlineSize, stablePx, stableScale, stableTextOpacity, cinematicGradeFilter, CinematicLightLayer, FilmGrainOverlay, CornerTicks } from './shared/story-primitives';
import { StoryAudioLayer } from './shared/story-audio';

export const MagazineCoverStory: React.FC<StoryProps> = ({
  photoUrl,
  headline,
  subtitle = '',
  categoryLabel = 'FEATURE',
  brandName,
  accentColor = '#c9a96e',
  primaryColor = '#1a2b4a',
  fontFamily = 'Fraunces',
  bodyFont,
  overlayOpacity = 0.65,
  headlineWeight = 900,
  headlineScale = 1.0,
  logoUrl = '',
  location = '',
  audioMood,
  voiceoverUrl,
}) => {
  const { hero, body } = useRemotionFonts('serif_editorial', fontFamily, bodyFont);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const photoScale = stableScale(interpolate(frame, [0, durationInFrames], [1.03, 1.08], { extrapolateRight: 'clamp' }));
  const photoX = stablePx(interpolate(frame, [0, durationInFrames], [0, -24], { extrapolateRight: 'clamp' }));

  const logoOp = stableTextOpacity(frame, 0, 14);
  const barH = interpolate(frame, [8, 30], [0, 100], { extrapolateRight: 'clamp' });
  const catOp = stableTextOpacity(frame, 20, 36);
  const subOp = stableTextOpacity(frame, 48, 64);
  const locOp = stableTextOpacity(frame, 58, 72);

  const SIDE = 56;
  const charCount = headline.length;
  const fontSize = headlineSize(headline, (headlineScale ?? 1.0) * 1.15);
  const gradStart = Math.round((overlayOpacity ?? 0.65) * 55);

  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <AbsoluteFill style={{
        transform: `scale(${photoScale}) translateX(${photoX}px)`,
        transformOrigin: 'center center',
      }}>
        <Img src={photoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: cinematicGradeFilter('subtle') }} />
      </AbsoluteFill>

      <CinematicLightLayer warmth="neutral" intensity={0.8} origin="62% 26%" />
      <AbsoluteFill style={{
        background: `linear-gradient(105deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.35) 45%, transparent 70%)`,
      }} />
      <AbsoluteFill style={{
        background: `linear-gradient(to bottom, transparent ${gradStart}%, rgba(0,0,0,0.75) 100%)`,
      }} />
      <AbsoluteFill style={{
        background: `linear-gradient(to right, ${primaryColor}88 0%, transparent 35%)`,
      }} />

      <FilmGrainOverlay opacity={0.06} fine />
      <CornerTicks color={`${accentColor}cc`} inset={34} length={26} thickness={2} opacity={0.7} corners={['tl', 'tr']} />
      <StoryLogoTopCenter logoUrl={logoUrl} brandName={brandName} fontFamily={hero} opacity={logoOp} />

      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        paddingLeft: SIDE, paddingRight: 48, paddingBottom: '8%',
      }}>
        <div style={{
          position: 'absolute', left: 0, bottom: '8%',
          width: 5, height: `${barH * 2}px`, maxHeight: 320,
          background: accentColor, borderRadius: '0 3px 3px 0', opacity: catOp,
        }} />

        {categoryLabel && (
          <div style={{ opacity: catOp, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              fontFamily: body, fontWeight: 600, fontSize: 11, letterSpacing: 18,
              color: accentColor, textTransform: 'uppercase',
              writingMode: 'vertical-rl' as const, transform: 'rotate(180deg)',
            }}>
              {categoryLabel}
            </span>
            <div style={{ width: 48, height: 1, background: accentColor, opacity: 0.7 }} />
          </div>
        )}

        <div style={{ marginBottom: subtitle ? 18 : 28, maxWidth: '92%' }}>
          <HeadlineStack
            headline={charCount <= 28 ? headline.toUpperCase() : headline}
            fontFamily={hero}
            fontWeight={headlineWeight ?? 900}
            fontSize={fontSize}
            color="#fff"
            uppercase={false}
            tracking={charCount <= 12 ? 0.08 : 0}
            frame={frame}
            fps={fps}
            startFrame={28}
            lineGap={0.95}
            textShadow="0 3px 20px rgba(0,0,0,1), 0 12px 48px rgba(0,0,0,0.85)"
          />
        </div>

        {subtitle && (
          <div style={{ opacity: subOp, marginBottom: 24, maxWidth: '78%' }}>
            <span style={{
              fontFamily: hero, fontWeight: 300, fontSize: 24, color: 'rgba(255,255,255,0.88)',
              lineHeight: 1.4, letterSpacing: 0.5,
              textShadow: '0 2px 12px rgba(0,0,0,0.95)',
            }}>
              {subtitle}
            </span>
          </div>
        )}

        <div style={{ opacity: locOp, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 28, height: 2, background: accentColor }} />
          <span style={{
            fontFamily: body, fontWeight: 300, fontSize: 13, letterSpacing: 8,
            color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase',
          }}>
            {location || brandName}
          </span>
        </div>
      </AbsoluteFill>
      <StoryAudioLayer audioMood={audioMood} voiceoverUrl={voiceoverUrl} />
    </AbsoluteFill>
  );
};
