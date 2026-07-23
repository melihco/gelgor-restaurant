/**
 * Library approve gate for brand_design_templates (Canva archive).
 *
 * Ready shell = thumbnail preview + usable layout document.
 * design_spec.prompt is optional (onboarding bake recipe; not production SSOT).
 * Production hard pins require an approved (or legacy active) ready shell.
 * Incomplete generations persist as `draft` and never hard-pin.
 *
 * MULTI-TENANT: readiness is workspace-row predicates only — no brand UUIDs.
 */

import {
  hasUsableDesignSpecLayout,
  parseDesignSpecLayout,
  resolveDesignSpecLayout,
} from '@/lib/design-spec-layout';

export type DesignTemplateLibraryStatus =
  | 'draft'
  | 'active'
  | 'approved'
  | 'archived';

export type DesignTemplateShellReadyInput = {
  thumbnailUrl?: string | null;
  status?: string | null;
  designSpec?: {
    prompt?: unknown;
    layout?: unknown;
    canvaArchetypeId?: unknown;
    layoutPattern?: unknown;
  } | null;
  format?: string | null;
};

/** Non-empty prompt recipe. */
export function hasDesignSpecPrompt(designSpec: { prompt?: unknown } | null | undefined): boolean {
  return typeof designSpec?.prompt === 'string' && designSpec.prompt.trim().length >= 24;
}

/** Usable layout preview URL (thumbnail). */
export function hasDesignTemplatePreview(thumbnailUrl: string | null | undefined): boolean {
  const url = String(thumbnailUrl ?? '').trim();
  if (!url) return false;
  return (
    url.startsWith('https://')
    || url.startsWith('http://')
    || url.startsWith('data:image/')
    || url.startsWith('/api/')
  );
}

/**
 * Geometry document present — persisted layout or archetype dual-read seed.
 * Production matcher already dual-reads; persist path should prefer real layout.
 */
export function hasDesignTemplateLayoutDocument(
  designSpec: DesignTemplateShellReadyInput['designSpec'],
  format?: string | null,
): boolean {
  if (!designSpec) return false;
  if (hasUsableDesignSpecLayout(parseDesignSpecLayout(designSpec.layout))) return true;
  const seeded = resolveDesignSpecLayout({
    layout: designSpec.layout,
    archetypeId: typeof designSpec.canvaArchetypeId === 'string'
      ? designSpec.canvaArchetypeId
      : null,
    format: format ?? null,
    layoutPattern: typeof designSpec.layoutPattern === 'string'
      ? designSpec.layoutPattern
      : null,
  });
  return hasUsableDesignSpecLayout(seeded);
}

/** Complete library shell — eligible for auto-approve (thumb + layout). */
export function isDesignTemplateShellReady(input: DesignTemplateShellReadyInput): boolean {
  return (
    hasDesignTemplatePreview(input.thumbnailUrl)
    && hasDesignTemplateLayoutDocument(input.designSpec, input.format)
  );
}

/**
 * Status to persist on generate/bulk upsert.
 * Ready → approved; incomplete preview/recipe → draft.
 */
export function resolveDesignTemplatePersistStatus(
  input: DesignTemplateShellReadyInput,
): Extract<DesignTemplateLibraryStatus, 'approved' | 'draft'> {
  return isDesignTemplateShellReady(input) ? 'approved' : 'draft';
}

/** Live library pool (matcher soft + gallery). Excludes draft/archived. */
export function isDesignTemplateLibraryLive(status: string | null | undefined): boolean {
  const s = String(status ?? '').trim().toLowerCase();
  // Legacy rows shipped as `active` before Phase D — treat as live.
  return s === 'approved' || s === 'active';
}

/**
 * Hard catalog pin eligibility.
 * - `approved`: thumb + layout document
 * - legacy `active`: thumb (layout optional during migration)
 * - `draft` / archived: never
 */
export function isDesignTemplateHardPinEligible(input: DesignTemplateShellReadyInput): boolean {
  if (!isDesignTemplateLibraryLive(input.status)) return false;
  if (!hasDesignTemplatePreview(input.thumbnailUrl)) return false;
  const status = normalizeDesignTemplateStatus(input.status);
  if (status === 'approved') {
    return hasDesignTemplateLayoutDocument(input.designSpec, input.format);
  }
  // Legacy `active` rows predate design_spec.layout.
  return true;
}

/** Soft match pool — live only (draft never binds). */
export function isDesignTemplateSoftMatchEligible(status: string | null | undefined): boolean {
  return isDesignTemplateLibraryLive(status);
}

export function normalizeDesignTemplateStatus(
  status: string | null | undefined,
): DesignTemplateLibraryStatus {
  const s = String(status ?? '').trim().toLowerCase();
  if (s === 'approved' || s === 'draft' || s === 'archived' || s === 'active') {
    return s;
  }
  return 'draft';
}
