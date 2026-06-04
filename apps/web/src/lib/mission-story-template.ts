/**
 * Mission / AutoProductionFeed — brand story template resolution.
 * Mirrors auto-produce route logic for stable client-side Remotion renders.
 */
import type { StoryCompositionId } from '@/remotion/types';
import {
  ensureBrandTemplateLibrary,
  resolveBrandStoryProductionTemplate,
  resolveStoryCompositionForBrandTemplate,
  compositionIdForStoryTemplate,
  type BrandTemplateLibrary,
  type BrandTemplateLibrarySlot,
} from './brand-template-library';
import {
  resolveBrandRemotionRenderPolicy,
  resolveContentIntent,
  type ContentIntent,
} from './brand-motion-profile';
import { REMOTION_TEMPLATE_BY_ID } from './remotion-template-catalog';

export interface MissionStoryTemplatePick {
  slot: BrandTemplateLibrarySlot;
  storyTemplateId?: string;
  compositionId: StoryCompositionId;
  kitId: string;
  intent: ContentIntent;
  templateName: string;
  collection?: string;
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

export function resolveMissionStoryTemplate(input: {
  theme: Record<string, unknown> | null | undefined;
  sector: string;
  tenantId: string;
  idea: Record<string, unknown>;
  ideaIndex: number;
  usedTemplateIds?: string[];
}): MissionStoryTemplatePick {
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
  const pick = resolveBrandStoryProductionTemplate({
    library,
    sector: input.sector,
    intent,
    treatment,
    ideaIndex: input.ideaIndex,
    usedTemplateIds: input.usedTemplateIds,
    headline: headline || undefined,
    templateUseCase,
  });
  const tpl = REMOTION_TEMPLATE_BY_ID.get(pick.storyTemplateId);

  return {
    slot: pick.slot,
    storyTemplateId: pick.storyTemplateId,
    compositionId: pick.compositionId as StoryCompositionId,
    kitId: pick.kitId,
    intent: pick.intent,
    templateName: pick.templateNameTr,
    collection: tpl?.collection,
    library,
  };
}

/** Manual slot override (expanded panel in Mission Factory). */
export function resolveStoryTemplateForSlot(
  library: BrandTemplateLibrary,
  slotKey: string,
  sector: string,
): MissionStoryTemplatePick | null {
  const slot = library.slots.find((s) => s.key === slotKey && s.format === 'story' && s.enabled);
  if (!slot?.storyTemplateId) return null;
  const tpl = REMOTION_TEMPLATE_BY_ID.get(slot.storyTemplateId);
  const compositionId = compositionIdForStoryTemplate(slot.storyTemplateId, slot) as StoryCompositionId;
  return {
    slot,
    storyTemplateId: slot.storyTemplateId,
    compositionId,
    kitId: library.kitId,
    intent: 'daily_moment',
    templateName: tpl?.nameTr ?? slot.labelTr,
    collection: tpl?.collection,
    library,
  };
}

export function listEnabledStorySlots(library: BrandTemplateLibrary): BrandTemplateLibrarySlot[] {
  return library.slots.filter((s) => s.format === 'story' && s.enabled && s.storyTemplateId);
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

export interface StoryRemotionRenderBody {
  compositionId: StoryCompositionId;
  workspaceId: string;
  useCreativeDirector: boolean;
  brandTemplateLocked?: boolean;
  allowedCompositions?: StoryCompositionId[];
  motionStyle?: string;
  locale?: string;
  props: Record<string, unknown>;
}

export function buildStoryRemotionRenderRequest(input: {
  pick: MissionStoryTemplatePick;
  workspaceId: string;
  photoUrl: string;
  headline: string;
  caption: string;
  brandName: string;
  location?: string;
  mood?: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  bodyFont?: string;
  motionStyle?: string;
  locale?: string;
  brandTheme?: Record<string, unknown> | null;
  sector?: string;
}): StoryRemotionRenderBody {
  const { pick } = input;
  const policy = input.brandTheme
    ? resolveBrandRemotionRenderPolicy(input.brandTheme, { sector: input.sector })
    : null;
  return {
    compositionId: pick.compositionId,
    workspaceId: input.workspaceId,
    useCreativeDirector: true,
    brandTemplateLocked: pick.library.locked ?? policy?.brandTemplateLocked,
    allowedCompositions: policy?.allowedCompositions,
    motionStyle: input.motionStyle ?? policy?.motionStyle,
    locale: input.locale ?? policy?.locale,
    props: {
      photoUrl: input.photoUrl,
      headline: input.headline,
      subtitle: input.caption.slice(0, 120),
      brandName: input.brandName,
      location: input.location ?? '',
      mood: input.mood ?? '',
      logoUrl: input.logoUrl,
      templateId: pick.storyTemplateId,
      kitId: pick.kitId,
      primaryColor: input.primaryColor,
      accentColor: input.accentColor,
      fontFamily: input.fontFamily,
      bodyFont: input.bodyFont,
    },
  };
}
