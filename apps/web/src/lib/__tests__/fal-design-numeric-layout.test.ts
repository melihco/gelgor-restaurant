import { describe, expect, it } from 'vitest';

import {
  adaptDesignSpecToPhotoSpatial,
  buildLayoutAwareRegenInstructions,
  defaultArchetypeForSpatial,
  editorialFamilyForArchetype,
  projectDesignSpecToLayoutSpecification,
  resolveFalDesignNumericLayout,
} from '@/lib/fal-design-numeric-layout';
import { seedDesignSpecLayout } from '@/lib/design-spec-layout';
import type { GalleryPhotoSpatial } from '@/lib/gallery-photo-spatial';

function spatial(partial: Partial<GalleryPhotoSpatial> & Pick<
  GalleryPhotoSpatial,
  'subjectAnchor' | 'typeSeat' | 'typeBand'
>): GalleryPhotoSpatial {
  return {
    quietAnchors: [],
    dominantHex: '#808080',
    typeSeatLuma: 170,
    subjectLuma: 50,
    source: 'pixel',
    ...partial,
  };
}

describe('fal-design numeric layout — restaurant_cafe', () => {
  it('seats type on the left when the plate sits mid-right', () => {
    const numeric = resolveFalDesignNumericLayout({
      archetypeId: 'split_feature_panel',
      format: 'post',
      headline: 'İmza Tabak',
      subtitle: 'Akşam servisi',
      photoSpatial: spatial({
        subjectAnchor: 'mid_right',
        quietAnchors: ['top_left', 'mid_left'],
        typeSeat: 'top_left',
        typeBand: 'left',
      }),
    });
    expect(numeric).not.toBeNull();
    expect(numeric!.editorialFamily).toBe('EditorialSplit');
    expect(numeric!.specification.headlineZone.x).toBeLessThan(0.2);
    expect(numeric!.textFit.fittedHeadline).toMatch(/İmza Tabak/i);
    expect(numeric!.promptBlock).toContain('COMPOSITION MAP (NUMERIC — MANDATORY)');
    expect(numeric!.promptBlock).toContain('TYPE FIT (MEASURED BEFORE PAINT');
    expect(numeric!.promptBlock).toContain('İmza Tabak');
    expect(numeric!.artifactMeta.prompt_architecture_version).toBe('fal-design-numeric-v1');
    expect(numeric!.spatialAdapted).toBe(false);
  });

  it('mirrors a left-type shell when the subject occupies the left', () => {
    const seeded = seedDesignSpecLayout({
      archetypeId: 'split_feature_panel',
      format: 'post',
    })!;
    expect(seeded.textSlots.find((t) => t.role === 'headline')!.zone.x).toBeLessThan(0.2);

    const { layout, adapted } = adaptDesignSpecToPhotoSpatial(
      seeded,
      spatial({
        subjectAnchor: 'mid_left',
        quietAnchors: ['top_right', 'mid_right'],
        typeSeat: 'top_right',
        typeBand: 'right',
        subjectBox: { x: 0.02, y: 0.2, w: 0.4, h: 0.6 },
      }),
    );
    expect(adapted).toBe(true);
    const headline = layout.textSlots.find((t) => t.role === 'headline')!;
    expect(headline.zone.x).toBeGreaterThan(0.4);
    expect(headline.align).toBe('right');
  });
});

describe('fal-design numeric layout — beach_club / local_products_shop', () => {
  it('beach_club story: busy shoreline seats type in the sky band', () => {
    const numeric = resolveFalDesignNumericLayout({
      archetypeId: 'cinematic_full_bleed',
      format: 'story',
      aspectRatio: '9:16',
      headline: 'Sunset Deck',
      subtitle: 'Rezervasyon açık',
      photoSpatial: spatial({
        subjectAnchor: 'bottom_center',
        quietAnchors: ['top_left', 'top_center', 'top_right'],
        typeSeat: 'top_left',
        typeBand: 'top',
      }),
    });
    expect(numeric).not.toBeNull();
    expect(numeric!.layout.canvas.aspectRatio).toBe('9:16');
    expect(numeric!.specification.headlineZone.y).toBeLessThan(0.4);
    expect(numeric!.promptBlock).toContain('COMPOSITION MAP (NUMERIC — MANDATORY)');
  });

  it('beach_club feed: lower-third cinematic flips type into the sky', () => {
    const numeric = resolveFalDesignNumericLayout({
      archetypeId: 'cinematic_full_bleed',
      format: 'post',
      headline: 'Sunset Deck',
      photoSpatial: spatial({
        subjectAnchor: 'bottom_center',
        quietAnchors: ['top_left', 'top_center'],
        typeSeat: 'top_left',
        typeBand: 'top',
      }),
    });
    expect(numeric).not.toBeNull();
    expect(numeric!.spatialAdapted).toBe(true);
    expect(numeric!.specification.headlineZone.y).toBeLessThan(0.45);
    expect(numeric!.promptBlock).toContain('zones adapted to PHOTO SPATIAL');
  });

  it('local_products_shop product card fits a short harvest headline', () => {
    const numeric = resolveFalDesignNumericLayout({
      archetypeId: 'product_hero_card',
      format: 'post',
      headline: 'Erken hasat',
      subtitle: 'Sınırlı stok',
    });
    expect(numeric).not.toBeNull();
    expect(numeric!.editorialFamily).toBe('ProductRightTextLeft');
    expect(numeric!.textFit.ok).toBe(true);
    expect(numeric!.textFit.fittedHeadline).toMatch(/Erken hasat/i);
    expect(numeric!.specification.logoZone.width).toBeGreaterThan(0);
  });

  it('spatial-only default does not force split_feature_panel on a sky-band story', () => {
    expect(defaultArchetypeForSpatial({
      spatial: spatial({
        subjectAnchor: 'bottom_center',
        typeSeat: 'top_left',
        typeBand: 'top',
      }),
      aspectRatio: '9:16',
    })).toBe('magazine_cover_drop');
    expect(editorialFamilyForArchetype('magazine_cover_drop')).toBe('MagazineCover');
  });
});

describe('fal-design numeric layout — vision-qa regen (no hard gate)', () => {
  it('cites headline zone when type overlaps the subject', () => {
    const spec = projectDesignSpecToLayoutSpecification(
      seedDesignSpecLayout({ archetypeId: 'split_feature_panel', format: 'post' })!,
    );
    const layout = seedDesignSpecLayout({ archetypeId: 'split_feature_panel', format: 'post' })!;
    const steps = buildLayoutAwareRegenInstructions({
      textOverlap: true,
      textLegibility: 'poor',
      score: 4,
      layout,
      specification: spec,
    });
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps.join(' ')).toMatch(/headline zone/i);
    expect(steps.join(' ')).toMatch(/negative space/i);
  });
});
