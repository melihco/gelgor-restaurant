/**
 * Venue gallery fingerprint — multi-tenant SSOT for what a brand's REAL space looks like.
 *
 * Derived from gallery_analysis tags/descriptions (never tenant UUIDs or brand names).
 * Injected into enhance / caption-driven prompts so AI cannot invent environments
 * absent from the brand's photo inventory (e.g. seaside when gallery shows garden only).
 */

import type { GalleryPhotoMeta } from '@/lib/gallery-photo-matcher';
import { isNonVenueSectorProfile } from '@/lib/sector-production-profile';

export type VenueEnvironmentId =
  | 'sea_view'
  | 'garden'
  | 'indoor_dining'
  | 'terrace'
  | 'pool'
  | 'street_storefront'
  | 'product_closeup'
  | 'night_ambiance'
  | 'crowd_social';

export type VenueFingerprintConfidence = 'low' | 'medium' | 'high';

export interface VenueEnvironmentStat {
  id: VenueEnvironmentId;
  photoCount: number;
  share: number;
}

export interface VenueGalleryFingerprint {
  analyzedPhotoCount: number;
  confidence: VenueFingerprintConfidence;
  /** Environments present in ≥1 analyzed photo, sorted by count. */
  present: VenueEnvironmentStat[];
  /** Environments with zero gallery evidence — safe to forbid in AI prompts. */
  absentGuards: VenueEnvironmentId[];
  /** Human-readable anchors for prompts (from present envs). */
  positiveAnchors: string[];
  /** Human-readable forbidden scenes for prompts. */
  negativeGuards: string[];
}

const ENV_SIGNALS: ReadonlyArray<{
  id: VenueEnvironmentId;
  terms: readonly string[];
}> = [
  {
    id: 'sea_view',
    terms: [
      'sea', 'deniz', 'ocean', 'waterfront', 'marina', 'beach', 'plaj', 'sahil',
      'coast', 'kıyı', 'kiyi', 'horizon', 'wave', 'dalga', 'aegean', 'mediterranean',
      'tekne', 'boat', 'yacht', 'marina', 'liman',
    ],
  },
  {
    id: 'garden',
    terms: [
      'garden', 'bahçe', 'bahce', 'grove', 'orchard', 'ağaç', 'agac', 'tree', 'trees',
      'citrus', 'mandalina', 'mandarin', 'portakal', 'orange', 'limon', 'lemon',
      'zeytin', 'olive grove', 'vineyard', 'bağ', 'bag', 'lawn', 'çim', 'cim', 'green lawn',
    ],
  },
  {
    id: 'indoor_dining',
    terms: [
      'interior', 'iç mekan', 'ic mekan', 'indoor', 'dining room', 'restaurant interior',
      'salon', 'masa', 'table setting', 'içeri', 'iceri',
    ],
  },
  {
    id: 'terrace',
    terms: ['terrace', 'teras', 'patio', 'veranda', 'veranda', 'balkon', 'balcony', 'rooftop', 'çatı', 'cati'],
  },
  {
    id: 'pool',
    terms: ['pool', 'havuz', 'swimming', 'yüzme', 'yuzme', 'infinity pool'],
  },
  {
    id: 'street_storefront',
    terms: ['storefront', 'facade', 'vitrin', 'street', 'cadde', 'shop front', 'exterior sign'],
  },
  {
    id: 'product_closeup',
    terms: [
      'close-up', 'closeup', 'flat lay', 'flatlay', 'product', 'packaging', 'label',
      'plate', 'dish', 'tabak', 'food', 'yemek', 'kahvaltı', 'kahvalti', 'breakfast', 'serpme',
    ],
  },
  {
    id: 'night_ambiance',
    terms: ['night', 'gece', 'evening', 'akşam', 'aksam', 'candle', 'mum', 'string light', 'fairy light'],
  },
  {
    id: 'crowd_social',
    terms: [
      'crowd', 'kalabalık', 'kalabalik', 'busy', 'guests', 'misafir', 'people dining',
      'full house', 'yoğun', 'yogun', 'dolu', 'social',
    ],
  },
];

const ENV_PROMPT_ANCHORS: Record<VenueEnvironmentId, string> = {
  sea_view: 'coastal / sea-view terrace (only if consistent with reference photo)',
  garden: 'garden, trees, orchard, or lawn outdoor dining under natural greenery',
  indoor_dining: 'warm indoor dining room with real furniture from the venue',
  terrace: 'outdoor terrace or patio at the actual venue',
  pool: 'pool deck or poolside area at the venue',
  street_storefront: 'storefront or street-facing facade of the business',
  product_closeup: 'hero food or product close-up from the brand kitchen or table',
  night_ambiance: 'evening or night atmosphere with authentic venue lighting',
  crowd_social: 'lively dining atmosphere with guests (anonymous, no identifiable faces)',
};

const ENV_NEGATIVE_GUARDS: Record<VenueEnvironmentId, string> = {
  sea_view: 'ocean horizon, beach club, marina waterfront, seaside terrace, waves in background',
  garden: 'generic stock garden unrelated to venue (OK when gallery shows garden)',
  indoor_dining: 'unrelated restaurant interior or stock dining room',
  terrace: 'generic rooftop bar stock scene unrelated to venue',
  pool: 'pool or beach club setting when venue has no pool',
  street_storefront: 'unrelated street or storefront',
  product_closeup: 'unrelated food styling studio',
  night_ambiance: 'unrelated nightclub or stock night cityscape',
  crowd_social: 'stock party crowd unrelated to venue',
};

function buildSearchable(meta: GalleryPhotoMeta): string {
  return [
    ...(meta.contentTags ?? []),
    meta.description ?? '',
    meta.usageContext ?? '',
    meta.mood ?? '',
    ...(meta.bestFor ?? []),
    ...(meta.captionHooks ?? []),
    ...(meta.pairingKeywords ?? []),
    meta.suggestedAssetType ?? '',
  ].join(' ').toLowerCase();
}

function photoMatchesEnvironment(searchable: string, envId: VenueEnvironmentId): boolean {
  const spec = ENV_SIGNALS.find((e) => e.id === envId);
  if (!spec) return false;
  return spec.terms.some((t) => searchable.includes(t.toLowerCase()));
}

function resolveConfidence(count: number): VenueFingerprintConfidence {
  if (count >= 8) return 'high';
  if (count >= 3) return 'medium';
  return 'low';
}

/** Skip fingerprint for digital / non-venue sectors. */
export function shouldApplyVenueGalleryFingerprint(businessType?: string): boolean {
  if (!businessType?.trim()) return true;
  return !isNonVenueSectorProfile(businessType);
}

/**
 * Build a tenant-specific venue fingerprint from analyzed gallery metadata.
 */
export function buildVenueGalleryFingerprint(
  galleryMeta: Record<string, GalleryPhotoMeta>,
  businessType?: string,
): VenueGalleryFingerprint | null {
  if (!shouldApplyVenueGalleryFingerprint(businessType)) return null;

  const entries = Object.values(galleryMeta).filter(
    (m) => m && (m.contentTags?.length || m.description?.trim()),
  );
  if (!entries.length) return null;

  const counts = new Map<VenueEnvironmentId, number>();
  for (const env of ENV_SIGNALS) counts.set(env.id, 0);

  for (const meta of entries) {
    const searchable = buildSearchable(meta);
    for (const env of ENV_SIGNALS) {
      if (photoMatchesEnvironment(searchable, env.id)) {
        counts.set(env.id, (counts.get(env.id) ?? 0) + 1);
      }
    }
  }

  const analyzedPhotoCount = entries.length;
  const present: VenueEnvironmentStat[] = ENV_SIGNALS
    .map((env) => {
      const photoCount = counts.get(env.id) ?? 0;
      return {
        id: env.id,
        photoCount,
        share: photoCount / analyzedPhotoCount,
      };
    })
    .filter((s) => s.photoCount > 0)
    .sort((a, b) => b.photoCount - a.photoCount);

  const absentGuards = ENV_SIGNALS
    .map((e) => e.id)
    .filter((id) => (counts.get(id) ?? 0) === 0);

  const positiveAnchors = present
    .slice(0, 4)
    .map((s) => ENV_PROMPT_ANCHORS[s.id]);

  // Forbid environments with zero gallery evidence (strongest guard against hallucination).
  const negativeGuards = absentGuards
    .filter((id) => id !== 'product_closeup' && id !== 'crowd_social')
    .map((id) => ENV_NEGATIVE_GUARDS[id]);

  return {
    analyzedPhotoCount,
    confidence: resolveConfidence(analyzedPhotoCount),
    present,
    absentGuards,
    positiveAnchors,
    negativeGuards,
  };
}

/** Prompt block for GPT enhance / caption-driven generation. */
export function buildVenueFingerprintPromptBlock(
  fingerprint: VenueGalleryFingerprint | null | undefined,
): string {
  if (!fingerprint || fingerprint.confidence === 'low') return '';
  if (!fingerprint.positiveAnchors.length && !fingerprint.negativeGuards.length) return '';

  const lines = [
    'VENUE GALLERY FINGERPRINT (mandatory — derived from this brand\'s analyzed photo inventory):',
    `Analyzed venue photos: ${fingerprint.analyzedPhotoCount}. Real environments present: ${
      fingerprint.present.map((p) => p.id.replace(/_/g, ' ')).join(', ') || 'general venue'
    }.`,
  ];

  if (fingerprint.positiveAnchors.length) {
    lines.push(
      `Stay within these authentic settings: ${fingerprint.positiveAnchors.join('; ')}.`,
    );
  }

  if (fingerprint.negativeGuards.length) {
    lines.push(
      `FORBIDDEN (not in brand gallery — never invent): ${fingerprint.negativeGuards.join('; ')}.`,
    );
  }

  lines.push(
    'Photographer rule: improve light, mood, and composition ONLY inside the venue types proven by gallery photos — never replace with a different location archetype.',
  );

  return lines.join('\n');
}

export function metaMatchesEnvironment(
  meta: GalleryPhotoMeta | undefined,
  envId: VenueEnvironmentId,
): boolean {
  if (!meta) return false;
  return photoMatchesEnvironment(buildSearchable(meta), envId);
}
