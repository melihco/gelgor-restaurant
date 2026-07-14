/**
 * Catalog slot → idea visual defaults (premium composition, treatment).
 * Sector-driven via prompt_pack on production_slot_definitions — no tenant branches.
 */

import type { ProductionSlotDefinition } from '@/lib/production-slot-catalog';

/** Default premium_composition when a designed story slot has no ideation object yet. */
export const DEFAULT_DESIGNED_STORY_PREMIUM_COMPOSITION: Record<string, unknown> = {
  visual_story: 'Designed story poster with typography overlay on brand gallery photo',
  premium_score: 85,
  layout_strategy: 'poster_stack',
  motion_approach: 'static',
  visual_priority: 'typography',
  composition_type: 'poster_design',
  graphic_elements: ['gradient_wash'],
  object_treatment: 'full_bleed_photo',
  typography_approach: 'bold_display',
  composition_description:
    'Full-bleed venue or product photo with bold headline stack and CTA band — Fal designer story poster.',
};

export interface DesignedStoryPromptPack {
  require_premium_composition: true;
  visual_treatment: 'story_event';
  premium_composition_defaults: Record<string, unknown>;
  ideation_hint?: string;
}

export function buildDesignedStoryPromptPack(labelEn: string): DesignedStoryPromptPack {
  return {
    require_premium_composition: true,
    visual_treatment: 'story_event',
    premium_composition_defaults: {
      ...DEFAULT_DESIGNED_STORY_PREMIUM_COMPOSITION,
      visual_story: `Designed story poster — ${labelEn}`,
    },
    ideation_hint:
      `Story ideas for "${labelEn}" MUST include visual_production_spec.premium_composition ` +
      '(poster_design, typography-forward) — never pure_photo / gallery-only.',
  };
}

export function slotRequiresPremiumComposition(
  promptPack: Record<string, unknown> | null | undefined,
): boolean {
  return promptPack?.require_premium_composition === true;
}

function readPremiumComposition(vps: Record<string, unknown> | null | undefined): unknown {
  if (!vps || typeof vps !== 'object') return null;
  const pc = vps.premium_composition;
  return pc && typeof pc === 'object' ? pc : null;
}

/**
 * Stamp catalog slot visual defaults onto an idea before production.
 * Skips when the idea already carries premium_composition.
 */
export function applyCatalogSlotVisualDefaults(
  idea: Record<string, unknown>,
  promptPack: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!slotRequiresPremiumComposition(promptPack)) return idea;

  const vpsRaw = idea.visual_production_spec;
  const vps = (vpsRaw && typeof vpsRaw === 'object'
    ? { ...(vpsRaw as Record<string, unknown>) }
    : {}) as Record<string, unknown>;

  if (readPremiumComposition(vps)) return idea;

  const defaults = (promptPack?.premium_composition_defaults && typeof promptPack.premium_composition_defaults === 'object'
    ? promptPack.premium_composition_defaults
    : DEFAULT_DESIGNED_STORY_PREMIUM_COMPOSITION) as Record<string, unknown>;

  const treatment = String(promptPack?.visual_treatment ?? 'story_event');

  return {
    ...idea,
    visual_production_spec: {
      ...vps,
      treatment,
      premium_composition: { ...defaults },
    },
  };
}

export function promptPackFromSlotDefinition(
  slot: Pick<ProductionSlotDefinition, 'prompt_pack'> | null | undefined,
): Record<string, unknown> | null {
  const pack = slot?.prompt_pack;
  if (!pack || typeof pack !== 'object') return null;
  return pack as Record<string, unknown>;
}
