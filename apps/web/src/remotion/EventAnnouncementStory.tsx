/**
 * EventAnnouncementStory — Professional event announcement story.
 *
 * Layout strategy: ALL content elements live in ONE flexbox column
 * at the bottom of the frame. No multiple AbsoluteFills competing
 * for the same vertical space → zero overlap by design.
 *
 * Zones:
 *   TOP    — Brand name (top center, ultra-thin tracked)
 *   MIDDLE — Photo breathing room
 *   BOTTOM — Single flex column: Category → Headline → Subtitle? → Date? → CTA? → Brand anchor
 *
 * Duration: 8s @ 30fps = 240 frames
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
import { StoryAudioLayer } from './shared/story-audio';

interface EventStoryProps extends StoryProps {
  eventDate?: string;
  eventTime?: string;
  cta?: string;
  ctaUrl?: string;
  logoUrl?: string;
}

export const EventAnnouncementStory: React.FC<EventStoryProps> = ({
  photoUrl,
  headline,
  subtitle = '',
  categoryLabel = 'EVENT',
  brandName,
  accentColor = '#c9a96e',
  primaryColor = '#1a2b4a',
  fontFamily = 'Archivo Black',
  bodyFont,
  overlayOpacity = 0.78,
  headlineWeight = 900,
  headlineScale = 1.0,
  eventDate = '',
  eventTime = '',
  cta = '',
  ctaUrl = '',
  logoUrl = '',
  audioMood = '',
  voiceoverUrl,
}) => {
  const { hero, body } = useRemotionFonts('display_bold', fontFamily, bodyFont);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Ken Burns: 100% → 106%
  const photoScale = stableScale(interpolate(frame, [0, durationInFrames], [1.0, 1.06], { extrapolateRight: 'clamp' }));

  // Deep overlay builds for readability (critical for event text on photo)
  const overlayAlpha = interpolate(frame, [0, 50], [0.35, overlayOpacity], { extrapolateRight: 'clamp' });

  // ── Animation timings (staggered, each element independent) ──────────────────
  // Logo: instant at frame 0 — always visible as brand anchor from the first frame
  const brandOpacity    = stableTextOpacity(frame, 0, 8);
  const catOpacity      = stableTextOpacity(frame, 8, 26);
  const subtitleOpacity = stableTextOpacity(frame, 32, 48);
  const dateOpacity     = stableTextOpacity(frame, 46, 60);
  const ctaOpacity      = stableTextOpacity(frame, 60, 76);
  const barOpacity      = stableTextOpacity(frame, 70, 84);

  const fontSize   = headlineSize(headline, headlineScale ?? 1.0);
  const headlineText = headline.length < 26 ? headline.toUpperCase() : headline;

  // ── Count active bottom elements to size the bottom zone correctly ────────────
  const hasSubtitle = Boolean(subtitle);
  const hasDate     = Boolean(eventDate || eventTime);
  const hasCta      = Boolean(cta);

  // How many elements stacked in bottom zone — controls gradient depth
  const bottomElementCount = 1 + (hasSubtitle ? 1 : 0) + (hasDate ? 1 : 0) + (hasCta ? 1 : 0);
  // Bottom zone height: more elements = taller zone
  const bottomZonePct = Math.min(48, 28 + bottomElementCount * 5);

  return (
    <AbsoluteFill style={{ background: '#111', overflow: 'hidden' }}>

      <StoryAudioLayer audioMood={audioMood} voiceoverUrl={voiceoverUrl} />

      {/* ── Photo — Ken Burns, fills full frame ── */}
      <AbsoluteFill style={{ transform: `scale(${photoScale})`, transformOrigin: 'center 40%' }}>
        <Img src={photoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>

      {/* ── DIRECTIONAL GRADIENT: photo breathes in top 55%, dark only in bottom zone ── */}
      {/* Layer 1: very subtle vignette only (not a blackout) */}
      <AbsoluteFill style={{
        background: 'radial-gradient(ellipse at 50% 30%, transparent 40%, rgba(0,0,0,0.18) 100%)',
      }} />
      {/* Layer 2: strong bottom-only dark gradient for text readability */}
      <AbsoluteFill style={{
        background: `linear-gradient(
          to bottom,
          transparent 0%,
          transparent 42%,
          rgba(0,0,0,0.55) 58%,
          rgba(0,0,0,0.88) 72%,
          ${primaryColor}F5 100%
        )`,
      }} />
      {/* Layer 3: top safe zone very subtle fade */}
      <AbsoluteFill style={{
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.30) 0%, transparent 14%)',
      }} />

      {/* ── TOP: Logo top-center (shared agency standard) ── */}
      <StoryLogoTopCenter
        logoUrl={logoUrl}
        brandName={brandName}
        fontFamily={hero}
        opacity={brandOpacity}
        paddingTop="4%"
      />

      {/* ── BOTTOM COLUMN: single flexbox — mathematical no-overlap guarantee ── */}
      <AbsoluteFill style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'center',
        // Bottom padding: enough room for safe area + CTA not cut off
        padding: `0 8% ${Math.max(6, 100 - bottomZonePct - 2)}px`,
        boxSizing: 'border-box',
      }}>

        {/* Category label — premium spacing */}
        <div style={{
          opacity: catOpacity,
          marginBottom: 14,
          fontFamily: body, fontWeight: 400, fontSize: 13,
          color: accentColor,
          letterSpacing: 18,
          textTransform: 'uppercase',
          textAlign: 'center',
        }}>
          {categoryLabel}
        </div>

        {/* Accent line above headline */}
        <div style={{
          width: 40, height: 1.5, background: accentColor,
          opacity: catOpacity * 0.7,
          marginBottom: 16,
        }} />

        <div style={{
          marginBottom: hasSubtitle ? 14 : hasDate ? 24 : 28,
          width: '100%',
          textAlign: 'center',
          overflow: 'hidden',
        }}>
          <HeadlineStack
            headline={headlineText}
            fontFamily={hero}
            fontWeight={headlineWeight ?? 900}
            fontSize={fontSize}
            color="#ffffff"
            uppercase={false}
            tracking={headline.length < 12 ? 0.12 : 0.04}
            frame={frame}
            fps={fps}
            startFrame={16}
            lineGap={1.08}
            textShadow="0 2px 24px rgba(0,0,0,0.9), 0 0 60px rgba(0,0,0,0.5)"
          />
        </div>

        {/* Subtitle — own opacity, separated from headline */}
        {hasSubtitle && (
          <div style={{
            opacity: subtitleOpacity,
            marginBottom: hasDate ? 20 : hasCta ? 24 : 24,
            textAlign: 'center',
            maxWidth: '78%',
          }}>
            <span style={{
              fontFamily: hero, fontWeight: 300, fontStyle: 'italic', fontSize: 22,
              color: 'rgba(255,255,255,0.75)',
              letterSpacing: 2,
              lineHeight: 1.45,
            }}>
              {subtitle}
            </span>
          </div>
        )}

        {/* Date + Time badge — own spring animation, own opacity */}
        {hasDate && (
          <div style={{
            ...stableTextLayerStyle,
            opacity: dateOpacity,
            marginBottom: hasCta ? 22 : 28,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 16,
            padding: '12px 28px',
            borderRadius: 4,
            border: `1px solid ${accentColor}`,
            background: 'rgba(0,0,0,0.78)',
            alignSelf: 'center',
          }}>
            {eventDate && (
              <span style={{
                fontFamily: body, fontWeight: 600, fontSize: 18,
                color: accentColor, letterSpacing: 2,
              }}>
                {eventDate}
              </span>
            )}
            {eventDate && eventTime && (
              <div style={{ width: 1, height: 16, background: `${accentColor}50` }} />
            )}
            {eventTime && (
              <span style={{
                fontFamily: body, fontWeight: 300, fontSize: 18,
                color: 'rgba(255,255,255,0.90)', letterSpacing: 2,
              }}>
                {eventTime}
              </span>
            )}
          </div>
        )}

        {/* CTA button — never cut off, generous bottom spacing */}
        {hasCta && (
          <div style={{
            opacity: ctaOpacity,
            ...stableTextLayerStyle,
            marginBottom: ctaUrl ? 8 : 32,
            alignSelf: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0,
          }}>
            {/* CTA Button */}
            <div style={{
              padding: '15px 48px',
              borderRadius: 6,
              background: accentColor,
              fontFamily: body, fontWeight: 700, fontSize: 16,
              color: '#fff',
              letterSpacing: 4,
              textTransform: 'uppercase',
              boxShadow: `0 4px 24px ${accentColor}60`,
            }}>
              {cta}
            </div>

            {/* URL below CTA — clean domain, no protocol */}
            {ctaUrl && (
              <div style={{
                marginTop: 10,
                fontFamily: body, fontWeight: 300, fontSize: 16,
                color: 'rgba(255,255,255,0.60)',
                letterSpacing: 2,
                // Show only the domain, strip https://www.
                textDecoration: 'none',
              }}>
                {ctaUrl
                  .replace(/^https?:\/\/(www\.)?/, '')  // strip protocol + www
                  .replace(/\/$/, '')                    // strip trailing slash
                  .split('/')[0]                         // only domain, no path
                }
              </div>
            )}
          </div>
        )}
        {/* Extra margin after CTA+URL block */}
        {hasCta && ctaUrl && <div style={{ height: 24 }} />}

        {/* Accent bar */}
        <div style={{
          opacity: barOpacity,
          width: '12%', height: 2, borderRadius: 1,
          background: accentColor,
          alignSelf: 'center',
          marginBottom: 16,
        }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
