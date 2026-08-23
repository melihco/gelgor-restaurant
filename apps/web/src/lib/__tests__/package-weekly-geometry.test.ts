import { describe, expect, it } from 'vitest';

import {
  AGENCY_WEEKLY_PACKAGE_COUNTS,
  resolveContentIdeationIterations,
  resolveWeeklyPackageGeometry,
  STARTER_WEEKLY_PACKAGE_COUNTS,
} from '@/lib/package-weekly-geometry';
import {
  buildMissionProductionManifest,
  MISSION_WEEKLY_PACKAGE_COUNTS,
} from '@/lib/mission-production-manifest';
import {
  clampMissionProductionIdeaCount,
  MISSION_CONTENT_PRODUCTION_IDEA_CAP,
} from '@/lib/mission-production-cost-guards';

describe('package-weekly-geometry', () => {
  it('resolves Starter 5+8+1+2', () => {
    expect(resolveWeeklyPackageGeometry('starter')).toEqual(STARTER_WEEKLY_PACKAGE_COUNTS);
    expect(resolveWeeklyPackageGeometry('studio')).toEqual(STARTER_WEEKLY_PACKAGE_COUNTS);
    expect(STARTER_WEEKLY_PACKAGE_COUNTS.total).toBe(16);
    expect(STARTER_WEEKLY_PACKAGE_COUNTS.story).toBe(8);
    expect(STARTER_WEEKLY_PACKAGE_COUNTS.post).toBe(5);
    // The package widened on posts, not reels — reels are the costliest slot and
    // the one that stalls on provider quota.
    expect(STARTER_WEEKLY_PACKAGE_COUNTS.reel).toBe(2);
  });

  it('resolves Agency to the same 16 mix', () => {
    expect(resolveWeeklyPackageGeometry('growth')).toEqual(AGENCY_WEEKLY_PACKAGE_COUNTS);
    expect(resolveWeeklyPackageGeometry(null)).toEqual(AGENCY_WEEKLY_PACKAGE_COUNTS);
    expect(MISSION_WEEKLY_PACKAGE_COUNTS.total).toBe(16);
    expect(MISSION_WEEKLY_PACKAGE_COUNTS.story).toBe(8);
    expect(MISSION_WEEKLY_PACKAGE_COUNTS.reel).toBe(2);
  });

  it('never lets the production ceiling truncate a full package', () => {
    // A ceiling below the package total silently drops deliverables that were
    // already ideated and scheduled — at 12 a 16-slot week shipped 12.
    expect(MISSION_CONTENT_PRODUCTION_IDEA_CAP)
      .toBeGreaterThanOrEqual(AGENCY_WEEKLY_PACKAGE_COUNTS.total);
    expect(MISSION_CONTENT_PRODUCTION_IDEA_CAP)
      .toBeGreaterThanOrEqual(STARTER_WEEKLY_PACKAGE_COUNTS.total);
    expect(clampMissionProductionIdeaCount(AGENCY_WEEKLY_PACKAGE_COUNTS.total))
      .toBe(AGENCY_WEEKLY_PACKAGE_COUNTS.total);
  });

  it('defaults ideation iterations to 1 for all plans', () => {
    expect(resolveContentIdeationIterations('starter')).toBe(1);
    expect(resolveContentIdeationIterations('growth')).toBe(1);
  });
});

describe('buildMissionProductionManifest plan geometry', () => {
  it('builds 16 organic slots for starter without product showcase', () => {
    const manifest = buildMissionProductionManifest({
      missionId: 'test',
      packageSlug: 'starter',
      brandTheme: {
        product_showcase: { enabled: true, posts_per_mission: 1, stories_per_mission: 1 },
      },
    });
    const organic = manifest.slots.filter((s) => s.role !== 'paid_ad_creative' && s.role !== 'paid_ad_google_creative');
    expect(organic).toHaveLength(16);
    expect(organic.filter((s) => s.format === 'post')).toHaveLength(5);
    expect(organic.filter((s) => s.format === 'story')).toHaveLength(8);
    expect(organic.filter((s) => s.format === 'carousel')).toHaveLength(1);
    expect(organic.filter((s) => s.format === 'reel')).toHaveLength(2);
    expect(organic.some((s) => s.role.startsWith('product_showcase'))).toBe(false);
  });

  it('builds 16 organic slots for agency/growth', () => {
    const manifest = buildMissionProductionManifest({
      missionId: 'test',
      packageSlug: 'growth',
    });
    const organic = manifest.slots.filter((s) => !s.role.startsWith('paid_ad'));
    expect(organic).toHaveLength(16);
    expect(organic.filter((s) => s.format === 'story')).toHaveLength(8);
    expect(organic.filter((s) => s.format === 'reel')).toHaveLength(2);
  });
});
