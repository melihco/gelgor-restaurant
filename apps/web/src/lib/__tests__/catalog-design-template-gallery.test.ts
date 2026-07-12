import { describe, it, expect } from 'vitest';
import {
  buildCatalogDesignGalleryRows,
  catalogGalleryFormatMatches,
  collectOrphanDesignTemplates,
  galleryCoverageSummary,
  galleryRowTitle,
  resolveCatalogSlotsForGallery,
} from '@/lib/catalog-design-template-gallery';
import type { BrandDesignTemplateRow } from '@/lib/fal-archetype-gallery';
import type { ProductionSlotDefinition, TenantSlotAssignment } from '@/lib/production-slot-catalog';

function mockSlot(overrides: Partial<ProductionSlotDefinition> & Pick<ProductionSlotDefinition, 'slot_key'>): ProductionSlotDefinition {
  return {
    sector_id: 'beach_club',
    label_tr: overrides.label_tr ?? 'Test',
    label_en: overrides.label_en ?? 'Test',
    format: overrides.format ?? 'post',
    pipeline: 'fal_designed_post',
    slot_role: 'fal_designed_post',
    design_template_type: overrides.design_template_type ?? 'campaign_announcement',
    library_slot_key: null,
    tier: 'standard',
    match_signals: {},
    prompt_pack: {},
    enabled_by_default: overrides.enabled_by_default ?? true,
    sort_order: overrides.sort_order ?? 0,
    status: 'active',
    ...overrides,
  };
}

function mockTemplate(overrides: Partial<BrandDesignTemplateRow> & Pick<BrandDesignTemplateRow, 'id'>): BrandDesignTemplateRow {
  return {
    template_type: 'campaign_announcement',
    template_name: 'Kampanya',
    format: 'post',
    status: 'active',
    ...overrides,
  };
}

describe('buildCatalogDesignGalleryRows', () => {
  it('matches template by catalog_slot_key first', () => {
    const slots = [
      mockSlot({ slot_key: 'beach_club_dj_post', label_tr: 'DJ Gecesi', design_template_type: 'campaign_announcement' }),
      mockSlot({ slot_key: 'beach_club_story', label_tr: 'Gün batımı', format: 'story', design_template_type: 'daily_story', sort_order: 1 }),
    ];
    const templates = [
      mockTemplate({
        id: 't1',
        catalog_slot_key: 'beach_club_dj_post',
        thumbnail_url: 'https://cdn.example/a.png',
      }),
    ];

    const rows = buildCatalogDesignGalleryRows({ slots, templates });
    const first = rows[0]!;
    expect(first.template?.id).toBe('t1');
    expect(first.matchSource).toBe('catalog_key');
    expect(galleryRowTitle(first)).toBe('DJ Gecesi');
  });

  it('falls back to design_template_type when catalog key missing', () => {
    const slots = [
      mockSlot({ slot_key: 'slot_a', design_template_type: 'daily_story', format: 'story' }),
    ];
    const templates = [
      mockTemplate({ id: 't2', template_type: 'daily_story', format: 'story' }),
    ];

    const rows = buildCatalogDesignGalleryRows({ slots, templates });
    const first = rows[0]!;
    expect(first.template?.id).toBe('t2');
    expect(first.matchSource).toBe('template_type');
  });

  it('collects orphan templates not mapped to catalog slots', () => {
    const slots = [mockSlot({ slot_key: 'only_slot' })];
    const templates = [
      mockTemplate({ id: 'mapped', catalog_slot_key: 'only_slot' }),
      mockTemplate({ id: 'orphan', template_type: 'brand_identity' }),
    ];
    const rows = buildCatalogDesignGalleryRows({ slots, templates });
    const orphans = collectOrphanDesignTemplates(templates, rows);
    expect(orphans).toHaveLength(1);
    expect(orphans[0]?.id).toBe('orphan');
  });
});

describe('resolveCatalogSlotsForGallery', () => {
  it('uses enabled tenant assignments sorted by priority', () => {
    const slots = [
      mockSlot({ slot_key: 'a', sort_order: 1, enabled_by_default: true }),
      mockSlot({ slot_key: 'b', sort_order: 2, enabled_by_default: true }),
      mockSlot({ slot_key: 'c', sort_order: 3, enabled_by_default: true }),
    ];
    const assignments: TenantSlotAssignment[] = [
      { id: '1', workspace_id: 'w', slot_key: 'b', enabled: true, priority: 1, assignment_source: 'operator', notes: null, slot: slots[1]! },
      { id: '2', workspace_id: 'w', slot_key: 'a', enabled: true, priority: 2, assignment_source: 'operator', notes: null, slot: slots[0]! },
      { id: '3', workspace_id: 'w', slot_key: 'c', enabled: false, priority: 3, assignment_source: 'operator', notes: null, slot: slots[2]! },
    ];

    const resolved = resolveCatalogSlotsForGallery(slots, assignments);
    expect(resolved.map((s) => s.slot_key)).toEqual(['b', 'a']);
  });

  it('falls back to enabled_by_default sector slots', () => {
    const slots = [
      mockSlot({ slot_key: 'on', enabled_by_default: true }),
      mockSlot({ slot_key: 'off', enabled_by_default: false, sort_order: 1 }),
    ];
    const resolved = resolveCatalogSlotsForGallery(slots);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.slot_key).toBe('on');
  });
});

describe('galleryCoverageSummary', () => {
  it('counts previews vs slots', () => {
    const rows = buildCatalogDesignGalleryRows({
      slots: [
        mockSlot({ slot_key: 'a' }),
        mockSlot({ slot_key: 'b', sort_order: 1 }),
      ],
      templates: [
        mockTemplate({ id: 't1', catalog_slot_key: 'a', thumbnail_url: 'x' }),
        mockTemplate({ id: 't2', catalog_slot_key: 'b' }),
      ],
    });
    expect(galleryCoverageSummary(rows)).toEqual({
      slotCount: 2,
      previewCount: 1,
      missingCount: 1,
    });
  });
});

describe('catalogGalleryFormatMatches', () => {
  it('filters reel slots', () => {
    const row = buildCatalogDesignGalleryRows({
      slots: [mockSlot({ slot_key: 'r', format: 'reel', design_template_type: 'reel_cover' })],
      templates: [],
    })[0]!;
    expect(catalogGalleryFormatMatches(row, 'reel')).toBe(true);
    expect(catalogGalleryFormatMatches(row, 'post')).toBe(false);
  });
});
