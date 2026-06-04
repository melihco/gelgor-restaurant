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
import { isUsableGalleryPhotoUrl } from '@/lib/media-url';

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
  /**
   * Brand business type (e.g. "restaurant", "hotel", "gym", "salon").
   * Used as a soft affinity hint — photos whose tags don't fit the business
   * context receive a mild penalty so sector-irrelevant photos rank lower.
   */
  businessType?: string;
}

export interface PhotoMatchResult {
  url: string;
  score: number;
  reason: string;
  /** 0–1 confidence for UI */
  confidence: number;
}

/**
 * Minimum score to accept a match — below this, return null (never random-pick).
 * At 28, enriched tags make semantic matches reliably meaningful.
 */
export const MIN_ACCEPT_SCORE = 28;

/** Strong match — prefer these over weak fallbacks. */
export const STRONG_MATCH_SCORE = 52;

/** Relaxed threshold for manual "pick photo" when nothing clears MIN_ACCEPT. */
export const RELAXED_MATCH_SCORE = 10;

/**
 * Sprint 2 (GIS) production quality bar. Matches in [MIN_ACCEPT, PILOT_MIN) are
 * accepted but flagged "weak" — the operator should review before publishing.
 * Below MIN_ACCEPT they are rejected. This is the gate the GIS matcher-avg
 * target (58) is built around.
 */
export const GIS_PILOT_MIN_SCORE = 55;

/**
 * When true, weak matches (below GIS_PILOT_MIN_SCORE) are blocked from
 * autonomous production and require operator approval. Default false during
 * pilot so nothing silently breaks; flip on per the foundation rollout.
 */
export const BLOCK_BELOW_MIN_SCORE =
  process.env.NEXT_PUBLIC_BLOCK_WEAK_GALLERY_MATCH === 'true';

export type MatchQuality = 'strong' | 'acceptable' | 'weak' | 'rejected';

export interface MatchClassification {
  quality: MatchQuality;
  /** True when the match is good enough to use without operator review. */
  usable: boolean;
  /** True when autonomous production should pause for operator approval. */
  needsReview: boolean;
  label: string;
}

/** Maps a raw match score to a production-quality classification + UI label. */
export function classifyMatch(score: number): MatchClassification {
  if (score >= STRONG_MATCH_SCORE) {
    return { quality: 'strong', usable: true, needsReview: false, label: 'Güçlü eşleşme' };
  }
  if (score >= GIS_PILOT_MIN_SCORE) {
    return { quality: 'acceptable', usable: true, needsReview: false, label: 'Uygun eşleşme' };
  }
  if (score >= MIN_ACCEPT_SCORE) {
    return {
      quality: 'weak',
      usable: true,
      needsReview: BLOCK_BELOW_MIN_SCORE,
      label: 'Zayıf eşleşme — gözden geçirin',
    };
  }
  return { quality: 'rejected', usable: false, needsReview: true, label: 'Eşleşme yok' };
}

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

/**
 * Universal subject categories — sector-agnostic, covers any business type.
 * Each entry: [canonical, hints, bonus].
 *
 * These cover universal human activities and content themes that appear across
 * ALL sectors (restaurant, gym, salon, clinic, hotel, retail, tech, etc.).
 * Sector-specific vocabulary comes from GPT contentTags in the photo analysis.
 */
const SUBJECT_SYNONYMS: [string, string[], number][] = [
  // ── Universal human / social ─────────────────────────────────
  ['people',      ['people', 'person', 'customer', 'client', 'müşteri', 'kişi', 'happy', 'smile',
                   'laughing', 'couple', 'family', 'aile', 'team', 'ekip', 'staff', 'employee',
                   'group', 'crowd', 'social', 'gathering', 'misafir', 'guest'], 10],
  ['result',      ['result', 'before', 'after', 'transformation', 'progress', 'dönüşüm',
                   'before after', 'improvement', 'outcome', 'achievement'], 11],

  // ── Universal space / environment ────────────────────────────
  ['indoor',      ['indoor', 'interior', 'room', 'inside', 'iç', 'hall', 'salon', 'lounge',
                   'studio', 'office', 'clinic', 'store', 'shop', 'mağaza'], 8],
  ['outdoor',     ['outdoor', 'exterior', 'outside', 'dış', 'garden', 'bahçe', 'terrace',
                   'teras', 'patio', 'rooftop', 'balcony', 'park', 'street', 'plaza', 'nature'], 9],
  ['ambiance',    ['ambiance', 'atmosphere', 'vibe', 'setting', 'decor', 'aesthetic',
                   'design', 'interior design', 'modern', 'rustic', 'elegant', 'cozy', 'mekan'], 8],

  // ── Universal product / service ──────────────────────────────
  ['product',     ['product', 'item', 'ürün', 'packaging', 'display', 'shelf', 'collection',
                   'brand', 'merchandise', 'retail'], 10],
  ['service',     ['service', 'treatment', 'procedure', 'session', 'appointment', 'hizmet',
                   'care', 'consultation', 'therapy', 'application'], 10],
  ['equipment',   ['equipment', 'machine', 'device', 'tool', 'apparatus', 'instrument',
                   'ekipman', 'cihaz', 'station', 'setup', 'rig', 'gear'], 9],

  // ── Universal food & drink (broad) ──────────────────────────
  ['food',        ['food', 'yemek', 'dish', 'meal', 'plate', 'cuisine', 'recipe', 'ingredient',
                   'ingredient', 'cooking', 'prepared', 'serving', 'menu', 'menü'], 12],
  ['drink',       ['drink', 'beverage', 'içecek', 'glass', 'cup', 'bottle', 'brew',
                   'cocktail', 'coffee', 'tea', 'juice', 'smoothie', 'bar'], 12],
  ['chef',        ['chef', 'cook', 'aşçı', 'kitchen', 'mutfak', 'culinary', 'preparation',
                   'cooking', 'baking', 'pastry'], 10],

  // ── Universal event / announcement ──────────────────────────
  ['event',       ['event', 'etkinlik', 'ceremony', 'celebration', 'party', 'opening',
                   'launch', 'workshop', 'class', 'seminar', 'competition', 'show',
                   'performance', 'live', 'concert', 'festival', 'gathering'], 12],

  // ── Universal nature / environment ──────────────────────────
  ['nature',      ['nature', 'doğa', 'landscape', 'scenery', 'view', 'manzara', 'sky',
                   'sunset', 'sunrise', 'sea', 'deniz', 'mountain', 'forest', 'garden',
                   'park', 'outdoor', 'natural', 'scenics', 'scenic'], 10],
  ['light',       ['light', 'lighting', 'ışık', 'sunlight', 'golden', 'bright', 'glow',
                   'illuminated', 'shadow', 'warm light', 'ambient light'], 8],

  // ── Universal brand / identity ───────────────────────────────
  ['brand',       ['logo', 'brand', 'marka', 'sign', 'signage', 'entrance', 'facade',
                   'identity', 'label', 'packaging'], 7],
];

/**
 * Business type → preferred photo category keywords.
 * Soft signal only — boosts matching photos, penalises mismatches.
 * Keys are lowercased substrings matched against `businessType`.
 */
const BUSINESS_TYPE_AFFINITY: Array<{
  match: string[];
  prefer: string[];
  avoid: string[];
}> = [
  {
    match: ['restaurant', 'cafe', 'kahve', 'bistro', 'bakery', 'fırın', 'patisserie'],
    prefer: ['food', 'drink', 'chef', 'kitchen', 'dish', 'meal', 'cuisine', 'menu'],
    avoid: ['equipment', 'machine', 'medical', 'clinic', 'room', 'bed'],
  },
  {
    match: ['hotel', 'resort', 'otel', 'spa', 'villa', 'boutique'],
    prefer: ['room', 'lobby', 'pool', 'terrace', 'outdoor', 'interior', 'bed', 'suite'],
    avoid: ['medical', 'clinic', 'gym equipment'],
  },
  {
    match: ['event', 'etkinlik', 'entertainment', 'eğlence', 'club', 'nightlife', 'venue', 'mekan', 'show'],
    prefer: ['event', 'concert', 'performance', 'crowd', 'stage', 'people', 'celebration'],
    avoid: ['before after', 'medical', 'product shelf'],
  },
  {
    match: ['gym', 'fitness', 'spor', 'crossfit', 'pilates', 'yoga', 'studio'],
    prefer: ['equipment', 'exercise', 'workout', 'training', 'result', 'transformation', 'muscle', 'athlete'],
    avoid: ['food', 'dish', 'meal', 'menu', 'medical'],
  },
  {
    match: ['salon', 'kuaför', 'beauty', 'güzellik', 'nail', 'tırnak', 'barber', 'berber'],
    prefer: ['hair', 'makeup', 'nail', 'before after', 'result', 'treatment', 'service'],
    avoid: ['food', 'equipment machine', 'outdoor nature'],
  },
  {
    match: ['clinic', 'klinik', 'dental', 'diş', 'medical', 'tıp', 'aesthetic', 'estetik'],
    prefer: ['before after', 'result', 'treatment', 'equipment', 'clean', 'professional'],
    avoid: ['food', 'nightlife', 'crowd', 'party'],
  },
  {
    match: ['retail', 'mağaza', 'shop', 'store', 'fashion', 'moda', 'jewelry', 'takı'],
    prefer: ['product', 'collection', 'display', 'packaging', 'merchandise', 'item'],
    avoid: ['food', 'medical', 'gym equipment'],
  },
];

function resolveBusinessAffinity(businessType: string): { prefer: string[]; avoid: string[] } | null {
  const bt = businessType.toLowerCase();
  for (const rule of BUSINESS_TYPE_AFFINITY) {
    if (rule.match.some(m => bt.includes(m))) {
      return { prefer: rule.prefer, avoid: rule.avoid };
    }
  }
  return null;
}

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

/** Stop words excluded when deriving tags from description text. */
const DESCRIPTION_STOP_WORDS = new Set([
  'the','a','an','of','in','on','at','with','and','or','to','is','are','was','be','by',
  'as','that','this','from','for','it','its','has','have','been','being','can','next',
  'into','various','several','multiple','some','there','their','they','which','where',
  'while','also','very','quite','highly','more','most','two','three','four','five',
  'one','here','these','those','what','when','how','each','other','such','only','both',
  'shows','show','features','featuring','appears','visible','seen','photo','image',
  'picture','photograph','taken','captured','displayed','including','surrounded',
  // Turkish
  'bir','bu','ve','ile','için','da','de','mi','mı','mu','mü','var','çok','daha','en',
  'şu','her','ne','ama','veya','olan','üç','dört','beş',
]);

/**
 * Generic, sector-agnostic tag extraction from photo description.
 *
 * Works for ANY business type: gym, salon, restaurant, clinic, hotel, retail, etc.
 * No hardcoded sector-specific rules. Uses description text and universal activity
 * patterns as the source of truth. New tenants get correct enrichment automatically.
 *
 * Returns a partial that can be merged into GalleryPhotoMeta.
 */
export function enrichTagsFromDescription(meta: GalleryPhotoMeta): Partial<GalleryPhotoMeta> {
  if (!meta.description) return {};
  if (meta.contentTags && meta.contentTags.length > 2 && meta.bestFor && meta.bestFor.length > 0) {
    return {}; // already well-enriched by GPT analysis
  }

  const desc = meta.description;
  const descLower = desc.toLowerCase();

  // ── Step 1: Generic NLP — extract meaningful words from description as tags ──
  // No sector-specific rules. Any business type's vocabulary flows through naturally.
  const rawTokens = descLower
    .replace(/[,\.!?;:'"()\-–—\/|]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !DESCRIPTION_STOP_WORDS.has(w));

  const PURE_ADJECTIVES = new Set(['beautiful','colorful','bright','dark','large','small',
    'tall','wide','narrow','clean','dirty','old','new','big','little','many','few',
    'various','different','same','similar','specific','particular','unique','special']);
  const contentWords = rawTokens.filter(w => !PURE_ADJECTIVES.has(w));

  // Merge GPT-provided tags with description-derived words
  const existingTags = new Set(meta.contentTags ?? []);
  const allTags = new Set([...existingTags, ...contentWords.slice(0, 20)]);

  // ── Step 2: Infer bestFor from universal activity patterns ─────────────────
  // Universal patterns — apply to any sector without hardcoding domain terms
  const bestFor = new Set<string>(meta.bestFor ?? []);

  if (/person|people|customer|client|patient|student|member|visitor|guest|user|staff|team|employee|man|woman|child|couple|family|group|crowd/i.test(desc))
    { bestFor.add('social_proof'); bestFor.add('feed_post'); }
  if (/before|after|result|transformation|progress|improvement|change|difference|outcome/i.test(desc))
    { bestFor.add('before_after'); bestFor.add('customer_result'); }
  if (/product|item|packaging|display|collection|merchandise|retail|shelf/i.test(desc))
    { bestFor.add('product_highlight'); bestFor.add('feed_post'); }
  if (/treatment|procedure|session|therapy|application|service|care|consultation/i.test(desc))
    { bestFor.add('service_showcase'); bestFor.add('behind_the_scenes'); }
  if (/equipment|machine|device|tool|apparatus|instrument|gear|station|setup/i.test(desc))
    { bestFor.add('equipment_showcase'); bestFor.add('behind_the_scenes'); }
  if (/food|yemek|dish|meal|plate|cuisine|drink|beverage|içecek|coffee|kahve/i.test(desc))
    { bestFor.add('food_showcase'); bestFor.add('feed_post'); }
  if (/event|party|celebration|ceremony|opening|concert|show|performance|gathering|festival|workshop|class/i.test(desc))
    { bestFor.add('event_announcement'); bestFor.add('story_format'); }
  if (/logo|sign|brand|entrance|facade|label|signage/i.test(desc))
    { bestFor.add('brand_background'); }
  if (/outdoor|exterior|garden|terrace|patio|rooftop|nature|park|view|landscape/i.test(desc))
    { bestFor.add('venue_photo'); bestFor.add('daily_story'); }
  if (/interior|indoor|room|studio|salon|office|clinic|store|shop|facility/i.test(desc))
    { bestFor.add('venue_photo'); bestFor.add('feed_post'); }
  if (bestFor.size === 0) { bestFor.add('feed_post'); bestFor.add('daily_story'); }

  return {
    contentTags: [...allTags],
    bestFor: [...bestFor],
    usageContext: meta.usageContext || desc.slice(0, 200),
  };
}

/**
 * Apply `enrichTagsFromDescription` to every entry in a gallery analysis map.
 * Returns a new map with enriched metadata — safe to use in place of raw galleryAnalysis.
 */
export function enrichGalleryAnalysis(
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
): Record<string, GalleryPhotoMeta> {
  const enriched: Record<string, GalleryPhotoMeta> = {};
  for (const [url, meta] of Object.entries(galleryAnalysis)) {
    const patch = enrichTagsFromDescription(meta);
    enriched[url] = Object.keys(patch).length > 0 ? { ...meta, ...patch } : meta;
  }
  return enriched;
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

  // ── Universal subject category boosts ─────────────────────────────────
  // SUBJECT_SYNONYMS are now universal cross-sector categories (people, food,
  // product, service, event, space, brand) — no sector-specific hardcoding.
  for (const [, hints, bonus] of SUBJECT_SYNONYMS) {
    const captionHit = hints.some(h => text.includes(h));
    const photoHit = hints.some(h => searchable.includes(h));
    if (captionHit && photoHit) {
      score += bonus;
      reasons.push(`subject:${hints[0]}`);
    }
  }

  // ── Description-boosted token overlap (sector-agnostic primary signal) ─
  // The description from GPT is the richest, most accurate representation of
  // what the photo shows. Token overlap between caption and description gives
  // reliable signal for any sector without any hardcoded vocabulary.
  const descriptionText = (meta.description ?? '').toLowerCase();
  const contentTagsText = (meta.contentTags ?? []).join(' ').toLowerCase();
  const captionWords = tokenize(caption);

  let descHits = 0;
  let tagHits = 0;
  for (const w of captionWords) {
    if (descriptionText.includes(w)) { score += 5; descHits++; }
    else if (contentTagsText.includes(w)) { score += 4; tagHits++; }
    else if (searchable.includes(w)) { score += 2; }
  }
  // Also score bidirectionally: description words found in caption
  const descWords = tokenize(meta.description ?? '');
  let biHits = 0;
  for (const w of descWords) {
    if (text.includes(w) && !captionWords.includes(w)) { score += 3; biHits++; }
  }
  const totalTokenHits = descHits + tagHits + biHits;
  if (totalTokenHits >= 2) reasons.push(`desc:${descHits}+tag:${tagHits}+bi:${biHits} hits`);

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
  // ── Logo / brand background penalty (universal) ──────────────────────────
  const assetType = (meta.suggestedAssetType ?? '').toLowerCase();
  if (meta.isLogo || assetType.includes('logo') || assetType.includes('brand_background')) {
    const brandMention = /logo|marka|branding|identity|brand/i.test(text);
    if (!brandMention) {
      score -= 30;
      reasons.push('logo/background penalty');
    }
  }

  // ── Asset type match bonus (universal — any sector) ───────────────────────
  // Match based on GPT-provided suggestedAssetType, not hardcoded sectors.
  // Works for gym (equipment_photo), salon (service_photo), clinic (before_after), etc.
  if (assetType && captionWords.length > 0) {
    const assetWords = tokenize(assetType.replace(/_/g, ' '));
    if (assetWords.some(w => text.includes(w))) {
      score += 6;
      reasons.push('asset type match');
    }
  }

  // ── Template use case hint ───────────────────────────────────────────────
  const tpl = (input.templateUseCase ?? '').toLowerCase();
  if (tpl && bestFor.some(b => tpl.includes(b) || b.includes(tpl))) {
    score += 5;
  }

  // ── Business type affinity (soft signal) ─────────────────────────────────
  // Boost photos whose tags align with the brand's business type; penalise
  // clearly mismatched photos (e.g. a gym equipment photo for a restaurant).
  // This only matters when caption semantics alone don't disambiguate well.
  if (input.businessType) {
    const affinity = resolveBusinessAffinity(input.businessType);
    if (affinity) {
      const photoText = searchable;
      const preferHit = affinity.prefer.some(p => photoText.includes(p));
      const avoidHit = affinity.avoid.some(a => photoText.includes(a));
      if (preferHit) { score += 12; reasons.push(`businessType prefer`); }
      if (avoidHit && !preferHit) { score -= 18; reasons.push(`businessType mismatch`); }
    }
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
  const usableCandidates = candidateUrls.filter(isUsableGalleryPhotoUrl);
  const excludeBases = new Set((options?.excludeUrls ?? []).map(normalizeGalleryUrl));
  const lookup = buildGalleryLookup(galleryAnalysis, options?.displayUrls ?? usableCandidates);
  const minScore = options?.minScore ?? MIN_ACCEPT_SCORE;

  const ranked = rankPhotosForContent(
    input,
    usableCandidates,
    lookup,
    excludeBases,
    galleryAnalysis,
  );
  const best = ranked[0];
  if (best && best.score >= minScore) return best;

  if (options?.bestEffort) {
    if (best && best.score >= RELAXED_MATCH_SCORE) return best;
    const fallbackUrl = usableCandidates.find(u => !excludeBases.has(normalizeGalleryUrl(u)));
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

  if (!agentUrl || !isUsableGalleryPhotoUrl(agentUrl)) return best;

  const agentInPool = candidateUrls.some(
    (u) => normalizeGalleryUrl(u) === normalizeGalleryUrl(agentUrl),
  );
  if (!agentInPool) return best;

  const agentBase = normalizeGalleryUrl(agentUrl);
  const bestBase = normalizeGalleryUrl(best.url);
  if (agentBase === bestBase) return { ...best, url: agentUrl };

  const agentRank = matchPhotoToContent(input, [agentUrl], galleryAnalysis, {
    ...options,
    minScore: 0,
  });
  // Trust the agent's pick if it passes the minimum bar and isn't dramatically worse
  // than the algorithmic best. The LLM has full semantic context at ideation time,
  // while the algorithmic scorer only has keyword overlap. Window widened to 22 pts.
  if (
    agentRank
    && agentRank.score >= minScore
    && agentRank.score >= best.score - 22
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
