/**
 * Cross-sector regression: sector-id tokens must never drive intent family.
 * Covers all packs (beach_club, local_products_shop, wedding_event, ecommerce, …).
 */
import { describe, expect, it } from 'vitest';
import {
  catalogIntentFamiliesConflict,
  resolveIdeaIntentFamily,
} from '@/lib/brand-active-slot-resolver';
import { intentFamilyFromSignals } from '@/lib/catalog-slot-ai-picker';
import {
  catalogSlotPurposeKey,
  listSectorSlotPackIds,
  synthesizeSectorSlotDefinitions,
} from '@/lib/sector-slot-pack';

function familyForDef(def: {
  slot_key: string;
  design_template_type?: string | null;
  match_signals?: Record<string, unknown> | null;
}): string {
  const signals = def.match_signals ?? {};
  const announcementTypes = Array.isArray(signals.announcement_types)
    ? signals.announcement_types.map(String)
    : [];
  const keywords = Array.isArray(signals.keywords)
    ? signals.keywords.map(String)
    : [];
  return intentFamilyFromSignals({
    slotKey: def.slot_key,
    designTemplateType: String(def.design_template_type ?? ''),
    announcementTypes,
    keywords,
  });
}

describe('catalogSlotPurposeKey (all sectors)', () => {
  it('strips longest sector prefix for polluted ids', () => {
    expect(catalogSlotPurposeKey('local_products_shop_farm_visit_story')).toBe(
      'farm_visit_story',
    );
    expect(catalogSlotPurposeKey('wedding_event_venue_showcase_post')).toBe(
      'venue_showcase_post',
    );
    expect(catalogSlotPurposeKey('beach_club_dj_event_story')).toBe('dj_event_story');
    expect(catalogSlotPurposeKey('ecommerce_retail_gift_guide_post')).toBe(
      'gift_guide_post',
    );
  });
});

describe('sector-prefix pollution never forces product/event (all packs)', () => {
  it('farm_visit / bts / warehouse origin slots are brand_bts, not product_menu', () => {
    const originRe =
      /(farm_visit|producer_visit|orchard|grove|craft_process|warehouse_bts|behind_brand|behind_setup|shoot_day_bts|production_bts|bts_)/;
    for (const sectorId of listSectorSlotPackIds()) {
      const defs = synthesizeSectorSlotDefinitions(sectorId);
      for (const def of defs) {
        const purpose = catalogSlotPurposeKey(def.slot_key);
        if (!originRe.test(purpose)) continue;
        const family = familyForDef(def);
        expect(
          family,
          `${def.slot_key} purpose=${purpose} must not be product_menu`,
        ).not.toBe('product_menu');
        // Strong origin shells should land in brand_bts (or event only if clearly event).
        if (/farm_visit|producer_visit|warehouse_bts|production_bts|craft_process/.test(purpose)) {
          expect(family, `${def.slot_key}`).toBe('brand_bts');
        }
      }
    }
  });

  it('gift / product_hero / new_arrival shells are product_menu across retail packs', () => {
    for (const sectorId of [
      'local_products_shop',
      'ecommerce_retail',
      'fashion_boutique',
      'jewelry_accessories',
      'bakery_patisserie',
    ]) {
      const defs = synthesizeSectorSlotDefinitions(sectorId);
      expect(defs.length).toBeGreaterThan(0);
      for (const def of defs) {
        const purpose = catalogSlotPurposeKey(def.slot_key);
        if (!/(gift|product_hero|new_arrival|product_detail|product_range|unboxing)/.test(purpose)) {
          continue;
        }
        expect(familyForDef(def), `${def.slot_key}`).toBe('product_menu');
      }
    }
  });

  it('wedding_event venue showcase is venue, not event (sector id has "event")', () => {
    const defs = synthesizeSectorSlotDefinitions('wedding_event');
    const venue = defs.find((d) => d.slot_key.endsWith('venue_showcase_post'));
    expect(venue).toBeTruthy();
    expect(venue!.design_template_type).toBe('venue_showcase');
    expect(familyForDef(venue!)).toBe('venue');
  });

  it('beach_club cocktail vs dj remain distinct strong families', () => {
    const defs = synthesizeSectorSlotDefinitions('beach_club');
    const cocktail = defs.find((d) => d.slot_key.endsWith('cocktail_promo_story'));
    const dj = defs.find((d) => d.slot_key.endsWith('dj_event_story'));
    expect(familyForDef(cocktail!)).toBe('product_menu');
    expect(familyForDef(dj!)).toBe('event');
    expect(
      catalogIntentFamiliesConflict(familyForDef(cocktail!), familyForDef(dj!)),
    ).toBe(true);
  });
});

describe('gift-set brief conflicts with farm_visit (multi-tenant)', () => {
  it('local_products_shop + ecommerce_retail', () => {
    const giftIdea = {
      headline: 'Tatlı Hediye Setlerimizle Yazı Tatlandır!',
      caption_draft: 'jam jars and honey gift sets for summer',
      format: 'story',
    };
    const ideaFamily = resolveIdeaIntentFamily(giftIdea);
    expect(ideaFamily).toBe('product_menu');

    for (const sectorId of ['local_products_shop', 'ecommerce_retail']) {
      const defs = synthesizeSectorSlotDefinitions(sectorId);
      const farmOrBts = defs.find((d) =>
        /farm_visit|warehouse_bts|behind_brand/.test(catalogSlotPurposeKey(d.slot_key)),
      );
      if (!farmOrBts) continue;
      const slotFamily = familyForDef(farmOrBts);
      expect(
        catalogIntentFamiliesConflict(ideaFamily, slotFamily),
        `${sectorId}:${farmOrBts.slot_key}`,
      ).toBe(true);
    }
  });
});
