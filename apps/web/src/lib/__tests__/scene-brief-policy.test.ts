import { describe, expect, it } from 'vitest';
import type { AiVisualProductionStandard } from '@/lib/ai-visual-production-standard';
import type { ProductionAssignment } from '@/lib/mission-production-manifest';
import { slotNeedsSceneBrief } from '@/lib/scene-brief-policy';

function standard(overrides: Partial<AiVisualProductionStandard> = {}): AiVisualProductionStandard {
  return {
    enabled: true,
    level: 'moderate',
    useBrandIdentity: true,
    briefDrivesScene: true,
    embedLogo: true,
    formats: new Set(['post', 'story', 'carousel', 'reel']),
    visualSubject: 'auto',
    enhanceGallerySelected: true,
    adaptiveScene: false,
    adaptiveSceneMode: 'auto',
    captionDrivenVisual: false,
    ...overrides,
  };
}

function assignment(
  role: ProductionAssignment['slot_role'],
  pipeline: ProductionAssignment['pipeline'],
  catalog: string,
): ProductionAssignment {
  return {
    idea_index: 0,
    slot_role: role,
    pipeline,
    copy_bundle_id: 'bundle',
    publish_channel: 'instagram_organic',
    catalog_slot_key: catalog,
  };
}

describe('slotNeedsSceneBrief — gallery lock skips Crew ($0.15)', () => {
  it('beach_club story overlay does not buy a brief when the photo is gallery-only', () => {
    expect(slotNeedsSceneBrief({
      visualStandard: standard(),
      contentKind: 'instagram_story',
      assignment: assignment(
        'campaign_story_motion',
        'fal_story',
        'beach_club_sunset_ambiance_story',
      ),
      galleryOnlyVisual: true,
      isHeroReel: false,
      willStoryOverlay: true,
      designedPosterSync: false,
    })).toBe(false);
  });

  it('local_products_shop story overlay does not buy a brief when the photo is gallery-only', () => {
    expect(slotNeedsSceneBrief({
      visualStandard: standard(),
      contentKind: 'instagram_story',
      assignment: assignment(
        'campaign_story_motion',
        'fal_story',
        'local_products_shop_new_arrival_story',
      ),
      galleryOnlyVisual: true,
      isHeroReel: false,
      willStoryOverlay: true,
      designedPosterSync: false,
    })).toBe(false);
  });

  it('hero reel without a gallery lock may still request a brief', () => {
    expect(slotNeedsSceneBrief({
      visualStandard: standard(),
      contentKind: 'instagram_reel',
      assignment: assignment(
        'organic_reel',
        'fal_reel',
        'beach_club_sunset_reel',
      ),
      galleryOnlyVisual: false,
      isHeroReel: true,
      willStoryOverlay: false,
      designedPosterSync: false,
    })).toBe(true);
  });

  it('gallery-locked hero reel still skips — photo is already chosen', () => {
    expect(slotNeedsSceneBrief({
      visualStandard: standard({ adaptiveScene: true }),
      contentKind: 'instagram_reel',
      assignment: assignment(
        'organic_reel',
        'fal_reel',
        'local_products_shop_product_reel',
      ),
      galleryOnlyVisual: true,
      isHeroReel: true,
      willStoryOverlay: false,
      designedPosterSync: false,
    })).toBe(false);
  });

  it('designed post never calls scene director', () => {
    expect(slotNeedsSceneBrief({
      visualStandard: standard({ adaptiveScene: true }),
      contentKind: 'instagram_post',
      assignment: assignment(
        'designed_post',
        'fal_design',
        'local_products_shop_premium_editorial_campaign_post',
      ),
      galleryOnlyVisual: false,
      isHeroReel: false,
      willStoryOverlay: false,
      designedPosterSync: false,
    })).toBe(false);
  });
});
