/**
 * Idea → gallery photo selection for Premium Editorial.
 * Reuses the shared gallery-photo-matcher SSOT (same as auto-produce).
 */

import {
  matchPhotoToContent,
  type GalleryPhotoMeta,
  type PhotoMatchResult,
} from '@/lib/gallery-photo-matcher';
import { isUsableGalleryPhotoUrl } from '@/lib/media-url';

export interface PremiumEditorialGalleryMatchInput {
  headline: string;
  caption?: string | null;
  contentTopic?: string | null;
  mood?: string | null;
  campaignGoal?: string | null;
  businessType?: string | null;
  outputType?: 'post' | 'story' | 'square' | null;
  /** Explicit pin (mission referenceUrl / form selection) — preferred when usable. */
  preferredUrl?: string | null;
  candidateUrls: string[];
  galleryAnalysis?: Record<string, GalleryPhotoMeta> | null;
  excludeUrls?: string[];
  tieBreakSeed?: number;
}

export interface PremiumEditorialGalleryMatchResult {
  primaryUrl: string | null;
  supportingUrls: string[];
  match: PhotoMatchResult | null;
  warnings: string[];
}

function contentTypeForOutput(outputType?: string | null): string {
  if (outputType === 'story') return 'instagram_story';
  if (outputType === 'square') return 'instagram_post';
  return 'instagram_post';
}

/**
 * Pick the best gallery photo(s) for this idea/topic.
 * Primary photo drives GPT images.edit; supporting urls are secondary grounding.
 */
export function resolvePremiumEditorialGalleryMatch(
  input: PremiumEditorialGalleryMatchInput,
): PremiumEditorialGalleryMatchResult {
  const warnings: string[] = [];
  const candidates = (input.candidateUrls ?? [])
    .map((u) => String(u).trim())
    .filter((u) => isUsableGalleryPhotoUrl(u));

  if (!candidates.length) {
    warnings.push('No usable gallery candidates for Premium Editorial.');
    return { primaryUrl: null, supportingUrls: [], match: null, warnings };
  }

  const preferred = input.preferredUrl?.trim();
  const preferredUsable = preferred && isUsableGalleryPhotoUrl(preferred) ? preferred : null;

  const headline = (input.headline || input.contentTopic || '').trim();
  const caption = [
    input.caption,
    input.contentTopic,
    input.campaignGoal,
  ].filter(Boolean).join(' — ').trim() || headline;

  const analysis = input.galleryAnalysis ?? {};
  const hasAnalysis = Object.keys(analysis).length > 0;

  // Prefer semantic idea→photo match when gallery analysis exists.
  // Production-loop pin is a fallback when rematch is weak/missing.
  const matchPool = preferredUsable && !candidates.includes(preferredUsable)
    ? [preferredUsable, ...candidates]
    : candidates;

  const match = hasAnalysis
    ? matchPhotoToContent(
      {
        caption,
        headline,
        mood: input.mood ?? undefined,
        contentType: contentTypeForOutput(input.outputType),
        businessType: input.businessType ?? undefined,
        visualDirection: input.contentTopic ?? undefined,
        strategicPurpose: input.campaignGoal ?? undefined,
      },
      matchPool,
      analysis,
      {
        excludeUrls: input.excludeUrls,
        displayUrls: matchPool,
        bestEffort: true,
        tieBreakSeed: input.tieBreakSeed,
        minScore: 0,
      },
    )
    : null;

  // Production-loop pin is SSOT when usable — never swap on moderate rematch score.
  // Rematch only fills the gap when the pin is missing/unreachable.
  if (preferredUsable) {
    if (match?.url && match.url !== preferredUsable) {
      warnings.push(
        `Semantic rematch ignored (score=${match.score}) — honoring production-loop gallery pin.`,
      );
    }
    const supporting = matchPool.filter((u) => u !== preferredUsable).slice(0, 3);
    return {
      primaryUrl: preferredUsable,
      supportingUrls: supporting,
      match: match?.url === preferredUsable
        ? match
        : {
          url: preferredUsable,
          score: 100,
          reason: 'preferred_pin',
          confidence: 1,
        },
      warnings,
    };
  }

  if (match?.url) {
    warnings.push(
      `Gallery match is weak (score=${match.score}) for "${headline.slice(0, 48)}" — using best available.`,
    );
    return {
      primaryUrl: match.url,
      supportingUrls: matchPool.filter((u) => u !== match.url).slice(0, 3),
      match,
      warnings,
    };
  }

  warnings.push('Gallery matcher found no photo — falling back to first candidate.');
  return {
    primaryUrl: candidates[0] ?? null,
    supportingUrls: candidates.slice(1, 4),
    match: null,
    warnings,
  };
}

/** Collect candidate gallery URLs from brand context / theme / request pins. */
export function collectGalleryCandidates(opts: {
  selectedGalleryAssetUrl?: string | null;
  productAssetUrl?: string | null;
  venueAssetUrl?: string | null;
  brandContext?: Record<string, unknown> | null;
  brandReferenceImageUrls?: string[] | null;
  galleryAnalysis?: Record<string, GalleryPhotoMeta> | null;
}): string[] {
  const fromAnalysis = opts.galleryAnalysis ? Object.keys(opts.galleryAnalysis) : [];
  const fromCtx = (() => {
    const raw = opts.brandContext?.reference_image_urls
      ?? opts.brandContext?.referenceImageUrls;
    if (Array.isArray(raw)) return raw.map(String);
    return [];
  })();
  const pins = [
    opts.selectedGalleryAssetUrl,
    opts.productAssetUrl,
    opts.venueAssetUrl,
    ...(opts.brandReferenceImageUrls ?? []),
  ].filter((u): u is string => Boolean(u?.trim()));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of [...pins, ...fromAnalysis, ...fromCtx]) {
    const t = String(u).trim();
    if (!t || seen.has(t) || !isUsableGalleryPhotoUrl(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
