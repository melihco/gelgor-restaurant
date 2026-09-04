import { describe, expect, it } from 'vitest';
import {
  applyCopyDnaHeadline,
  isBrochureOverlay,
  isBrokenEnglishOverlay,
  lockOverlayCta,
  resolveCopyDna,
} from '@/lib/copy-dna';
import { strategistHeadlineKey } from '@/lib/production-pipeline-router';

describe('copy-dna', () => {
  it('uses beauty defaults and tenant theme overrides', () => {
    const dna = resolveCopyDna({
      sector: 'beauty_wellness',
      brandTheme: {
        copy_dna: {
          voice: ['quiet', 'clinical'],
          fallback_headline_tr: 'Ayna öncesi, ayna sonrası.',
        },
      },
    });
    expect(dna.voice).toEqual(['quiet', 'clinical']);
    expect(dna.fallbackHeadlineTr).toBe('Ayna öncesi, ayna sonrası.');
    expect(dna.bannedCtas).toContain('hızlanın');
  });

  it('rejects hotel-brochure EN and LinkedIn TR', () => {
    const rest = resolveCopyDna({ sector: 'restaurant_cafe' });
    expect(isBrochureOverlay('Experience elegance in our atmosphere.', rest)).toBe(true);
    expect(isBrochureOverlay('Join us for magical sunset views', resolveCopyDna({ sector: 'beach_club' }))).toBe(true);
    expect(isBrochureOverlay('Güvenilirliğinizi artırın', resolveCopyDna({ sector: 'beauty_wellness' }))).toBe(true);
    expect(isBrochureOverlay('Erken hasat. Datça’nın eli.', resolveCopyDna({ sector: 'local_products_shop' }))).toBe(false);
  });

  it('flags broken English overlays', () => {
    expect(isBrokenEnglishOverlay('Get glimpse hardworking')).toBe(true);
    expect(isBrokenEnglishOverlay('Catch it before it drops.')).toBe(false);
    expect(isBrokenEnglishOverlay('Güneş inmeden gel.')).toBe(false);
  });

  it('rewrites brochure to sector fallback when caption is also brochure', () => {
    const dna = resolveCopyDna({ sector: 'restaurant_cafe', language: 'en' });
    const r = applyCopyDnaHeadline({
      headline: 'Experience elegance in our atmosphere.',
      caption: 'Step into the refined ambiance and elevate your dining experience.',
      brandName: 'Sushi Bar',
      dna,
    });
    expect(r.replaced).toBe(true);
    expect(r.headline).toBe('Let the plate talk.');
  });

  it('forces a new hook when the same key appeared in 24h', () => {
    const dna = resolveCopyDna({ sector: 'local_products_shop', language: 'tr' });
    const current = 'Erken hasat. Datça’nın eli.';
    const key = strategistHeadlineKey({ headline: current });
    const r = applyCopyDnaHeadline({
      headline: current,
      caption: 'Sizi bekliyoruz ve kaçırmayın diye yazılmış broşür.',
      brandName: 'Yerel Dükkan',
      dna,
      recentKeys: new Set([key]),
    });
    expect(r.replaced).toBe(true);
    expect(r.headline).not.toBe(current);
  });

  it('locks CTA locale to headline and bans beauty urgency', () => {
    const dna = resolveCopyDna({ sector: 'beauty_wellness' });
    expect(lockOverlayCta({
      headline: 'Cildin bugün ne istiyor?',
      cta: 'Hızlanın!',
      dna,
    })).toBe('Randevu bırak');
    expect(lockOverlayCta({
      headline: 'Catch it before it drops.',
      cta: 'Bize katıl',
      dna: resolveCopyDna({ sector: 'beach_club', language: 'en' }),
    })).toBe('Join us');
  });
});
