import { describe, expect, it } from 'vitest';
import {
  captionSceneNeedsRestage,
  isProcessOrBtsSceneText,
  keepWeeklySceneCopy,
} from '@/lib/caption-scene-fit';
import { resolveAdaptiveSceneMode } from '@/lib/ai-visual-production-standard';
import {
  GALLERY_ENHANCE_SKIP_MIN_SCORE,
  resolveGptEnhanceSkipReason,
  shouldRunGptImageEnhance,
  type GptEnhancePolicyInput,
} from '@/lib/gpt-enhance-policy';
import type { AiVisualProductionStandard } from '@/lib/ai-visual-production-standard';
import { applyAgencyProductionThemeDefaults } from '@/lib/agency-production-defaults';
import type { BrandTemplateLibrary } from '@/lib/brand-template-library';

const emptyLibrary: BrandTemplateLibrary = {
  version: 1,
  kitId: 'test',
  slots: [],
  derivedAt: '2026-01-01',
  locked: false,
};

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
    visualSubject: 'product_hero',
    enhanceGallerySelected: false,
    adaptiveScene: true,
    adaptiveSceneMode: 'product_showcase',
    captionDrivenVisual: false,
    ...overrides,
  };
}

describe('caption-scene-fit — local_products_shop + beach_club', () => {
  it('detects a process sentence, not a bottle still', () => {
    expect(isProcessOrBtsSceneText('Üretimde bugün iş başındayız')).toBe(true);
    expect(isProcessOrBtsSceneText('Sızma zeytinyağımız raflarda')).toBe(false);
    expect(captionSceneNeedsRestage({
      adaptiveScene: true,
      caption: 'Üretimde bugün iş başındayız',
      slotJob: 'ürün hero',
      evidenceNote: 'Rafta etiketli şişe',
      photoRole: 'product_for_sale',
    })).toBe(true);
    expect(captionSceneNeedsRestage({
      adaptiveScene: false,
      caption: 'Üretimde bugün iş başındayız',
      evidenceNote: 'Rafta etiketli şişe',
      photoRole: 'product_for_sale',
    })).toBe(false);
  });

  it('shop: flag on keeps the weekly process sentence and strips unproven grade', () => {
    const kept = keepWeeklySceneCopy({
      adaptiveScene: true,
      ideationHint: 'Üretimde bugün iş başındayız. Erken hasat zeytinyağımız.',
      caption: 'Sızma zeytinyağımız raflarda. Sofraya bir damla yeter.',
      headline: 'Sızma zeytinyağımız raflarda',
      evidenceNote: "Etiket: 'NATUREL SIZMA ZEYTİNYAĞI'",
      photoSideText: 'Labeled oil bottle',
    });
    expect(kept.caption.toLowerCase()).toMatch(/üretim|iş baş/);
    expect(kept.caption.toLowerCase()).not.toMatch(/erken hasat/);
    expect(kept.headline.length).toBeGreaterThan(8);
  });

  it('shop: flag off leaves the bottle copy', () => {
    const left = keepWeeklySceneCopy({
      adaptiveScene: false,
      ideationHint: 'Üretimde bugün iş başındayız',
      caption: 'Sızma zeytinyağımız raflarda. Sofraya bir damla yeter.',
      headline: 'Sızma zeytinyağımız raflarda',
      evidenceNote: 'Etiketli şişe',
    });
    expect(left.caption).toMatch(/Sızma zeytinyağımız raflarda/);
    expect(left.caption).not.toMatch(/Üretimde/);
  });

  it('beach: sunset + venue is not a caption-scene restage', () => {
    expect(captionSceneNeedsRestage({
      adaptiveScene: true,
      caption: 'Gün batımı iskelede duruyor',
      slotJob: 'gün batımı story',
      evidenceNote: 'İskele, şemsiye, açık ufuk deniz',
      photoRole: 'venue',
    })).toBe(false);
    expect(
      resolveAdaptiveSceneMode('auto', 'beach_club', 'Gün batımı iskelede duruyor', 'gün batımı'),
    ).toBe('venue_context');
  });

  it('shop process caption wins over sector product_showcase', () => {
    expect(
      resolveAdaptiveSceneMode(
        'product_showcase',
        'local_products_shop',
        'Üretimde bugün iş başındayız',
        'production bts',
      ),
    ).toBe('lifestyle_composite');
    expect(
      resolveAdaptiveSceneMode('auto', 'local_products_shop', 'Sızma zeytinyağımız raflarda'),
    ).toBe('product_showcase');
  });

  it('beach process stays in the real room, not a new club', () => {
    expect(
      resolveAdaptiveSceneMode('auto', 'beach_club', 'Ekip iş başında, kulis hazır', 'bts'),
    ).toBe('venue_context');
  });

  it('shop production + bottle: enhance is not skipped on high GIS', () => {
    const input: GptEnhancePolicyInput = {
      visualStandard: standard(),
      contentKind: 'instagram_post',
      assignment: { pipeline: 'gallery_photo', slot_role: 'organic_post' } as GptEnhancePolicyInput['assignment'],
      businessType: 'local_products_shop',
      galleryMatchScore: GALLERY_ENHANCE_SKIP_MIN_SCORE + 10,
      pickedFromBrandGallery: true,
      referenceIsStock: false,
      caption: 'Üretimde bugün iş başındayız',
      slotJob: 'ürün hero',
      evidenceNote: 'Rafta etiketli şişe',
      photoRole: 'product_for_sale',
    };
    expect(resolveGptEnhanceSkipReason(input)).toBeNull();
    expect(shouldRunGptImageEnhance(input)).toBe(true);
  });

  it('user false on shop is not forced back on by the sector', () => {
    const off = applyAgencyProductionThemeDefaults(
      { ai_photo_enhance: true, ai_adaptive_scene: false },
      { tenantId: 'ws-a', sector: 'local_products_shop', templateLibrary: emptyLibrary },
    );
    expect(off.theme?.ai_adaptive_scene).toBe(false);
    expect(off.reasons).toContain('adaptive_scene_explicit_off');

    const unset = applyAgencyProductionThemeDefaults(
      { ai_photo_enhance: true },
      { tenantId: 'ws-b', sector: 'local_products_shop', templateLibrary: emptyLibrary },
    );
    expect(unset.theme?.ai_adaptive_scene).toBe(true);

    const beachOff = applyAgencyProductionThemeDefaults(
      { ai_photo_enhance: true, ai_adaptive_scene: false },
      { tenantId: 'ws-c', sector: 'beach_club', templateLibrary: emptyLibrary },
    );
    expect(beachOff.theme?.ai_adaptive_scene).toBe(false);
  });
});
