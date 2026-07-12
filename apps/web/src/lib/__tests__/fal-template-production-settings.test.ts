import { describe, it, expect } from 'vitest';
import {
  resolveFalTemplateProductionSettings,
  resolveFalTemplateBackgroundStyle,
  resolveFalTemplateIntensityForChannel,
  shouldProminentLogoInFalTemplate,
  buildFalTemplateProductionPatch,
} from '@/lib/fal-template-production-settings';

describe('resolveFalTemplateProductionSettings', () => {
  it('falls back to fal_design_intensity and typography_design', () => {
    const cfg = resolveFalTemplateProductionSettings({
      fal_design_intensity: { story: 'designed', reel: 'balanced', post: 'photo_first' },
      typography_design: {
        background_style: 'solid_brand',
        logo_treatment: 'badge',
        vibe: 'minimal_modern',
        text_effect: 'soft_shadow',
        confirmed_at: '2026-01-01',
      },
    });
    expect(cfg.intensity.story).toBe('designed');
    expect(cfg.background_style).toBe('solid_brand');
    expect(cfg.logo_treatment).toBe('badge');
    expect(cfg.preview_cap).toBe(12);
    expect(cfg.concurrency).toBe(2);
  });

  it('prefers fal_template_production overrides', () => {
    const cfg = resolveFalTemplateProductionSettings({
      fal_template_production: {
        intensity: { story: 'bold_editorial', reel: 'bold_editorial', post: 'bold_editorial' },
        background_style: 'gradient_mesh',
        prefer_gallery_photo: false,
        logo_treatment: 'none',
        preview_cap: 16,
        concurrency: 3,
      },
    });
    expect(cfg.intensity.post).toBe('bold_editorial');
    expect(cfg.prefer_gallery_photo).toBe(false);
    expect(cfg.preview_cap).toBe(16);
    expect(cfg.concurrency).toBe(3);
  });
});

describe('resolveFalTemplateBackgroundStyle', () => {
  it('uses photo overlay when gallery preferred and photo present', () => {
    expect(resolveFalTemplateBackgroundStyle({
      theme: { fal_template_production: { prefer_gallery_photo: true, background_style: 'solid_brand' } },
      referencePhotoUrl: 'https://cdn.example.com/a.jpg',
    })).toBe('photo_overlay');
  });

  it('uses configured background when no photo', () => {
    expect(resolveFalTemplateBackgroundStyle({
      theme: { fal_template_production: { background_style: 'solid_brand', prefer_gallery_photo: true } },
      referencePhotoUrl: null,
    })).toBe('solid_brand');
  });
});

describe('shouldProminentLogoInFalTemplate', () => {
  it('returns false for none treatment', () => {
    expect(shouldProminentLogoInFalTemplate({
      fal_template_production: { logo_treatment: 'none' },
    }, true)).toBe(false);
  });

  it('returns true for badge treatment', () => {
    expect(shouldProminentLogoInFalTemplate({
      fal_template_production: { logo_treatment: 'badge' },
    })).toBe(true);
  });
});

describe('buildFalTemplateProductionPatch', () => {
  it('mirrors intensity into falDesignIntensity for backward compat', () => {
    const patch = buildFalTemplateProductionPatch({
      intensity: { story: 'balanced', reel: 'balanced', post: 'designed' },
      background_style: 'gradient_mesh',
      prefer_gallery_photo: true,
      logo_treatment: 'watermark',
      preview_cap: 12,
      concurrency: 2,
    });
    expect(patch.falDesignIntensity).toEqual(patch.falTemplateProduction.intensity);
  });
});

describe('resolveFalTemplateIntensityForChannel', () => {
  it('reads channel from template production config', () => {
    expect(resolveFalTemplateIntensityForChannel({
      fal_template_production: {
        intensity: { story: 'elegant_light', reel: 'designed', post: 'photo_first' },
      },
    }, 'post')).toBe('photo_first');
  });
});
