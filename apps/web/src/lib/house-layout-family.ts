/**
 * House layout family — 2–3 signature Canva geometries per brand.
 *
 * Tenant prefs win, then layout-pack seeds, then the sector pool.
 * Never leaks a shop into neon_night_promo: every id is ∩ sector pool.
 * Multi-tenant: sector + pack + theme prefs only — no brand-name branches.
 */

import type { BrandLayoutLanguagePackId } from '@/lib/brand-layout-language';
import { resolveBrandLayoutLanguage } from '@/lib/brand-layout-language';
import {
  CANVA_SECTOR_ARCHETYPE_HINTS,
  getCanvaArchetype,
  type CanvaArchetypeId,
} from '@/lib/canva-archetype-catalog';
import { readTenantPreferredCanvaArchetypes } from '@/lib/fal-design-brief';
import { parseBrandReferenceUrls } from '@/lib/gallery-upload';
import { isStockGalleryPhotoUrl } from '@/lib/media-url';
import { normalizeSectorId } from '@/lib/sector-production-profile';

export const HOUSE_LAYOUT_FAMILY_SIZE = 3;
export const HOUSE_MOODBOARD_REF_CAP = 3;

/** Pack → preferred geometries. Intersection with the sector pool is required. */
export const PACK_SIGNATURE_ARCHETYPES: Record<BrandLayoutLanguagePackId, CanvaArchetypeId[]> = {
  quiet_luxury: ['cinematic_full_bleed', 'noir_editorial', 'magazine_cover_drop'],
  coastal_editorial: ['cinematic_full_bleed', 'diagonal_brand_split', 'split_feature_panel'],
  artisan_organic: ['product_hero_card', 'polaroid_memory', 'magazine_cover_drop'],
  product_catalog: ['product_hero_card', 'promo_price_stack', 'graphic_shape_stack'],
  nightlife_bold: ['neon_night_promo', 'event_ticket_stub', 'diagonal_brand_split'],
  street_energy: ['graphic_shape_stack', 'diagonal_brand_split', 'campaign_hero_block'],
  clean_minimal: ['frosted_quote_card', 'cinematic_full_bleed', 'split_feature_panel'],
  balanced_default: ['split_feature_panel', 'magazine_cover_drop', 'graphic_shape_stack'],
};

export function sectorArchetypePool(sector: string): CanvaArchetypeId[] {
  const canonical = normalizeSectorId(sector) || 'default';
  const pool = CANVA_SECTOR_ARCHETYPE_HINTS[canonical]
    ?? CANVA_SECTOR_ARCHETYPE_HINTS.default
    ?? [];
  return pool.filter((id) => Boolean(getCanvaArchetype(id)));
}

function pushUnique(
  out: CanvaArchetypeId[],
  ids: readonly string[],
  allowed: ReadonlySet<CanvaArchetypeId>,
  cap: number,
): void {
  for (const raw of ids) {
    if (out.length >= cap) return;
    const id = String(raw).trim() as CanvaArchetypeId;
    if (!allowed.has(id) || !getCanvaArchetype(id) || out.includes(id)) continue;
    out.push(id);
  }
}

export function resolveHouseLayoutFamily(input: {
  sector: string;
  layoutPackId: BrandLayoutLanguagePackId | string;
  tenantPreferred?: readonly string[] | null;
}): CanvaArchetypeId[] {
  const pool = sectorArchetypePool(input.sector);
  const allowed = new Set(pool);
  const packKey = (input.layoutPackId || 'balanced_default') as BrandLayoutLanguagePackId;
  const packSeeds = PACK_SIGNATURE_ARCHETYPES[packKey]
    ?? PACK_SIGNATURE_ARCHETYPES.balanced_default;
  const family: CanvaArchetypeId[] = [];

  pushUnique(family, input.tenantPreferred ?? [], allowed, HOUSE_LAYOUT_FAMILY_SIZE);
  pushUnique(family, packSeeds, allowed, HOUSE_LAYOUT_FAMILY_SIZE);
  pushUnique(family, pool, allowed, HOUSE_LAYOUT_FAMILY_SIZE);

  return family.slice(0, HOUSE_LAYOUT_FAMILY_SIZE);
}

/** Compile pack + theme prefs into the house family (missions + constitution). */
export function resolveTenantHouseArchetypes(input: {
  sector: string;
  brandTheme?: Record<string, unknown> | null;
  visualDna?: string | null;
  visualDnaTone?: string | null;
  brandTone?: string | null;
  vibeProfile?: Record<string, unknown> | null;
}): CanvaArchetypeId[] {
  const layout = resolveBrandLayoutLanguage({
    sector: input.sector,
    visualDna: input.visualDna,
    visualDnaTone: input.visualDnaTone,
    brandTone: input.brandTone,
    vibeProfile: input.vibeProfile,
  });
  return resolveHouseLayoutFamily({
    sector: input.sector,
    layoutPackId: layout.id,
    tenantPreferred: readTenantPreferredCanvaArchetypes(input.brandTheme),
  });
}

export function rotateHouseFamilyArchetype(
  family: readonly string[],
  index: number,
): CanvaArchetypeId | undefined {
  if (!family.length) return undefined;
  const id = family[((index % family.length) + family.length) % family.length];
  return getCanvaArchetype(String(id)) ? (id as CanvaArchetypeId) : undefined;
}

/** Onboarding / gallery refs already stored — never scrape unused columns. */
export function parseHouseMoodboardRefs(raw: unknown, cap = HOUSE_MOODBOARD_REF_CAP): string[] {
  const urls = parseBrandReferenceUrls(raw).filter((url) => !isStockGalleryPhotoUrl(url));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const key = url.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= cap) break;
  }
  return out;
}

export function themeNeedsHouseFamilySeal(
  theme: Record<string, unknown> | null | undefined,
  family: readonly string[],
): boolean {
  if (family.length < 2) return false;
  return readTenantPreferredCanvaArchetypes(theme).length === 0;
}

export function mergeHouseFamilyIntoTheme(
  theme: Record<string, unknown> | null | undefined,
  family: readonly string[],
): Record<string, unknown> {
  const base = { ...(theme ?? {}) };
  const existing = (base.typography_design ?? base.typographyDesign);
  const typo = existing && typeof existing === 'object'
    ? { ...(existing as Record<string, unknown>) }
    : {};
  const ids = family.map((id) => String(id).trim()).filter(Boolean);
  typo.preferred_canva_archetypes = ids;
  typo.preferredCanvaArchetypes = ids;
  return {
    ...base,
    typography_design: typo,
    typographyDesign: typo,
  };
}
