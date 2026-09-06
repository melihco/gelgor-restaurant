import { describe, expect, it } from 'vitest';
import {
  collectInventoryClaimEvidence,
  groundPublishCopyToVisual,
} from '@/lib/photo-claim-grounding';
import type { GalleryPhotoMeta } from '@/lib/gallery-photo-matcher';

const SIZMA: GalleryPhotoMeta = {
  primarySubject: 'olive_oil',
  contentTags: ['olive oil', 'bottle'],
  visibleLabelText: 'NATUREL SIZMA ZEYTİNYAĞI',
  description: 'Dark glass bottle of extra virgin olive oil.',
};

const EARLY: GalleryPhotoMeta = {
  primarySubject: 'olive_oil',
  contentTags: ['olive oil'],
  visibleLabelText: 'ERKEN HASAT SIZMA ZEYTİNYAĞI',
};

const HONEY: GalleryPhotoMeta = {
  primarySubject: 'honey',
  contentTags: ['honey', 'jar'],
  visibleLabelText: 'SIRLI BAL',
  description: 'Honey jar on a woven mat.',
};

const SUNSET: GalleryPhotoMeta = {
  contentTags: ['sunset', 'deck', 'sea'],
  description: 'Golden hour over the bay with sunbeds.',
};

describe('groundPublishCopyToVisual — local_products_shop', () => {
  it('replaces erken hasat with the sızma grade on the bottle label', () => {
    const result = groundPublishCopyToVisual({
      caption: 'Erken hasat zeytinyağımızla kış sofralarınızı donatmaya hazır mısınız?',
      headline: 'Erken Hasat zeytinyağımız, Datça',
      photoUrl: 'https://cdn.example.com/oil-sizma.jpg',
      galleryMeta: { 'https://cdn.example.com/oil-sizma.jpg': SIZMA },
    });
    expect(result.changed).toBe(true);
    expect(result.caption.toLowerCase()).toMatch(/sızma|sizma/);
    expect(result.caption.toLowerCase()).not.toMatch(/erken hasat/);
    expect(result.headline.toLowerCase()).not.toMatch(/erken hasat/);
    expect(result.replaced.some((r) => r.from === 'early_harvest' && r.to === 'extra_virgin')).toBe(true);
  });

  it('keeps erken hasat when the label proves it', () => {
    const caption = 'Erken hasat zeytinyağımız soğuk sıkım — bu parti bitince yok.';
    const result = groundPublishCopyToVisual({
      caption,
      headline: 'Erken hasat tadım',
      photoUrl: 'https://cdn.example.com/oil-early.jpg',
      galleryMeta: { 'https://cdn.example.com/oil-early.jpg': EARLY },
    });
    expect(result.caption).toContain('Erken hasat');
    expect(result.stripped).toEqual([]);
  });

  it('strips harvest when inventory has only sızma and the pin is unbound', () => {
    const result = groundPublishCopyToVisual({
      caption: 'Erken Hasat zeytinyağımız, Datça\'nın en iyi zeytinlerinden.',
      headline: 'Erken Hasat zeytinyağımız, Datça',
      photoUrl: 'https://cdn.example.com/whatsapp-unbound.jpg',
      galleryMeta: { 'https://cdn.example.com/other-analyzed.jpg': SIZMA },
    });
    expect(result.caption.toLowerCase()).not.toMatch(/erken hasat/);
  });

  it('strips unproven variants when generating a photographer fill with empty gallery', () => {
    const result = groundPublishCopyToVisual({
      caption: 'Bu yaz sınırlı parti erken hasat zeytinyağımızı deneyin.',
      headline: 'Erken hasat',
      generatedFill: true,
      galleryMeta: {},
    });
    expect(result.caption.toLowerCase()).not.toMatch(/erken hasat/);
    expect(result.headline.toLowerCase()).not.toMatch(/erken hasat/);
  });
});

describe('groundPublishCopyToVisual — other sectors stay intact', () => {
  it('does not rewrite a beach sunset caption', () => {
    const caption = 'Gün batımında şezlonga uzan, altın saat kaçmasın.';
    const result = groundPublishCopyToVisual({
      caption,
      headline: 'Altın Saat',
      photoUrl: 'https://cdn.example.com/sunset.jpg',
      galleryMeta: { 'https://cdn.example.com/sunset.jpg': SUNSET },
    });
    expect(result.changed).toBe(false);
    expect(result.caption).toBe(caption);
    expect(result.headline).toBe('Altın Saat');
  });

  it('does not rewrite a honey review that has no oil-grade claim', () => {
    const caption = 'Gerçek bir müşterimizden: diken balımızı denediniz mi?';
    const result = groundPublishCopyToVisual({
      caption,
      headline: 'Diken balımızı denediniz mi',
      photoUrl: 'https://cdn.example.com/honey.jpg',
      galleryMeta: { 'https://cdn.example.com/honey.jpg': HONEY },
    });
    expect(result.caption).toBe(caption);
  });
});

describe('collectInventoryClaimEvidence', () => {
  it('unions label proof across the tenant gallery', () => {
    const inv = collectInventoryClaimEvidence({
      a: SIZMA,
      b: HONEY,
    });
    expect(inv.claims.has('extra_virgin')).toBe(true);
    expect(inv.claims.has('early_harvest')).toBe(false);
  });
});
