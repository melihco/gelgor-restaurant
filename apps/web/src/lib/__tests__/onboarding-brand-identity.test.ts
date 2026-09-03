import { describe, expect, it } from 'vitest';
import { resolveBrandProductionTokens } from '@/lib/brand-production-tokens';
import {
  buildOnboardingIdentityContextPatch,
  buildOnboardingIdentityThemePatch,
  isOnboardingFontConfirmed,
  parseOnboardingRefUrls,
  referencePhotoAskCopy,
  suggestOnboardingHeadingFont,
} from '@/lib/onboarding-brand-identity';

describe('onboarding brand identity', () => {
  it('restaurant_cafe and beach_club suggest different heading families', () => {
    const restaurant = suggestOnboardingHeadingFont('restaurant_cafe');
    const beach = suggestOnboardingHeadingFont('beach_club');
    expect(restaurant.id).toBe('Playfair Display');
    expect(beach.id).toBe('Syne');
    expect(restaurant.id).not.toBe(beach.id);
  });

  it('persists confirmed font + logo on the context patch', () => {
    const patch = buildOnboardingIdentityContextPatch({
      logoUrl: 'https://cdn.example/logo.png',
      headingFont: 'Fraunces',
      primary: '#7a1f1f',
      accent: '#d4a017',
    });
    expect(patch.logo_url).toBe('https://cdn.example/logo.png');
    expect(patch.brand_font_family).toBe('Fraunces');
  });

  it('stamps font_source=onboarding on the theme so production honors the pick', () => {
    const theme = buildOnboardingIdentityThemePatch({
      currentTheme: { palette: { primary: '#111' } },
      headingFont: 'Cinzel',
      bodyFont: 'Cormorant Garamond',
      typographyDesign: { vibe: 'quiet_luxury' },
      postDesignDefaults: { font_preset: 'elegant_serif' },
      palette: { primary: '#111', accent: '#c9a227' },
    });
    expect(isOnboardingFontConfirmed(theme)).toBe(true);
    expect((theme.typography as { heading_font: string }).heading_font).toBe('Cinzel');
  });

  it('parses stored reference URLs including /api/media uploads', () => {
    expect(parseOnboardingRefUrls('["https://cdn.example/a.jpg","/api/media/x"]')).toEqual([
      'https://cdn.example/a.jpg',
      '/api/media/x',
    ]);
  });

  it('asks for more photos until the recommended floor', () => {
    expect(referencePhotoAskCopy(0)).toMatch(/3–5/);
    expect(referencePhotoAskCopy(1)).toMatch(/2 referans daha/);
    expect(referencePhotoAskCopy(4)).toMatch(/4 referans/);
  });
});

describe('confirmed onboarding font beats sector preset', () => {
  it('restaurant_cafe: Fraunces wins over elegant_serif Playfair', () => {
    const tokens = resolveBrandProductionTokens({
      sector: 'restaurant_cafe',
      brandContext: { brand_font_family: 'Fraunces' },
      brandTheme: {
        typography: { heading_font: 'Fraunces', body_font: 'Sora', font_source: 'onboarding' },
        post_design_defaults: { font_preset: 'elegant_serif' },
      },
    });
    expect(tokens.headingFont).toBe('Fraunces');
    expect(tokens.sources).toContain('onboarding.heading_font');
  });

  it('beach_club: Cinzel wins over sector Syne when the operator confirmed it', () => {
    const tokens = resolveBrandProductionTokens({
      sector: 'beach_club',
      brandContext: { brand_font_family: 'Cinzel' },
      brandTheme: {
        typography: { heading_font: 'Cinzel', body_font: 'Cormorant Garamond', font_source: 'onboarding' },
        post_design_defaults: { font_preset: 'elegant_serif' },
      },
    });
    expect(tokens.headingFont).toBe('Cinzel');
  });

  it('does not treat an Inter fallback as an explicit brand font', () => {
    const tokens = resolveBrandProductionTokens({
      sector: 'restaurant_cafe',
      brandContext: { brand_font_family: 'Inter' },
      brandTheme: {
        post_design_defaults: { font_preset: 'elegant_serif' },
      },
    });
    expect(tokens.headingFont).not.toBe('Inter');
  });
});
