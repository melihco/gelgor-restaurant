/**
 * Brand layout language — maps visual DNA / vibe / sector → composition policy.
 *
 * Intensity (how bold) = Brand Hub parameters + slot role.
 * DNA/vibe here only chooses craft allowlist + compose mode (how it looks),
 * so product shops (Karaman) keep designed energy while avoiding heavy geometry.
 */

import {
  clampDesignIntensityToCeiling,
  DESIGN_CRAFT_LAYOUT_FAMILIES,
  type DesignCraftLayoutFamily,
  type FalDesignIntensityLevel,
} from '@/lib/fal-design-intensity';
import { isPremiumVenueSector } from '@/lib/production-design-policy';

export type BrandLayoutLanguagePackId =
  | 'quiet_luxury'
  | 'coastal_editorial'
  | 'artisan_organic'
  | 'product_catalog'
  | 'nightlife_bold'
  | 'street_energy'
  | 'clean_minimal'
  | 'balanced_default';

export type BrandLayoutComposeMode =
  | 'photo_first'
  | 'type_on_photo'
  | 'craft_window';

export interface BrandLayoutLanguagePack {
  id: BrandLayoutLanguagePackId;
  /**
   * Soft sector/DNA hint only — NOT an intensity clamp.
   * Graphic energy comes from Brand Hub fal_design_intensity /
   * fal_template_production (slot proposal + brand parameter ceiling).
   */
  suggestedIntensity: FalDesignIntensityLevel;
  /**
   * Allowed painted craft systems when intensity requires craft.
   * Empty → never force a paint family (photo/type-led only).
   */
  craftAllowlist: DesignCraftLayoutFamily[];
  composeMode: BrandLayoutComposeMode;
  /** Soft families preferred even when intensity is balanced+. */
  preferPhotoLedCraft: boolean;
  /** Prompt lines explaining the layout language (not color). */
  directives: string[];
}

export interface BrandLayoutLanguageInput {
  sector: string;
  visualDna?: string | null;
  brandTone?: string | null;
  visualDnaTone?: string | null;
  vibeProfile?: Record<string, unknown> | null;
  typographyVibe?: string | null;
}

/**
 * Quiet-luxury signals — keep STRICT.
 * Do NOT match bare "editorial" / "serene" / "premium": those appear in vibe-profile
 * typography noise and falsely crushed Yula (bold Hub) down to elegant_light caption-only.
 */
const QUIET_RX =
  /\b(quiet\s*luxury|understated(\s+luxury)?|restrained|aman|nobu|award.?level\s+restraint|lüks\s*sade)\b/i;
const VIBRANT_RX =
  /\b(vibrant|citrus|joy|social|unhurried|drink\s*&\s*chill|fresh|playful|energetic|party\s*day)\b/i;
const COASTAL_RX =
  /\b(coastal|aegean|cycladic|mediterranean|beach|marina|sun.?wash|turquoise|seaside|bodrum|mykonos)\b/i;
const ARTISAN_RX =
  /\b(artisan|organic|hand.?craft|rustic|natural|warm|samimi|wellness|spa|farm|earthy)\b/i;
const NIGHTLIFE_RX =
  /\b(neon|nightlife|nightclub|club\s*night|dj|after.?dark|electric|party\s*flyer|edm)\b/i;
const STREET_RX =
  /\b(street|urban|bold\s*energy|dynamic|impact|graffiti|hype)\b/i;
const MINIMAL_RX =
  /\b(minimal|clean|sleek|contemporary|modern\s*simple|airiness|negative\s*space)\b/i;
const PRODUCT_RX =
  /\b(product|packaging|jar|label|sku|shelf|catalog|macro)\b/i;

const SOFT_CRAFT: DesignCraftLayoutFamily[] = [
  'type_with_brand_rules',
  'asymmetric_corner_plate',
  'magazine_cover_overlap',
];

/**
 * Vibrant coastal (Yula-like): wider craft pool so GPT-image-2 cannot collapse
 * every slot into the same cream corner-plate. Quiet coastal stays type-led only.
 */
const COASTAL_CRAFT: DesignCraftLayoutFamily[] = [
  'type_with_brand_rules',
  'asymmetric_corner_plate',
  'magazine_cover_overlap',
  'diagonal_soft_cut',
  'editorial_split_soft',
  'inset_photo_frame',
  'l_shape_accent',
];

const ARTISAN_CRAFT: DesignCraftLayoutFamily[] = [
  'type_with_brand_rules',
  'inset_photo_frame',
  'magazine_cover_overlap',
  'asymmetric_corner_plate',
];

const PRODUCT_CRAFT: DesignCraftLayoutFamily[] = [
  'type_with_brand_rules',
  'inset_photo_frame',
];

const BOLD_CRAFT: DesignCraftLayoutFamily[] = [
  'side_rail_frame',
  'l_shape_accent',
  'diagonal_soft_cut',
  'magazine_cover_overlap',
  'editorial_split_soft',
  'asymmetric_corner_plate',
];

const ALL_CRAFT = [...DESIGN_CRAFT_LAYOUT_FAMILIES];

/** Full blob for coastal/artisan/nightlife motifs (vibe profile OK). */
function vibeBlob(input: BrandLayoutLanguageInput): string {
  const vibeBits: string[] = [];
  const vibe = input.vibeProfile;
  if (vibe && typeof vibe === 'object') {
    for (const [k, v] of Object.entries(vibe)) {
      // Skip typography machinery keys — they pollute quiet/luxury detection.
      if (/font|typography|heading|overlay|density|personality/i.test(k)) continue;
      if (typeof v === 'string') vibeBits.push(`${k}:${v}`);
      else if (Array.isArray(v)) vibeBits.push(`${k}:${v.filter((x) => typeof x === 'string').slice(0, 4).join(',')}`);
    }
  }
  return [
    input.visualDnaTone ?? '',
    input.visualDna ?? '',
    input.brandTone ?? '',
    input.typographyVibe ?? '',
    ...vibeBits,
  ].join('\n');
}

/** Quiet detection uses soul text only — not nested vibe-profile typography JSON. */
function soulBlob(input: BrandLayoutLanguageInput): string {
  return [
    input.visualDnaTone ?? '',
    input.visualDna ?? '',
    input.brandTone ?? '',
  ].join('\n');
}

function pack(
  id: BrandLayoutLanguagePackId,
  suggestedIntensity: FalDesignIntensityLevel,
  craftAllowlist: DesignCraftLayoutFamily[],
  composeMode: BrandLayoutComposeMode,
  preferPhotoLedCraft: boolean,
  extraDirectives: string[],
): BrandLayoutLanguagePack {
  return {
    id,
    suggestedIntensity,
    craftAllowlist,
    composeMode,
    preferPhotoLedCraft,
    directives: [
      `LAYOUT LANGUAGE PACK: ${id} — composition policy from brand visual/vibe DNA (not palette alone).`,
      preferPhotoLedCraft
        ? `Intensity soft-cap: ${suggestedIntensity === 'elegant_light' ? 'elegant_light' : 'balanced'}. Soft coastal/product packs stay type-led — never Hub bold_editorial paint energy.`
        : 'Intensity is driven by brand design parameters + slot role — DNA does not override Brand Hub intensity.',
      craftAllowlist.length
        ? preferPhotoLedCraft
          ? `Craft allowlist ONLY: ${craftAllowlist.join(', ')}. Forbidden: any other painted geometry family (no side_rail / L-shape kits).`
          : `Bold craft pack: if a hard layout lock is applied, stay within ${craftAllowlist.join(', ')} — still brand-unique, not a stock geometry sticker.`
        : 'Craft allowlist: NONE — photo + type only.',
      composeMode === 'photo_first'
        ? 'Compose mode: PHOTO-FIRST — venue/product photo is the design; type is a quiet caption layer.'
        : composeMode === 'type_on_photo'
          ? 'Compose mode: TYPE-ON-PHOTO — typography lives on the photo via scrim/found surface; no large painted color fields.'
          : 'Compose mode: CRAFT-WINDOW — graphic craft allowed only from the allowlist; photo stays a clear window.',
      ...extraDirectives,
    ],
  };
}

/**
 * Resolve the brand's layout language from DNA/vibe/sector.
 * Priority: explicit DNA signals → sector defaults → balanced_default.
 */
export function resolveBrandLayoutLanguage(
  input: BrandLayoutLanguageInput,
): BrandLayoutLanguagePack {
  const text = vibeBlob(input);
  const soul = soulBlob(input);
  const sector = (input.sector ?? '').toLowerCase();
  const isQuietSoul = QUIET_RX.test(soul);
  const isVibrantSoul = VIBRANT_RX.test(soul);

  // Nightlife DNA wins even on beach_club (real club nights) — otherwise quiet packs win for venues.
  if (NIGHTLIFE_RX.test(text) && !isQuietSoul) {
    return pack(
      'nightlife_bold',
      'bold_editorial',
      BOLD_CRAFT,
      'craft_window',
      false,
      ['Nightlife energy: confident type + intentional color craft — still not a generic EDM sticker grid.'],
    );
  }

  if (STREET_RX.test(text) && !isQuietSoul) {
    return pack(
      'street_energy',
      'bold_editorial',
      BOLD_CRAFT,
      'craft_window',
      false,
      ['Street energy: angular/asymmetric craft; avoid soft luxury scrim language.'],
    );
  }

  // Coastal / beach: vibrant daybed brands keep craft-window (Yula). Only true quiet-luxury soul
  // collapses to type-led minimal. Never let vibe-profile "serene/editorial" force caption-only.
  if (COASTAL_RX.test(text) || /beach|marina|resort/i.test(sector)) {
    if (isQuietSoul && !isVibrantSoul) {
      return pack(
        'coastal_editorial',
        'elegant_light',
        ['type_with_brand_rules'],
        'type_on_photo',
        true,
        [
          'Coastal quiet luxury: sun-washed photo leads; thin rules/scrims only — forbid 50/50 color-band sandwiches and heavy L/rail paint.',
        ],
      );
    }
    // preferPhotoLedCraft=false: library keeps designed intensity + LAYOUT LOCK per
    // slot family (GPT-image-2 otherwise homogenizes to cream corner plates).
    return pack(
      'coastal_editorial',
      'designed',
      COASTAL_CRAFT,
      'craft_window',
      false,
      [
        'Coastal editorial craft: SLOT-UNIQUE composition from the allowlist — brand-color fields + clear photo window. Aegean energy, not caption-on-photo, not repeating cream corner stickers across slots.',
      ],
    );
  }

  if (isQuietSoul || (isPremiumVenueSector(sector) && !NIGHTLIFE_RX.test(text) && !STREET_RX.test(text) && !isVibrantSoul)) {
    return pack(
      'quiet_luxury',
      'elegant_light',
      ['type_with_brand_rules'],
      'photo_first',
      true,
      [
        'Quiet luxury: award-level restraint. Forbidden: heavy brand-color plates, side rails, L-shapes, diagonal wedges, editorial color splits.',
      ],
    );
  }

  if (/local_products|retail_product|jewelry|gift_shop/i.test(sector) || PRODUCT_RX.test(text)) {
    // Ceiling is balanced (not elegant_light): product shops still need a designed
    // social system (type plate / inset frame). elegant_light killed craft and
    // produced "photo + floating caption only". Packaging fidelity is enforced by
    // allowlist (no heavy rail/L/split) + prompt — not by zeroing intensity.
    return pack(
      'product_catalog',
      'balanced',
      PRODUCT_CRAFT,
      'type_on_photo',
      true,
      [
        'Product catalog: packaging/product fidelity first. Soft type-led or inset craft only — never paint over labels, invent jar geometry, or use heavy rail/L/split color slabs.',
      ],
    );
  }

  if (ARTISAN_RX.test(text) || /bakery|cafe|coffee|wellness|spa/i.test(sector)) {
    return pack(
      'artisan_organic',
      'balanced',
      ARTISAN_CRAFT,
      'type_on_photo',
      true,
      ['Artisan organic: warm, handmade craft — soft plates only; no neon nightlife geometry.'],
    );
  }

  if (MINIMAL_RX.test(text)) {
    return pack(
      'clean_minimal',
      'elegant_light',
      ['type_with_brand_rules'],
      'type_on_photo',
      true,
      ['Clean minimal: negative space and type hierarchy; forbid dense painted geometry.'],
    );
  }

  if (/nightclub|lounge|bar_cocktail/i.test(sector)) {
    return pack(
      'nightlife_bold',
      'designed',
      BOLD_CRAFT,
      'craft_window',
      false,
      ['Sector nightlife: bold craft allowed; still avoid stock Canva header sandwiches.'],
    );
  }

  return pack(
    'balanced_default',
    'designed',
    SOFT_CRAFT,
    'craft_window',
    true,
    ['Balanced default: brand+slot recipe led — soft type/rules craft only; no heavy rail/L geometry kit.'],
  );
}

/**
 * Identity helper for mission paths — Hub/slot intensity already resolved.
 * Template library should use `resolveTemplateLibraryEffectiveIntensity` instead.
 */
export function clampIntensityToLayoutLanguage(
  proposed: FalDesignIntensityLevel,
  _language: BrandLayoutLanguagePack,
): FalDesignIntensityLevel {
  return proposed;
}

/**
 * Template-library intensity: keep slot proposal under Hub ceiling (already applied),
 * and soft-cap DNA packs so Hub bold_editorial cannot force painted poster geometry.
 *
 * Never raises energy to the Hub ceiling — that regression turned Kokteyl Promo /
 * coastal templates into generic plate/rail/L paint after DNA vibe fixes.
 */
export function resolveTemplateLibraryEffectiveIntensity(input: {
  productionIntensity: FalDesignIntensityLevel;
  language: BrandLayoutLanguagePack;
}): FalDesignIntensityLevel {
  const proposed = input.productionIntensity;
  if (proposed === 'photo_first') return 'photo_first';

  if (input.language.composeMode === 'photo_first') {
    return clampDesignIntensityToCeiling(proposed, 'elegant_light');
  }

  // Soft / type-led packs: match the winning coastal library era (balanced +
  // type_with_brand_rules). Never let Hub bold_editorial override soft DNA.
  if (
    input.language.preferPhotoLedCraft
    || input.language.composeMode === 'type_on_photo'
  ) {
    const softCeiling = input.language.suggestedIntensity === 'elegant_light'
      ? 'elegant_light'
      : 'balanced';
    return clampDesignIntensityToCeiling(proposed, softCeiling);
  }

  return proposed;
}

/**
 * Soft DNA packs (coastal/product/artisan): LAYOUT LOCK from allowlist at balanced+.
 * Craft-window packs (vibrant coastal): also lock at balanced — venue_showcase /
 * daily_story slots propose balanced; without this, GPT-image-2 skips LAYOUT LOCK
 * and collapses to cream corner plates.
 * Nightlife/street (non–craft_window bold): hard lock at designed+.
 */
export function shouldApplyCraftLayoutFamily(
  level: FalDesignIntensityLevel,
  language: BrandLayoutLanguagePack,
): boolean {
  if (language.craftAllowlist.length === 0) return false;
  if (level === 'photo_first' || level === 'elegant_light') return false;

  const softPack = language.preferPhotoLedCraft
    || language.composeMode === 'type_on_photo';
  if (softPack) {
    if (level !== 'balanced' && level !== 'designed' && level !== 'bold_editorial') return false;
    // Apply LAYOUT LOCK whenever the pack has craft families — do not filter the
    // allowlist down to SOFT_CRAFT only (that hid diagonal/split/L diversity).
    return language.craftAllowlist.length > 0;
  }

  if (language.composeMode === 'photo_first') return false;
  // Vibrant coastal craft-window: venue/daily slots are balanced — still need a family.
  if (language.composeMode === 'craft_window') {
    return level === 'balanced' || level === 'designed' || level === 'bold_editorial';
  }
  // Nightlife / street bold packs.
  return level === 'designed' || level === 'bold_editorial';
}

export function buildBrandLayoutLanguageDirectives(
  language: BrandLayoutLanguagePack,
): string[] {
  return language.directives;
}

/** Effective allowlist for craft resolver (falls back to soft type-led). */
export function resolveCraftAllowlistForPack(
  language: BrandLayoutLanguagePack,
): readonly DesignCraftLayoutFamily[] {
  if (language.craftAllowlist.length > 0) return language.craftAllowlist;
  return ['type_with_brand_rules'];
}
