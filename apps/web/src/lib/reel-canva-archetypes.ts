/**
 * Canva-level Reel archetypes — hook patterns + reel_recipe + cover diversity.
 *
 * Two ID spaces:
 * - ReelArchetypeId — motion/kurgu personality (this file)
 * - Canva layout id (canva-archetype-catalog) — cover composition for still
 *
 * Production resolves reel archetype → recipe partial + cover directives so
 * every sector/brand/slot reel is not the same teal sandwich.
 */

import type { ReelRecipePartial } from '@/lib/reel-production-recipe';

export type ReelArchetypeId =
  | 'hook_reveal'
  | 'product_hero'
  | 'venue_atmosphere'
  | 'before_after'
  | 'day_in_life'
  | 'tutorial_micro'
  | 'testimonial_moment'
  | 'event_energy'
  | 'seasonal_launch'
  | 'pov_experience';

export interface ReelArchetype {
  id: ReelArchetypeId;
  label: string;
  hookPattern: string;
  motionRecipe: string;
  sectors: string[];
  /** Preferred cover layout ids from canva-archetype-catalog (reel-capable). */
  preferredCoverCanvaIds: string[];
  /** Hard reject language for still cover (anti-sandwich / anti-generic). */
  rejectCoverPatterns: string[];
  /** Recipe defaults for this archetype. */
  recipe: ReelRecipePartial;
  /** Injected into fal still brandDirectives for cover diversity. */
  coverDirectives: string[];
}

export const CANVA_REEL_ARCHETYPES: ReelArchetype[] = [
  {
    id: 'hook_reveal',
    label: 'Hook → Reveal',
    hookPattern: 'Open on tight detail, slow reveal to full scene in 2s',
    motionRecipe: 'slow push-in, shimmer on hero subject, locked composition',
    sectors: ['*'],
    preferredCoverCanvaIds: ['magazine_cover_drop', 'diagonal_brand_split', 'split_feature_panel'],
    rejectCoverPatterns: [
      'equal teal sandwich header+footer bands',
      'generic centered CTA pill stack',
    ],
    recipe: {
      motionMode: 'photo_plate',
      camera: 'slow_push_in',
      pace: 'mid_tempo',
      editStyle: 'single_lock',
      beatCount: 1,
      beatRecipe: 'detail→reveal',
      onCanvasDensity: 'hook_only',
      durationSecs: 7,
      reelJob: 'generic',
    },
    coverDirectives: [
      'REEL COVER ARCHETYPE hook_reveal: Start visual hierarchy on a tight hero detail; leave breath for a reveal crop — not a flat menu card.',
      'COVER DIVERSITY: Prefer asymmetric magazine or diagonal split over centered sandwich bands.',
    ],
  },
  {
    id: 'product_hero',
    label: 'Product Hero',
    hookPattern: 'Packshot or dish/drink as star — texture, steam, condensation',
    motionRecipe: 'static or micro orbit, light catch on surface, no scene change',
    sectors: ['fine_dining', 'cafe', 'beauty_salon', 'retail'],
    preferredCoverCanvaIds: ['split_feature_panel', 'magazine_cover_drop', 'product_hero_card'],
    rejectCoverPatterns: ['busy multi-product collage', 'tiny product lost in busy frame'],
    recipe: {
      motionMode: 'photo_plate',
      camera: 'orbit_micro',
      pace: 'slow_burn',
      editStyle: 'sequential_beats',
      beatCount: 2,
      beatRecipe: 'hook→product',
      onCanvasDensity: 'hook_only',
      durationSecs: 7,
      reelJob: 'menu_highlight',
    },
    coverDirectives: [
      'REEL COVER ARCHETYPE product_hero: One hero product/drink/dish owns the photo window — macro texture readable at phone size.',
      'COVER DIVERSITY: Split panel or magazine drop; forbid equal-height color bands eating the product.',
    ],
  },
  {
    id: 'venue_atmosphere',
    label: 'Venue Atmosphere',
    hookPattern: 'Wide establishing mood — golden hour, candles, ambient life',
    motionRecipe: 'very slow pan or static, breeze on fabrics, candle flicker',
    sectors: ['hotel', 'beach_club', 'restaurant', 'rooftop'],
    preferredCoverCanvaIds: ['cinematic_full_bleed', 'noir_editorial', 'split_feature_panel'],
    rejectCoverPatterns: ['heavy header/footer sandwich covering sky/sea', 'dense promo badge stack'],
    recipe: {
      motionMode: 'photo_plate',
      camera: 'slow_pan',
      pace: 'slow_burn',
      editStyle: 'single_lock',
      beatCount: 1,
      beatRecipe: 'wide→detail',
      onCanvasDensity: 'minimal',
      durationSecs: 7,
      reelJob: 'venue_mood',
    },
    coverDirectives: [
      'REEL COVER ARCHETYPE venue_atmosphere: Full-bleed or near full-bleed venue photo; whisper-light corner type — cinema poster energy.',
      'COVER DIVERSITY: FORBIDDEN — thick brand-color letterbox sandwich covering horizon/sea/sky.',
    ],
  },
  {
    id: 'before_after',
    label: 'Before / After Glow',
    hookPattern: 'Transformation proof — skin, hair, space, plate',
    motionRecipe: 'subtle cross-dissolve energy within same frame, soft light shift',
    sectors: ['beauty_salon', 'wellness', 'fitness'],
    preferredCoverCanvaIds: ['split_feature_panel', 'frosted_quote_card', 'magazine_cover_drop'],
    rejectCoverPatterns: ['fake medical charts', 'stock before/after faces not in gallery'],
    recipe: {
      motionMode: 'photo_plate',
      camera: 'static',
      pace: 'mid_tempo',
      editStyle: 'sequential_beats',
      beatCount: 2,
      beatRecipe: 'before→after',
      onCanvasDensity: 'hook_only',
      durationSecs: 7,
      reelJob: 'craft_process',
    },
    coverDirectives: [
      'REEL COVER ARCHETYPE before_after: Dual-zone or sequential-ready composition — clear before/after read without inventing faces.',
    ],
  },
  {
    id: 'day_in_life',
    label: 'Day in the Life',
    hookPattern: 'Behind-the-scenes craft — hands, tools, process',
    motionRecipe: 'close detail, shallow depth, gentle hand motion only',
    sectors: ['beauty_salon', 'cafe', 'barber'],
    preferredCoverCanvaIds: ['magazine_cover_drop', 'polaroid_memory', 'split_feature_panel'],
    rejectCoverPatterns: ['stock smiling barista not from gallery', 'over-styled flyer'],
    recipe: {
      motionMode: 'photo_plate',
      camera: 'orbit_micro',
      pace: 'mid_tempo',
      editStyle: 'sequential_beats',
      beatCount: 3,
      beatRecipe: 'hands→product→result',
      onCanvasDensity: 'hook_only',
      durationSecs: 10,
      reelJob: 'craft_process',
    },
    coverDirectives: [
      'REEL COVER ARCHETYPE day_in_life: Hands/tools/process as hero — documentary craft energy, not glossy flyer.',
    ],
  },
  {
    id: 'tutorial_micro',
    label: 'Micro Tutorial',
    hookPattern: '3-step visual: prep → action → result (single frame implied)',
    motionRecipe: 'locked frame, micro motions per step, no new objects',
    sectors: ['beauty_salon', 'food', 'retail'],
    preferredCoverCanvaIds: ['split_feature_panel', 'magazine_cover_drop'],
    rejectCoverPatterns: ['long paragraph instructions on canvas'],
    recipe: {
      motionMode: 'photo_plate',
      camera: 'static',
      pace: 'mid_tempo',
      editStyle: 'sequential_beats',
      beatCount: 3,
      beatRecipe: 'prep→action→result',
      onCanvasDensity: 'hook_only',
      durationSecs: 10,
      reelJob: 'craft_process',
      headlinePolicy: 'shorten_ok',
    },
    coverDirectives: [
      'REEL COVER ARCHETYPE tutorial_micro: Short step energy — one verb hook on canvas; steps live in motion beats.',
    ],
  },
  {
    id: 'testimonial_moment',
    label: 'Testimonial Moment',
    hookPattern: 'Guest reaction energy without showing faces if not in photo',
    motionRecipe: 'ambient warmth, soft bokeh pulse, quote-card compatible',
    sectors: ['*'],
    preferredCoverCanvaIds: ['frosted_quote_card', 'noir_editorial', 'split_feature_panel'],
    rejectCoverPatterns: ['fake 5-star sticker spam', 'invented customer names'],
    recipe: {
      motionMode: 'photo_plate',
      camera: 'parallax',
      pace: 'mid_tempo',
      editStyle: 'implied_multi',
      beatCount: 2,
      beatRecipe: 'moment→brand',
      onCanvasDensity: 'hook_sub',
      durationSecs: 7,
      reelJob: 'social_proof',
    },
    coverDirectives: [
      'REEL COVER ARCHETYPE testimonial_moment: Frosted quote / soft glass panel over real guest or ambience photo — quiet social proof.',
      'COVER DIVERSITY: Prefer frosted quote over hard sandwich bars.',
    ],
  },
  {
    id: 'event_energy',
    label: 'Event Energy',
    hookPattern: 'Crowd/venue pulse — lights, movement, anticipation',
    motionRecipe: 'slow pan, light streaks, controlled energy not chaos',
    sectors: ['nightclub', 'event', 'music'],
    preferredCoverCanvaIds: ['neon_night_promo', 'event_ticket_stub', 'diagonal_brand_split'],
    rejectCoverPatterns: ['daytime beach stock for night event', 'pastel wellness card'],
    recipe: {
      motionMode: 'hybrid',
      camera: 'parallax',
      pace: 'fast_cut',
      editStyle: 'sequential_beats',
      beatCount: 3,
      beatRecipe: 'hook→energy→cta',
      onCanvasDensity: 'hook_sub',
      durationSecs: 10,
      audioEnabled: true,
      audioMood: 'upbeat',
      reelJob: 'event_tease',
    },
    coverDirectives: [
      'REEL COVER ARCHETYPE event_energy: Ticket stub / neon night / diagonal wedge — high anticipation, controlled chaos.',
      'COVER DIVERSITY: Never soft coastal sandwich for a night/DJ/event reel.',
    ],
  },
  {
    id: 'seasonal_launch',
    label: 'Seasonal Launch',
    hookPattern: 'New menu/season/collection — hero item + brand grading',
    motionRecipe: 'push toward hero, seasonal light warmth or cool per brief',
    sectors: ['restaurant', 'retail', 'hotel'],
    preferredCoverCanvaIds: ['campaign_hero_block', 'magazine_cover_drop', 'diagonal_brand_split'],
    rejectCoverPatterns: ['evergreen generic vibe with no launch signal'],
    recipe: {
      motionMode: 'photo_plate',
      camera: 'slow_push_in',
      pace: 'mid_tempo',
      editStyle: 'sequential_beats',
      beatCount: 2,
      beatRecipe: 'hero→brand',
      onCanvasDensity: 'hook_sub',
      durationSecs: 7,
      reelJob: 'offer',
    },
    coverDirectives: [
      'REEL COVER ARCHETYPE seasonal_launch: Hero item + launch urgency typography — campaign energy without carnival stickers.',
    ],
  },
  {
    id: 'pov_experience',
    label: 'POV Experience',
    hookPattern: 'First-person arrival — walking into venue, receiving service',
    motionRecipe: 'subtle forward drift, parallax on foreground only',
    sectors: ['hotel', 'spa', 'beach_club'],
    preferredCoverCanvaIds: ['cinematic_full_bleed', 'polaroid_memory', 'noir_editorial'],
    rejectCoverPatterns: ['third-person stock portrait as POV', 'heavy UI chrome'],
    recipe: {
      motionMode: 'photo_plate',
      camera: 'slow_push_in',
      pace: 'slow_burn',
      editStyle: 'single_lock',
      beatCount: 1,
      beatRecipe: 'arrival→settle',
      onCanvasDensity: 'minimal',
      durationSecs: 7,
      reelJob: 'venue_mood',
    },
    coverDirectives: [
      'REEL COVER ARCHETYPE pov_experience: First-person / immersive crop — viewer arrives into the brand world.',
      'COVER DIVERSITY: Minimal type; cinematic bleed preferred over sandwich.',
    ],
  },
];

const BY_ID = new Map(CANVA_REEL_ARCHETYPES.map((a) => [a.id, a]));

/** Layout canva catalog id → reel motion archetype. */
const LAYOUT_CANVA_TO_REEL: Record<string, ReelArchetypeId> = {
  frosted_quote_card: 'testimonial_moment',
  magazine_cover_drop: 'hook_reveal',
  split_feature_panel: 'product_hero',
  diagonal_brand_split: 'hook_reveal',
  cinematic_full_bleed: 'venue_atmosphere',
  campaign_hero_block: 'seasonal_launch',
  event_ticket_stub: 'event_energy',
  neon_night_promo: 'event_energy',
  noir_editorial: 'venue_atmosphere',
  polaroid_memory: 'pov_experience',
  product_hero_card: 'product_hero',
  promo_price_stack: 'seasonal_launch',
  before_after_diptych: 'before_after',
  graphic_shape_stack: 'hook_reveal',
  editorial_date_masthead: 'seasonal_launch',
};

const JOB_TO_REEL: Record<string, ReelArchetypeId> = {
  menu_highlight: 'product_hero',
  venue_mood: 'venue_atmosphere',
  event_tease: 'event_energy',
  social_proof: 'testimonial_moment',
  craft_process: 'day_in_life',
  offer: 'seasonal_launch',
  generic: 'hook_reveal',
};

export function getReelArchetype(id: string | null | undefined): ReelArchetype | undefined {
  if (!id) return undefined;
  return BY_ID.get(id as ReelArchetypeId);
}

export function mapLayoutCanvaToReelArchetype(
  layoutCanvaId: string | null | undefined,
): ReelArchetypeId | undefined {
  const id = String(layoutCanvaId ?? '').trim();
  return id ? LAYOUT_CANVA_TO_REEL[id] : undefined;
}

export function inferReelArchetype(input: {
  caption?: string;
  headline?: string;
  sector?: string;
  contentKind?: string;
  catalogSlotKey?: string | null;
  templateType?: string | null;
  reelJob?: string | null;
}): ReelArchetypeId {
  const text = `${input.headline ?? ''} ${input.caption ?? ''}`.toLowerCase();
  const sector = String(input.sector ?? '').toLowerCase();
  const kind = String(input.contentKind ?? '').toLowerCase();
  const slot = `${input.catalogSlotKey ?? ''} ${input.templateType ?? ''}`.toLowerCase();

  if (/before|after|önce|sonra|transformation|dönüşüm|glow up/i.test(text)) return 'before_after';
  if (/launch|lansman|yeni sezon|new drop|collection|kampanya/i.test(text + slot)) return 'seasonal_launch';
  if (/dj|konser|party|gece|festival|live|event|teaser/i.test(text + slot)) return 'event_energy';
  if (/nasıl|how to|adım|step|tutorial|ipucu/i.test(text)) return 'tutorial_micro';
  if (/yorum|review|misafir|testimonial|happy.?customer|★/i.test(text + slot)) return 'testimonial_moment';
  if (kind === 'food' || kind === 'cocktail' || kind === 'product' || /cocktail|menu|drink|product/.test(slot)) {
    return 'product_hero';
  }
  if (/beauty|güzellik|cilt|manikür|facial|salon|spa/i.test(text + sector) && /before|after|sonuç/.test(text)) {
    return 'before_after';
  }
  if (/chef|mutfak|behind|craft|usta|barista|process/i.test(text + slot)) return 'day_in_life';
  if (/sunset|atmosphere|ambiance|mood|vibe|teras|terrace|pool|beach/i.test(text + slot)) {
    return 'venue_atmosphere';
  }
  if (/walk|arrival|welcome|karşılama|giriş|pov/i.test(text)) return 'pov_experience';

  if (input.reelJob && JOB_TO_REEL[input.reelJob]) return JOB_TO_REEL[input.reelJob]!;
  return 'hook_reveal';
}

/**
 * Resolve reel archetype for production / template seed.
 * Priority: explicit → layout canva map → text/slot infer.
 */
export function resolveReelArchetypeForProduction(input: {
  explicitReelArchetypeId?: string | null;
  canvaArchetypeId?: string | null;
  caption?: string;
  headline?: string;
  sector?: string;
  contentKind?: string;
  catalogSlotKey?: string | null;
  templateType?: string | null;
  reelJob?: string | null;
}): ReelArchetype {
  const explicit = getReelArchetype(input.explicitReelArchetypeId);
  if (explicit) return explicit;

  const fromLayout = mapLayoutCanvaToReelArchetype(input.canvaArchetypeId);
  if (fromLayout) {
    const hit = getReelArchetype(fromLayout);
    if (hit) return hit;
  }

  const inferred = inferReelArchetype(input);
  return getReelArchetype(inferred) ?? CANVA_REEL_ARCHETYPES[0]!;
}

export function reelArchetypeToRecipePartial(archetype: ReelArchetype): ReelRecipePartial {
  return {
    ...archetype.recipe,
    reelArchetypeId: archetype.id,
  };
}

export function buildReelCoverDiversityDirectives(input: {
  reelArchetype: ReelArchetype;
  coverCanvaId?: string | null;
}): string[] {
  const preferred = input.reelArchetype.preferredCoverCanvaIds[0];
  const cover = String(input.coverCanvaId ?? '').trim();
  const lines = [
    ...input.reelArchetype.coverDirectives,
    `REEL ARCHETYPE LOCK: ${input.reelArchetype.label} (${input.reelArchetype.id}). Hook: ${input.reelArchetype.hookPattern}.`,
    preferred
      ? `PREFERRED COVER FAMILY: lean toward "${preferred}" craft — avoid repeating the same sandwich template every reel.`
      : '',
    cover
      ? `ACTIVE COVER CANVA: ${cover} — execute that layout’s photo zone + type hierarchy; do not collapse to generic bands.`
      : '',
    input.reelArchetype.rejectCoverPatterns.length
      ? `COVER REJECT: ${input.reelArchetype.rejectCoverPatterns.join('; ')}.`
      : '',
  ];
  return lines.filter(Boolean);
}

export function buildReelArchetypePromptBlock(input: {
  caption?: string;
  headline?: string;
  sector?: string;
  contentKind?: string;
  catalogSlotKey?: string | null;
}): string {
  const archetype = resolveReelArchetypeForProduction(input);
  return [
    `REEL ARCHETYPE: ${archetype.label} (${archetype.id})`,
    `Hook pattern: ${archetype.hookPattern}`,
    `Motion recipe: ${archetype.motionRecipe}`,
    'First 1.5 seconds must deliver the hook visually — Canva Reels benchmark.',
  ].join('\n');
}

/** Prefer a cover canva id that matches the reel archetype (library diversity). */
export function preferCoverCanvaForReelArchetype(
  reelArchetypeId: ReelArchetypeId,
  currentCanvaId?: string | null,
): string | undefined {
  const arch = getReelArchetype(reelArchetypeId);
  if (!arch) return currentCanvaId ?? undefined;
  const current = String(currentCanvaId ?? '').trim();
  if (current && arch.preferredCoverCanvaIds.includes(current)) return current;
  return arch.preferredCoverCanvaIds[0] ?? (current || undefined);
}
