/**
 * SpecStory — catalog-driven Remotion composition (100+ templates via templateId).
 */
'use client';

import React from 'react';
import type { RemotionLayoutSpec } from '../lib/remotion-template-types';
import { getRemotionTemplate } from '../lib/remotion-template-catalog';
import { getBrandKit } from '../lib/agency-brand-kits';
import type { StoryProps } from './types';
import { StoryLayoutEngine } from './StoryLayoutEngine';

export interface SpecStoryProps extends StoryProps {
  templateId?: string;
  kitId?: string;
  layoutSpecPatch?: Partial<RemotionLayoutSpec>;
}

function mergeLayoutSpec(
  base: RemotionLayoutSpec,
  patch?: Partial<RemotionLayoutSpec>,
): RemotionLayoutSpec {
  if (!patch) return base;
  return { ...base, ...patch };
}

export const SpecStory: React.FC<SpecStoryProps> = (props) => {
  const template = getRemotionTemplate(props.templateId ?? 'remotion_editorial_bottom_01');
  const kit = props.kitId ? getBrandKit(props.kitId) : undefined;

  if (!template) {
    return (
      <StoryLayoutEngine
        {...props}
        layoutSpec={{
          family: 'editorial_bottom',
          collection: 'Editorial',
          fontPersonality: 'brand',
          heroWeight: 800,
          heroUppercase: true,
          heroTracking: 0.04,
          heroScale: 1,
          subtitleItalic: true,
          categoryTracking: 0.12,
          backgroundMode: 'photo_full',
          gradientStart: 0.52,
          gradientEnd: 0.82,
          overlayOpacity: 0.68,
          panelRatio: 0.44,
          kenBurnsOrigin: '40% 60%',
          kenBurnsScale: 1.08,
          vignette: 'soft',
          duotoneWash: 'none',
          duotoneOpacity: 0.35,
          textZone: 'bottom_left',
          align: 'left',
          accentLine: 'left_bar',
          accentLineWidth: 0.04,
          frame: 'none',
          frostedCard: false,
          frostedY: 0.62,
          sideBar: 'none',
          showLocation: true,
          showCtaPill: false,
          categoryVertical: false,
          panelUsesPrimary: true,
          accentOnCategory: true,
          textOnPhoto: true,
        }}
      />
    );
  }

  const merged: StoryProps = {
    ...props,
    primaryColor: props.primaryColor ?? kit?.primaryColor,
    accentColor: props.accentColor ?? kit?.accentColor,
    fontFamily: props.fontFamily ?? kit?.headingFont,
    bodyFont: props.bodyFont ?? kit?.bodyFont,
    headlineColor: props.headlineColor,
    subtitleColor: props.subtitleColor,
    categoryColor: props.categoryColor,
    overlayColor: props.overlayColor,
    overlayOpacity: props.overlayOpacity ?? template.spec.overlayOpacity,
    headlineWeight: props.headlineWeight ?? template.spec.heroWeight,
    headlineScale: props.headlineScale ?? template.spec.heroScale,
  };

  const layoutSpec = mergeLayoutSpec(template.spec, {
    ...props.layoutSpecPatch,
    overlayOpacity: merged.overlayOpacity ?? props.layoutSpecPatch?.overlayOpacity ?? template.spec.overlayOpacity,
    heroWeight: merged.headlineWeight ?? props.layoutSpecPatch?.heroWeight ?? template.spec.heroWeight,
    heroScale: merged.headlineScale ?? props.layoutSpecPatch?.heroScale ?? template.spec.heroScale,
  });

  return <StoryLayoutEngine {...merged} layoutSpec={layoutSpec} />;
};
