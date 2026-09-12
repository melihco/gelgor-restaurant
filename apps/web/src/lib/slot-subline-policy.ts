/**
 * On-canvas CTA / subline (the second painted line: Hemen İncele, Book now).
 *
 * Default OFF for every brand and slot. Opt in only when:
 * - catalog slot job is a CTA slot (reservation / booking / appointment / gift CTA), or
 * - slot pack sets `onCanvasCta: true`, or
 * - prompt_pack.on_canvas_cta === true
 *
 * Template showSubline=false still suppresses even on an opted-in slot.
 * Template showSubline=true cannot turn CTA on for a default-off slot.
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

/** Slots whose job *is* the ask — reservation / booking / appointment / gift CTA. */
const ON_CANVAS_CTA_SLOT_RE =
  /reservation_cta|booking_cta|appointment_cta|gift_cta|(^|_)cta_post|(^|_)cta_story/;

export function catalogSlotAllowsOnCanvasCta(slotKey?: string | null): boolean {
  const key = String(slotKey ?? '').trim().toLowerCase();
  if (!key) return false;
  return ON_CANVAS_CTA_SLOT_RE.test(key);
}

/** True when this catalog slot may paint a CTA / subline. Default false. */
export function resolveOnCanvasCta(input: {
  catalogSlotKey?: string | null;
  onCanvasCta?: boolean | null;
  promptPack?: Record<string, unknown> | null;
}): boolean {
  if (input.onCanvasCta === true) return true;
  const pack = input.promptPack;
  if (readExplicitFlag(pack?.on_canvas_cta ?? pack?.onCanvasCta) === true) return true;
  return catalogSlotAllowsOnCanvasCta(input.catalogSlotKey);
}

/** True when the slot/template allows painting a subline. */
export function isSublineEnabledForProduction(input: {
  catalogSlotKey?: string | null;
  onCanvasCta?: boolean | null;
  promptPack?: Record<string, unknown> | null;
  librarySlot?: SublinePolicySlot;
  designSpec?: SublinePolicyDesignSpec;
  /** Matched template flag (already normalized). */
  matchedShowSubline?: boolean | null;
}): boolean {
  if (!resolveOnCanvasCta(input)) return false;

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
    catalogSlotKey?: string | null;
    onCanvasCta?: boolean | null;
    promptPack?: Record<string, unknown> | null;
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
