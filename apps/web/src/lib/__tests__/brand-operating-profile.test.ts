import { describe, expect, it } from 'vitest';
import { weeklyRhythmSignals } from '@/lib/context-signals/calculators';
import { buildActiveSignals } from '@/lib/context-signals';
import { computeBrandDynamics } from '@/lib/brand-dynamics';
import {
  hasDaypartCopyConflict,
  headlineViolatesBrandOperatingProfile,
  resolveBrandOperatingProfile,
} from '@/lib/brand-operating-profile';
import { resolveMeaningfulProductionHeadline } from '@/lib/production-headline-quality';

const GEL_GOR_LIKE = {
  businessType: 'restaurant',
  brandDescription: 'Datça yöresel serpme köy kahvaltısı — bahçede mandalina ağaçları altında kahvaltı deneyimi.',
  visualDna: 'Sıcak, samimi, doğal bahçe kahvaltı atmosferi. Sabah servisi.',
  brandTheme: {
    anti_patterns: ['deniz/sahil', 'gece hayatı', 'DJ'],
  },
};

describe('resolveBrandOperatingProfile', () => {
  it('marks breakfast-first venues as rejecting nightlife themes', () => {
    const profile = resolveBrandOperatingProfile(GEL_GOR_LIKE);
    expect(profile.daypart).toBe('breakfast_daytime');
    expect(profile.rejectsNightlifeThemes).toBe(true);
    expect(profile.prefersBreakfastBrunch).toBe(true);
  });

  it('allows nightlife for nightclub sector', () => {
    const profile = resolveBrandOperatingProfile({
      businessType: 'nightclub',
      brandDescription: 'DJ lineup and late night parties',
    });
    expect(profile.rejectsNightlifeThemes).toBe(false);
  });
});

describe('weeklyRhythmSignals brand isolation', () => {
  it('replaces saturday night with saturday brunch for breakfast venues', () => {
    const profile = resolveBrandOperatingProfile(GEL_GOR_LIKE);
    const saturday = new Date('2026-07-04T12:00:00Z'); // Saturday UTC
    const signals = weeklyRhythmSignals(saturday, profile);
    expect(signals.some((s) => s.meta?.rhythm === 'saturday_night')).toBe(false);
    expect(signals.some((s) => s.meta?.rhythm === 'saturday_brunch')).toBe(true);
    expect(signals.some((s) => s.contentHooks.some((h) => /gece/i.test(h)))).toBe(false);
  });

  it('keeps saturday night for generic venues', () => {
    const saturday = new Date('2026-07-04T12:00:00Z');
    const signals = weeklyRhythmSignals(saturday);
    expect(signals.some((s) => s.meta?.rhythm === 'saturday_night')).toBe(true);
  });
});

describe('buildActiveSignals filtering', () => {
  it('does not surface saturday night hooks for breakfast restaurant', () => {
    const result = buildActiveSignals({
      date: new Date('2026-07-04T12:00:00Z'),
      businessType: 'restaurant',
      brandDescription: GEL_GOR_LIKE.brandDescription,
    });
    const blob = result.signals.map((s) => `${s.title} ${s.contentHooks.join(' ')}`).join(' ');
    expect(blob).not.toMatch(/cumartesi gece yoğunluğu/i);
  });
});

describe('production headline brand isolation', () => {
  it('rewrites Cumartesi gece when caption is breakfast', () => {
    expect(hasDaypartCopyConflict(
      'Yeni serpme köy kahvaltımızla güne Gel Gör Restaurant',
      'Cumartesi gece yoğunluğu',
    )).toBe(true);

    const resolved = resolveMeaningfulProductionHeadline({
      headline: 'Cumartesi gece yoğunluğu',
      caption: 'Yeni serpme köy kahvaltımızla güne Gel Gör Restaurant — bahçede kahvaltı keyfi.',
      brandName: 'Gel Gör Restaurant',
      businessType: 'restaurant',
      maxLen: 32,
    });
    expect(resolved.replaced).toBe(true);
    expect(resolved.headline.toLowerCase()).not.toMatch(/gece/);
  });

  it('flags night headline for breakfast brand profile', () => {
    const profile = resolveBrandOperatingProfile(GEL_GOR_LIKE);
    expect(headlineViolatesBrandOperatingProfile('CUMARTESİ GECE', profile)).toBe(true);
  });
});

describe('computeBrandDynamics breakfast isolation', () => {
  it('includes operating model directive for breakfast restaurant', () => {
    const result = computeBrandDynamics({
      date: new Date('2026-07-04T12:00:00Z'),
      businessType: 'restaurant',
      brandDescription: GEL_GOR_LIKE.brandDescription,
      brandTheme: GEL_GOR_LIKE.brandTheme,
    });
    expect(result.strategistBlock).toMatch(/BRAND OPERATING MODEL/i);
    expect(result.strategistBlock).not.toMatch(/cumartesi gece yoğunluğu/i);
  });
});
