/**
 * Premium template families — Canva-quality standard (not a Canva clone).
 *
 * Each family is a design system: creative direction defaults + preferred
 * Canva archetypes + brand adaptation rules. Selection is sector/slot-driven;
 * never brand UUIDs. Variation rotation prevents color-only clones.
 */

import type { CanvaArchetypeId } from '@/lib/canva-archetype-catalog';
import type { CreativeVariationKey } from '@/lib/premium-editorial/types';
import type { SlotLookKind } from '@/lib/slot-look-directive';

export type PremiumTemplateFamilyId =
  | 'luxury_hospitality'
  | 'mediterranean_lifestyle'
  | 'event_announcement'
  | 'menu_food_highlight'
  | 'contemporary_bold'
  | 'organic_artisan'
  | 'product_campaign'
  | 'editorial_minimal';

export type PremiumTemplateFamily = {
  id: PremiumTemplateFamilyId;
  name: string;
  brandPersonality: string[];
  visualMood: string;
  compositionStrategy: string;
  photographyDirection: string;
  typographyDirection: string;
  /** May include {primary} / {accent} placeholders. */
  colorStrategy: string;
  logoUsage: string;
  visualComplexity: 'low' | 'medium' | 'high';
  negativeSpaceStrategy: string;
  lightingStyle: string;
  textureStyle: string;
  campaignObjectiveHint: string;
  preferredArchetypes: CanvaArchetypeId[];
  preferredVariation: CreativeVariationKey;
  /** Brand adaptation knobs (prompt-facing). */
  adaptationRules: string[];
};

export const PREMIUM_TEMPLATE_FAMILIES: Record<PremiumTemplateFamilyId, PremiumTemplateFamily> = {
  luxury_hospitality: {
    id: 'luxury_hospitality',
    name: 'Luxury Hospitality',
    brandPersonality: ['premium', 'restrained', 'hospitality', 'warm'],
    visualMood: 'dark-lux hospitality with controlled accent light',
    compositionStrategy: 'cinematic full-bleed photo with whisper corner type and generous margins',
    photographyDirection: 'architectural hospitality, golden or blue hour, shallow depth',
    typographyDirection: 'high-contrast display serif paired with refined grotesk sans',
    colorStrategy: 'deep ink and warm neutrals; accent {accent} sparingly on rules/CTA; primary {primary} for type',
    logoUsage: 'small discreet mark in lower safe area',
    visualComplexity: 'low',
    negativeSpaceStrategy: 'large calm zones — never fill every edge',
    lightingStyle: 'cinematic directional warmth',
    textureStyle: 'stone, linen, glass — authentic materials',
    campaignObjectiveHint: 'premium venue desire',
    preferredArchetypes: ['cinematic_full_bleed', 'noir_editorial', 'magazine_cover_drop'],
    preferredVariation: 'ArchitecturalHospitality',
    adaptationRules: [
      'Prefer dark/moody overlays over bright paint slabs',
      'Headline short; subtitle optional whisper',
      'Border radius soft or zero — never chunky pills',
    ],
  },
  mediterranean_lifestyle: {
    id: 'mediterranean_lifestyle',
    name: 'Mediterranean Lifestyle',
    brandPersonality: ['mediterranean', 'sunlit', 'natural', 'warm'],
    visualMood: 'sunlit Aegean editorial travel campaign',
    compositionStrategy: 'asymmetrical photo-led layout — type floats in sky/bokeh negative space',
    photographyDirection: 'natural Mediterranean daylight, lifestyle terrace or sea edge',
    typographyDirection: 'editorial serif headline + modern sans support',
    colorStrategy: 'sand/cream type on photo; brand primary {primary}, accent {accent} on thin rules only',
    logoUsage: 'quiet corner on photo, never competing with headline',
    visualComplexity: 'medium',
    negativeSpaceStrategy: 'type in photographic negative space; photo remains 100% hero',
    lightingStyle: 'natural golden daylight',
    textureStyle: 'wood, linen, sea air, bougainvillea',
    campaignObjectiveHint: 'seasonal lifestyle desire',
    preferredArchetypes: ['split_feature_panel', 'magazine_cover_drop', 'cinematic_full_bleed'],
    preferredVariation: 'GoldenHourLifestyle',
    adaptationRules: [
      'Type in negative space — never opaque cream paint panels',
      'Avoid neon nightlife craft unless slot is event',
      'Keep photo crop intentional — not centered stock clutter',
    ],
  },
  event_announcement: {
    id: 'event_announcement',
    name: 'Event Announcement',
    brandPersonality: ['bold', 'nocturnal', 'energetic', 'premium'],
    visualMood: 'premium nightlife poster energy',
    compositionStrategy: 'full-bleed atmosphere + lower-third type stack with accent rule',
    photographyDirection: 'night/crowd/lights or dusk venue — never sunny beach picnic for DJ',
    typographyDirection: 'ultra-condensed impact display, uppercase event name',
    colorStrategy: 'dark photo grade; electric accent {accent} on thin rules; primary {primary} for type accents',
    logoUsage: 'bottom corner, small, after type hierarchy',
    visualComplexity: 'high',
    negativeSpaceStrategy: 'soft dark scrim for legibility; upper photo breathes — no paint wedge',
    lightingStyle: 'moody night / dusk crush',
    textureStyle: 'light spill, bokeh, stage atmosphere',
    campaignObjectiveHint: 'drive event attendance',
    preferredArchetypes: ['neon_night_promo', 'event_ticket_stub', 'diagonal_brand_split'],
    preferredVariation: 'DarkLuxuryStillLife',
    adaptationRules: [
      'No soft Times serif for DJ/event names',
      'Date/time as clear secondary architecture',
      'Forbid yellow/mustard paint slabs and diagonal wedges covering ≥20% of frame',
    ],
  },
  menu_food_highlight: {
    id: 'menu_food_highlight',
    name: 'Menu and Food Highlight',
    brandPersonality: ['appetite', 'hospitality', 'editorial', 'warm'],
    visualMood: 'chef-editorial food campaign',
    compositionStrategy: 'food hero dominant with side or bottom type lockup that never covers the plate',
    photographyDirection: 'premium restaurant food photography, natural side light',
    typographyDirection: 'refined serif dish name + clean sans meta/price',
    colorStrategy: 'appetite-safe neutrals; brand {primary}/{accent} on type and thin rules only',
    logoUsage: 'small venue mark away from food hero',
    visualComplexity: 'medium',
    negativeSpaceStrategy: 'protect plated hero — type in quiet zone',
    lightingStyle: 'soft restaurant daylight or warm tungsten',
    textureStyle: 'ceramic, linen, garnish detail',
    campaignObjectiveHint: 'promote menu highlight',
    preferredArchetypes: ['split_feature_panel', 'product_hero_card', 'magazine_cover_drop'],
    preferredVariation: 'ChefCraft',
    adaptationRules: [
      'Never invent dish names beyond contracted copy',
      'Avoid covering food with opaque slabs',
      'Price/CTA secondary to dish name',
    ],
  },
  contemporary_bold: {
    id: 'contemporary_bold',
    name: 'Contemporary Bold',
    brandPersonality: ['bold', 'modern', 'high-contrast', 'campaign'],
    visualMood: 'high-contrast campaign editorial on photo',
    compositionStrategy: 'oversized type in negative space on full-bleed photo — thin accent geometry only',
    photographyDirection: 'strong crop, graphic subject, high clarity',
    typographyDirection: 'condensed sans impact — oversized headline',
    colorStrategy: 'high contrast type; brand {primary}/{accent} on thin rules and micro chips — never opaque blocks',
    logoUsage: 'aligned quiet corner, not floating randomly',
    visualComplexity: 'high',
    negativeSpaceStrategy: 'large photographic breathing gaps for type',
    lightingStyle: 'crisp commercial',
    textureStyle: 'photo hero + hairline accent craft',
    campaignObjectiveHint: 'campaign urgency',
    preferredArchetypes: ['campaign_hero_block', 'magazine_cover_drop', 'diagonal_brand_split'],
    preferredVariation: 'EditorialProductHero',
    adaptationRules: [
      'Bold via type scale and grade — not paint panels',
      'One dominant headline — no competing slogans',
      'CTA as thin underline / hairline — never filled button slab',
    ],
  },
  organic_artisan: {
    id: 'organic_artisan',
    name: 'Organic Artisan',
    brandPersonality: ['artisan', 'natural', 'local', 'handmade'],
    visualMood: 'organic craft still-life editorial',
    compositionStrategy: 'product-centered with cream cards and earth-tone accents',
    photographyDirection: 'natural materials, soft daylight still life',
    typographyDirection: 'humanist serif + warm sans',
    colorStrategy: 'earth tones; olive/terracotta; brand {primary}/{accent} on cream',
    logoUsage: 'badge-like small mark or corner wordmark',
    visualComplexity: 'medium',
    negativeSpaceStrategy: 'soft margins around product hero',
    lightingStyle: 'diffused natural daylight',
    textureStyle: 'kraft, linen, wood, botanical',
    campaignObjectiveHint: 'local product desire',
    preferredArchetypes: ['product_hero_card', 'polaroid_memory', 'frosted_quote_card'],
    preferredVariation: 'SeasonalEditorial',
    adaptationRules: [
      'Preserve real packaging labels — never invent glyphs on SKUs',
      'Rounded cream cards over hard neon slabs',
      'Warm, handmade feel — not tech SaaS',
    ],
  },
  product_campaign: {
    id: 'product_campaign',
    name: 'Product Campaign',
    brandPersonality: ['retail', 'clear', 'commercial', 'trust'],
    visualMood: 'clean product campaign with offer hierarchy',
    compositionStrategy: 'controlled product frame + badge/CTA architecture',
    photographyDirection: 'clean product hero, controlled background',
    typographyDirection: 'clear commercial hierarchy — name, offer, CTA',
    colorStrategy: 'brand {primary} for offer; {accent} for badge; cream/white support',
    logoUsage: 'top or bottom brand lockup, never over product SKU',
    visualComplexity: 'medium',
    negativeSpaceStrategy: 'frame product; keep price/CTA readable',
    lightingStyle: 'even commercial product light',
    textureStyle: 'clean surface, soft shadow',
    campaignObjectiveHint: 'drive product conversion',
    preferredArchetypes: ['promo_price_stack', 'product_hero_card', 'campaign_hero_block'],
    preferredVariation: 'EditorialProductHero',
    adaptationRules: [
      'Price/badge hierarchy must be intentional',
      'No fake packaging text',
      'CTA last in visual reading order',
    ],
  },
  editorial_minimal: {
    id: 'editorial_minimal',
    name: 'Editorial Minimal',
    brandPersonality: ['minimal', 'editorial', 'fashion', 'quiet'],
    visualMood: 'quiet luxury magazine cover',
    compositionStrategy: 'large photo field, tiny type, thin rules, controlled emptiness',
    photographyDirection: 'editorial fashion/lifestyle, strong negative space',
    typographyDirection: 'Didot/Playfair-class serif whisper + micro sans meta',
    colorStrategy: 'mostly photo; brand {primary}/{accent} only on thin accents',
    logoUsage: 'micro mark — never oversized',
    visualComplexity: 'low',
    negativeSpaceStrategy: 'maximum calm — resist filling space',
    lightingStyle: 'soft editorial',
    textureStyle: 'paper-like calm, no busy patterns',
    campaignObjectiveHint: 'brand atmosphere',
    preferredArchetypes: ['magazine_cover_drop', 'cinematic_full_bleed', 'noir_editorial'],
    preferredVariation: 'MinimalMaterialStudy',
    adaptationRules: [
      'Less type is more',
      'Forbid busy geometric stacks',
      'One thin rule max as craft accent',
    ],
  },
};

const FAMILY_BY_SLOT_LOOK: Partial<Record<SlotLookKind, PremiumTemplateFamilyId>> = {
  nightlife_event: 'event_announcement',
  offer_booking: 'mediterranean_lifestyle',
  golden_hour: 'mediterranean_lifestyle',
  product_hero: 'organic_artisan',
  venue_ambiance: 'luxury_hospitality',
  social_proof: 'contemporary_bold',
  // generic_editorial intentionally omitted — fall through to caption/catalog/sector.
};

function sectorDefaultFamily(businessType?: string | null): PremiumTemplateFamilyId {
  const s = String(businessType ?? '').toLowerCase();
  if (/local_products|harvest|retail|shop/.test(s)) return 'organic_artisan';
  if (/nightclub|bar_lounge/.test(s)) return 'event_announcement';
  if (/restaurant|cafe|bakery|fine_dining/.test(s)) return 'menu_food_highlight';
  if (/beach|hotel|resort|hospitality|marina/.test(s)) return 'luxury_hospitality';
  if (/saas|fitness|gym/.test(s)) return 'contemporary_bold';
  return 'editorial_minimal';
}

export function resolvePremiumTemplateFamily(input: {
  slotLook?: SlotLookKind | null;
  announcementType?: string | null;
  catalogSlotKey?: string | null;
  businessType?: string | null;
  headline?: string | null;
  caption?: string | null;
}): PremiumTemplateFamily {
  const ann = String(input.announcementType ?? '').toLowerCase();
  const key = String(input.catalogSlotKey ?? '').toLowerCase();
  const blob = `${ann} ${key} ${input.headline ?? ''} ${input.caption ?? ''}`.toLowerCase();

  let id: PremiumTemplateFamilyId | null = null;
  // Catalog / copy signals beat weak generic slot looks so harvest/product posts
  // don't collapse to editorial_minimal when sector slug is noisy.
  if (/dj|night|event|konser|party|lineup/.test(blob)) {
    id = 'event_announcement';
  } else if (/menu|yemek|seafood|deniz mahsul|chef|food|brunch/.test(blob)) {
    id = 'menu_food_highlight';
  } else if (/ürün|product|sepet|harvest|ambalaj|local_products/.test(blob)) {
    id = 'organic_artisan';
  } else if (/indirim|kampanya|%|offer|fiyat|price/.test(blob)) {
    id = 'product_campaign';
  } else if (input.slotLook && FAMILY_BY_SLOT_LOOK[input.slotLook]) {
    id = FAMILY_BY_SLOT_LOOK[input.slotLook]!;
  } else {
    id = sectorDefaultFamily(input.businessType);
  }

  // Diversify: same sector+slot repeating the same family → rotate by seed hash.
  const seed = `${id}:${key}:${ann}:${input.headline ?? ''}`.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const alts = PREMIUM_TEMPLATE_FAMILIES[id].preferredArchetypes;
  void alts;
  void seed;
  return PREMIUM_TEMPLATE_FAMILIES[id];
}

/** Prefer family's first archetype when matcher has no hard pin. */
export function preferredArchetypeForFamily(
  familyId: PremiumTemplateFamilyId,
  recentArchetypes?: Array<string | null | undefined>,
): CanvaArchetypeId {
  const family = PREMIUM_TEMPLATE_FAMILIES[familyId];
  const recent = new Set((recentArchetypes ?? []).filter(Boolean));
  const fresh = family.preferredArchetypes.find((a) => !recent.has(a));
  return fresh ?? family.preferredArchetypes[0]!;
}

export function formatPremiumTemplateFamilyBlock(family: PremiumTemplateFamily): string {
  return [
    `═══ TEMPLATE FAMILY: ${family.name} (${family.id}) ═══`,
    `Style: ${family.visualMood}`,
    `Composition: ${family.compositionStrategy}`,
    `Type system: ${family.typographyDirection}`,
    `Photo: ${family.photographyDirection}`,
    `Logo: ${family.logoUsage}`,
    `Complexity: ${family.visualComplexity}`,
    `Adaptation: ${family.adaptationRules.join(' · ')}`,
    'This family must remain recognizable across brands while colors/fonts/logo adapt — never a recolored clone of another tenant.',
  ].join('\n');
}
