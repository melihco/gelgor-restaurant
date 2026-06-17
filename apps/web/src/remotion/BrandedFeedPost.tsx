/**
 * BrandedFeedPost — Branded static post card for Instagram Feed.
 *
 * Rendered via renderStill() as a single PNG frame (no animation).
 * Two formats: 1:1 (1080x1080) and 4:5 (1080x1350).
 *
 * Layout:
 *   - Photo occupies top 58% (1:1) or top 52% (4:5)
 *   - Thin accent separator line
 *   - Brand color panel — bottom area
 *   - Category label (small tracked caps, accent color)
 *   - Bold headline — brand typography
 *   - Thin subtitle / tagline
 *   - Brand name anchor — bottom, thin tracked
 *   - Accent bar bottom
 */
'use client';

import React from 'react';
import { AbsoluteFill, Img, useVideoConfig } from 'remotion';
import type { StoryProps } from './types';
import { splitHeadlineLines } from './shared/story-primitives';
import { useRemotionFonts } from './shared/useRemotionFonts';

interface FeedPostProps extends StoryProps {
  /** 1:1 square or 4:5 portrait */
  format?: '1:1' | '4:5';
}

export const BrandedFeedPost: React.FC<FeedPostProps> = ({
  photoUrl,
  headline,
  subtitle = '',
  categoryLabel = '',
  brandName,
  accentColor = '#c9a96e',
  primaryColor = '#1a2b4a',
  fontFamily = 'DM Serif Display',
  bodyFont,
  overlayOpacity = 0.92,
  format = '1:1',
}) => {
  const { hero, body } = useRemotionFonts('brand', fontFamily, bodyFont);
  const { width, height } = useVideoConfig();
  const photoPct = format === '4:5' ? 52 : 58;
  const photoHeightPx = Math.round(height * (photoPct / 100));
  const panelHeightPx = height - photoHeightPx;

  const headlineLines = splitHeadlineLines(headline, 3, format === '4:5' ? 16 : 14);
  const longestLine = headlineLines.reduce((a, b) => (a.length >= b.length ? a : b), headline);
  const headlineFontSize = longestLine.length < 12 ? 58
    : longestLine.length < 18 ? 48
    : longestLine.length < 26 ? 40
    : 32;
  const headlineText = headlineLines.map((l) => (l.length < 30 ? l.toUpperCase() : l));

  return (
    <AbsoluteFill style={{ background: primaryColor, overflow: 'hidden' }}>

      {/* ── Photo zone (top) ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%',
        height: photoHeightPx, overflow: 'hidden',
      }}>
        <Img
          src={photoUrl}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        {/* Slight bottom vignette into panel */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '28%',
          background: `linear-gradient(to bottom, transparent, ${primaryColor}CC)`,
        }} />
      </div>

      {/* ── Accent separator line ── */}
      <div style={{
        position: 'absolute',
        top: photoHeightPx - 2,
        left: 0, right: 0, height: 3,
        background: accentColor,
      }} />

      {/* ── Brand panel (bottom) ── */}
      <div style={{
        position: 'absolute',
        top: photoHeightPx,
        left: 0, right: 0, bottom: 0,
        background: primaryColor,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center',
        padding: `0 ${Math.round(width * 0.08)}px`,
      }}>
        {/* Category label */}
        {categoryLabel ? (
          <div style={{
            fontFamily: body, fontSize: 18, fontWeight: 400,
            color: accentColor, letterSpacing: 12,
            textTransform: 'uppercase', marginBottom: 14,
          }}>
            {categoryLabel}
          </div>
        ) : null}

        {/* Headline */}
        <div style={{
          fontFamily: hero, fontWeight: 800, fontSize: headlineFontSize,
          color: '#fff', lineHeight: 1.12, letterSpacing: 1,
          marginBottom: subtitle ? 16 : 0,
          maxWidth: '100%',
        }}>
          {headlineText.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>

        {/* Subtitle */}
        {subtitle ? (
          <div style={{
            fontFamily: hero, fontWeight: 300, fontStyle: 'italic',
            fontSize: 24, color: `rgba(255,255,255,0.65)`,
            letterSpacing: 1.5, lineHeight: 1.4,
          }}>
            {subtitle}
          </div>
        ) : null}

        {/* Brand name anchor */}
        <div style={{
          position: 'absolute', bottom: Math.round(panelHeightPx * 0.1),
          left: Math.round(width * 0.08), right: Math.round(width * 0.08),
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{
            fontFamily: body, fontWeight: 300, fontSize: 20,
            color: `rgba(255,255,255,0.45)`, letterSpacing: 8, textTransform: 'uppercase',
          }}>
            {brandName}
          </span>
          {/* Accent bar */}
          <div style={{ width: '8%', height: 2, borderRadius: 1, background: accentColor }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
