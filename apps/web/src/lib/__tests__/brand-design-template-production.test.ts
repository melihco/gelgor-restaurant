import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MatchedDesignTemplate } from '@/lib/brand-design-template-matcher';

vi.mock('@/lib/brand-design-template-matcher', () => ({
  matchDesignTemplateToSlot: vi.fn(),
  recordDesignTemplateUsage: vi.fn(),
}));

vi.mock('@/lib/media-url', () => ({
  isUsableGalleryPhotoUrl: (u: string) => Boolean(u?.startsWith('https://')),
}));

import { matchDesignTemplateToSlot } from '@/lib/brand-design-template-matcher';
import {
  alignRemotionPosterWithFalTemplate,
  buildTemplateLayoutDirectives,
  bindBrandTemplateForFalProduction,
  isRemotionFalAlignedSlot,
  mapDesignTemplateTypeToContentIntent,
  pickTemplateReferenceUrls,
  resolveFalTemplateLockOptions,
} from '@/lib/brand-design-template-production';

const matched: MatchedDesignTemplate = {
  id: 'tmpl-1',
  templateType: 'daily_story',
  templateName: 'Günlük Story',
  format: 'story',
  vibe: 'neon_glow',
  galleryRef: 'https://cdn.example.com/gallery-a.jpg',
  prominentLogo: true,
  designSpecPrompt: 'Bold diagonal panel with neon headline block.',
  thumbnailUrl: 'https://cdn.example.com/preview-daily.jpg',
  brandColors: { primary: '#111', accent: '#f0f' },
  logoUrl: 'https://cdn.example.com/logo.png',
  directive: 'Stay consistent with Günlük Story.',
  sampleHeadline: 'Gün batımı',
  sampleSubtitle: 'Sınırlı süre',
  layoutPattern: 'diagonal_split_photo_left',
  designBriefDirectives: ['Upper headline zone with accent bar'],
  canvaArchetypeId: 'arc-01',
  canvaArchetypeName: 'Diagonal Split',
};

describe('buildTemplateLayoutDirectives', () => {
  it('includes layout recipe and mission copy without raw preview prompt', () => {
    const dirs = buildTemplateLayoutDirectives(matched, {
      headline: 'Datça erken hasat',
      subtitle: 'Sınırlı stok',
    });
    expect(dirs.some((d) => d.includes('LAYOUT TEMPLATE'))).toBe(true);
    expect(dirs.some((d) => d.includes('MISSION HEADLINE') && d.includes('Datça erken hasat'))).toBe(true);
    expect(dirs.some((d) => d.includes('FORBIDDEN ON-CANVAS TEXT') && d.includes('Gün batımı'))).toBe(true);
    expect(dirs.some((d) => d.includes('Bold diagonal panel'))).toBe(false);
    expect(dirs.some((d) => d.includes('second reference image'))).toBe(false);
    expect(dirs.some((d) => d.includes('TEXT LOCK'))).toBe(true);
  });
});

describe('resolveFalTemplateLockOptions', () => {
  it('locks caption and bumps grafiker when template matched', () => {
    const opts = resolveFalTemplateLockOptions({
      binding: {
        matched,
        lockedVibe: 'neon_glow',
        referencePhotoUrl: 'https://cdn.example.com/mission.jpg',
        styleReferenceUrl: matched.thumbnailUrl,
        brandDirectives: [],
        brandColors: matched.brandColors,
        logoUrl: matched.logoUrl,
        occasion: undefined,
      },
      baseGrafikerMaxRetries: 0,
      defaultCaptionAwareHeadline: true,
    });
    expect(opts.captionAwareHeadline).toBe(true);
    expect(opts.grafikerMaxRetries).toBe(1);
    expect(opts.requireTemplateStyleRef).toBe(false);
  });

  it('keeps defaults when no template matched', () => {
    const opts = resolveFalTemplateLockOptions({
      binding: {
        matched: null,
        lockedVibe: null,
        referencePhotoUrl: null,
        styleReferenceUrl: null,
        brandDirectives: [],
        brandColors: null,
        logoUrl: undefined,
        occasion: undefined,
      },
      baseGrafikerMaxRetries: 0,
      defaultCaptionAwareHeadline: true,
    });
    expect(opts.captionAwareHeadline).toBe(true);
    expect(opts.grafikerMaxRetries).toBe(0);
  });
});

describe('pickTemplateReferenceUrls', () => {
  it('returns mission photo only — never template preview thumbnail', () => {
    const urls = pickTemplateReferenceUrls({
      missionPhotoUrl: 'https://cdn.example.com/mission.jpg',
      matched,
      brandReferenceImageUrls: [],
    });
    expect(urls).toEqual(['https://cdn.example.com/mission.jpg']);
  });

  it('falls back to template gallery ref when mission photo missing', () => {
    const urls = pickTemplateReferenceUrls({
      missionPhotoUrl: null,
      matched,
      brandReferenceImageUrls: [],
    });
    expect(urls).toEqual(['https://cdn.example.com/gallery-a.jpg']);
  });
});

describe('bindBrandTemplateForFalProduction', () => {
  beforeEach(() => {
    vi.mocked(matchDesignTemplateToSlot).mockReset();
  });

  it('returns enriched binding when template matches', async () => {
    vi.mocked(matchDesignTemplateToSlot).mockResolvedValue(matched);
    const binding = await bindBrandTemplateForFalProduction({
      workspaceId: 'ws-yula',
      slotRole: 'fal_reel_motion',
      librarySlotKey: null,
      format: 'reel',
      caption: 'DJ gece seti bu akşam',
      missionReferenceUrl: 'https://cdn.example.com/mission.jpg',
      baseDirectives: ['base'],
      brandColors: { primary: '#000', accent: '#fff' },
      brandVibe: null,
    });
    expect(binding.matched?.templateType).toBe('daily_story');
    expect(binding.lockedVibe).toBe('neon_glow');
    expect(binding.brandColors?.accent).toBe('#f0f');
    expect(binding.brandDirectives.some((d) => d.includes('LAYOUT TEMPLATE'))).toBe(true);
  });

  it('prefers confirmed brand vibe over template snapshot', async () => {
    vi.mocked(matchDesignTemplateToSlot).mockResolvedValue(matched);
    const binding = await bindBrandTemplateForFalProduction({
      workspaceId: 'ws-beach',
      slotRole: 'fal_designed_post',
      librarySlotKey: null,
      format: 'post',
      missionReferenceUrl: 'https://cdn.example.com/mission.jpg',
      baseDirectives: [],
      brandColors: { primary: '#264653', accent: '#E9C46A' },
      brandVibe: 'warm_coastal',
    });
    expect(binding.lockedVibe).toBe('warm_coastal');
  });

  it('skips binding for ad-hoc brief', async () => {
    const binding = await bindBrandTemplateForFalProduction({
      workspaceId: 'ws-yula',
      slotRole: 'fal_designed_post',
      librarySlotKey: null,
      format: 'post',
      adHocBrief: true,
      missionReferenceUrl: 'https://cdn.example.com/mission.jpg',
      baseDirectives: ['only-base'],
      brandColors: { primary: '#000', accent: '#fff' },
      brandVibe: null,
    });
    expect(binding.matched).toBeNull();
    expect(binding.brandDirectives).toEqual(['only-base']);
    expect(matchDesignTemplateToSlot).not.toHaveBeenCalled();
  });
});

describe('mapDesignTemplateTypeToContentIntent', () => {
  it('maps campaign templates to campaign_offer', () => {
    expect(mapDesignTemplateTypeToContentIntent('campaign_announcement')).toBe('campaign_offer');
    expect(mapDesignTemplateTypeToContentIntent('seasonal_promo')).toBe('campaign_offer');
  });

  it('returns undefined for unknown types', () => {
    expect(mapDesignTemplateTypeToContentIntent('unknown_type')).toBeUndefined();
  });
});

describe('isRemotionFalAlignedSlot', () => {
  it('matches designed_post and designed_typography on fal_design pipeline', () => {
    expect(isRemotionFalAlignedSlot({ pipeline: 'fal_design', slot_role: 'designed_post' })).toBe(true);
    expect(isRemotionFalAlignedSlot({ pipeline: 'fal_design', slot_role: 'designed_typography' })).toBe(true);
    expect(isRemotionFalAlignedSlot({ pipeline: 'fal_design', slot_role: 'fal_designed_post' })).toBe(false);
    expect(isRemotionFalAlignedSlot({ pipeline: 'fal_design', slot_role: 'organic_post' })).toBe(false);
  });
});

describe('alignRemotionPosterWithFalTemplate', () => {
  beforeEach(() => {
    vi.mocked(matchDesignTemplateToSlot).mockReset();
  });

  it('returns color and CD hints when template matches', async () => {
    vi.mocked(matchDesignTemplateToSlot).mockResolvedValue({
      ...matched,
      templateType: 'campaign_announcement',
      templateName: 'Kampanya Duyuru',
    });
    const alignment = await alignRemotionPosterWithFalTemplate({
      workspaceId: 'ws-yula',
      slotRole: 'designed_post',
      brandColors: { primary: '#000', accent: '#fff' },
      brandVibe: null,
    });
    expect(alignment?.primaryColor).toBe('#000');
    expect(alignment?.accentColor).toBe('#fff');
    expect(alignment?.contentIntent).toBe('campaign_offer');
    expect(alignment?.sceneBrief).toContain('Kampanya Duyuru');
    expect(alignment?.typographyVibe).toBe('neon_glow');
  });

  it('returns null for ad-hoc brief', async () => {
    const alignment = await alignRemotionPosterWithFalTemplate({
      workspaceId: 'ws-yula',
      slotRole: 'designed_typography',
      brandColors: { primary: '#000', accent: '#fff' },
      brandVibe: null,
      adHocBrief: true,
    });
    expect(alignment).toBeNull();
    expect(matchDesignTemplateToSlot).not.toHaveBeenCalled();
  });
});
