/**
 * Deterministic caption ↔ gallery photo matching.
 *
 * Single source of truth for MissionContentFactory, AutoProductionFeed,
 * auto-produce, and /api/match-gallery-photo.
 *
 * Design:
 *  - Score every candidate photo against caption/headline (bilingual keywords)
 *  - Reject weak matches below MIN_ACCEPT_SCORE (no random rotation)
 *  - Batch assignPhotos() ensures one photo per idea when pool allows
 *  - URL keys normalized (gallery analysis originals vs upscaled display URLs)
 */

import { normalizeGalleryUrl } from '@/lib/gallery-usage-tracker';

export interface GalleryPhotoMeta {
  contentTags?: string[];
  description?: string;
  usageContext?: string;
  mood?: string;
  bestFor?: string[];
  notGoodFor?: string[];
  suggestedAssetType?: string;
  isLogo?: boolean;
}

export interface MatchPhotoInput {
  caption: string;
  headline?: string;
  mood?: string;
  contentType?: string;
  visualDirection?: string;
  templateUseCase?: string;
  strategicPurpose?: string;
}

export interface PhotoMatchResult {
  url: string;
  score: number;
  reason: string;
  /** 0–1 confidence for UI */
  confidence: number;
}

/** Minimum score to accept a match — below this, return null (never random-pick). */
export const MIN_ACCEPT_SCORE = 42;

/** Strong match — prefer these over weak fallbacks. */
export const STRONG_MATCH_SCORE = 58;

/** Relaxed threshold for manual "pick photo" when nothing clears MIN_ACCEPT. */
export const RELAXED_MATCH_SCORE = 12;

/** Stable media id across CDN resize variants (Wix, Cloudinary, R2, etc.). */
export function galleryMediaFingerprint(url: string): string {
  const normalized = normalizeGalleryUrl(url).toLowerCase();

  const wix = normalized.match(/\/media\/([^/?#]+)/i);
  if (wix?.[1]) return `wix:${wix[1]}`;

  const cloud = normalized.match(/\/upload\/(?:[^/]+\/)*(.+)$/i);
  if (cloud?.[1]) {
    const tail = cloud[1].replace(/\.(jpe?g|png|webp|avif|gif)$/i, '');
    if (tail.length > 4) return `cdn:${tail.slice(-80)}`;
  }

  const file = normalized.match(/\/([^/?#]+\.(?:jpe?g|png|webp|avif|gif))(?:\?|$)/i);
  if (file?.[1]) return `file:${file[1]}`;

  const segments = normalized.split('/').filter(Boolean);
  return `path:${segments.slice(-2).join('/')}`;
}

function scoreUrlPath(url: string, input: MatchPhotoInput): number {
  const path = normalizeGalleryUrl(url).toLowerCase();
  const text = [input.headline, input.caption, input.visualDirection, input.strategicPurpose]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  let score = 0;
  for (const [, hints, bonus] of SUBJECT_SYNONYMS) {
    const captionHit = hints.some(h => text.includes(h));
    const pathHit = hints.some(h => path.includes(h.replace(/\s+/g, '')) || path.includes(h.replace(/\s+/g, '_')));
    if (captionHit && pathHit) score += Math.max(4, Math.floor(bonus / 2));
  }
  for (const w of tokenize(text)) {
    if (path.includes(w)) score += 2;
  }
  return score;
}

function resolveLookupEntry(
  url: string,
  lookup: Map<string, GalleryLookupEntry>,
  fingerprintIndex: Map<string, GalleryLookupEntry>,
): GalleryLookupEntry | undefined {
  const base = normalizeGalleryUrl(url);
  const direct = lookup.get(base);
  if (direct) return { ...direct, displayUrl: url };

  const fp = galleryMediaFingerprint(url);
  const byFp = fingerprintIndex.get(fp);
  if (byFp) return { ...byFp, displayUrl: url };

  for (const [key, entry] of lookup) {
    if (base.includes(key) || key.includes(base)) {
      return { ...entry, displayUrl: url };
    }
    if (galleryMediaFingerprint(key) === fp) {
      return { ...entry, displayUrl: url };
    }
  }
  return undefined;
}

const STOP_WORDS = new Set([
  'bir', 'bu', 've', 'ile', 'için', 'da', 'de', 'mi', 'mı', 'mu', 'mü',
  'the', 'a', 'an', 'of', 'in', 'for', 'and', 'to', 'with', 'your', 'our',
  'instagram', 'post', 'story', 'reel', 'carousel', 'hashtag', 'hashtags',
  'follow', 'like', 'share', 'comment', 'link', 'bio', 'tag', 'tags',
]);

/** Caption keyword → photo tag/description hints (TR + EN) */
const SUBJECT_SYNONYMS: [string, string[], number][] = [
  ['sunset', ['sunset', 'gün batımı', 'golden hour', 'dusk', 'evening sky'], 12],
  ['sunrise', ['sunrise', 'gün doğumu', 'dawn', 'morning light'], 12],
  ['beach', ['beach', 'plaj', 'shore', 'sahil', 'kumsal', 'seaside'], 11],
  ['sea', ['sea', 'deniz', 'ocean', 'water', 'marina', 'yacht', 'tekne'], 10],
  ['pool', ['pool', 'havuz', 'swimming', 'yüzme'], 10],
  ['food', ['food', 'yemek', 'dish', 'plate', 'cuisine', 'mutfak', 'chef'], 11],
  ['menu', ['menu', 'menü', 'dish', 'course', 'plate', 'servis'], 10],
  ['drink', ['drink', 'içecek', 'cocktail', 'kokteyl', 'bar', 'beverage', 'glass'], 11],
  ['coffee', ['coffee', 'kahve', 'espresso', 'latte', 'cafe'], 10],
  ['wine', ['wine', 'şarap', 'vineyard', 'sommelier'], 10],
  ['breakfast', ['breakfast', 'kahvaltı', 'brunch', 'morning meal'], 10],
  ['dinner', ['dinner', 'akşam yemeği', 'dining', 'restaurant table'], 10],
  ['event', ['event', 'etkinlik', 'party', 'dj', 'live music', 'konser', 'canlı'], 11],
  ['music', ['music', 'müzik', 'dj', 'band', 'concert', 'party'], 9],
  ['terrace', ['terrace', 'teras', 'rooftop', 'outdoor dining', 'açık hava'], 10],
  ['view', ['view', 'manzara', 'panorama', 'vista', 'landscape'], 9],
  ['night', ['night', 'gece', 'evening', 'neon', 'lights', 'ışık'], 9],
  ['sun', ['sun', 'güneş', 'sunny', 'bright'], 8],
  ['sustainable', ['sustainable', 'sürdürülebilir', 'eco', 'organic', 'local', 'farmer'], 10],
  ['seafood', ['seafood', 'deniz ürün', 'fish', 'balık', 'shrimp', 'karides'], 11],
  ['kitchen', ['kitchen', 'mutfak', 'chef', 'şef', 'preparation', 'cooking'], 10],
  ['testimonial', ['guest', 'misafir', 'customer', 'review', 'smile', 'dining'], 8],
  ['ambiance', ['ambiance', 'atmosphere', 'ambience', 'vibe', 'mood', 'interior', 'venue'], 8],
  ['windsurf', ['windsurf', 'surf', 'water sport', 'sport', 'rüzgar sörf'], 12],
  ['sunbed', ['sunbed', 'umbrella', 'beach club', 'lounge', 'şezlong'], 9],
  ['sunset dinner', ['sunset dinner', 'beach dining', 'dining by the sea'], 12],
];

const MOOD_ALIGN: Record<string, string[]> = {
  energetic: ['energetic', 'vibrant', 'festive', 'lively', 'dynamic'],
  romantic: ['romantic', 'elegant', 'warm', 'intimate', 'soft'],
  elegant: ['elegant', 'luxurious', 'sophisticated', 'premium'],
  warm: ['warm', 'cozy', 'inviting', 'golden'],
  cool: ['cool', 'fresh', 'crisp', 'minimal'],
  dramatic: ['dramatic', 'moody', 'cinematic'],
  minimal: ['minimal', 'clean', 'simple'],
  festive: ['festive', 'celebration', 'party'],
  professional: ['professional', 'clinical', 'corporate'],
};

export interface GalleryLookupEntry {
  /** URL to use in UI / production (may be upscaled) */
  displayUrl: string;
  /** Original analysis key */
  analysisKey: string;
  meta: GalleryPhotoMeta;
}

/** Build base-url → analysis lookup; optional display URL map from brand ref images. */
export function buildGalleryLookup(
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
  displayUrls: string[] = [],
): Map<string, GalleryLookupEntry> {
  const lookup = new Map<string, GalleryLookupEntry>();
  const fingerprintIndex = new Map<string, GalleryLookupEntry>();

  for (const [analysisKey, meta] of Object.entries(galleryAnalysis)) {
    const base = normalizeGalleryUrl(analysisKey);
    const entry: GalleryLookupEntry = { displayUrl: analysisKey, analysisKey, meta };
    lookup.set(base, entry);
    fingerprintIndex.set(galleryMediaFingerprint(analysisKey), entry);
  }

  for (const displayUrl of displayUrls) {
    const resolved = resolveLookupEntry(displayUrl, lookup, fingerprintIndex);
    if (resolved) {
      lookup.set(normalizeGalleryUrl(displayUrl), resolved);
    }
  }

  return lookup;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[#@]/g, ' ')
    .split(/[\s,,.!?;:()\-–—/|]+/)
    .map(w => w.trim())
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function buildSearchable(meta: GalleryPhotoMeta): string {
  return [
    ...(meta.contentTags ?? []),
    meta.description ?? '',
    meta.usageContext ?? '',
    meta.mood ?? '',
    ...(meta.bestFor ?? []),
  ].join(' ').toLowerCase();
}

function scorePhotoForContent(
  meta: GalleryPhotoMeta,
  input: MatchPhotoInput,
): { score: number; reasons: string[] } {
  const caption = [input.headline, input.caption, input.visualDirection, input.strategicPurpose]
    .filter(Boolean)
    .join(' ');
  const text = caption.toLowerCase();
  const searchable = buildSearchable(meta);
  const reasons: string[] = [];
  let score = 0;

  // ── Subject synonym boosts ─────────────────────────────────────────────
  for (const [, hints, bonus] of SUBJECT_SYNONYMS) {
    const captionHit = hints.some(h => text.includes(h));
    const photoHit = hints.some(h => searchable.includes(h));
    if (captionHit && photoHit) {
      score += bonus;
      reasons.push(`subject:${hints[0]}`);
    }
  }

  // ── Token overlap ──────────────────────────────────────────────────────
  const words = tokenize(caption);
  let tokenHits = 0;
  for (const w of words) {
    if (searchable.includes(w)) {
      score += 4;
      tokenHits++;
    }
  }
  if (tokenHits >= 3) reasons.push(`${tokenHits} keyword hits`);

  // ── Mood alignment ─────────────────────────────────────────────────────
  const desiredMood = (input.mood ?? '').toLowerCase();
  const photoMood = (meta.mood ?? '').toLowerCase();
  if (desiredMood && photoMood) {
    for (const [mood, aliases] of Object.entries(MOOD_ALIGN)) {
      if (
        (desiredMood.includes(mood) || aliases.some(a => text.includes(a)))
        && (photoMood.includes(mood) || aliases.some(a => photoMood.includes(a)))
      ) {
        score += 8;
        reasons.push(`mood:${mood}`);
        break;
      }
    }
  }

  // ── Content type / bestFor fit ─────────────────────────────────────────
  const ct = (input.contentType ?? 'post').toLowerCase();
  const bestFor = (meta.bestFor ?? []).map(b => b.toLowerCase());
  const notGoodFor = (meta.notGoodFor ?? []).map(b => b.toLowerCase());

  if (notGoodFor.some(n => ct.includes(n) || n.includes(ct))) {
    score -= 25;
    reasons.push('notGoodFor penalty');
  }
  if (bestFor.some(b => ct.includes(b) || b.includes(ct.replace('instagram_', '')))) {
    score += 6;
    reasons.push('bestFor fit');
  }

  // ── Asset type penalties ─────────────────────────────────────────────────
  const assetType = (meta.suggestedAssetType ?? '').toLowerCase();
  if (meta.isLogo || assetType.includes('logo') || assetType.includes('brand_background')) {
    const brandMention = /logo|marka|branding|identity/i.test(text);
    if (!brandMention) {
      score -= 30;
      reasons.push('logo/background penalty');
    }
  }
  if (assetType.includes('food_drink') && /yemek|food|menu|dish|içecek|drink|cocktail|seafood|balık/i.test(text)) {
    score += 8;
  }
  if (assetType.includes('event') && /event|etkinlik|dj|party|konser|live/i.test(text)) {
    score += 8;
  }
  if (assetType.includes('venue') || assetType.includes('hero')) {
    if (/view|manzara|sunset|beach|plaj|terrace|ambiance|atmosphere|venue|mekan/i.test(text)) {
      score += 6;
    }
  }

  // ── Template use case hint ───────────────────────────────────────────────
  const tpl = (input.templateUseCase ?? '').toLowerCase();
  if (tpl && bestFor.some(b => tpl.includes(b) || b.includes(tpl))) {
    score += 5;
  }

  return { score: Math.max(0, score), reasons };
}

export function rankPhotosForContent(
  input: MatchPhotoInput,
  candidateUrls: string[],
  lookup: Map<string, GalleryLookupEntry>,
  excludeBases: Set<string> = new Set(),
  galleryAnalysis: Record<string, GalleryPhotoMeta> = {},
): PhotoMatchResult[] {
  const fingerprintIndex = new Map<string, GalleryLookupEntry>();
  for (const [key, entry] of lookup) {
    fingerprintIndex.set(galleryMediaFingerprint(key), entry);
  }
  if (Object.keys(galleryAnalysis).length > 0) {
    for (const [analysisKey, meta] of Object.entries(galleryAnalysis)) {
      const fp = galleryMediaFingerprint(analysisKey);
      if (!fingerprintIndex.has(fp)) {
        fingerprintIndex.set(fp, {
          displayUrl: analysisKey,
          analysisKey,
          meta,
        });
      }
    }
  }

  const results: PhotoMatchResult[] = [];

  for (const url of candidateUrls) {
    const base = normalizeGalleryUrl(url);
    if (excludeBases.has(base)) continue;

    const entry = resolveLookupEntry(url, lookup, fingerprintIndex);
    const meta = entry?.meta ?? {};
    const { score, reasons } = scorePhotoForContent(meta, input);
    const pathScore = scoreUrlPath(url, input);
    const totalScore = score + pathScore;

    if (totalScore <= 0 && !entry) continue;

    results.push({
      url: entry?.displayUrl ?? url,
      score: totalScore,
      reason: reasons.slice(0, 3).join(', ') || (pathScore > 0 ? 'url path match' : 'gallery pool'),
      confidence: Math.min(1, totalScore / 80),
    });
  }

  return results.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
}

/**
 * Like rankPhotosForContent but with a stable tie-break seed so equal-scored
 * photos are NOT always returned in the same alphabetical order.
 * Use `seed` (e.g. idea index) to produce a different order per idea.
 */
export function rankPhotosForContentSeeded(
  input: MatchPhotoInput,
  candidateUrls: string[],
  lookup: Map<string, GalleryLookupEntry>,
  seed: number = 0,
  excludeBases: Set<string> = new Set(),
  galleryAnalysis: Record<string, GalleryPhotoMeta> = {},
): PhotoMatchResult[] {
  const ranked = rankPhotosForContent(input, candidateUrls, lookup, excludeBases, galleryAnalysis);
  // Within each score bucket, shuffle deterministically based on seed
  const buckets = new Map<number, PhotoMatchResult[]>();
  for (const r of ranked) {
    const bucket = buckets.get(r.score) ?? [];
    bucket.push(r);
    buckets.set(r.score, bucket);
  }
  const result: PhotoMatchResult[] = [];
  for (const [, bucket] of [...buckets.entries()].sort((a, b) => b[0] - a[0])) {
    if (bucket.length > 1) {
      // Deterministic Fisher-Yates with seed
      const arr = [...bucket];
      let s = seed + arr.length;
      for (let i = arr.length - 1; i > 0; i--) {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        const j = Math.abs(s) % (i + 1);
        [arr[i], arr[j]] = [arr[j]!, arr[i]!];
      }
      result.push(...arr);
    } else {
      result.push(...bucket);
    }
  }
  return result;
}

/** Pick the single best photo for one caption. Returns null if no acceptable match. */
export function matchPhotoToContent(
  input: MatchPhotoInput,
  candidateUrls: string[],
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
  options?: {
    excludeUrls?: string[];
    displayUrls?: string[];
    minScore?: number;
    /** Manual pick: return best available even below minScore; never random. */
    bestEffort?: boolean;
  },
): PhotoMatchResult | null {
  const excludeBases = new Set((options?.excludeUrls ?? []).map(normalizeGalleryUrl));
  const lookup = buildGalleryLookup(galleryAnalysis, options?.displayUrls ?? candidateUrls);
  const minScore = options?.minScore ?? MIN_ACCEPT_SCORE;

  const ranked = rankPhotosForContent(
    input,
    candidateUrls,
    lookup,
    excludeBases,
    galleryAnalysis,
  );
  const best = ranked[0];
  if (best && best.score >= minScore) return best;

  if (options?.bestEffort) {
    if (best && best.score >= RELAXED_MATCH_SCORE) return best;
    const fallbackUrl = candidateUrls.find(u => !excludeBases.has(normalizeGalleryUrl(u)));
    if (fallbackUrl) {
      return {
        url: fallbackUrl,
        score: best?.score ?? 0,
        reason: best?.reason ?? 'gallery pool',
        confidence: best?.confidence ?? 0.1,
      };
    }
  }

  return null;
}

/** Greedy 1:1 assignment across multiple ideas — avoids reusing photos in one batch. */
export function assignPhotosToContents(
  items: Array<{ key: string; input: MatchPhotoInput }>,
  candidateUrls: string[],
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
  options?: {
    excludeUrls?: string[];
    displayUrls?: string[];
    minScore?: number;
  },
): Map<string, PhotoMatchResult | null> {
  const excludeBases = new Set((options?.excludeUrls ?? []).map(normalizeGalleryUrl));
  const lookup = buildGalleryLookup(galleryAnalysis, options?.displayUrls ?? candidateUrls);
  const minScore = options?.minScore ?? MIN_ACCEPT_SCORE;
  const assigned = new Map<string, PhotoMatchResult | null>();
  const usedBases = new Set(excludeBases);

  for (const { key, input } of items) {
    const ranked = rankPhotosForContent(input, candidateUrls, lookup, usedBases, galleryAnalysis);
    const best = ranked[0];
    if (best && best.score >= minScore) {
      assigned.set(key, best);
      usedBases.add(normalizeGalleryUrl(best.url));
    } else {
      assigned.set(key, null);
    }
  }

  return assigned;
}

/** Resolve agent-suggested URL vs best semantic match — agent wins only if score is close enough. */
export function resolveBestGalleryUrl(
  input: MatchPhotoInput,
  candidateUrls: string[],
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
  agentUrl: string | null | undefined,
  options?: {
    excludeUrls?: string[];
    displayUrls?: string[];
    minScore?: number;
  },
): PhotoMatchResult | null {
  const minScore = options?.minScore ?? MIN_ACCEPT_SCORE;
  const best = matchPhotoToContent(input, candidateUrls, galleryAnalysis, {
    ...options,
    minScore,
  });
  if (!best) return null;
  if (!agentUrl) return best;

  const agentBase = normalizeGalleryUrl(agentUrl);
  const bestBase = normalizeGalleryUrl(best.url);
  if (agentBase === bestBase) return { ...best, url: agentUrl };

  const agentRank = matchPhotoToContent(input, [agentUrl], galleryAnalysis, {
    ...options,
    minScore: 0,
  });
  if (
    agentRank
    && agentRank.score >= minScore
    && agentRank.score >= best.score - 12
  ) {
    return { ...agentRank, url: agentUrl };
  }
  return best;
}

/** Resolve LLM/API returned URL back to a URL in the candidate pool. */
export function resolveUrlInPool(returnedUrl: string, candidateUrls: string[]): string | null {
  const base = normalizeGalleryUrl(returnedUrl);
  for (const u of candidateUrls) {
    if (normalizeGalleryUrl(u) === base) return u;
  }
  for (const u of candidateUrls) {
    const ub = normalizeGalleryUrl(u);
    if (ub.includes(base) || base.includes(ub)) return u;
  }
  return null;
}
