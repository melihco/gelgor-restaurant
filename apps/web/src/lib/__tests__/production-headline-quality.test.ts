import { describe, expect, it } from 'vitest';
import {
  isUsableVisualDesignCardHeadline,
  resolveMeaningfulProductionHeadline,
  sanitizeProductionHeadline,
} from '@/lib/production-headline-quality';

describe('visual design card headline preference', () => {
  it('accepts short punchy card headlines that label-style would reject', () => {
    expect(isUsableVisualDesignCardHeadline('Doğanın Tazeliği', 'Karaman Datça')).toBe(true);
    expect(isUsableVisualDesignCardHeadline('Balın Doğallığı', 'Karaman Datça')).toBe(true);
    expect(isUsableVisualDesignCardHeadline('Badem Ezmesi', 'Karaman Datça')).toBe(true);
  });

  it('rejects incomplete / brief / brand-echo card text', () => {
    expect(isUsableVisualDesignCardHeadline('Ürünlerde geçerli yaz', 'Karaman Datça')).toBe(false);
    expect(isUsableVisualDesignCardHeadline('Karaman Datça', 'Karaman Datça')).toBe(false);
    expect(isUsableVisualDesignCardHeadline('Yaz fırsatları story', 'Karaman Datça')).toBe(false);
  });

  it('prefers card over caption hook when headline is empty', () => {
    const r = resolveMeaningfulProductionHeadline({
      headline: '',
      caption: 'Ürünlerde geçerli yaz fırsatlarının tanıtımını yapacağız.',
      brandName: 'Karaman Datça',
      visualDesignHeadline: 'Doğanın Tazeliği',
      businessType: 'local_products_shop',
      maxLen: 32,
    });
    expect(r.headline).toBe('Doğanın Tazeliği');
    expect(r.reason).toBe('visual_design_card');
  });

  it('prefers card over caption when ideation headline is incomplete', () => {
    const r = resolveMeaningfulProductionHeadline({
      headline: 'Ekip üyelerimizin',
      caption: 'Ekip üyelerimizin birlikte ürünlerimizi tanıtması.',
      brandName: 'Karaman Datça',
      visualDesignHeadline: 'Doğanın Tazeliği',
      businessType: 'local_products_shop',
      maxLen: 32,
    });
    expect(r.headline).toBe('Doğanın Tazeliği');
    expect(r.reason).toBe('label_visual_design_card');
  });

  it('sanitizeProductionHeadline prefers visualDesignHeadline first', () => {
    const h = sanitizeProductionHeadline({
      headline: 'Ürünlerde geçerli yaz fırsatlarının tanıtımını yapacağız',
      ideationHeadline: 'Ürünlerde geçerli yaz fırsatlarının tanıtımını yapacağız',
      caption: 'Ürünlerde geçerli yaz fırsatlarının tanıtımını yapacağız.',
      brandName: 'Karaman Datça',
      visualDesignHeadline: 'Doğanın Tazeliği',
      businessType: 'local_products_shop',
      maxLen: 32,
    });
    expect(h).toBe('Doğanın Tazeliği');
  });

  it('sanitize with card beats Badamlı truncated ideation', () => {
    const h = sanitizeProductionHeadline({
      headline: 'Müşterilerimiz',
      ideationHeadline: 'Müşterilerimiz Badamlı Kurabiyeleri Seviyor!',
      caption: "Müşterilerimiz, Karaman Datça'nın bademli kurabiyelerini çok seviyor!",
      brandName: 'Karaman Datça',
      visualDesignHeadline: 'Badem Ezmesi',
      businessType: 'local_products_shop',
      maxLen: 32,
    });
    expect(h).toBe('Badem Ezmesi');
  });
});
