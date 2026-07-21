/**
 * Subline (supporting line under headline) is parametric per brand template slot.
 *
 * Sources (first false wins):
 * 1) brand_theme.template_library.slots[].showSubline === false
 * 2) brand_design_templates.design_spec.showSubline === false
 *
 * Default when unset: enabled (backward compatible).
 */

export type SublinePolicySlot = {
  showSubline?: boolean;
  show_subline?: boolean;
} | null | undefined;

export type SublinePolicyDesignSpec = {
  showSubline?: boolean;
  show_subline?: boolean;
} | Record<string, unknown> | null | undefined;

function readExplicitFlag(raw: unknown): boolean | null {
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true' || raw === 1 || raw === '1') return true;
  if (raw === 'false' || raw === 0 || raw === '0') return false;
  return null;
}

/** True when the slot/template allows painting a subline. */
export function isSublineEnabledForProduction(input: {
  librarySlot?: SublinePolicySlot;
  designSpec?: SublinePolicyDesignSpec;
  /** Matched template flag (already normalized). */
  matchedShowSubline?: boolean | null;
}): boolean {
  const lib = input.librarySlot;
  const fromLib = readExplicitFlag(lib?.showSubline ?? lib?.show_subline);
  if (fromLib === false) return false;

  if (input.matchedShowSubline === false) return false;

  const ds = input.designSpec as Record<string, unknown> | null | undefined;
  const fromSpec = readExplicitFlag(ds?.showSubline ?? ds?.show_subline);
  if (fromSpec === false) return false;

  return true;
}

/** Return subline text only when the slot/template allows it. */
export function resolveSlotSublineForRender(
  subline: string | null | undefined,
  input: {
    librarySlot?: SublinePolicySlot;
    designSpec?: SublinePolicyDesignSpec;
    matchedShowSubline?: boolean | null;
  },
): string | undefined {
  if (!isSublineEnabledForProduction(input)) return undefined;
  const text = String(subline ?? '').trim();
  return text || undefined;
}

/** Persist flag when generating/saving a design template. */
export function showSublineFromSampleCopy(sampleSubtitle: string | null | undefined): boolean {
  return Boolean(String(sampleSubtitle ?? '').trim());
}
