import { describe, expect, it } from 'vitest';

import {
  applyBrandTokensToRenderProps,
  type BrandProductionTokens,
} from '../brand-production-tokens';
import { buildTemplateColorPreview, resolveTemplateColorProps } from '../template-color-policy';

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

describe('resolveTemplateColorProps', () => {
  it('keeps editorial story headlines on text color by default', () => {
    expect(
      resolveTemplateColorProps({
        templateId: 'remotion_editorial_bottom_01',
        tokens: TOKENS,
      }),
    ).toMatchObject({
      headlineColor: '#ffffff',
      categoryColor: '#f59e0b',
      overlayColor: '#123456',
    });
  });

  it('lets bold story templates shift headline to accent', () => {
    expect(
      resolveTemplateColorProps({
        templateId: 'remotion_campaign_hero_01',
        tokens: TOKENS,
      }),
    ).toMatchObject({
      headlineColor: '#f59e0b',
      categoryColor: '#f59e0b',
      overlayColor: '#123456',
    });
  });

  it('lets poster templates bind hero color separately from detail text', () => {
    expect(
      resolveTemplateColorProps({
        posterTemplateId: 'poster_dj_night_01',
        tokens: TOKENS,
      }),
    ).toMatchObject({
      headlineColor: '#f59e0b',
      textColor: '#ffffff',
      overlayColor: '#f59e0b',
    });
  });
});

describe('applyBrandTokensToRenderProps', () => {
  it('injects template-driven colors without overriding explicit props', () => {
    const result = applyBrandTokensToRenderProps(
      {
        templateId: 'remotion_campaign_hero_01',
        headline: 'Launch',
        photoUrl: 'https://example.com/photo.jpg',
        headlineColor: '#ff00ff',
      },
      TOKENS,
    );

    expect(result).toMatchObject({
      headlineColor: '#ff00ff',
      subtitleColor: 'rgba(255,255,255,0.85)',
      categoryColor: '#f59e0b',
      overlayColor: '#123456',
    });
  });
});

describe('buildTemplateColorPreview', () => {
  it('builds a readable summary for story templates', () => {
    const preview = buildTemplateColorPreview({
      templateId: 'remotion_campaign_hero_01',
      tokens: TOKENS,
    });

    expect(preview.summary).toBe('Başlık: Accent · Kategori: Accent · Alt yazı: Text · Overlay: Primary');
    expect(preview.items.map((item) => item.color)).toEqual([
      '#f59e0b',
      '#f59e0b',
      'rgba(255,255,255,0.85)',
      '#123456',
    ]);
  });

  it('falls back to a generic message when no policy exists', () => {
    expect(buildTemplateColorPreview({ templateId: 'missing_template' }).summary)
      .toBe('Template varsayilan brand renklerini kullanir.');
  });
});
