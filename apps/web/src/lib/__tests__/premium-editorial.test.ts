import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildBrandVisualDna } from '@/lib/premium-editorial/brand-visual-dna';
import {
  buildCreativeDirection,
  selectCreativeVariation,
  CREATIVE_VARIATION_KEYS,
} from '@/lib/premium-editorial/creative-direction';
import {
  buildLayoutSpecification,
  selectLayoutFamily,
  EDITORIAL_LAYOUT_FAMILIES,
} from '@/lib/premium-editorial/layout-specification';
import { compileEditorialImagePrompt, TEXT_EXCLUSION } from '@/lib/premium-editorial/prompt-compiler';
import {
  breakLines,
  buildDefaultTextLayoutInput,
  validateAndFitText,
} from '@/lib/premium-editorial/text-layout';
import { validatePremiumEditorialRequest } from '@/lib/premium-editorial/validate-request';
import { premiumEditorialArtifactMetadata } from '@/lib/premium-editorial/orchestrator';
import {
  MAX_IMAGE_GENERATION_ATTEMPTS,
  PREMIUM_EDITORIAL_PROMPT_VERSION,
  type PremiumEditorialCampaignResult,
} from '@/lib/premium-editorial/types';
import { synthesizeSectorSlotDefinitions, slotKeyForSector } from '@/lib/sector-slot-pack';
import { pipelineForSlotRole } from '@/lib/mission-production-manifest';
import { isPremiumEditorialPipeline } from '@/lib/pipeline-registry';
import { SLOT_ROLE_LABEL_TR } from '@/lib/mission-slot-checklist';

describe('premium-editorial Brand DNA (layer 1)', () => {
  it('creates DNA from partial brand data without inventing facts', () => {
    const dna = buildBrandVisualDna({
      brandId: 'tenant-1',
      brandContext: {
        brand_name: 'Aegean House',
        business_type: 'beach_club',
        location: 'Bodrum',
        brand_tone: 'warm editorial',
        visual_dna: 'sunlit linen and stone',
      },
      brandTheme: {
        colors: { primary: '#2C2A26', accent: '#C9A227' },
      },
    });

    expect(dna.brandName).toBe('Aegean House');
    expect(dna.sector).toBe('beach_club');
    expect(dna.location).toBe('Bodrum');
    expect(dna.primaryColors).toContain('#2C2A26');
    expect(dna.promptArchitectureVersion).toBe(PREMIUM_EDITORIAL_PROMPT_VERSION);
    expect(dna.logoAssetUrl).toBeNull();
    // Never invent phone / address / menu
    expect(JSON.stringify(dna)).not.toMatch(/\+90|reservation|menu item/i);
  });

  it('null-safe with empty context', () => {
    const dna = buildBrandVisualDna({ brandId: 'x' });
    expect(dna.brandId).toBe('x');
    expect(dna.brandName).toBe('Brand');
    expect(dna.preferredMaterials.length).toBeGreaterThan(0);
  });
});

describe('premium-editorial creative direction (layer 2)', () => {
  it('produces structured creative brief', () => {
    const dna = buildBrandVisualDna({
      brandId: 't1',
      brandContext: { brand_name: 'Casa', business_type: 'fine_dining' },
    });
    const brief = buildCreativeDirection({
      dna,
      request: {
        brandId: 't1',
        contentTopic: 'Sunset tasting',
        campaignGoal: 'Awareness',
        aspectRatio: '4:5',
        outputType: 'post',
      },
      variationKey: 'SunsetDining',
    });

    expect(brief.creativeVariationKey).toBe('SunsetDining');
    expect(brief.textWillBeRenderedSeparately).toBe(true);
    expect(brief.logoWillBeRenderedSeparately).toBe(true);
    expect(brief.forbiddenElements.some((e) => /letters|words/i.test(e))).toBe(true);
    expect(brief.aspectRatio).toBe('4:5');
  });

  it('avoids repeating recent variations', () => {
    const recent = CREATIVE_VARIATION_KEYS.slice(0, 8) as typeof CREATIVE_VARIATION_KEYS[number][];
    const next = selectCreativeVariation({
      recent: [...recent],
      forceNew: true,
      seed: 'stable-seed',
    });
    expect(recent.includes(next)).toBe(false);
  });
});

describe('premium-editorial layout (layer 3)', () => {
  it('selects layout that accommodates long headline', () => {
    const dna = buildBrandVisualDna({ brandId: 't1', brandContext: { brand_name: 'X' } });
    const brief = buildCreativeDirection({
      dna,
      request: { brandId: 't1', contentTopic: 'Topic', outputType: 'post', aspectRatio: '4:5' },
      variationKey: 'MinimalMaterialStudy',
    });
    const family = selectLayoutFamily({
      aspectRatio: '4:5',
      brief,
      text: {
        headline: 'A very long headline that needs more room than a minimal still life allows easily',
        subheadline: 'And a lengthy supporting line that also needs capacity in the body zone for readability',
        cta: 'Discover',
      },
    });
    expect(family).not.toBe('MinimalStillLife');
  });

  it('builds 4:5 and 9:16 canvases', () => {
    const post = buildLayoutSpecification({ family: 'EditorialSplit', aspectRatio: '4:5' });
    const story = buildLayoutSpecification({ family: 'ImmersiveStory', aspectRatio: '9:16' });
    expect(post.canvas.width).toBe(1080);
    expect(post.canvas.height).toBe(1350);
    expect(story.canvas.aspectRatio).toBe('9:16');
    expect(story.canvas.height).toBe(1920);
    expect(EDITORIAL_LAYOUT_FAMILIES).toHaveLength(10);
  });

  it('attempt 3 switches to safer layout', () => {
    const dna = buildBrandVisualDna({ brandId: 't1', brandContext: { brand_name: 'X' } });
    const brief = buildCreativeDirection({
      dna,
      request: { brandId: 't1', contentTopic: 'Topic', aspectRatio: '4:5' },
      variationKey: 'EditorialProductHero',
    });
    const family = selectLayoutFamily({
      aspectRatio: '4:5',
      brief,
      text: { headline: 'Short', subheadline: '', cta: '' },
      attempt: 3,
    });
    expect(family).toBe('CinematicNegativeSpace');
  });
});

describe('premium-editorial prompt compiler (layer 4)', () => {
  it('compiles venue-grounded social design with on-canvas text contract', () => {
    const dna = buildBrandVisualDna({ brandId: 't1', brandContext: { brand_name: 'Villa' } });
    const brief = buildCreativeDirection({
      dna,
      request: { brandId: 't1', contentTopic: 'Coastal evening', aspectRatio: '4:5' },
      variationKey: 'CoastalRefreshment',
    });
    const layout = buildLayoutSpecification({ family: 'ProductRightTextLeft', aspectRatio: '4:5' });
    const text = validateAndFitText({
      text: buildDefaultTextLayoutInput({ headline: 'Golden Hour', subheadline: 'By the water', cta: 'Reserve' }),
      layout,
    });
    const compiled = compileEditorialImagePrompt({
      dna,
      brief,
      layout,
      textLayout: text,
      mode: 'venue_social_design',
    });

    expect(compiled.finalPrompt).toContain('VENUE PHOTO LOCK');
    expect(compiled.finalPrompt).toContain('REAL venue photograph');
    expect(compiled.finalPrompt).toContain('ON-CANVAS TEXT CONTRACT');
    expect(compiled.finalPrompt).toContain('HEADLINE: Golden Hour');
    expect(compiled.finalPrompt).not.toContain(TEXT_EXCLUSION);
    expect(compiled.promptArchitectureVersion).toBe(PREMIUM_EDITORIAL_PROMPT_VERSION);
  });

  it('photo_plate_only mode still excludes typography', () => {
    const dna = buildBrandVisualDna({ brandId: 't1', brandContext: { brand_name: 'Villa' } });
    const brief = buildCreativeDirection({
      dna,
      request: { brandId: 't1', contentTopic: 'Coastal evening', aspectRatio: '4:5' },
    });
    const layout = buildLayoutSpecification({ family: 'AsymmetricHero', aspectRatio: '4:5' });
    const compiled = compileEditorialImagePrompt({
      dna,
      brief,
      layout,
      mode: 'photo_plate_only',
    });
    expect(compiled.finalPrompt).toContain(TEXT_EXCLUSION);
  });
});

describe('premium-editorial text fitting', () => {
  it('never splits words and fits into zone', () => {
    const { lines, overflow } = breakLines('Merhaba dünya test satırı', 12, 3);
    expect(lines.every((l) => !l.includes('düny a'))).toBe(true);
    expect(lines.join(' ')).toContain('Merhaba');
    void overflow;

    const layout = buildLayoutSpecification({ family: 'EditorialSplit', aspectRatio: '4:5' });
    const text = buildDefaultTextLayoutInput({
      headline: 'Uzun bir başlık satırı burada devam ediyor ve daha da uzuyor',
      subheadline: 'Alt metin',
      cta: 'Keşfet',
    });
    const fitted = validateAndFitText({ text, layout });
    expect(fitted.headlineFontSize).toBeLessThanOrEqual(text.maxFontSize);
    expect(fitted.warnings.length).toBeGreaterThan(0);
  });
});

describe('premium-editorial API validation', () => {
  it('requires brandId and contentTopic', () => {
    const v = validatePremiumEditorialRequest({});
    expect(v.errors).toContain('brandId is required');
    expect(v.errors).toContain('contentTopic is required');
  });

  it('warns on long headline without hard fail', () => {
    const v = validatePremiumEditorialRequest({
      brandId: 't1',
      contentTopic: 'Topic',
      headline: 'x'.repeat(70),
    });
    expect(v.errors).toHaveLength(0);
    expect(v.warnings.some((w) => /Headline/i.test(w))).toBe(true);
  });

  it('caps variations at 4', () => {
    const v = validatePremiumEditorialRequest({
      brandId: 't1',
      contentTopic: 'Topic',
      numberOfVariations: 9,
    });
    expect(v.normalized.numberOfVariations).toBe(4);
  });
});

describe('premium-editorial persistence metadata', () => {
  it('serializes structured layers without full prompts on attempts', () => {
    const dna = buildBrandVisualDna({ brandId: 't1', brandContext: { brand_name: 'A' } });
    const brief = buildCreativeDirection({
      dna,
      request: { brandId: 't1', contentTopic: 'T', aspectRatio: '4:5' },
    });
    const layout = buildLayoutSpecification({ family: 'MagazineCover', aspectRatio: '4:5' });
    const text = validateAndFitText({
      text: buildDefaultTextLayoutInput({ headline: 'H', cta: 'Go' }),
      layout,
    });
    const result: PremiumEditorialCampaignResult = {
      slotId: 'PREMIUM_EDITORIAL_CAMPAIGN',
      generationId: 'g1',
      status: 'completed',
      backgroundImageUrl: 'https://x/bg.jpg',
      finalImageUrl: 'https://x/final.jpg',
      thumbnailUrl: 'https://x/final.jpg',
      brandVisualDna: dna,
      creativeDirection: brief,
      layoutSpecification: layout,
      textLayout: text,
      qualityAssessment: null,
      generationAttempts: [{
        attempt: 1,
        compiledPrompt: 'SECRET PROMPT',
        layoutFamily: layout.family,
        creativeVariationKey: brief.creativeVariationKey,
        backgroundImageUrl: 'https://x/bg.jpg',
        qualityAssessment: null,
        error: null,
        durationMs: 10,
      }],
      warnings: [],
      finalCompiledPrompt: 'SECRET',
      promptVersion: PREMIUM_EDITORIAL_PROMPT_VERSION,
      modelName: 'gpt-image-1',
      createdAt: new Date().toISOString(),
      generationDurationMs: 10,
      costEstimateUsd: 0.08,
      matchedGalleryUrl: 'https://cdn.example.com/gallery/food-plate-01.jpg',
      matchedGalleryScore: 72,
      matchedGalleryReason: 'content tags',
    };
    const meta = premiumEditorialArtifactMetadata(result);
    expect(meta.brand_visual_dna_json).toBeTruthy();
    expect(meta.layout_specification_json).toBeTruthy();
    expect(meta.matched_gallery_url).toContain('food-plate');
    expect(JSON.stringify(meta.generation_attempts)).not.toContain('SECRET PROMPT');
  });
});

describe('premium-editorial gallery match (idea → photo)', () => {
  it('picks food photo for pasta idea, not gym', async () => {
    const { resolvePremiumEditorialGalleryMatch } = await import(
      '@/lib/premium-editorial/gallery-match'
    );
    const FOOD = 'https://cdn.example.com/gallery/food-plate-01.jpg';
    const GYM = 'https://cdn.example.com/gallery/gym-equipment-02.jpg';
    const result = resolvePremiumEditorialGalleryMatch({
      headline: 'Gourmet pasta',
      caption: 'Şefin imza makarnası — taze pasta dish.',
      contentTopic: 'signature pasta',
      businessType: 'restaurant',
      candidateUrls: [GYM, FOOD],
      galleryAnalysis: {
        [FOOD]: {
          contentTags: ['food', 'dish', 'plate', 'pasta', 'gourmet'],
          description: 'A beautifully plated gourmet pasta dish on a white plate.',
          mood: 'warm',
          bestFor: ['food_showcase', 'feed_post'],
        },
        [GYM]: {
          contentTags: ['gym', 'equipment', 'dumbbell'],
          description: 'Gym equipment with dumbbells.',
        },
      },
    });
    expect(result.primaryUrl).toBe(FOOD);
    expect(result.match && result.match.score >= 35).toBe(true);
  });

  it('falls back to production-loop pin when rematch is weak', async () => {
    const { resolvePremiumEditorialGalleryMatch } = await import(
      '@/lib/premium-editorial/gallery-match'
    );
    const PIN = 'https://cdn.example.com/gallery/venue-pin.jpg';
    const OTHER = 'https://cdn.example.com/gallery/other.jpg';
    const result = resolvePremiumEditorialGalleryMatch({
      headline: 'xyzzy plugh frobnicate',
      caption: 'xyzzy plugh frobnicate qux',
      preferredUrl: PIN,
      candidateUrls: [PIN, OTHER],
      galleryAnalysis: {
        [PIN]: { description: 'unrelated abstract texture' },
        [OTHER]: { description: 'also unrelated noise' },
      },
    });
    expect(result.primaryUrl).toBe(PIN);
  });
});

describe('premium-editorial slot wiring', () => {
  it('registers catalog slots and pipeline mapping', () => {
    const slots = synthesizeSectorSlotDefinitions('beach_club');
    const post = slots.find((s) => s.slot_key === slotKeyForSector('beach_club', 'premium_editorial_campaign_post'));
    const story = slots.find((s) => s.slot_key === slotKeyForSector('beach_club', 'premium_editorial_campaign_story'));
    expect(post).toBeTruthy();
    expect(story).toBeTruthy();
    expect(post!.pipeline).toBe('premium_editorial');
    expect(post!.tier).toBe('premium');
    expect(post!.prompt_pack?.premium_editorial).toBe(true);
    expect(pipelineForSlotRole('premium_editorial_campaign_post')).toBe('premium_editorial');
    expect(isPremiumEditorialPipeline('premium_editorial')).toBe(true);
    expect(SLOT_ROLE_LABEL_TR.premium_editorial_campaign_post).toMatch(/Premium Editorial/i);
  });

  it('keeps existing organic post role functional', () => {
    expect(pipelineForSlotRole('organic_post')).toBe('gallery_photo');
    expect(pipelineForSlotRole('fal_designed_post')).toBe('fal_design');
  });
});

describe('premium-editorial retry bounds', () => {
  it('max attempts is 3', () => {
    expect(MAX_IMAGE_GENERATION_ATTEMPTS).toBe(3);
  });
});

describe('premium-editorial orchestrator retry (mocked boundaries)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('stops after maximum attempts when background generation fails', async () => {
    vi.doMock('@/lib/premium-editorial/background-generator', () => ({
      generateEditorialBackground: vi.fn().mockRejectedValue(new Error('boom')),
    }));
    vi.doMock('@/lib/premium-editorial/vision-qa', () => ({
      assessVisualQuality: vi.fn(),
    }));
    vi.doMock('@/lib/premium-editorial/compose-final', () => ({
      composeFinalEditorialImage: vi.fn(),
    }));

    const { runPremiumEditorialCampaign } = await import('@/lib/premium-editorial/orchestrator');
    const { generateEditorialBackground } = await import('@/lib/premium-editorial/background-generator');

    await expect(runPremiumEditorialCampaign({
      brandId: 't1',
      contentTopic: 'Topic',
      brandContext: { brand_name: 'Test' },
    })).rejects.toThrow(/boom|failed/i);

    expect(generateEditorialBackground).toHaveBeenCalledTimes(MAX_IMAGE_GENERATION_ATTEMPTS);
  });
});
