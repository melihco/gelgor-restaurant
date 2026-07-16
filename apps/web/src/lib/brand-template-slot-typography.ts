/**
 * Template kütüphanesi slot → tipografi (fontPersonality + heading/body).
 * Marka renkleri ayrı kalır; font şablon veya marka/özel moda göre seçilir.
 */
import type { FontPersonality } from './story-template-types';
import { getStoryTemplate } from './story-template-catalog';
import { getPosterTemplate } from './poster-template-catalog';
import {
  GOOGLE_FONT_SPECS,
  resolveFontStack,
  resolveProductionStoryFonts,
} from './premium-font-registry';

export type SlotFontMode = 'template' | 'brand' | 'custom';
export type SlotTypographyFormat = 'story' | 'post' | 'poster';

export interface SlotTypographyFields {
  fontMode?: SlotFontMode;
  fontPersonality?: FontPersonality;
  headingFont?: string;
  bodyFont?: string;
  format: SlotTypographyFormat;
  storyTemplateId?: string;
  posterTemplateId?: string;
}

export const SLOT_FONT_MODE_LABELS: Record<SlotFontMode, string> = {
  template: 'Şablon fontu',
  brand: 'Marka fontu',
  custom: 'Özel font',
};

export const FONT_PERSONALITY_LABELS_TR: Record<FontPersonality, string> = {
  brand: 'Marka editorial',
  serif_editorial: 'Serif editorial',
  sans_modern: 'Modern sans',
  display_bold: 'Display bold',
  script: 'Script / el yazısı',
  graphic_pop: 'Graphic pop',
  neo_grotesk: 'Neo grotesk',
  luxury_serif: 'Luxury serif',
  poster_display: 'Poster display',
  fashion_editorial: 'Fashion editorial',
};

/** UI dropdown — premium Google Fonts */
export const HEADING_FONT_PICKER_OPTIONS = Object.keys(GOOGLE_FONT_SPECS).sort();

export function typographyFromTemplateId(
  templateId: string,
  format: SlotTypographyFormat,
): { fontPersonality: FontPersonality; headingFont?: string; bodyFont?: string } {
  if (format === 'post') {
    const poster = getPosterTemplate(templateId);
    if (!poster) return { fontPersonality: 'brand' };
    const stack = resolveFontStack(poster.spec.fontPersonality);
    return {
      fontPersonality: poster.spec.fontPersonality,
      headingFont: stack.families[0],
      bodyFont: stack.families[1],
    };
  }
  const story = getStoryTemplate(templateId);
  if (!story) return { fontPersonality: 'brand' };
  const stack = resolveFontStack(story.spec.fontPersonality);
  return {
    fontPersonality: story.spec.fontPersonality,
    headingFont: stack.families[0],
    bodyFont: stack.families[1],
  };
}

export function defaultSlotTypographyPatch(
  templateId: string,
  format: SlotTypographyFormat,
): Pick<SlotTypographyFields, 'fontPersonality' | 'headingFont' | 'bodyFont' | 'fontMode'> {
  const typo = typographyFromTemplateId(templateId, format);
  return {
    fontMode: 'template',
    fontPersonality: typo.fontPersonality,
    headingFont: typo.headingFont,
    bodyFont: typo.bodyFont,
  };
}

export interface SlotRenderTypography {
  fontPersonality: FontPersonality;
  headingFont: string;
  bodyFont: string;
  honorTemplateTypography: boolean;
  fontMode: SlotFontMode;
}

/** Üretim render — slot + marka tokenları → nihai font stack */
export function resolveSlotRenderTypography(input: {
  slot: SlotTypographyFields;
  templateId?: string;
  format: SlotTypographyFormat;
  brandHeadingFont?: string;
  brandBodyFont?: string;
  brandFontFamily?: string;
  sector?: string;
}): SlotRenderTypography {
  const mode: SlotFontMode = input.slot.fontMode ?? 'template';
  const templateTypo = input.templateId
    ? typographyFromTemplateId(input.templateId, input.format)
    : null;

  const personality = (
    mode === 'template'
      ? (input.slot.fontPersonality ?? templateTypo?.fontPersonality ?? 'brand')
      : input.slot.fontPersonality ?? templateTypo?.fontPersonality ?? 'brand'
  ) as FontPersonality;

  if (mode === 'brand') {
    const fonts = resolveProductionStoryFonts({
      sector: input.sector,
      brandHeading: input.brandHeadingFont,
      brandBody: input.brandBodyFont,
      brandFontFamily: input.brandFontFamily,
      fontPersonality: 'brand',
    });
    return {
      fontPersonality: 'brand',
      headingFont: fonts.heading,
      bodyFont: fonts.body,
      honorTemplateTypography: false,
      fontMode: mode,
    };
  }

  if (mode === 'custom' && input.slot.headingFont) {
    const stack = resolveFontStack(personality, input.slot.headingFont, input.slot.bodyFont, {
      honorExplicitBrand: true,
    });
    return {
      fontPersonality: personality,
      headingFont: input.slot.headingFont,
      bodyFont: input.slot.bodyFont ?? stack.families[1] ?? 'DM Sans',
      honorTemplateTypography: false,
      fontMode: mode,
    };
  }

  // template mode — şablon personality kazanır, marka generic font ezmez
  const stack = resolveFontStack(
    personality,
    undefined,
    templateTypo?.bodyFont,
    { honorExplicitBrand: false },
  );
  return {
    fontPersonality: personality,
    headingFont: stack.families[0] ?? 'DM Serif Display',
    bodyFont: input.slot.bodyFont ?? templateTypo?.bodyFont ?? stack.families[1] ?? 'Sora',
    honorTemplateTypography: true,
    fontMode: 'template',
  };
}

export function slotTypographyPreviewLabel(slot: SlotTypographyFields): string {
  const mode = slot.fontMode ?? 'template';
  if (mode === 'brand') return 'Marka Detayı fontları';
  if (mode === 'custom' && slot.headingFont) {
    return `${slot.headingFont}${slot.bodyFont ? ` / ${slot.bodyFont}` : ''}`;
  }
  const p = slot.fontPersonality ?? 'brand';
  return FONT_PERSONALITY_LABELS_TR[p] ?? p;
}
