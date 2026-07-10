import { describe, expect, it } from 'vitest';
import {
  isPremiumVenueSector,
  pillarsNeedRealignment,
  resolveContentPillars,
  resolveFalDesignIntensity,
  resolveTypographyDesign,
  resolveTypographyVibe,
  sectorAntiPatterns,
} from '../production-design-policy';

describe('production-design-policy', () => {
  it('assigns premium beach club Fal intensity', () => {
    expect(isPremiumVenueSector('beach_club')).toBe(true);
    const intensity = resolveFalDesignIntensity({ sector: 'beach_club', textOverlayDensity: 'minimal' });
    expect(intensity.story).toBe('photo_first');
    expect(intensity.reel).toBe('elegant_light');
  });

  it('assigns local products photo-first intensity', () => {
    const intensity = resolveFalDesignIntensity({ sector: 'local_products_shop' });
    expect(intensity.story).toBe('photo_first');
    expect(intensity.post).toBe('elegant_light');
  });

  it('realigns hospitality pillars away from beauty leak', () => {
    const bad = ['service_intro', 'educational_post', 'lead_generation'];
    expect(pillarsNeedRealignment('beach_club', bad)).toBe(true);
    const fixed = resolveContentPillars('beach_club', bad);
    expect(fixed).toContain('daily_story');
    expect(fixed).not.toContain('educational_post');
  });

  it('builds typography design with watermark overlay', () => {
    const design = resolveTypographyDesign({
      sector: 'beach_club',
      visualDna: 'bohemian-luxe Cycladic quiet luxury',
      accentColor: '#C4A484',
    });
    expect(['warm_coastal', 'editorial_serif']).toContain(design.vibe);
    expect(design.logo_treatment).toBe('watermark');
    expect(design.accent_color).toBe('#C4A484');
    expect(sectorAntiPatterns('beach_club').length).toBeGreaterThan(3);
    expect(resolveTypographyVibe({ sector: 'local_products_shop', visualDna: 'organic artisan farm' })).toBe(
      'retro_poster',
    );
  });
});
