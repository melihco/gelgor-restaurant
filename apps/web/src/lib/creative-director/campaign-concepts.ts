/**
 * Campaign AI — pick a campaign concept before template/layout.
 * Multi-tenant: sector + slot + copy signals — never brand UUIDs.
 */

export type CampaignConceptId =
  | 'sunset_dining'
  | 'signature_cocktails'
  | 'weekend_brunch'
  | 'seafood_menu'
  | 'nightlife_event'
  | 'product_harvest'
  | 'chef_special'
  | 'venue_atmosphere';

export type CampaignConcept = {
  id: CampaignConceptId;
  name: string;
  /** Dynamic image-world prompt seed (filled with brand location later). */
  dynamicPromptSeed: string;
  mood: string;
};

export const CAMPAIGN_CONCEPTS: Record<CampaignConceptId, CampaignConcept> = {
  sunset_dining: {
    id: 'sunset_dining',
    name: 'Sunset Dining',
    dynamicPromptSeed:
      'Golden-hour dining on a Mediterranean terrace. Natural warm sunlight, soft long shadows, cinematic lifestyle hospitality photography.',
    mood: 'warm golden editorial',
  },
  signature_cocktails: {
    id: 'signature_cocktails',
    name: 'Signature Cocktails',
    dynamicPromptSeed:
      'Close-up of chilled rosé or signature cocktail poured into premium crystal glasses. Outdoor terrace, natural afternoon sunlight, soft bokeh, elegant lifestyle.',
    mood: 'refreshing premium hospitality',
  },
  weekend_brunch: {
    id: 'weekend_brunch',
    name: 'Weekend Brunch',
    dynamicPromptSeed:
      'Fresh brunch spread on premium ceramic — natural restaurant daylight, warm shadows, minimal luxury food styling.',
    mood: 'bright appetite editorial',
  },
  seafood_menu: {
    id: 'seafood_menu',
    name: 'Seafood Menu',
    dynamicPromptSeed:
      'Premium seafood plating — Mediterranean restaurant light, real reflections, appetite-forward editorial food photography.',
    mood: 'coastal culinary luxury',
  },
  nightlife_event: {
    id: 'nightlife_event',
    name: 'Nightlife Event',
    dynamicPromptSeed:
      'Premium nightlife / DJ atmosphere — dusk or night venue energy, controlled lights, cinematic hospitality (never sunny picnic for a night event).',
    mood: 'bold nocturnal premium',
  },
  product_harvest: {
    id: 'product_harvest',
    name: 'Product Harvest',
    dynamicPromptSeed:
      'Artisan product hero on natural materials — oak, linen, soft daylight still life. Preserve real packaging labels; never invent glyphs.',
    mood: 'organic luxury still life',
  },
  chef_special: {
    id: 'chef_special',
    name: 'Chef Special',
    dynamicPromptSeed:
      'Chef-plated signature dish on premium ceramic. Warm restaurant lighting, natural shadows, minimal styling, editorial food photography.',
    mood: 'chef editorial',
  },
  venue_atmosphere: {
    id: 'venue_atmosphere',
    name: 'Venue Atmosphere',
    dynamicPromptSeed:
      'Cinematic venue lifestyle — architecture, terrace, sea edge. Natural sunlight, luxury travel magazine framing.',
    mood: 'aspirational hospitality',
  },
};

export function resolveCampaignConcept(input: {
  headline?: string | null;
  caption?: string | null;
  announcementType?: string | null;
  catalogSlotKey?: string | null;
  businessType?: string | null;
  mood?: string | null;
  recentCampaignIds?: CampaignConceptId[];
}): CampaignConcept {
  const blob = [
    input.catalogSlotKey,
    input.announcementType,
    input.headline,
    input.caption,
    input.mood,
    input.businessType,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  let id: CampaignConceptId;
  if (/dj|night|gece|after.?dark|party|lineup|event_announcement/.test(blob)) {
    id = 'nightlife_event';
  } else if (/cocktail|şarap|wine|ros[eé]|drink|cheers|spritz|içki/.test(blob)) {
    id = 'signature_cocktails';
  } else if (/seafood|deniz mahsul|balık|oyster/.test(blob)) {
    id = 'seafood_menu';
  } else if (/brunch|kahvaltı|börek|pastry|yemek|food|menu|menü|chef/.test(blob)) {
    id = /chef|özel/.test(blob) ? 'chef_special' : 'weekend_brunch';
  } else if (/ürün|product|sepet|harvest|ambalaj|local_products/.test(blob)) {
    id = 'product_harvest';
  } else if (/gün bat|sunset|golden|altın saat/.test(blob)) {
    id = 'sunset_dining';
  } else if (/beach|hotel|resort|hospitality|marina/.test(blob)) {
    id = 'venue_atmosphere';
  } else {
    id = 'venue_atmosphere';
  }

  // Soft rotate if recently used the same campaign on this mission.
  const recent = new Set(input.recentCampaignIds ?? []);
  if (recent.has(id)) {
    const alts = (Object.keys(CAMPAIGN_CONCEPTS) as CampaignConceptId[]).filter((c) => !recent.has(c));
    if (alts.length) {
      const seed = blob.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      id = alts[seed % alts.length]!;
    }
  }

  return CAMPAIGN_CONCEPTS[id];
}
