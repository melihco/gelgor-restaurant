import { describe, expect, it } from 'vitest';
import {
  applyConstitutionToPreset,
  applyConstitutionToSampleCopy,
  compileBrandDesignConstitution,
  formatConstitutionHouseRules,
  mapTemplateNeedToType,
  rankSlotsByTemplateNeeds,
} from '@/lib/brand-design-constitution';
import { resolveDesignTemplatePresets } from '@/lib/brand-design-template-presets';
import { selectCatalogSlotsForOnboarding } from '@/lib/catalog-design-template-presets';
import { buildBrandIntelligenceDirectives } from '@/lib/brand-design-template-engine';
import { seedSlotCreativeBrief } from '@/lib/slot-creative-customization';
import type { ProductionSlotDefinition } from '@/lib/production-slot-catalog';

function slot(
  key: string,
  type: string,
  sort = 0,
): ProductionSlotDefinition {
  return {
    slot_key: key,
    sector_id: key.startsWith('local_') ? 'local_products_shop' : 'beach_club',
    label_tr: key,
    label_en: key,
    format: 'post',
    design_template_type: type,
    pipeline: 'fal_designed_post',
    slot_role: 'fal_designed_post',
    library_slot_key: null,
    tier: 'standard',
    match_signals: {},
    prompt_pack: {},
    enabled_by_default: true,
    sort_order: sort,
    status: 'active',
  };
}

describe('mapTemplateNeedToType', () => {
  it('maps analyze_brand slugs for hospitality and shop', () => {
    expect(mapTemplateNeedToType('event_announcement_story')).toBe('event_special');
    expect(mapTemplateNeedToType('offer_campaign_post')).toBe('campaign_announcement');
    expect(mapTemplateNeedToType('generic_story')).toBe('daily_story');
    expect(mapTemplateNeedToType('product_highlight')).toBe('menu_highlight');
    expect(mapTemplateNeedToType('menu_highlight')).toBe('menu_highlight');
  });
});

describe('compileBrandDesignConstitution', () => {
  it('locks onboarding font and house rules for beach_club', () => {
    const c = compileBrandDesignConstitution({
      brandName: 'Coastal Club',
      sector: 'beach_club',
      location: 'Bodrum',
      brandTheme: {
        typography: {
          heading_font: 'Syne',
          body_font: 'Sora',
          font_source: 'onboarding',
        },
        palette: { primary: '#0b3d4a', accent: '#e8b86d' },
      },
      visualDna: 'sun-washed Aegean photography, no neon flyer energy',
      visualDnaTone: 'sun-washed coastal editorial',
      brandTone: 'warm, quiet luxury',
      vibeProfile: { anti_patterns: ['neon flyer', 'EDM sticker grid'] },
      serviceProfile: { signature_offerings: ['gün batımı daybed', 'rosé'] },
      discoveryOutputs: {
        template_needs: ['event_announcement_story', 'offer_campaign_post'],
        asset_recommendations: ['event_image', 'artist_photo'],
      },
      defaultCtas: ['Rezervasyon'],
    });

    expect(c.fontSource).toBe('onboarding');
    expect(c.headingFont).toBe('Syne');
    expect(c.neededTemplateTypes).toEqual(['event_special', 'campaign_announcement']);
    expect(c.signatureOfferings).toContain('gün batımı daybed');
    expect(c.antiPatterns.join(' ')).toMatch(/neon/i);
    expect(c.layoutPackId).toMatch(/coastal|quiet|nightlife/);

    const house = formatConstitutionHouseRules(c).join(' ');
    expect(house).toContain('TYPE LOCK');
    expect(house).toContain('Syne');
    expect(house).toContain('source=onboarding');
    expect(house).toContain('SIGNATURE FAMILY');
    expect(c.signatureArchetypes).toHaveLength(3);
    expect(house).not.toMatch(/sun-washed Aegean photography, no neon flyer energy.{40}/);
  });

  it('uses shop offerings and artisan pack for local_products_shop', () => {
    const c = compileBrandDesignConstitution({
      brandName: 'Datça Atölye',
      sector: 'local_products_shop',
      brandTheme: {
        typography: {
          heading_font: 'Fraunces',
          body_font: 'Sora',
          font_source: 'onboarding',
        },
        palette: { primary: '#5c3317', accent: '#c9a96e' },
      },
      visualDna: 'artisan jars, terracotta, handwritten labels, rustic wood',
      brandTone: 'samimi, zanaat',
      serviceProfile: { signature_offerings: ['Badem ezmesi', 'Ham bal'] },
      discoveryOutputs: {
        template_needs: ['product_highlight', 'generic_story'],
        asset_recommendations: ['product_image'],
      },
    });

    expect(c.headingFont).toBe('Fraunces');
    expect(c.neededTemplateTypes).toEqual(['menu_highlight', 'daily_story']);
    expect(c.signatureOfferings[0]).toBe('Badem ezmesi');
    expect(c.layoutPackId).toMatch(/artisan|product|balanced/);
  });

  it('does not invent offerings when service profile is empty', () => {
    const c = compileBrandDesignConstitution({
      brandName: 'Empty Shop',
      sector: 'local_products_shop',
    });
    expect(c.signatureOfferings).toEqual([]);
    expect(c.neededTemplateTypes).toEqual([]);
    expect(c.fontSource).toBe('sector');
  });
});

describe('rankSlotsByTemplateNeeds', () => {
  it('pulls beach event + campaign ahead of catalog order', () => {
    const slots = [
      slot('beach_club_venue_ambiance_post', 'venue_showcase', 1),
      slot('beach_club_daily_story', 'daily_story', 2),
      slot('beach_club_dj_night_teaser_post', 'event_special', 9),
      slot('beach_club_daybed_offer_post', 'campaign_announcement', 10),
    ];
    const ranked = rankSlotsByTemplateNeeds(
      slots,
      ['event_announcement_story', 'offer_campaign_post'],
      3,
    );
    expect(ranked[0]?.design_template_type).toBe('event_special');
    expect(ranked[1]?.design_template_type).toBe('campaign_announcement');
    expect(ranked).toHaveLength(3);
  });

  it('pulls shop product highlight first', () => {
    const slots = [
      slot('local_products_shop_hours_post', 'announcement_formal', 1),
      slot('local_products_shop_harvest_post', 'menu_highlight', 8),
      slot('local_products_shop_daily_story', 'daily_story', 2),
    ];
    const ranked = rankSlotsByTemplateNeeds(slots, ['product_highlight'], 2);
    expect(ranked[0]?.slot_key).toBe('local_products_shop_harvest_post');
    expect(ranked).toHaveLength(2);
  });

  it('keeps one-per-type diversity when needs are empty', () => {
    const types = [
      'campaign_announcement',
      'daily_story',
      'menu_highlight',
      'venue_showcase',
    ];
    const slots = types.flatMap((type, i) => [
      slot(`${type}_a`, type, i * 2),
      slot(`${type}_b`, type, i * 2 + 1),
    ]);
    const selected = selectCatalogSlotsForOnboarding(slots, 4);
    expect(new Set(selected.map((s) => s.design_template_type)).size).toBe(4);
  });
});

describe('applyConstitutionToSampleCopy', () => {
  it('uses shop offering on menu_highlight, not generic Öne Çıkan', () => {
    const c = compileBrandDesignConstitution({
      brandName: 'Datça Atölye',
      sector: 'local_products_shop',
      serviceProfile: { signature_offerings: ['Badem ezmesi', 'Ham bal'] },
    });
    const copy = applyConstitutionToSampleCopy({
      headline: 'Öne Çıkan',
      subtitle: 'Taze',
      templateType: 'menu_highlight',
      catalogSlotKey: 'local_products_shop_harvest_post',
      constitution: c,
    });
    expect(copy.headline).toBe('Badem ezmesi');
    expect(copy.subtitle).toBe('Ham bal');
  });

  it('does not overwrite beach social_proof punchline with offerings', () => {
    const c = compileBrandDesignConstitution({
      brandName: 'Coastal Club',
      sector: 'beach_club',
      serviceProfile: { signature_offerings: ['gün batımı daybed'] },
    });
    const copy = applyConstitutionToSampleCopy({
      headline: 'Harika',
      subtitle: 'Misafir',
      templateType: 'social_proof',
      catalogSlotKey: 'beach_club_guest_social_proof_post',
      constitution: c,
    });
    expect(copy.headline).toBe('Harika');
    expect(copy.subtitle).toBe('Misafir');
  });
});

describe('applyConstitutionToPreset + house directives', () => {
  it('stamps product photo preference from discovery assets', () => {
    const c = compileBrandDesignConstitution({
      brandName: 'Datça Atölye',
      sector: 'local_products_shop',
      serviceProfile: { signature_offerings: ['Badem ezmesi'] },
      discoveryOutputs: { asset_recommendations: ['product_image'] },
    });
    const preset = resolveDesignTemplatePresets('local_products_shop')
      .find((p) => p.templateType === 'menu_highlight')!;
    const applied = applyConstitutionToPreset(preset, c);
    expect(applied.preferredAssetTypes[0]).toBe('product_image');
    expect(applied.sampleHeadline).toBe('Badem ezmesi');
    expect(applied.matchKeywords).toMatch(/Badem ezmesi/i);
  });

  it('engine house path drops long DNA dump for both sectors', () => {
    const beach = compileBrandDesignConstitution({
      brandName: 'Coastal Club',
      sector: 'beach_club',
      brandTheme: {
        typography: { heading_font: 'Syne', font_source: 'onboarding' },
        palette: { primary: '#0b3d4a', accent: '#e8b86d' },
      },
      visualDna: 'A'.repeat(400),
    });
    const shop = compileBrandDesignConstitution({
      brandName: 'Datça Atölye',
      sector: 'local_products_shop',
      brandTheme: {
        typography: { heading_font: 'Fraunces', font_source: 'onboarding' },
        palette: { primary: '#5c3317', accent: '#c9a96e' },
      },
      visualDna: 'B'.repeat(400),
    });

    const beachDir = buildBrandIntelligenceDirectives({
      workspaceId: 'w1',
      sector: 'beach_club',
      brandName: 'Coastal Club',
      brandColors: { primary: '#0b3d4a', accent: '#e8b86d' },
      constitution: beach,
      galleryPhotoUrls: [],
      galleryAnalysis: {},
    }, 'story', 'designed').join(' ');
    const shopDir = buildBrandIntelligenceDirectives({
      workspaceId: 'w2',
      sector: 'local_products_shop',
      brandName: 'Datça Atölye',
      brandColors: { primary: '#5c3317', accent: '#c9a96e' },
      constitution: shop,
      galleryPhotoUrls: [],
      galleryAnalysis: {},
    }, 'post', 'designed').join(' ');

    expect(beachDir).toContain('HOUSE STYLE');
    expect(beachDir).toContain('Syne');
    expect(beachDir).not.toContain('VISUAL DNA — PRIMARY DESIGN SOURCE');
    expect(beachDir).not.toContain('A'.repeat(80));
    expect(shopDir).toContain('Fraunces');
    expect(shopDir).not.toEqual(beachDir);
  });
});

describe('seedSlotCreativeBrief + constitution', () => {
  it('puts shop offering on product must_show and house anti-patterns on avoid', () => {
    const dish = seedSlotCreativeBrief({
      brandName: 'Datça Atölye',
      location: 'Datça',
      slotName: 'Hasat',
      slotKey: 'local_products_shop_harvest_post',
      templateType: 'menu_highlight',
      format: 'post',
      signatureOfferings: ['Badem ezmesi'],
      antiPatterns: ['stock food collage', 'neon flyer'],
    });
    expect(dish.must_show?.join(' ')).toMatch(/Badem ezmesi/i);
    expect(dish.must_avoid?.join(' ')).toMatch(/neon flyer|stock food/i);
  });

  it('does not force shop SKU onto beach event brief', () => {
    const event = seedSlotCreativeBrief({
      brandName: 'Coastal Club',
      slotName: 'DJ gece teaser',
      slotKey: 'beach_club_dj_night_teaser_post',
      templateType: 'event_special',
      format: 'post',
      falUseCase: 'event_announcement',
      signatureOfferings: ['Badem ezmesi'],
      antiPatterns: ['neon flyer'],
    });
    expect(event.must_show?.join(' ') ?? '').not.toMatch(/Badem ezmesi/i);
    expect(event.must_avoid?.join(' ')).toMatch(/neon flyer/i);
  });

  it('same product slot, two houses — intent voice diverges', () => {
    const shop = seedSlotCreativeBrief({
      brandName: 'Datça Atölye',
      slotName: 'Hasat',
      slotKey: 'local_products_shop_harvest_post',
      templateType: 'menu_highlight',
      format: 'post',
      headingFont: 'Fraunces',
      typeEnergy: 'artisan terracotta',
      composeMode: 'photo_first',
      signatureOfferings: ['Badem ezmesi'],
    });
    const beach = seedSlotCreativeBrief({
      brandName: 'Coastal Club',
      slotName: 'İmza kokteyl',
      slotKey: 'beach_club_signature_cocktail_post',
      templateType: 'menu_highlight',
      format: 'post',
      headingFont: 'Syne',
      typeEnergy: 'sun-washed coastal editorial',
      composeMode: 'craft_window',
    });
    expect(shop.creative_intent_tr).toMatch(/ürün|imza|teklif/i);
    expect(beach.creative_intent_tr).toMatch(/ürün|imza|teklif/i);
    expect(shop.creative_intent_tr).toMatch(/artisan|Fraunces|terracotta/i);
    expect(beach.creative_intent_tr).toMatch(/coastal|Syne|sun-washed/i);
    expect(shop.creative_intent_tr).not.toEqual(beach.creative_intent_tr);
  });
});
