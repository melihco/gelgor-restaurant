import { resolveIdeationHeadline } from '@/lib/production-idea-parse';
import { serverConfig } from '@/lib/server-config';
import {
  type PostTypeBucket,
  type UsedGalleryUsage,
  getMissionWideExcludeUrls,
  isGalleryUrlUsedInBatch,
  isGalleryUrlUsedInMission,
  markGalleryUrlUsedForPostType,
  normalizeGalleryUrl,
} from '@/lib/gallery-usage-tracker';
import {
  isHardGalleryThemeMismatch,
  matchPhotoToContent,
  pickMissionDiverseFallbackPhoto,
  preferSubjectAlignedCandidates,
  resolveBestGalleryUrl,
  type GalleryPhotoMeta,
} from '@/lib/gallery-photo-matcher';
import {
  filterUsableGalleryPhotoUrls,
  isUsableGalleryPhotoUrl,
} from '@/lib/media-url';
import { stripStockGalleryUrls } from '@/lib/media-url';
import {
  filterGalleryAnalysisKeys,
  parseBrandReferenceUrls,
} from '@/lib/gallery-upload';

export interface ParsedIdea {
  headline?: string;
  concept_title?: string;
  conceptTitle?: string;
  idea_title?: string;
  ideaTitle?: string;
  title?: string;
  hook?: string;
  caption_draft?: string;
  caption?: string;
  hashtags?: string[] | string;
  content_type?: string;
  content_kind?: string;
  selected_gallery_url?: string;
  visual_production_spec?: {
    selected_gallery_url?: string;
    image_edit_prompt?: string;
    treatment?: string;
    text_layers?: { title?: string; subtitle?: string; cta?: string };
    premium_composition?: {
      composition_type?: string;
      visual_story?: string;
      composition_description?: string;
      creative_direction?: string;
      visual_priority?: string;
      typography_approach?: string;
      object_treatment?: string;
      graphic_elements?: string[];
      layout_strategy?: string;
      motion_approach?: string;
      premium_score?: number;
    };
  };
  reel_motion_spec?: { camera_movement?: string; pace?: string; transition_style?: string; audio_mood?: string };
  treatment?: string;
  product_type?: string;
  subject?: string;
  visual_direction?: string;
  strategic_purpose?: string;
  template_use_case?: string;
  cta?: string;
  call_to_action?: string;
  subline?: string;
  /** Purpose-built on-canvas copy from content agent (preferred over ideation headline). */
  canva_field_copy?: Record<string, string>;
  canvaFieldCopy?: Record<string, string>;
  posting_time_suggestion?: string;
  mood?: string;
  photo_mood?: string;
  idea_index?: number;
  source_node?: string;
  /** BCD enriched scene description for art-director prompts. */
  scene_hint?: string;
  /** BCD enriched motion cue for reel/story video generation. */
  motion_cue?: string;
  /** User-uploaded photos from New Brief — must override gallery picker when set. */
  attached_photo_urls?: string[];
  /** When true, never repick from brand gallery — use attached_photo_urls only. */
  force_attached_photos?: boolean;
  event_details?: {
    artist_name?: string;
    date?: string;
    time?: string;
    venue_name?: string;
    venue_area?: string;
    tagline?: string;
    cta_text?: string;
  };
}

/** Nexus OutputArtifact.ContentUrl is varchar(1000) — never persist base64 carousel frames there. */
export const NEXUS_CONTENT_URL_MAX = 1000;

/** Gallery-only: never generate images from scratch in auto-produce (default true). */
export const GALLERY_ONLY = serverConfig.autoProduce.galleryOnly;

export const GALLERY_EXCLUDE_PATTERNS = [
  'logo', 'icon', 'banner', 'footer', 'menu.', 'harita', 'map', 'franchise',
];

export function getField(idea: ParsedIdea, ...keys: (keyof ParsedIdea)[]): string {
  for (const k of keys) {
    const v = idea[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

export function detectContentKind(idea: ParsedIdea): string {
  const ct = (idea.content_type || idea.content_kind || 'post').toLowerCase();
  if (ct.includes('story')) return 'instagram_story';
  if (ct.includes('reel')) return 'instagram_reel';
  if (ct.includes('carousel')) return 'instagram_carousel';
  if (ct.includes('canvas') || ct.includes('event') || ct.includes('announcement')) return 'instagram_canvas';
  return 'instagram_post';
}

export function nexusPersistableContentUrl(url: string, fallbackUrls: string[] = []): string {
  const candidates = [url, ...fallbackUrls].filter((u) => typeof u === 'string' && u.trim().length > 0);
  for (const u of candidates) {
    if (!u.startsWith('data:') && u.length <= NEXUS_CONTENT_URL_MAX) return u;
  }
  const http = candidates.find((u) => u.startsWith('http') && u.length <= NEXUS_CONTENT_URL_MAX);
  return http ?? candidates.find((u) => u.startsWith('http'))?.slice(0, NEXUS_CONTENT_URL_MAX) ?? url.slice(0, NEXUS_CONTENT_URL_MAX);
}

export function parseBrandGalleryPhotos(
  brandCtx: Record<string, unknown>,
  galleryAnalysis: Record<string, unknown>,
): { candidateUrls: string[]; meta: Record<string, GalleryPhotoMeta> } {
  const meta = galleryAnalysis as Record<string, GalleryPhotoMeta>;
  let refs = parseBrandReferenceUrls(brandCtx.reference_image_urls);

  refs = filterUsableGalleryPhotoUrls(
    refs.filter(u => !GALLERY_EXCLUDE_PATTERNS.some(p => u.toLowerCase().includes(p))),
  );

  const analysisKeys = filterGalleryAnalysisKeys(meta as Record<string, unknown>);
  let candidateUrls = refs.length > 0 ? refs : analysisKeys;

  candidateUrls = stripStockGalleryUrls(candidateUrls);

  return { candidateUrls, meta };
}

/**
 * Returns true if the caption/headline explicitly names a specific beauty
 * sub-service (nail, lash, hair, brow). Used to enforce strict gallery
 * matching — prevents a nail caption from receiving a lash photo via bestEffort.
 */
export function captionHasExplicitBeautyService(caption: string, headline: string): boolean {
  const text = `${caption} ${headline}`.toLowerCase();
  const EXPLICIT_BEAUTY_TERMS = [
    'nail', 'tırnak', 'tirnak', 'oje', 'manikür', 'manikyur', 'manicure', 'pedikür', 'pedicure', 'nail art',
    'jel tırnak', 'protez tırnak', 'kalıcı oje', 'kali oje',
    'lash', 'kirpik', 'eyelash', 'ipek kirpik', 'lash lift', 'lash extension', 'kirpik uzatma',
    'microblading', 'kaş tasarım', 'brow lamination',
    'saç kesim', 'saç boyama', 'haircut', 'balayage', 'highlight', 'keratin',
  ];
  return EXPLICIT_BEAUTY_TERMS.some(t => text.includes(t));
}

export function pickGalleryPhotoForIdea(
  caption: string,
  headline: string,
  mood: string,
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
  candidateUrls: string[],
  typeExcludeUrls: string[],
  batchExcludeUrls: string[],
  contentType?: string,
  agentUrl?: string | null,
  businessType?: string,
  productionStrict = true,
  tieBreakSeed?: number,
  globalUsageCounts?: ReadonlyMap<string, number>,
  subjectKey?: string,
): string | null {
  if (!candidateUrls.length) return null;

  const scopedCandidates = preferSubjectAlignedCandidates(
    candidateUrls,
    galleryAnalysis,
    subjectKey,
  );

  const input = {
    caption,
    headline,
    mood,
    contentType,
    businessType,
    ...(subjectKey ? { subjectKey } : {}),
    ...(globalUsageCounts ? { globalUsageCounts } : {}),
  };
  const displayUrls = scopedCandidates;
  const pickOpts = tieBreakSeed != null ? { tieBreakSeed } : {};

  const tryPick = (excludeUrls: string[], bestEffort = false): string | null => {
    const resolved = resolveBestGalleryUrl(
      input,
      scopedCandidates,
      galleryAnalysis,
      agentUrl,
      { excludeUrls, displayUrls, ...pickOpts },
    );
    if (resolved) return resolved.url;

    const match = matchPhotoToContent(input, scopedCandidates, galleryAnalysis, {
      excludeUrls,
      displayUrls,
      bestEffort,
      ...pickOpts,
    });
    return match?.url ?? null;
  };

  if (productionStrict) {
    return tryPick(typeExcludeUrls, false) ?? tryPick(batchExcludeUrls, false);
  }

  return (
    tryPick(typeExcludeUrls, false)
    ?? tryPick(typeExcludeUrls, true)
    ?? tryPick(batchExcludeUrls, true)
  );
}

/** Re-pick when the same gallery source was already used anywhere in this mission batch. */
export function repickGalleryIfDuplicateForType(input: {
  referenceUrl: string | null;
  caption: string;
  headline: string;
  mood: string;
  galleryAnalysis: Record<string, GalleryPhotoMeta>;
  candidateUrls: string[];
  typeExcludeUrls: string[];
  batchExcludeUrls: string[];
  postType: PostTypeBucket;
  galleryUsage: UsedGalleryUsage;
  batchUsedByType: Record<PostTypeBucket, string[]>;
  batchUsedMission?: Iterable<string>;
  businessType?: string;
  ideaIndex?: number;
  globalUsageCounts?: ReadonlyMap<string, number>;
  subjectKey?: string;
}): string | null {
  const { referenceUrl, postType } = input;
  if (!referenceUrl || !isUsableGalleryPhotoUrl(referenceUrl)) return referenceUrl;

  const missionUsed = isGalleryUrlUsedInMission(
    input.galleryUsage,
    input.batchUsedByType,
    input.batchUsedMission ?? [],
    referenceUrl,
  );
  const typeUsed = isGalleryUrlUsedInBatch(
    input.galleryUsage,
    input.batchUsedByType,
    referenceUrl,
    postType,
  );

  if (!missionUsed && !typeUsed) {
    return referenceUrl;
  }

  const missionExclude = getMissionWideExcludeUrls(
    input.galleryUsage,
    input.batchUsedByType,
    input.batchUsedMission ?? [],
  );

  const repicked = pickGalleryPhotoForIdea(
    input.caption,
    input.headline,
    input.mood,
    input.galleryAnalysis,
    input.candidateUrls,
    missionExclude,
    missionExclude,
    postType,
    null,
    input.businessType,
    false,
    input.ideaIndex,
    input.globalUsageCounts,
    input.subjectKey,
  );

  if (repicked && normalizeGalleryUrl(repicked) !== normalizeGalleryUrl(referenceUrl)) {
    console.warn(
      `[auto-produce] duplicate mission gallery photo — repicked for "${input.headline.slice(0, 48)}"`,
    );
    return repicked;
  }

  const diverse = pickMissionDiverseFallbackPhoto(
    input.candidateUrls,
    new Set(missionExclude.map(normalizeGalleryUrl)),
    input.galleryAnalysis,
    missionExclude,
    {
      caption: input.caption,
      headline: input.headline,
      mood: input.mood,
      contentType: input.postType,
      businessType: input.businessType,
      ...(input.subjectKey ? { subjectKey: input.subjectKey } : {}),
    },
  );
  if (diverse?.url && normalizeGalleryUrl(diverse.url) !== normalizeGalleryUrl(referenceUrl)) {
    console.warn(
      `[auto-produce] duplicate mission gallery photo — diversity fallback for "${input.headline.slice(0, 48)}"`,
    );
    return diverse.url;
  }

  // Prefer leaving a duplicate over shipping a semantically wrong photo.
  return referenceUrl;
}

/**
 * After a hard caption↔photo theme veto, try up to N unused alternatives with
 * `subjectKey` preference. Never re-forces a rejected agent URL.
 */
export function rematchGalleryAfterHardThemeConflict(input: {
  caption: string;
  headline: string;
  mood: string;
  galleryAnalysis: Record<string, GalleryPhotoMeta>;
  candidateUrls: string[];
  excludeUrls: string[];
  rejectedUrl: string;
  contentType?: string;
  businessType?: string;
  subjectKey?: string;
  maxAttempts?: number;
  globalUsageCounts?: ReadonlyMap<string, number>;
  tieBreakSeed?: number;
}): string | null {
  const rejected = new Set([normalizeGalleryUrl(input.rejectedUrl)]);
  const maxAttempts = Math.max(1, input.maxAttempts ?? 5);
  const matchInput = {
    caption: input.caption,
    headline: input.headline,
    mood: input.mood,
    contentType: input.contentType,
    businessType: input.businessType,
    ...(input.subjectKey ? { subjectKey: input.subjectKey } : {}),
    ...(input.globalUsageCounts ? { globalUsageCounts: input.globalUsageCounts } : {}),
  };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const exclude = [
      ...input.excludeUrls,
      ...[...rejected],
    ];
    const url = pickGalleryPhotoForIdea(
      input.caption,
      input.headline,
      input.mood,
      input.galleryAnalysis,
      input.candidateUrls,
      exclude,
      exclude,
      input.contentType,
      null,
      input.businessType,
      true,
      input.tieBreakSeed != null ? input.tieBreakSeed + attempt + 1 : undefined,
      input.globalUsageCounts,
      input.subjectKey,
    );
    if (!url) return null;
    const base = normalizeGalleryUrl(url);
    if (rejected.has(base)) return null;
    const meta = input.galleryAnalysis[base]
      ?? Object.entries(input.galleryAnalysis).find(([k]) => normalizeGalleryUrl(k) === base)?.[1];
    if (isHardGalleryThemeMismatch(matchInput, meta, url)) {
      rejected.add(base);
      continue;
    }
    return url;
  }
  return null;
}

/** Pick 1–2 extra gallery photos for multi-photo story layouts (excludes primary). */
export function pickSupplementaryGalleryPhotos(
  caption: string,
  headline: string,
  mood: string,
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
  candidateUrls: string[],
  primaryUrl: string,
  batchExcludeUrls: string[],
  count: number,
  contentType?: string,
  businessType?: string,
  subjectKey?: string,
): string[] {
  const extras: string[] = [];
  const exclude = [...batchExcludeUrls, primaryUrl];

  for (let i = 0; i < count; i++) {
    const url = pickGalleryPhotoForIdea(
      caption,
      headline,
      mood,
      galleryAnalysis,
      candidateUrls,
      exclude,
      exclude,
      contentType,
      null,
      businessType,
      true,
      undefined,
      undefined,
      subjectKey,
    );
    if (!url || exclude.includes(url)) break;
    extras.push(url);
    exclude.push(url);
  }
  return extras;
}

/** Track original venue gallery URL — not R2/enhanced outputs — for per-batch dedupe. */
export function markSourceGalleryUsed(
  usage: UsedGalleryUsage,
  batchUsedByType: Record<PostTypeBucket, string[]>,
  url: string | null | undefined,
  postType: PostTypeBucket,
): void {
  if (!url || !isUsableGalleryPhotoUrl(url)) return;
  markGalleryUrlUsedForPostType(usage, url, postType);
  const base = normalizeGalleryUrl(url);
  if (!batchUsedByType[postType].some((u) => normalizeGalleryUrl(u) === base)) {
    batchUsedByType[postType].push(url);
  }
}

export function isCampaignContentIdea(idea: Record<string, unknown>): boolean {
  const useCase = String(idea.template_use_case || '').toLowerCase();
  if (useCase.includes('campaign') || useCase.includes('event') || useCase.includes('announcement')) {
    return true;
  }
  const headline = resolveIdeationHeadline(idea);
  const caption = String(idea.caption_draft || idea.caption || '');
  return /\b(%\d+|indirim|kampanya|davet|bilet|gece|party|dj)\b/i.test(`${headline} ${caption}`);
}

export function buildEventCanvasPrompt(opts: {
  headline: string;
  caption: string;
  brandName: string;
  location?: string;
  vibeProfile?: Record<string, unknown>;
  mood?: string;
}): string {
  const vibe = opts.vibeProfile ?? {};
  const palette = (vibe.palette as Record<string, string> | undefined) ?? {};
  const typography = (vibe.typography as Record<string, string> | undefined) ?? {};
  const composition = (vibe.composition as Record<string, string> | undefined) ?? {};
  const grading = (vibe.grading as Record<string, string> | undefined) ?? {};
  const sourceAccounts: string[] = Array.isArray(vibe.source_accounts) ? vibe.source_accounts : [];
  const antiPatterns: string[] = Array.isArray(vibe.anti_patterns) ? vibe.anti_patterns : [];

  const primary = palette.primary ?? '#1A2B4A';
  const accent = palette.accent ?? '#E8C87A';
  const neutral = palette.neutral ?? '#F5F0E8';
  const paletteDesc = palette.palette_description ?? '';

  const headlineFont = typography.headline_font ?? typography.heading_personality ?? typography.headline_style ?? 'elegant serif';
  const bodyFont = typography.body_font ?? typography.body_personality ?? typography.body_style ?? 'clean sans-serif';
  const letterSpacing = typography.letter_spacing ?? typography.text_overlay_density ?? 'wide tracking';
  const typographyNotes = typography.notes ?? typography.typography_role ?? '';

  const framingRules = composition.framing_rules ?? 'minimalist, generous whitespace';
  const gradingLook = grading.look ?? 'golden_hour';

  const lines = [
    `Instagram event announcement card for ${opts.brandName}${opts.location ? ` · ${opts.location}` : ''}.`,
    `This is a DESIGNED TYPOGRAPHY CARD — no real photographs, only graphic design elements.`,
    ``,
    `═══ VISUAL CANVAS ═══`,
    `Background: full-bleed color wash using brand palette.`,
    `Primary background color: ${primary}.`,
    `Accent color for graphic elements and borders: ${accent}.`,
    `Text color: ${neutral} or high-contrast variant.`,
    paletteDesc ? `Palette mood: ${paletteDesc}.` : '',
    `Color grading inspiration: ${gradingLook} — apply as subtle gradient overlay if needed.`,
    ``,
    `═══ TYPOGRAPHY LAYOUT ═══`,
    `Headline (hero text, largest element): "${opts.headline}"`,
    `  Font style: ${headlineFont}, ${letterSpacing}.`,
    `Body/supporting text: pull the key detail or CTA from this caption — "${opts.caption.slice(0, 120)}"`,
    `  Font style: ${bodyFont}.`,
    typographyNotes ? `Typography notes: ${typographyNotes}.` : '',
    `Brand anchor (bottom of card): "${opts.brandName}"${opts.location ? ` · ${opts.location}` : ''} — small, refined.`,
    ``,
    `═══ COMPOSITION ═══`,
    `Format: 4:5 portrait (1080×1350px equivalent), social-media native.`,
    `Layout rule: ${framingRules}.`,
    `Generous whitespace — let the typography breathe.`,
    `Subtle graphic accent: thin line, geometric shape, or botanical element in ${accent}.`,
    sourceAccounts.length ? `Aesthetic reference quality: ${sourceAccounts.map(a => '@' + a).join(', ')} — refined, editorial.` : '',
    opts.mood ? `Mood: ${opts.mood}.` : '',
    ``,
    `═══ STRICT RULES ═══`,
    `DO NOT: add photographs of people, food, or real locations.`,
    `DO NOT: use generic stock-style gradients (blue-to-purple, etc.).`,
    antiPatterns.length ? `AVOID: ${antiPatterns.join(', ')}.` : '',
    `DO: use only the brand palette colors listed above.`,
    `DO: keep it editorial, minimal, premium — agency-grade graphic design.`,
    `Result: a scroll-stopping event announcement that feels like it came from a luxury brand studio.`,
  ].filter(Boolean);

  return lines.join('\n');
}
