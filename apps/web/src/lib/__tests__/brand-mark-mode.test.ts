import { describe, expect, it } from 'vitest';
import { resolveBrandMarkMode } from '@/lib/brand-mark-mode';

describe('resolveBrandMarkMode', () => {
  it('uses official logo and forbids typed wordmark when logo URL exists', () => {
    const mark = resolveBrandMarkMode({
      logoUrl: 'https://cdn.example.com/logo.png',
      brandName: 'Karaman Datça',
      logoTreatment: 'watermark',
    });
    expect(mark.mode).toBe('official_logo');
    expect(mark.logoUrl).toContain('logo.png');
    expect(mark.typeWordmark).toBe(false);
    expect(mark.xorDirective).toMatch(/never both/i);
    expect(mark.xorDirective).toMatch(/FORBIDDEN/i);
  });

  it('types brand wordmark when no logo asset', () => {
    const mark = resolveBrandMarkMode({
      logoUrl: null,
      brandName: 'Karaman Datça',
      logoTreatment: 'badge',
    });
    expect(mark.mode).toBe('text_wordmark');
    expect(mark.typeWordmark).toBe(true);
    expect(mark.logoUrl).toBeUndefined();
    expect(mark.xorDirective).toContain('Karaman Datça');
  });

  it('returns none when treatment is none', () => {
    const mark = resolveBrandMarkMode({
      logoUrl: 'https://cdn.example.com/logo.png',
      brandName: 'Yula',
      logoTreatment: 'none',
    });
    expect(mark.mode).toBe('none');
    expect(mark.typeWordmark).toBe(false);
    expect(mark.logoUrl).toBeUndefined();
  });

  it('honors wantBrandMark=false even when logo URL exists (template includeLogo off)', () => {
    const mark = resolveBrandMarkMode({
      logoUrl: 'https://cdn.example.com/sarnic-logo.png',
      brandName: 'Sarnıç Beach',
      logoTreatment: 'watermark',
      wantBrandMark: false,
    });
    expect(mark.mode).toBe('none');
    expect(mark.logoUrl).toBeUndefined();
    expect(mark.typeWordmark).toBe(false);
  });
});
