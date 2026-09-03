/**
 * Generalize premium-editorial's numeric layout system onto the main fal_design
 * path: layout-specification zones, fit-before-paint, and layout-aware vision
 * regeneration — without the premium-only hard QA gate.
 *
 * Geometry SSOT is design_spec.layout (Canva archetypes). Zones project into
 * the editorial LayoutSpecification contract so COMPOSITION_MAP / formatZone
 * stay one language. Photo spatial can mirror/nudge type off the subject.
 *
 * MULTI-TENANT: archetype + format + spatial only — no brand UUID / name branches.
 */

import type { CanvaArchetypeId } from '@/lib/canva-archetype-catalog';
import {
  buildTypeFitPromptBlock,
  fitMissionCopyToLayout,
  type DesignSpecCopyFitResult,
} from '@/lib/design-spec-copy-fit';
import {
  aspectRatioForTemplateFormat,
  hasUsableDesignSpecLayout,
  isCanvaArchetypeId,
  seedDesignSpecLayout,
  type DesignSpecAspectRatio,
  type DesignSpecLayout,
  type DesignSpecNormRect,
  type DesignSpecTextSlot,
} from '@/lib/design-spec-layout';
import type { GalleryPhotoSpatial, GalleryTypeBand } from '@/lib/gallery-photo-spatial';
import { formatZone } from '@/lib/premium-editorial/layout-specification';
import type {
  EditorialLayoutFamily,
  LayoutSpecification,
  NormalizedRect,
} from '@/lib/premium-editorial/types';
import { PREMIUM_EDITORIAL_PROMPT_VERSION } from '@/lib/premium-editorial/types';

export const FAL_DESIGN_NUMERIC_LAYOUT_VERSION = 'fal-design-numeric-v1' as const;

const ARCHETYPE_TO_FAMILY: Record<CanvaArchetypeId, EditorialLayoutFamily> = {
  split_feature_panel: 'EditorialSplit',
  magazine_cover_drop: 'MagazineCover',
  cinematic_full_bleed: 'CinematicNegativeSpace',
  campaign_hero_block: 'MagazineCover',
  event_ticket_stub: 'MagazineCover',
  neon_night_promo: 'ProductLowerThird',
  social_proof_banner: 'MagazineCover',
  promo_price_stack: 'MaterialPanel',
  editorial_date_masthead: 'MagazineCover',
  product_hero_card: 'ProductRightTextLeft',
  graphic_shape_stack: 'AsymmetricHero',
  before_after_diptych: 'ProductLowerThird',
  location_pin_card: 'ProductLowerThird',
  polaroid_memory: 'MinimalStillLife',
  noir_editorial: 'CinematicNegativeSpace',
  diagonal_brand_split: 'AsymmetricHero',
  frosted_quote_card: 'MinimalStillLife',
  gallery_carousel_tease: 'MagazineCover',
};

export interface FalDesignNumericLayoutResult {
  layout: DesignSpecLayout;
  specification: LayoutSpecification;
  textFit: DesignSpecCopyFitResult;
  promptBlock: string;
  spatialAdapted: boolean;
  editorialFamily: EditorialLayoutFamily;
  artifactMeta: Record<string, unknown>;
}

export interface FalDesignNumericLayoutInput {
  archetypeId?: string | null;
  format?: string | null;
  aspectRatio?: DesignSpecAspectRatio | '9:16' | '4:5' | '1:1' | null;
  headline: string;
  subtitle?: string | null;
  photoSpatial?: GalleryPhotoSpatial | null;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function asRect(z: DesignSpecNormRect): NormalizedRect {
  return { x: z.x, y: z.y, width: z.width, height: z.height };
}

function mirrorX(z: DesignSpecNormRect): DesignSpecNormRect {
  return { ...z, x: clamp01(1 - z.x - z.width) };
}

function mirrorY(z: DesignSpecNormRect): DesignSpecNormRect {
  return { ...z, y: clamp01(1 - z.y - z.height) };
}

function flipAlign(align: DesignSpecTextSlot['align']): DesignSpecTextSlot['align'] {
  if (align === 'left') return 'right';
  if (align === 'right') return 'left';
  return 'center';
}

function zoneCenter(z: DesignSpecNormRect): { cx: number; cy: number } {
  return { cx: z.x + z.width / 2, cy: z.y + z.height / 2 };
}

function pickSlot(
  layout: DesignSpecLayout,
  role: DesignSpecTextSlot['role'],
): DesignSpecTextSlot | null {
  return layout.textSlots.find((t) => t.role === role) ?? null;
}

function headlineBandOf(layout: DesignSpecLayout): GalleryTypeBand {
  const hl = pickSlot(layout, 'headline');
  if (!hl) return 'left';
  const { cx, cy } = zoneCenter(hl.zone);
  if (cy < 0.38) return 'top';
  if (cy > 0.62) return 'bottom';
  if (cx < 0.42) return 'left';
  if (cx > 0.58) return 'right';
  return 'center';
}

function mapLayout(
  layout: DesignSpecLayout,
  mapZone: (z: DesignSpecNormRect) => DesignSpecNormRect,
  mapSlot?: (slot: DesignSpecTextSlot) => DesignSpecTextSlot,
): DesignSpecLayout {
  return {
    ...layout,
    panels: layout.panels.map((p) => ({ ...p, zone: mapZone(p.zone) })),
    textSlots: layout.textSlots.map((t) => {
      const next = { ...t, zone: mapZone(t.zone) };
      return mapSlot ? mapSlot(next) : next;
    }),
    photoSlot: mapZone(layout.photoSlot),
    logoSlot: mapZone(layout.logoSlot),
  };
}

function overlapArea(a: DesignSpecNormRect, b: { x: number; y: number; w: number; h: number }): number {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

function maybeShiftOffSubject(
  layout: DesignSpecLayout,
  spatial: GalleryPhotoSpatial,
): { layout: DesignSpecLayout; adapted: boolean } {
  const box = spatial.subjectBox;
  const hl = pickSlot(layout, 'headline');
  if (!box || !hl) return { layout, adapted: false };
  const area = hl.zone.width * hl.zone.height;
  if (area <= 0) return { layout, adapted: false };
  const overlap = overlapArea(hl.zone, box) / area;
  if (overlap < 0.18) return { layout, adapted: false };

  const current = headlineBandOf(layout);
  if (spatial.typeBand === 'right' || spatial.typeBand === 'left') {
    if (current !== spatial.typeBand) {
      return { layout: mapLayout(layout, mirrorX, (t) => ({ ...t, align: flipAlign(t.align) })), adapted: true };
    }
  }
  if (spatial.typeBand === 'top' || spatial.typeBand === 'bottom') {
    if (current !== spatial.typeBand) {
      return { layout: mapLayout(layout, mirrorY), adapted: true };
    }
  }
  return { layout, adapted: false };
}

export function adaptDesignSpecToPhotoSpatial(
  layout: DesignSpecLayout,
  spatial: GalleryPhotoSpatial | null | undefined,
): { layout: DesignSpecLayout; adapted: boolean } {
  if (!spatial) return { layout, adapted: false };
  const current = headlineBandOf(layout);
  const target = spatial.typeBand;
  if (current === target) {
    return maybeShiftOffSubject(layout, spatial);
  }
  if (
    (current === 'left' && target === 'right')
    || (current === 'right' && target === 'left')
  ) {
    return {
      layout: mapLayout(layout, mirrorX, (t) => ({ ...t, align: flipAlign(t.align) })),
      adapted: true,
    };
  }
  if (
    (current === 'top' && target === 'bottom')
    || (current === 'bottom' && target === 'top')
  ) {
    return { layout: mapLayout(layout, mirrorY), adapted: true };
  }
  return maybeShiftOffSubject(layout, spatial);
}

/**
 * When the slot has no explicit Canva archetype, seat type from the photo
 * instead of defaulting every tenant to split_feature_panel.
 */
export function defaultArchetypeForSpatial(opts: {
  spatial?: GalleryPhotoSpatial | null;
  format?: string | null;
  aspectRatio?: string | null;
}): CanvaArchetypeId | null {
  const aspect = opts.aspectRatio
    ?? (opts.format ? aspectRatioForTemplateFormat(opts.format) : '4:5');
  const band = opts.spatial?.typeBand;
  if (!band) return null;
  if (aspect === '9:16') {
    return band === 'bottom' ? 'cinematic_full_bleed' : 'magazine_cover_drop';
  }
  if (band === 'top') return 'magazine_cover_drop';
  if (band === 'bottom') return 'cinematic_full_bleed';
  if (band === 'right') return 'split_feature_panel';
  return 'split_feature_panel';
}

export function editorialFamilyForArchetype(
  archetypeId: string | null | undefined,
): EditorialLayoutFamily {
  if (archetypeId && isCanvaArchetypeId(archetypeId)) {
    return ARCHETYPE_TO_FAMILY[archetypeId];
  }
  return 'AsymmetricHero';
}

export function projectDesignSpecToLayoutSpecification(
  layout: DesignSpecLayout,
): LayoutSpecification {
  const headline = pickSlot(layout, 'headline')?.zone ?? { x: 0.08, y: 0.1, width: 0.5, height: 0.16 };
  const body = pickSlot(layout, 'subtitle')?.zone
    ?? pickSlot(layout, 'eyebrow')?.zone
    ?? { x: headline.x, y: clamp01(headline.y + headline.height + 0.02), width: headline.width, height: 0.08 };
  const cta = pickSlot(layout, 'cta')?.zone
    ?? { x: headline.x, y: 0.84, width: 0.28, height: 0.06 };
  const family = editorialFamilyForArchetype(String(layout.archetypeId));
  const ns = Math.min(0.42, Math.max(0.28, 1 - (layout.photoSlot.width * layout.photoSlot.height * 0.55)));
  return {
    family,
    canvas: layout.canvas,
    safeArea: layout.safeArea,
    heroZone: asRect(layout.photoSlot),
    headlineZone: asRect(headline),
    bodyZone: asRect(body),
    ctaZone: asRect(cta),
    logoZone: asRect(layout.logoSlot),
    negativeSpaceRatio: ns,
    textContrastStrategy: 'mixed',
    visualBalance: headline.x < 0.35 || headline.x > 0.45 ? 'asymmetric' : 'centered',
    textBackgroundTreatment: layout.panels.some((p) => p.role === 'scrim')
      ? 'soft-scrim'
      : 'natural-image-negative-space',
    promptArchitectureVersion: PREMIUM_EDITORIAL_PROMPT_VERSION,
  };
}

function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function buildFalCompositionMapBlock(opts: {
  specification: LayoutSpecification;
  layout: DesignSpecLayout;
  textFit: DesignSpecCopyFitResult;
  spatialAdapted: boolean;
}): string {
  const { specification: spec, layout, textFit } = opts;
  const typeFit = buildTypeFitPromptBlock(textFit);
  return [
    '═══ COMPOSITION MAP (NUMERIC — MANDATORY) ═══',
    `family=${spec.family} archetype=${layout.archetypeId} canvas=${spec.canvas.width}×${spec.canvas.height} (${spec.canvas.aspectRatio})`,
    opts.spatialAdapted ? 'zones adapted to PHOTO SPATIAL type seat — do not put type back over the subject.' : '',
    formatZone('Hero / photo', spec.heroZone),
    formatZone('Headline', spec.headlineZone),
    formatZone('Body / subheadline', spec.bodyZone),
    formatZone('CTA', spec.ctaZone),
    formatZone('Logo clearance (keep calm; real logo composited later)', spec.logoZone),
    `Safe area: top=${fmtPct(spec.safeArea.top)} right=${fmtPct(spec.safeArea.right)} bottom=${fmtPct(spec.safeArea.bottom)} left=${fmtPct(spec.safeArea.left)}`,
    `Target negative space ~${Math.round(spec.negativeSpaceRatio * 100)}%. Paint type ONLY inside reserved zones.`,
    typeFit,
  ].filter(Boolean).join('\n');
}

/**
 * Layout-aware regeneration — same failure language as premium-editorial
 * vision-qa, but this is a retry hint only. It does not raise the hard gate.
 */
export function buildLayoutAwareRegenInstructions(input: {
  issues?: string[] | null;
  textOverlap?: boolean;
  textLegibility?: 'clear' | 'partial' | 'poor' | null;
  hierarchyOk?: boolean;
  score?: number | null;
  layout: DesignSpecLayout;
  specification: LayoutSpecification;
}): string[] {
  const instructions: string[] = [];
  const issues = (input.issues ?? []).map(String);
  const hl = formatZone('headline zone', input.specification.headlineZone);

  if (input.textOverlap || issues.some((i) => /overlap|cover|subject/i.test(i))) {
    instructions.push(
      `Keep ALL type inside reserved zones. Never cover the photo subject. ${hl}`,
    );
  }
  if (input.textLegibility === 'poor' || issues.some((i) => /clip|crop|truncat|cut.?off|illegib/i.test(i))) {
    instructions.push(
      'Headline must sit fully inside its zone with ≥8% pad — shrink type before clipping.',
    );
  }
  if (input.hierarchyOk === false) {
    instructions.push(
      `Strengthen hierarchy: one dominant headline in ${hl}; support stays in the body zone.`,
    );
  }
  if ((input.score ?? 10) <= 4) {
    instructions.push(
      `Simplify craft. Increase calm around type toward ~${Math.round(input.specification.negativeSpaceRatio * 100)}% negative space.`,
    );
  }
  if (!instructions.length && issues.length) {
    instructions.push(
      `Re-seat type in the numeric headline/body/cta zones. Logo zone (${formatZone('logo', input.specification.logoZone)}) stays empty.`,
    );
  }
  return instructions;
}

export function buildLayoutAwareRegenPromptBlock(
  numeric: Pick<FalDesignNumericLayoutResult, 'layout' | 'specification'>,
  review: {
    issues?: string[] | null;
    textOverlap?: boolean;
    textLegibility?: 'clear' | 'partial' | 'poor' | null;
    hierarchyOk?: boolean;
    score?: number | null;
  },
): string {
  const steps = buildLayoutAwareRegenInstructions({
    ...review,
    layout: numeric.layout,
    specification: numeric.specification,
  });
  if (!steps.length) return '';
  return [
    '═══ VISION QA REGENERATION (LAYOUT ZONES) ═══',
    'Apply these corrections. Do not invent a different shell.',
    ...steps.map((s) => `- ${s}`),
  ].join('\n');
}

export function resolveFalDesignNumericLayout(
  input: FalDesignNumericLayoutInput,
): FalDesignNumericLayoutResult | null {
  const format = input.format
    ?? (input.aspectRatio === '9:16' ? 'story' : 'post');
  const explicit = String(input.archetypeId ?? '').trim();
  const archetype = isCanvaArchetypeId(explicit)
    ? explicit
    : defaultArchetypeForSpatial({
      spatial: input.photoSpatial,
      format,
      aspectRatio: input.aspectRatio,
    });
  if (!archetype) return null;

  const seeded = seedDesignSpecLayout({
    archetypeId: archetype,
    format,
    pinMode: 'soft',
  });
  if (!hasUsableDesignSpecLayout(seeded)) return null;

  const adapted = adaptDesignSpecToPhotoSpatial(seeded, input.photoSpatial ?? null);
  const layout = adapted.layout;
  const specification = projectDesignSpecToLayoutSpecification(layout);
  const textFit = fitMissionCopyToLayout(layout, {
    headline: input.headline,
    subtitle: input.subtitle,
  });
  const promptBlock = buildFalCompositionMapBlock({
    specification,
    layout,
    textFit,
    spatialAdapted: adapted.adapted,
  });

  return {
    layout,
    specification,
    textFit,
    promptBlock,
    spatialAdapted: adapted.adapted,
    editorialFamily: specification.family,
    artifactMeta: {
      prompt_architecture_version: FAL_DESIGN_NUMERIC_LAYOUT_VERSION,
      layout_specification_json: {
        ...specification,
        archetypeId: layout.archetypeId,
        spatialAdapted: adapted.adapted,
        designSpecVersion: layout.version,
      },
      text_layout: {
        fittedHeadline: textFit.fittedHeadline,
        fittedSubheadline: textFit.fittedSubtitle,
        headlineLines: textFit.headline?.fit.lines ?? [],
        subheadlineLines: textFit.subtitle?.fit.lines ?? [],
        headlineFontSize: textFit.headline?.fit.fontSize ?? null,
        subheadlineFontSize: textFit.subtitle?.fit.fontSize ?? null,
        selectedLayoutFamily: specification.family,
        warnings: textFit.failReason ? [textFit.failReason] : [],
      },
      numeric_layout_source: adapted.adapted ? 'design_spec+spatial' : 'design_spec',
    },
  };
}

export function appendNumericLayoutToPrompt(
  prompt: string,
  numeric: FalDesignNumericLayoutResult | null | undefined,
): string {
  if (!numeric?.promptBlock) return prompt;
  if (prompt.includes('COMPOSITION MAP (NUMERIC')) return prompt;
  return `${numeric.promptBlock}\n\n${prompt}`;
}
