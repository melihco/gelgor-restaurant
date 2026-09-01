/**
 * Agency template contracts — photo-led magazine editorial (Turunç / Wallpaper).
 *
 * FORBIDDEN craft: opaque color panels, diagonal paint wedges, header/footer
 * sandwiches, festival condensed flyer stacks. Type = Didot/Playfair serif +
 * grotesk support in photographic negative space + thin gold accent.
 * Multi-tenant: campaign/slot/sector — never brand UUIDs.
 */

export type AgencyTemplateFormat = 'story' | 'post';

export type AgencyTemplateId =
  | 'diagonal_luxury_story'
  | 'editorial_luxury_post'
  | 'restaurant_food_story'
  | 'cocktail_campaign';

export type AgencyLayoutZones = {
  headline: string;
  subheadline: string;
  cta: string;
  logo: string;
  photo: string;
  safeMarginPct: number;
};

export type AgencyTypographySpec = {
  face: string;
  weight: string;
  maxHeadlineLines: number;
  maxWordsPerLine: number;
  hierarchy: string;
  letterSpacing: string;
};

export type AgencyTemplateContract = {
  id: AgencyTemplateId;
  name: string;
  format: AgencyTemplateFormat;
  pitch: string;
  artDirection: string[];
  layout: AgencyLayoutZones;
  typography: AgencyTypographySpec;
  imageRules: string[];
  matchKeywords: RegExp;
  preferredCampaignIds: readonly string[];
};

/**
 * Photo-led + designed craft. Bare caption-on-photo = FAIL.
 * Opaque paint slabs still forbidden — craft = hairlines, frames, chips, soft glass.
 */
export const PHOTO_LED_LAYOUT_LAW = [
  'PHOTO-LED LAW: Full-bleed photograph is the canvas — type + graphic system sit ON it.',
  'DESIGNED LAYOUT LAW: This must read as a designed template, not a photo with a caption.',
  'MANDATORY visible craft (≥3): (1) serif/sans hierarchy (2) thin gold/brand hairline or hairline frame (3) tracked eyebrow OR micro CTA (4) reserved logo corner.',
  'ALLOWED graphics: thin gold rules, hairline L/corner brackets, small accent chip (<4% frame), light frosted glass plate under type only (≤22% opacity, ≤28% frame), tracked all-caps eyebrow.',
  'FORBIDDEN: opaque color panels, diagonal paint wedges, mustard/amber side slabs, header/footer Canva sandwiches, filled CTA button bricks.',
  'FORBIDDEN: bare photo + floating white text with ZERO rules/frames/chips (unddesigned watermark look).',
  'Product / glass / plate hero fully visible — craft must not cover the hero.',
] as const;

/** Per-template graphic recipe — what the viewer should SEE besides letters. */
export const TEMPLATE_CRAFT_RECIPES: Record<
  AgencyTemplateId,
  readonly string[]
> = {
  diagonal_luxury_story: [
    'GRAPHIC SYSTEM: Upper-left magazine masthead column',
    '• Tracked all-caps EYEBROW above headline (small, ~8–10pt feel)',
    '• Cream Didot/Playfair stacked headline (2–3 lines)',
    '• DOUBLE thin gold horizontal rules (one under headline, one under CTA)',
    '• Optional soft frosted glass behind type column only (barely there, never charcoal slab)',
    '• Small brand-accent corner chip OR vertical hairline along the type column',
    '• Bottom-right empty logo reserve',
  ],
  editorial_luxury_post: [
    'GRAPHIC SYSTEM: Left editorial column + right photo hero (Turunç campaign look)',
    '• Tracked EYEBROW (location or short meta) above serif headline',
    '• Large cream serif headline left; short sans support under it',
    '• Thin GOLD underline or open hairline box around the CTA line',
    '• Vertical gold hairline (2–3px feel) separating type column from photo hero OR left edge accent',
    '• Soft glass/scrim under the type column only if needed for contrast',
    '• Bottom-right empty logo reserve — consistent series mark zone',
  ],
  restaurant_food_story: [
    'GRAPHIC SYSTEM: Chef-magazine food story',
    '• Top tracked EYEBROW (e.g. dish meta) + large serif dish name',
    '• Thin gold rule under dish name',
    '• Optional light frosted plate behind type (upper zone only)',
    '• Micro CTA with hairline underline mid-left',
    '• Bottom-right logo reserve; food hero never covered',
  ],
  cocktail_campaign: [
    'GRAPHIC SYSTEM: Luxury drink campaign ad',
    '• Left serif campaign punchline + sans support',
    '• Gold L-bracket hairlines (top+left OR bottom underline) framing the type — lines only, not filled paint',
    '• Thin gold CTA underline',
    '• Soft bokeh photo; glassware clear of type',
    '• Bottom-right logo reserve',
  ],
};

const EDITORIAL_TYPE = {
  face: 'High-contrast display serif (Playfair / Didot / Bodoni class) + clean grotesk sans for support/CTA',
  weight: 'Bold/black serif headline; light/regular sans support',
  hierarchy: 'Serif punchline → short sans support → micro tracked CTA with thin gold underline',
  letterSpacing: 'Tight optical on serif; generous tracking on CTA uppercase',
} as const;

export const AGENCY_TEMPLATE_CATALOG: readonly AgencyTemplateContract[] = [
  {
    id: 'diagonal_luxury_story',
    name: 'Cinematic Luxury Story',
    format: 'story',
    pitch: 'Magazine story: full-bleed cinema + left serif lockup + thin gold rule',
    artDirection: [
      'Premium Instagram Story 1080×1920 — luxury travel magazine cover energy',
      'Reference bar: Wallpaper*, Soho House, Aman, Turunç Bodrum hospitality campaigns',
      'Full-bleed cinematic lifestyle photograph edge-to-edge',
      'Asymmetric UPPER-LEFT type column in sky/soft dark — NEVER centered flyer stack',
      'Headline in elegant high-contrast SERIF (cream/white) — not condensed impact sans',
      'Quiet luxury grade — night slots get dusk/moody color, not neon EDM chaos',
      'Viewer must SEE a designed masthead system (rules + eyebrow + type column) — not bare caption text',
      'Very high-end. Editorial quality. Portfolio piece.',
      ...PHOTO_LED_LAYOUT_LAW,
      ...TEMPLATE_CRAFT_RECIPES.diagonal_luxury_story,
    ],
    layout: {
      headline: 'Upper-left column (below top 12% UI-safe) — 2–3 short serif lines',
      subheadline: 'Directly under headline, same left column, ~35–40% headline size',
      cta: 'Same left column, lower — tracked micro CTA + thin gold underline',
      logo: 'Bottom-right quiet corner (empty for composite)',
      photo: '100% full-bleed — the design IS the photo',
      safeMarginPct: 10,
    },
    typography: {
      ...EDITORIAL_TYPE,
      maxHeadlineLines: 3,
      maxWordsPerLine: 3,
    },
    imageRules: [
      'Type never overlaps glassware, faces, or hero subject',
      'Prefer dusk/night grade for nightlife; golden hour for sunset — still editorial, not flyer',
      'Logo corner calm, background continues — no painted plate, post-composite only',
    ],
    matchKeywords: /story|dj|night|event|party|gece|kampanya|campaign|luxury|sunset|gün bat/i,
    preferredCampaignIds: ['signature_cocktails', 'sunset_dining', 'weekend_brunch', 'nightlife_event'],
  },
  {
    id: 'editorial_luxury_post',
    name: 'Editorial Luxury Post',
    format: 'post',
    pitch: 'Turunç-class: hero right, left serif column, thin gold CTA',
    artDirection: [
      'Luxury editorial Instagram Post 4:5 (1080×1350)',
      'Inspired by Wallpaper Magazine, Soho House, and premium Bodrum hospitality campaigns',
      'Full-bleed photo — lifestyle/product hero biased RIGHT',
      'Typography floats LEFT in negative space — cream/white high-contrast SERIF headline',
      'Support line in clean sans (~35–40% of headline); CTA = thin gold underline only',
      'Warm Mediterranean golden lighting, shallow DOF, real reflections',
      'Asymmetric magazine lockup — never centered condensed flyer title',
      'Viewer must SEE left column craft (eyebrow + gold rules + CTA underline) — not bare caption',
      'No stock feeling. No mid-tier Canva-sandwich template pack — aim boutique Canva Pro / Wallpaper craft.',
      ...PHOTO_LED_LAYOUT_LAW,
      ...TEMPLATE_CRAFT_RECIPES.editorial_luxury_post,
    ],
    layout: {
      headline: 'Left third, upper — clear negative space only',
      subheadline: 'Left third, under headline (~35–40% of headline size)',
      cta: 'Left third — micro tracked CTA + thin gold/brand accent underline',
      logo: 'Bottom-right quiet corner',
      photo: 'Full-bleed; hero subject biased RIGHT',
      safeMarginPct: 8,
    },
    typography: {
      ...EDITORIAL_TYPE,
      maxHeadlineLines: 3,
      maxWordsPerLine: 4,
    },
    imageRules: [
      'Hero drink/food/product stays RIGHT and unobscured',
      'Type cream/white; gold on rules/CTA underline — visible craft accents',
      'Series-ready: same type + rule system across campaign posts',
    ],
    matchKeywords: /product|ürün|sepet|whisky|şarap|wine|menu|menü|harvest|editorial|post|taste|aegean|sunset/i,
    preferredCampaignIds: ['signature_cocktails', 'product_harvest', 'weekend_brunch', 'seafood_menu', 'sunset_dining'],
  },
  {
    id: 'restaurant_food_story',
    name: 'Restaurant Food Story',
    format: 'story',
    pitch: 'Food hero + upper-left serif dish name — chef-magazine editorial',
    artDirection: [
      'Instagram Story — chef-magazine food editorial (not menu-board graphic)',
      'Full-bleed plated food / table photography',
      'Large SERIF dish name in UPPER-LEFT negative space — never a paint block',
      'Optional soft top scrim (<15% feel) for legibility only',
      'Natural restaurant lighting, warm shadows, appetite-forward',
      'Viewer must SEE chef-magazine craft (eyebrow + gold rule + type lockup)',
      ...PHOTO_LED_LAYOUT_LAW,
      ...TEMPLATE_CRAFT_RECIPES.restaurant_food_story,
    ],
    layout: {
      headline: 'Upper-left third — negative space',
      subheadline: 'Under headline, same column',
      cta: 'Mid-left thin gold underline',
      logo: 'Bottom right',
      photo: 'Full-bleed; food hero in lower/center',
      safeMarginPct: 10,
    },
    typography: {
      ...EDITORIAL_TYPE,
      maxHeadlineLines: 3,
      maxWordsPerLine: 3,
    },
    imageRules: [
      'Never cover plated food with paint or type',
      'Minimal ceramic/linen styling',
      'Warm restaurant light only',
    ],
    matchKeywords: /food|yemek|börek|brunch|chef|menu|menü|pastry|seafood|deniz|story/i,
    preferredCampaignIds: ['weekend_brunch', 'seafood_menu', 'chef_special'],
  },
  {
    id: 'cocktail_campaign',
    name: 'Cocktail Campaign',
    format: 'post',
    pitch: 'Crystal glass + left serif campaign line + gold underline — ad editorial',
    artDirection: [
      'Luxury cocktail / wine campaign — Instagram Post 4:5',
      'Advertising editorial (Vogue / Wallpaper hospitality ad) — not bar flyer',
      'Full-bleed crystal glass / pour — soft bokeh Mediterranean backdrop',
      'Campaign headline floats LEFT — cream Didot/Playfair serif',
      'Thin gold/brand-accent underline for CTA — FORBIDDEN filled button or paint panel',
      'Natural summer or golden hospitality light, real reflections',
      'Viewer must SEE campaign ad craft (L-bracket hairlines + gold CTA + serif column)',
      ...PHOTO_LED_LAYOUT_LAW,
      ...TEMPLATE_CRAFT_RECIPES.cocktail_campaign,
    ],
    layout: {
      headline: 'Left negative space, upper/mid',
      subheadline: 'Under headline, same column',
      cta: 'Under support — thin accent underline',
      logo: 'Bottom right',
      photo: 'Full-bleed; glass/pour hero RIGHT or center-right',
      safeMarginPct: 8,
    },
    typography: {
      ...EDITORIAL_TYPE,
      maxHeadlineLines: 3,
      maxWordsPerLine: 4,
    },
    imageRules: [
      'Crystal glasses, real pour, natural reflections',
      'Glassware never covered by type',
      'Refreshing hospitality grade — editorial dusk OK for nightlife, not neon chaos',
    ],
    matchKeywords: /cocktail|şarap|wine|ros[eé]|drink|bar|cheers|içki|spritz|taste/i,
    preferredCampaignIds: ['signature_cocktails', 'sunset_dining', 'nightlife_event'],
  },
] as const;

export function getAgencyTemplate(id: AgencyTemplateId): AgencyTemplateContract {
  const t = AGENCY_TEMPLATE_CATALOG.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown agency template: ${id}`);
  return t;
}
