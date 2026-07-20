import { describe, expect, it } from 'vitest';
import {
  GALLERY_ENHANCE_SKIP_MIN_SCORE,
  isProductHeroStaging,
  resolveGptEnhanceSkipReason,
  shouldRunGptImageEnhance,
  type GptEnhancePolicyInput,
} from '../gpt-enhance-policy';
import type { AiVisualProductionStandard } from '../ai-visual-production-standard';
import type { ProductionProfile } from '../production-profile';

function standard(
  overrides: Partial<AiVisualProductionStandard> = {},
): AiVisualProductionStandard {
  return {
    enabled: true,
    level: 'moderate',
    useBrandIdentity: true,
    briefDrivesScene: true,
    embedLogo: true,
    formats: new Set(['post', 'story', 'carousel', 'reel']),
    visualSubject: 'venue_ambiance',
    enhanceGallerySelected: true,
    adaptiveScene: false,
    adaptiveSceneMode: 'auto',
    captionDrivenVisual: false,
    ...overrides,
  };
}

function designedBgInput(
  overrides: Partial<GptEnhancePolicyInput> = {},
): GptEnhancePolicyInput {
  return {
    visualStandard: standard(),
    contentKind: 'instagram_post',
    assignment: {
      pipeline: 'fal_design',
      slot_role: 'fal_designed_post',
    } as GptEnhancePolicyInput['assignment'],
    businessType: 'beach_club',
    galleryMatchScore: 40,
    pickedFromBrandGallery: true,
    referenceIsStock: false,
    designedPostPhotoEnhance: true,
    ...overrides,
  };
}

describe('P1 — designed/fal BG enhance ↔ visual standard', () => {
  it('gallery_only (enhance off) → disabled, no run', () => {
    const input = designedBgInput({
      visualStandard: standard({ enabled: false, enhanceGallerySelected: false }),
    });
    expect(resolveGptEnhanceSkipReason(input)).toBe('disabled');
    expect(shouldRunGptImageEnhance(input)).toBe(false);
  });

  it('fal_design + gallery_enhanced → allows designed BG enhance', () => {
    const input = designedBgInput();
    expect(resolveGptEnhanceSkipReason(input)).toBeNull();
    expect(shouldRunGptImageEnhance(input)).toBe(true);
  });

  it('agency requireDesignedVisuals still allows designedPostPhotoEnhance', () => {
    const input = designedBgInput({
      productionProfile: {
        tier: 'agency',
        requireDesignedVisuals: true,
      } as ProductionProfile,
    });
    expect(shouldRunGptImageEnhance(input)).toBe(true);
  });

  it('agency requireDesignedVisuals blocks non-BG organic enhance', () => {
    const input = designedBgInput({
      designedPostPhotoEnhance: false,
      assignment: {
        pipeline: 'gallery_photo',
        slot_role: 'organic_post',
      } as GptEnhancePolicyInput['assignment'],
      productionProfile: {
        tier: 'agency',
        requireDesignedVisuals: true,
      } as ProductionProfile,
    });
    expect(shouldRunGptImageEnhance(input)).toBe(false);
  });

  it('product_hero + strong GIS still runs designed BG (no designed_grade skip)', () => {
    const input = designedBgInput({
      businessType: 'local_products_shop',
      galleryMatchScore: GALLERY_ENHANCE_SKIP_MIN_SCORE + 10,
      skipEnhanceForDesignedGrade: true,
      visualStandard: standard({
        visualSubject: 'product_hero',
        adaptiveSceneMode: 'product_showcase',
      }),
    });
    expect(isProductHeroStaging(input.visualStandard)).toBe(true);
    expect(resolveGptEnhanceSkipReason(input)).toBeNull();
    expect(shouldRunGptImageEnhance(input)).toBe(true);
  });

  it('venue + designed_grade flag + strong GIS → skip designed BG', () => {
    const input = designedBgInput({
      galleryMatchScore: GALLERY_ENHANCE_SKIP_MIN_SCORE + 5,
      skipEnhanceForDesignedGrade: true,
      visualStandard: standard({ visualSubject: 'venue_ambiance' }),
    });
    expect(resolveGptEnhanceSkipReason(input)).toBe('designed_grade');
    expect(shouldRunGptImageEnhance(input)).toBe(false);
  });

  it('ecommerce_retail product_hero bypasses non_venue_saas skip', () => {
    const input = designedBgInput({
      businessType: 'ecommerce_retail',
      visualStandard: standard({ visualSubject: 'product_hero' }),
    });
    expect(resolveGptEnhanceSkipReason(input)).toBeNull();
    expect(shouldRunGptImageEnhance(input)).toBe(true);
  });

  it('agency_services without product subject stays non_venue_saas', () => {
    const input = designedBgInput({
      businessType: 'agency_services',
      visualStandard: standard({ visualSubject: 'digital_ui' }),
    });
    expect(resolveGptEnhanceSkipReason(input)).toBe('non_venue_saas');
    expect(shouldRunGptImageEnhance(input)).toBe(false);
  });

  it('without designedPostPhotoEnhance, fal_design is skipped as designed_post', () => {
    const input = designedBgInput({
      designedPostPhotoEnhance: false,
      visualStandard: standard({ enhanceGallerySelected: false }),
    });
    expect(resolveGptEnhanceSkipReason(input)).toBe('designed_post');
    expect(shouldRunGptImageEnhance(input)).toBe(false);
  });
});
