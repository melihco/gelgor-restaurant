import { describe, expect, it } from 'vitest';

import {
  classifyFalGridSurface,
  collectRecentFalGridSurfaces,
  collectTenantDesignMemory,
  rotateFalDesignSurfaceForGrid,
} from '../fal-grid-surface-rotation';

describe('classifyFalGridSurface', () => {
  it('maps designed intensity to top brand panel', () => {
    expect(
      classifyFalGridSurface({
        intensityLevel: 'designed',
        backgroundStyle: 'photo_overlay',
        hasReferencePhoto: true,
      }),
    ).toBe('top_brand_panel');
  });

  it('maps photo_first to photo dominant', () => {
    expect(
      classifyFalGridSurface({
        intensityLevel: 'photo_first',
        backgroundStyle: 'photo_overlay',
        hasReferencePhoto: true,
      }),
    ).toBe('photo_dominant');
  });
});

describe('rotateFalDesignSurfaceForGrid', () => {
  it('steps down from top brand panel when previous slot used the same', () => {
    const result = rotateFalDesignSurfaceForGrid({
      channel: 'reel',
      baseIntensity: 'designed',
      baseBackgroundStyle: 'photo_overlay',
      hasReferencePhoto: true,
      recentSurfaceKinds: ['top_brand_panel'],
    });
    expect(result.rotated).toBe(true);
    expect(result.surfaceKind).not.toBe('top_brand_panel');
    expect(result.gridRotationDirectives.length).toBeGreaterThan(0);
    expect(result.designIntensityLevel).not.toBe('bold_editorial');
  });

  it('does not rotate when history is empty', () => {
    const result = rotateFalDesignSurfaceForGrid({
      channel: 'post',
      baseIntensity: 'balanced',
      baseBackgroundStyle: 'photo_overlay',
      hasReferencePhoto: true,
      recentSurfaceKinds: [],
    });
    expect(result.rotated).toBe(false);
    expect(result.designIntensityLevel).toBe('balanced');
  });
});

describe('collectRecentFalGridSurfaces', () => {
  it('reads fal_grid_surface from artifact metadata', () => {
    const kinds = collectRecentFalGridSurfaces([
      {
        metadata: {
          fal_grid_surface: 'top_brand_panel',
          fal_designer_produced: true,
          pipeline: 'fal_reel',
        },
        createdAt: new Date().toISOString(),
      },
      {
        metadata: {
          fal_grid_surface: 'photo_dominant',
          production_route: 'fal_ai',
        },
        createdAt: new Date().toISOString(),
      },
    ]);
    expect(kinds).toEqual(['top_brand_panel', 'photo_dominant']);
  });
});

describe('collectTenantDesignMemory', () => {
  it('reads archetype + surface from the same artifact window', () => {
    const memory = collectTenantDesignMemory([
      {
        metadata: {
          fal_grid_surface: 'top_brand_panel',
          canva_archetype: 'split_feature_panel',
          fal_designer_produced: true,
          pipeline: 'fal_design',
        },
        createdAt: new Date().toISOString(),
      },
      {
        metadata: {
          fal_grid_surface: 'photo_dominant',
          design_layout_family: 'cinematic_full_bleed',
          production_route: 'fal_ai',
        },
        createdAt: new Date().toISOString(),
      },
    ]);
    expect(memory.recentSurfaceKinds).toEqual(['top_brand_panel', 'photo_dominant']);
    expect(memory.recentArchetypeIds).toEqual(['split_feature_panel', 'cinematic_full_bleed']);
  });
});
