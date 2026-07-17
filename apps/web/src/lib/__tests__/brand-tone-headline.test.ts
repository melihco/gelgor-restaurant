import { describe, expect, it } from 'vitest';
import { preferBrandToneHeadline, scoreHeadlineForBrandTone } from '../brand-tone-headline';

describe('scoreHeadlineForBrandTone', () => {
  it('scores chill/beach language higher for chill brand tone', () => {
    const chill = scoreHeadlineForBrandTone('Sunset chill vibes', 'chill, beach, relax');
    const retail = scoreHeadlineForBrandTone('Son gün %50 indirim', 'chill, beach, relax');
    expect(chill).toBeGreaterThan(retail);
  });
});

describe('preferBrandToneHeadline', () => {
  it('swaps to a more on-tone alternative when gain is clear', () => {
    const next = preferBrandToneHeadline({
      current: 'Kampanya başladı',
      alternatives: ['Summer chill vibes'],
      brandTone: 'chill, summer, beach',
    });
    expect(next.toLowerCase()).toContain('chill');
  });
});
