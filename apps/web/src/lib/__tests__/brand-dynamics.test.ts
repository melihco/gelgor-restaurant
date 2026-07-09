import { describe, expect, it } from 'vitest';
import { computeBrandDynamics } from '@/lib/brand-dynamics';
import {
  buildThemeClusterCounts,
  detectHeadlineThemeClusters,
  hasCaptionHeadlineThemeConflict,
} from '@/lib/headline-theme-clusters';
import {
  applyCrossMissionHeadlineDedupe,
  buildRecentHeadlineHistory,
} from '@/lib/mission-headline-history';

describe('headline theme clusters', () => {
  it('detects DJ and seafood clusters independently', () => {
    expect(detectHeadlineThemeClusters('Cumartesi DJ Gecesi')).toContain('dj_nightlife');
    expect(detectHeadlineThemeClusters('Taze deniz ürünleri menüsü')).toContain('seafood_menu');
    expect(detectHeadlineThemeClusters('Dolunay partisi')).toContain('full_moon');
  });

  it('counts repeated themes across headlines', () => {
    const counts = buildThemeClusterCounts([
      'DJ Night',
      'Hafta sonu DJ',
      'Brunch menüsü',
    ]);
    expect(counts.get('dj_nightlife')).toBe(2);
    expect(counts.get('brunch_weekend')).toBe(1);
  });

  it('flags kitchen overlay vs DJ caption as theme conflict', () => {
    expect(
      hasCaptionHeadlineThemeConflict(
        'Bu yaz sıcak geceleri DJ performanslarıyla renklendiriyoruz',
        'Mutfağımızda Neler',
      ),
    ).toBe(true);
    expect(
      hasCaptionHeadlineThemeConflict(
        'Bu yaz sıcak geceleri DJ performanslarıyla renklendiriyoruz',
        'DJ Gecesi',
      ),
    ).toBe(false);
  });
});

describe('computeBrandDynamics', () => {
  it('emits mandatory angles for beach_club in summer', () => {
    const result = computeBrandDynamics({
      date: new Date('2026-07-15T12:00:00Z'),
      businessType: 'beach_club',
      brandName: 'Coastal Venue',
      location: 'Bodrum Sahil',
    });
    expect(result.mandatoryAngles.length).toBeGreaterThan(0);
    expect(result.strategistBlock).toMatch(/ZORUNLU ÇEŞİTLİLİK AÇILARI/);
    expect(result.sectorPack.id).toBe('beach_hospitality');
  });

  it('avoids burned theme clusters from history', () => {
    const result = computeBrandDynamics({
      date: new Date('2026-07-15T12:00:00Z'),
      businessType: 'beach_club',
      location: 'Antalya plaj',
      themeClusterCounts: { dj_nightlife: 3, seafood_menu: 2 },
    });
    expect(result.avoidThemeClusters).toContain('dj_nightlife');
    expect(result.avoidThemeClusters).toContain('seafood_menu');
    expect(result.strategistBlock).toMatch(/KAÇINILACAK TEKRAR TEMALARI/);
  });

  it('covers local_products_shop sector without retail false positive', () => {
    const result = computeBrandDynamics({
      date: new Date('2026-06-01T12:00:00Z'),
      businessType: 'local_products_shop',
      brandDescription: 'Yöresel el yapımı ürünler',
    });
    expect(result.sectorPack.id).toBe('local_artisan');
  });
});

describe('cross-mission headline dedupe with theme clusters', () => {
  it('rotates ideas matching burned DJ/seafood clusters', () => {
    const history = buildRecentHeadlineHistory([
      {
        createdAt: new Date().toISOString(),
        metadata: { headline: 'Cumartesi DJ Gecesi' },
      },
      {
        createdAt: new Date().toISOString(),
        metadata: { headline: 'Hafta sonu DJ lineup' },
      },
      {
        createdAt: new Date().toISOString(),
        metadata: { headline: 'Deniz ürünleri özel menü' },
      },
      {
        createdAt: new Date().toISOString(),
        metadata: { headline: 'Taze balık ve karides' },
      },
    ]);
    expect(history.burnedThemeClusters.has('dj_nightlife')).toBe(true);

    const out = applyCrossMissionHeadlineDedupe(
      [
        { headline: 'DJ Night Special', content_type: 'story' },
        { headline: 'Taze balık tabağı', content_type: 'post' },
      ],
      history,
      {
        mandatoryAngles: computeBrandDynamics({
          businessType: 'beach_club',
          location: 'Bodrum',
        }).mandatoryAngles,
      },
    );
    expect(out[0]?.cross_mission_headline_rotated).toBe(true);
    expect(out[1]?.cross_mission_headline_rotated).toBe(true);
    expect(String(out[0]?.headline)).not.toMatch(/dj/i);
  });
});
