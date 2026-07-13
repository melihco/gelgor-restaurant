import { describe, expect, it } from 'vitest';
import {
  buildBrandIntelligenceDirectives,
  buildDesignTemplateGenerationJobs,
  resolveDefaultTemplateHeroPhoto,
} from '@/lib/brand-design-template-engine';
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

describe('buildBrandIntelligenceDirectives', () => {
  it('injects brand learning and intensity signals into template prompts', () => {
    const directives = buildBrandIntelligenceDirectives({
      workspaceId: 'tenant-1',
      sector: 'beach_club',
      brandName: 'Scorpios',
      brandColors: { primary: '#111111', accent: '#C9A86A' },
      location: 'Bodrum',
      brandIntelligence: {
        description: 'Premium beach club with sunset dining and music rituals.',
        brandTone: 'quiet luxury, editorial, warm',
        visualDna: 'sun-washed photography, refined type, no neon flyer energy',
        contentPillars: ['sunset dining', 'music', 'beach ritual'],
        defaultCtas: ['Rezervasyon yap'],
        vibeProfile: { mood: 'Aegean luxury', energy: 'soft' },
      },
      galleryPhotoUrls: [],
      galleryAnalysis: {},
    }, 'story', 'elegant_light');

    const prompt = directives.join(' ');
    expect(prompt).toContain('BRAND DESIGN CONTRACT');
    expect(prompt).toContain('VISUAL DNA — PRIMARY DESIGN SOURCE');
    expect(prompt).toContain('Scorpios');
    expect(prompt).toContain('Premium beach club');
    expect(prompt).toContain('sunset dining');
    expect(prompt).toContain('story uses elegant_light');
    expect(prompt).toContain('LAYOUT RECIPE');
    expect(prompt).toContain('reusable brand recipes');
  });
});

describe('resolveDefaultTemplateHeroPhoto', () => {
  it('prefers true venue aerial over paddleboard product shot', () => {
    const hero = resolveDefaultTemplateHeroPhoto({
      workspaceId: 'tenant-1',
      sector: 'beach_club',
      brandName: 'Yula',
      brandColors: { primary: '#0ea5a4', accent: '#fff' },
      galleryPhotoUrls: [
        'https://brand.example.com/paddle.webp',
        'https://brand.example.com/terrace.webp',
      ],
      galleryAnalysis: {
        'https://brand.example.com/paddle.webp': {
          suggestedAssetType: 'venue_reference',
          description: 'paddleboard on turquoise water haute boards product',
        },
        'https://brand.example.com/terrace.webp': {
          suggestedAssetType: 'venue_reference',
          description: 'aerial terrace infinity pool venue sunset view',
        },
      },
    });
    expect(hero?.url).toContain('terrace');
  });
});
