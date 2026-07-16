import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/api-client', () => ({ apiClient: {} }));

import {
  shouldPollMissionFeedArtifacts,
  isMissionFeedProductionActive,
} from '../mobile-mission-progress';

describe('shouldPollMissionFeedArtifacts', () => {
  it('polls while an in-flight mission package is incomplete (no explicit kick needed)', () => {
    expect(shouldPollMissionFeedArtifacts({
      missionStatus: 'in_flight',
      feedPackageIncomplete: true,
      feedProductionActive: false,
    })).toBe(true);
  });

  it('polls approved missions the same as in-flight', () => {
    expect(shouldPollMissionFeedArtifacts({
      missionStatus: 'approved',
      feedPackageIncomplete: true,
      feedProductionActive: false,
    })).toBe(true);
  });

  it('polls a completed mission only while re-production is active', () => {
    expect(shouldPollMissionFeedArtifacts({
      missionStatus: 'completed',
      feedPackageIncomplete: true,
      feedProductionActive: true,
    })).toBe(true);
    expect(shouldPollMissionFeedArtifacts({
      missionStatus: 'completed',
      feedPackageIncomplete: true,
      feedProductionActive: false,
    })).toBe(false);
  });

  it('never polls once the package is complete', () => {
    for (const missionStatus of ['in_flight', 'approved', 'completed']) {
      expect(shouldPollMissionFeedArtifacts({
        missionStatus,
        feedPackageIncomplete: false,
        feedProductionActive: true,
      })).toBe(false);
    }
  });

  it('ignores proposed / failed missions', () => {
    for (const missionStatus of ['proposed', 'failed', 'rejected']) {
      expect(shouldPollMissionFeedArtifacts({
        missionStatus,
        feedPackageIncomplete: true,
        feedProductionActive: true,
      })).toBe(false);
    }
  });
});

describe('isMissionFeedProductionActive', () => {
  it('treats a user kick as active production', () => {
    expect(isMissionFeedProductionActive({ userKicked: true })).toBe(true);
  });

  it('treats draining/queued factory states as active', () => {
    expect(isMissionFeedProductionActive({ productionState: 'draining' })).toBe(true);
    expect(isMissionFeedProductionActive({ productionState: 'queued' })).toBe(true);
    expect(isMissionFeedProductionActive({ productionState: 'complete' })).toBe(false);
  });
});
