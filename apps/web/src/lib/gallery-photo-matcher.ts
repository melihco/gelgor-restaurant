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
  /** Canonical language-neutral subject token (e.g. "honey", "olive_oil"). */
  primarySubject?: string;
  /** 0..1 confidence in primarySubject. */
  subjectConfidence?: number;
  /**
   * Additional canonical (English) subject tokens the photo can also satisfy —
   * e.g. a fig-jam jar: ["jam", "fig"]. Language-neutral; feeds subject matching
   * without growing the hand-maintained dictionary.
   */
  subjectAliases?: string[];
  /**
   * Broad language-neutral subject family (e.g. "jam", "nuts", "dairy") so
   * generic captions ("reçel çeşitleri" / "our jams") match any variant.
   */
  subjectFamily?: string;
  /** Any product label text literally visible on the packaging (as seen, any language). */
  visibleLabelText?: string;
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
  /**
   * Canonical, language-neutral subject token for the caption's product/service
   * (from ideation `subject_key`, e.g. "honey", "olive_oil"). When present it is
   * the SSOT for product↔photo matching, bypassing the keyword dictionary.
   */
  subjectKey?: string;
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
  { id: 'bitki çayı', terms: ['bitki çayı', 'bitki çayları', 'bitki cayi', 'bitki caylari', 'herbal tea', 'herbal_tea', 'bitki çay', 'bitki cay', 'çay karışımı', 'cay karisimi'] },
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

/** Match SKU terms with Turkish morphology; avoid short-stem false positives (ambalaj→bal). */
function localProductTermHit(haystack: string, term: string): boolean {
  const t = term.toLowerCase().trim();
  if (!t) return false;
  const h = haystack.toLowerCase();
  if (t.length >= 5) return h.includes(t);
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Short stems: word-start + optional letters (balımızın, sızma) — not mid-token.
  const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}\\p{L}*(?=$|[^\\p{L}\\p{N}])`, 'iu');
  return re.test(h);
}

function detectLocalProductClusters(text: string): Set<number> {
  const lower = text.toLowerCase();
  const hits = new Set<number>();
  LOCAL_PRODUCT_SKU_CLUSTERS.forEach((cluster, idx) => {
    if (cluster.terms.some((t) => localProductTermHit(lower, t))) hits.add(idx);
  });
  return hits;
}

/** Generic `jam` and variant `*_jam` tokens share the same gallery pick family. */
export function isJamFamilySubject(token: string | undefined): boolean {
  const n = normalizeSubjectForRelation(token).replace(/ /g, '_');
  if (!n || n === 'none') return false;
  if (n === 'jam' || n.endsWith('_jam')) return true;
  return n === 'marmalade' || n === 'recel' || n === 'reçel';
}

function jamFamilyClusterIndices(): number[] {
  const indices = new Set<number>();
  LOCAL_PRODUCT_SKU_CLUSTERS.forEach((cluster, idx) => {
    if (cluster.id === 'reçel' || cluster.id === 'incir') indices.add(idx);
    if (cluster.terms.some((term) => /\bjam\b/i.test(term) || /reçel|recel/i.test(term))) {
      indices.add(idx);
    }
  });
  return [...indices];
}

/**
 * Turkish cluster id → canonical, language-neutral English subject token.
 * This is the SSOT that keeps all internal subject reasoning in one vocabulary
 * regardless of caption language (TR / EN / mixed). The keyword dictionary
 * (`LOCAL_PRODUCT_SKU_CLUSTERS`) is only a cheap synonym hint used to *reach*
 * one of these canonical tokens — never the final answer on its own.
 */
const CLUSTER_ID_TO_SUBJECT_KEY: Readonly<Record<string, string>> = {
  'reçel': 'jam',
  'bal': 'honey',
  'zeytinyağı': 'olive_oil',
  'zeytin': 'olives',
  'incir': 'fig_jam',
  'badem': 'almond_butter',
  'bitki çayı': 'herbal_tea',
  'nane': 'mint',
  'pekmez': 'molasses',
  'kayısı': 'apricot',
  'ceviz': 'walnut',
  'fındık': 'hazelnut',
  'fıstık': 'pistachio',
  'kaju': 'cashew',
  'leblebi': 'roasted_chickpea',
  'turşu': 'pickle',
  'salça': 'tomato_paste',
  'domates': 'tomato',
  'biber': 'pepper',
  'sumak': 'sumac',
  'tarçın': 'cinnamon',
  'kekik': 'thyme',
  'biberiye': 'rosemary',
  'defne': 'bay_leaf',
  'kimyon': 'cumin',
  'zencefil': 'ginger',
  'zerdeçal': 'turmeric',
  'tahin': 'tahini',
  'peynir': 'cheese',
  'tereyağı': 'butter',
  'tarhana': 'tarhana',
  'erişte': 'noodle',
  'ekmek': 'bread',
  'çay': 'tea',
  'kahve': 'coffee',
  'dut': 'mulberry',
  'üzüm': 'grape',
  'elma': 'apple',
  'ayva': 'quince',
  'portakal': 'orange',
  'limon': 'lemon',
  'nar': 'pomegranate',
  'sucuk': 'sausage',
  'pastırma': 'cured_beef',
  'zeytin_ezmesi': 'olive_tapenade',
  'ot': 'herbs',
  'çam_kozalağı': 'pine_cone',
  'keçiboynuzu': 'carob',
  'lavanta': 'lavender',
  'propolis': 'propolis',
  'susam': 'sesame',
  'kurutulmuş_meyve': 'dried_fruit',
  'macun': 'herbal_paste',
  'sirke': 'vinegar',
  'sabun': 'soap',
  'baharat_karışım': 'spice_mix',
  'bulgur': 'bulgur',
  'şölen': 'snack_mix',
};

function inferSubjectKeyFromClusters(clusters: Set<number>): string | undefined {
  for (const idx of clusters) {
    const id = LOCAL_PRODUCT_SKU_CLUSTERS[idx]?.id;
    if (id && CLUSTER_ID_TO_SUBJECT_KEY[id]) return CLUSTER_ID_TO_SUBJECT_KEY[id];
  }
  return undefined;
}

/**
 * Language-neutral subject extractor for free caption/headline text.
 *
 * Returns a canonical English snake_case token (e.g. "olive_oil", "honey") when
 * a product/subject is detectable, independent of Turkish/English wording. The
 * dictionary is used only as a synonym bridge; callers should treat the result
 * as a *hint* and let the AI judge / vision `primarySubject` be authoritative in
 * gray zones. Returns `undefined` when no concrete subject is found.
 */
export function canonicalSubjectFromText(text: string | undefined): string | undefined {
  const raw = String(text ?? '').trim();
  if (!raw) return undefined;
  const clusters = detectLocalProductClusters(raw.toLowerCase());
  return inferSubjectKeyFromClusters(clusters);
}

/**
 * When ideation `subject_key` disagrees with caption/headline product signals,
 * prefer the caption-derived canonical subject for gallery matching.
 */
export function resolveGalleryMatchSubjectKey(input: {
  caption?: string;
  headline?: string;
  subjectKey?: string;
}): string | undefined {
  const key = String(input.subjectKey ?? '').trim();
  const blob = [input.headline, input.caption].filter(Boolean).join(' ').trim();
  if (!blob && !key) return undefined;

  const captionClusters = detectLocalProductClusters(blob.toLowerCase());
  const keyClusters = subjectClustersFromToken(key);

  if (captionClusters.size === 0) return key || undefined;
  if (keyClusters.size === 0) {
    return inferSubjectKeyFromClusters(captionClusters) ?? (key || undefined);
  }

  for (const idx of keyClusters) {
    if (captionClusters.has(idx)) return key;
  }

  return inferSubjectKeyFromClusters(captionClusters) ?? key;
}

/**
 * Map a canonical, language-neutral subject token (e.g. "olive_oil", "honey")
 * to SKU cluster indices. Both `foo_bar` and `foo bar` forms are matched so the
 * AI subject key from vision/ideation joins the same SSOT vocabulary.
 */
function subjectClustersFromToken(token: string | undefined): Set<number> {
  const raw = String(token ?? '').trim().toLowerCase();
  const hits = new Set<number>();
  if (!raw || raw === 'none' || raw === 'other' || raw === 'brand' || raw === 'logo') {
    return hits;
  }
  if (isJamFamilySubject(raw)) {
    for (const idx of jamFamilyClusterIndices()) hits.add(idx);
  }
  const spaced = raw.replace(/_/g, ' ');
  LOCAL_PRODUCT_SKU_CLUSTERS.forEach((cluster, idx) => {
    const match = cluster.terms.some((term) => {
      const t = term.toLowerCase();
      return t === raw || t === spaced
        || spaced.includes(t) || t.includes(spaced)
        || localProductTermHit(spaced, term);
    });
    if (match) hits.add(idx);
  });
  return hits;
}

const NON_CONCRETE_SUBJECTS = new Set([
  '', 'none', 'other', 'brand', 'logo', 'n/a', 'na', 'unknown', 'misc',
  'general', 'atmosphere', 'lifestyle', 'venue', 'background',
]);

function normalizeSubjectForRelation(raw: string | undefined): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function concreteSubjectTokens(normalized: string): string[] {
  return normalized.split(' ').filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

export type CanonicalSubjectRelation = 'match' | 'conflict' | 'unknown';

/**
 * Sector-agnostic comparison of two AI-produced canonical subject tokens
 * (caption `subject_key` vs photo `primary_subject`). No product dictionary —
 * works for ANY brand/sector (beauty, gym, hotel, food, retail, …).
 *
 * - Same token, or one contains the other, or a shared significant token → match
 *   (handles "haircut" vs "hair_color", "pasta" vs "pasta_carbonara").
 * - Both concrete but unrelated → conflict ("burger" vs "pizza", "nail_service"
 *   vs "haircut", "honey" vs "olive_oil").
 * - Either side abstract/absent ("none", empty) → unknown (never a hard veto).
 */
export function canonicalSubjectRelation(
  captionKey: string | undefined,
  photoKey: string | undefined,
): CanonicalSubjectRelation {
  const a = normalizeSubjectForRelation(captionKey);
  const b = normalizeSubjectForRelation(photoKey);
  if (NON_CONCRETE_SUBJECTS.has(a) || NON_CONCRETE_SUBJECTS.has(b)) return 'unknown';
  if (isJamFamilySubject(a) && isJamFamilySubject(b)) return 'match';
  if (a === b) return 'match';
  if (a.includes(b) || b.includes(a)) return 'match';
  const aTokens = concreteSubjectTokens(a);
  const bTokens = concreteSubjectTokens(b);
  const aSet = new Set(aTokens);
  if (bTokens.some((t) => aSet.has(t))) return 'match';
  // Conservative relatedness: a shared 4-char token stem (haircut ↔ hair_color)
  // means "related enough" — do NOT hard-veto, fall back to softer signals.
  const STEM = 4;
  const sharesStem = aTokens.some((ta) =>
    ta.length >= STEM
    && bTokens.some((tb) => tb.length >= STEM && ta.slice(0, STEM) === tb.slice(0, STEM)),
  );
  if (sharesStem) return 'unknown';
  return 'conflict';
}

/**
 * Meta-aware canonical relation: compares the caption subject against the photo's
 * `primarySubject` AND its vision `subjectAliases` / `subjectFamily`. A match on
 * any alias/family wins (safe, widens matching); a conflict is only reported when
 * the primary subject conflicts and no alias/family rescues it. This is what lets
 * a generic caption ("jam" / "reçel çeşitleri") accept a specific variant jar
 * without growing the keyword dictionary — language-neutral by construction.
 */
export function canonicalSubjectRelationForMeta(
  captionKey: string | undefined,
  meta: GalleryPhotoMeta | undefined,
): CanonicalSubjectRelation {
  const primary = canonicalSubjectRelation(captionKey, meta?.primarySubject);
  if (primary === 'match') return 'match';
  const extras = [
    ...((meta?.subjectAliases ?? [])),
    ...(meta?.subjectFamily ? [meta.subjectFamily] : []),
  ];
  for (const token of extras) {
    if (canonicalSubjectRelation(captionKey, token) === 'match') return 'match';
  }
  return primary;
}

/**
 * Caption's product clusters. Prefers the canonical `subjectKey` (from ideation)
 * so the keyword dictionary is only a fallback for legacy ideas without it.
 */
function resolveCaptionSubjectClusters(captionText: string, subjectKey?: string): Set<number> {
  if (subjectKey && subjectKey.trim()) {
    const fromKey = subjectClustersFromToken(subjectKey);
    if (fromKey.size) return fromKey;
    // Explicit non-product subject (e.g. "team", "venue") → no product veto.
    if (String(subjectKey).trim().toLowerCase() !== '') return new Set();
  }
  return detectLocalProductClusters(captionText);
}

/**
 * Photo's product clusters. Prefers vision-committed `primarySubject` (reliable
 * even when free-text tags are generic) over lexical tag scraping.
 */
function resolvePhotoSubjectClusters(photoSearchable: string, primarySubject?: string): Set<number> {
  if (primarySubject && primarySubject.trim()) {
    const hits = subjectClustersFromToken(primarySubject);
    // Fold in aliases/family/label text captured in the searchable blob so a
    // generic caption ("jam") still matches a specific jar ("fig_jam"). Union
    // only widens membership → never creates a false product veto.
    for (const idx of detectLocalProductClusters(photoSearchable)) hits.add(idx);
    return hits;
  }
  return detectLocalProductClusters(photoSearchable);
}

function productPhotoConflictPenalty(
  captionText: string,
  photoSearchable: string,
  opts?: { subjectKey?: string; primarySubject?: string },
): number {
  const cap = resolveCaptionSubjectClusters(captionText, opts?.subjectKey);
  const photo = resolvePhotoSubjectClusters(photoSearchable, opts?.primarySubject);
  if (cap.size === 0) return 0;
  // Caption names a concrete SKU — photo must evidence the same cluster.
  // Untagged packaging (oil tins with empty vision meta) must not soft-pass;
  // a vision-committed primary_subject makes this reliable across languages.
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

/**
 * Fingerprint memo — production ranks the same URLs millions of times per
 * mission (slots × candidates × greedy rounds); the regex work here was a
 * measured event-loop blocker on single-CPU instances. Bounded FIFO cache.
 */
const FINGERPRINT_CACHE = new Map<string, string>();
const FINGERPRINT_CACHE_MAX = 10_000;

/** Stable media id across CDN resize variants (Wix, Cloudinary, R2, etc.). */
export function galleryMediaFingerprint(url: string): string {
  const cached = FINGERPRINT_CACHE.get(url);
  if (cached !== undefined) return cached;
  const fp = computeGalleryMediaFingerprint(url);
  if (FINGERPRINT_CACHE.size >= FINGERPRINT_CACHE_MAX) {
    const oldest = FINGERPRINT_CACHE.keys().next().value;
    if (oldest !== undefined) FINGERPRINT_CACHE.delete(oldest);
  }
  FINGERPRINT_CACHE.set(url, fp);
  return fp;
}

function computeGalleryMediaFingerprint(url: string): string {
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

/**
 * Per-analysis resolver cache. Building the lookup + fingerprint index costs
 * O(analysis size) regex work; production code resolves metadata for the same
 * (analysis, url) pairs thousands of times per mission plan. The WeakMap keys
 * on the analysis object identity, so caches die with the request payload.
 */
interface GalleryResolverIndex {
  lookup: Map<string, GalleryLookupEntry>;
  fingerprintIndex: Map<string, GalleryLookupEntry>;
  byUrl: Map<string, GalleryLookupEntry | null>;
}

const RESOLVER_INDEX_CACHE = new WeakMap<
  Record<string, GalleryPhotoMeta>,
  GalleryResolverIndex
>();

function getResolverIndex(
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
): GalleryResolverIndex {
  const cached = RESOLVER_INDEX_CACHE.get(galleryAnalysis);
  if (cached) return cached;
  const lookup = new Map<string, GalleryLookupEntry>();
  const fingerprintIndex = new Map<string, GalleryLookupEntry>();
  for (const [analysisKey, meta] of Object.entries(galleryAnalysis)) {
    const entry: GalleryLookupEntry = { displayUrl: analysisKey, analysisKey, meta };
    lookup.set(normalizeGalleryUrl(analysisKey), entry);
    fingerprintIndex.set(galleryMediaFingerprint(analysisKey), entry);
  }
  const index: GalleryResolverIndex = { lookup, fingerprintIndex, byUrl: new Map() };
  RESOLVER_INDEX_CACHE.set(galleryAnalysis, index);
  return index;
}

/** Resolve analysis metadata for a display URL (R2/CDN/Wix variants share fingerprints). */
export function resolveGalleryLookupEntry(
  url: string,
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
  _displayUrls: string[] = [],
): GalleryLookupEntry | undefined {
  const index = getResolverIndex(galleryAnalysis);
  const memo = index.byUrl.get(url);
  if (memo !== undefined) return memo ?? undefined;
  const resolved = resolveLookupEntry(url, index.lookup, index.fingerprintIndex);
  index.byUrl.set(url, resolved ?? null);
  return resolved;
}

export function resolveGalleryPhotoMeta(
  url: string,
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
  displayUrls: string[] = [],
): GalleryPhotoMeta | undefined {
  return resolveGalleryLookupEntry(url, galleryAnalysis, displayUrls)?.meta;
}

/** Alias every production photo URL to its fingerprint-matched analysis row. */
export function aliasGalleryMetaForPhotoUrls(
  photos: string[],
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
): Record<string, GalleryPhotoMeta> {
  const out = { ...galleryAnalysis };
  for (const url of photos) {
    const meta = resolveGalleryPhotoMeta(url, galleryAnalysis, photos);
    if (!meta) continue;
    out[url] = meta;
    out[normalizeGalleryUrl(url)] = meta;
  }
  return out;
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
    // Accept either camelCase (Next persist) or snake_case (Python dumps).
    const raw = meta as GalleryPhotoMeta & {
      primary_subject?: string;
      subject_confidence?: number;
      subject_aliases?: string[];
      subject_family?: string;
      visible_label_text?: string;
    };
    const primarySubject = meta.primarySubject
      ?? (typeof raw.primary_subject === 'string' ? raw.primary_subject : undefined);
    const subjectConfidence = meta.subjectConfidence
      ?? (typeof raw.subject_confidence === 'number' ? raw.subject_confidence : undefined);
    const subjectAliases = meta.subjectAliases
      ?? (Array.isArray(raw.subject_aliases) ? raw.subject_aliases.map(String) : undefined);
    const subjectFamily = meta.subjectFamily
      ?? (typeof raw.subject_family === 'string' ? raw.subject_family : undefined);
    const visibleLabelText = meta.visibleLabelText
      ?? (typeof raw.visible_label_text === 'string' ? raw.visible_label_text : undefined);
    const normalized: GalleryPhotoMeta = {
      ...meta,
      ...(primarySubject ? { primarySubject } : {}),
      ...(subjectConfidence != null ? { subjectConfidence } : {}),
      ...(subjectAliases?.length ? { subjectAliases } : {}),
      ...(subjectFamily ? { subjectFamily } : {}),
      ...(visibleLabelText ? { visibleLabelText } : {}),
    };
    const patch = enrichTagsFromDescription(normalized);
    enriched[url] = Object.keys(patch).length > 0 ? { ...normalized, ...patch } : normalized;
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

  // Canonical subject clusters (AI subject key / vision primary_subject) win over
  // raw keyword scraping; dictionary detection is the fallback inside the resolvers.
  const captionSubjectClusters = resolveCaptionSubjectClusters(text, input.subjectKey);
  const photoSubjectClusters = resolvePhotoSubjectClusters(searchable, meta.primarySubject);
  let productClusterMatched = false;
  for (const idx of captionSubjectClusters) {
    if (photoSubjectClusters.has(idx)) {
      score += 24;
      reasons.push(`product_match:${LOCAL_PRODUCT_SKU_CLUSTERS[idx]?.id ?? idx}`);
      productClusterMatched = true;
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

  if (!productClusterMatched) {
    const productConflict = productPhotoConflictPenalty(caption, searchable, {
      subjectKey: input.subjectKey,
      primarySubject: meta.primarySubject,
    });
    if (productConflict > 0) {
      score -= productConflict;
      reasons.push(`product-label conflict -${productConflict}`);
    }
    // Hard product veto (bal caption + zeytinyağı / unlabeled tin) — unusable pair.
    if (productConflict >= STRONG_MATCH_SCORE) {
      score = Math.min(score, -100);
      reasons.push('hard_product_sku_veto');
    }

    // Sector-agnostic canonical subject gate — engages for ANY sector when both
    // the ideation subject_key and vision primary_subject are present and the
    // food dictionary didn't already decide. This is what makes cross-subject
    // mismatch (haircut↔nail, burger↔pizza) block without a keyword list.
    if (captionSubjectClusters.size === 0 && productConflict < STRONG_MATCH_SCORE) {
      const relation = canonicalSubjectRelationForMeta(input.subjectKey, meta);
      if (relation === 'match') {
        score += 24;
        reasons.push('subject_key_match');
      } else if (relation === 'conflict' && (meta.subjectConfidence ?? 1) >= 0.4) {
        score = Math.min(score, -100);
        reasons.push('subject_key_conflict_veto');
      }
    }
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
 * When `subjectKey` is a concrete canonical subject, prefer gallery URLs whose
 * `primarySubject` matches (or shares the same local-product SKU cluster).
 * Falls back to the full pool when nothing aligns — never returns empty solely
 * because of a missing subject label.
 */
export function preferSubjectAlignedCandidates(
  candidateUrls: string[],
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
  subjectKey: string | undefined,
): string[] {
  const key = String(subjectKey ?? '').trim();
  if (!key || NON_CONCRETE_SUBJECTS.has(normalizeSubjectForRelation(key))) {
    return candidateUrls;
  }

  const resolveMeta = (url: string): GalleryPhotoMeta | undefined =>
    resolveGalleryPhotoMeta(url, galleryAnalysis, candidateUrls);

  const exact = candidateUrls.filter((url) => {
    const meta = resolveMeta(url);
    return canonicalSubjectRelationForMeta(key, meta) === 'match';
  });
  if (exact.length > 0) return exact;

  const captionClusters = subjectClustersFromToken(key);
  if (captionClusters.size === 0) {
    return NON_CONCRETE_SUBJECTS.has(normalizeSubjectForRelation(key))
      ? candidateUrls
      : [];
  }

  const cluster = candidateUrls.filter((url) => {
    const meta = resolveMeta(url);
    const photoClusters = resolvePhotoSubjectClusters(
      buildGalleryPhotoSearchable(meta, url),
      meta?.primarySubject,
    );
    for (const idx of captionClusters) {
      if (photoClusters.has(idx)) return true;
    }
    return false;
  });
  // Concrete product subject with zero cluster-aligned photos — never widen to unrelated SKUs.
  return cluster;
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
  if (
    productPhotoConflictPenalty(caption, searchable, {
      subjectKey: input.subjectKey,
      primarySubject: meta?.primarySubject,
    }) >= STRONG_MATCH_SCORE
  ) {
    return true;
  }
  const relation = canonicalSubjectRelationForMeta(input.subjectKey, meta);
  if (relation === 'conflict' && (meta?.subjectConfidence ?? 1) >= 0.4) {
    return true;
  }
  return false;
}

/**
 * Fingerprint index memo for ranking. Greedy mission assignment calls
 * rankPhotosForContent O(slots²) times with the SAME lookup + analysis
 * objects; rebuilding the regex-heavy index per call blocked the event loop.
 */
const RANK_FP_INDEX_CACHE = new WeakMap<
  Map<string, GalleryLookupEntry>,
  WeakMap<Record<string, GalleryPhotoMeta>, Map<string, GalleryLookupEntry>>
>();

function getRankFingerprintIndex(
  lookup: Map<string, GalleryLookupEntry>,
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
): Map<string, GalleryLookupEntry> {
  let byAnalysis = RANK_FP_INDEX_CACHE.get(lookup);
  if (!byAnalysis) {
    byAnalysis = new WeakMap();
    RANK_FP_INDEX_CACHE.set(lookup, byAnalysis);
  }
  const cached = byAnalysis.get(galleryAnalysis);
  if (cached) return cached;

  const fingerprintIndex = new Map<string, GalleryLookupEntry>();
  for (const [key, entry] of lookup) {
    fingerprintIndex.set(galleryMediaFingerprint(key), entry);
  }
  for (const [analysisKey, meta] of Object.entries(galleryAnalysis)) {
    const fp = galleryMediaFingerprint(analysisKey);
    if (!fingerprintIndex.has(fp)) {
      fingerprintIndex.set(fp, { displayUrl: analysisKey, analysisKey, meta });
    }
  }
  byAnalysis.set(galleryAnalysis, fingerprintIndex);
  return fingerprintIndex;
}

export function rankPhotosForContent(
  input: MatchPhotoInput,
  candidateUrls: string[],
  lookup: Map<string, GalleryLookupEntry>,
  excludeBases: Set<string> = new Set(),
  galleryAnalysis: Record<string, GalleryPhotoMeta> = {},
): PhotoMatchResult[] {
  const fingerprintIndex = getRankFingerprintIndex(lookup, galleryAnalysis);

  const results: PhotoMatchResult[] = [];
  const scopedCandidates = preferSubjectAlignedCandidates(
    candidateUrls,
    galleryAnalysis,
    input.subjectKey,
  );

  for (const url of scopedCandidates) {
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

  const baseIndex = getResolverIndex(galleryAnalysis).lookup;
  const metaForBase = (base: string): GalleryPhotoMeta | undefined =>
    galleryAnalysis[base] ?? baseIndex.get(base)?.meta;

  const assignedMeta = assignedUrls.map((url) => metaForBase(normalizeGalleryUrl(url)));

  let best: { url: string; diversity: number } | null = null;
  for (const url of candidateUrls) {
    const base = normalizeGalleryUrl(url);
    if (usedBases.has(base)) continue;
    const meta = metaForBase(base);
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

  /**
   * Subject reservation: photos that canonically match a still-pending slot's
   * concrete subject are held for that slot. Relaxed/diversity rounds must not
   * hand a sibling's only subject-aligned photo to a generic caption — that
   * starves the product slot even though the judge could still confirm it.
   */
  const buildSubjectReservations = (pending: PendingItem[]): Map<string, Set<string>> => {
    const reserved = new Map<string, Set<string>>();
    // Resolve each candidate's metadata once — not per (slot × photo) pair.
    const metaByUrl = new Map<string, { base: string; meta: GalleryPhotoMeta | undefined }>();
    for (const url of candidateUrls) {
      metaByUrl.set(url, {
        base: normalizeGalleryUrl(url),
        meta: resolveGalleryPhotoMeta(url, galleryAnalysis, candidateUrls),
      });
    }
    for (const { key, input } of pending) {
      const subjectKey = String(input.subjectKey ?? '').trim();
      if (!subjectKey || NON_CONCRETE_SUBJECTS.has(normalizeSubjectForRelation(subjectKey))) {
        continue;
      }
      for (const { base, meta } of metaByUrl.values()) {
        if (usedMissionWide.has(base)) continue;
        if (canonicalSubjectRelationForMeta(subjectKey, meta) !== 'match') continue;
        const owners = reserved.get(base) ?? new Set<string>();
        owners.add(key);
        reserved.set(base, owners);
      }
    }
    return reserved;
  };

  const greedyAssignRound = (
    pending: PendingItem[],
    minScore: number,
    reservations?: Map<string, Set<string>>,
  ): PendingItem[] => {
    const remaining: PendingItem[] = [];

    const photoAllowedFor = (itemKey: string, url: string): boolean => {
      if (!reservations) return true;
      const owners = reservations.get(normalizeGalleryUrl(url));
      return !owners || owners.has(itemKey);
    };

    // Rank each pending item ONCE. Scores do not depend on the exclude set
    // (it is only a candidate filter), so "re-rank after every commit" is
    // exactly equivalent to filtering the precomputed ranking by the used
    // pool — but O(N) full rankings instead of O(N²), which kept a 20-slot ×
    // 120-photo mission from blocking the event loop for minutes.
    const rankedByKey = new Map<string, PhotoMatchResult[]>();
    for (const { key, input } of pending) {
      rankedByKey.set(
        key,
        rankPhotosForContent(input, candidateUrls, lookup, excludeBases, galleryAnalysis),
      );
    }

    const live = [...pending];
    while (live.length > 0) {
      let pick: {
        listIndex: number;
        key: string;
        result: PhotoMatchResult;
        order: number;
      } | null = null;

      for (let i = 0; i < live.length; i += 1) {
        const { key, order } = live[i]!;
        const top = rankedByKey.get(key)?.find(
          (r) => !usedMissionWide.has(normalizeGalleryUrl(r.url)) && photoAllowedFor(key, r.url),
        );
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
        remaining.push(...live);
        break;
      }

      assigned.set(pick.key, pick.result);
      usedMissionWide.add(normalizeGalleryUrl(pick.result.url));
      assignedUrls.push(pick.result.url);
      live.splice(pick.listIndex, 1);
    }

    return remaining;
  };

  let pending: PendingItem[] = items.map((item, order) => ({ ...item, order }));

  // Phase 1: semantic matches at production threshold. No reservations —
  // strength-first greedy already gives the best subject match to its owner.
  pending = greedyAssignRound(pending, strictMinScore);

  // Phase 2: still-unassigned — only non-strict captions may take weaker semantic matches.
  // Nightlife / food / beauty captions stay unassigned rather than accept a wrong photo.
  // Photos subject-reserved for a pending sibling are off limits.
  if (pending.length > 0 && RELAXED_MATCH_SCORE < strictMinScore) {
    const reservations = buildSubjectReservations(pending);
    const relaxedEligible = pending.filter(
      (p) => !captionRequiresStrictGalleryMatch(p.input.caption ?? '', p.input.headline ?? ''),
    );
    const strictHeld = pending.filter(
      (p) => captionRequiresStrictGalleryMatch(p.input.caption ?? '', p.input.headline ?? ''),
    );
    const stillOpen = greedyAssignRound(relaxedEligible, RELAXED_MATCH_SCORE, reservations);
    pending = [...strictHeld, ...stillOpen];
  }

  // Phase 3: tag-diversity fallback — never for strict theme captions; never hard
  // mismatches; never a photo subject-reserved for a pending sibling slot.
  const diversityReservations = buildSubjectReservations(pending);
  for (const { key, input } of pending) {
    const reservedForOthers = new Set(usedMissionWide);
    for (const [base, owners] of diversityReservations) {
      if (!owners.has(key)) reservedForOthers.add(base);
    }
    const fallback = pickMissionDiverseFallbackPhoto(
      candidateUrls,
      reservedForOthers,
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
  const agentMeta = galleryAnalysis[agentBase]
    ?? Object.entries(galleryAnalysis).find(([k]) => normalizeGalleryUrl(k) === agentBase)?.[1];
  if (isHardGalleryThemeMismatch(input, agentMeta, agentUrl)) {
    return best;
  }
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
