import { describe, expect, it } from 'vitest';
import { CANVA_ARCHETYPE_CATALOG } from '@/lib/canva-archetype-catalog';
import {
  DESIGN_SPEC_LAYOUT_VERSION,
  buildDesignSpecLayoutLockBlock,
  hasUsableDesignSpecLayout,
  listSeededDesignSpecArchetypeIds,
  parseDesignSpecLayout,
  resolveDesignSpecLayout,
  seedDesignSpecLayout,
} from '@/lib/design-spec-layout';
describe('design_spec.layout v1 seeds', () => {
  it('covers every Canva archetype in the catalog', () => {
    const seeded = new Set(listSeededDesignSpecArchetypeIds());
    for (const arch of CANVA_ARCHETYPE_CATALOG) {
      expect(seeded.has(arch.id)).toBe(true);
    }
    expect(seeded.size).toBe(CANVA_ARCHETYPE_CATALOG.length);
  });

  it('seeds split_feature_panel for feed (4:5) with left scrim + accent (photo-led)', () => {
    const layout = seedDesignSpecLayout({
      archetypeId: 'split_feature_panel',
      format: 'post',
    });
    expect(layout).not.toBeNull();
    expect(layout!.version).toBe(DESIGN_SPEC_LAYOUT_VERSION);
    expect(layout!.canvas.aspectRatio).toBe('4:5');
    expect(layout!.canvas.width).toBe(1080);
    expect(layout!.canvas.height).toBe(1350);
    expect(layout!.panels.some((p) => p.role === 'scrim')).toBe(true);
    expect(layout!.panels.some((p) => p.role === 'color_block')).toBe(false);
    expect(layout!.photoSlot.width).toBe(1);
    expect(layout!.photoSlot.height).toBe(1);
    const headline = layout!.textSlots.find((t) => t.role === 'headline');
    expect(headline?.zone.width).toBeLessThan(0.55);
    expect(layout!.renderPath).toBe('deterministic_compose');
  });

  it('seeds neon_night_promo with bottom scrim + accent rule (no paint slab)', () => {
    const layout = seedDesignSpecLayout({
      archetypeId: 'neon_night_promo',
      format: 'post',
    });
    expect(layout!.panels.some((p) => p.role === 'scrim')).toBe(true);
    expect(layout!.panels.some((p) => p.role === 'shape')).toBe(true);
    expect(layout!.panels.some((p) => p.role === 'color_block')).toBe(false);
    expect(layout!.photoSlot.width).toBe(1);
  });

  it('retires color_block slabs on promo/campaign archetypes (photo-led v3)', () => {
    const promo = seedDesignSpecLayout({
      archetypeId: 'promo_price_stack',
      format: 'post',
    });
    expect(promo!.panels.some((p) => p.role === 'color_block')).toBe(false);
    expect(promo!.panels.some((p) => p.role === 'frosted' || p.role === 'scrim')).toBe(true);
    expect(promo!.photoSlot.width).toBe(1);
    const campaign = seedDesignSpecLayout({
      archetypeId: 'campaign_hero_block',
      format: 'post',
    });
    expect(campaign!.panels.some((p) => p.role === 'color_block')).toBe(false);
    expect(campaign!.photoSlot.height).toBe(1);
    const diagonal = seedDesignSpecLayout({
      archetypeId: 'diagonal_brand_split',
      format: 'post',
    });
    expect(diagonal!.panels.some((p) => p.role === 'color_block')).toBe(false);
    expect(diagonal!.panels.some((p) => p.role === 'scrim')).toBe(true);
  });

  it('seeds story/reel as 9:16 with UI-safe bands (beach_club style slot)', () => {
    const layout = seedDesignSpecLayout({
      archetypeId: 'cinematic_full_bleed',
      format: 'story',
      pinMode: 'hard',
    });
    expect(layout!.canvas.aspectRatio).toBe('9:16');
    expect(layout!.canvas.height).toBe(1920);
    expect(layout!.safeArea.top).toBeGreaterThanOrEqual(0.1);
    expect(layout!.safeArea.bottom).toBeGreaterThanOrEqual(0.12);
    expect(layout!.pinMode).toBe('hard');
  });

  it('seeds product_hero_card for retail-style post (local_products_shop vertical)', () => {
    const layout = seedDesignSpecLayout({
      archetypeId: 'product_hero_card',
      format: 'post',
    });
    expect(layout).not.toBeNull();
    expect(layout!.photoSlot.width).toBeGreaterThan(0.5);
    expect(layout!.photoSlot.height).toBeGreaterThan(0.4);
    expect(hasUsableDesignSpecLayout(layout)).toBe(true);
  });

  it('returns null for unknown archetype ids', () => {
    expect(seedDesignSpecLayout({ archetypeId: 'not_a_real_archetype', format: 'post' })).toBeNull();
  });
});

describe('parseDesignSpecLayout / dual-read', () => {
  it('parses a persisted layout document', () => {
    const seeded = seedDesignSpecLayout({
      archetypeId: 'magazine_cover_drop',
      format: 'post',
    })!;
    const parsed = parseDesignSpecLayout(JSON.parse(JSON.stringify(seeded)));
    expect(parsed?.archetypeId).toBe('magazine_cover_drop');
    expect(parsed?.textSlots.some((t) => t.role === 'headline')).toBe(true);
  });

  it('rejects broken documents', () => {
    expect(parseDesignSpecLayout({ version: 1, photoSlot: { x: 0, y: 0, width: 1, height: 1 } })).toBeNull();
    expect(parseDesignSpecLayout({ version: 99 })).toBeNull();
    expect(parseDesignSpecLayout(null)).toBeNull();
  });

  it('resolveDesignSpecLayout falls back to archetype seed for legacy rows', () => {
    const resolved = resolveDesignSpecLayout({
      layout: undefined,
      archetypeId: 'promo_price_stack',
      format: 'post',
      layoutPattern: 'legacy prose only',
    });
    expect(resolved?.archetypeId).toBe('promo_price_stack');
    expect(resolved?.layoutPattern).toBe('legacy prose only');
    expect(hasUsableDesignSpecLayout(resolved)).toBe(true);
    expect(resolved?.panels.length).toBeGreaterThan(0);
  });

  it('resolveDesignSpecLayout prefers persisted layout over seed', () => {
    const custom = seedDesignSpecLayout({
      archetypeId: 'noir_editorial',
      format: 'post',
    })!;
    custom.photoSlot = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };
    const resolved = resolveDesignSpecLayout({
      layout: custom,
      archetypeId: 'split_feature_panel',
      format: 'post',
    });
    expect(resolved?.archetypeId).toBe('noir_editorial');
    expect(resolved?.photoSlot.width).toBe(0.5);
  });
});

describe('layout lock prompt dual-read', () => {
  it('embeds numeric slots when layout document is present', () => {
    const layout = seedDesignSpecLayout({
      archetypeId: 'split_feature_panel',
      format: 'post',
    })!;
    const block = buildDesignSpecLayoutLockBlock(layout);
    expect(block).toContain('LAYOUT DOCUMENT');
    expect(block).toContain('photoSlot:');
    expect(block).toContain('headlineSlot:');
    expect(block).toContain('logoSlot:');
    expect(block).toContain('NUMERIC AUTHORITY');
    expect(block).toMatch(/1080×1350/);
  });
});
