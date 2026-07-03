import { describe, expect, it } from 'vitest';
import {
  resolveFalDesignIntensityConfig,
  resolveFalDesignIntensityDirectives,
  resolveFalDesignIntensityForChannel,
  resolveFalDesignIntensityMode,
} from '@/lib/fal-design-intensity';

describe('resolveFalDesignIntensityConfig', () => {
  it('defaults to balanced when unset', () => {
    expect(resolveFalDesignIntensityConfig(null)).toEqual({
      story: 'balanced',
      reel: 'balanced',
      post: 'balanced',
    });
  });

  it('maps legacy textOverlayDensity', () => {
    expect(resolveFalDesignIntensityConfig({
      typography: { textOverlayDensity: 'minimal' },
    })).toEqual({
      story: 'elegant_light',
      reel: 'elegant_light',
      post: 'elegant_light',
    });
    expect(resolveFalDesignIntensityConfig({
      typography: { text_overlay_density: 'dense' },
    }).post).toBe('bold_editorial');
  });

  it('explicit config overrides legacy', () => {
    expect(resolveFalDesignIntensityConfig({
      typography: { textOverlayDensity: 'minimal' },
      fal_design_intensity: { story: 'designed', reel: 'balanced', post: 'photo_first' },
    })).toEqual({
      story: 'designed',
      reel: 'balanced',
      post: 'photo_first',
    });
  });
});

describe('resolveFalDesignIntensityDirectives', () => {
  it('photo_first minimizes overlay language', () => {
    const d = resolveFalDesignIntensityDirectives('photo_first', 'reel');
    expect(d.photoRules.join(' ')).toMatch(/88–95%/);
    expect(d.forbiddenLayouts.join(' ')).toMatch(/FORBIDDEN.*top horizontal/i);
    expect(d.priorityBlock).toMatch(/PHOTO-FIRST/i);
  });

  it('balanced keeps 52–62% photo rule for vertical', () => {
    const d = resolveFalDesignIntensityDirectives('balanced', 'reel');
    expect(d.photoRules.join(' ')).toMatch(/52–62%/);
  });

  it('bold_editorial forbids large photo share', () => {
    const d = resolveFalDesignIntensityDirectives('bold_editorial', 'reel');
    expect(d.forbiddenLayouts.join(' ')).toMatch(/more than 38%/);
    expect(d.typographyAnchor).toMatch(/OVERSIZED/i);
  });

  it('channel resolver reads theme', () => {
    expect(resolveFalDesignIntensityForChannel({
      fal_design_intensity: { post: 'designed' },
    }, 'post')).toBe('designed');
  });
});

describe('resolveFalDesignIntensityMode', () => {
  it('uses reel rules for 9:16 story', () => {
    expect(resolveFalDesignIntensityMode('9:16', false)).toBe('reel');
    expect(resolveFalDesignIntensityMode('4:5', false)).toBe('feed_post');
  });
});
