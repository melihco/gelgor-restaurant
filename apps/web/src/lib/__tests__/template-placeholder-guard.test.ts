import { describe, it, expect } from 'vitest';
import {
  collectTemplatePlaceholderTexts,
  textMatchesTemplatePlaceholder,
} from '@/lib/template-placeholder-guard';

describe('template-placeholder-guard', () => {
  it('collects sample headline, subtitle, and template name', () => {
    expect(
      collectTemplatePlaceholderTexts({
        sampleHeadline: 'El işi süreç reel',
        sampleSubtitle: 'Sınırlı süre',
        templateName: 'Craft Reel',
      }),
    ).toEqual(['El işi süreç reel', 'Sınırlı süre', 'Craft Reel']);
  });

  it('detects placeholder leak on canvas', () => {
    expect(
      textMatchesTemplatePlaceholder('El işi süreç reel', {
        sampleHeadline: 'El işi süreç reel',
        sampleSubtitle: 'Sınırlı süre',
        templateName: 'Craft Reel',
      }),
    ).toBe(true);
    expect(
      textMatchesTemplatePlaceholder('Datça zeytinyağı hasatı', {
        sampleHeadline: 'El işi süreç reel',
        sampleSubtitle: 'Sınırlı süre',
        templateName: 'Craft Reel',
      }),
    ).toBe(false);
  });
});
