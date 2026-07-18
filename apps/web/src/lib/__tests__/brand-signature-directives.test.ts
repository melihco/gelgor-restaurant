import { describe, expect, it } from 'vitest';
import { buildBrandSignaturePack } from '../brand-signature-directives';

describe('buildBrandSignaturePack', () => {
  it('builds grading + composition + agency-level directives from vibe/theme', () => {
    const pack = buildBrandSignaturePack({
      brandName: 'Test Beach',
      sector: 'beach_club',
      brandTone: 'samimi, sıcak',
      visualStyle: 'golden hour coastal editorial',
      brandTheme: {
        grading: {
          look: 'warm golden editorial',
          lutDirective: 'warm tones, lifted shadows, golden cast',
        },
        composition: { primary_pattern: 'lower-third type, airy negative space' },
        caption_voice_rules: ['kısa ve davetkar', 'yerel sahil hissi'],
        typography_design: { vibe: 'warm_coastal' },
      },
      brandVibeProfile: {
        what_makes_this_agency_level: 'Quiet luxury type with real venue light, never stock sunset clichés.',
      },
    });

    expect(pack.directives.length).toBeGreaterThanOrEqual(3);
    expect(pack.directives.some((d) => d.includes('SIGNATURE GRADING'))).toBe(true);
    expect(pack.directives.some((d) => d.includes('AGENCY-LEVEL TARGET'))).toBe(true);
    expect(pack.summary.grading).toMatch(/warm golden/i);
    expect(pack.summary.agencyLevel).toMatch(/Quiet luxury/i);
  });

  it('still returns a micro-signature line with sparse inputs', () => {
    const pack = buildBrandSignaturePack({ brandName: 'Minimal Co', sector: 'cafe' });
    expect(pack.directives[0]).toMatch(/BRAND SIGNATURE/);
    expect(pack.directives.some((d) => d.includes('MICRO SIGNATURE'))).toBe(true);
  });
});
