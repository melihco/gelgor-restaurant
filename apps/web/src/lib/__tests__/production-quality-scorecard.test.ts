import { describe, it, expect } from 'vitest';
import { buildProductionQualityScorecard } from '../production-quality-scorecard';
import { resolveApprovalQualityGateFromMeta } from '../approval-quality-gate';
import type { OutputArtifact } from '@/types';

const stubArtifact = (meta: Record<string, unknown>): OutputArtifact => ({
  id: 'test-artifact',
  content: '{}',
  metadata: meta,
} as OutputArtifact);

describe('buildProductionQualityScorecard hard blocks', () => {
  it('hard blocks rejected gallery match', () => {
    const card = buildProductionQualityScorecard(stubArtifact({}), {
      gallery_match_score: 12,
    });
    expect(card.hardBlock).toBe(true);
    expect(card.hardBlockReason).toContain('eşleşmiyor');
  });

  it('hard blocks an observed score at the floor when grafiker_score is absent', () => {
    const card = buildProductionQualityScorecard(stubArtifact({}), {
      grafiker_observed_score: 3,
    });
    expect(card.hardBlock).toBe(true);
    expect(card.grafikerScore).toBe(3);
  });

  it('hard blocks a score at or below the hard floor', () => {
    const card = buildProductionQualityScorecard(stubArtifact({}), {
      grafiker_score: 4,
    });
    expect(card.hardBlock).toBe(true);
    expect(card.hardBlockReason).toContain('Tasarım kalitesi');
  });

  // Once the reviewer could actually fetch frames, the pass threshold withheld
  // 61% of live output — including clean, legible frames it scored 5. Below the
  // threshold is now an opinion to surface, not a publish decision.
  it('warns instead of blocking between the hard floor and the pass threshold', () => {
    const card = buildProductionQualityScorecard(stubArtifact({}), {
      grafiker_score: 6,
      grafiker_pass: false,
    });
    expect(card.hardBlock).toBe(false);
    expect(card.softWarnings.join(' ')).toContain('6/10');
  });

  it('warns on a low score carrying no explicit pass flag', () => {
    const card = buildProductionQualityScorecard(stubArtifact({}), {
      grafiker_score: 5,
    });
    expect(card.hardBlock).toBe(false);
    expect(card.softWarnings.join(' ')).toContain('5/10');
  });

  it('allows grafiker pass true even with moderate score edge case', () => {
    const card = buildProductionQualityScorecard(stubArtifact({}), {
      grafiker_score: 9,
      grafiker_pass: true,
    });
    expect(card.hardBlock).toBe(false);
  });

  it('hard blocks typography_text_valid false when the text validator ran', () => {
    const card = buildProductionQualityScorecard(stubArtifact({}), {
      typography_text_valid: false,
      text_validated: true,
      grafiker_pass: true,
      grafiker_score: 9,
    });
    expect(card.hardBlock).toBe(true);
    expect(card.hardBlockReason).toContain('metin');
  });

  it('hard blocks typography_text_valid false when no score can explain it', () => {
    const card = buildProductionQualityScorecard(stubArtifact({}), {
      typography_text_valid: false,
    });
    expect(card.hardBlock).toBe(true);
    expect(card.hardBlockReason).toContain('metin');
  });

  // On the gallery and premium routes the flag is derived from the Grafiker pass
  // flag, so blocking on it would reimpose the same uncalibrated threshold.
  it('warns when typography_text_valid only mirrors a below-threshold score', () => {
    const card = buildProductionQualityScorecard(stubArtifact({}), {
      typography_text_valid: false,
      grafiker_score: 6,
    });
    expect(card.hardBlock).toBe(false);
    expect(card.softWarnings.join(' ')).toContain('metin');
  });

  it('does not block when typography flag is absent (legacy artifact)', () => {
    const card = buildProductionQualityScorecard(stubArtifact({}), {
      grafiker_pass: true,
      grafiker_score: 9,
    });
    expect(card.hardBlock).toBe(false);
  });

  it('shop: text_validated false is "not checked", not invalid text', () => {
    const card = buildProductionQualityScorecard(stubArtifact({}), {
      text_validated: false,
      grafiker_pass: true,
      grafiker_score: 9,
      fal_designer_produced: true,
    });
    expect(card.hardBlock).toBe(false);
  });

  it('beach: text_validated false with a mid score stays a warning', () => {
    const card = buildProductionQualityScorecard(stubArtifact({}), {
      text_validated: false,
      grafiker_pass: false,
      grafiker_score: 6,
    });
    expect(card.hardBlock).toBe(false);
  });
});

describe('resolveApprovalQualityGateFromMeta', () => {
  it('mirrors scorecard hard block for preview rows', () => {
    const gate = resolveApprovalQualityGateFromMeta({
      grafiker_pass: false,
      grafiker_score: 4,
    });
    expect(gate.hardBlock).toBe(true);
    expect(gate.hardBlockReason).toBeTruthy();
  });
});
