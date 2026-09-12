import { describe, expect, it } from 'vitest';
import {
  buildHubTypographyConfirmThemePatch,
  buildUserConfirmedTypographyPatch,
  isTypographyDesignConfirmed,
  isKnownTypographyVibe,
  resolveSuggestedTypographyConfig,
  typographyNotConfirmedResponse,
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
    expect(isKnownTypographyVibe('quiet_luxury')).toBe(true);
    expect(isKnownTypographyVibe('clinical_clean')).toBe(true);
    expect(isKnownTypographyVibe('anatolian_warm')).toBe(true);
    expect(isKnownTypographyVibe('unknown_vibe')).toBe(false);
  });

  it('rejects derived typography without confirmation', () => {
    expect(isTypographyDesignConfirmed({
      typography_design: { vibe: 'warm_coastal', source: 'derived' },
    })).toBe(false);
    expect(typographyNotConfirmedResponse().error).toBe('typography_not_confirmed');
  });

  it('treats onboarding identity stamp as confirmed for shop and beach', () => {
    expect(isTypographyDesignConfirmed({
      typography_design: { vibe: 'anatolian_warm', source: 'derived' },
      creative_identity_confirmed_at: '2026-09-12T05:00:00.000Z',
    })).toBe(true);
    expect(isTypographyDesignConfirmed({
      typographyDesign: { vibe: 'warm_coastal' },
      creativeIdentityConfirmedAt: '2026-09-12T05:00:00.000Z',
    })).toBe(true);
    expect(isTypographyDesignConfirmed({
      creative_identity_confirmed_at: '2026-09-12T05:00:00.000Z',
    })).toBe(false);
  });

  it('hub confirm patch stamps vibe and palette without wiping saved post defaults', () => {
    const shop = buildHubTypographyConfirmThemePatch({
      currentTheme: {
        post_design_defaults: { font_preset: 'elegant_serif' },
        palette: { primary: '#111111' },
      },
      typography: {
        vibe: 'anatolian_warm',
        text_effect: 'soft_shadow',
        background_style: 'photo_overlay',
        logo_treatment: 'watermark',
      },
      palette: { primary: '#7a1f1f', accent: '#d4a017', neutral: '#f6efe4', shadow: '#1a1208' },
    });
    const beach = buildHubTypographyConfirmThemePatch({
      currentTheme: {},
      typography: {
        vibe: 'warm_coastal',
        text_effect: 'soft_shadow',
        background_style: 'photo_overlay',
        logo_treatment: 'watermark',
      },
      palette: { primary: '#0b3d4a', accent: '#e8c36a', neutral: '#f4f1ea', shadow: '#122026' },
    });
    expect((shop.typography_design as { confirmed_at?: string }).confirmed_at).toBeTruthy();
    expect((shop.typographyDesign as { confirmedAt?: string }).confirmedAt).toBeTruthy();
    expect((shop.post_design_defaults as { font_preset?: string }).font_preset).toBe('elegant_serif');
    expect((shop.palette as { accent?: string }).accent).toBe('#d4a017');
    expect((beach.typography_design as { vibe?: string }).vibe).toBe('warm_coastal');
    expect(beach.post_design_defaults).toBeTruthy();
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
