/**
 * Fillable template recipe — structured layout contract persisted on
 * design_spec.recipe so mission production can fill copy/photo without
 * inventing a new house style.
 *
 * Multi-tenant: compiled from constitution + layout brief. No brand UUIDs.
 */

import type { BrandDesignConstitution } from '@/lib/brand-design-constitution';
import type { ResolvedFalLogoPlacement } from '@/lib/fal-logo-placement';
import type { TemplateTypeBudget } from '@/lib/template-type-budget';

export const TEMPLATE_FILL_RECIPE_VERSION = 1 as const;

export interface TemplateFillRecipe {
  version: typeof TEMPLATE_FILL_RECIPE_VERSION;
  headingFont?: string;
  bodyFont?: string;
  fontSource?: string;
  primary?: string;
  accent?: string;
  composeMode?: string;
  layoutPackId?: string;
  canvaArchetypeId?: string | null;
  canvaArchetypeName?: string | null;
  layoutPattern?: string | null;
  typographyMode?: string | null;
  typeBudget?: TemplateTypeBudget | null;
  logoPlacement?: ResolvedFalLogoPlacement | null;
  offerings?: string[];
  antiPatterns?: string[];
}

export function parseTemplateFillRecipe(raw: unknown): TemplateFillRecipe | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const heading = String(o.headingFont ?? o.heading_font ?? '').trim();
  const compose = String(o.composeMode ?? o.compose_mode ?? '').trim();
  const archetype = String(o.canvaArchetypeId ?? o.canva_archetype_id ?? '').trim();
  const pack = String(o.layoutPackId ?? o.layout_pack_id ?? '').trim();
  if (!heading && !compose && !archetype && !pack) return null;
  const offerings = Array.isArray(o.offerings)
    ? o.offerings.map((x) => String(x).trim()).filter(Boolean).slice(0, 4)
    : [];
  const rawAnti = o.antiPatterns ?? o.anti_patterns;
  const antiPatterns = Array.isArray(rawAnti)
    ? rawAnti.map((x) => String(x).trim()).filter(Boolean).slice(0, 4)
    : [];
  return {
    version: TEMPLATE_FILL_RECIPE_VERSION,
    ...(heading ? { headingFont: heading } : {}),
    ...(String(o.bodyFont ?? o.body_font ?? '').trim()
      ? { bodyFont: String(o.bodyFont ?? o.body_font).trim() }
      : {}),
    ...(String(o.fontSource ?? o.font_source ?? '').trim()
      ? { fontSource: String(o.fontSource ?? o.font_source).trim() }
      : {}),
    ...(String(o.primary ?? '').trim() ? { primary: String(o.primary).trim() } : {}),
    ...(String(o.accent ?? '').trim() ? { accent: String(o.accent).trim() } : {}),
    ...(compose ? { composeMode: compose } : {}),
    ...(pack ? { layoutPackId: pack } : {}),
    canvaArchetypeId: archetype || null,
    canvaArchetypeName: String(o.canvaArchetypeName ?? o.canva_archetype_name ?? '').trim() || null,
    layoutPattern: String(o.layoutPattern ?? o.layout_pattern ?? '').trim() || null,
    typographyMode: String(o.typographyMode ?? o.typography_mode ?? '').trim() || null,
    typeBudget: (o.typeBudget ?? o.type_budget) as TemplateTypeBudget | null ?? null,
    logoPlacement: (o.logoPlacement ?? o.logo_placement) as ResolvedFalLogoPlacement | null ?? null,
    ...(offerings.length ? { offerings } : {}),
    ...(antiPatterns.length ? { antiPatterns } : {}),
  };
}

export function buildTemplateFillRecipe(input: {
  constitution?: BrandDesignConstitution | null;
  headingFont?: string | null;
  bodyFont?: string | null;
  canvaArchetypeId?: string | null;
  canvaArchetypeName?: string | null;
  layoutPattern?: string | null;
  typographyMode?: string | null;
  typeBudget?: TemplateTypeBudget | null;
  logoPlacement?: ResolvedFalLogoPlacement | null;
}): TemplateFillRecipe | null {
  const c = input.constitution;
  const heading = String(c?.headingFont || input.headingFont || '').trim();
  const compose = String(c?.composeMode || '').trim();
  const pack = String(c?.layoutPackId || '').trim();
  const archetype = String(input.canvaArchetypeId || '').trim();
  if (!heading && !compose && !archetype && !pack) return null;
  return {
    version: TEMPLATE_FILL_RECIPE_VERSION,
    ...(heading ? { headingFont: heading } : {}),
    ...(String(c?.bodyFont || input.bodyFont || '').trim()
      ? { bodyFont: String(c?.bodyFont || input.bodyFont).trim() }
      : {}),
    ...(c?.fontSource ? { fontSource: c.fontSource } : {}),
    ...(c?.primary ? { primary: c.primary } : {}),
    ...(c?.accent ? { accent: c.accent } : {}),
    ...(compose ? { composeMode: compose } : {}),
    ...(pack ? { layoutPackId: pack } : {}),
    canvaArchetypeId: archetype || null,
    canvaArchetypeName: input.canvaArchetypeName ?? null,
    layoutPattern: input.layoutPattern ?? null,
    typographyMode: input.typographyMode ?? null,
    typeBudget: input.typeBudget ?? null,
    logoPlacement: input.logoPlacement ?? null,
    ...(c?.signatureOfferings?.length
      ? { offerings: c.signatureOfferings.slice(0, 4) }
      : {}),
    ...(c?.antiPatterns?.length
      ? { antiPatterns: c.antiPatterns.slice(0, 4) }
      : {}),
  };
}

/** Compact lock lines for replica / layout directives. */
export function formatTemplateRecipeLock(recipe: TemplateFillRecipe): string[] {
  const lines = [
    '═══ FILLABLE RECIPE (house law — fill copy/photo, do not invent a new system) ═══',
  ];
  if (recipe.headingFont) {
    lines.push(
      `TYPE: ${recipe.headingFont}`
      + (recipe.bodyFont ? ` / ${recipe.bodyFont}` : '')
      + (recipe.fontSource ? ` (source=${recipe.fontSource})` : ''),
    );
  }
  if (recipe.primary || recipe.accent) {
    lines.push(`COLOR: primary ${recipe.primary ?? '—'} · accent ${recipe.accent ?? '—'} for one rule/CTA.`);
  }
  if (recipe.composeMode || recipe.layoutPackId) {
    lines.push(`COMPOSE: ${recipe.composeMode ?? '—'} via ${recipe.layoutPackId ?? '—'}.`);
  }
  if (recipe.canvaArchetypeId || recipe.layoutPattern) {
    lines.push(
      `ARCHETYPE: ${recipe.canvaArchetypeName || recipe.canvaArchetypeId || '—'}`
      + (recipe.layoutPattern ? ` · ${recipe.layoutPattern}` : ''),
    );
  }
  if (recipe.offerings?.length) {
    lines.push(`OFFERINGS (real only): ${recipe.offerings.join(' · ')}.`);
  }
  if (recipe.antiPatterns?.length) {
    lines.push(`ANTI: ${recipe.antiPatterns.join('; ')}.`);
  }
  return lines;
}

/** When the stored onboarding prompt is missing, still replica from the recipe. */
export function buildRecipeReplicaPrompt(recipe: TemplateFillRecipe): string {
  return [
    ...formatTemplateRecipeLock(recipe),
    'Keep this geometry, type energy, and color roles. Swap only mission headline/subline and the gallery photo.',
  ].join('\n');
}
