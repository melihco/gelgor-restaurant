import type { BrandTemplateLibrary, BrandTemplateLibrarySlot } from './brand-template-library';

export type RemotionRenderSlotFormat = 'story' | 'post';

export interface LibrarySlotRenderBinding {
  slot?: BrandTemplateLibrarySlot;
  format: RemotionRenderSlotFormat;
  effectiveTemplateId: string;
  effectivePosterTemplateId?: string;
  enforceTemplate: boolean;
}

/**
 * Render-time source of truth for brand template library slots.
 *
 * If a valid library slot key is present, its configured template wins over any
 * incoming template id so production renders cannot drift from the operator's
 * saved Brand Template Library selection.
 */
export function resolveLibrarySlotRenderBinding(input: {
  library: BrandTemplateLibrary;
  librarySlotKey?: string | null;
  requestedFormat: RemotionRenderSlotFormat;
  incomingTemplateId?: string | null;
}): LibrarySlotRenderBinding {
  const requestedFormat = input.requestedFormat;
  const incomingTemplateId = String(input.incomingTemplateId ?? '').trim();
  const librarySlotKey = String(input.librarySlotKey ?? '').trim();

  if (!librarySlotKey) {
    return {
      format: requestedFormat,
      effectiveTemplateId: incomingTemplateId,
      effectivePosterTemplateId: requestedFormat === 'post' ? incomingTemplateId || undefined : undefined,
      enforceTemplate: false,
    };
  }

  const slot = input.library.slots.find(
    (s) => s.key === librarySlotKey && s.enabled && s.format === requestedFormat,
  );

  if (!slot) {
    return {
      format: requestedFormat,
      effectiveTemplateId: incomingTemplateId,
      effectivePosterTemplateId: requestedFormat === 'post' ? incomingTemplateId || undefined : undefined,
      enforceTemplate: false,
    };
  }

  const slotTemplateId = requestedFormat === 'post'
    ? String(slot.posterTemplateId ?? '').trim()
    : String(slot.storyTemplateId ?? '').trim();

  if (!slotTemplateId) {
    return {
      slot,
      format: requestedFormat,
      effectiveTemplateId: incomingTemplateId,
      effectivePosterTemplateId: requestedFormat === 'post' ? incomingTemplateId || undefined : undefined,
      enforceTemplate: false,
    };
  }

  return {
    slot,
    format: requestedFormat,
    effectiveTemplateId: slotTemplateId,
    effectivePosterTemplateId: requestedFormat === 'post' ? slotTemplateId : undefined,
    enforceTemplate: slotTemplateId !== incomingTemplateId,
  };
}
