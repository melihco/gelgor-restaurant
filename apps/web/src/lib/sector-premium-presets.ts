/**
 * Sector Premium Presets — Sprint 3
 *
 * Per-sector creative taste rules consumed by:
 *  - Creative Director (layout family selection)
 *  - Gallery photo matching (asset-role routing)
 *  - Remotion render phase (motion lane, logo restraint)
 *  - Reel montage ordering
 *
 * Design: every value is brand-agnostic and sector-specific. No hardcoded brand names.
 * All constants are typed so future sectors can be added without breaking callers.
 */

import type { StoryLayoutFamily } from './story-template-types';
import type { StorySequenceRole } from './story-sequence-rules';

// ─── Motion lanes ─────────────────────────────────────────────────────────────

/**
 * Four motion "feels" that define how aggressively the camera/animation moves.
 * - whisper   : ultra-subtle, almost still — luxury / spa / fine dining
 * - editorial : controlled, purposeful — hotel / fashion / agency
 * - pulse     : gentle rhythm — retail / fitness / beauty
 * - impact    : fast, bold — nightlife / events / sports
 */
export type MotionLane = 'whisper' | 'editorial' | 'pulse' | 'impact';

export interface MotionLaneSpec {
  /** Camera motion directive for this lane */
  cameraMotion: string;
  /** Suggested overlay opacity range [min, max] */
  overlayOpacityRange: [number, number];
  /** Ken Burns intensity 0–1 */
  kenBurnsIntensity: number;
  /** Preferred Remotion motionStyle */
  motionStyle: 'minimal' | 'editorial' | 'luxury' | 'bold' | 'playful';
  /** Human-readable description for logging */
  label: string;
}

export const MOTION_LANE_SPECS: Record<MotionLane, MotionLaneSpec> = {
  whisper: {
    cameraMotion: 'static',
    overlayOpacityRange: [0.55, 0.68],
    kenBurnsIntensity: 0.08,
    motionStyle: 'luxury',
    label: 'Whisper — ultra-subtle, luxury stillness',
  },
  editorial: {
    cameraMotion: 'slow_pan',
    overlayOpacityRange: [0.60, 0.72],
    kenBurnsIntensity: 0.18,
    motionStyle: 'editorial',
    label: 'Editorial — controlled, purposeful',
  },
  pulse: {
    cameraMotion: 'dolly_in',
    overlayOpacityRange: [0.62, 0.75],
    kenBurnsIntensity: 0.28,
    motionStyle: 'editorial',
    label: 'Pulse — gentle rhythm, forward energy',
  },
  impact: {
    cameraMotion: 'handheld',
    overlayOpacityRange: [0.68, 0.80],
    kenBurnsIntensity: 0.42,
    motionStyle: 'bold',
    label: 'Impact — fast, bold, high-energy',
  },
};

// ─── Logo restraint ────────────────────────────────────────────────────────────

/**
 * Controls when the brand logo is shown on Story and Post renders.
 * - never     : never inject logo (e.g. luxury fine dining — photo must carry)
 * - cta_only  : only on the CTA card in a sequence
 * - proof_cta : on proof and CTA cards, never on hook
 * - always    : show on every card (default, existing behaviour)
 */
export type LogoRestraint = 'never' | 'cta_only' | 'proof_cta' | 'always';

// ─── Asset-role preferences ────────────────────────────────────────────────────

/**
 * `bestFor` tags that score higher for each story sequence role.
 * These map to the `bestFor` field in `GalleryPhotoMeta`.
 */
export interface AssetRolePreferences {
  hook: string[];   // Broad, atmospheric, establishing
  proof: string[];  // Detail, process, product, result
  cta: string[];    // Outcome, social proof, reservation/CTA context
}

// ─── Sector preset ─────────────────────────────────────────────────────────────

export interface SectorPremiumPreset {
  /** Human-readable sector label */
  label: string;
  /** Default motion lane for this sector */
  motionLane: MotionLane;
  /** Override motion lane per sequence role */
  motionLaneByRole?: Partial<Record<StorySequenceRole, MotionLane>>;
  /** Preferred layout families per sequence role (ordered by preference) */
  layoutsByRole: Record<StorySequenceRole, StoryLayoutFamily[]>;
  /** Logo restraint policy */
  logoRestraint: LogoRestraint;
  /** Asset-role routing preferences */
  assetRoles: AssetRolePreferences;
  /** Overlay opacity floor (never go below this, even if CD suggests lower) */
  overlayFloor: number;
  /** Whether to allow full-bleed / zero-overlay story cards */
  allowFullBleed: boolean;
  /** Max headline characters before truncation — tighter for luxury sectors */
  headlineMaxChars: number;
}

// ─── Sector preset definitions ─────────────────────────────────────────────────

const PRESETS: Record<string, SectorPremiumPreset> = {
  fine_dining: {
    label: 'Fine Dining',
    motionLane: 'whisper',
    motionLaneByRole: { cta: 'editorial' },
    layoutsByRole: {
      hook: ['magazine_cover', 'cinematic_center', 'minimal_luxury', 'split_panel'],
      proof: ['frosted_glass', 'editorial_left', 'diptych_collage', 'magazine_cover'],
      cta: ['split_panel', 'minimal_luxury', 'frosted_glass'],
    },
    logoRestraint: 'cta_only',
    assetRoles: {
      hook: ['venue_photo', 'atmosphere', 'food_showcase'],
      proof: ['food_showcase', 'behind_the_scenes', 'service_showcase'],
      cta: ['food_showcase', 'venue_photo', 'customer_result'],
    },
    overlayFloor: 0.55,
    allowFullBleed: true,
    headlineMaxChars: 22,
  },

  restaurant: {
    label: 'Restaurant / Cafe',
    motionLane: 'editorial',
    motionLaneByRole: { hook: 'pulse', cta: 'editorial' },
    layoutsByRole: {
      hook: ['cinematic_center', 'magazine_cover', 'frosted_glass', 'split_panel'],
      proof: ['editorial_bottom', 'frosted_glass', 'diptych_collage', 'editorial_left'],
      cta: ['split_panel', 'campaign_hero', 'frosted_glass'],
    },
    logoRestraint: 'proof_cta',
    assetRoles: {
      hook: ['food_showcase', 'venue_photo', 'atmosphere'],
      proof: ['food_showcase', 'behind_the_scenes', 'service_showcase', 'product_highlight'],
      cta: ['food_showcase', 'venue_photo', 'customer_result'],
    },
    overlayFloor: 0.58,
    allowFullBleed: false,
    headlineMaxChars: 26,
  },

  hotel: {
    label: 'Hotel / Resort',
    motionLane: 'whisper',
    motionLaneByRole: { cta: 'editorial' },
    layoutsByRole: {
      hook: ['cinematic_center', 'vibe_fullscreen', 'magazine_cover', 'minimal_luxury'],
      proof: ['split_panel', 'diptych_collage', 'gallery_series', 'frosted_glass'],
      cta: ['split_panel', 'minimal_luxury', 'campaign_hero'],
    },
    logoRestraint: 'cta_only',
    assetRoles: {
      hook: ['venue_photo', 'atmosphere', 'outdoor'],
      proof: ['venue_photo', 'service_showcase', 'product_highlight', 'behind_the_scenes'],
      cta: ['venue_photo', 'customer_result', 'social_proof'],
    },
    overlayFloor: 0.50,
    allowFullBleed: true,
    headlineMaxChars: 20,
  },

  beauty: {
    label: 'Beauty / Spa / Salon',
    motionLane: 'pulse',
    motionLaneByRole: { hook: 'editorial', cta: 'pulse' },
    layoutsByRole: {
      hook: ['magazine_cover', 'frosted_glass', 'minimal_luxury', 'cinematic_center'],
      proof: ['diptych_collage', 'editorial_left', 'frosted_glass', 'polaroid_single'],
      cta: ['split_panel', 'campaign_hero', 'frosted_glass'],
    },
    logoRestraint: 'proof_cta',
    assetRoles: {
      hook: ['atmosphere', 'service_showcase', 'venue_photo'],
      proof: ['customer_result', 'before_after', 'service_showcase', 'product_highlight'],
      cta: ['customer_result', 'social_proof', 'service_showcase'],
    },
    overlayFloor: 0.60,
    allowFullBleed: false,
    headlineMaxChars: 24,
  },

  nightlife: {
    label: 'Bar / Nightclub / Event Venue',
    motionLane: 'impact',
    motionLaneByRole: { proof: 'pulse', cta: 'impact' },
    layoutsByRole: {
      hook: ['neon_night', 'bold_impact', 'campaign_hero', 'cinematic_center'],
      proof: ['editorial_bottom', 'gallery_series', 'diptych_collage', 'frosted_glass'],
      cta: ['event_ticket', 'campaign_hero', 'bold_impact'],
    },
    logoRestraint: 'always',
    assetRoles: {
      hook: ['atmosphere', 'event_announcement', 'venue_photo'],
      proof: ['behind_the_scenes', 'event_announcement', 'social_proof'],
      cta: ['event_announcement', 'social_proof', 'venue_photo'],
    },
    overlayFloor: 0.65,
    allowFullBleed: false,
    headlineMaxChars: 26,
  },

  retail: {
    label: 'Retail / Fashion / Shop',
    motionLane: 'pulse',
    motionLaneByRole: { hook: 'editorial', cta: 'pulse' },
    layoutsByRole: {
      hook: ['magazine_cover', 'editorial_left', 'frosted_glass', 'split_panel'],
      proof: ['polaroid_single', 'diptych_collage', 'gallery_series', 'editorial_bottom'],
      cta: ['campaign_hero', 'split_panel', 'bold_impact'],
    },
    logoRestraint: 'proof_cta',
    assetRoles: {
      hook: ['product_highlight', 'atmosphere', 'venue_photo'],
      proof: ['product_highlight', 'product_detail', 'service_showcase'],
      cta: ['product_highlight', 'customer_result', 'social_proof'],
    },
    overlayFloor: 0.62,
    allowFullBleed: false,
    headlineMaxChars: 24,
  },

  fitness: {
    label: 'Fitness / Gym / Yoga',
    motionLane: 'pulse',
    motionLaneByRole: { hook: 'impact', cta: 'pulse' },
    layoutsByRole: {
      hook: ['campaign_hero', 'bold_impact', 'cinematic_center', 'vibe_fullscreen'],
      proof: ['editorial_bottom', 'split_panel', 'diptych_collage', 'frosted_glass'],
      cta: ['campaign_hero', 'split_panel', 'frosted_glass'],
    },
    logoRestraint: 'proof_cta',
    assetRoles: {
      hook: ['atmosphere', 'service_showcase', 'venue_photo'],
      proof: ['customer_result', 'service_showcase', 'behind_the_scenes', 'equipment_showcase'],
      cta: ['customer_result', 'social_proof', 'service_showcase'],
    },
    overlayFloor: 0.63,
    allowFullBleed: false,
    headlineMaxChars: 26,
  },

  agency: {
    label: 'Agency / SaaS / B2B',
    motionLane: 'editorial',
    layoutsByRole: {
      hook: ['split_panel', 'magazine_cover', 'frosted_glass', 'editorial_left'],
      proof: ['frosted_glass', 'split_panel', 'editorial_bottom', 'editorial_left'],
      cta: ['campaign_hero', 'split_panel', 'frosted_glass'],
    },
    logoRestraint: 'always',
    assetRoles: {
      hook: ['venue_photo', 'product_highlight', 'service_showcase'],
      proof: ['service_showcase', 'behind_the_scenes', 'product_highlight', 'equipment_showcase'],
      cta: ['customer_result', 'social_proof', 'service_showcase'],
    },
    overlayFloor: 0.65,
    allowFullBleed: false,
    headlineMaxChars: 28,
  },
};

// Default preset when no sector match is found
const DEFAULT_PRESET: SectorPremiumPreset = {
  label: 'General',
  motionLane: 'editorial',
  layoutsByRole: {
    hook: ['magazine_cover', 'frosted_glass', 'split_panel', 'cinematic_center'],
    proof: ['editorial_bottom', 'frosted_glass', 'diptych_collage', 'editorial_left'],
    cta: ['split_panel', 'campaign_hero', 'frosted_glass'],
  },
  logoRestraint: 'always',
  assetRoles: {
    hook: ['venue_photo', 'atmosphere', 'food_showcase'],
    proof: ['product_highlight', 'service_showcase', 'behind_the_scenes'],
    cta: ['customer_result', 'social_proof', 'venue_photo'],
  },
  overlayFloor: 0.60,
  allowFullBleed: false,
  headlineMaxChars: 28,
};

// ─── Sector resolution ─────────────────────────────────────────────────────────

const SECTOR_PATTERNS: Array<[RegExp, string]> = [
  [/fine.?dini|haute.?cuisine|gastrono|michelin/i, 'fine_dining'],
  [/restaurant|cafe|bistro|brasserie|eatery|food.*court|kitchen|lounge.*din/i, 'restaurant'],
  [/hotel|resort|villa|boutique.?hotel|accommodation|lodg|inn\b/i, 'hotel'],
  [/beauty|spa|salon|wellness|skin.?care|glow|lash|nail|estheti|aestheti/i, 'beauty'],
  [/bar|nightclub|club\b|dj\b|night.?life|concert|venue|night.?venue/i, 'nightlife'],
  [/retail|fashion|apparel|boutique\b|cloth|store|shop\b|e.?commerce|merch/i, 'retail'],
  [/fitness|gym\b|yoga|pilates|crossfit|sport.*club|athletic/i, 'fitness'],
  [/agency|saas|b2b|software|startup|tech.*firm|digital.?agency/i, 'agency'],
];

/**
 * Resolves the sector premium preset for a given business type string.
 * Falls back to DEFAULT_PRESET when no pattern matches.
 */
export function resolveSectorPreset(sector: string | undefined): SectorPremiumPreset {
  const s = (sector ?? '').toLowerCase();
  for (const [pattern, key] of SECTOR_PATTERNS) {
    if (pattern.test(s)) return PRESETS[key] ?? DEFAULT_PRESET;
  }
  return DEFAULT_PRESET;
}

/**
 * Returns the motion lane for a given sector + sequence role combination.
 */
export function resolveMotionLane(sector: string | undefined, role?: StorySequenceRole): MotionLane {
  const preset = resolveSectorPreset(sector);
  if (role && preset.motionLaneByRole?.[role]) {
    return preset.motionLaneByRole[role]!;
  }
  return preset.motionLane;
}

/**
 * Returns preferred layout families for a sector + sequence role.
 * The Creative Director should treat these as a strong hint (not a hard lock).
 */
export function resolveSectorLayoutHints(
  sector: string | undefined,
  role: StorySequenceRole,
): StoryLayoutFamily[] {
  return resolveSectorPreset(sector).layoutsByRole[role];
}

/**
 * Returns logo restraint policy for a sector.
 */
export function resolveLogoRestraint(sector: string | undefined): LogoRestraint {
  return resolveSectorPreset(sector).logoRestraint;
}

/**
 * Returns the asset-role preferences (bestFor tags) for a sector + sequence role.
 */
export function resolveAssetRolePreferences(
  sector: string | undefined,
  role: StorySequenceRole,
): string[] {
  const preset = resolveSectorPreset(sector);
  return preset.assetRoles[role];
}

/**
 * Whether a given logo URL should be shown for this sector + sequence role.
 */
export function shouldShowLogo(
  sector: string | undefined,
  role: StorySequenceRole,
  hasLogoUrl: boolean,
): boolean {
  if (!hasLogoUrl) return false;
  const restraint = resolveLogoRestraint(sector);
  if (restraint === 'never') return false;
  if (restraint === 'always') return true;
  if (restraint === 'cta_only') return role === 'cta';
  if (restraint === 'proof_cta') return role === 'proof' || role === 'cta';
  return true;
}

/**
 * Overlay opacity clamped to sector floor.
 */
export function clampOverlayToSectorFloor(sector: string | undefined, opacity: number): number {
  const floor = resolveSectorPreset(sector).overlayFloor;
  return Math.max(floor, Math.min(0.85, opacity));
}

/**
 * Max headline characters for a sector.
 */
export function resolveHeadlineMaxChars(sector: string | undefined): number {
  return resolveSectorPreset(sector).headlineMaxChars;
}
