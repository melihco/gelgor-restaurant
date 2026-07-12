import { describe, expect, it } from 'vitest';
import { buildDesignTemplateGenerationJobs } from '@/lib/brand-design-template-engine';
import type { DesignTemplatePreset } from '@/lib/brand-design-template-presets';

const specialDays = [
  { name: 'Yılbaşı', themeHint: 'festive', mmdd: '01-01', category: 'national', daysUntil: 10 },
  { name: '23 Nisan', themeHint: 'spring', mmdd: '04-23', category: 'national', daysUntil: 20 },
];

function eventPreset(catalogSlotKey?: string): DesignTemplatePreset {
  return {
    templateType: 'event_special',
    name: 'DJ gece teaser',
    format: 'post',
    intent: 'event',
    sampleHeadline: 'DJ Night',
    preferredAssetTypes: ['venue_reference'],
    matchKeywords: 'dj night beach',
    prominentLogo: true,
    catalogSlotKey,
  };
}

describe('buildDesignTemplateGenerationJobs', () => {
  it('expands legacy event_special without catalog slot into special-day jobs', () => {
    const jobs = buildDesignTemplateGenerationJobs([eventPreset()], specialDays, 4);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]?.special?.name).toBe('Yılbaşı');
    expect(jobs[1]?.special?.name).toBe('23 Nisan');
  });

  it('does not expand catalog-bound venue event slots', () => {
    const jobs = buildDesignTemplateGenerationJobs(
      [eventPreset('beach_club_dj_night_teaser_post')],
      specialDays,
      4,
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.special).toBeUndefined();
    expect(jobs[0]?.preset.catalogSlotKey).toBe('beach_club_dj_night_teaser_post');
  });

  it('keeps non-event presets as single jobs', () => {
    const jobs = buildDesignTemplateGenerationJobs(
      [{
        templateType: 'daily_story',
        name: 'Günlük',
        format: 'story',
        intent: 'daily',
        sampleHeadline: 'Gün batımı',
        preferredAssetTypes: ['venue_reference'],
        matchKeywords: 'sunset',
        prominentLogo: false,
        catalogSlotKey: 'beach_club_sunset_golden_story',
      }],
      specialDays,
    );
    expect(jobs).toHaveLength(1);
  });
});
