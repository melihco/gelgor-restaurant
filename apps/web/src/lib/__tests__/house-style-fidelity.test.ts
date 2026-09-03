import { describe, expect, it } from 'vitest';
import { compileBrandDesignConstitution } from '@/lib/brand-design-constitution';
import { GRAFIKER_HARD_FLOOR, GRAFIKER_PASS_THRESHOLD } from '@/lib/grafiker-quality';
import {
  expectedFromConstitution,
  houseFidelityArtifactMeta,
  houseIdentityFingerprint,
  identityShiftFields,
  isFillRecipeStale,
  observedFromRecipe,
  scoreHouseStyleFidelity,
} from '@/lib/house-style-fidelity';
import { buildProductionQualityScorecard } from '@/lib/production-quality-scorecard';
import type { OutputArtifact } from '@/types';

const artifact = { id: 'a', content: '{}', metadata: {} } as OutputArtifact;

describe('house identity fingerprint', () => {
  it('ignores hex case and first-write emptiness', () => {
    expect(houseIdentityFingerprint({
      headingFont: 'Syne',
      primary: '#0B3D4A',
    })).toBe(houseIdentityFingerprint({
      headingFont: 'syne',
      primary: '#0b3d4a',
    }));
    expect(identityShiftFields({}, { headingFont: 'Syne', primary: '#0b3d4a' })).toEqual([]);
  });

  it('detects font + palette shift for beach vs shop', () => {
    const beach = {
      headingFont: 'Syne',
      bodyFont: 'Sora',
      fontSource: 'onboarding',
      primary: '#0b3d4a',
      accent: '#e8b86d',
      vibe: 'warm_coastal',
    };
    const shop = {
      headingFont: 'Fraunces',
      bodyFont: 'Sora',
      fontSource: 'onboarding',
      primary: '#5c3317',
      accent: '#c9a96e',
      vibe: 'anatolian_warm',
    };
    expect(identityShiftFields(beach, shop)).toEqual(
      expect.arrayContaining(['heading_font', 'primary', 'accent', 'vibe']),
    );
    expect(identityShiftFields(beach, { ...beach, headingFont: 'Syne' })).toEqual([]);
  });
});

describe('scoreHouseStyleFidelity', () => {
  it('scores a matching beach house high and a stale shop recipe as warn', () => {
    const beach = compileBrandDesignConstitution({
      brandName: 'Coastal Club',
      sector: 'beach_club',
      brandTheme: {
        typography: { heading_font: 'Syne', font_source: 'onboarding' },
        palette: { primary: '#0b3d4a', accent: '#e8b86d' },
      },
      visualDnaTone: 'sun-washed coastal editorial',
    });
    const ok = scoreHouseStyleFidelity({
      expected: expectedFromConstitution(beach, { logoTreatment: 'watermark' }),
      observed: observedFromRecipe({
        version: 1,
        headingFont: 'Syne',
        primary: '#0b3d4a',
        composeMode: beach.composeMode,
        layoutPackId: beach.layoutPackId,
      }, { includeLogo: true, prompt: 'TYPE LOCK heading=Syne' }),
    });
    expect(ok.score).toBeGreaterThanOrEqual(7);
    expect(ok.warn).toBe(false);

    const stale = scoreHouseStyleFidelity({
      expected: expectedFromConstitution(beach, { logoTreatment: 'none' }),
      observed: {
        headingFont: 'Playfair Display',
        primary: '#ff00aa',
        composeMode: 'craft_window',
        includeLogo: true,
        prompt: 'neon flyer energy, Playfair Display',
      },
    });
    expect(stale.warn).toBe(true);
    expect(stale.violations.map((v) => v.id)).toEqual(
      expect.arrayContaining(['heading_font', 'color_roles', 'logo_treatment']),
    );
    expect(stale.score).toBeLessThan(7);
  });

  it('flags shop recipe stale when onboarding font changes', () => {
    expect(isFillRecipeStale(
      { version: 1, headingFont: 'Playfair Display', primary: '#111111' },
      { headingFont: 'Fraunces', primary: '#5c3317' },
    )).toBe(true);
    expect(isFillRecipeStale(
      { version: 1, headingFont: 'Fraunces', primary: '#5c3317' },
      { headingFont: 'Fraunces', primary: '#5C3317' },
    )).toBe(false);
  });
});

describe('scorecard — fidelity is a warning, Grafiker floor stays ≤4', () => {
  it('does not hard-block a 6/10 Grafiker score (threshold stays 8 warn / 4 block)', () => {
    expect(GRAFIKER_PASS_THRESHOLD).toBe(8);
    expect(GRAFIKER_HARD_FLOOR).toBe(4);
    const card = buildProductionQualityScorecard(artifact, {
      grafiker_score: 6,
      grafiker_pass: false,
    });
    expect(card.hardBlock).toBe(false);
    expect(card.softWarnings.join(' ')).toContain('6/10');
  });

  it('warns on house fidelity without blocking publish', () => {
    const meta = houseFidelityArtifactMeta({
      score: 4,
      applicable: 3,
      passed: 1,
      violations: [{ id: 'heading_font', detail: 'Fraunces vs Syne' }],
      warn: true,
    });
    const card = buildProductionQualityScorecard(artifact, {
      grafiker_score: 7,
      ...meta,
    });
    expect(card.hardBlock).toBe(false);
    expect(card.softWarnings.join(' ')).toMatch(/Ev dili sapması 4\/10/);
  });
});
