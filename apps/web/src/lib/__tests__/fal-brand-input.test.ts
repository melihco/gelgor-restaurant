import { describe, expect, it } from 'vitest';

import { distillBrandSoul, resolveFalBrandInput, resolveFalProductionBrandColors } from '../fal-brand-input';
import type { BrandProductionTokens } from '../brand-production-tokens';
import type { BrandTemplateLibrary } from '../brand-template-library';

const TOKENS: BrandProductionTokens = {
  headingFont: 'Inter',
  bodyFont: 'DM Sans',
  primaryColor: '#123456',
  accentColor: '#f59e0b',
  textColor: '#ffffff',
  shadowColor: '#000000',
  headlineColor: '#ffffff',
  subtitleColor: 'rgba(255,255,255,0.85)',
  overlayColor: '#123456',
  overlayOpacity: 0.46,
  announcementKit: {
    primaryColor: '#123456',
    accentColor: '#f59e0b',
    textColor: '#ffffff',
    headlineColor: '#ffffff',
    shadowColor: '#000000',
    headingFontStack: "'Inter', sans-serif",
    bodyFontStack: "'DM Sans', sans-serif",
    logoUrl: null,
    brandName: 'Demo',
    themeSource: 'test',
  },
  sources: ['test'],
};

const LIBRARY: BrandTemplateLibrary = {
  version: 1,
  kitId: 'kit_demo',
  derivedAt: new Date().toISOString(),
  locked: true,
  slots: [
    {
      slot: 2,
      key: 'event_story',
      labelTr: 'Etkinlik Story',
      labelEn: 'Event Story',
      format: 'story',
      useCase: 'event',
      storyTemplateId: 'remotion_campaign_hero_01',
      enabled: true,
      fontMode: 'template',
      fontPersonality: 'display_bold',
      headingFont: 'Anton',
      bodyFont: 'Inter',
      showLogo: true,
    },
  ],
};

describe('distillBrandSoul', () => {
  it('skips markdown noise labels and keeps aesthetic fragments + tone', () => {
    const soul = distillBrandSoul({
      visualDna: [
        '**Brand**: Anasayfa - Sarnıç Beach Bodrum',
        '**Colors**: sky blue + vibrant pink + sea green + golden yellow',
        '**Palette**: #87ceeb, #ff69b4',
      ].join('\n'),
      brandTone: 'samimi, sıcak, davetkar',
    });

    expect(soul).toBeDefined();
    // Brand title + raw hex palette are dropped…
    expect(soul).not.toContain('Anasayfa');
    expect(soul).not.toContain('#87ceeb');
    // …while the tone and descriptive color words survive.
    expect(soul).toContain('samimi, sıcak, davetkar');
    expect(soul).toContain('sky blue + vibrant pink');
  });

  it('falls back to the first description sentence when visual_dna is empty', () => {
    const soul = distillBrandSoul({
      visualDna: '',
      brandDescription: 'A minimalist specialty coffee roastery. Slow mornings.',
    });
    expect(soul).toBe('A minimalist specialty coffee roastery');
  });

  it('returns undefined when there is no usable signal', () => {
    expect(distillBrandSoul({ visualDna: '**Brand**: X', brandDescription: '' })).toBeUndefined();
  });
});

describe('resolveFalBrandInput', () => {
  it('reuses tokens, template behavior, and sector scene guidance', () => {
    const result = resolveFalBrandInput({
      brandTheme: {
        typography_design: {
          vibe: 'minimal_modern',
          text_effect: 'gradient_stack',
          background_style: 'solid_brand',
          logo_treatment: 'badge',
        },
        anti_patterns: ['No cluttered collage'],
        grading: { look: 'warm golden editorial' },
      },
      templateLibrary: LIBRARY,
      librarySlotKey: 'event_story',
      tokens: TOKENS,
      sector: 'nightclub',
      caption: 'DJ gecesi ve sahne enerjisi',
      headline: 'Summer Party',
      referencePhotoUrl: 'https://example.com/photo.jpg',
      sceneHint: 'sunset rooftop crowd',
      format: 'story',
    });

    expect(result.brandColors).toEqual({
      primary: '#123456',
      accent: '#f59e0b',
    });
    expect(result.backgroundStyle).toBe('photo_overlay');
    expect(result.vibe).toBe('minimal_modern');
    expect(result.sceneHint).toContain('sunset rooftop crowd');
    expect(result.sceneHint).toContain('upscale nightclub or entertainment venue');
    expect(result.promptDirectives.join(' ')).toContain('Template color behavior');
    expect(result.promptDirectives.join(' ')).toContain('display_bold');
    expect(result.promptDirectives.join(' ')).toContain('No cluttered collage');
    expect(result.promptDirectives.join(' ')).toContain('BRAND COLOR LOCK');
    expect(result.promptDirectives.join(' ')).toContain('#123456');
  });
});

describe('resolveFalProductionBrandColors', () => {
  it('always prefers live tenant tokens over stale template snapshots', () => {
    expect(
      resolveFalProductionBrandColors(
        { primary: '#25d366', accent: '#1a1a1a' },
        { primary: '#212529', accent: '#ffc107' },
      ),
    ).toEqual({ primary: '#25d366', accent: '#1a1a1a' });
  });
});

describe('resolveBrandProductionTokens accent derivation', () => {
  it('derives a tonal green accent when primary and accent are the same brand green', async () => {
    const { resolveBrandProductionTokens } = await import('../brand-production-tokens');
    const tokens = resolveBrandProductionTokens({
      brandTheme: { palette: { primary: '#25d366', accent: '#25d366' } },
      sector: 'restaurant',
    });
    expect(tokens.primaryColor).toBe('#25d366');
    expect(tokens.accentColor.toLowerCase()).not.toBe('#ffc107');
    expect(tokens.accentColor.toLowerCase()).toMatch(/^#[0-9a-f]{6}$/);
    expect(tokens.accentColor).not.toBe(tokens.primaryColor);
  });
});
