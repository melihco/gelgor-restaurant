/**
 * Template AI — map campaign + format + slot signals → agency template contract.
 */

import {
  AGENCY_TEMPLATE_CATALOG,
  type AgencyTemplateContract,
  type AgencyTemplateFormat,
  type AgencyTemplateId,
} from './agency-templates';
import type { CampaignConcept } from './campaign-concepts';

export function resolveAgencyTemplate(input: {
  campaign: CampaignConcept;
  format: AgencyTemplateFormat;
  headline?: string | null;
  caption?: string | null;
  catalogSlotKey?: string | null;
  announcementType?: string | null;
  recentTemplateIds?: AgencyTemplateId[];
}): AgencyTemplateContract {
  const blob = [
    input.catalogSlotKey,
    input.announcementType,
    input.headline,
    input.caption,
    input.campaign.id,
    input.campaign.name,
  ]
    .filter(Boolean)
    .join(' ');

  const formatPool = AGENCY_TEMPLATE_CATALOG.filter((t) => t.format === input.format);
  const pool = formatPool.length ? formatPool : [...AGENCY_TEMPLATE_CATALOG];

  const scored = pool.map((t) => {
    let score = 0;
    if (t.preferredCampaignIds.includes(input.campaign.id)) score += 40;
    if (t.matchKeywords.test(blob)) score += 30;
    // Exact campaign→template affinity (beats shared keyword ties).
    if (
      (input.campaign.id === 'signature_cocktails' && t.id === 'cocktail_campaign')
      || (input.campaign.id === 'nightlife_event' && t.id === 'diagonal_luxury_story')
      || (input.campaign.id === 'product_harvest' && t.id === 'editorial_luxury_post')
      || (input.campaign.id === 'chef_special' && t.id === 'restaurant_food_story')
      || (input.campaign.id === 'weekend_brunch' && t.id === 'restaurant_food_story')
      || (input.campaign.id === 'seafood_menu' && t.id === 'editorial_luxury_post')
      || (input.campaign.id === 'sunset_dining' && t.id === 'editorial_luxury_post')
    ) {
      score += 20;
    }
    if (input.recentTemplateIds?.includes(t.id)) score -= 25;
    return { t, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.t;
  if (best && scored[0]!.score > 0) return best;

  // Format defaults
  if (input.format === 'story') {
    return pool.find((t) => t.id === 'diagonal_luxury_story')
      ?? pool.find((t) => t.id === 'restaurant_food_story')
      ?? pool[0]!;
  }
  return pool.find((t) => t.id === 'editorial_luxury_post')
    ?? pool.find((t) => t.id === 'cocktail_campaign')
    ?? pool[0]!;
}
