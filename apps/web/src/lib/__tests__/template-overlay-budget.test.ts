import { describe, expect, it } from 'vitest';
import {
  fitMissionOverlayToTemplateBudget,
  resolveOverlayHeadlineWordBudget,
  resolveTemplateOverlayCopyBudget,
} from '../fal-caption-headline';

describe('template-locked overlay budget', () => {
  it('locks maxLen/maxWords to sampleHeadline footprint', () => {
    const budget = resolveOverlayHeadlineWordBudget({
      channel: 'feed_post',
      designIntensity: 'bold_editorial',
      sampleHeadline: 'Harika',
    });
    expect(budget.maxLen).toBe(6);
    expect(budget.maxWords).toBe(1);

    const longer = resolveOverlayHeadlineWordBudget({
      channel: 'feed_post',
      designIntensity: 'bold_editorial',
      sampleHeadline: 'Gün Batımı',
    });
    expect(longer.maxWords).toBe(2);
    expect(longer.maxLen).toBe('Gün Batımı'.length);
  });

  it('falls back to channel budget when sample missing', () => {
    const budget = resolveOverlayHeadlineWordBudget({
      channel: 'feed_post',
      designIntensity: 'balanced',
    });
    expect(budget.maxWords).toBe(3);
    expect(budget.maxLen).toBe(36);
  });

  it('fits long mission headline into sample type zone', () => {
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
    expect(fitted.headline.length).toBeLessThanOrEqual(6);
    expect(fitted.headline.split(/\s+/).length).toBeLessThanOrEqual(1);
    expect(fitted.subtitle?.length).toBeLessThanOrEqual('Misafir'.length);
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
    expect(fitted.headline.length).toBeLessThanOrEqual('Atmosfer'.length);
  });
});
