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

  it('shop + beach: adaptive identity turns a rejected GIS into a warning', () => {
    for (const extra of [
      { adaptive_scene: true, gallery_identity_seed: true },
      {
        ai_visual_standard: { adaptive_scene: true },
        gallery_photo_meta: {
          visibleLabelText: 'YULA',
          description: 'Labeled bottle on a set table',
          suggestedAssetType: 'product_image',
        },
      },
    ]) {
      const card = buildProductionQualityScorecard(stubArtifact({}), {
        gallery_match_score: 12,
        ...extra,
      });
      expect(card.hardBlock).toBe(false);
      expect(card.softWarnings.join(' ')).toMatch(/restage/i);
    }
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

  it('shop + beach: explicit typography fail hard-blocks even when Grafiker is mid', () => {
    for (const extra of [
      { grafiker_score: 6, pipeline: 'premium_editorial' },
      { grafiker_score: 5, pipeline: 'fal_design', fal_designer_produced: true },
    ]) {
      const card = buildProductionQualityScorecard(stubArtifact({}), {
        typography_text_valid: false,
        ...extra,
      });
      expect(card.hardBlock).toBe(true);
      expect(card.hardBlockReason).toContain('metin');
    }
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

  it('shop gallery carousel: undesigned swipe is not hard-blocked at score 3', () => {
    const card = buildProductionQualityScorecard(stubArtifact({}), {
      pipeline: 'carousel_gallery',
      production_role: 'organic_carousel',
      fal_designer_produced: false,
      grafiker_score: 3,
      grafiker_pass: true,
    });
    expect(card.hardBlock).toBe(false);
    expect(card.softWarnings.join(' ')).toMatch(/carousel|kapak/i);
  });

  it('beach gallery carousel: undesigned swipe is not hard-blocked at score 3', () => {
    const card = buildProductionQualityScorecard(stubArtifact({}), {
      pipeline: 'carousel_gallery',
      production_role: 'organic_carousel',
      grafiker_score: 3,
    });
    expect(card.hardBlock).toBe(false);
  });

  it('designed carousel cover still hard-blocks at the floor', () => {
    const card = buildProductionQualityScorecard(stubArtifact({}), {
      pipeline: 'carousel_gallery',
      production_role: 'organic_carousel',
      fal_designer_produced: true,
      grafiker_score: 3,
    });
    expect(card.hardBlock).toBe(true);
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
