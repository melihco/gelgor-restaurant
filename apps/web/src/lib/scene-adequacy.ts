/**
 * Scene adequacy — does the matched gallery photo support the post's scene need?
 *
 * Separate from caption keyword match score in gallery-photo-matcher.
 * Multi-tenant: requirements come from caption/headline/mood/sceneHint only.
 */

import {
  buildGalleryLookup,
  rankPhotosForContentSeeded,
  type GalleryPhotoMeta,
  type MatchPhotoInput,
  type PhotoMatchResult,
} from '@/lib/gallery-photo-matcher';
import { normalizeGalleryUrl } from '@/lib/gallery-usage-tracker';
import {
  metaMatchesEnvironment,
  type VenueEnvironmentId,
  type VenueGalleryFingerprint,
} from '@/lib/venue-gallery-fingerprint';

export type SceneRequirementId =
  | 'night'
  | 'crowd'
  | 'outdoor'
  | 'indoor'
  | 'food_hero'
  | 'breakfast'
  | 'sea_view'
  | 'garden';

export interface SceneRequirement {
  id: SceneRequirementId;
  weight: number;
}

export interface SceneAdequacyResult {
  score: number;
  maxScore: number;
  ratio: number;
  met: SceneRequirementId[];
  missing: SceneRequirementId[];
  conflicts: string[];
}

const REQUIREMENT_SIGNALS: ReadonlyArray<{
  id: SceneRequirementId;
  weight: number;
  terms: readonly string[];
  env?: VenueEnvironmentId;
}> = [
  { id: 'night', weight: 22, terms: ['gece', 'night', 'evening', 'akşam', 'aksam', 'yoğunluk', 'yogunluk', 'after dark'], env: 'night_ambiance' },
  { id: 'crowd', weight: 18, terms: ['yoğun', 'yogun', 'kalabalık', 'kalabalik', 'crowd', 'busy', 'dolu', 'full house'], env: 'crowd_social' },
  { id: 'breakfast', weight: 20, terms: ['kahvaltı', 'kahvalti', 'breakfast', 'serpme', 'brunch', 'sabah'], env: 'product_closeup' },
  { id: 'food_hero', weight: 16, terms: ['menü', 'menu', 'lezzet', 'yemek', 'dish', 'plate', 'tabak', 'gastronomi'], env: 'product_closeup' },
  { id: 'outdoor', weight: 14, terms: ['bahçe', 'bahce', 'garden', 'terrace', 'teras', 'açık hava', 'acik hava', 'outdoor'], env: 'garden' },
  { id: 'indoor', weight: 12, terms: ['iç mekan', 'ic mekan', 'interior', 'salon', 'indoor'], env: 'indoor_dining' },
  { id: 'sea_view', weight: 16, terms: ['deniz', 'sea', 'sahil', 'beach', 'marina', 'waterfront'], env: 'sea_view' },
  { id: 'garden', weight: 14, terms: ['bahçe', 'bahce', 'garden', 'ağaç', 'agac', 'mandalina', 'portakal', 'orchard'], env: 'garden' },
];

/** Minimum adequacy ratio (0–1) before we attempt a scene-aware gallery re-pick. */
export const SCENE_ADEQUACY_REPICK_THRESHOLD = 0.45;

/** Minimum improvement vs current pick to swap photos. */
export const SCENE_REPICK_MIN_GAIN = 12;

function mergeBriefText(parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Extract weighted scene requirements from post copy (no brand-specific logic). */
export function extractSceneRequirements(input: {
  caption?: string;
  headline?: string;
  mood?: string;
  sceneHint?: string;
  strategicPurpose?: string;
}): SceneRequirement[] {
  const text = mergeBriefText([
    input.headline,
    input.caption,
    input.mood,
    input.sceneHint,
    input.strategicPurpose,
  ]);
  if (!text) return [];

  const found: SceneRequirement[] = [];
  for (const spec of REQUIREMENT_SIGNALS) {
    if (spec.terms.some((t) => text.includes(t.toLowerCase()))) {
      found.push({ id: spec.id, weight: spec.weight });
    }
  }

  // Dedupe by id — keep highest weight
  const byId = new Map<SceneRequirementId, SceneRequirement>();
  for (const req of found) {
    const prev = byId.get(req.id);
    if (!prev || req.weight > prev.weight) byId.set(req.id, req);
  }
  return [...byId.values()];
}

function requirementEnv(id: SceneRequirementId): VenueEnvironmentId | undefined {
  return REQUIREMENT_SIGNALS.find((s) => s.id === id)?.env;
}

function photoMeetsRequirement(meta: GalleryPhotoMeta, reqId: SceneRequirementId): boolean {
  const env = requirementEnv(reqId);
  if (env && metaMatchesEnvironment(meta, env)) return true;

  const spec = REQUIREMENT_SIGNALS.find((s) => s.id === reqId);
  if (!spec) return false;
  const searchable = [
    ...(meta.contentTags ?? []),
    meta.description ?? '',
    meta.mood ?? '',
    meta.usageContext ?? '',
  ].join(' ').toLowerCase();
  return spec.terms.some((t) => searchable.includes(t.toLowerCase()));
}

/** Score how well a single photo supports the post's scene requirements. */
export function evaluatePhotoSceneAdequacy(
  meta: GalleryPhotoMeta | undefined,
  requirements: SceneRequirement[],
  fingerprint?: VenueGalleryFingerprint | null,
): SceneAdequacyResult {
  if (!requirements.length) {
    return { score: 100, maxScore: 100, ratio: 1, met: [], missing: [], conflicts: [] };
  }
  if (!meta) {
    return {
      score: 0,
      maxScore: requirements.reduce((s, r) => s + r.weight, 0),
      ratio: 0,
      met: [],
      missing: requirements.map((r) => r.id),
      conflicts: [],
    };
  }

  let score = 0;
  const maxScore = requirements.reduce((s, r) => s + r.weight, 0);
  const met: SceneRequirementId[] = [];
  const missing: SceneRequirementId[] = [];
  const conflicts: string[] = [];

  for (const req of requirements) {
    if (photoMeetsRequirement(meta, req.id)) {
      score += req.weight;
      met.push(req.id);
    } else {
      missing.push(req.id);
    }
  }

  // Fingerprint conflict: post asks for sea but brand gallery has no sea evidence
  if (fingerprint && fingerprint.confidence !== 'low') {
    const needsSea = requirements.some((r) => r.id === 'sea_view');
    const hasSeaInGallery = fingerprint.present.some((p) => p.id === 'sea_view');
    if (needsSea && !hasSeaInGallery) {
      conflicts.push('caption implies sea but gallery has no sea_view photos');
      score = Math.max(0, score - 25);
    }
    const needsGarden = requirements.some((r) => r.id === 'garden' || r.id === 'outdoor');
    const hasGarden = fingerprint.present.some((p) =>
      p.id === 'garden' || p.id === 'terrace',
    );
    if (needsGarden && hasGarden && metaMatchesEnvironment(meta, 'sea_view') && !metaMatchesEnvironment(meta, 'garden')) {
      conflicts.push('outdoor/garden brief but photo reads as sea_view');
      score = Math.max(0, score - 20);
    }
  }

  return {
    score,
    maxScore,
    ratio: maxScore > 0 ? score / maxScore : 1,
    met,
    missing,
    conflicts,
  };
}

export function evaluateSelectedPhotoAdequacy(input: {
  photoUrl: string;
  galleryMeta: Record<string, GalleryPhotoMeta>;
  requirements: SceneRequirement[];
  fingerprint?: VenueGalleryFingerprint | null;
}): SceneAdequacyResult {
  const base = normalizeGalleryUrl(input.photoUrl);
  const meta = input.galleryMeta[input.photoUrl]
    ?? Object.entries(input.galleryMeta).find(
      ([k]) => normalizeGalleryUrl(k) === base,
    )?.[1];
  return evaluatePhotoSceneAdequacy(meta, input.requirements, input.fingerprint);
}

/**
 * Re-rank gallery for scene adequacy when the current pick is weak for the brief.
 * Returns a better photo only when adequacy gain is meaningful.
 */
export function repickGalleryForSceneAdequacy(input: {
  currentUrl: string;
  caption: string;
  headline?: string;
  mood?: string;
  sceneHint?: string;
  businessType?: string;
  galleryPhotos: string[];
  galleryMeta: Record<string, GalleryPhotoMeta>;
  excludeUrls?: string[];
  tieBreakSeed?: number;
  fingerprint?: VenueGalleryFingerprint | null;
  requirements?: SceneRequirement[];
}): { pick: PhotoMatchResult; adequacy: SceneAdequacyResult; previousAdequacy: SceneAdequacyResult } | null {
  const requirements = input.requirements ?? extractSceneRequirements({
    caption: input.caption,
    headline: input.headline,
    mood: input.mood,
    sceneHint: input.sceneHint,
  });
  if (!requirements.length) return null;

  const previousAdequacy = evaluateSelectedPhotoAdequacy({
    photoUrl: input.currentUrl,
    galleryMeta: input.galleryMeta,
    requirements,
    fingerprint: input.fingerprint,
  });
  if (previousAdequacy.ratio >= SCENE_ADEQUACY_REPICK_THRESHOLD) return null;

  const matchInput: MatchPhotoInput = {
    caption: [input.headline, input.sceneHint, input.caption].filter(Boolean).join(' '),
    headline: input.headline,
    mood: input.mood,
    businessType: input.businessType,
  };

  const lookup = buildGalleryLookup(input.galleryMeta, input.galleryPhotos);
  const excludeBases = new Set(
    [input.currentUrl, ...(input.excludeUrls ?? [])].map(normalizeGalleryUrl),
  );

  const ranked = rankPhotosForContentSeeded(
    matchInput,
    input.galleryPhotos,
    lookup,
    input.tieBreakSeed ?? 0,
    excludeBases,
    input.galleryMeta,
  );

  let best: { pick: PhotoMatchResult; adequacy: SceneAdequacyResult } | null = null;

  for (const candidate of ranked.slice(0, 12)) {
    const base = normalizeGalleryUrl(candidate.url);
    const meta = input.galleryMeta[candidate.url]
      ?? Object.entries(input.galleryMeta).find(
        ([k]) => normalizeGalleryUrl(k) === base,
      )?.[1];
    const adequacy = evaluatePhotoSceneAdequacy(meta, requirements, input.fingerprint);
    const combined = candidate.score + adequacy.score * 0.6;
    if (!best || combined > best.pick.score + best.adequacy.score * 0.6) {
      best = { pick: candidate, adequacy };
    }
  }

  if (!best) return null;
  if (best.pick.url === input.currentUrl) return null;

  const gain = best.adequacy.score - previousAdequacy.score;
  if (gain < SCENE_REPICK_MIN_GAIN && best.adequacy.ratio < SCENE_ADEQUACY_REPICK_THRESHOLD) {
    return null;
  }

  return {
    pick: best.pick,
    adequacy: best.adequacy,
    previousAdequacy,
  };
}
