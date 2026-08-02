import { describe, expect, it } from 'vitest';
import {
  buildUserConfirmedTypographyPatch,
  isTypographyDesignConfirmed,
  isKnownTypographyVibe,
  resolveSuggestedTypographyConfig,
} from '@/lib/typography-design-policy';

describe('typography-design-policy', () => {
  it('detects confirmed typography with valid vibe', () => {
    const theme = {
      typography_design: {
        vibe: 'warm_coastal',
        text_effect: 'soft_shadow',
        background_style: 'photo_overlay',
        logo_treatment: 'watermark',
        confirmed_at: '2026-07-11T12:00:00.000Z',
        source: 'user',
      },
    };
    expect(isTypographyDesignConfirmed(theme)).toBe(true);
    expect(isKnownTypographyVibe('warm_coastal')).toBe(true);
    expect(isKnownTypographyVibe('unknown_vibe')).toBe(false);
  });

  it('rejects derived typography without confirmation', () => {
    expect(isTypographyDesignConfirmed({
      typography_design: { vibe: 'warm_coastal', source: 'derived' },
    })).toBe(false);
  });

  it('accepts camelCase typographyDesign.confirmedAt from theme BFF', () => {
    expect(isTypographyDesignConfirmed({
      typographyDesign: {
        vibe: 'retro_poster',
        source: 'user',
        confirmedAt: '2026-07-21T11:51:37.935931Z',
      },
    })).toBe(true);
  });

  it('suggests sector default when vibe missing', () => {
    const cfg = resolveSuggestedTypographyConfig({}, 'beach_club');
    expect(cfg.vibe).toBe('warm_coastal');
  });

  it('prefers DNA vibe over sector-only defaults (no gradient_mesh invent)', () => {
    const cfg = resolveSuggestedTypographyConfig(
      {},
      'restaurant_cafe',
      'handwritten chalk, warm artisan organic garden',
    );
    expect(cfg.vibe).toBe('handwritten');
    expect(cfg.background_style).toBe('photo_overlay');
    expect(cfg.text_effect).not.toBe('gradient_stack');
  });

  it('buildUserConfirmedTypographyPatch stamps source and timestamp', () => {
    const patch = buildUserConfirmedTypographyPatch({
      vibe: 'editorial_serif',
      text_effect: 'gradient_stack',
      background_style: 'gradient_mesh',
      logo_treatment: 'watermark',
    });
    expect(patch.source).toBe('user');
    expect(patch.confirmed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
