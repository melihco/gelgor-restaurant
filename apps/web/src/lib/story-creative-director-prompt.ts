/**
 * Story Creative Director — Canva-level archetype routing for Remotion stories.
 * Maps high-performing Canva Instagram story patterns → our layout families.
 */
import { buildFamilyCatalogForPrompt } from './creative-director-routing';

/** Canva story archetypes — shared catalog (see canva-archetype-catalog.ts). */
export { CANVA_STORY_ARCHETYPES } from './canva-archetype-catalog';

const SECTOR_STORY_ROUTING = `
━━━ SECTOR ROUTING (Canva agency patterns) ━━━
beauty_salon / spa / wellness → frosted_glass daily | campaign_hero launch | diptych_collage proof | magazine_cover editorial
beach_club / marina / pool → cinematic_center | vibe_fullscreen | split_panel | gallery_series
fine_dining / restaurant → magazine_cover | split_panel chef | restaurant_feature post energy on story via minimal_luxury
hotel / resort → minimal_luxury | magazine_cover | cinematic_center
nightclub / rooftop → neon_night | event_ticket | bold_impact
retail / fashion → asymmetric_editorial | mosaic_pinterest | bento_story
logistics / B2B → location_pin | quote_card | split_panel (trust) — NEVER campaign_hero unless hard %
`.trim();

export function buildStoryCreativeDirectorPrompt(): string {
  return `You are the creative director at an Awwwards-caliber social agency.
Your benchmark is Canva Pro Instagram story templates — but each output must feel CUSTOM, not stock.
PRIME DIRECTIVE: Each story must look DISTINCT — never default to editorial_bottom unless content is truly mundane daily filler.
Target Grafiker score ≥9/10. Logo is automatic top-center.
NEVER ship legibility risk — bright venue photos need overlayOpacity ≥0.64 and vignette soft/noir.

━━━ CANVA BENCHMARK ━━━
${CANVA_STORY_ARCHETYPES}

${SECTOR_STORY_ROUTING}

━━━ ANTI-PATTERNS (never ship — these look like 2019 stock templates) ━━━
- Generic editorial_bottom on every post regardless of content
- campaign_hero orange slab without real % / indirim / kampanya copy
- Headline + categoryLabel repeating same word (TASTE + TASTE OF...)
- Faded glyphs on busy photos without frosted card or split panel
- Identical variantIndex 0 on all slots in a 5-slot package

━━━ QUALITY RULES (mandatory) ━━━
- displayHeadline ≤28 chars, no orphan words, ALL CAPS for editorial families
- overlayOpacity: 0.64–0.78 for photo-overlay layouts (never below 0.58)
- Prefer split_panel or frosted_glass when photo is busy / high-contrast
- variantIndex 5–8 for campaigns; 2–4 for soft daily moments
- layoutOverrides: always set vignette (soft) OR frostedCard for frosted_glass family

━━━ LAYOUT FAMILY CATALOG (pick ONE — drives Remotion template) ━━━
${buildFamilyCatalogForPrompt()}

━━━ ROUTING (first strong match — prefer dramatic Canva archetype over safe default) ━━━
campaign / offer / promo / discount / % / launch → campaign_hero OR bold_impact
chef / feature / spotlight / editorial / magazine → magazine_cover OR editorial_left OR asymmetric_editorial
luxury / premium / hotel / spa / fine dining → split_panel OR minimal_luxury OR frosted_glass
event / ticket / lineup / DJ / party date → event_ticket OR neon_night
menu / gallery / portfolio / social proof / 2+ photos → gallery_series OR bento_story OR mosaic_pinterest
quote / testimonial / manifesto → quote_card
location / travel / map / venue pin → location_pin
empty horizon / sky / sea + ≤3 word headline → cinematic_center OR vibe_fullscreen
nightlife / club / neon → neon_night
beauty / skincare / bridal / glow ritual → frosted_glass OR diptych_collage OR magazine_cover
daily food / cafe / lifestyle (only if nothing else matches) → editorial_bottom OR frosted_glass

━━━ VARIANT INDEX (0–9) ━━━
0 = classic/safe, 3–5 = mid drama, 7–9 = bold (wide tracking, noir wash, double frame, deep fade)
Use higher variants for campaigns and features; lower for soft daily moments.

━━━ COPY RULES ━━━
- categoryLabel: 1–2 WORDS CAPS, editorial (not generic "BRAND" or "FEATURE" unless truly apt)
- displayHeadline: punchy, ≤28 chars, ALL CAPS for serif/editorial families
- displaySubtitle: max 5 words mood tagline from caption, or empty
- Match locale tone (TR content → Turkish subtitle ok)

━━━ layoutOverrides (optional visual patches) ━━━
duotoneWash: none|warm|cool|primary
vignette: none|soft|noir|radial
heroUppercase, heroTracking (0–0.18), heroScale (0.85–1.25)
gradientStart (0.35–0.65), gradientEnd (0.7–0.92)
accentLine: none|above|left_bar|both|underline
frame: none|thin|double|inset
fontPersonality: brand|serif_editorial|sans_modern|display_bold

━━━ RESPONSE JSON ONLY ━━━
{
  "layoutFamily": "<one of catalog families>",
  "variantIndex": 0,
  "categoryLabel": "GLOW",
  "displayHeadline": "SHORT HEADLINE",
  "displaySubtitle": "mood line or empty",
  "overlayOpacity": 0.68,
  "headlineWeight": 900,
  "headlineScale": 1.05,
  "layoutOverrides": { "duotoneWash": "warm", "vignette": "soft" },
  "rationale": "1 sentence: which Canva archetype and why",
  "designScore": 9
}`;
}

import type { PremiumCompositionHint } from './poster-creative-director-prompt';
export type { PremiumCompositionHint };

import type { RemotionLayoutFamily } from './remotion-template-types';

const PREMIUM_STORY_LAYOUT_MAP: Record<string, RemotionLayoutFamily[]> = {
  hero_object: ['magazine_cover', 'minimal_luxury', 'split_panel'],
  oversized_typography: ['bold_impact', 'campaign_hero', 'cinematic_center'],
  editorial_layout: ['asymmetric_editorial', 'magazine_cover', 'editorial_left', 'mosaic_pinterest'],
  visual_metaphor: ['cinematic_center', 'noir_editorial', 'vibe_fullscreen'],
  luxury_minimalism: ['minimal_luxury', 'frosted_glass', 'cinematic_center'],
  poster_design: ['bold_impact', 'campaign_hero', 'neon_night'],
  graphic_layering: ['bento_story', 'mosaic_pinterest', 'asymmetric_editorial', 'diptych_collage'],
};

function buildPremiumStoryHints(pc: PremiumCompositionHint): string {
  const parts: string[] = ['PREMIUM CREATIVE COMPOSITION — Canva Pro / Pinterest Editorial level required:'];
  const families = PREMIUM_STORY_LAYOUT_MAP[pc.compositionType];
  if (families?.length) {
    parts.push(`Preferred layout families: ${families.join(', ')}`);
  }
  if (pc.compositionType === 'oversized_typography') {
    parts.push('Typography dominates canvas (40-80%). Text IS the design. headlineScale: 1.2–1.4.');
  }
  if (pc.compositionType === 'hero_object') {
    parts.push('Hero object fills center. Photo may overlap text and UI elements.');
  }
  if (pc.compositionType === 'luxury_minimalism') {
    parts.push('Maximum negative space. Few elements. Serif font. Low overlay. Premium silence.');
  }
  if (pc.compositionType === 'editorial_layout') {
    parts.push('Magazine cover energy. Strong grid. Editorial serif or modern sans. Clean hierarchy.');
  }
  if (pc.compositionType === 'poster_design') {
    parts.push('Poster-quality bold composition. Print-worthy contrast and scale.');
  }
  if (pc.compositionType === 'graphic_layering') {
    parts.push('Layer circles, lines, geometric shapes, grain textures over the photo. Modern and dynamic.');
  }
  if (pc.compositionType === 'visual_metaphor') {
    parts.push('Object as metaphor — unexpected composition. Cinematic mood. Avoid standard layouts.');
  }
  if (pc.compositionDescription) {
    parts.push(`Blueprint: ${pc.compositionDescription.slice(0, 300)}`);
  }
  if (pc.creativeDirection) {
    parts.push(`Art direction: ${pc.creativeDirection.slice(0, 200)}`);
  }
  parts.push(`Target designScore: ${Math.max(9, Math.ceil((pc.premiumScore ?? 85) / 10))}/10`);
  return parts.join('\n');
}

export function buildStoryCreativeDirectorUserHints(
  sector?: string,
  premiumComposition?: PremiumCompositionHint | null,
): string {
  const parts: string[] = [];

  if (premiumComposition) {
    parts.push(buildPremiumStoryHints(premiumComposition));
    parts.push('');
  }

  const s = String(sector ?? '').toLowerCase();
  if (/beauty|güzellik|guzellik|spa|wellness|salon|estetik/.test(s)) {
    parts.push('Sector hint: beauty — prefer Frosted Quote Card, Before/After Diptych, or Magazine Cover Drop archetypes.');
  } else if (/beach|marina|pool|yacht|plaj/.test(s)) {
    parts.push('Sector hint: beach — prefer Cinematic Full Bleed or Split Feature Panel archetypes.');
  } else if (/night|club|dj|rooftop/.test(s)) {
    parts.push('Sector hint: nightlife — prefer Neon Night Promo or Event Ticket Stub archetypes.');
  } else if (/nakliyat|logistics|lojistik|freight/.test(s)) {
    parts.push('Sector hint: logistics — prefer Location Pin or Split Feature trust panel; no promo hero unless hard discount.');
  }

  return parts.join('\n');
}
