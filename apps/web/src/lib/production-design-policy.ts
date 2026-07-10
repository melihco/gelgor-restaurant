/**
 * Production design policy — sector-driven Fal / Remotion defaults (multi-tenant SSOT).
 * Python mirror: backend/app/services/production_design_policy.py
 */

import { defaultTypographyVibeForSector, type TypographyVibe } from '@/types/brand-theme';
import type { FalDesignIntensityLevel } from '@/lib/fal-design-intensity';

export type ProductionTextEffect =
  | 'extrude_3d'
  | 'neon_3d'
  | 'editorial_outline'
  | 'gradient_stack'
  | 'soft_shadow';

export interface ProductionTypographyDesign {
  vibe: TypographyVibe;
  text_effect: ProductionTextEffect;
  background_style: 'photo_overlay' | 'solid_brand' | 'gradient_mesh' | 'transparent';
  logo_treatment: 'watermark' | 'badge' | 'inline' | 'none';
  accent_color?: string;
}

export interface ProductionDesignPolicyInput {
  sector: string;
  visualDna?: string;
  textOverlayDensity?: 'minimal' | 'medium' | 'dense';
  accentColor?: string;
  languages?: string;
  contentGuardrails?: string[];
  contentPillars?: string[];
}

type FalDesignChannel = 'story' | 'reel' | 'post';

const PREMIUM_VENUE_RX =
  /beach|club|hotel|resort|spa_fine|fine_dining|hospitality|marina|nightclub_lounge/i;

const HOSPITALITY_RX = PREMIUM_VENUE_RX;

const BEAUTY_LEANING_PILLARS = new Set([
  'service_intro',
  'educational_post',
  'lead_generation',
  'post_service_client_result',
]);

const BEACH_CLUB_PILLARS = [
  'daily_story',
  'event_announcement',
  'campaign_offer',
  'social_proof',
  'behind_the_scenes',
  'product_highlight',
];

const LOCAL_PRODUCTS_PILLARS = [
  'product_highlight',
  'behind_the_scenes',
  'social_proof',
  'educational_post',
  'campaign_offer',
];

export function isPremiumVenueSector(sector: string): boolean {
  return PREMIUM_VENUE_RX.test(sector);
}

export function isHospitalitySector(sector: string): boolean {
  return HOSPITALITY_RX.test(sector);
}

function inferVibeFromVisualDna(visualDna: string): TypographyVibe | null {
  const text = visualDna.toLowerCase();
  const rules: Array<[RegExp, TypographyVibe]> = [
    [/\b(bohemian|cycladic|aegean|coastal|beach|marina|sun.?bleach|turquoise)\b/i, 'warm_coastal'],
    [/\b(luxury|lüks|premium|elegant|refined|sophisticated|quiet)\b/i, 'editorial_serif'],
    [/\b(artisan|organic|natural|hand.?craft|wellness|spa|warm|samimi)\b/i, 'handwritten'],
    [/\b(craft|coffee|roast|vintage|nostalg|rustic|bakery)\b/i, 'retro_poster'],
    [/\b(minimal|clean|modern|contemporary|sleek|understated)\b/i, 'minimal_modern'],
    [/\b(neon|nightlife|club|dj|electric|after.?dark)\b/i, 'neon_glow'],
    [/\b(bold|urban|street|energy|dynamic|impact)\b/i, 'street_bold'],
  ];
  for (const [rx, vibe] of rules) {
    if (rx.test(text)) return vibe;
  }
  return null;
}

export function resolveTypographyVibe(input: ProductionDesignPolicyInput): TypographyVibe {
  const sectorDefault = defaultTypographyVibeForSector(input.sector);
  const guardrailText = (input.contentGuardrails ?? []).join(' ');
  const fromDna = inferVibeFromVisualDna(`${input.visualDna ?? ''}\n${guardrailText}`);
  if (/local_products/i.test(input.sector)) return sectorDefault;
  if (isPremiumVenueSector(input.sector) && fromDna && ['neon_glow', 'street_bold', 'bubble_3d'].includes(fromDna)) {
    return sectorDefault === 'neon_glow' ? 'editorial_serif' : sectorDefault;
  }
  return fromDna ?? sectorDefault;
}

export function resolveFalDesignIntensity(input: ProductionDesignPolicyInput): Record<FalDesignChannel, FalDesignIntensityLevel> {
  const density = input.textOverlayDensity ?? 'minimal';
  if (isPremiumVenueSector(input.sector)) {
    return { story: 'photo_first', reel: 'elegant_light', post: 'elegant_light' };
  }
  if (/beauty|wellness/i.test(input.sector)) {
    return { story: 'elegant_light', reel: 'balanced', post: 'designed' };
  }
  if (/local_products/i.test(input.sector)) {
    return { story: 'photo_first', reel: 'photo_first', post: 'elegant_light' };
  }
  if (density === 'dense') {
    return { story: 'designed', reel: 'designed', post: 'bold_editorial' };
  }
  if (density === 'medium') {
    return { story: 'balanced', reel: 'balanced', post: 'balanced' };
  }
  return { story: 'elegant_light', reel: 'balanced', post: 'elegant_light' };
}

export function sectorAntiPatterns(sector: string): string[] {
  if (isPremiumVenueSector(sector)) {
    return [
      'neon glow typography',
      'EDM / nightclub flyer layouts',
      'dense promo sticker grids',
      'gold chrome luxury cliché',
      'uppercase shout headlines',
      'generic beach party stock energy',
    ];
  }
  if (/local_products/i.test(sector)) {
    return ['neon discount stickers', 'fake organic certification badges', 'stock supermarket packaging'];
  }
  if (/beauty|wellness/i.test(sector)) {
    return ['before/after medical claims', 'unverified health cure language', 'DJ nightlife flyer layouts'];
  }
  return ['generic stock photo overlays', 'unreadable tiny text blocks', 'off-brand neon color blocks'];
}

export function resolveTypographyDesign(input: ProductionDesignPolicyInput): ProductionTypographyDesign {
  const vibe = resolveTypographyVibe(input);
  let text_effect: ProductionTextEffect = 'soft_shadow';
  if (vibe === 'neon_glow') text_effect = 'neon_3d';
  else if (vibe === 'street_bold' || vibe === 'bubble_3d') text_effect = 'extrude_3d';
  else if (vibe === 'editorial_serif') text_effect = 'editorial_outline';
  else if (vibe === 'minimal_modern') text_effect = 'gradient_stack';
  return {
    vibe,
    text_effect,
    background_style: 'photo_overlay',
    logo_treatment: 'watermark',
    ...(input.accentColor ? { accent_color: input.accentColor } : {}),
  };
}

export function pillarsNeedRealignment(sector: string, pillars: string[] | undefined): boolean {
  if (!pillars?.length) return true;
  if (!isHospitalitySector(sector)) return false;
  const beautyHits = pillars.filter((p) => BEAUTY_LEANING_PILLARS.has(p)).length;
  const beachHits = pillars.filter((p) => BEACH_CLUB_PILLARS.includes(p)).length;
  return beautyHits >= 2 && beautyHits > beachHits;
}

export function resolveContentPillars(sector: string, contentPillars: string[] | undefined): string[] {
  const inferred = (contentPillars ?? []).map((p) => p.trim()).filter(Boolean);
  if (pillarsNeedRealignment(sector, inferred)) {
    if (/local_products/i.test(sector)) return LOCAL_PRODUCTS_PILLARS;
    if (isHospitalitySector(sector)) return BEACH_CLUB_PILLARS;
  }
  const base = /local_products/i.test(sector)
    ? LOCAL_PRODUCTS_PILLARS
    : isHospitalitySector(sector)
      ? BEACH_CLUB_PILLARS
      : inferred;
  return [...new Set([...base, ...inferred])].slice(0, 8);
}
