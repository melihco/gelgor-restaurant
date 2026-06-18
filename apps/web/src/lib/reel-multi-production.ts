/**
 * Multi-photo Runway reel — strategy selection + payload helpers.
 * Used by auto-produce, MissionContentFactory, AutoProductionFeed.
 */

import { sanitizePhotoDescriptionForRunway } from '@/lib/runway-scene-from-gallery';
import type { ReelPacing } from '@/lib/sector-production-profile';

export type RunwayReelStrategy = 'single' | 'multi_ref' | 'sequential';

export interface MultiReelPhotoInput {
  url: string;
  description?: string;
  tags?: string[];
}

const CDN_HOSTS = ['cdninstagram.com', 'fbcdn.net', 'scontent-'];

export const RUNWAY_CLIP_COST_USD = 0.25;

export function isUsableReelPhotoUrl(url: string): boolean {
  const u = url.trim();
  if (!u.startsWith('http')) return false;
  return !CDN_HOSTS.some((h) => u.includes(h));
}

/** Pick montage vs blend vs single photo Runway path. */
export function resolveRunwayReelStrategy(input: {
  photoCount: number;
  transitionStyle?: string;
  treatment?: string;
  templateUseCase?: string;
  mood?: string;
  contentType?: string;
  /** Sector profile pacing — fast_cut biases sequential montage. */
  reelPacing?: ReelPacing | string;
  /** Brand-level override — single | sequential | multi_ref */
  strategyOverride?: RunwayReelStrategy;
}): RunwayReelStrategy {
  if (input.strategyOverride) return input.strategyOverride;
  if (input.photoCount < 2) return 'single';

  const pacing = String(input.reelPacing ?? '').toLowerCase();
  const trans = (input.transitionStyle ?? '').toLowerCase();
  const ctx = [
    input.treatment ?? '',
    input.templateUseCase ?? '',
    input.mood ?? '',
    input.contentType ?? '',
    pacing,
  ].join(' ').toLowerCase();

  // Slow-burn sectors: prefer one continuous clip unless montage explicitly requested.
  if (
    (pacing === 'slow_burn' || /\bslow\b/.test(pacing))
    && !/montage|sequential|hard.?cut|multi.?clip/.test(trans)
    && input.photoCount >= 2
  ) {
    return 'single';
  }

  // Explicit opt-in to legacy multi_ref (gen4_turbo only uses the first image anyway).
  if (/multi_ref|blend_only|single_frame_blend/.test(trans)) {
    return 'multi_ref';
  }

  if (/montage|sequential|hard.?cut|wipe|slide|story.?beat|multi.?clip/.test(trans)) {
    return 'sequential';
  }

  if (pacing === 'fast_cut' && input.photoCount >= 2) {
    return 'sequential';
  }

  if (
    input.photoCount >= 2
    && /behind|menu|gallery|recap|tour|service|product|spotlight|ugc|social.?proof|carousel|multi/.test(ctx)
  ) {
    return 'sequential';
  }

  if (input.photoCount >= 2 && /energetic|dynamic|night|event|dj|party|fast_cut/.test(ctx)) {
    return 'sequential';
  }

  // Default: 2+ gallery photos → one Runway clip per frame (true multi-photo reel).
  return 'sequential';
}

export function estimateRunwayReelCostUsd(
  strategy: RunwayReelStrategy,
  photoCount: number,
): number {
  if (strategy === 'single') return RUNWAY_CLIP_COST_USD;
  if (strategy === 'multi_ref') return RUNWAY_CLIP_COST_USD;
  return RUNWAY_CLIP_COST_USD * Math.min(Math.max(photoCount, 2), 3);
}

export function maxPhotosForStrategy(strategy: RunwayReelStrategy): number {
  if (strategy === 'sequential') return 3;
  if (strategy === 'multi_ref') return 4;
  return 1;
}

/**
 * Classify a photo into a montage depth level based on its description + tags.
 *
 * Returns:
 *  1 — close / detail (product close-up, food, texture, ingredient)
 *  2 — medium / process (service, behind-the-scenes, action, preparation)
 *  3 — wide / establishing (interior, exterior, venue, landscape, atmosphere)
 *
 * Default 2 (medium) when unclassifiable.
 */
function montageDepthlevel(desc: string, tags: string[]): 1 | 2 | 3 {
  const text = `${desc} ${tags.join(' ')}`.toLowerCase();
  const isClose = /\b(close.?up|detail|texture|ingredient|dish|plate|product|macro|item|cup|glass|hand|skin|surface|label|packaging)\b/.test(text);
  const isWide = /\b(interior|exterior|venue|room|space|hall|lobby|terrace|garden|view|landscape|street|facade|rooftop|pool|bar.?area|dining.?area|atmosphere)\b/.test(text);
  if (isClose) return 1;
  if (isWide) return 3;
  return 2;
}

/**
 * Sort photos for a cinematic montage progression:
 *   detail/close → process/medium → wide/establishing
 * This creates natural visual storytelling flow.
 */
function sortMontagePhotos(inputs: MultiReelPhotoInput[]): MultiReelPhotoInput[] {
  if (inputs.length <= 1) return inputs;
  return [...inputs].sort((a, b) => {
    const da = montageDepthlevel(a.description ?? '', a.tags ?? []);
    const db = montageDepthlevel(b.description ?? '', b.tags ?? []);
    return da - db;
  });
}

export function buildMultiReelPhotoInputs(
  urls: string[],
  galleryMeta: Record<string, { description?: string; contentTags?: string[]; tags?: string[] }>,
  normalizeUrl: (u: string) => string,
): MultiReelPhotoInput[] {
  const out: MultiReelPhotoInput[] = [];
  for (const raw of urls) {
    if (!isUsableReelPhotoUrl(raw)) continue;
    const entry = galleryMeta[raw]
      ?? Object.entries(galleryMeta).find(([k]) => normalizeUrl(k) === normalizeUrl(raw))?.[1];
    const tags = Array.isArray(entry?.contentTags)
      ? entry!.contentTags!
      : Array.isArray(entry?.tags)
        ? entry!.tags!
        : [];
    const desc = entry?.description
      ? sanitizePhotoDescriptionForRunway(entry.description)
      : '';
    out.push({
      url: raw,
      description: desc || undefined,
      tags: tags.slice(0, 12),
    });
    if (out.length >= 4) break;
  }
  // Apply cinematic montage ordering: close/detail → process/medium → wide/establishing
  return sortMontagePhotos(out);
}

export interface GenerateMultiReelRequest {
  workspaceId: string;
  photos: MultiReelPhotoInput[];
  headline: string;
  caption: string;
  brandName: string;
  brandLocation?: string;
  vibeProfile?: Record<string, unknown>;
  brandThemeGrading?: { look?: string; lut_directive?: string };
  strategy: 'multi_ref' | 'sequential';
  ratio?: string;
  duration?: number;
  /** VPS / scene brief visual direction (English-safe slice fed to director). */
  agentVisualDirection?: string;
  cameraMotion?: string;
  businessType?: string;
  productType?: string;
  strategicPurpose?: string;
  missionBrief?: string;
}

export async function callGenerateMultiReel(
  baseUrl: string,
  body: GenerateMultiReelRequest,
  timeoutMs = 280_000,
): Promise<{ videoUrl: string | null; strategy: string; photoCount: number; error?: string }> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/generate-multi-reel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      videoUrl: null,
      strategy: body.strategy,
      photoCount: body.photos.length,
      error: (data as { error?: string }).error ?? `HTTP ${res.status}`,
    };
  }
  return {
    videoUrl: ((data as { videoUrl?: string }).videoUrl ?? null) as string | null,
    strategy: String((data as { strategy?: string }).strategy ?? body.strategy),
    photoCount: Number((data as { photoCount?: number }).photoCount ?? body.photos.length),
    error: (data as { error?: string }).error,
  };
}
