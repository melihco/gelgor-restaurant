/**
 * SpecPoster — catalog-driven poster composition (50 templates × 3 formats).
 * Production renders use poster-render-service (SVG + Sharp), not this CSS preview.
 */
'use client';

import React from 'react';
import { getPosterTemplate } from '../lib/poster-template-catalog';
import { getBrandKit } from '../lib/agency-brand-kits';
import type { StoryProps } from './types';
import { PosterLayoutEngine } from './PosterLayoutEngine';

export interface SpecPosterProps extends StoryProps {
  posterTemplateId?: string;
  templateId?: string;
  kitId?: string;
  format?: 'story' | 'post' | 'portrait' | '1:1' | '4:5';
  lineupArtists?: string[];
}

export const SpecPoster: React.FC<SpecPosterProps> = (props) => {
  const posterId = props.posterTemplateId ?? props.templateId ?? 'poster_lineup_tiered_01';
  const template = getPosterTemplate(posterId);
  const kit = props.kitId ? getBrandKit(props.kitId) : undefined;

  const fmt = props.format === '1:1' ? 'post' : props.format === '4:5' ? 'portrait' : (props.format ?? 'story');

  if (!template) {
    return (
      <PosterLayoutEngine
        {...props}
        format={fmt}
        layoutSpec={{
          family: 'lineup_tiered', collection: 'Event', posterMode: 'lineup_tiered',
          posterHeader: 'accent_bar', posterFooter: 'solid_bar',
          fontPersonality: 'display_bold', heroWeight: 900, heroUppercase: true,
          heroTracking: 0.06, heroScale: 1, photoRatio: 0.42, gradientStart: 0.28,
          gradientEnd: 0.88, overlayOpacity: 0.72, duotoneWash: 'none', duotoneOpacity: 0.4,
          neonGlow: false, vignette: 'radial', align: 'center', accentLine: 'both',
          frame: 'none', showDateBadge: true, showCta: true, panelUsesPrimary: true,
        }}
      />
    );
  }

  return (
    <PosterLayoutEngine
      {...props}
      format={fmt}
      lineupArtists={props.lineupArtists}
      primaryColor={props.primaryColor ?? kit?.primaryColor}
      accentColor={props.accentColor ?? kit?.accentColor}
      fontFamily={props.fontFamily ?? kit?.headingFont}
      bodyFont={props.bodyFont ?? kit?.bodyFont}
      layoutSpec={template.spec}
    />
  );
};
