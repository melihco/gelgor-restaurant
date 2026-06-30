import { describe, expect, it } from 'vitest';
import {
  resolveFalDesignIntensityConfig,
  resolveFalDesignIntensityDirectives,
  resolveFalDesignIntensityForChannel,
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
    const d = resolveFalDesignIntensityDirectives('photo_first', 'feed_post');
    expect(d.photoRules.join(' ')).toMatch(/85–95%/);
    expect(d.typographyAnchor).toMatch(/premium designed display/i);
  });

  it('balanced keeps 50–70% photo rule for posts', () => {
    const d = resolveFalDesignIntensityDirectives('balanced', 'feed_post');
    expect(d.photoRules.join(' ')).toMatch(/50–70%/);
  });

  it('channel resolver reads theme', () => {
    expect(resolveFalDesignIntensityForChannel({
      fal_design_intensity: { post: 'designed' },
    }, 'post')).toBe('designed');
  });
});
