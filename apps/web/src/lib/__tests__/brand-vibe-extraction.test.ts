import { describe, expect, it } from 'vitest';
import {
  assembleBrandVibeProfile,
  isSchemaValidBrandVibeProfile,
  parseCaptionList,
  safeParseJsonObject,
} from '@/lib/brand-vibe-extraction';
import { DEEP_SETUP_VISUAL_PIPELINE_STEPS } from '@/lib/visual-identity-enrich';

describe('brand-vibe-extraction', () => {
  it('assembles a schema-valid vibe profile from vision + voice JSON', () => {
    const profile = assembleBrandVibeProfile({
      sourceAccounts: ['sarnicbeach'],
      visualJson: {
        palette: { primary: '#87CEEB', accent: '#FF69B4' },
        motion: { pace: 'lively_observational', cuts_per_10_seconds_estimate: 2 },
        grading: { look: 'bright_bitez_coastal' },
        anti_patterns: ['neon EDM club posters'],
        content_pillars_visual: ['Bitez bay', 'sunbeds'],
      },
      voiceJson: {
        style: 'samimi ve davetkar',
        tonal_anchors: ['sıcak', 'keyif'],
      },
      referenceFrames: [
        { url: '/api/media?key=a.jpg', source_account: 'sarnicbeach' },
        { url: '/api/media?key=b.jpg', source_account: 'sarnicbeach' },
        { url: '/api/media?key=c.jpg', source_account: 'sarnicbeach' },
      ],
      captionSampleCount: 4,
      sourceMode: 'onboarding_gallery',
    });

    expect(isSchemaValidBrandVibeProfile(profile)).toBe(true);
    expect(profile.source_mode).toBe('onboarding_gallery');
    expect(profile.caption_voice).toBeTruthy();
    expect(profile.image_sample_count).toBe(3);
  });

  it('rejects thin profiles missing motion/palette', () => {
    expect(isSchemaValidBrandVibeProfile({ extracted_at: 'x', anti_patterns: [] })).toBe(false);
    expect(isSchemaValidBrandVibeProfile(null)).toBe(false);
  });

  it('parses caption lists from JSON string or array', () => {
    expect(parseCaptionList(['a', 'b'])).toEqual(['a', 'b']);
    expect(parseCaptionList(JSON.stringify(['x', 'y']))).toEqual(['x', 'y']);
  });

  it('safeParseJsonObject recovers JSON from fenced noise', () => {
    const parsed = safeParseJsonObject('Here you go:\n{"palette":{"primary":"#111111"}}\n');
    expect((parsed.palette as { primary: string }).primary).toBe('#111111');
  });
});

describe('deep-setup visual pipeline order', () => {
  it('places visual_identity_enrich before production_design_profile', () => {
    const steps = [...DEEP_SETUP_VISUAL_PIPELINE_STEPS];
    const vibeIdx = steps.indexOf('visual_identity_enrich');
    const pdpIdx = steps.indexOf('production_design_profile');
    expect(vibeIdx).toBeGreaterThan(-1);
    expect(pdpIdx).toBeGreaterThan(vibeIdx);
    expect(steps.indexOf('service_profile')).toBeLessThan(vibeIdx);
  });
});
