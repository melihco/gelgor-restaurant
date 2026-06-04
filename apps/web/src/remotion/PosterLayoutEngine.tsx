/**
 * PosterLayoutEngine — agency poster renderer (event, lineup, promo, gala…).
 */
'use client';

import React from 'react';
import { AbsoluteFill, Img, useVideoConfig } from 'remotion';
import type { PosterLayoutSpec } from '../lib/poster-template-types';
import type { StoryProps } from './types';
import { headlineSize, splitHeadlineLines } from './shared/story-primitives';
import { useRemotionFonts } from './shared/useRemotionFonts';

export interface PosterLayoutProps extends StoryProps {
  layoutSpec: PosterLayoutSpec;
  format?: 'story' | 'post' | 'portrait' | '1:1' | '4:5';
  lineupArtists?: string[];
}

function parseLineup(subtitle: string, extras?: string[]): string[] {
  const fromSub = subtitle.split(/[·|,|\n]/).map((s) => s.trim()).filter(Boolean);
  const merged = [...(extras ?? []), ...fromSub];
  return [...new Set(merged)].slice(0, 8);
}

export const PosterLayoutEngine: React.FC<PosterLayoutProps> = ({
  photoUrl, headline, subtitle = '', categoryLabel = '', brandName, location = '',
  eventDate = '', eventTime = '', cta = '',
  primaryColor = '#1a2b4a', accentColor = '#c9a96e', fontFamily = 'Archivo Black',
  bodyFont, logoUrl = '', layoutSpec: spec, format = 'story', lineupArtists,
}) => {
  const { hero, body } = useRemotionFonts(spec.fontPersonality, fontFamily, bodyFont);
  const fonts = { hero, body };
  const { width, height } = useVideoConfig();
  const photoH = Math.round(height * spec.photoRatio);
  const isPromoSplit = spec.posterMode === 'promo_split';
  const panelBg = spec.panelUsesPrimary ? primaryColor : '#0a0a0f';
  const lineup = parseLineup(subtitle, lineupArtists);
  const headlineLines = splitHeadlineLines(
    spec.heroUppercase ? headline.toUpperCase() : headline,
    3,
    format === 'post' ? 14 : 16,
  );
  const longestLine = headlineLines.reduce((a, b) => (a.length >= b.length ? a : b), '');
  const headSize = Math.round(
    headlineSize(longestLine, spec.heroScale * (headlineLines.length > 2 ? 0.88 : 1))
    * (format === 'post' ? 0.85 : 1),
  );
  const headerH = spec.posterHeader === 'none' ? 0 : Math.round(width * 0.072);
  const footerH = spec.posterFooter === 'none' ? 0 : Math.round(width * 0.072);
  const footerInfo = [eventDate, eventTime, location].filter(Boolean).join('  ·  ');
  const dateDisplay = eventDate || categoryLabel;

  const HeaderBar = () => {
    if (!spec.posterHeader || spec.posterHeader === 'none') return null;
    const label = brandName || categoryLabel;
    const barStyle: React.CSSProperties = {
      position: 'absolute', top: 0, left: 0, right: 0, height: headerH,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: spec.posterHeader === 'accent_bar'
        ? `linear-gradient(180deg, ${accentColor}f5 0%, ${accentColor}cc 100%)`
        : 'transparent',
      borderBottom: spec.posterHeader === 'outline_bar' ? `1px solid ${accentColor}55` : undefined,
    };
    return (
      <div style={barStyle}>
        {spec.posterHeader === 'knockout_bar' ? (
          <span style={{
            padding: '8px 20px', borderRadius: 6, background: accentColor, color: '#fff',
            fontFamily: fonts.body, fontSize: Math.round(headerH * 0.38), fontWeight: 700, letterSpacing: 3,
          }}>
            {label.toUpperCase()}
          </span>
        ) : (
          <span style={{
            fontFamily: fonts.body, fontSize: Math.round(headerH * 0.4), fontWeight: 700,
            letterSpacing: 4, color: spec.posterHeader === 'accent_bar' ? '#fff' : accentColor,
            textTransform: 'uppercase',
          }}>
            {label}
          </span>
        )}
      </div>
    );
  };

  const FooterBar = () => {
    if (!spec.posterFooter || spec.posterFooter === 'none' || !footerInfo) return null;
    const top = height - footerH;
    if (spec.posterFooter === 'pill_row') {
      const pills = [footerInfo, cta].filter(Boolean);
      return (
        <div style={{
          position: 'absolute', left: 0, right: 0, top, height: footerH,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '0 16px',
          background: 'rgba(0,0,0,0.45)',
        }}>
          {pills.map((p) => (
            <span key={p} style={{
              padding: '8px 16px', borderRadius: 999, border: `1px solid ${accentColor}`,
              fontFamily: fonts.body, fontSize: 12, fontWeight: 600, letterSpacing: 2, color: '#fff',
              textTransform: 'uppercase',
            }}>
              {p}
            </span>
          ))}
        </div>
      );
    }
    return (
      <div style={{
        position: 'absolute', left: 0, right: 0, top, height: footerH,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: spec.posterFooter === 'solid_bar'
          ? `linear-gradient(180deg, ${accentColor}cc 0%, ${accentColor}f0 100%)`
          : 'rgba(0,0,0,0.5)',
      }}>
        <span style={{
          fontFamily: fonts.body, fontSize: Math.round(footerH * 0.38), fontWeight: 600,
          letterSpacing: 3, color: '#fff', textTransform: 'uppercase',
        }}>
          {footerInfo}
        </span>
      </div>
    );
  };

  const LineupBlock = () => {
    if (!['lineup_tiered', 'lineup_stack', 'dj_set', 'festival_grid'].includes(spec.posterMode) || !lineup.length) {
      return null;
    }
    return (
      <div style={{ marginTop: 16, width: '100%' }}>
        {lineup.map((artist, i) => {
          const tierScale = spec.posterMode === 'lineup_tiered' ? 1 - i * 0.08 : 1;
          const size = Math.round(22 * tierScale);
          const opacity = spec.posterMode === 'lineup_tiered' ? 1 - i * 0.12 : 0.85;
          return (
            <div key={artist} style={{
              fontFamily: fonts.body, fontSize: size, fontWeight: i === 0 ? 700 : 500,
              letterSpacing: i === 0 ? 3 : 2, color: '#fff', opacity,
              textTransform: 'uppercase', marginBottom: 6, textAlign: spec.align,
            }}>
              {artist}
            </div>
          );
        })}
      </div>
    );
  };

  const EditorialDate = () => {
    if (spec.posterMode !== 'editorial_date' || !dateDisplay) return null;
    return (
      <div style={{
        position: 'absolute', top: headerH + 40, right: 32, opacity: 0.15,
        fontFamily: fonts.hero, fontSize: Math.round(width * 0.22), fontWeight: 900,
        color: '#fff', lineHeight: 1, pointerEvents: 'none',
      }}>
        {dateDisplay.replace(/\s/g, '\n')}
      </div>
    );
  };

  const contentTop = headerH + Math.round(height * 0.08);
  const contentBottom = height - footerH - Math.round(height * 0.06);

  return (
    <AbsoluteFill style={{ background: panelBg, overflow: 'hidden' }}>
      {/* Photo zone */}
      <div style={{
        position: 'absolute', top: headerH, left: 0, right: 0,
        height: isPromoSplit ? photoH : height - headerH,
        overflow: 'hidden',
      }}>
        <Img src={photoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <AbsoluteFill style={{
          background: `linear-gradient(to bottom, transparent ${Math.round(spec.gradientStart * 100)}%, rgba(0,0,0,${spec.overlayOpacity}) ${Math.round(spec.gradientEnd * 100)}%)`,
        }} />
        {spec.duotoneWash !== 'none' && (
          <AbsoluteFill style={{
            background: spec.duotoneWash === 'accent' ? accentColor : primaryColor,
            opacity: spec.duotoneOpacity, mixBlendMode: 'multiply',
          }} />
        )}
        {spec.vignette !== 'none' && (
          <AbsoluteFill style={{
            background: `radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,${spec.vignette === 'noir' ? 0.8 : 0.55}) 100%)`,
          }} />
        )}
      </div>

      {isPromoSplit && (
        <div style={{
          position: 'absolute', top: headerH + photoH, left: 0, right: 0, bottom: footerH,
          background: panelBg,
        }} />
      )}

      {spec.frame !== 'none' && (
        <AbsoluteFill style={{
          boxSizing: 'border-box',
          border: spec.frame === 'double' ? `5px double ${accentColor}` : `2px solid ${accentColor}88`,
          margin: 20, pointerEvents: 'none',
        }} />
      )}

      <HeaderBar />
      <EditorialDate />

      {/* Content */}
      <div style={{
        position: 'absolute', left: 48, right: 48,
        top: contentTop, bottom: contentBottom,
        display: 'flex', flexDirection: 'column',
        justifyContent: isPromoSplit ? 'flex-start' : 'center',
        alignItems: spec.align === 'left' ? 'flex-start' : spec.align === 'right' ? 'flex-end' : 'center',
        textAlign: spec.align,
      }}>
        {spec.showDateBadge && dateDisplay && spec.posterMode !== 'editorial_date' && (
          <span style={{
            fontFamily: fonts.body, fontSize: 12, letterSpacing: 6, textTransform: 'uppercase',
            color: accentColor, marginBottom: 12,
          }}>
            {dateDisplay}{eventTime ? ` · ${eventTime}` : ''}
          </span>
        )}

        {(spec.accentLine === 'above' || spec.accentLine === 'both') && (
          <div style={{ width: 56, height: 3, background: accentColor, marginBottom: 14 }} />
        )}

        <div style={{
          fontFamily: fonts.hero, fontWeight: spec.heroWeight, fontSize: headSize,
          color: '#fff', lineHeight: 1.08, letterSpacing: spec.heroTracking * 100,
          textTransform: spec.heroUppercase ? 'uppercase' : 'none',
          textShadow: spec.neonGlow ? `0 0 24px ${accentColor}, 0 0 48px ${accentColor}88` : '0 4px 24px rgba(0,0,0,0.8)',
          maxWidth: '100%',
          wordBreak: 'break-word',
        }}>
          {headlineLines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>

        {(spec.accentLine === 'underline' || spec.accentLine === 'both') && (
          <div style={{ width: '60%', height: 2, background: accentColor, marginTop: 12, opacity: 0.7 }} />
        )}

        <LineupBlock />

        {!lineup.length && subtitle && spec.posterMode !== 'lineup_tiered' && (
          <span style={{
            fontFamily: fonts.body, fontSize: 20, color: 'rgba(255,255,255,0.78)',
            marginTop: 14, fontStyle: 'italic', maxWidth: '92%',
          }}>
            {subtitle}
          </span>
        )}

        {spec.showCta && cta && spec.posterFooter === 'none' && (
          <span style={{
            marginTop: 20, padding: '12px 28px', borderRadius: 999,
            border: `2px solid ${accentColor}`, fontFamily: fonts.body,
            fontSize: 14, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#fff',
          }}>
            {cta}
          </span>
        )}

        {logoUrl ? (
          <img src={logoUrl} alt="" style={{ marginTop: 20, height: 36, objectFit: 'contain', opacity: 0.9 }} />
        ) : null}
      </div>

      <FooterBar />
    </AbsoluteFill>
  );
};
