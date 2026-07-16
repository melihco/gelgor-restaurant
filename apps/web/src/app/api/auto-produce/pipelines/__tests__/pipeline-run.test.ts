/**
 * Handler run() behaviour-parity tests (b2b validation).
 *
 * Each pipeline handler is a thin wrapper that maps the shared slot context onto
 * a producer call and merges the producer result back into `ctx.state`. These
 * tests mock the producers at the module boundary and assert:
 *   1. the producer is called with the arguments the old inline block passed, and
 *   2. the result is merged into state exactly as the inline code did (incl. cost).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  type SlotProductionContext,
  type SlotProductionInputs,
  type SlotProductionState,
} from '../pipeline-types';

const h = vi.hoisted(() => ({
  serverConfig: { fal: { configured: true }, localTypography: { enabled: false } },
  produceFalDesignerVideo: vi.fn(),
  produceFalMissionVideo: vi.fn(),
  produceFalDesignedPostStill: vi.fn(),
  resolveTypographyVibeFromContext: vi.fn(() => 'editorial_serif'),
  buildDesignedPostDesignCardPrompt: vi.fn(() => 'design-card-prompt'),
  resolveIdeogramBackgroundStyle: vi.fn(() => 'gradient_mesh'),
  generateStoryMotionPlate: vi.fn(),
  resolveFalBrandInput: vi.fn(),
  isUsableGalleryPhotoUrl: vi.fn(() => true),
  generateDesignedPostImage: vi.fn(),
  generateProductShowcaseImage: vi.fn(),
  matchDesignTemplateToSlot: vi.fn(async () => null),
  recordDesignTemplateUsage: vi.fn(async () => undefined),
  bindBrandTemplateForFalProduction: vi.fn(async (input: {
    baseDirectives: string[];
    missionReferenceUrl: string | null;
    logoUrl?: string;
  }) => ({
    matched: null,
    lockedVibe: null,
    referencePhotoUrl: input.missionReferenceUrl,
    styleReferenceUrl: null,
    brandDirectives: input.baseDirectives,
    brandColors: null,
    logoUrl: input.logoUrl,
    occasion: undefined,
  })),
  pickTemplateReferenceUrls: vi.fn(({ missionPhotoUrl }: { missionPhotoUrl?: string | null }) =>
    missionPhotoUrl ? [missionPhotoUrl] : []),
  templateStyleReferenceUrls: vi.fn(() => []),
  resolveFalTemplateLockOptions: vi.fn(() => ({
    grafikerMaxRetries: 2,
    captionAwareHeadline: true,
  })),
  resolveFalProductionOverlayHeadline: vi.fn((_headline: string) => _headline),
  validateTypographyText: vi.fn(async () => true),
}));

vi.mock('@/lib/server-config', () => ({ serverConfig: h.serverConfig }));
vi.mock('@/lib/fal-designer-production', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/fal-designer-production')>();
  return {
    ...actual,
    produceFalDesignerVideo: h.produceFalDesignerVideo,
    produceFalDesignedPostStill: h.produceFalDesignedPostStill,
    resolveTypographyVibeFromContext: h.resolveTypographyVibeFromContext,
    buildDesignedPostDesignCardPrompt: h.buildDesignedPostDesignCardPrompt,
    resolveIdeogramBackgroundStyle: h.resolveIdeogramBackgroundStyle,
  };
});
vi.mock('@/lib/fal-video', () => ({ produceFalMissionVideo: h.produceFalMissionVideo }));
vi.mock('@/lib/fal-story-motion', () => ({
  generateStoryMotionPlate: h.generateStoryMotionPlate,
  isPlayableVideoUrl: (url: string | null | undefined) =>
    Boolean(url && /\.(mp4|mov|webm)(\?|$)/i.test(String(url).trim())),
}));
vi.mock('@/lib/fal-brand-input', () => ({
  resolveFalBrandInput: h.resolveFalBrandInput,
  resolveFalProductionBrandColors: (
    live: { primary: string; accent: string },
  ) => live,
}));
vi.mock('@/lib/media-url', () => ({ isUsableGalleryPhotoUrl: h.isUsableGalleryPhotoUrl }));
vi.mock('@/lib/brand-design-template-production', () => ({
  bindBrandTemplateForFalProduction: h.bindBrandTemplateForFalProduction,
  pickTemplateReferenceUrls: h.pickTemplateReferenceUrls,
  templateStyleReferenceUrls: h.templateStyleReferenceUrls,
  templateLayoutReferenceUrl: (
    binding: { matched?: { matchQuality?: string } | null; styleReferenceUrl?: string | null } | null | undefined,
  ) => {
    const m = binding?.matched;
    const renderable = !!m && (m.matchQuality === 'hard' || m.matchQuality === 'soft');
    return renderable && binding?.styleReferenceUrl ? binding.styleReferenceUrl : undefined;
  },
  resolveFalTemplateLockOptions: h.resolveFalTemplateLockOptions,
  assertTemplateStyleReference: () => {},
  dropConflictingLayoutDirectives: (directives: string[]) => directives,
  templateReplicaSpecFromBinding: (
    binding: { matched?: { matchQuality?: string; designSpecPrompt?: string | null } | null } | null | undefined,
  ) => {
    const m = binding?.matched;
    const renderable = !!m && (m.matchQuality === 'hard' || m.matchQuality === 'soft');
    if (!renderable || !m?.designSpecPrompt) return null;
    return { prompt: m.designSpecPrompt, sampleHeadline: null, sampleSubtitle: null, forbiddenTexts: [] };
  },
  buildTemplateReplicaPrompt: (
    spec: { prompt: string },
    mission: { headline: string },
  ) => `REPLICA:${mission.headline}\n${spec.prompt}`,
}));
vi.mock('@/lib/brand-design-template-matcher', () => ({
  matchDesignTemplateToSlot: h.matchDesignTemplateToSlot,
  recordDesignTemplateUsage: h.recordDesignTemplateUsage,
  isRenderableDesignTemplateMatch: (
    m: { matchQuality?: string } | null | undefined,
  ) => !!m && (m.matchQuality === 'hard' || m.matchQuality === 'soft'),
}));
vi.mock('@/app/api/auto-produce/handlers/image-generators', () => ({
  generateDesignedPostImage: h.generateDesignedPostImage,
  generateProductShowcaseImage: h.generateProductShowcaseImage,
}));
vi.mock('@/lib/fal-caption-headline', () => ({
  resolveFalProductionOverlayHeadline: h.resolveFalProductionOverlayHeadline,
  resolveFalOverlayCopy: vi.fn(({ headline, cta }: { headline: string; cta?: string }) => ({
    headline,
    subtitle: cta ?? '',
  })),
  areFalOverlayTextsRedundant: () => false,
}));
vi.mock('@/lib/typography-text-validation', () => ({
  validateTypographyText: h.validateTypographyText,
  validateFalCanvasText: vi.fn().mockResolvedValue({
    valid: true,
    detectedHeadline: null,
    detectedSubtitle: null,
  }),
}));

import { falVideoHandler } from '../fal-video-pipeline';
import { productShowcaseHandler } from '../product-showcase-pipeline';
import { falDesignHandler } from '../fal-designed-post-pipeline';
import { falOnlyHandler } from '../fal-only-pipeline';

const baseInputs: Partial<SlotProductionInputs> = {
  pipeline: 'fal_story',
  workspaceId: 'ws-1',
  headline: 'Sunset Session',
  caption: 'Rooftop golden hour',
  cta: 'Book now',
  resolvedBrandName: 'Demo Club',
  brandBusinessType: 'nightclub',
  brandLocation: 'Bodrum',
  brandLogoUrl: 'https://x/logo.png',
  brandReferenceImageUrls: ['https://x/ref1.jpg', 'https://x/ref2.jpg'],
  brandTokens: {} as never,
  brandTheme: {} as never,
  templateLibrary: null as never,
  librarySlotKey: null as never,
  visualDna: null as never,
  brandDescription: 'desc',
  designBriefDirectives: [],
  falLogoPlacement: undefined,
  mood: 'energetic',
  sceneHint: 'rooftop',
  grafikerMaxRetries: 2,
  designerMotionCue: 'slow push in',
  referenceUrl: 'https://x/photo.jpg',
};

function makeCtx(
  inputs: Partial<SlotProductionInputs> = {},
  state: Partial<SlotProductionState> = {},
): SlotProductionContext {
  return {
    inputs: { ...baseInputs, ...inputs } as SlotProductionInputs,
    state: {
      imageUrl: null,
      videoUrl: null,
      falGrafikerScore: null,
      falGrafikerPass: true,
      falDesignEngine: null,
      videoProduceMeta: null,
      costDelta: 0,
      ...state,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.serverConfig.fal.configured = true;
  h.resolveTypographyVibeFromContext.mockReturnValue('editorial_serif');
  h.buildDesignedPostDesignCardPrompt.mockReturnValue('design-card-prompt');
  h.resolveIdeogramBackgroundStyle.mockReturnValue('gradient_mesh' as never);
  h.isUsableGalleryPhotoUrl.mockReturnValue(true);
  h.resolveFalBrandInput.mockReturnValue({
    brandColors: { primary: '#111111', accent: '#f5a623' },
    vibe: 'editorial_serif',
    backgroundStyle: 'photo_overlay',
    sceneHint: 'rooftop sunset crowd',
    promptDirectives: ['dir-1'],
    visualDnaTone: 'tone-x',
    designIntensityLevel: 'balanced',
  });
});

describe('falVideoHandler.run', () => {
  it('produces a fal_story poster still and merges it into state', async () => {
    h.produceFalDesignedPostStill.mockResolvedValue({
      imageUrl: 'story-poster-img',
      grafikerScore: 8,
      grafikerPass: true,
      typographyModel: 'ideogram-v4',
      resolvedHeadline: 'Sunset Session',
    });

    const ctx = makeCtx({ isFalMissionVideo: true, pipeline: 'fal_story' });
    await falVideoHandler.run(ctx);

    expect(h.produceFalDesignedPostStill).toHaveBeenCalledTimes(1);
    expect(h.produceFalDesignerVideo).not.toHaveBeenCalled();
    expect(ctx.state.videoUrl).toBeNull();
    expect(ctx.state.imageUrl).toBe('story-poster-img');
    expect(ctx.state.falGrafikerScore).toBe(8);
    expect(ctx.state.falGrafikerPass).toBe(true);
    expect(ctx.state.videoProduceMeta).toEqual({ source: 'fal_video' });
    expect(ctx.state.costDelta).toBeCloseTo(0.08);
  });

  it('charges the reel cost when the slot pipeline is a reel', async () => {
    h.produceFalDesignerVideo.mockResolvedValue({
      videoUrl: 'https://cdn.example.com/reel.mp4',
      imageUrl: 'i',
      grafikerScore: null,
      grafikerPass: true,
      motionModel: 'fal-motion',
      typographyModel: 't',
    });

    const ctx = makeCtx({ isFalMissionVideo: true, pipeline: 'fal_reel' });
    await falVideoHandler.run(ctx);

    expect(h.produceFalDesignerVideo).toHaveBeenCalledWith(
      expect.objectContaining({ pipeline: 'fal_reel' }),
    );
    expect(ctx.state.videoProduceMeta).toEqual({ source: 'fal_video' });
    expect(ctx.state.costDelta).toBeCloseTo(0.18);
  });

  it('does not treat still_fallback PNG as videoUrl on fal_reel', async () => {
    h.produceFalDesignerVideo.mockResolvedValue({
      videoUrl: 'https://cdn.example.com/still.png',
      imageUrl: 'designer-img',
      grafikerScore: 8,
      grafikerPass: true,
      motionModel: 'still_fallback',
      typographyModel: 'ideogram-v4',
    });

    const ctx = makeCtx({ isFalMissionVideo: true, pipeline: 'fal_reel' });
    await falVideoHandler.run(ctx);

    expect(ctx.state.videoUrl).toBeNull();
    expect(ctx.state.imageUrl).toBe('designer-img');
  });

  it('falls back to raw image-to-video when the designer path throws on fal_reel', async () => {
    h.produceFalDesignerVideo.mockRejectedValue(new Error('designer boom'));
    h.produceFalMissionVideo.mockResolvedValue({
      videoUrl: 'https://cdn.example.com/raw-vid.mp4',
      model: 'luma-dream',
    });

    const ctx = makeCtx({ isFalMissionVideo: true, pipeline: 'fal_reel' });
    await falVideoHandler.run(ctx);

    expect(h.produceFalMissionVideo).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrl: 'https://x/photo.jpg', pipeline: 'fal_reel' }),
    );
    expect(ctx.state.videoUrl).toBe('https://cdn.example.com/raw-vid.mp4');
    expect(ctx.state.imageUrl).toBe('https://x/photo.jpg');
    expect(ctx.state.videoProduceMeta).toEqual({ source: 'luma' });
    expect(ctx.state.costDelta).toBe(0);
  });

  it('skips entirely (no producer call, no state change) when FAL is not configured', async () => {
    h.serverConfig.fal.configured = false;

    const ctx = makeCtx({ isFalMissionVideo: true });
    await falVideoHandler.run(ctx);

    expect(h.produceFalDesignerVideo).not.toHaveBeenCalled();
    expect(h.produceFalMissionVideo).not.toHaveBeenCalled();
    expect(ctx.state.videoUrl).toBeNull();
    expect(ctx.state.imageUrl).toBeNull();
    expect(ctx.state.costDelta).toBe(0);
  });

  it('fal_story with a matched template bypasses Satori and passes the template layout ref', async () => {
    h.serverConfig.localTypography.enabled = true;
    try {
      h.isUsableGalleryPhotoUrl.mockReturnValue(true);
      h.produceFalDesignedPostStill.mockResolvedValue({
        imageUrl: 'story-template-replica',
        grafikerScore: 8,
        grafikerPass: true,
        typographyModel: 'gpt-image-1',
        resolvedHeadline: 'Sunset Session',
      });
      h.bindBrandTemplateForFalProduction.mockResolvedValueOnce({
        matched: {
          id: 'tpl-story',
          templateType: 'daily_story',
          templateName: 'Günlük Story',
          matchQuality: 'hard',
          canvaArchetypeId: 'arc-01',
          layoutPattern: 'diagonal_split',
        },
        lockedVibe: null,
        referencePhotoUrl: 'https://x/photo.jpg',
        styleReferenceUrl: 'https://x/story-template.png',
        brandDirectives: ['dir-1'],
        brandColors: null,
        logoUrl: 'https://x/logo.png',
        occasion: undefined,
      } as never);

      const ctx = makeCtx({ isFalMissionVideo: true, pipeline: 'fal_story' });
      await falVideoHandler.run(ctx);

      expect(h.produceFalDesignedPostStill).toHaveBeenCalledWith(
        expect.objectContaining({
          templateLayoutImageUrl: 'https://x/story-template.png',
        }),
      );
      expect(ctx.state.imageUrl).toBe('story-template-replica');
      expect(ctx.state.falDesignEngine).not.toBe('satori_local');
    } finally {
      h.serverConfig.localTypography.enabled = false;
    }
  });
});

describe('productShowcaseHandler.run', () => {
  it('generates a showcase scene from the gallery photo and stores it', async () => {
    h.generateProductShowcaseImage.mockResolvedValue('scene-url');

    const ctx = makeCtx({
      isProductShowcase: true,
      slotRole: 'product_showcase_post',
      ideaIndex: 0,
      brandTone: 'premium',
    });
    await productShowcaseHandler.run(ctx);

    expect(h.generateProductShowcaseImage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        productPhotoUrl: 'https://x/photo.jpg',
        format: 'post',
        brandTone: 'premium',
      }),
    );
    expect(ctx.state.imageUrl).toBe('scene-url');
  });

  it('uses story format for a product_showcase_story slot', async () => {
    h.generateProductShowcaseImage.mockResolvedValue('story-scene');

    const ctx = makeCtx({
      isProductShowcase: true,
      slotRole: 'product_showcase_story',
      ideaIndex: 0,
    });
    await productShowcaseHandler.run(ctx);

    expect(h.generateProductShowcaseImage).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'story' }),
    );
    expect(ctx.state.imageUrl).toBe('story-scene');
  });

  it('rotates configured product photos by idea index', async () => {
    h.generateProductShowcaseImage.mockResolvedValue('scene');

    const ctx = makeCtx({
      isProductShowcase: true,
      slotRole: 'product_showcase_post',
      ideaIndex: 1,
      brandTheme: {
        product_showcase: { product_photo_urls: ['photo-a', 'photo-b'] },
      } as never,
    });
    await productShowcaseHandler.run(ctx);

    expect(h.generateProductShowcaseImage).toHaveBeenCalledWith(
      expect.objectContaining({ productPhotoUrl: 'photo-b' }),
    );
  });

  it('falls back to the gallery photo when generation returns null', async () => {
    h.generateProductShowcaseImage.mockResolvedValue(null);

    const ctx = makeCtx({
      isProductShowcase: true,
      slotRole: 'product_showcase_post',
      ideaIndex: 0,
    });
    await productShowcaseHandler.run(ctx);

    expect(ctx.state.imageUrl).toBe('https://x/photo.jpg');
  });
});

describe('falDesignHandler.run', () => {
  it('uses the GPT-image design engine when the gallery photo is usable', async () => {
    h.isUsableGalleryPhotoUrl.mockReturnValue(true);
    h.generateDesignedPostImage.mockResolvedValue('designed-url');

    const ctx = makeCtx({ isFalDesignPost: true });
    await falDesignHandler.run(ctx);

    expect(h.resolveFalBrandInput).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'post' }),
    );
    expect(h.generateDesignedPostImage).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImageUrls: ['https://x/photo.jpg'],
      }),
    );
    expect(h.produceFalDesignedPostStill).not.toHaveBeenCalled();
    expect(ctx.state.imageUrl).toBe('designed-url');
    expect(ctx.state.falDesignEngine).toBe('gpt_image_designed');
    expect(ctx.state.falGrafikerScore).toBeNull();
    expect(ctx.state.costDelta).toBeCloseTo(0.04);
  });

  it('falls back to the fal Ideogram still when the gallery photo is not usable', async () => {
    h.isUsableGalleryPhotoUrl.mockReturnValue(false);
    h.produceFalDesignedPostStill.mockResolvedValue({
      imageUrl: 'fal-still',
      grafikerScore: 7,
      grafikerPass: true,
    });

    const ctx = makeCtx({ isFalDesignPost: true });
    await falDesignHandler.run(ctx);

    expect(h.generateDesignedPostImage).not.toHaveBeenCalled();
    expect(h.produceFalDesignedPostStill).toHaveBeenCalledTimes(1);
    expect(ctx.state.imageUrl).toBe('fal-still');
    expect(ctx.state.falDesignEngine).toBe('fal_ideogram');
    expect(ctx.state.falGrafikerScore).toBe(7);
    expect(ctx.state.costDelta).toBeCloseTo(0.05);
  });

  it('leaves state untouched when the slot already has an image', async () => {
    const ctx = makeCtx({ isFalDesignPost: true }, { imageUrl: 'existing-image' });
    await falDesignHandler.run(ctx);

    expect(h.generateDesignedPostImage).not.toHaveBeenCalled();
    expect(h.produceFalDesignedPostStill).not.toHaveBeenCalled();
    expect(ctx.state.imageUrl).toBe('existing-image');
    expect(ctx.state.costDelta).toBe(0);
  });

  it('skips Satori and renders the real design when a hard template is matched', async () => {
    // Karaman regression guard: local typography enabled + a real (hard) library
    // template must render the actual design (GPT/fal), not collapse to Satori.
    h.serverConfig.localTypography.enabled = true;
    try {
      h.isUsableGalleryPhotoUrl.mockReturnValue(true);
      h.generateDesignedPostImage.mockResolvedValue('designed-url');
      h.bindBrandTemplateForFalProduction.mockResolvedValueOnce({
        matched: {
          id: 'tpl-1',
          templateType: 'menu_highlight',
          templateName: 'Ürün hero',
          matchQuality: 'hard',
          canvaArchetypeId: null,
          layoutPattern: null,
        },
        lockedVibe: null,
        referencePhotoUrl: 'https://x/photo.jpg',
        styleReferenceUrl: null,
        brandDirectives: ['dir-1'],
        brandColors: null,
        logoUrl: 'https://x/logo.png',
        occasion: undefined,
      } as never);

      const ctx = makeCtx({
        isFalDesignPost: true,
        slotRole: 'fal_designed_post',
        catalogSlotKey: 'local_products_shop_product_hero_post',
      });
      await falDesignHandler.run(ctx);

      expect(h.generateDesignedPostImage).toHaveBeenCalledTimes(1);
      expect(ctx.state.imageUrl).toBe('designed-url');
      expect(ctx.state.falDesignEngine).toBe('gpt_image_designed');
      expect(ctx.state.falDesignEngine).not.toBe('satori_local');
      expect(ctx.state.brandDesignTemplateMatchQuality).toBe('hard');
    } finally {
      h.serverConfig.localTypography.enabled = false;
    }
  });

  it('passes the template preview as layout replica reference to GPT edit', async () => {
    h.isUsableGalleryPhotoUrl.mockReturnValue(true);
    h.generateDesignedPostImage.mockResolvedValue('designed-url');
    h.bindBrandTemplateForFalProduction.mockResolvedValueOnce({
      matched: {
        id: 'tpl-2',
        templateType: 'campaign_promo',
        templateName: 'Özel Kampanya',
        matchQuality: 'hard',
        canvaArchetypeId: 'arc-05',
        layoutPattern: 'diagonal_split',
        designSpecPrompt: 'Yellow diagonal split with serif headline block.',
      },
      lockedVibe: null,
      referencePhotoUrl: 'https://x/photo.jpg',
      styleReferenceUrl: 'https://x/template-preview.png',
      brandDirectives: ['dir-1'],
      brandColors: null,
      logoUrl: 'https://x/logo.png',
      occasion: undefined,
    } as never);

    const ctx = makeCtx({
      isFalDesignPost: true,
      slotRole: 'fal_designed_post',
      catalogSlotKey: 'beach_club_campaign_post',
    });
    await falDesignHandler.run(ctx);

    expect(h.generateDesignedPostImage).toHaveBeenCalledWith(
      expect.objectContaining({
        templateLayoutImageUrl: 'https://x/template-preview.png',
        // Stored template spec is reused verbatim ("Yeniden üret" semantics).
        designCardPrompt: expect.stringContaining('Yellow diagonal split with serif headline block.'),
      }),
    );
    expect(ctx.state.imageUrl).toBe('designed-url');
  });
});

describe('falOnlyHandler.run', () => {
  it('produces a designed still for a fal-only post and merges it into state', async () => {
    h.produceFalDesignedPostStill.mockResolvedValue({
      imageUrl: 'fal-only-still',
      grafikerScore: 6,
      grafikerPass: true,
      resolvedHeadline: 'Sunset Session',
    });

    const ctx = makeCtx({
      isFalOnlyPost: true,
      isFalOnlyVideo: false,
      pipeline: 'fal_only_post',
    });
    await falOnlyHandler.run(ctx);

    expect(h.resolveFalBrandInput).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'post' }),
    );
    expect(ctx.state.imageUrl).toBe('fal-only-still');
    expect(ctx.state.videoUrl).toBeNull();
    expect(ctx.state.falDesignEngine).toBe('fal_grounded_designer');
    expect(ctx.state.falGrafikerScore).toBe(6);
    expect(ctx.state.costDelta).toBeCloseTo(0.05);
  });

  it('produces a designed reel video for a fal-only video slot', async () => {
    h.produceFalDesignerVideo.mockResolvedValue({
      videoUrl: 'https://cdn.example.com/fal-only-vid.mp4',
      imageUrl: 'fal-only-img',
      grafikerScore: 8,
      grafikerPass: true,
      motionModel: 'kling-v2',
      typographyModel: 'ideogram',
      resolvedHeadline: 'Sunset Session',
    });

    const ctx = makeCtx({
      isFalOnlyPost: false,
      isFalOnlyVideo: true,
      pipeline: 'fal_only_reel',
    });
    await falOnlyHandler.run(ctx);

    expect(h.resolveFalBrandInput).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'reel' }),
    );
    expect(ctx.state.videoUrl).toBe('https://cdn.example.com/fal-only-vid.mp4');
    expect(ctx.state.imageUrl).toBe('fal-only-img');
    expect(ctx.state.videoProduceMeta).toEqual({ source: 'kling' });
    expect(ctx.state.falDesignEngine).toBe('fal_grounded_designer');
    expect(ctx.state.costDelta).toBeCloseTo(0.18);
  });

  it('skips (no state change) when FAL is not configured', async () => {
    h.serverConfig.fal.configured = false;

    const ctx = makeCtx({ isFalOnlyPost: true, pipeline: 'fal_only_post' });
    await falOnlyHandler.run(ctx);

    expect(h.produceFalDesignedPostStill).not.toHaveBeenCalled();
    expect(ctx.state.imageUrl).toBeNull();
    expect(ctx.state.costDelta).toBe(0);
  });
});
