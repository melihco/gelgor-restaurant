import { describe, expect, it } from 'vitest';
import {
  countAutoFixableGaps,
  formatCompleteGapsFeedback,
  type BrandGapItem,
} from '@/lib/brand-gap-analysis';

describe('brand gap completion feedback', () => {
  it('counts auto-fixable gaps separately from manual discovery', () => {
    const gaps: BrandGapItem[] = [
      { id: 'content_pillars_low', label: 'pillars', severity: 'medium' },
      { id: 'discovery_low', label: 'discovery', severity: 'medium' },
      { id: 'vibe_profile_missing', label: 'vibe', severity: 'low' },
    ];
    expect(countAutoFixableGaps(gaps)).toBe(1);
  });

  it('explains openai requirement when dna steps fail', () => {
    const text = formatCompleteGapsFeedback({
      resolvedCount: 0,
      steps: [{ id: 'brand_dna', ok: false, detail: 'no key' }],
      gapsAfter: [{ id: 'brand_dna_sparse', label: 'dna', severity: 'high' }],
    });
    expect(text).toContain('OPENAI_API_KEY');
  });
});
