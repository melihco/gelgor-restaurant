/**
 * Catalog-aware gallery photo signals shared by template library generation
 * and mission production matching.
 *
 * SSOT for production visuals: the ideation Instagram caption (under-post text).
 * Catalog slot hints (keywords / preferredAssetTypes) steer only when that
 * caption is thin — never invent a different theme than the publish caption.
 */

import { buildDesignPresetFromCatalogSlot } from '@/lib/catalog-design-template-presets';
import { photoMatchesPreferredAssetTypes } from '@/lib/gallery-asset-type-affinity';
import { normalizeGalleryUrl } from '@/lib/gallery-usage-tracker';
import { synthesizeSectorSlotDefinitions } from '@/lib/sector-slot-pack';
import type { ProductionSlotDefinition } from '@/lib/production-slot-catalog';

export { photoMatchesPreferredAssetTypes } from '@/lib/gallery-asset-type-affinity';

export interface CatalogSlotGalleryHints {
  catalogSlotKey: string;
  sectorId: string;
  templateType: string;
  matchKeywords: string;
  preferredAssetTypes: string[];
  sampleHeadline: string;
  sampleSubtitle?: string;
}

/** Minimal analysis shape — avoids importing gallery-photo-matcher (circular init). */
type AssetTypedGalleryMeta = { suggestedAssetType?: string | null };

export function filterGalleryUrlsByPreferredAssetTypes(
  urls: string[],
  galleryAnalysis: Record<string, AssetTypedGalleryMeta>,
  preferredAssetTypes: readonly string[],
): string[] {
  if (!preferredAssetTypes.length) return urls;
  return urls.filter((url) => {
    const meta = galleryAnalysis[normalizeGalleryUrl(url)] ?? galleryAnalysis[url];
    return photoMatchesPreferredAssetTypes(meta?.suggestedAssetType, preferredAssetTypes);
  });
}

function findSlotDefinition(
  catalogSlotKey: string,
  sectorId?: string | null,
): ProductionSlotDefinition | null {
  const key = catalogSlotKey.trim();
  if (!key) return null;

  const sector = String(sectorId ?? '').trim();
  if (sector) {
    const sectorSlots = synthesizeSectorSlotDefinitions(sector);
    const hit = sectorSlots.find((s) => s.slot_key === key);
    if (hit) return hit;
  }

  // Key prefix often encodes sector (`beach_club_dj_night_teaser_post`).
  const prefixSector = key.split('_').slice(0, 2).join('_');
  const candidates = [prefixSector, key.split('_')[0] ?? ''].filter(Boolean);
  for (const sid of candidates) {
    if (sid === sector) continue;
    const slots = synthesizeSectorSlotDefinitions(sid);
    const hit = slots.find((s) => s.slot_key === key);
    if (hit) return hit;
  }

  return null;
}

/**
 * Resolve the same gallery signals the template library uses for a catalog slot.
 * Sector-driven; never branches on tenant UUID.
 */
export function resolveCatalogSlotGalleryHints(input: {
  sectorId?: string | null;
  catalogSlotKey?: string | null;
}): CatalogSlotGalleryHints | null {
  const catalogSlotKey = String(input.catalogSlotKey ?? '').trim();
  if (!catalogSlotKey) return null;

  const slot = findSlotDefinition(catalogSlotKey, input.sectorId);
  if (!slot) return null;

  const preset = buildDesignPresetFromCatalogSlot(slot);
  return {
    catalogSlotKey: slot.slot_key,
    sectorId: slot.sector_id,
    templateType: preset.templateType,
    matchKeywords: preset.matchKeywords,
    preferredAssetTypes: [...preset.preferredAssetTypes],
    sampleHeadline: preset.sampleHeadline,
    sampleSubtitle: preset.sampleSubtitle,
  };
}

/**
 * Publish-ready ideation captions are the visual SSOT at this length —
 * matches gallery-first "keep ideation copy" gate.
 */
export const STRONG_IDEATION_CAPTION_CHARS = 24;

export function isStrongIdeationCaption(caption: string | null | undefined): boolean {
  return String(caption ?? '').trim().length >= STRONG_IDEATION_CAPTION_CHARS;
}

/**
 * Build the same caption/headline/preferredAsset match fields the template library
 * uses — shared by pickPhotoForPreset, pickGalleryPhotoForSlot, and
 * pickGalleryPhotoForIdea (mission fallbacks).
 */
export function buildCatalogAwareGalleryMatchFields(input: {
  caption: string;
  headline: string;
  catalogSlotKey?: string | null;
  sectorId?: string | null;
  /** Template library always blends slot keywords even for strong captions. */
  forceBlend?: boolean;
  /** When ideation headline is weak/briefing, seed from catalog sample. */
  seedHeadlineFromCatalog?: boolean;
}): {
  caption: string;
  headline: string;
  preferredAssetTypes?: string[];
  templateUseCase?: string;
  sampleHeadline?: string;
  matchKeywords?: string;
} {
  const caption = String(input.caption ?? '').trim();
  const headline = String(input.headline ?? '').trim();
  const hints = resolveCatalogSlotGalleryHints({
    sectorId: input.sectorId,
    catalogSlotKey: input.catalogSlotKey,
  });
  if (!hints) {
    return { caption, headline };
  }

  let matchHeadline = headline;
  if (input.seedHeadlineFromCatalog !== false) {
    const weak =
      !headline
      || headline.length < 3
      || /highlight the|göstereceğiz|tanıtımını|exclusive|strategy|brief/i.test(headline);
    if (weak && hints.sampleHeadline) {
      matchHeadline = hints.sampleHeadline;
    }
  }

  const matchCaption = blendCatalogMatchKeywords({
    caption,
    matchKeywords: hints.matchKeywords,
    sampleHeadline: hints.sampleHeadline,
    forceBlend: input.forceBlend,
  });

  return {
    caption: matchCaption || caption || hints.sampleHeadline,
    headline: matchHeadline || hints.sampleHeadline || headline,
    preferredAssetTypes: hints.preferredAssetTypes,
    templateUseCase: hints.templateType,
    sampleHeadline: hints.sampleHeadline,
    matchKeywords: hints.matchKeywords,
  };
}

/**
 * Blend catalog match keywords into an ideation caption without drowning it.
 * When caption is empty, fall back to sample headline + keywords (library parity).
 * When caption is already strong (publish SSOT), return it unchanged so slot
 * vocabulary cannot invent a competing theme for photo/hard-conflict scoring.
 */
export function blendCatalogMatchKeywords(input: {
  caption: string;
  matchKeywords?: string | null;
  sampleHeadline?: string | null;
  /** Force blend even for strong captions (template library only). */
  forceBlend?: boolean;
}): string {
  const caption = String(input.caption ?? '').trim();
  const keywords = String(input.matchKeywords ?? '').trim();
  const sample = String(input.sampleHeadline ?? '').trim();

  if (!caption) {
    return [sample, keywords].filter(Boolean).join(' ').trim().slice(0, 480);
  }
  if (!keywords) return caption;
  if (!input.forceBlend && isStrongIdeationCaption(caption)) return caption;

  const lower = caption.toLowerCase();
  // Skip structural/template words that poison subject extraction if re-parsed.
  const SKIP = new Set([
    'post', 'story', 'reel', 'teaser', 'template', 'announcement', 'campaign',
    'club', 'shop', 'beach', 'local', 'products', 'the', 'and', 'for',
  ]);
  const keywordTokens = keywords
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => {
      const tl = t.toLowerCase();
      return t.length >= 3 && !SKIP.has(tl) && !lower.includes(tl);
    })
    .slice(0, 8);
  if (keywordTokens.length === 0) return caption;
  return `${caption} ${keywordTokens.join(' ')}`.trim().slice(0, 480);
}
