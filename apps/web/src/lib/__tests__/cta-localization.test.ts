import { describe, expect, it } from 'vitest';
import {
  harmonizeCaptionAndCta,
  localizeCta,
  pickLocalizedCta,
  resolveBrandLanguageCode,
  resolveLookPromptLanguage,
} from '@/lib/cta-localization';

describe('cta localization', () => {
  it('empty brand languages resolve to tr, explicit en stays en', () => {
    expect(resolveBrandLanguageCode(undefined)).toBe('tr');
    expect(resolveBrandLanguageCode('')).toBe('tr');
    expect(resolveBrandLanguageCode([])).toBe('tr');
    expect(resolveBrandLanguageCode('en')).toBe('en');
    expect(resolveBrandLanguageCode('en-US')).toBe('en');
    expect(resolveBrandLanguageCode('de')).toBe('tr');
  });

  it('look prompt language maps empty and codes the same way for shop and beach', () => {
    expect(resolveLookPromptLanguage(undefined)).toBe('Turkish');
    expect(resolveLookPromptLanguage('')).toBe('Turkish');
    expect(resolveLookPromptLanguage('tr')).toBe('Turkish');
    expect(resolveLookPromptLanguage('Turkish')).toBe('Turkish');
    expect(resolveLookPromptLanguage('en')).toBe('English');
    expect(resolveLookPromptLanguage('English')).toBe('English');
    expect(resolveLookPromptLanguage('en-GB')).toBe('English');
  });

  it('maps service-profile Turkish presets to English', () => {
    expect(localizeCta('Rezervasyon Yap', 'en')).toBe('Book now');
    expect(localizeCta('Masanı Ayır', 'en')).toBe('Reserve a table');
    expect(localizeCta('Randevu Al', 'en')).toBe('Book an appointment');
    expect(localizeCta('Yerini Ayır', 'en')).toBe('Save your spot');
    expect(localizeCta('Bizi Ziyaret Et', 'en')).toBe('Visit us');
    expect(localizeCta('Bilgi Al', 'en')).toBe('Get info');
  });

  it('pickLocalizedCta prefers EN entry in mixed brand array', () => {
    expect(
      pickLocalizedCta(['Rezervasyon Yap', 'Book now', 'Keşfet'], 'en'),
    ).toBe('Book now');
  });

  it('pickLocalizedCta localizes TR-only array for EN brands', () => {
    expect(
      pickLocalizedCta(['Rezervasyon Yap', 'Masanı Ayır'], 'en'),
    ).toBe('Book now');
  });

  it('pickLocalizedCta keeps TR for TR brands', () => {
    expect(
      pickLocalizedCta(['Rezervasyon Yap', 'Keşfet'], 'tr'),
    ).toBe('Rezervasyon Yap');
  });

  it('harmonizeCaptionAndCta works without caption', () => {
    expect(harmonizeCaptionAndCta('', 'Rezervasyon Yap', 'en')).toEqual({
      caption: '',
      cta: 'Book now',
    });
  });

  it('harmonizeCaptionAndCta replaces embedded TR CTA in EN caption', () => {
    const result = harmonizeCaptionAndCta(
      'Sunset terrace vibes. Rezervasyon Yap',
      'Rezervasyon Yap',
      'en',
    );
    expect(result.cta).toBe('Book now');
    expect(result.caption).toMatch(/Book now/);
    expect(result.caption).not.toMatch(/Rezervasyon/);
  });
});
