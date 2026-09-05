/**
 * Catalog slot → photo family fit.
 *
 * Suffix-driven (every sector), not brand names. Fail-open when gallery meta
 * has no asset type / tags — missing analysis must not withhold the slot.
 */

import { photoMatchesPreferredAssetTypes } from '@/lib/gallery-asset-type-affinity';

export type SlotPhotoNeed = 'team' | 'plated' | null;

const TEAM_SLOT = /hiring|open_role|job_posting|join_the_team|team_intro|team_spotlight/;
const PLATED_SLOT =
  /signature_dish|menu_highlight|brunch_offer|kitchen_bts|chef_plating|chef_special|seasonal_ingredient/;

export function resolveSlotPhotoNeed(catalogSlotKey?: string | null): SlotPhotoNeed {
  const key = String(catalogSlotKey ?? '').toLowerCase();
  if (!key) return null;
  if (TEAM_SLOT.test(key)) return 'team';
  if (PLATED_SLOT.test(key)) return 'plated';
  return null;
}

export function isSlotPhotoNeedUnmet(
  catalogSlotKey: string | null | undefined,
  meta: {
    suggestedAssetType?: string | null;
    contentTags?: string[] | null;
    description?: string | null;
    hasPeople?: boolean | null;
  } | null | undefined,
): boolean {
  const need = resolveSlotPhotoNeed(catalogSlotKey);
  if (!need || !meta) return false;

  const asset = String(meta.suggestedAssetType ?? '').toLowerCase();
  const tags = (meta.contentTags ?? []).map((t) => String(t).toLowerCase());
  const desc = String(meta.description ?? '').toLowerCase();
  const hay = [asset, ...tags, desc].join(' ');
  if (!hay.trim() && meta.hasPeople == null) return false;

  if (need === 'team') {
    const people = meta.hasPeople === true
      || /\b(team|staff|portrait|person|people|ekip|çalışan)\b/.test(hay);
    const productOnly = photoMatchesPreferredAssetTypes(asset, ['product_image'])
      || /\b(product_hero|product_photo|bottle|jar|kavanoz)\b/.test(hay);
    return productOnly && !people;
  }

  const foodProof = photoMatchesPreferredAssetTypes(asset, ['food_drink_photo', 'food_photo'])
    || /\b(food|dish|plate|tabak|yemek|kitchen|mutfak|plating)\b/.test(hay);
  if (foodProof) return false;
  const venueOnly = photoMatchesPreferredAssetTypes(asset, ['venue_photo', 'venue_reference'])
    || /\b(venue_ambiance|ambiance|terrace|bahçe|garden|interior)\b/.test(hay);
  return venueOnly;
}
