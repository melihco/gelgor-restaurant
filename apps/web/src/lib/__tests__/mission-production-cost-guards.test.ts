import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clampMissionProductionIdeaCount,
  MISSION_CONTENT_PRODUCTION_IDEA_CAP,
  resolveGroundedDesignMaxAttempts,
  resolveGroundedSoftAcceptScore,
  shouldKeepGroundedInsteadOfIdeogram,
} from '@/lib/mission-production-cost-guards';

describe('mission-production-cost-guards', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('caps content-scoped idea production at 12', () => {
    expect(clampMissionProductionIdeaCount(20)).toBe(MISSION_CONTENT_PRODUCTION_IDEA_CAP);
    expect(clampMissionProductionIdeaCount(8)).toBe(8);
    expect(clampMissionProductionIdeaCount(0)).toBe(0);
  });

  it('soft-caps grounded GPT attempts for agency/economy', () => {
    expect(resolveGroundedDesignMaxAttempts({
      productionTier: 'agency',
      groundedOnly: true,
    })).toBe(2);
    expect(resolveGroundedDesignMaxAttempts({
      productionTier: 'economy',
      groundedOnly: true,
    })).toBe(2);
    expect(resolveGroundedDesignMaxAttempts({
      productionTier: 'premium',
      groundedOnly: true,
    })).toBe(3);
    expect(resolveGroundedDesignMaxAttempts({
      libraryQualityFalFallback: true,
      groundedOnly: true,
      productionTier: 'premium',
    })).toBe(1);
  });

  it('soft-accepts mid-retry only on cost-scoped tiers', () => {
    expect(resolveGroundedSoftAcceptScore('agency')).toBe(6);
    expect(resolveGroundedSoftAcceptScore('premium')).toBeNull();
  });

  it('keeps readable grounded frames instead of Ideogram on cost-scoped tiers', () => {
    expect(shouldKeepGroundedInsteadOfIdeogram({
      productionTier: 'agency',
      textValidated: true,
      grafikerScore: 4,
    })).toBe(true);
    expect(shouldKeepGroundedInsteadOfIdeogram({
      productionTier: 'premium',
      textValidated: true,
      grafikerScore: 4,
    })).toBe(false);
    expect(shouldKeepGroundedInsteadOfIdeogram({
      productionTier: 'premium',
      textValidated: true,
      grafikerScore: 5,
    })).toBe(true);
    expect(shouldKeepGroundedInsteadOfIdeogram({
      productionTier: 'agency',
      textValidated: false,
    })).toBe(false);
  });
});
