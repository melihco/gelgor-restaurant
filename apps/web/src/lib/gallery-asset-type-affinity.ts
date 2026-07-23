/**
 * Preferred vision asset-type affinity (alias-aware).
 *
 * Kept dependency-free so gallery-photo-matcher can score without pulling
 * catalog/sector packs (avoids circular init that breaks hard-theme checks).
 */

/** Vision tag aliases — analyze-gallery + legacy tags use both families. */
const ASSET_TYPE_ALIASES: Record<string, readonly string[]> = {
  venue_reference: ['venue_reference', 'venue_photo', 'hero_image'],
  venue_photo: ['venue_photo', 'venue_reference', 'hero_image'],
  food_drink_photo: ['food_drink_photo', 'food_photo', 'product_image'],
  food_photo: ['food_photo', 'food_drink_photo', 'product_image'],
  product_image: ['product_image', 'food_drink_photo', 'food_photo'],
  event_photo: ['event_photo', 'team_photo'],
  hero_image: ['hero_image', 'venue_reference', 'venue_photo'],
  brand_background: ['brand_background'],
  team_photo: ['team_photo', 'event_photo'],
  service_photo: ['service_photo', 'before_after'],
  equipment_photo: ['equipment_photo'],
};

const GENERIC_TOKENS = new Set(['photo', 'image', 'type', 'asset', 'media', 'pic']);

function expandPreferredAssetTypes(preferred: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const raw of preferred) {
    const key = String(raw ?? '').trim().toLowerCase();
    if (!key) continue;
    out.add(key);
    for (const alias of ASSET_TYPE_ALIASES[key] ?? []) {
      out.add(alias);
    }
  }
  return out;
}

/** True when a photo's suggestedAssetType matches the catalog preferred pool. */
export function photoMatchesPreferredAssetTypes(
  suggestedAssetType: string | null | undefined,
  preferredAssetTypes: readonly string[],
): boolean {
  if (!preferredAssetTypes.length) return false;
  const asset = String(suggestedAssetType ?? '').trim().toLowerCase();
  if (!asset) return false;
  const expanded = expandPreferredAssetTypes(preferredAssetTypes);
  if (expanded.has(asset)) return true;

  const assetTokens = new Set(
    asset.split(/[_\s]+/).filter((t) => t.length > 2 && !GENERIC_TOKENS.has(t)),
  );
  if (assetTokens.size === 0) return false;
  for (const pref of expanded) {
    const prefTokens = pref
      .split(/[_\s]+/)
      .filter((t) => t.length > 2 && !GENERIC_TOKENS.has(t));
    if (prefTokens.some((t) => assetTokens.has(t))) return true;
  }
  return false;
}
