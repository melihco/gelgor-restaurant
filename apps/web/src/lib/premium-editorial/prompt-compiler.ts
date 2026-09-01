/**
 * Layer 4 — Editorial Image Prompt Compiler
 *
 * Default mode: venue-grounded Instagram social design
 * (mekan fotoğrafı → premium editorial sosyal medya tasarımı).
 * Not a from-scratch fantasy scene generator.
 */

import { formatZone } from './layout-specification';
import { PREMIUM_MEDITERRANEAN_EDITORIAL_V1 } from './quality-preset';
import {
  PREMIUM_EDITORIAL_PROMPT_VERSION,
  PREMIUM_EDITORIAL_QUALITY_PRESET,
  type BrandVisualDNA,
  type CompiledImagePrompt,
  type CreativeDirectionBrief,
  type LayoutSpecification,
  type TextLayoutResult,
} from './types';

/** Legacy export — used when baking type is deferred. */
export const TEXT_EXCLUSION =
  'Do not generate any letters, words, logos, labels, captions, signage, watermarks, UI elements or typographic symbols anywhere in the image.';

export type EditorialCompileMode = 'venue_social_design' | 'photo_plate_only';

export function compileEditorialImagePrompt(opts: {
  dna: BrandVisualDNA;
  brief: CreativeDirectionBrief;
  layout: LayoutSpecification;
  textLayout?: TextLayoutResult | null;
  /** Default: venue_social_design — gallery-grounded Instagram post/story. */
  mode?: EditorialCompileMode;
  regenerationInstructions?: string[];
  simplifySupporting?: boolean;
}): CompiledImagePrompt {
  const mode = opts.mode ?? 'venue_social_design';
  const { dna, brief, layout } = opts;
  const text = opts.textLayout;
  const regen = (opts.regenerationInstructions ?? []).filter(Boolean);
  const supporting = opts.simplifySupporting
    ? brief.supportingElements.slice(0, 1)
    : brief.supportingElements;

  const headline = text?.fittedHeadline?.replace(/\n/g, ' ').trim() || '';
  const sub = text?.fittedSubheadline?.replace(/\n/g, ' ').trim() || '';
  const cta = text?.fittedCta?.trim() || '';

  const sections: Record<string, string> = {
    ROLE: [
      'Act as the art director for a boutique social-media agency producing Instagram content.',
      'You are designing ONE premium editorial social post/story ON TOP OF the brand\'s REAL venue photograph.',
      'This is NOT a from-scratch fantasy scene. The reference photo is the venue — keep it recognizable.',
      'Elevate the real place into a world-class hospitality campaign frame suitable for Instagram.',
    ].join('\n'),

    CAMPAIGN: [
      `Campaign concept: ${brief.campaignConcept}`,
      `Emotional objective: ${brief.emotionalObjective}`,
      `Visual narrative: ${brief.visualNarrative}`,
      `Creative variation: ${brief.creativeVariationKey}`,
      `Social format: Instagram ${brief.outputFormat} (${brief.aspectRatio})`,
    ].join('\n'),

    BRAND_IDENTITY: [
      `Brand: ${dna.brandName}`,
      `Brand personality: ${dna.brandPersonality ?? dna.brandTone ?? 'refined hospitality'}`,
      `Visual mood: ${dna.visualMood ?? brief.backgroundAtmosphere}`,
      `Color direction: ${brief.colorTreatment}`,
      `Materials: ${brief.materialTreatment}`,
      'The design must feel unique to this brand\'s real venue — not a generic restaurant stock ad.',
      dna.location ? `Location cue (atmosphere only, do not invent address text): ${dna.location}` : '',
      dna.sector ? `Sector: ${dna.sector}` : '',
    ].filter(Boolean).join('\n'),

    VENUE_PHOTO_LOCK: [
      'REFERENCE PHOTO = the brand\'s real venue / product gallery image.',
      'Preserve the recognizable place: architecture, materials, furniture, coastline, lighting mood.',
      'You may refine grading, crop emphasis, and add restrained design layers — do NOT replace the venue with a different location.',
      'Do NOT invent a new building, a new beach, or a stock fantasy terrace that is not in the photo.',
      'People: no identifiable faces; anonymous/hands-only if already present.',
    ].join('\n'),

    HERO_SCENE: [
      `Art direction emphasis: ${brief.heroSubject}`,
      `Product / hero placement: ${brief.productPlacement}`,
      `Environment reading: ${brief.environment}`,
      `Supporting accents: ${supporting.join(', ') || 'minimal atmospheric cues'}`,
      `Styling: ${brief.stylingInstructions.join('; ')}`,
    ].join('\n'),

    LIGHTING_CAMERA: [
      `Time of day cue: ${brief.timeOfDay}`,
      `Lighting: ${brief.lightingDirection}`,
      `Lighting mood: ${brief.lightingMood}`,
      `Camera: ${brief.cameraAngle}`,
      `Lens feel: ${brief.lensDescription}`,
      `Depth of field: ${brief.depthOfField}`,
      'Keep reflections, shadows and materials photographically believable.',
    ].join('\n'),

    COMPOSITION_MAP: [
      `Output aspect ratio: ${layout.canvas.aspectRatio}`,
      `Layout family: ${layout.family}`,
      `Visual balance: ${layout.visualBalance}`,
      formatZone('Hero / photo emphasis zone', layout.heroZone),
      formatZone('Headline zone', layout.headlineZone),
      formatZone('Body / subheadline zone', layout.bodyZone),
      formatZone('CTA zone', layout.ctaZone),
      formatZone('Logo clearance (keep calm, background continues; real logo composited later)', layout.logoZone),
      `Safe area: top=${layout.safeArea.top} right=${layout.safeArea.right} bottom=${layout.safeArea.bottom} left=${layout.safeArea.left}`,
      `Target negative space ~${Math.round(layout.negativeSpaceRatio * 100)}% for calm reading.`,
      'Asymmetric editorial social composition — agency portfolio bar, not Canva template.',
    ].join('\n'),

    MATERIALS_COLOR: [
      `Color treatment: ${brief.colorTreatment}`,
      `Material treatment: ${brief.materialTreatment}`,
      `Preset: ${PREMIUM_MEDITERRANEAN_EDITORIAL_V1.name}`,
    ].join('\n'),

    FORBIDDEN: [
      'Avoid:',
      '- inventing a different venue than the reference photo',
      '- Canva-like templates / paint sandwich headers',
      '- busy diagonal triangle packs',
      '- fake logos or fake brand names',
      '- Instagram UI chrome / mockup frames',
      '- plastic food, malformed glassware, duplicated objects',
      '- oversaturated tourist clichés',
      ...brief.forbiddenElements.slice(0, 6).map((e) => `- ${e}`),
    ].join('\n'),

    QUALITY: [
      'Must feel: cinematic, authentic, premium, restrained, editorial, photographic, commercially usable as Instagram content.',
      'Ask: would a client ask which agency made this? If no — fail.',
    ].join('\n'),

    TECHNICAL: [
      `One high-resolution Instagram ${brief.outputFormat} frame.`,
      `Aspect ratio: ${layout.canvas.aspectRatio}`,
      'No border. No device mockup. No Instagram interface chrome.',
      'Keep the logo corner calm with the background continuing as-is — the real logo file is composited after generation, so paint no plate or placeholder there.',
    ].join('\n'),
  };

  if (mode === 'venue_social_design' && (headline || cta)) {
    sections.ON_CANVAS_TEXT = [
      '═══ ON-CANVAS TEXT CONTRACT (MANDATORY) ═══',
      'Render ONLY these strings — character-for-character. Do not translate or invent slogans.',
      headline ? `HEADLINE: ${headline}` : '',
      sub ? `SUBHEADLINE: ${sub}` : '',
      cta ? `CTA: ${cta}` : '',
      'Typography: restrained editorial hierarchy, high contrast, inside reserved zones.',
      'Do NOT draw the brand logo or brand wordmark — logo zone stays empty for post composite.',
      'No extra labels, prices, dates, phone numbers, or addresses.',
    ].filter(Boolean).join('\n');
  } else {
    sections.TEXT_EXCLUSION = [
      TEXT_EXCLUSION,
      'Real logo will be composited later. Do not create fake brand marks.',
    ].join('\n');
  }

  if (regen.length) {
    sections.REGENERATION = [
      'Apply these corrective instructions from vision QA:',
      ...regen.map((r) => `- ${r}`),
    ].join('\n');
  }

  const order = [
    'ROLE',
    'CAMPAIGN',
    'BRAND_IDENTITY',
    'VENUE_PHOTO_LOCK',
    'HERO_SCENE',
    'LIGHTING_CAMERA',
    'COMPOSITION_MAP',
    'MATERIALS_COLOR',
    ...(sections.ON_CANVAS_TEXT ? ['ON_CANVAS_TEXT'] : ['TEXT_EXCLUSION']),
    'FORBIDDEN',
    'QUALITY',
    'TECHNICAL',
    ...(regen.length ? ['REGENERATION'] : []),
  ];

  const finalPrompt = order
    .map((key) => {
      const body = sections[key];
      if (!body) return '';
      const bar = '-'.repeat(50);
      return `${bar}\n${key.replace(/_/g, ' ')}\n${bar}\n\n${body}`;
    })
    .filter(Boolean)
    .join('\n\n');

  return {
    finalPrompt,
    sections,
    modelName: null,
    promptArchitectureVersion: PREMIUM_EDITORIAL_PROMPT_VERSION,
    qualityPreset: PREMIUM_EDITORIAL_QUALITY_PRESET,
  };
}
