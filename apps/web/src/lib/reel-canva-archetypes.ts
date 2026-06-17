/**
 * Canva-level Reel archetypes — hook patterns for Runway director prompts.
 * Maps Instagram Reels best practices → motion + framing guidance.
 */

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
}

export const CANVA_REEL_ARCHETYPES: ReelArchetype[] = [
  {
    id: 'hook_reveal',
    label: 'Hook → Reveal',
    hookPattern: 'Open on tight detail, slow reveal to full scene in 2s',
    motionRecipe: 'slow push-in, shimmer on hero subject, locked composition',
    sectors: ['*'],
  },
  {
    id: 'product_hero',
    label: 'Product Hero',
    hookPattern: 'Packshot or dish/drink as star — texture, steam, condensation',
    motionRecipe: 'static or micro orbit, light catch on surface, no scene change',
    sectors: ['fine_dining', 'cafe', 'beauty_salon', 'retail'],
  },
  {
    id: 'venue_atmosphere',
    label: 'Venue Atmosphere',
    hookPattern: 'Wide establishing mood — golden hour, candles, ambient life',
    motionRecipe: 'very slow pan or static, breeze on fabrics, candle flicker',
    sectors: ['hotel', 'beach_club', 'restaurant', 'rooftop'],
  },
  {
    id: 'before_after',
    label: 'Before / After Glow',
    hookPattern: 'Transformation proof — skin, hair, space, plate',
    motionRecipe: 'subtle cross-dissolve energy within same frame, soft light shift',
    sectors: ['beauty_salon', 'wellness', 'fitness'],
  },
  {
    id: 'day_in_life',
    label: 'Day in the Life',
    hookPattern: 'Behind-the-scenes craft — hands, tools, process',
    motionRecipe: 'close detail, shallow depth, gentle hand motion only',
    sectors: ['beauty_salon', 'cafe', 'barber'],
  },
  {
    id: 'tutorial_micro',
    label: 'Micro Tutorial',
    hookPattern: '3-step visual: prep → action → result (single frame implied)',
    motionRecipe: 'locked frame, micro motions per step, no new objects',
    sectors: ['beauty_salon', 'food', 'retail'],
  },
  {
    id: 'testimonial_moment',
    label: 'Testimonial Moment',
    hookPattern: 'Guest reaction energy without showing faces if not in photo',
    motionRecipe: 'ambient warmth, soft bokeh pulse, quote-card compatible',
    sectors: ['*'],
  },
  {
    id: 'event_energy',
    label: 'Event Energy',
    hookPattern: 'Crowd/venue pulse — lights, movement, anticipation',
    motionRecipe: 'slow pan, light streaks, controlled energy not chaos',
    sectors: ['nightclub', 'event', 'music'],
  },
  {
    id: 'seasonal_launch',
    label: 'Seasonal Launch',
    hookPattern: 'New menu/season/collection — hero item + brand grading',
    motionRecipe: 'push toward hero, seasonal light warmth or cool per brief',
    sectors: ['restaurant', 'retail', 'hotel'],
  },
  {
    id: 'pov_experience',
    label: 'POV Experience',
    hookPattern: 'First-person arrival — walking into venue, receiving service',
    motionRecipe: 'subtle forward drift, parallax on foreground only',
    sectors: ['hotel', 'spa', 'beach_club'],
  },
];

export function inferReelArchetype(input: {
  caption?: string;
  headline?: string;
  sector?: string;
  contentKind?: string;
}): ReelArchetypeId {
  const text = `${input.headline ?? ''} ${input.caption ?? ''}`.toLowerCase();
  const sector = String(input.sector ?? '').toLowerCase();
  const kind = String(input.contentKind ?? '').toLowerCase();

  if (/before|after|önce|sonra|transformation|dönüşüm|glow up/i.test(text)) return 'before_after';
  if (/launch|lansman|yeni sezon|new drop|collection/i.test(text)) return 'seasonal_launch';
  if (/dj|konser|party|gece|festival|live/i.test(text)) return 'event_energy';
  if (/nasıl|how to|adım|step|tutorial|ipucu/i.test(text)) return 'tutorial_micro';
  if (/yorum|review|misafir|testimonial|★/i.test(text)) return 'testimonial_moment';
  if (kind === 'food' || kind === 'cocktail' || kind === 'product') return 'product_hero';
  if (/beauty|güzellik|cilt|manikür|facial|salon|spa/i.test(text + sector)) return 'before_after';
  if (/chef|mutfak|behind|craft|usta|barista/i.test(text)) return 'day_in_life';
  if (/sunset|atmosphere|ambiance|mood|vibe|teras|terrace/i.test(text)) return 'venue_atmosphere';
  if (/walk|arrival|welcome|karşılama|giriş/i.test(text)) return 'pov_experience';
  return 'hook_reveal';
}

export function buildReelArchetypePromptBlock(input: {
  caption?: string;
  headline?: string;
  sector?: string;
  contentKind?: string;
}): string {
  const id = inferReelArchetype(input);
  const archetype = CANVA_REEL_ARCHETYPES.find((a) => a.id === id) ?? CANVA_REEL_ARCHETYPES[0]!;
  return [
    `REEL ARCHETYPE: ${archetype.label} (${archetype.id})`,
    `Hook pattern: ${archetype.hookPattern}`,
    `Motion recipe: ${archetype.motionRecipe}`,
    'First 1.5 seconds must deliver the hook visually — Canva Reels benchmark.',
  ].join('\n');
}
