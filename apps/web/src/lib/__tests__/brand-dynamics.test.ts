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

  // Same-batch theme overlap is not a repeat: the ideas keep their own copy and
  // only the design angle rotates. Planning labels on canvas fail the on-canvas
  // quality gate downstream, which then paints a truncated caption prefix.
  it.each([
    {
      sector: 'restaurant_cafe',
      ideas: [
        { headline: 'Bahçemizden Sofranıza!', caption_draft: 'Bahçemizdeki taze ürünlerle aile lezzetleri.' },
        { headline: 'Bungalovda Ailece Keyifli Anlar!', caption_draft: 'Bahçemizde ailenizle doğa içinde konaklama.' },
      ],
    },
    {
      sector: 'local_products_shop',
      ideas: [
        { headline: 'Zeytin Hasadı Başladı!', caption_draft: 'Datça zeytin hasadımız için soğuk sıkım süreci.' },
        { headline: 'Reçelimi Nasıl Yaparım?', caption_draft: 'Datça zeytin ve reçel üretim sürecimizi anlatıyoruz.' },
      ],
    },
  ])('keeps publishable copy on same-batch theme overlap ($sector)', ({ ideas }) => {
    const out = applyCrossMissionHeadlineDedupe(
      ideas as Record<string, unknown>[],
      emptyHistory(),
    );
    for (let i = 0; i < ideas.length; i++) {
      expect(out[i]?.headline).toBe(ideas[i]!.headline);
    }
    // The later idea rotates its angle without losing its headline.
    const rotated = out.find((o) => o.cross_mission_headline_rotated === true);
    if (rotated) {
      expect(rotated.template_use_case).toBeTruthy();
      expect(rotated.rotation_angle_label).toBeTruthy();
    }
  });

  it('never turns a planning angle into the headline of a caption-only idea', () => {
    const history = buildRecentHeadlineHistory([
      { createdAt: new Date().toISOString(), metadata: { headline: 'Bahçemizde kahvaltı keyfi' } },
      { createdAt: new Date().toISOString(), metadata: { headline: 'Serpme köy kahvaltısı' } },
      { createdAt: new Date().toISOString(), metadata: { headline: 'Kahvaltı sofrası hazır' } },
    ]);
    const out = applyCrossMissionHeadlineDedupe(
      [{
        caption_draft:
          'Serpme köy kahvaltımızda her şey taze! Bahçemizde kahvaltı keyfi sizi bekliyor.',
      }],
      history,
    );
    expect(out[0]?.cross_mission_headline_rotated).toBe(true);
    expect(out[0]?.rotation_angle_label).toBeTruthy();
    // An absent headline lets the caption drive the overlay; a planning label
    // here would be stored as the ideation headline and painted on the canvas.
    expect(out[0]?.headline ?? '').toBe('');
    expect(out[0]?.concept_title ?? '').toBe('');
  });
});

function emptyHistory() {
  return {
    recentKeys: new Set<string>(),
    freeTrialBurned: false,
    themeClusterCounts: new Map<string, number>(),
    burnedThemeClusters: new Set<string>(),
    days: 14,
  };
}
