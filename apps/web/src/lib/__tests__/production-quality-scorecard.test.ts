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

  it('hard blocks grafiker_pass false', () => {
    const card = buildProductionQualityScorecard(stubArtifact({}), {
      grafiker_score: 6,
      grafiker_pass: false,
    });
    expect(card.hardBlock).toBe(true);
    expect(card.hardBlockReason).toContain('Tasarım kalitesi');
  });

  it('hard blocks low grafiker score without explicit pass', () => {
    const card = buildProductionQualityScorecard(stubArtifact({}), {
      grafiker_score: 5,
    });
    expect(card.hardBlock).toBe(true);
  });

  it('allows grafiker pass true even with moderate score edge case', () => {
    const card = buildProductionQualityScorecard(stubArtifact({}), {
      grafiker_score: 9,
      grafiker_pass: true,
    });
    expect(card.hardBlock).toBe(false);
  });

  it('hard blocks typography_text_valid false', () => {
    const card = buildProductionQualityScorecard(stubArtifact({}), {
      typography_text_valid: false,
      grafiker_pass: true,
      grafiker_score: 9,
    });
    expect(card.hardBlock).toBe(true);
    expect(card.hardBlockReason).toContain('metin');
  });

  it('does not block when typography flag is absent (legacy artifact)', () => {
    const card = buildProductionQualityScorecard(stubArtifact({}), {
      grafiker_pass: true,
      grafiker_score: 9,
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
