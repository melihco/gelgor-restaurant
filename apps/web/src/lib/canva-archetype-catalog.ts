/**
 * Canva Pro archetype catalog — shared by fal.ai design brief + Remotion creative director.
 *
 * MULTI-TENANT: No brand or venue names here. Routing uses:
 *   1. Tenant brandTheme.typography_design.preferred_canva_archetypes (optional override)
 *   2. Canonical sector slug (normalizeSectorId) from each workspace's profile
 *   3. Caption / use-case signals (same for all tenants in that vertical)
 *   4. Agent fal_design_brief per idea (tenant-scoped execution output)
 */

import { normalizeSectorId } from '@/lib/sector-production-profile';

export type CanvaArchetypeId =
  | 'frosted_quote_card'
  | 'magazine_cover_drop'
  | 'split_feature_panel'
  | 'cinematic_full_bleed'
  | 'campaign_hero_block'
  | 'event_ticket_stub'
  | 'gallery_carousel_tease'
  | 'before_after_diptych'
  | 'location_pin_card'
  | 'neon_night_promo'
  | 'polaroid_memory'
  | 'noir_editorial'
  | 'diagonal_brand_split'
  | 'promo_price_stack'
  | 'social_proof_banner'
  | 'editorial_date_masthead'
  | 'product_hero_card'
  | 'graphic_shape_stack';

export type CanvaFormat = 'post' | 'reel' | 'story';

export interface CanvaArchetypeSpec {
  id: CanvaArchetypeId;
  /** Display name for agents + prompts */
  name: string;
  /** One-line Canva Pro template description */
  description: string;
  layoutPattern: string;
  typographyMode: string;
  graphicAccents: string[];
  photoZone?: string;
  motionCue?: string;
  formats: CanvaFormat[];
  /** template_use_case values that route here */
  useCases?: string[];
  /** caption/headline keyword signals */
  keywordRx?: RegExp;
}

export const CANVA_ARCHETYPE_CATALOG: CanvaArchetypeSpec[] = [
  {
    id: 'frosted_quote_card',
    name: 'Frosted Quote Card',
    description: 'Soft glass/frosted panel, serif headline, minimal copy — testimonial or manifesto energy.',
    layoutPattern: 'frosted_quote_card — centered or offset glass panel over soft photo blur',
    typographyMode: 'quote_pull — serif headline, whisper-light subline',
    graphicAccents: ['frosted glass panel', 'quote mark graphic', 'soft vignette'],
    photoZone: 'full-bleed background — natural photo visible through frosted panel edges',
    formats: ['post', 'reel', 'story'],
    useCases: ['social_proof', 'daily_story'],
    keywordRx: /müşteri|testimonial|quote|yorum|mutlu|review|manifesto/i,
  },
  {
    id: 'magazine_cover_drop',
    name: 'Magazine Cover Drop',
    description: 'Bold cover line, category stamp, photo bleed — editorial magazine energy.',
    layoutPattern: 'magazine_cover — asymmetric photo bleed + bold display headline block',
    typographyMode: 'editorial_display — dramatic headline/subline hierarchy',
    graphicAccents: ['category label strip', 'thin rule line', 'date/issue stamp'],
    photoZone: 'photo bleeds behind headline — upper or side crop, natural pixels',
    formats: ['post', 'reel', 'story'],
    useCases: ['behind_the_scenes', 'product_highlight'],
    keywordRx: /editorial|chef|spotlight|feature|magazine|kapak/i,
  },
  {
    id: 'split_feature_panel',
    name: 'Split Feature Panel',
    description: 'Photo zone + solid brand color panel — CTA pill, premium hospitality default.',
    layoutPattern: 'split_feature_panel — 45/55 or 50/50 photo + brand color typography panel',
    typographyMode: 'bold_display stack — headline + supporting line + CTA pill',
    graphicAccents: ['brand color block', 'CTA pill shape', 'accent underline'],
    photoZone: 'left or lower panel — venue photo natural and crisp',
    motionCue: 'micro-parallax between color panel and photo zone',
    formats: ['post', 'reel', 'story'],
    useCases: ['product_highlight', 'daily_story'],
    keywordRx: /split|panel|feature|rezervasyon|book/i,
  },
  {
    id: 'diagonal_brand_split',
    name: 'Diagonal Brand Split',
    description: 'Diagonal color wedge + photo hero — high-energy nightlife / beach club favorite.',
    layoutPattern: 'diagonal_brand_split — angled brand block top-left + photo hero lower-right',
    typographyMode: 'condensed_impact — stacked headline on color wedge',
    graphicAccents: ['diagonal color wedge', 'accent bar', 'decorative circle or star'],
    photoZone: 'lower 45–55% — real venue crowd/atmosphere unchanged',
    motionCue: 'gentle push-in on photo wedge + locked headline block',
    formats: ['post', 'reel', 'story'],
    useCases: ['campaign_offer', 'social_proof'],
    keywordRx: /cheers|party|gece|night|celebrate|kutla/i,
  },
  {
    id: 'cinematic_full_bleed',
    name: 'Cinematic Full Bleed',
    description: 'Horizon/sky/sea full bleed, tiny type corner, film grain — aspirational lifestyle.',
    layoutPattern: 'cinematic_full_bleed — edge-to-edge photo + compact corner type lockup',
    typographyMode: 'whisper_light minimal — small but high-contrast corner headline',
    graphicAccents: ['film grain hint', 'soft bottom gradient scrim', 'tiny brand badge'],
    photoZone: 'full frame hero — 85%+ natural photo, type in safe corner only',
    motionCue: 'slow cinematic drift on photo, static corner type',
    formats: ['reel', 'story', 'post'],
    useCases: ['daily_story'],
    keywordRx: /sunset|gün bat|horizon|sky|sea|deniz|manzara|view/i,
  },
  {
    id: 'campaign_hero_block',
    name: 'Campaign Hero Block',
    description: 'High-contrast offer block, urgency typography — ONLY for real promos/discounts.',
    layoutPattern: 'campaign_hero_block — dominant offer headline on brand slab + supporting photo strip',
    typographyMode: 'condensed_impact — oversized %/offer + urgency subline',
    graphicAccents: ['promo badge', 'high-contrast color slab', 'accent starburst'],
    photoZone: 'lower strip or side band — product/venue supporting the offer',
    motionCue: 'light sweep across offer block, subtle photo pulse',
    formats: ['post', 'reel', 'story'],
    useCases: ['campaign_offer'],
    keywordRx: /%|indirim|kampanya|offer|discount|fırsat|promo|launch/i,
  },
  {
    id: 'event_ticket_stub',
    name: 'Event Ticket Stub',
    description: 'Date/time/lineup, perforated edge feel, RSVP CTA — concerts, DJ, openings.',
    layoutPattern: 'event_ticket_stub — masthead date block + lineup headline + photo tear-off zone',
    typographyMode: 'event_masthead — date stamp + bold event name stack',
    graphicAccents: ['date stamp block', 'perforated edge line', 'RSVP CTA pill'],
    photoZone: 'lower ticket zone — crowd/DJ/venue atmosphere photo',
    motionCue: 'subtle ticket shimmer + locked date typography',
    formats: ['post', 'reel', 'story'],
    useCases: ['event_announcement'],
    keywordRx: /etkinlik|event|konser|dj|live|açılış|opening|lineup|tarih/i,
  },
  {
    id: 'neon_night_promo',
    name: 'Neon Night Promo',
    description: 'Club/DJ electric accent, bold sans, dark moody base — nightlife reels.',
    layoutPattern: 'neon_night_promo — dark base + neon accent typography + photo glow spill',
    typographyMode: 'neon_glow display — bold sans with light spill on panel',
    graphicAccents: ['neon accent line', 'electric glow shape', 'dark gradient scrim'],
    photoZone: 'mid/lower frame — club lights and crowd, natural neon ambience',
    motionCue: 'bokeh pulse + neon shimmer, locked headline',
    formats: ['reel', 'story', 'post'],
    useCases: ['event_announcement', 'campaign_offer'],
    keywordRx: /club|kulüp|rooftop|dj|after|party|gece/i,
  },
  {
    id: 'social_proof_banner',
    name: 'Social Proof Banner',
    description: 'Customer joy banner over crowd photo — reviews, cheers, UGC moments.',
    layoutPattern: 'social_proof_banner — top headline banner + full-width crowd photo hero',
    typographyMode: 'quote_pull + bold headline — customer-voice emphasis',
    graphicAccents: ['star row', 'quote marks', 'accent banner strip'],
    photoZone: 'lower 60% — real customers/crowd, natural colors',
    formats: ['post', 'reel'],
    useCases: ['social_proof'],
    keywordRx: /müşteri|customer|happy|mutlu|cheers|review|yorum|ugc/i,
  },
  {
    id: 'promo_price_stack',
    name: 'Promo Price Stack',
    description: 'Stacked price/offer typography with product photo corner — retail & F&B promos.',
    layoutPattern: 'promo_price_stack — oversized offer type stack + product photo corner anchor',
    typographyMode: 'oversized_display — price/offer dominates, product secondary',
    graphicAccents: ['price circle badge', 'accent bar', 'corner product frame'],
    photoZone: 'corner or lower third — product/plate photo crisp',
    formats: ['post', 'reel'],
    useCases: ['campaign_offer', 'product_highlight'],
    keywordRx: /menu|tabak|yemek|fiyat|price|combo|set menü/i,
  },
  {
    id: 'editorial_date_masthead',
    name: 'Editorial Date Masthead',
    description: 'Seasonal/editorial masthead with date line — launches, seasonal campaigns.',
    layoutPattern: 'editorial_date_masthead — top date/category line + serif headline + photo base',
    typographyMode: 'editorial_serif — refined hierarchy with date stamp',
    graphicAccents: ['date line', 'category label', 'thin divider'],
    photoZone: 'lower half — seasonal venue/product scene',
    formats: ['post', 'reel', 'story'],
    useCases: ['event_announcement', 'behind_the_scenes'],
    keywordRx: /sezon|season|yaz|kış|launch|yeni/i,
  },
  {
    id: 'product_hero_card',
    name: 'Product Hero Card',
    description: 'Product/ dish hero centered with minimal type band — menu & showcase posts.',
    layoutPattern: 'product_hero_card — centered hero object + minimal top/bottom type bands',
    typographyMode: 'minimal_overlay — short punchy headline only',
    graphicAccents: ['soft shadow plate', 'accent corner tick', 'subtle gradient base'],
    photoZone: 'center 65% — product/plate/venue hero untouched',
    formats: ['post', 'reel'],
    useCases: ['product_highlight'],
    keywordRx: /ürün|product|dish|tabak|cocktail|kokteyl|signature/i,
  },
  {
    id: 'graphic_shape_stack',
    name: 'Graphic Shape Stack',
    description: 'Layered circles, lines, geometric shapes — educational & modern brand posts.',
    layoutPattern: 'graphic_shape_stack — overlapping shapes + bold headline on mesh/photo blend',
    typographyMode: 'bold_display stack — headline over layered shapes',
    graphicAccents: ['circle frame', 'accent line', 'geometric blob', 'grain texture'],
    photoZone: 'partial bleed behind shapes — photo peeks through cutouts',
    formats: ['post', 'reel', 'story'],
    useCases: ['educational_post'],
    keywordRx: /ipucu|tip|learn|eğitim|rehber|how to|liste/i,
  },
  {
    id: 'before_after_diptych',
    name: 'Before/After Diptych',
    description: 'Transformation split — beauty, service, renovation proof.',
    layoutPattern: 'before_after_diptych — vertical or horizontal split with label tags',
    typographyMode: 'minimal_label — before/after tags + short headline',
    graphicAccents: ['before/after labels', 'divider line', 'result badge'],
    photoZone: 'split panels — both sides natural photo pixels',
    formats: ['post', 'reel', 'story'],
    useCases: ['social_proof'],
    keywordRx: /before|after|önce|sonra|transformation|sonuç|result/i,
  },
  {
    id: 'location_pin_card',
    name: 'Location Pin Card',
    description: 'Map pin, hours, directions CTA — travel, venue, logistics trust.',
    layoutPattern: 'location_pin_card — pin icon + headline + photo strip + directions CTA',
    typographyMode: 'clean_sans — location headline + hours subline',
    graphicAccents: ['map pin graphic', 'hours block', 'directions CTA pill'],
    photoZone: 'upper photo strip — venue exterior or destination',
    formats: ['post', 'reel', 'story'],
    useCases: ['daily_story'],
    keywordRx: /konum|location|adres|address|directions|harita|map|visit/i,
  },
  {
    id: 'polaroid_memory',
    name: 'Polaroid Memory',
    description: 'Casual daily polaroid frame + handwritten-style headline — BTS lifestyle.',
    layoutPattern: 'polaroid_memory — tilted polaroid frame on brand color base + casual headline',
    typographyMode: 'handwritten_accent — brush subline + clean sans headline',
    graphicAccents: ['polaroid frame', 'tape corner', 'paper texture'],
    photoZone: 'inside polaroid — candid venue/team photo natural',
    formats: ['post', 'reel', 'story'],
    useCases: ['daily_story', 'behind_the_scenes'],
    keywordRx: /daily|günlük|bts|kulis|behind|team|ekip|memory/i,
  },
  {
    id: 'noir_editorial',
    name: 'Noir Editorial',
    description: 'Dark luxury, high contrast, moody wash — premium bar/hotel/fashion.',
    layoutPattern: 'noir_editorial — dark gradient base + high-contrast serif headline + moody photo',
    typographyMode: 'editorial_serif — light-on-dark luxury hierarchy',
    graphicAccents: ['noir vignette', 'single gold accent line', 'minimal brand mark'],
    photoZone: 'partial bleed — moody venue photo, not over-filtered',
    formats: ['post', 'reel', 'story'],
    useCases: ['product_highlight', 'behind_the_scenes'],
    keywordRx: /luxury|lüks|premium|noir|dark|moody|exclusive/i,
  },
  {
    id: 'gallery_carousel_tease',
    name: 'Gallery Carousel Tease',
    description: 'Multi-photo swipe energy, social proof grid tease — carousels & reels hooks.',
    layoutPattern: 'gallery_carousel_tease — 2-up photo grid teaser + swipe CTA headline',
    typographyMode: 'bold_display — swipe/hook headline over grid',
    graphicAccents: ['photo grid frames', 'swipe arrow graphic', 'accent dots'],
    photoZone: 'dual grid cells — two gallery moments natural',
    motionCue: 'subtle grid parallax + locked swipe CTA',
    formats: ['post', 'reel'],
    useCases: ['social_proof', 'educational_post'],
    keywordRx: /carousel|swipe|kaydır|gallery|galeri|album/i,
  },
];

/** Compact catalog block for LLM agent prompts (Python crew tasks). */
export const CANVA_ARCHETYPE_AGENT_PROMPT_BLOCK = `
CANVA PRO ARCHETYPE PICKLIST (choose ONE id for fal_design_brief.canva_archetype / fal_design_hint):
1. frosted_quote_card — glass panel quote/testimonial
2. magazine_cover_drop — editorial cover line + photo bleed
3. split_feature_panel — photo + brand color panel + CTA pill
4. diagonal_brand_split — angled color wedge + photo hero (nightlife/beach)
5. cinematic_full_bleed — full photo + tiny corner type
6. campaign_hero_block — offer/% slab (ONLY real promos)
7. event_ticket_stub — date/lineup/RSVP ticket layout
8. neon_night_promo — club/DJ neon accent on dark base
9. social_proof_banner — customer joy banner over crowd photo
10. promo_price_stack — stacked offer type + product corner
11. editorial_date_masthead — seasonal date line + serif headline
12. product_hero_card — centered dish/product hero
13. graphic_shape_stack — layered shapes + bold headline
14. before_after_diptych — transformation split panels
15. location_pin_card — map pin + directions CTA
16. polaroid_memory — casual polaroid BTS frame
17. noir_editorial — dark luxury high-contrast
18. gallery_carousel_tease — 2-up grid swipe tease

Sector quick picks (canonical sector slug — NOT venue name):
- beach_club → diagonal_brand_split | cinematic_full_bleed | split_feature_panel
- nightclub → neon_night_promo | event_ticket_stub | diagonal_brand_split
- restaurant_cafe / fine_dining → magazine_cover_drop | product_hero_card
- beauty_wellness → before_after_diptych | frosted_quote_card | polaroid_memory
- hospitality → noir_editorial | cinematic_full_bleed | split_feature_panel
- fashion_boutique / local_products_shop → promo_price_stack | graphic_shape_stack
- default → split_feature_panel | graphic_shape_stack | magazine_cover_drop

MULTI-TENANT: Pick archetype from the tenant's sector category + caption intent. Never hardcode a venue or brand name.
`.trim();

export const CANVA_SECTOR_ARCHETYPE_HINTS: Record<string, CanvaArchetypeId[]> = {
  /** Canonical sector slugs — see sector-production-profile / normalizeSectorId */
  beach_club: ['diagonal_brand_split', 'cinematic_full_bleed', 'split_feature_panel', 'social_proof_banner'],
  nightclub: ['neon_night_promo', 'event_ticket_stub', 'diagonal_brand_split', 'campaign_hero_block'],
  restaurant_cafe: ['magazine_cover_drop', 'product_hero_card', 'split_feature_panel', 'polaroid_memory'],
  fine_dining: ['noir_editorial', 'magazine_cover_drop', 'product_hero_card', 'editorial_date_masthead'],
  coffee_shop: ['polaroid_memory', 'product_hero_card', 'split_feature_panel', 'frosted_quote_card'],
  hospitality: ['noir_editorial', 'cinematic_full_bleed', 'split_feature_panel', 'magazine_cover_drop'],
  beauty_wellness: ['before_after_diptych', 'frosted_quote_card', 'polaroid_memory', 'split_feature_panel'],
  barber_salon: ['before_after_diptych', 'polaroid_memory', 'graphic_shape_stack', 'split_feature_panel'],
  fitness_gym: ['graphic_shape_stack', 'campaign_hero_block', 'split_feature_panel', 'product_hero_card'],
  fashion_boutique: ['magazine_cover_drop', 'graphic_shape_stack', 'noir_editorial', 'promo_price_stack'],
  bakery_patisserie: ['product_hero_card', 'polaroid_memory', 'promo_price_stack', 'split_feature_panel'],
  wedding_event: ['event_ticket_stub', 'editorial_date_masthead', 'frosted_quote_card', 'cinematic_full_bleed'],
  jewelry_accessories: ['noir_editorial', 'product_hero_card', 'split_feature_panel', 'editorial_date_masthead'],
  moving_logistics: ['location_pin_card', 'split_feature_panel', 'graphic_shape_stack', 'campaign_hero_block'],
  healthcare_clinic: ['frosted_quote_card', 'split_feature_panel', 'location_pin_card', 'graphic_shape_stack'],
  local_products_shop: ['product_hero_card', 'promo_price_stack', 'graphic_shape_stack', 'split_feature_panel'],
  saas: ['graphic_shape_stack', 'split_feature_panel', 'magazine_cover_drop', 'frosted_quote_card'],
  general_business: ['split_feature_panel', 'graphic_shape_stack', 'magazine_cover_drop', 'frosted_quote_card'],
  default: ['split_feature_panel', 'graphic_shape_stack', 'magazine_cover_drop', 'diagonal_brand_split'],
};

const ARCHETYPE_BY_ID = new Map(CANVA_ARCHETYPE_CATALOG.map((a) => [a.id, a]));

export function getCanvaArchetype(id: string): CanvaArchetypeSpec | undefined {
  return ARCHETYPE_BY_ID.get(id as CanvaArchetypeId);
}

export function listCanvaArchetypesForFormat(format: CanvaFormat): CanvaArchetypeSpec[] {
  return CANVA_ARCHETYPE_CATALOG.filter((a) => a.formats.includes(format));
}

function scoreArchetype(
  archetype: CanvaArchetypeSpec,
  input: {
    format: CanvaFormat;
    useCase: string;
    textBlob: string;
    layoutFamilyHint?: string;
    sector?: string;
    explicitId?: string;
  },
): number {
  if (!archetype.formats.includes(input.format)) return -1;
  if (input.explicitId && archetype.id === input.explicitId) return 1000;

  let score = 0;
  if (archetype.useCases?.includes(input.useCase)) score += 40;
  if (archetype.keywordRx?.test(input.textBlob)) score += 35;

  const hint = (input.layoutFamilyHint ?? '').toLowerCase();
  if (hint) {
    if (archetype.id.includes(hint.replace(/_/g, ''))) score += 25;
    if (hint.includes('split') && archetype.id.includes('split')) score += 30;
    if (hint.includes('campaign') && archetype.id.includes('campaign')) score += 30;
    if (hint.includes('event') && archetype.id.includes('event')) score += 30;
    if (hint.includes('magazine') && archetype.id.includes('magazine')) score += 30;
    if (hint.includes('neon') && archetype.id.includes('neon')) score += 30;
  }

  const sector = normalizeSectorId(input.sector ?? '');
  const pool = CANVA_SECTOR_ARCHETYPE_HINTS[sector]
    ?? CANVA_SECTOR_ARCHETYPE_HINTS.default;
  if (pool.includes(archetype.id)) score += 22;

  return score;
}

export function resolveCanvaArchetype(input: {
  format: CanvaFormat;
  useCase: string;
  caption?: string;
  headline?: string;
  strategicPurpose?: string;
  layoutFamilyHint?: string;
  sector?: string;
  /** From agent fal_design_brief.canva_archetype */
  explicitArchetypeId?: string;
  /** Parsed from fal_design_hint if it mentions an archetype name */
  falDesignHint?: string;
  /** Archetypes already used this mission — penalized to encourage feed variety. */
  usedArchetypeIds?: CanvaArchetypeId[];
  /** 0-based fal slot index within the mission — rotates sector layout pool. */
  slotOrdinal?: number;
  /** Tenant brand theme override — preferred archetype ids for this workspace. */
  tenantPreferredArchetypes?: CanvaArchetypeId[];
}): CanvaArchetypeSpec {
  const textBlob = `${input.caption ?? ''} ${input.headline ?? ''} ${input.strategicPurpose ?? ''} ${input.falDesignHint ?? ''}`;
  let explicitId = input.explicitArchetypeId;
  if (!explicitId && input.falDesignHint) {
    const hintLower = input.falDesignHint.toLowerCase();
    for (const a of CANVA_ARCHETYPE_CATALOG) {
      if (hintLower.includes(a.id.replace(/_/g, ' ')) || hintLower.includes(a.name.toLowerCase())) {
        explicitId = a.id;
        break;
      }
    }
  }

  const used = new Set(input.usedArchetypeIds ?? []);
  const tenantPool = pickSectorArchetypePool(input.sector, input.format, input.tenantPreferredArchetypes);
  const restrictToTenantPool = Boolean(input.tenantPreferredArchetypes?.length);
  const allowedIds = new Set(tenantPool);
  const rotationBoostId = input.slotOrdinal != null && tenantPool.length > 0
    ? tenantPool[input.slotOrdinal % tenantPool.length]
    : undefined;

  const ranked = CANVA_ARCHETYPE_CATALOG
    .filter((archetype) => !restrictToTenantPool || allowedIds.has(archetype.id))
    .map((archetype) => {
      let score = scoreArchetype(archetype, {
        format: input.format,
        useCase: input.useCase,
        textBlob,
        layoutFamilyHint: input.layoutFamilyHint,
        sector: input.sector,
        explicitId,
      });
      if (used.has(archetype.id) && !input.explicitArchetypeId) score -= 55;
      if (rotationBoostId && archetype.id === rotationBoostId && !input.explicitArchetypeId) score += 28;
      return { archetype, score };
    })
    .filter((r) => r.score >= 0)
    .sort((a, b) => b.score - a.score);

  if (input.explicitArchetypeId) {
    const forced = getCanvaArchetype(input.explicitArchetypeId);
    if (forced) return forced;
  }

  return ranked[0]?.archetype ?? CANVA_ARCHETYPE_CATALOG.find((a) => a.id === 'split_feature_panel')!;
}

/** Sector-appropriate archetypes for rotation — tenant override wins, then canonical sector pool. */
export function pickSectorArchetypePool(
  sector?: string,
  format: CanvaFormat = 'post',
  tenantPreferred?: CanvaArchetypeId[],
): CanvaArchetypeId[] {
  const filterFormat = (ids: CanvaArchetypeId[]) =>
    ids.filter((id) => getCanvaArchetype(id)?.formats.includes(format));

  if (tenantPreferred?.length) {
    const fromTenant = filterFormat(tenantPreferred);
    if (fromTenant.length > 0) return fromTenant;
  }

  const canonical = normalizeSectorId(sector ?? '') || 'default';
  const pool = CANVA_SECTOR_ARCHETYPE_HINTS[canonical]
    ?? CANVA_SECTOR_ARCHETYPE_HINTS.default;
  const unique = filterFormat(pool);
  if (unique.length > 0) return unique;

  return CANVA_ARCHETYPE_CATALOG
    .filter((a) => a.formats.includes(format))
    .slice(0, 6)
    .map((a) => a.id);
}

/** One-line Canva archetype directive for fal/GPT/Ideogram prompts. */
export function buildCanvaArchetypeDirective(
  archetype: CanvaArchetypeSpec,
  format: CanvaFormat,
): string {
  return [
    `CANVA ARCHETYPE: ${archetype.name} (${archetype.id}) — ${archetype.description}`,
    `Match this Pro ${format === 'post' ? 'feed 4:5' : 'vertical 9:16'} template pattern exactly — custom, not stock.`,
  ].join(' ');
}

/** Remotion story creative director — re-export compact story archetype list. */
export const CANVA_STORY_ARCHETYPES = `
CANVA-LEVEL STORY/REEL ARCHETYPES (pick closest — map to layout or fal canva_archetype id):
${CANVA_ARCHETYPE_CATALOG.filter((a) => a.formats.includes('story') || a.formats.includes('reel'))
  .map((a, i) => `${i + 1}. ${a.name} — ${a.description.slice(0, 90)} → ${a.id}`)
  .join('\n')}
`.trim();
