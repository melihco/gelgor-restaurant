import { describe, expect, it } from 'vitest';
import { mergeBrandGapLists, countActionableGaps } from '@/lib/brand-gap-analysis';

describe('mergeBrandGapLists dedupe', () => {
  it('does not double-count discovery when python and BRS both report it', () => {
    const merged = mergeBrandGapLists(
      [{
        id: 'discovery_low',
        label: 'Keşif güven skoru düşük (50/70)',
        severity: 'medium',
        fix: 'brand-analysis',
      }],
      {
        discoveryConfidence: 50,
        readinessMissing: [{
          id: 'discovery_confidence',
          label: 'Keşif güven skoru',
          weight: 15,
          earned: 10,
          passed: false,
          detail: '50 / 70',
          action: 'Analyze',
          fix: 'brand-analysis',
        }],
      },
    );
    const discoveryItems = merged.filter((g) =>
      g.id === 'discovery_low' || g.id === 'brs_discovery_confidence',
    );
    expect(discoveryItems).toHaveLength(1);
    expect(discoveryItems[0]?.id).toBe('discovery_low');
  });

  it('keeps constitution gap when only BRS reports it', () => {
    const merged = mergeBrandGapLists([], {
      discoveryConfidence: 80,
      contentPillarCount: 3,
      defaultCtaCount: 2,
      usablePhotoCount: 10,
      analyzedPhotoCount: 10,
      brandDna: { data_richness: 'ok' },
      description: 'Uzun ve özgün marka açıklaması metni burada yer alır.',
      websiteSummary: 'Website özeti mevcut.',
      readinessMissing: [{
        id: 'constitution',
        label: 'Marka Anayasası onaylı',
        weight: 20,
        earned: 0,
        passed: false,
        detail: 'Onay bekliyor',
        action: 'Onayla',
        fix: 'brand-constitution',
      }],
    });
    expect(merged.some((g) => g.id === 'brs_constitution')).toBe(true);
    expect(countActionableGaps(merged)).toBe(1);
  });
});
