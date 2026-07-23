/**
 * Designed-post production order SSOT — GPT Image primary (vibey craft).
 *
 *   1. Brand art direction
 *   2. Content hierarchy
 *   3. Composition selection (shell = layout hint for the image model)
 *   4. Typography engine (GPT Image paints type + craft)
 *   5. Quality control
 *
 * Satori / geometric compose stays in the repo for stories, fal_only, and
 * opt-in `forceDeterministic` — not the default designed-post engine.
 *
 * Multi-tenant: sector + slot look — never brand UUIDs.
 */

import { expectsProductPackaging } from '@/lib/product-packaging-fidelity';
import {
  resolveSlotLookKind,
  type SlotLookKind,
} from '@/lib/slot-look-directive';
import { resolveGeometricShell, type GeometricShellId } from '@/lib/canva-geometric-layouts';

/** Primary = gpt_image; geometric_compose only when forceDeterministic. */
export type DesignedPostComposeStrategy = 'geometric_compose' | 'gpt_image_compose';

export type DesignedPostContentHierarchy = {
  primary: string;
  secondary: string | null;
  tertiary: string | null;
  cta: string | null;
};

export type DesignedPostProductionOrder = {
  stages: readonly [
    'brand_art_direction',
    'content_hierarchy',
    'composition_selection',
    'typography_engine',
    'quality_control',
  ];
  slotLook: SlotLookKind;
  hierarchy: DesignedPostContentHierarchy;
  composeStrategy: DesignedPostComposeStrategy;
  /** Layout hint for prompts / optional Satori path — always resolved. */
  geometricShellId: GeometricShellId;
  /** True only on geometric_compose — forbids GPT-painted marketing type. */
  forbidImageModelTypography: boolean;
  /** True only on geometric_compose — requires Satori overlays. */
  requireDeterministicTypography: boolean;
  packagingLock: boolean;
  reason: string;
};

function trimOrNull(value: string | null | undefined, max = 80): string | null {
  const t = String(value ?? '').trim();
  if (!t) return null;
  return t.slice(0, max);
}

export function resolveDesignedPostContentHierarchy(input: {
  headline?: string | null;
  subtitle?: string | null;
  caption?: string | null;
  cta?: string | null;
}): DesignedPostContentHierarchy {
  const primary = String(input.headline ?? '').trim().slice(0, 72) || '—';
  const secondary = trimOrNull(input.subtitle, 48);
  const caption = String(input.caption ?? '').trim();
  let tertiary: string | null = null;
  if (caption && !caption.toLowerCase().includes(primary.toLowerCase().slice(0, 12))) {
    tertiary = caption.split(/(?<=[.!?])\s+/)[0]?.trim().slice(0, 64) || null;
  }
  const cta = trimOrNull(input.cta, 40);
  return { primary, secondary, tertiary, cta };
}

export function resolveDesignedPostComposeStrategy(input: {
  businessType?: string | null;
  slotRole?: string | null;
  catalogSlotKey?: string | null;
  announcementType?: string | null;
  headline?: string | null;
  caption?: string | null;
  designIntensityLevel?: string | null;
  forceDeterministic?: boolean;
  format?: 'story' | 'post' | null;
}): {
  composeStrategy: DesignedPostComposeStrategy;
  slotLook: SlotLookKind;
  geometricShellId: GeometricShellId;
  packagingLock: boolean;
  forbidImageModelTypography: boolean;
  requireDeterministicTypography: boolean;
  reason: string;
} {
  const slotLook = resolveSlotLookKind({
    announcementType: input.announcementType,
    catalogSlotKey: input.catalogSlotKey,
    headline: input.headline,
    caption: input.caption,
    sector: input.businessType,
  });

  const packagingLock = expectsProductPackaging({
    businessType: input.businessType,
    slotRole: input.slotRole,
    visualSubjectHint: slotLook === 'product_hero' ? 'product_hero' : null,
  }) || slotLook === 'product_hero' || /local_products|harvest|product/i.test(
    String(input.catalogSlotKey ?? ''),
  );

  const shell = resolveGeometricShell({
    catalogSlotKey: input.catalogSlotKey,
    slotLook,
    format: input.format ?? 'post',
    headline: input.headline,
    announcementType: input.announcementType,
  });

  // Default: GPT Image — photoreal vibe + painted craft. Satori only opt-in.
  if (input.forceDeterministic) {
    return {
      composeStrategy: 'geometric_compose',
      slotLook,
      geometricShellId: shell.id,
      packagingLock,
      forbidImageModelTypography: true,
      requireDeterministicTypography: true,
      reason: `geometric_compose:${shell.id}:force_deterministic`,
    };
  }

  return {
    composeStrategy: 'gpt_image_compose',
    slotLook,
    geometricShellId: shell.id,
    packagingLock,
    forbidImageModelTypography: false,
    requireDeterministicTypography: false,
    reason: packagingLock
      ? `gpt_image_compose:${shell.id}:packaging_lock`
      : `gpt_image_compose:${shell.id}:${slotLook}`,
  };
}

export function resolveDesignedPostProductionOrder(input: {
  businessType?: string | null;
  slotRole?: string | null;
  catalogSlotKey?: string | null;
  announcementType?: string | null;
  headline?: string | null;
  subtitle?: string | null;
  caption?: string | null;
  cta?: string | null;
  designIntensityLevel?: string | null;
  forceDeterministic?: boolean;
  format?: 'story' | 'post' | null;
}): DesignedPostProductionOrder {
  const hierarchy = resolveDesignedPostContentHierarchy(input);
  const strategy = resolveDesignedPostComposeStrategy(input);
  return {
    stages: [
      'brand_art_direction',
      'content_hierarchy',
      'composition_selection',
      'typography_engine',
      'quality_control',
    ] as const,
    slotLook: strategy.slotLook,
    hierarchy,
    composeStrategy: strategy.composeStrategy,
    geometricShellId: strategy.geometricShellId,
    forbidImageModelTypography: strategy.forbidImageModelTypography,
    requireDeterministicTypography: strategy.requireDeterministicTypography,
    packagingLock: strategy.packagingLock,
    reason: strategy.reason,
  };
}
