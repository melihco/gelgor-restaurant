import { describe, expect, it } from 'vitest';
import {
  buildAiBrandDescriptionFallback,
  isStructuredBrandDescription,
  normalizeSynthesizedBrandDescription,
  sanitizeDiscoveryText,
} from '@/lib/ai-brand-description';

describe('ai-brand-description', () => {
  it('sanitizes crawl nav junk and short noise', () => {
    const cleaned = sanitizeDiscoveryText(
      'Anasayfa\nHoş Geldiniz\nSarnıç Beach 1993’ten beri Bodrum’da beach club deneyimi sunar. Plaj, mutfak ve müzik bir arada.',
    );
    expect(cleaned.toLowerCase()).not.toContain('anasayfa');
    expect(cleaned).toMatch(/sarnıç|beach/i);
  });

  it('builds about + offerings shape for beach club (tr)', () => {
    const text = buildAiBrandDescriptionFallback({
      brandName: 'Sarnıç Beach',
      industry: 'beach_club',
      location: 'Bodrum',
      websiteSummary:
        '1993’ten beri Bodrum’da beach club. Plaj, havuz, restoran bar ve DJ etkinlikleri.',
      language: 'tr',
    });
    expect(text).toContain('Sarnıç Beach');
    expect(text).toMatch(/Ürünler\s*\/\s*Hizmetler:/i);
    expect(text).toMatch(/^- /m);
    expect(isStructuredBrandDescription(text)).toBe(true);
  });

  it('prefers explicit signature offerings over keyword inference', () => {
    const text = buildAiBrandDescriptionFallback({
      brandName: 'Gel Gör',
      industry: 'local_products_shop',
      location: 'Datça',
      websiteSummary: 'Yöresel ürün dükkanı.',
      signatureOfferings: ['Badem ezmesi', 'Ham bal', 'Zeytinyağı'],
      language: 'tr',
    });
    expect(text).toContain('Badem ezmesi');
    expect(text).toContain('Ham bal');
    expect(text).not.toMatch(/Instagram bio:/i);
    expect(text).not.toMatch(/Hedef kitle:/i);
  });

  it('normalizes model output without inventing crawl meta labels', () => {
    const normalized = normalizeSynthesizedBrandDescription(
      '```text\nSarnıç Beach Bodrum beach club.\n\nÜrünler / Hizmetler:\n- Plaj\n- Bar\n```',
      'tr',
    );
    expect(normalized.startsWith('```')).toBe(false);
    expect(normalized).toContain('Ürünler / Hizmetler:');
    expect(isStructuredBrandDescription(normalized)).toBe(true);
  });

  it('english fallback uses Products / Services heading', () => {
    const text = buildAiBrandDescriptionFallback({
      brandName: 'Coast Club',
      industry: 'beach_club',
      location: 'Bodrum',
      websiteSummary: 'Day beds, pool, restaurant bar and live DJ nights by the sea.',
      language: 'en',
    });
    expect(text).toMatch(/Products\s*\/\s*Services:/i);
  });
});
