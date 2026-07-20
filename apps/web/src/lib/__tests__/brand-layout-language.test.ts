import { describe, expect, it } from 'vitest';
import {
  clampIntensityToLayoutLanguage,
  resolveBrandLayoutLanguage,
  resolveCraftAllowlistForPack,
  resolveTemplateLibraryEffectiveIntensity,
  shouldApplyCraftLayoutFamily,
} from '@/lib/brand-layout-language';
import {
  CALENDAR_ANNOUNCEMENT_INTENSITY,
  resolveDesignCraftLayoutFamily,
} from '@/lib/fal-design-intensity';
import { DESIGN_TEMPLATE_TO_CALENDAR_ANNOUNCEMENT } from '@/lib/brand-design-template-presets';
import { instanceToSlotDefinition, getSectorSlotPack } from '@/lib/sector-slot-pack';

describe('resolveBrandLayoutLanguage', () => {
  it('keeps vibrant beach_club (Yula-like) on coastal craft-window — soft bias, not caption-only', () => {
    const pack = resolveBrandLayoutLanguage({
      sector: 'beach_club',
      visualDna:
        'Mood: sunlit coastal joy — citrus-bright, social, unhurried Drink & Chill. Aesthetic: Aegean beach-club daybed life — turquoise water',
      brandTone: 'inviting, vibrant, fresh, relaxed',
      // Nested typography noise must NOT force quiet luxury
      vibeProfile: {
        motion: { pace: 'serene beach visuals' },
        typography: { heading_personality: 'condensed editorial uppercase serif' },
      },
    });
    expect(pack.id).toBe('coastal_editorial');
    expect(pack.composeMode).toBe('craft_window');
    expect(pack.preferPhotoLedCraft).toBe(true);
    expect(pack.craftAllowlist.length).toBeGreaterThan(1);
    expect(pack.craftAllowlist).toContain('asymmetric_corner_plate');
    // Soft coastal packs: no hard LAYOUT LOCK — brand+slot recipe leads.
    expect(shouldApplyCraftLayoutFamily('designed', pack)).toBe(false);
    expect(shouldApplyCraftLayoutFamily('bold_editorial', pack)).toBe(false);
    // Library must not inherit Hub bold_editorial paint language.
    expect(resolveTemplateLibraryEffectiveIntensity({
      productionIntensity: 'designed',
      language: pack,
    })).toBe('designed');
    expect(resolveTemplateLibraryEffectiveIntensity({
      productionIntensity: 'bold_editorial',
      language: pack,
    })).toBe('designed');
    expect(clampIntensityToLayoutLanguage('bold_editorial', pack)).toBe('bold_editorial');
  });

  it('maps true quiet-luxury coastal soul to type-led coastal', () => {
    const pack = resolveBrandLayoutLanguage({
      sector: 'beach_club',
      visualDna: 'sun-washed photography, quiet luxury, understated Aman restraint, no neon',
      brandTone: 'editorial, warm, understated',
    });
    expect(pack.id).toBe('coastal_editorial');
    expect(pack.composeMode).toBe('type_on_photo');
    expect(pack.craftAllowlist).toEqual(['type_with_brand_rules']);
  });

  it('keeps local_products_shop on product_catalog — soft craft, no heavy rail/L (Karaman)', () => {
    const pack = resolveBrandLayoutLanguage({
      sector: 'local_products_shop',
      visualDna: 'artisan jars, warm wood, natural packaging',
      brandTone: 'samimi, organik',
    });
    expect(pack.id).toBe('product_catalog');
    expect(pack.craftAllowlist).toEqual(['type_with_brand_rules', 'inset_photo_frame']);
    expect(pack.craftAllowlist).not.toContain('side_rail_frame');
    expect(shouldApplyCraftLayoutFamily('designed', pack)).toBe(false);
  });

  it('allows hard craft lock only for nightlife DNA without quiet signals', () => {
    const pack = resolveBrandLayoutLanguage({
      sector: 'nightclub_lounge',
      visualDna: 'neon nightlife, after-dark electric energy, DJ booth',
      brandTone: 'bold, high energy',
    });
    expect(pack.id).toBe('nightlife_bold');
    expect(pack.craftAllowlist).toContain('side_rail_frame');
    expect(pack.preferPhotoLedCraft).toBe(false);
    expect(shouldApplyCraftLayoutFamily('designed', pack)).toBe(true);
    expect(resolveTemplateLibraryEffectiveIntensity({
      productionIntensity: 'bold_editorial',
      language: pack,
    })).toBe('bold_editorial');
  });
});

describe('Kokteyl Promo story routing (beach_club pack)', () => {
  it('resolves campaign_announcement → offer_campaign → designed under coastal soft cap', () => {
    const pack = getSectorSlotPack('beach_club');
    expect(pack).toBeTruthy();
    const instance = pack!.instances.find((i) => i.suffix === 'cocktail_promo_story');
    expect(instance).toBeTruthy();
    const def = instanceToSlotDefinition(pack!, instance!, 10);
    expect(def.slot_key).toBe('beach_club_cocktail_promo_story');
    expect(def.design_template_type).toBe('campaign_announcement');

    const announcement = DESIGN_TEMPLATE_TO_CALENDAR_ANNOUNCEMENT.campaign_announcement;
    expect(announcement).toBe('offer_campaign');
    expect(CALENDAR_ANNOUNCEMENT_INTENSITY.offer_campaign).toBe('designed');

    const language = resolveBrandLayoutLanguage({
      sector: 'beach_club',
      visualDna: 'Aegean coastal vibrant citrus Drink & Chill',
      brandTone: 'vibrant, fresh, social',
    });
    expect(language.id).toBe('coastal_editorial');
    expect(resolveTemplateLibraryEffectiveIntensity({
      productionIntensity: CALENDAR_ANNOUNCEMENT_INTENSITY.offer_campaign,
      language,
    })).toBe('designed');
  });
});

describe('craft allowlist + family resolver', () => {
  it('never picks heavy families outside product allowlist', () => {
    const pack = resolveBrandLayoutLanguage({
      sector: 'local_products_shop',
      visualDna: 'product packaging catalog',
    });
    const allow = resolveCraftAllowlistForPack(pack);
    for (let i = 0; i < 12; i += 1) {
      const family = resolveDesignCraftLayoutFamily(`slot-${i}-product`, allow);
      expect(allow).toContain(family);
    }
  });
});
