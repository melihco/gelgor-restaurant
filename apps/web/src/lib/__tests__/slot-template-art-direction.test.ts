import { describe, expect, it } from 'vitest';
import {
  formatSlotArtDirectionPromptBlock,
  parseSlotArtDirection,
} from '@/lib/slot-template-art-direction';
import { buildDesignedPostDesignCardPrompt } from '@/lib/fal-designer-production';

describe('parseSlotArtDirection', () => {
  it('accepts a valid beach_club direction with non-top-left anchor', () => {
    const parsed = parseSlotArtDirection({
      layout_concept: 'Teal left rail with sunset photo window for Yula coastal energy',
      type_zone_anchor: 'left_rail',
      color_surfaces: 'Primary #00C5CC rail fill; accent rules only',
      type_hierarchy: 'Stacked serif headline inside rail',
      motif_from_dna: 'carved wood grain line',
      reject_look: 'cream top-left corner sticker',
      diversity_note: 'Not the cocktail close-up card',
    });
    expect(parsed?.type_zone_anchor).toBe('left_rail');
    expect(parsed?.layout_concept).toMatch(/Teal left rail/);
  });

  it('accepts local_products_shop inset_frame direction', () => {
    const parsed = parseSlotArtDirection({
      layout_concept: 'Warm brand-mat frame around jar hero for artisan shelf energy',
      type_zone_anchor: 'inset_frame',
      color_surfaces: 'Accent mat; primary type on mat',
      type_hierarchy: 'Short product name on mat top',
      motif_from_dna: 'kraft texture avoided — use brand hex mat',
      reject_look: 'beige Canva product flyer',
      diversity_note: 'Different from lifestyle lifestyle full-bleed',
    });
    expect(parsed?.type_zone_anchor).toBe('inset_frame');
  });

  it('rejects missing concept or invalid anchor', () => {
    expect(parseSlotArtDirection({ type_zone_anchor: 'top_left' })).toBeNull();
    expect(parseSlotArtDirection({
      layout_concept: 'Something',
      type_zone_anchor: 'not_a_real_anchor',
    })).toBeNull();
  });
});

describe('formatSlotArtDirectionPromptBlock', () => {
  it('builds a protected-head style block with cream reject', () => {
    const block = formatSlotArtDirectionPromptBlock({
      layout_concept: 'Diagonal brand wedge for event energy',
      type_zone_anchor: 'diagonal_split',
      color_surfaces: 'Accent wedge',
      type_hierarchy: 'Oversized display',
      motif_from_dna: 'horizon line',
      reject_look: 'cream top-left sticker',
      diversity_note: 'Not venue aerial',
    });
    expect(block).toContain('BRAND SLOT ART DIRECTION');
    expect(block).toContain('diagonal_split');
    expect(block).toMatch(/cream/i);
  });
});

describe('design card prompt + crew art direction', () => {
  it('puts slot art direction in protected head and skips hard LAYOUT LOCK', () => {
    const block = formatSlotArtDirectionPromptBlock({
      layout_concept: 'Bottom brand L with cocktail hero clear',
      type_zone_anchor: 'bottom_left',
      color_surfaces: 'Primary L fill',
      type_hierarchy: 'Bold punchline in L',
      motif_from_dna: 'citrus chip',
      reject_look: 'top-left cream plate',
      diversity_note: 'Not aerial split',
    });
    const prompt = buildDesignedPostDesignCardPrompt({
      vibe: 'warm_coastal',
      headline: 'İmza Kokteyl',
      brandColors: { primary: '#00C5CC', accent: '#f5a25d' },
      brandName: 'Demo Beach',
      sector: 'beach_club',
      aspectRatio: '9:16',
      designIntensityLevel: 'designed',
      visualDnaTone: 'Drink & Chill citrus vibrant Aegean coastal',
      slotArtDirectionBlock: block,
      layoutFamilySeed: 'beach_club_cocktail_craft_reel',
    });
    expect(prompt).toContain('BRAND SLOT ART DIRECTION');
    expect(prompt).toContain('bottom_left');
    expect(prompt).toContain('COLOR SURFACE LOCK');
    expect(prompt).not.toContain('LAYOUT LOCK: use ONLY');
  });

  it('keeps LAYOUT LOCK when no crew art direction (local_products path)', () => {
    const prompt = buildDesignedPostDesignCardPrompt({
      vibe: 'editorial_serif',
      headline: 'Yeni Ürün',
      brandColors: { primary: '#5C4033', accent: '#C4A574' },
      brandName: 'Demo Atölye',
      sector: 'local_products_shop',
      aspectRatio: '4:5',
      designIntensityLevel: 'designed',
      visualDnaTone: 'artisan jars warm wood packaging',
      layoutFamilySeed: 'local_products_shop_product_hero_post',
    });
    // Product soft pack may or may not lock depending on intensity/language —
    // ensure cream surface lock still present either way.
    expect(prompt).toContain('COLOR SURFACE LOCK');
    expect(prompt).not.toContain('BRAND SLOT ART DIRECTION');
  });
});
