import { describe, expect, it } from 'vitest';
import {
  fitMissionOverlayToTemplateBudget,
  fitPunchlineUnderBudget,
  resolveOverlayHeadlineWordBudget,
  resolveTemplateOverlayCopyBudget,
} from '../fal-caption-headline';

describe('template-locked overlay budget', () => {
  it('raises tiny sampleHeadline footprints to the mission punch floor', () => {
    const budget = resolveOverlayHeadlineWordBudget({
      channel: 'feed_post',
      designIntensity: 'bold_editorial',
      sampleHeadline: 'Harika',
    });
    // A one-word library sample must not clamp the char budget below what its
    // own word budget needs in Turkish ("Zeytinyağının Faydaları" = 23).
    expect(budget.maxWords).toBe(3);
    expect(budget.maxLen).toBeGreaterThanOrEqual(23);

    const longer = resolveOverlayHeadlineWordBudget({
      channel: 'feed_post',
      designIntensity: 'bold_editorial',
      sampleHeadline: 'Gün Batımı',
    });
    expect(longer.maxWords).toBe(3);
    expect(longer.maxLen).toBe(budget.maxLen);
  });

  it('keeps two-word Turkish phrases whole under an inferred zone', () => {
    // Live regression: a 14-char library sample clamped these to "Faydaları"
    // and "Yorumları" — the bare possessive tail, painted on canvas.
    for (const [headline, channel] of [
      ['Zeytinyağının Faydaları', 'feed_post'],
      ['Müşterilerimizin Yorumları!', 'story'],
    ] as const) {
      const budget = resolveOverlayHeadlineWordBudget({
        channel,
        designIntensity: 'balanced',
        sampleHeadline: 'Yaz Lezzetleri',
      });
      expect(fitPunchlineUnderBudget(headline, budget.maxLen, budget.maxWords))
        .toBe(headline.replace(/!$/, ''));
    }
  });

  it('falls back to channel budget when sample missing', () => {
    const budget = resolveOverlayHeadlineWordBudget({
      channel: 'feed_post',
      designIntensity: 'balanced',
    });
    expect(budget.maxWords).toBe(3);
    expect(budget.maxLen).toBe(36);
  });

  it('fits long mission headline into sample type zone (with punch floor)', () => {
    const fitted = fitMissionOverlayToTemplateBudget({
      headline: 'Harika bir deneyim sizi bekliyor Bodrum’da',
      subtitle: 'Mutlu misafirimizden bir yorum satırı',
      channel: 'feed_post',
      designIntensity: 'balanced',
      sampleHeadline: 'Harika',
      sampleSubtitle: 'Misafir',
      showSubline: true,
    });
    expect(fitted.budget.source).toBe('template_sample');
    expect(fitted.headline.length).toBeLessThanOrEqual(fitted.budget.headline.maxLen);
    expect(fitted.headline.split(/\s+/).length).toBeLessThanOrEqual(3);
    expect(fitted.headline.length).toBeGreaterThan(0);
  });

  it('falls back to mission scene punch (not Cocktail) when long English headline cannot fit DJ Night zone', () => {
    const fitted = fitMissionOverlayToTemplateBudget({
      headline: 'Get ready for a sunset like no other!',
      subtitle: 'Join us for a vibrant evening at Yula Bodrum.',
      channel: 'feed_post',
      designIntensity: 'designed',
      sampleHeadline: 'DJ Night',
      sampleSubtitle: 'Bu Gece',
      showSubline: true,
    });
    expect(fitted.headline.length).toBeGreaterThan(0);
    expect(fitted.headline.toLowerCase()).not.toMatch(/cocktail|kokteyl/);
    expect(fitted.headline.toLowerCase()).toMatch(/sunset|glow|dj|night|altın|altin|saat/);
  });

  it('drops subtitle when showSubline is false', () => {
    const budget = resolveTemplateOverlayCopyBudget({
      channel: 'feed_post',
      sampleHeadline: 'Atmosfer',
      sampleSubtitle: 'Bodrum',
      showSubline: false,
    });
    expect(budget.showSubline).toBe(false);
    expect(budget.subtitle).toBeNull();

    const fitted = fitMissionOverlayToTemplateBudget({
      headline: 'Seni Bekliyoruz Sahilde',
      subtitle: 'Gel hemen',
      channel: 'feed_post',
      sampleHeadline: 'Atmosfer',
      sampleSubtitle: 'Bodrum',
      showSubline: false,
    });
    expect(fitted.subtitle).toBeUndefined();
    expect(fitted.headline.length).toBeLessThanOrEqual(fitted.budget.headline.maxLen);
    expect(fitted.headline.length).toBeGreaterThan(0);
  });
});
