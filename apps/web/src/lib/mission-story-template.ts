/**
 * Mission / AutoProductionFeed — brand story slot resolution (catalog SSOT).
 */
import {
  ensureBrandTemplateLibrary,
  selectBrandLibrarySlot,
  type BrandTemplateLibrary,
  type BrandTemplateLibrarySlot,
} from './brand-template-library';
import { resolveContentIntent, type ContentIntent } from './brand-motion-profile';

export interface MissionStorySlotPick {
  slot: BrandTemplateLibrarySlot;
  kitId: string;
  intent: ContentIntent;
  library: BrandTemplateLibrary;
}

function getIdeaField(idea: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = idea[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

export function ideaFieldsForStoryTemplate(idea: Record<string, unknown>) {
  const vps = idea.visual_production_spec as Record<string, unknown> | undefined;
  return {
    treatment: getIdeaField(idea, 'treatment').toLowerCase()
      || String(vps?.treatment ?? '').toLowerCase(),
    templateUseCase: getIdeaField(idea, 'template_use_case'),
    mood: getIdeaField(idea, 'mood', 'tone').toLowerCase(),
    headline: getIdeaField(idea, 'headline', 'concept_title', 'title', 'hook'),
  };
}

export function listEnabledStorySlots(library: BrandTemplateLibrary): BrandTemplateLibrarySlot[] {
  return library.slots.filter((s) => s.format === 'story' && s.enabled);
}

/** Rotate Marka Detayı story slots across weekly mission story ideas. */
export function missionStoryLibrarySlotKey(
  library: BrandTemplateLibrary,
  storyIndex: number,
): string | undefined {
  const slots = listEnabledStorySlots(library);
  if (!slots.length) return undefined;
  return slots[storyIndex % slots.length]!.key;
}

export function resolveMissionStorySlot(input: {
  theme: Record<string, unknown> | null | undefined;
  sector: string;
  tenantId: string;
  idea: Record<string, unknown>;
  ideaIndex: number;
  librarySlotKey?: string;
}): MissionStorySlotPick {
  const { treatment, templateUseCase, mood, headline } = ideaFieldsForStoryTemplate(input.idea);
  const intent = resolveContentIntent({
    treatment,
    templateUseCase,
    mood,
    headline,
    contentType: 'story',
  });
  const library = ensureBrandTemplateLibrary(input.theme, {
    sector: input.sector,
    tenantId: input.tenantId,
  });
  const forced = input.librarySlotKey
    ? library.slots.find((s) => s.key === input.librarySlotKey && s.enabled && s.format === 'story')
    : undefined;
  const slot = forced ?? selectBrandLibrarySlot(library, {
    intent,
    treatment,
    ideaIndex: input.ideaIndex,
    format: 'story',
  });
  return { slot, kitId: library.kitId, intent, library };
}

/** Manual slot override (expanded panel in Mission Factory). */
export function resolveStoryTemplateForSlot(
  library: BrandTemplateLibrary,
  slotKey: string,
  _sector: string,
): MissionStorySlotPick | null {
  const slot = library.slots.find((s) => s.key === slotKey && s.format === 'story' && s.enabled);
  if (!slot) return null;
  return {
    slot,
    kitId: library.kitId,
    intent: 'daily_moment',
    library,
  };
}
