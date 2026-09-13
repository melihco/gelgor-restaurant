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

  it('fal_design + gallery_enhanced → designed GPT paint skips the extra enhance', () => {
    const input = designedBgInput();
    expect(resolveGptEnhanceSkipReason(input)).toBe('designed_gpt_paint');
    expect(shouldRunGptImageEnhance(input)).toBe(false);
  });

  it('agency requireDesignedVisuals still skips designedPostPhotoEnhance', () => {
    const input = designedBgInput({
      productionProfile: {
        tier: 'agency',
        requireDesignedVisuals: true,
      } as ProductionProfile,
    });
    expect(resolveGptEnhanceSkipReason(input)).toBe('designed_gpt_paint');
    expect(shouldRunGptImageEnhance(input)).toBe(false);
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

  it('product sell + adaptive on → designed card may restage background', () => {
    const input = designedBgInput({
      businessType: 'local_products_shop',
      galleryMatchScore: GALLERY_ENHANCE_SKIP_MIN_SCORE + 10,
      skipEnhanceForDesignedGrade: true,
      slotJob: 'müşteri favorisi',
      caption: 'Badem ezmesi.',
      assignment: {
        pipeline: 'fal_design',
        slot_role: 'fal_designed_post',
        catalog_slot_key: 'local_products_shop_customer_favorite_post',
      } as GptEnhancePolicyInput['assignment'],
      visualStandard: standard({
        adaptiveScene: true,
        visualSubject: 'product_hero',
        adaptiveSceneMode: 'product_showcase',
      }),
    });
    expect(isProductHeroStaging(input.visualStandard)).toBe(true);
    expect(resolveGptEnhanceSkipReason(input)).toBeNull();
    expect(shouldRunGptImageEnhance(input)).toBe(true);
  });

  it('product_hero designed card skips enhance when adaptive is off', () => {
    const input = designedBgInput({
      businessType: 'local_products_shop',
      galleryMatchScore: GALLERY_ENHANCE_SKIP_MIN_SCORE + 10,
      skipEnhanceForDesignedGrade: true,
      assignment: {
        pipeline: 'fal_design',
        slot_role: 'fal_designed_post',
        catalog_slot_key: 'local_products_shop_product_hero_post',
      } as GptEnhancePolicyInput['assignment'],
      visualStandard: standard({
        visualSubject: 'product_hero',
        adaptiveSceneMode: 'product_showcase',
      }),
    });
    expect(isProductHeroStaging(input.visualStandard)).toBe(true);
    expect(resolveGptEnhanceSkipReason(input)).toBe('designed_gpt_paint');
    expect(shouldRunGptImageEnhance(input)).toBe(false);
  });

  it('beach designed card also skips the stacked enhance', () => {
    const input = designedBgInput({
      businessType: 'beach_club',
      visualStandard: standard({ visualSubject: 'venue_ambiance' }),
    });
    expect(resolveGptEnhanceSkipReason(input)).toBe('designed_gpt_paint');
    expect(shouldRunGptImageEnhance(input)).toBe(false);
  });

  it('venue designed card skips enhance before the grade flag runs', () => {
    const input = designedBgInput({
      galleryMatchScore: GALLERY_ENHANCE_SKIP_MIN_SCORE + 5,
      skipEnhanceForDesignedGrade: true,
      visualStandard: standard({ visualSubject: 'venue_ambiance' }),
    });
    expect(resolveGptEnhanceSkipReason(input)).toBe('designed_gpt_paint');
    expect(shouldRunGptImageEnhance(input)).toBe(false);
  });

  it('ecommerce_retail product_hero bypasses non_venue_saas then skips designed paint stack', () => {
    const input = designedBgInput({
      businessType: 'ecommerce_retail',
      visualStandard: standard({ visualSubject: 'product_hero' }),
    });
    expect(resolveGptEnhanceSkipReason(input)).toBe('designed_gpt_paint');
    expect(shouldRunGptImageEnhance(input)).toBe(false);
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
