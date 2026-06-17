/**
 * Marka / tenant bazlı template çeşitlendirme — aynı sektörde 10 müşteri aynı 5 slot almamalı.
 */
import type { BrandTemplateLibrary } from './brand-template-library';
import { deriveBrandTemplateLibrary } from './brand-template-library';
import {
  buildBrandFingerprint,
  hashTenantSeed,
  type BrandFingerprintInput,
} from './tenant-template-seed';

export { buildBrandFingerprint, type BrandFingerprintInput };

export function simulateTenantLibraries(input: {
  sector: string;
  kitId?: string;
  count?: number;
  tenantIds?: string[];
}): BrandTemplateLibrary[] {
  const count = Math.min(Math.max(input.count ?? 10, 1), 24);
  const libraries: BrandTemplateLibrary[] = [];

  for (let i = 0; i < count; i++) {
    const tenantId = input.tenantIds?.[i]
      ?? `sim_tenant_${input.sector}_${String(i + 1).padStart(2, '0')}`;
    const fingerprint = buildBrandFingerprint({
      tenantId,
      primaryColor: paletteFromSeed(hashTenantSeed(tenantId, 'primary')),
      accentColor: paletteFromSeed(hashTenantSeed(tenantId, 'accent')),
      headingFont: fontFromSeed(hashTenantSeed(tenantId, 'font')),
      motionStyle: i % 3 === 0 ? 'editorial' : i % 3 === 1 ? 'bold' : 'cinematic',
    });
    libraries.push(
      deriveBrandTemplateLibrary({
        kitId: input.kitId,
        sector: input.sector,
        tenantId,
        brandFingerprint: fingerprint,
      }),
    );
  }
  return libraries;
}

export interface DiversityReport {
  tenantCount: number;
  uniqueStoryTemplates: number;
  uniquePosterTemplates: number;
  storyCollisionPct: number;
  posterCollisionPct: number;
  worstStoryOverlap: { templateId: string; count: number } | null;
  perTenant: Array<{
    tenantId: string;
    storyIds: string[];
    posterIds: string[];
  }>;
}

export function scoreLibraryDiversity(libraries: BrandTemplateLibrary[]): DiversityReport {
  const storyCounts = new Map<string, number>();
  const posterCounts = new Map<string, number>();
  const perTenant = libraries.map((lib) => {
    const storyIds = lib.slots.map((s) => s.storyTemplateId).filter(Boolean) as string[];
    const posterIds = lib.slots.map((s) => s.posterTemplateId).filter(Boolean) as string[];
    for (const id of storyIds) storyCounts.set(id, (storyCounts.get(id) ?? 0) + 1);
    for (const id of posterIds) posterCounts.set(id, (posterCounts.get(id) ?? 0) + 1);
    return { tenantId: lib.tenantId ?? lib.kitId, storyIds, posterIds };
  });

  const totalStoryPicks = libraries.length * 5;
  const totalPosterPicks = libraries.reduce(
    (n, lib) => n + lib.slots.filter((s) => s.posterTemplateId).length,
    0,
  );
  const uniqueStory = storyCounts.size;
  const uniquePoster = posterCounts.size;

  let worstStory: DiversityReport['worstStoryOverlap'] = null;
  for (const [templateId, count] of storyCounts) {
    if (!worstStory || count > worstStory.count) worstStory = { templateId, count };
  }

  return {
    tenantCount: libraries.length,
    uniqueStoryTemplates: uniqueStory,
    uniquePosterTemplates: uniquePoster,
    storyCollisionPct: totalStoryPicks
      ? Math.round(((totalStoryPicks - uniqueStory) / totalStoryPicks) * 100)
      : 0,
    posterCollisionPct: totalPosterPicks
      ? Math.round(((totalPosterPicks - uniquePoster) / totalPosterPicks) * 100)
      : 0,
    worstStoryOverlap: worstStory,
    perTenant,
  };
}

function paletteFromSeed(seed: number): string {
  const hues = ['#1a2b4a', '#0f172a', '#1e3a5f', '#2d1b4e', '#1a3c34', '#3d2914', '#1f2937'];
  const accents = ['#c9a96e', '#e8b86d', '#38bdf8', '#f472b6', '#34d399', '#fb923c', '#a78bfa'];
  return seed % 2 === 0 ? hues[seed % hues.length]! : accents[seed % accents.length]!;
}

function fontFromSeed(seed: number): string {
  const fonts = ['Syne', 'Cormorant Garamond', 'Sora', 'Playfair Display', 'DM Sans', 'Outfit'];
  return fonts[seed % fonts.length]!;
}
