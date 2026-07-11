/**
 * Multi-photo reel helpers — gallery photo inputs for fal I2V production.
 */

import { sanitizePhotoDescriptionForVideo } from '@/lib/gallery-scene-package';
import type { ReelPacing } from '@/lib/sector-production-profile';

export type ReelMontageStrategy = 'single' | 'multi_ref' | 'sequential';

export interface MultiReelPhotoInput {
  url: string;
  description?: string;
  tags?: string[];
  microMotions?: string[];
  sceneMoment?: string;
}

const CDN_HOSTS = ['cdninstagram.com', 'fbcdn.net', 'scontent-'];

export function isUsableReelPhotoUrl(url: string): boolean {
  const u = url.trim();
  if (u.startsWith('/api/media')) return true;
  if (!u.startsWith('http')) return false;
  return !CDN_HOSTS.some((h) => u.includes(h));
}

/** Pick montage vs single-photo reel path (fal uses primary frame; montage is UI-only hint). */
export function resolveReelMontageStrategy(input: {
  photoCount: number;
  transitionStyle?: string;
  treatment?: string;
  templateUseCase?: string;
  mood?: string;
  contentType?: string;
  reelPacing?: ReelPacing | string;
  strategyOverride?: ReelMontageStrategy;
}): ReelMontageStrategy {
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

  if (
    (pacing === 'slow_burn' || /\bslow\b/.test(pacing))
    && !/montage|sequential|hard.?cut|multi.?clip/.test(trans)
    && input.photoCount >= 2
  ) {
    return 'single';
  }

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

  return 'sequential';
}

export function maxPhotosForStrategy(strategy: ReelMontageStrategy): number {
  if (strategy === 'sequential') return 3;
  if (strategy === 'multi_ref') return 4;
  return 1;
}

function montageDepthlevel(desc: string, tags: string[]): 1 | 2 | 3 {
  const text = `${desc} ${tags.join(' ')}`.toLowerCase();
  const isClose = /\b(close.?up|detail|texture|ingredient|dish|plate|product|macro|item|cup|glass|hand|skin|surface|label|packaging)\b/.test(text);
  const isWide = /\b(interior|exterior|venue|room|space|hall|lobby|terrace|garden|view|landscape|street|facade|rooftop|pool|bar.?area|dining.?area|atmosphere)\b/.test(text);
  if (isClose) return 1;
  if (isWide) return 3;
  return 2;
}

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
      ? sanitizePhotoDescriptionForVideo(entry.description)
      : '';
    out.push({
      url: raw,
      description: desc || undefined,
      tags: tags.slice(0, 12),
    });
    if (out.length >= 4) break;
  }
  return sortMontagePhotos(out);
}
