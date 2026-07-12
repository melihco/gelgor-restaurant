/**
 * Bridge: active catalog slots → CreativeIntent / content_needs (operating policy SSOT).
 * Replaces hardcoded playbook defaultContentNeeds for production-aligned tenants.
 */

import type { CreativeIntent } from '@/lib/creative-production-contracts';
import type { BrandActiveSlot } from '@/lib/brand-active-slot-resolver';
import {
  resolveBrandSlotFacilities,
  slotEnabledByFacilities,
  synthesizeSectorSlotDefinitions,
  type BrandSlotFacilities,
} from '@/lib/sector-slot-pack';
import { normalizeSectorId } from '@/lib/sector-production-profile';
import type { ProductionSlotDefinition } from '@/lib/production-slot-catalog';

const DESIGN_TYPE_TO_INTENTS: Record<string, CreativeIntent[]> = {
  campaign_announcement: ['campaign_offer'],
  event_special: ['event_announcement'],
  menu_highlight: ['menu_share', 'product_highlight'],
  venue_showcase: ['daily_story', 'behind_the_scenes'],
  social_proof: ['social_proof'],
  seasonal_promo: ['seasonal_content', 'campaign_offer'],
  brand_identity: ['brand_awareness'],
  daily_story: ['daily_story'],
  announcement_formal: ['event_announcement', 'lead_generation'],
  reel_cover: ['behind_the_scenes'],
};

const ANNOUNCEMENT_TO_INTENT: Record<string, CreativeIntent> = {
  offer_campaign: 'campaign_offer',
  event_teaser: 'event_announcement',
  event_announcement: 'event_announcement',
  social_proof: 'social_proof',
  product_reveal: 'product_highlight',
  product_showcase: 'product_highlight',
  venue_showcase: 'daily_story',
};

const FORMAT_INTENT_BOOST: Record<string, CreativeIntent> = {
  story: 'daily_story',
  reel: 'behind_the_scenes',
  carousel: 'educational_post',
};

function uniqueIntents(intents: CreativeIntent[], cap = 8): CreativeIntent[] {
  return [...new Set(intents)].slice(0, cap);
}

function intentsFromSlotDefinition(slot: Pick<
  ProductionSlotDefinition,
  'design_template_type' | 'format' | 'match_signals'
>): CreativeIntent[] {
  const out: CreativeIntent[] = [];
  const designType = String(slot.design_template_type ?? '').trim();
  if (designType && DESIGN_TYPE_TO_INTENTS[designType]) {
    out.push(...DESIGN_TYPE_TO_INTENTS[designType]);
  }
  const signals = slot.match_signals as { announcement_types?: string[] } | undefined;
  for (const ann of signals?.announcement_types ?? []) {
    const mapped = ANNOUNCEMENT_TO_INTENT[String(ann).trim()];
    if (mapped) out.push(mapped);
  }
  const fmtBoost = FORMAT_INTENT_BOOST[String(slot.format ?? '')];
  if (fmtBoost) out.push(fmtBoost);
  return out;
}

/** Derive content needs from enabled brand active slots (tenant assignments + catalog). */
export function deriveContentNeedsFromActiveSlots(
  slots: BrandActiveSlot[],
  cap = 8,
): CreativeIntent[] {
  const enabled = slots.filter((s) => s.enabled);
  const intents: CreativeIntent[] = [];
  for (const slot of enabled) {
    intents.push(...intentsFromSlotDefinition({
      design_template_type: slot.designTemplateType,
      format: slot.format,
      match_signals: { design_template_type: slot.designTemplateType },
    }));
    if (slot.format === 'story') intents.push('daily_story');
    if (slot.format === 'reel') intents.push('behind_the_scenes');
    if (slot.designTemplateType === 'social_proof') intents.push('social_proof');
    if (slot.designTemplateType === 'event_special') intents.push('event_announcement');
    if (slot.designTemplateType === 'campaign_announcement') intents.push('campaign_offer');
  }
  return uniqueIntents(intents, cap);
}

/** Sector-level fallback when tenant assignments are not loaded (sync). */
export function deriveContentNeedsFromSectorPack(
  sector: string,
  facilities?: BrandSlotFacilities | Record<string, unknown> | null,
  cap = 8,
): CreativeIntent[] {
  const sectorId = normalizeSectorId(sector);
  const resolvedFacilities = resolveBrandSlotFacilities(facilities);
  const definitions = synthesizeSectorSlotDefinitions(sectorId, resolvedFacilities);
  const intents: CreativeIntent[] = [];
  for (const slot of definitions) {
    const optionalTags = slot.optional_tags;
    if (!slotEnabledByFacilities(optionalTags, resolvedFacilities)) continue;
    intents.push(...intentsFromSlotDefinition(slot));
  }
  return uniqueIntents(intents, cap);
}

/** Preferred default content needs: active slots → sector pack → legacy playbook. */
export function resolveDefaultContentNeeds(input: {
  sector: string;
  activeSlots?: BrandActiveSlot[];
  slotFacilities?: BrandSlotFacilities | Record<string, unknown> | null;
  playbookFallback?: CreativeIntent[];
}): CreativeIntent[] {
  if (input.activeSlots?.length) {
    const fromSlots = deriveContentNeedsFromActiveSlots(input.activeSlots);
    if (fromSlots.length > 0) return fromSlots;
  }
  const fromPack = deriveContentNeedsFromSectorPack(input.sector, input.slotFacilities);
  if (fromPack.length > 0) return fromPack;
  return input.playbookFallback ?? ['service_intro', 'social_proof'];
}
