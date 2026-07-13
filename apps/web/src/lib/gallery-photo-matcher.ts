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

import {
  buildGalleryPhotoSearchable,
  captionPhotoConflictPenalty,
  captionRequiresStrictGalleryMatch,
  isHardCaptionPhotoConflict,
} from '@/lib/caption-photo-alignment';
import { normalizeGalleryUrl, GALLERY_USAGE_COUNT_PENALTY, getGlobalGalleryUsageCount, type PostTypeBucket } from '@/lib/gallery-usage-tracker';
import { isUsableGalleryPhotoUrl } from '@/lib/media-url';
import { resolveAssetRolePreferences } from '@/lib/sector-premium-presets';

export interface GalleryPhotoMeta {
  contentTags?: string[];
  description?: string;
  usageContext?: string;
  mood?: string;
  bestFor?: string[];
  notGoodFor?: string[];
  suggestedAssetType?: string;
  isLogo?: boolean;
  hasPeople?: boolean;
  hasText?: boolean;
  captionHooks?: string[];
  pairingKeywords?: string[];
  qualityScore?: number | null;
  analyzedAt?: string | null;
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
  /**
   * Story sequence role ('hook' | 'proof' | 'cta').
   * When provided, photos matching the role's preferred asset types receive
   * a bonus so hook → atmospheric/wide, proof → detail/process, cta → outcome.
   */
  storySequenceRole?: 'hook' | 'proof' | 'cta';
  /** Cross-type gallery usage — penalize over-used photos to spread diversity. */
  globalUsageCounts?: ReadonlyMap<string, number>;
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

/**
 * Yerel üretici / gıda mağazası SKU sözlüğü.
 * Caption ↔ galeri eşleşmesi, çapraz ürün cezası ve vision tag zenginleştirmede ortak kaynak.
 */
export const LOCAL_PRODUCT_SKU_CLUSTERS: ReadonlyArray<{
  id: string;
  terms: readonly string[];
}> = [
  { id: 'badem', terms: ['badem', 'almond', 'badam', 'bademli', 'badem ezmesi', 'badem ezme', 'almond butter', 'almond paste', 'roasted almond', 'kavrulmuş badem', 'kavrulmus badem', 'çiğ badem', 'cig badem', 'badem şöleni', 'badem soleni'] },
  { id: 'nane', terms: ['nane', 'mint', 'kuru nane', 'dry mint', 'nanə', 'nane yaprağı', 'nane yapragi', 'spearmint', 'peppermint', 'dried mint leaves'] },
  { id: 'zeytinyağı', terms: ['zeytinyağı', 'zeytinyagi', 'zeytin yagi', 'zeytin yağı', 'olive oil', 'extra virgin', 'sızma', 'sizma', 'naturel sızma', 'erken hasat', 'cold pressed olive'] },
  { id: 'zeytin', terms: ['zeytin', 'olive', 'siyah zeytin', 'yeşil zeytin', 'yesil zeytin', 'green olive', 'black olive'] },
  { id: 'reçel', terms: ['reçel', 'recel', 'jam', 'marmalade', 'confiture', 'incir reçeli', 'incir receli', 'ayva reçeli', 'ayva receli', 'çilek reçeli', 'cilek receli', 'portakal reçeli', 'vişne reçeli', 'visne receli', 'gül reçeli', 'gul receli'] },
  { id: 'bal', terms: ['bal', 'honey', 'petek', 'petek bal', 'comb honey', 'süzme bal', 'suzme bal', 'çiçek balı', 'cicek bali', 'keçiboynuzu balı', 'keciboynuzu bali'] },
  { id: 'pekmez', terms: ['pekmez', 'molasses', 'üzüm pekmezi', 'uzum pekmezi', 'dut pekmezi', 'carob molasses', 'keçiboynuzu pekmezi', 'keciboynuzu pekmezi', 'tahin pekmez'] },
  { id: 'incir', terms: ['incir', 'fig', 'kuru incir', 'dried fig', 'fig jam', 'taze incir'] },
  { id: 'kayısı', terms: ['kayısı', 'kayisi', 'apricot', 'kuru kayısı', 'kuru kayisi', 'dried apricot', 'malatya kayısı'] },
  { id: 'ceviz', terms: ['ceviz', 'walnut', 'ceviz içi', 'ceviz ici', 'walnut kernel', 'kırık ceviz', 'kirik ceviz'] },
  { id: 'fındık', terms: ['fındık', 'findik', 'hazelnut', 'kavrulmuş fındık', 'kavrulmus findik', 'fındık ezmesi', 'findik ezmesi'] },
  { id: 'fıstık', terms: ['fıstık', 'fistik', 'pistachio', 'antep fıstığı', 'antep fistigi', 'roasted pistachio'] },
  { id: 'kaju', terms: ['kaju', 'cashew', 'kaju fıstığı', 'kaju fistigi'] },
  { id: 'leblebi', terms: ['leblebi', 'roasted chickpea', 'sarı leblebi', 'sari leblebi', 'çifte kavrulmuş', 'cifte kavrulmus'] },
  { id: 'turşu', terms: ['turşu', 'tursu', 'pickle', 'pickled', 'salatalık turşusu', 'salatalik tursusu', 'biber turşusu', 'lahana turşusu'] },
  { id: 'salça', terms: ['salça', 'salca', 'tomato paste', 'domates salçası', 'domates salcasi', 'biber salçası', 'biber salcasi'] },
  { id: 'domates', terms: ['domates', 'tomato', 'domates kurusu', 'sun dried tomato', 'kurutulmuş domates', 'kurutulmus domates'] },
  { id: 'biber', terms: ['biber', 'pepper', 'pul biber', 'isot', 'urfa biber', 'kırmızı biber', 'kirmizi biber', 'chili flake', 'acı biber', 'aci biber'] },
  { id: 'sumak', terms: ['sumak', 'sumac', 'ground sumac'] },
  { id: 'tarçın', terms: ['tarçın', 'tarcin', 'cinnamon', 'cinnamon stick', 'tarçın çubuk'] },
  { id: 'kekik', terms: ['kekik', 'thyme', 'kuru kekik', 'dried thyme', 'wild thyme', 'dağ kekiği', 'dag kekigi'] },
  { id: 'biberiye', terms: ['biberiye', 'rosemary', 'kuru biberiye'] },
  { id: 'defne', terms: ['defne', 'defne yaprağı', 'defne yapragi', 'bay leaf', 'laurel leaf', 'dried bay'] },
  { id: 'kimyon', terms: ['kimyon', 'cumin', 'ground cumin'] },
  { id: 'zencefil', terms: ['zencefil', 'ginger', 'ground ginger', 'taze zencefil'] },
  { id: 'zerdeçal', terms: ['zerdeçal', 'zerdecal', 'turmeric', 'curcuma'] },
  { id: 'tahin', terms: ['tahin', 'tahini', 'sesame paste', 'susam ezmesi'] },
  { id: 'peynir', terms: ['peynir', 'cheese', 'tulum peynir', 'tulum peyniri', 'kaşar', 'kasar', 'lor peynir', 'ezine peyniri', 'yöresel peynir', 'yoresel peynir'] },
  { id: 'tereyağı', terms: ['tereyağı', 'tereyagi', 'butter', 'sade yağ', 'sade yag', 'clarified butter'] },
  { id: 'tarhana', terms: ['tarhana', 'tarhana çorbası', 'tarhana corbasi', 'homemade tarhana'] },
  { id: 'erişte', terms: ['erişte', 'eriste', 'homemade pasta', 'el yapımı erişte', 'handmade noodle'] },
  { id: 'ekmek', terms: ['ekmek', 'bread', 'köy ekmeği', 'koy eknegi', 'sourdough', 'artisan bread'] },
  { id: 'çay', terms: ['çay', 'cay', 'tea', 'black tea', 'bitki çayı', 'bitki cayi', 'herbal tea', 'adaçayı', 'adacayi', 'ihlamur', 'papatya çayı'] },
  { id: 'kahve', terms: ['kahve', 'coffee', 'turk kahvesi', 'türk kahvesi', 'ground coffee', 'filtre kahve'] },
  { id: 'dut', terms: ['dut', 'mulberry', 'dut kurusu', 'white mulberry', 'dried mulberry'] },
  { id: 'üzüm', terms: ['üzüm', 'uzum', 'grape', 'kuru üzüm', 'kuru uzum', 'raisin', 'sultana'] },
  { id: 'elma', terms: ['elma', 'apple', 'elma kurusu', 'dried apple ring', 'apple chip'] },
  { id: 'ayva', terms: ['ayva', 'quince', 'ayva reçeli', 'quince jam'] },
  { id: 'portakal', terms: ['portakal', 'orange', 'turunç', 'turunc', 'mandalina', 'mandarin'] },
  { id: 'limon', terms: ['limon', 'lemon', 'limon kabuğu', 'limon kabugu', 'citrus zest'] },
  { id: 'nar', terms: ['nar', 'pomegranate', 'nar ekşisi', 'nar eksisi', 'pomegranate molasses'] },
  { id: 'sucuk', terms: ['sucuk', 'sausage', 'garlic sausage', 'fermented sausage'] },
  { id: 'pastırma', terms: ['pastırma', 'pastirma', 'cured beef', 'basturma'] },
  { id: 'zeytin_ezmesi', terms: ['zeytin ezmesi', 'zeytin ezme', 'olive tapenade', 'olive spread'] },
  { id: 'ot', terms: ['kuru ot', 'dried herb', 'dağ otu', 'dag otu', 'wild herb', 'foraged herb', 'mixed herbs'] },
  { id: 'çam_kozalağı', terms: ['çam kozalağı', 'cam kozalagi', 'çam kozalak', 'cam kozalak', 'pine cone', 'pine cone extract', 'çam kozalak özü', 'cam kozalak ozu', 'kozalak', 'çam balı', 'cam bali', 'pine honey'] },
  { id: 'keçiboynuzu', terms: ['keçiboynuzu', 'keciboynuzu', 'carob', 'harnup', 'keçiboynuzu özü', 'keciboynuzu ozu', 'keçiboynuzu pekmezi', 'carob syrup', 'carob extract', 'keçiboynuzu tozu', 'carob powder'] },
  { id: 'lavanta', terms: ['lavanta', 'lavender', 'lavanta yağı', 'lavanta yagi', 'lavender oil', 'lavanta çiçeği', 'lavanta sabunu', 'lavender soap', 'lavanta şurubu'] },
  { id: 'propolis', terms: ['propolis', 'arı sütü', 'ari sutu', 'royal jelly', 'arı poleni', 'ari poleni', 'bee pollen', 'arı ürünü', 'ari urunu'] },
  { id: 'susam', terms: ['susam', 'sesame', 'susam yağı', 'susam yagi', 'sesame oil', 'siyah susam', 'black sesame', 'susam kraker'] },
  { id: 'kurutulmuş_meyve', terms: ['kurutulmuş meyve', 'kurutulmus meyve', 'dried fruit', 'kuru meyve', 'fruit chips', 'meyve cipsi', 'meyve kurusu'] },
  { id: 'macun', terms: ['macun', 'mesir macunu', 'paste', 'bitkisel macun', 'herbal paste', 'karışım macun', 'karisim macun'] },
  { id: 'sirke', terms: ['sirke', 'vinegar', 'elma sirkesi', 'apple cider vinegar', 'üzüm sirkesi', 'uzum sirkesi', 'nar sirkesi', 'grape vinegar'] },
  { id: 'sabun', terms: ['sabun', 'soap', 'doğal sabun', 'dogal sabun', 'natural soap', 'zeytinyağlı sabun', 'olive oil soap', 'bıttım sabunu', 'bittim sabunu', 'defne sabunu', 'laurel soap'] },
  { id: 'baharat_karışım', terms: ['baharat', 'spice', 'spice mix', 'baharat karışımı', 'baharat karisimi', 'mixed spice', 'yedi baharat', 'ras el hanout', 'curry'] },
  { id: 'bulgur', terms: ['bulgur', 'cracked wheat', 'ince bulgur', 'pilavlık bulgur', 'pilavlik bulgur', 'köftelik bulgur', 'koftelik bulgur'] },
  { id: 'şölen', terms: ['şölen', 'solen', 'feast', 'atıştırmalık', 'atistirmalik', 'snack mix', 'natural snack', 'celebration spread'] },
] as const;

function flattenLocalProductTerms(max = 64): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const cluster of LOCAL_PRODUCT_SKU_CLUSTERS) {
    for (const term of cluster.terms) {
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(term);
      if (out.length >= max) return out;
    }
  }
  return out;
}

function detectLocalProductClusters(text: string): Set<number> {
  const lower = text.toLowerCase();
  const hits = new Set<number>();
  LOCAL_PRODUCT_SKU_CLUSTERS.forEach((cluster, idx) => {
    if (cluster.terms.some((t) => lower.includes(t.toLowerCase()))) hits.add(idx);
  });
  return hits;
}

function productPhotoConflictPenalty(captionText: string, photoSearchable: string): number {
  const cap = detectLocalProductClusters(captionText);
  const photo = detectLocalProductClusters(photoSearchable);
  if (cap.size === 0) return 0;
  // Caption mentions a specific product — photo must match the same cluster
  if (photo.size === 0) {
    // Photo has no recognized product cluster but caption does.
    // Check if photo text contains terms from a DIFFERENT cluster than caption's.
    const photoLower = photoSearchable.toLowerCase();
    const capLower = captionText.toLowerCase();
    let conflict = false;
    LOCAL_PRODUCT_SKU_CLUSTERS.forEach((cluster, idx) => {
      if (conflict) return;
      if (cap.has(idx)) return;
      if (cluster.terms.some((t) => photoLower.includes(t.toLowerCase()) && !capLower.includes(t.toLowerCase()))) {
        conflict = true;
      }
    });
    return conflict ? 52 : 0;
  }
  for (const idx of cap) {
    if (photo.has(idx)) return 0;
  }
  return 58;
}

/** Strong match — prefer these over weak fallbacks. */
export const STRONG_MATCH_SCORE = 52;

/**
 * Minimum gallery match score to allow reel video generation.
 * I2V is expensive and produces poor quality when the source photo
 * is a weak semantic match for the caption. Below this, fall back to a still.
 */
export const REEL_GALLERY_MIN_SCORE = 42;

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
/** Read gallery match score from artifact metadata (auto-produce or manual save). */
export function resolveArtifactMatchScore(meta: Record<string, unknown>): number | null {
  if (meta.caption_driven_visual === true) return null;
  if (meta.gallery_sourced === false) return null;
  const raw = meta.gallery_match_score ?? meta.galleryMatchScore;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

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
  // Product cluster match via URL path (file names often contain product names)
  for (const cluster of LOCAL_PRODUCT_SKU_CLUSTERS) {
    const captionHit = cluster.terms.some((t) => text.includes(t.toLowerCase()));
    const pathHit = cluster.terms.some((t) => path.includes(t.toLowerCase().replace(/\s+/g, '_')) || path.includes(t.toLowerCase().replace(/\s+/g, '')));
    if (captionHit && pathHit) { score += 18; break; }
    if (captionHit && !pathHit && cluster.terms.some((t) => path.includes(t.toLowerCase().replace(/\s+/g, '').slice(0, 5)))) { score += 6; break; }
  }
  // Cross-product penalty: caption mentions product A, URL path mentions product B
  const captionClusters = detectLocalProductClusters(text);
  if (captionClusters.size > 0) {
    let pathConflict = false;
    LOCAL_PRODUCT_SKU_CLUSTERS.forEach((cluster, idx) => {
      if (pathConflict) return;
      if (captionClusters.has(idx)) return;
      if (cluster.terms.some((t) => {
        const normalized = t.toLowerCase().replace(/\s+/g, '');
        return normalized.length >= 4 && path.includes(normalized);
      })) {
        pathConflict = true;
      }
    });
    if (pathConflict) score -= 40;
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

  // ── Local artisan / packaged goods (TR + EN) ─────────────────────────────
  ['artisan_food', ['yöresel', 'yoresel', 'köy', 'koy', 'doğal', 'dogal', 'organik', 'organic',
                   'artisan', 'handmade', 'el yapımı', 'el yapimi', 'hasat', 'harvest', 'geleneksel',
                   'traditional', 'local product', 'yerel ürün', 'yerel urun', 'ambalaj', 'packaging',
                   'kavanoz', 'jar', 'şişe', 'sise', 'bottle', 'poşet', 'poset', 'bag', 'etiket', 'label'], 11],

  // ── Universal brand / identity ───────────────────────────────
  ['brand',       ['logo', 'brand', 'marka', 'sign', 'signage', 'entrance', 'facade',
                   'identity', 'label', 'packaging'], 7],
];

/**
 * Business type → preferred photo category keywords.
 * Soft signal only — boosts matching photos, penalises mismatches.
 * Keys are lowercased substrings matched against `businessType`.
 *
 * Each entry has: match[] (businessType substrings), prefer[] (photo searchable boosts),
 * avoid[] (photo searchable penalties).
 */
const BUSINESS_TYPE_AFFINITY: Array<{
  match: string[];
  prefer: string[];
  avoid: string[];
}> = [
  // ── Food & beverage ─────────────────────────────────────────────────────
  {
    match: [
      'restaurant', 'restoran', 'cafe', 'kafe', 'kahve', 'bistro',
      'bakery', 'fırın', 'firin', 'patisserie', 'pastane', 'cafe_bakery',
      'bakery_patisserie', 'coffee_shop', 'roastery', 'dondurma',
    ],
    prefer: [
      'food', 'dish', 'plate', 'meal', 'cuisine', 'chef', 'kitchen',
      'menu', 'dessert', 'pastry', 'bread', 'ekmek', 'pasta', 'tatlı',
      'yemek', 'tabak', 'mutfak', 'kahve', 'kahvaltı', 'brunch',
      'latte', 'espresso', 'cappuccino', 'croissant', 'börek', 'borek',
      'dondurma', 'kurabiye', 'kek', 'waffle', 'cheesecake',
      'serving', 'plating', 'ingredients', 'fresh', 'seasonal',
    ],
    avoid: ['medical', 'clinic', 'equipment machine', 'gym', 'surgery', 'before after'],
  },
  // ── Hotel & hospitality ──────────────────────────────────────────────────
  {
    match: [
      'hotel', 'otel', 'resort', 'villa', 'boutique hotel',
      'suites', 'suite', 'konaklama', 'pension', 'pansiyon',
    ],
    prefer: [
      'room', 'oda', 'lobby', 'lobi', 'pool', 'havuz', 'terrace', 'teras',
      'interior', 'bed', 'yatak', 'suite', 'garden', 'bahçe', 'sea view',
      'deniz manzarası', 'luxury', 'lüks', 'amenity', 'balcony', 'balkon',
      'reception', 'resepsiyon', 'breakfast', 'kahvaltı', 'rooftop',
    ],
    avoid: ['medical', 'clinic', 'gym equipment', 'surgery'],
  },
  // ── Beach club / nightlife ───────────────────────────────────────────────
  {
    match: [
      'beach_club', 'beach club', 'nightclub', 'club', 'lounge',
      'entertainment', 'hospitality_entertainment', 'gece kulübü',
      'etkinlik', 'event venue', 'mekan',
    ],
    prefer: [
      'sunset', 'beach', 'plaj', 'pool', 'havuz', 'crowd', 'dj', 'stage',
      'event', 'concert', 'performance', 'people', 'celebration', 'party',
      'cocktail', 'bar', 'night', 'gece', 'lights', 'dance', 'dans',
      'outdoor', 'açık hava', 'sea', 'deniz', 'atmosphere',
    ],
    avoid: ['before after', 'medical', 'product shelf', 'gym equipment'],
  },
  // ── Fitness / gym ────────────────────────────────────────────────────────
  {
    match: [
      'gym', 'fitness', 'spor salonu', 'crossfit', 'pilates',
      'yoga', 'studio', 'antrenman', 'spor merkezi',
    ],
    prefer: [
      'equipment', 'ekipman', 'exercise', 'egzersiz', 'workout', 'antrenman',
      'training', 'eğitim', 'result', 'transformation', 'muscle', 'kas',
      'athlete', 'sporcu', 'weight', 'barbell', 'dumbbell', 'cardio',
      'stretch', 'pose', 'class', 'instructor', 'personal trainer',
      'body', 'vücut', 'fitness', 'strong', 'fit',
    ],
    avoid: ['food', 'dish', 'meal', 'medical procedure', 'surgery'],
  },
  // ── Nail salon (highest specificity — must come before general beauty) ───
  {
    match: [
      'nail', 'tırnak', 'tirnak', 'nail_salon', 'nail_studio',
      'nail art', 'nail care',
    ],
    prefer: [
      'nail', 'tırnak', 'tirnak', 'oje', 'nail art', 'nail polish',
      'manikür', 'manikyur', 'manicure', 'pedikür', 'pedikyur', 'pedicure',
      'kalıcı oje', 'gel nail', 'jel tırnak', 'protez tırnak', 'acrylic nail',
      'nail design', 'tırnak tasarım', 'french manicure', 'nail extension',
      'cuticle', 'nail file', 'hand', 'el', 'finger', 'parmak',
      'result', 'before after', 'close-up', 'detail',
    ],
    avoid: [
      'food', 'lash', 'kirpik', 'eyelash', 'ipek kirpik',
      'haircut', 'saç kesim', 'hair color', 'saç boyama', 'fön',
      'massage', 'facial', 'cilt bakım',
    ],
  },
  // ── Lash & brow studio ──────────────────────────────────────────────────
  {
    match: [
      'lash', 'kirpik', 'brow', 'kaş', 'lash_studio',
      'lash extension', 'kirpik uzatma', 'ipek kirpik',
    ],
    prefer: [
      'lash', 'kirpik', 'eyelash', 'brow', 'kaş', 'eyebrow',
      'lash extension', 'lash lift', 'kirpik uzatma', 'kirpik perma',
      'ipek kirpik', 'microblading', 'brow lamination', 'kaş tasarım',
      'eye', 'göz', 'result', 'before after', 'close-up', 'treatment',
    ],
    avoid: ['food', 'nail', 'tırnak', 'oje', 'haircut', 'saç kesim'],
  },
  // ── Spa / massage / wellness center ─────────────────────────────────────
  {
    match: [
      'spa', 'massage', 'masaj', 'wellness center', 'relaxation',
      'hammam', 'hamam', 'sauna', 'termal',
    ],
    prefer: [
      'massage', 'masaj', 'spa', 'relaxation', 'dinlenme', 'pool', 'havuz',
      'steam', 'sauna', 'towel', 'havlu', 'candle', 'mum', 'serene',
      'treatment', 'therapy', 'terapi', 'body', 'skin', 'cilt',
      'essential oil', 'aromatherapy', 'zen', 'calm', 'peaceful',
    ],
    avoid: ['food', 'nail', 'gym equipment', 'medical procedure'],
  },
  // ── General beauty / hair salon (fallback after nail/lash/spa) ──────────
  {
    match: [
      'salon', 'kuaför', 'beauty', 'güzellik', 'barber', 'berber',
      'beauty_wellness', 'hair salon', 'saç salonu', 'estetik salon',
    ],
    prefer: [
      'hair', 'saç', 'sac', 'makeup', 'makyaj', 'before after', 'result',
      'treatment', 'service', 'salon', 'haircut', 'saç kesim', 'blowout',
      'fön', 'balayage', 'highlight', 'color', 'boya', 'styling',
      'transformation', 'dönüşüm', 'brush', 'mirror', 'ayna',
    ],
    avoid: ['food', 'equipment machine', 'outdoor nature', 'medical procedure'],
  },
  // ── Medical / dental / aesthetics clinic ────────────────────────────────
  {
    match: [
      'clinic', 'klinik', 'dental', 'diş', 'medical', 'tıp',
      'aesthetic', 'estetik', 'healthcare', 'saglik', 'sağlık',
      'psikoloji', 'terapi', 'orthodontic',
    ],
    prefer: [
      'before after', 'result', 'treatment', 'tedavi', 'equipment',
      'ekipman', 'clean', 'temiz', 'professional', 'profesyonel',
      'consultation', 'danışma', 'doctor', 'doktor', 'patient',
      'clinical', 'modern', 'technology', 'teknoloji',
    ],
    avoid: ['food', 'nightlife', 'crowd', 'party', 'beach'],
  },
  // ── Fashion & clothing ───────────────────────────────────────────────────
  {
    match: [
      'fashion', 'moda', 'clothing', 'giyim', 'fashion_retail',
      'boutique', 'butik', 'apparel', 'koleksiyon',
    ],
    prefer: [
      'clothing', 'kıyafet', 'outfit', 'collection', 'koleksiyon',
      'model', 'fashion', 'moda', 'style', 'stil', 'look', 'editorial',
      'dress', 'elbise', 'jacket', 'ceket', 'jeans', 'accessories',
      'aksesuar', 'runway', 'campaign', 'flatlay', 'product',
    ],
    avoid: ['food', 'medical', 'gym equipment', 'beach only'],
  },
  // ── Jewelry & accessories ────────────────────────────────────────────────
  {
    match: [
      'jewelry', 'jewellery', 'mücevher', 'takı', 'kuyumcu',
      'jewelry_accessories', 'ring', 'yüzük', 'necklace', 'kolye',
    ],
    prefer: [
      'jewelry', 'mücevher', 'takı', 'ring', 'yüzük', 'necklace', 'kolye',
      'bracelet', 'bileklik', 'earring', 'küpe', 'diamond', 'elmas',
      'gold', 'altın', 'silver', 'gümüş', 'gemstone', 'pırlanta',
      'close-up', 'detail', 'sparkle', 'luxury', 'lüks', 'packaging',
      'product', 'flat lay', 'on model', 'hand',
    ],
    avoid: ['food', 'medical', 'gym equipment', 'hair only'],
  },
  // ── Real estate & property ───────────────────────────────────────────────
  {
    match: [
      'real_estate', 'emlak', 'property', 'konut', 'daire',
      'villa', 'apartment', 'residence',
    ],
    prefer: [
      'interior', 'iç mekan', 'exterior', 'dış cephe', 'room', 'oda',
      'kitchen', 'mutfak', 'living room', 'salon', 'terrace', 'teras',
      'garden', 'bahçe', 'pool', 'havuz', 'view', 'manzara',
      'luxury', 'lüks', 'modern', 'architect', 'detail',
    ],
    avoid: ['food', 'medical', 'gym equipment', 'crowd'],
  },
  // ── Local products & artisan food ────────────────────────────────────────
  {
    match: [
      'local_products', 'yöresel', 'artisan', 'organik', 'zeytinyağı',
      'handmade', 'el yapımı', 'local_products_shop',
    ],
    prefer: [
      'product', 'jar', 'kavanoz', 'bottle', 'şişe', 'sise', 'package', 'ambalaj',
      'natural', 'doğal', 'dogal', 'organic', 'organik', 'harvest', 'hasat',
      'ingredient', 'malzeme', 'texture', 'close-up', 'rustic', 'artisan',
      'handmade', 'el yapımı', 'el yapimi', 'farm', 'çiftlik', 'ciftlik', 'village', 'köy', 'koy',
      ...flattenLocalProductTerms().slice(0, 48),
    ],
    avoid: ['medical', 'gym equipment', 'urban nightlife'],
  },
  // ── General retail & e-commerce ──────────────────────────────────────────
  {
    match: [
      'retail', 'mağaza', 'shop', 'store', 'ecommerce', 'e-ticaret',
      'magaza', 'market',
    ],
    prefer: [
      'product', 'ürün', 'collection', 'koleksiyon', 'display', 'vitrin',
      'packaging', 'ambalaj', 'merchandise', 'shelf', 'raf',
      'flat lay', 'close-up', 'detail', 'unboxing', 'branding',
    ],
    avoid: ['food', 'medical', 'gym equipment'],
  },
  // ── Agency / professional services ──────────────────────────────────────
  {
    match: [
      'agency', 'ajans', 'consulting', 'danışmanlık', 'law', 'avukat',
      'agency_services', 'production_company',
    ],
    prefer: [
      'office', 'ofis', 'team', 'ekip', 'meeting', 'toplantı',
      'professional', 'profesyonel', 'workspace', 'laptop', 'presentation',
      'creative', 'design', 'branding', 'digital', 'technology',
    ],
    avoid: ['food', 'gym equipment', 'medical procedure'],
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
  const pairingKeywords = new Set(meta.pairingKeywords ?? []);

  for (const cluster of LOCAL_PRODUCT_SKU_CLUSTERS) {
    const hit = cluster.terms.some((t) => descLower.includes(t.toLowerCase()));
    if (!hit) continue;
    allTags.add(cluster.id);
    for (const term of cluster.terms.slice(0, 6)) {
      allTags.add(term.toLowerCase());
      pairingKeywords.add(term.toLowerCase());
    }
  }

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
    pairingKeywords: pairingKeywords.size ? [...pairingKeywords] : meta.pairingKeywords,
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

function buildSearchable(meta: GalleryPhotoMeta, url?: string): string {
  return buildGalleryPhotoSearchable(meta, url);
}

function isGenericFallbackGalleryDescription(description: string): boolean {
  const text = description.toLowerCase();
  return text.includes('metadata fallback analysis for a brand gallery image')
    || text.includes('url tokens suggest:');
}

function scorePhotoForContent(
  meta: GalleryPhotoMeta,
  input: MatchPhotoInput,
  url?: string,
): { score: number; reasons: string[] } {
  const headlineText = (input.headline ?? '').trim();
  const captionBody = [input.caption, input.visualDirection, input.strategicPurpose]
    .filter(Boolean)
    .join(' ');
  const caption = [headlineText, captionBody].filter(Boolean).join(' ');
  const text = caption.toLowerCase();
  const searchable = buildSearchable(meta, url);
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
  const headlineWords = tokenize(headlineText);

  if (
    descriptionText
    && isGenericFallbackGalleryDescription(descriptionText)
    && (
      headlineWords.length >= 2
      || captionWords.length >= 5
      || /\bdj|party|dance|crowd|cocktail|team|chef|menu|burger|pizza|pasta|fish|balık|event|concert|sunset|spa|hair|nail|lash\b/i.test(text)
    )
  ) {
    score -= 18;
    reasons.push('generic fallback meta');
  }

  let descHits = 0;
  let tagHits = 0;
  let headlineDescHits = 0;
  for (const w of headlineWords) {
    if (descriptionText.includes(w)) { score += 9; headlineDescHits++; }
    else if (contentTagsText.includes(w)) { score += 7; }
    else if (searchable.includes(w)) { score += 4; }
  }
  if (headlineDescHits >= 2) reasons.push(`headline:${headlineDescHits} desc hits`);

  for (const w of captionWords) {
    if (headlineWords.includes(w)) continue;
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

  // ── Asset-role routing boost (sector + story sequence role) ────────────────
  // Photos that match the role's preferred asset types receive a bonus so the
  // right photo archetype lands in the right sequence position.
  if (input.storySequenceRole) {
    const preferredAssets = resolveAssetRolePreferences(input.businessType, input.storySequenceRole);
    const photoAssets = [
      ...(meta.bestFor ?? []),
      meta.suggestedAssetType ?? '',
      meta.usageContext ?? '',
    ].join(' ').toLowerCase();
    const roleHit = preferredAssets.some(a => photoAssets.includes(a.replace(/_/g, ' ')));
    if (roleHit) {
      score += 12;
      reasons.push(`role_fit:${input.storySequenceRole}`);
    }
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

  // ── Caption-driven sub-service bonus (beauty sector) ─────────────────────
  // When caption explicitly names a specific beauty service (nail, lash, hair),
  // give a strong extra bonus when the photo also shows that same service.
  // This disambiguates mixed salon galleries without needing vector embeddings.
  const BEAUTY_SUB_SERVICES: Array<{ captionTerms: string[]; photoTerms: string[] }> = [
    {
      captionTerms: ['nail', 'tırnak', 'tirnak', 'oje', 'manikür', 'manikyur', 'manicure', 'pedikür', 'pedicure', 'nail art'],
      photoTerms: ['nail', 'tırnak', 'tirnak', 'oje', 'manikür', 'manicure', 'pedicure', 'nail art', 'nail polish'],
    },
    {
      captionTerms: ['lash', 'kirpik', 'eyelash', 'ipek kirpik', 'lash lift', 'lash extension', 'kirpik uzatma'],
      photoTerms: ['lash', 'kirpik', 'eyelash', 'lash extension', 'lash lift', 'ipek kirpik'],
    },
    {
      captionTerms: ['saç', 'sac', 'hair', 'balayage', 'highlight', 'saç kesim', 'haircut', 'keratin', 'fön'],
      photoTerms: ['hair', 'saç', 'sac', 'haircut', 'hairstyle', 'balayage', 'highlight', 'fön'],
    },
    {
      captionTerms: ['kaş', 'kas', 'brow', 'microblading', 'kaş tasarım'],
      photoTerms: ['brow', 'kaş', 'kas', 'microblading', 'eyebrow'],
    },
  ];
  for (const cluster of BEAUTY_SUB_SERVICES) {
    const captionHitsCluster = cluster.captionTerms.filter(t => text.includes(t)).length;
    const photoHitsCluster = cluster.photoTerms.filter(t => searchable.includes(t)).length;
    if (captionHitsCluster >= 1 && photoHitsCluster >= 1) {
      score += 20;
      reasons.push(`beauty_sub_service_match:${cluster.captionTerms[0]}`);
      break; // only one cluster bonus per photo
    }
  }

  for (const cluster of LOCAL_PRODUCT_SKU_CLUSTERS) {
    const captionHitsCluster = cluster.terms.filter((t) => text.includes(t.toLowerCase())).length;
    const photoHitsCluster = cluster.terms.filter((t) => searchable.includes(t.toLowerCase())).length;
    if (captionHitsCluster >= 1 && photoHitsCluster >= 1) {
      score += 24;
      reasons.push(`product_match:${cluster.id}`);
      break;
    }
  }

  const conflict = captionPhotoConflictPenalty(caption, searchable);
  if (conflict > 0) {
    score -= conflict;
    reasons.push(`caption-photo conflict -${conflict}`);
  }
  // Hard theme veto — pair is unusable regardless of synonym stacking.
  if (isHardCaptionPhotoConflict(caption, searchable)) {
    score = Math.min(score, -100);
    reasons.push('hard_caption_photo_veto');
  }

  const productConflict = productPhotoConflictPenalty(caption, searchable);
  if (productConflict > 0) {
    score -= productConflict;
    reasons.push(`product-label conflict -${productConflict}`);
  }

  return { score, reasons };
}

/** Caption text used for conflict checks (headline + body). */
function matchCaptionBlob(input: MatchPhotoInput): string {
  return [input.headline, input.caption, input.visualDirection, input.strategicPurpose]
    .filter(Boolean)
    .join(' ');
}

/**
 * True when this gallery photo is a hard theme mismatch for the caption
 * (e.g. DJ caption + food plate). Used to block relaxed/diversity fallbacks.
 */
export function isHardGalleryThemeMismatch(
  input: MatchPhotoInput,
  meta: GalleryPhotoMeta | undefined,
  url?: string,
): boolean {
  const caption = matchCaptionBlob(input);
  if (!caption.trim()) return false;
  const searchable = buildGalleryPhotoSearchable(meta, url);
  if (isHardCaptionPhotoConflict(caption, searchable)) return true;
  return productPhotoConflictPenalty(caption, searchable) >= STRONG_MATCH_SCORE;
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
    const { score, reasons } = scorePhotoForContent(meta, input, url);
    // Never rank hard theme mismatches — they must not win via path/usage noise.
    if (score <= -100 || isHardGalleryThemeMismatch(input, meta, url)) {
      continue;
    }
    const pathScore = scoreUrlPath(url, input);
    let totalScore = score + pathScore;

    const usageCount = getGlobalGalleryUsageCount(input.globalUsageCounts, base);
    if (usageCount > 0) {
      const penalty = GALLERY_USAGE_COUNT_PENALTY * usageCount;
      totalScore -= penalty;
      reasons.push(`usage:-${penalty}`);
    }

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
    /** Per-idea seed so equal-scored photos rotate across slots. */
    tieBreakSeed?: number;
  },
): PhotoMatchResult | null {
  const usableCandidates = candidateUrls.filter(isUsableGalleryPhotoUrl);
  const excludeBases = new Set((options?.excludeUrls ?? []).map(normalizeGalleryUrl));
  const lookup = buildGalleryLookup(galleryAnalysis, options?.displayUrls ?? usableCandidates);
  const minScore = options?.minScore ?? MIN_ACCEPT_SCORE;

  const ranked = options?.tieBreakSeed != null
    ? rankPhotosForContentSeeded(
      input,
      usableCandidates,
      lookup,
      options.tieBreakSeed,
      excludeBases,
      galleryAnalysis,
    )
    : rankPhotosForContent(
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
    return null;
  }

  return null;
}

/** Tag overlap between two gallery photos (0 = distinct, 1 = identical tag set). */
function galleryTagOverlap(
  metaA: GalleryPhotoMeta | undefined,
  metaB: GalleryPhotoMeta | undefined,
): number {
  const tagsA = new Set((metaA?.contentTags ?? []).map((t) => String(t).toLowerCase()));
  const tagsB = new Set((metaB?.contentTags ?? []).map((t) => String(t).toLowerCase()));
  if (tagsA.size === 0 || tagsB.size === 0) return 0;
  let shared = 0;
  for (const t of tagsA) {
    if (tagsB.has(t)) shared += 1;
  }
  return shared / Math.max(tagsA.size, tagsB.size);
}

/**
 * When semantic scores fail, pick any unused photo that differs most from already-assigned
 * mission photos (small catalogs / identical opportunity captions).
 *
 * Optional `matchInput`: when provided, hard theme mismatches are skipped and
 * captions that require strict matching never receive a diversity fallback.
 */
export function pickMissionDiverseFallbackPhoto(
  candidateUrls: string[],
  usedBases: Set<string>,
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
  assignedUrls: string[],
  matchInput?: MatchPhotoInput,
): PhotoMatchResult | null {
  if (
    matchInput
    && captionRequiresStrictGalleryMatch(
      matchInput.caption ?? '',
      matchInput.headline ?? '',
    )
  ) {
    return null;
  }

  const assignedMeta = assignedUrls.map((url) => {
    const base = normalizeGalleryUrl(url);
    return galleryAnalysis[base]
      ?? Object.entries(galleryAnalysis).find(([k]) => normalizeGalleryUrl(k) === base)?.[1];
  });

  let best: { url: string; diversity: number } | null = null;
  for (const url of candidateUrls) {
    const base = normalizeGalleryUrl(url);
    if (usedBases.has(base)) continue;
    const meta = galleryAnalysis[base]
      ?? Object.entries(galleryAnalysis).find(([k]) => normalizeGalleryUrl(k) === base)?.[1];
    if (matchInput && isHardGalleryThemeMismatch(matchInput, meta, url)) {
      continue;
    }
    let maxOverlap = 0;
    for (const other of assignedMeta) {
      maxOverlap = Math.max(maxOverlap, galleryTagOverlap(meta, other));
    }
    const diversity = 1 - maxOverlap;
    if (!best || diversity > best.diversity || (diversity === best.diversity && url < best.url)) {
      best = { url, diversity };
    }
  }
  if (!best) return null;
  return {
    url: best.url,
    score: RELAXED_MATCH_SCORE,
    reason: 'mission_diversity_fallback',
    confidence: 0.35,
  };
}

/**
 * Greedy 1:1 assignment — no duplicate photos within the mission batch
 * (mission-wide dedup across feed/story/reel/carousel).
 *
 * Strength-first ordering: instead of assigning in input order (where a weak
 * idea processed early could claim a photo that is a much stronger match for a
 * later idea — "starvation"), each round we evaluate every still-unassigned
 * idea's best available photo and commit the single strongest (idea, photo)
 * pair. Ties resolve by original input order for determinism.
 */
export function assignPhotosToContents(
  items: Array<{ key: string; input: MatchPhotoInput; postType?: PostTypeBucket }>,
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
  const strictMinScore = options?.minScore ?? MIN_ACCEPT_SCORE;
  const assigned = new Map<string, PhotoMatchResult | null>();
  /** Mission-wide pool — one venue photo per weekly package slot. */
  const usedMissionWide = new Set(excludeBases);
  const assignedUrls: string[] = [];

  type PendingItem = { key: string; input: MatchPhotoInput; order: number };

  const greedyAssignRound = (pending: PendingItem[], minScore: number): PendingItem[] => {
    const remaining: PendingItem[] = [];

    while (pending.length > 0) {
      let pick: {
        listIndex: number;
        key: string;
        result: PhotoMatchResult;
        order: number;
      } | null = null;

      for (let i = 0; i < pending.length; i += 1) {
        const { key, input, order } = pending[i]!;
        const top = rankPhotosForContent(
          input,
          candidateUrls,
          lookup,
          usedMissionWide,
          galleryAnalysis,
        )[0];
        if (!top || top.score < minScore) continue;
        const better =
          !pick
          || top.score > pick.result.score
          || (top.score === pick.result.score && order < pick.order);
        if (better) {
          pick = { listIndex: i, key, result: top, order };
        }
      }

      if (!pick) {
        remaining.push(...pending);
        break;
      }

      assigned.set(pick.key, pick.result);
      usedMissionWide.add(normalizeGalleryUrl(pick.result.url));
      assignedUrls.push(pick.result.url);
      pending.splice(pick.listIndex, 1);
    }

    return remaining;
  };

  let pending: PendingItem[] = items.map((item, order) => ({ ...item, order }));

  // Phase 1: semantic matches at production threshold.
  pending = greedyAssignRound(pending, strictMinScore);

  // Phase 2: still-unassigned — only non-strict captions may take weaker semantic matches.
  // Nightlife / food / beauty captions stay unassigned rather than accept a wrong photo.
  if (pending.length > 0 && RELAXED_MATCH_SCORE < strictMinScore) {
    const relaxedEligible = pending.filter(
      (p) => !captionRequiresStrictGalleryMatch(p.input.caption ?? '', p.input.headline ?? ''),
    );
    const strictHeld = pending.filter(
      (p) => captionRequiresStrictGalleryMatch(p.input.caption ?? '', p.input.headline ?? ''),
    );
    const stillOpen = greedyAssignRound(relaxedEligible, RELAXED_MATCH_SCORE);
    pending = [...strictHeld, ...stillOpen];
  }

  // Phase 3: tag-diversity fallback — never for strict theme captions; never hard mismatches.
  for (const { key, input } of pending) {
    const fallback = pickMissionDiverseFallbackPhoto(
      candidateUrls,
      usedMissionWide,
      galleryAnalysis,
      assignedUrls,
      input,
    );
    if (!fallback) {
      assigned.set(key, null);
      continue;
    }
    assigned.set(key, fallback);
    usedMissionWide.add(normalizeGalleryUrl(fallback.url));
    assignedUrls.push(fallback.url);
  }

  // Preserve original items order; ideas with no acceptable match resolve to null.
  const ordered = new Map<string, PhotoMatchResult | null>();
  for (const { key } of items) {
    ordered.set(key, assigned.get(key) ?? null);
  }
  return ordered;
}

/** Pick up to `count` carousel slides — each must clear minScore; no unscored padding. */
export function pickScoredCarouselSlides(
  input: MatchPhotoInput,
  candidateUrls: string[],
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
  excludeUrls: string[],
  count: number,
  minScore = MIN_ACCEPT_SCORE,
): PhotoMatchResult[] {
  const lookup = buildGalleryLookup(galleryAnalysis, candidateUrls);
  const usedBases = new Set(excludeUrls.map(normalizeGalleryUrl));
  const picked: PhotoMatchResult[] = [];

  for (let i = 0; i < count; i += 1) {
    const ranked = rankPhotosForContent(input, candidateUrls, lookup, usedBases, galleryAnalysis);
    const best = ranked.find((r) => r.score >= minScore);
    if (!best) break;
    picked.push(best);
    usedBases.add(normalizeGalleryUrl(best.url));
  }

  return picked;
}

/** True when photo has vision tags or description for semantic matching. */
export function isGalleryPhotoAnalyzed(meta: GalleryPhotoMeta | undefined): boolean {
  if (!meta) return false;
  const tags = meta.contentTags ?? [];
  const desc = String(meta.description ?? '').trim();
  return tags.length >= 2 || desc.length >= 12;
}

export function galleryAnalysisCoverageStats(
  photos: string[],
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
): { analyzed: number; total: number; sufficient: boolean } {
  const real = photos.filter((u) => isUsableGalleryPhotoUrl(u));
  if (real.length === 0) {
    return { analyzed: 0, total: 0, sufficient: true };
  }
  let analyzed = 0;
  const lookup = buildGalleryLookup(galleryAnalysis, real);
  for (const url of real) {
    const base = normalizeGalleryUrl(url);
    const entry = lookup.get(base);
    if (isGalleryPhotoAnalyzed(entry?.meta)) analyzed += 1;
  }
  const ratio = analyzed / real.length;
  const sufficient = analyzed >= Math.min(3, real.length) || ratio >= 0.55;
  return { analyzed, total: real.length, sufficient };
}
export function resolveBestGalleryUrl(
  input: MatchPhotoInput,
  candidateUrls: string[],
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
  agentUrl: string | null | undefined,
  options?: {
    excludeUrls?: string[];
    displayUrls?: string[];
    minScore?: number;
    tieBreakSeed?: number;
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
  const agentMin = Math.max(minScore, GIS_PILOT_MIN_SCORE);
  if (
    agentRank
    && agentRank.score >= agentMin
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
