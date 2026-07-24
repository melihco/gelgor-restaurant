import { describe, expect, it } from 'vitest';
import {
  summarizeCatalogTemplateHardPinCoverage,
  summarizeTemplateRowsHardPinHealth,
  TEMPLATE_HARD_PIN_COVERAGE_MIN_RATIO,
} from '@/lib/catalog-template-coverage';
import type { BrandActiveSlot, BrandActiveSlotSet } from '@/lib/brand-active-slot-resolver';

function slot(partial: Partial<BrandActiveSlot> & Pick<BrandActiveSlot, 'slotKey' | 'format' | 'hasTemplate'>): BrandActiveSlot {
  return {
    labelTr: partial.slotKey,
    labelEn: partial.slotKey,
    designTemplateType: 'campaign_announcement',
    librarySlotKey: 'campaign_post',
    slotRole: 'fal_designed_post',
    pipeline: 'fal',
    priority: 1,
    enabled: true,
    templateId: partial.hasTemplate ? 'tpl-1' : null,
    promptPack: {},
    matchSignals: {},
    ...partial,
  };
}

function set(sectorId: string, slots: BrandActiveSlot[]): BrandActiveSlotSet {
  return {
    sectorId,
    workspaceId: 'ws-test',
    slots,
    enabledSlotKeys: new Set(slots.filter((s) => s.enabled).map((s) => s.slotKey)),
    unassignedCatalogKeys: [],
  };
}

describe('summarizeCatalogTemplateHardPinCoverage', () => {
  it('beach_club: reports missing keys below min ratio', () => {
    const coverage = summarizeCatalogTemplateHardPinCoverage(
      set('beach_club', [
        slot({ slotKey: 'beach_club_sunset_golden_story', format: 'story', hasTemplate: true }),
        slot({ slotKey: 'beach_club_atmosphere_reel', format: 'reel', hasTemplate: false }),
        slot({ slotKey: 'beach_club_event_night_post', format: 'post', hasTemplate: false }),
        slot({ slotKey: 'beach_club_menu_highlight_post', format: 'post', hasTemplate: true }),
      ]),
    );
    expect(coverage.total).toBe(4);
    expect(coverage.covered).toBe(2);
    expect(coverage.ratio).toBe(0.5);
    expect(coverage.sufficient).toBe(true);
    expect(coverage.missingKeys).toEqual([
      'beach_club_atmosphere_reel',
      'beach_club_event_night_post',
    ]);
  });

  it('local_products_shop: insufficient when most slots unbound', () => {
    const coverage = summarizeCatalogTemplateHardPinCoverage(
      set('local_products_shop', [
        slot({ slotKey: 'local_products_shop_harvest_day_post', format: 'post', hasTemplate: true }),
        slot({ slotKey: 'local_products_shop_shelf_story', format: 'story', hasTemplate: false }),
        slot({ slotKey: 'local_products_shop_maker_reel', format: 'reel', hasTemplate: false }),
        slot({ slotKey: 'local_products_shop_offer_post', format: 'post', hasTemplate: false }),
      ]),
    );
    expect(coverage.covered).toBe(1);
    expect(coverage.ratio).toBe(0.25);
    expect(coverage.sufficient).toBe(false);
    expect(coverage.ratio).toBeLessThan(TEMPLATE_HARD_PIN_COVERAGE_MIN_RATIO);
  });

  it('ignores disabled and non-produce formats', () => {
    const coverage = summarizeCatalogTemplateHardPinCoverage(
      set('beach_club', [
        slot({ slotKey: 'a', format: 'post', hasTemplate: true }),
        slot({ slotKey: 'b', format: 'story', hasTemplate: true, enabled: false }),
        slot({ slotKey: 'c', format: 'carousel', hasTemplate: false }),
      ]),
    );
    expect(coverage.total).toBe(1);
    expect(coverage.sufficient).toBe(true);
  });
});

describe('summarizeTemplateRowsHardPinHealth', () => {
  it('beach_club keyed rows: sufficient when half+ keys have produce format', () => {
    const health = summarizeTemplateRowsHardPinHealth([
      { status: 'active', catalog_slot_key: 'beach_club_sunset_golden_story', format: 'story' },
      { status: 'active', catalog_slot_key: 'beach_club_atmosphere_reel', format: 'reel' },
      { status: 'active', catalog_slot_key: 'beach_club_event_night_post', format: 'post' },
      { status: 'archived', catalog_slot_key: 'old', format: 'post' },
    ]);
    expect(health.activeCount).toBe(3);
    expect(health.keyedCount).toBe(3);
    expect(health.hardPinReadyKeys).toBe(3);
    expect(health.sufficient).toBe(true);
  });

  it('local_products_shop: fails when too few active templates', () => {
    const health = summarizeTemplateRowsHardPinHealth([
      { status: 'active', catalog_slot_key: 'local_products_shop_harvest_day_post', format: 'post' },
      { status: 'active', catalog_slot_key: 'local_products_shop_shelf_story', format: 'story' },
    ]);
    expect(health.activeCount).toBe(2);
    expect(health.sufficient).toBe(false);
  });
});
