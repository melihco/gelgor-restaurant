import { describe, expect, it } from 'vitest';
import {
  formatSlotCreativeBriefPromptBlock,
  parseSlotCreativeCustomization,
  resolveSlotCreativeForLibraryGen,
  seedSlotCreativeBrief,
  shouldKeepExistingSlotCreative,
} from '@/lib/slot-creative-customization';
import { buildBrandSlotDesignRecipe } from '@/lib/brand-design-template-engine';

describe('seedSlotCreativeBrief', () => {
  it('diverges sunset story vs DJ night post for beach_club (Yula-like)', () => {
    const sunset = seedSlotCreativeBrief({
      brandName: 'Yula Bodrum',
      location: 'Bodrum',
      visualDna: 'Aegean coastal warmth, turquoise accents',
      brandTone: 'warm, boutique',
      slotName: 'Gün batımı story',
      slotKey: 'beach_club_sunset_golden_story',
      templateType: 'atmosphere',
      format: 'story',
    });
    const dj = seedSlotCreativeBrief({
      brandName: 'Yula Bodrum',
      location: 'Bodrum',
      visualDna: 'Aegean coastal warmth, turquoise accents',
      brandTone: 'warm, boutique',
      slotName: 'DJ gece teaser',
      slotKey: 'beach_club_dj_night_teaser_post',
      templateType: 'event_special',
      format: 'post',
      falUseCase: 'event_announcement',
    });

    expect(sunset.creative_intent_tr).toMatch(/gün batımı|golden hour/i);
    expect(sunset.daypart).toBe('golden_hour');
    expect(sunset.must_avoid?.join(' ')).toMatch(/gece|neon|event/i);

    expect(dj.creative_intent_tr).toMatch(/gece|etkinlik/i);
    expect(dj.daypart).toBe('night');
    expect(dj.must_avoid?.join(' ')).toMatch(/sunset|menü/i);

    expect(sunset.creative_intent_tr).not.toEqual(dj.creative_intent_tr);
    expect(sunset.must_show?.[0]).not.toEqual(dj.must_show?.[0]);
  });

  it('seeds restaurant signature dish distinct from event for local_products/restaurant', () => {
    const dish = seedSlotCreativeBrief({
      brandName: 'Gel Gör',
      location: 'İzmir',
      slotName: 'İmza tabak',
      slotKey: 'restaurant_cafe_signature_dish_post',
      templateType: 'menu_highlight',
      format: 'post',
    });
    const event = seedSlotCreativeBrief({
      brandName: 'Gel Gör',
      location: 'İzmir',
      slotName: 'Etkinlik duyuru',
      slotKey: 'restaurant_cafe_event_announcement_story',
      templateType: 'event_special',
      format: 'story',
      falUseCase: 'event_announcement',
    });

    expect(dish.creative_intent_tr).toMatch(/ürün|imza|teklif/i);
    expect(event.creative_intent_tr).toMatch(/etkinlik|gece/i);
    expect(dish.must_avoid?.join(' ')).not.toEqual(event.must_avoid?.join(' '));
  });
});

describe('resolveSlotCreativeForLibraryGen', () => {
  it('keeps operator briefs', () => {
    const { brief, seeded } = resolveSlotCreativeForLibraryGen({
      existing: {
        creative_intent_tr: 'Operatör: özel Cuba Night afişi',
        seed_source: 'operator',
        must_show: ['CUBA hook'],
      },
      seed: {
        brandName: 'Yula Bodrum',
        slotName: 'DJ',
        slotKey: 'beach_club_dj_night_teaser_post',
        templateType: 'event_special',
        format: 'post',
      },
    });
    expect(seeded).toBe(false);
    expect(brief.creative_intent_tr).toContain('Cuba Night');
    expect(shouldKeepExistingSlotCreative(brief)).toBe(true);
  });

  it('keeps auto briefs unless forceReseed', () => {
    const kept = resolveSlotCreativeForLibraryGen({
      existing: {
        creative_intent_tr: 'Datça bahçe kahvaltı shell',
        seed_source: 'auto_template_gen',
      },
      seed: {
        brandName: 'Yula Bodrum',
        slotName: 'Gün batımı story',
        slotKey: 'beach_club_sunset_golden_story',
        templateType: 'atmosphere',
        format: 'story',
      },
    });
    expect(kept.seeded).toBe(false);
    expect(kept.brief.creative_intent_tr).toContain('Datça');

    const forced = resolveSlotCreativeForLibraryGen({
      existing: {
        creative_intent_tr: 'Eski auto',
        seed_source: 'auto_template_gen',
      },
      forceReseed: true,
      seed: {
        brandName: 'Yula Bodrum',
        slotName: 'Gün batımı story',
        slotKey: 'beach_club_sunset_golden_story',
        templateType: 'atmosphere',
        format: 'story',
      },
    });
    expect(forced.seeded).toBe(true);
    expect(forced.brief.creative_intent_tr).toMatch(/gün batımı|golden hour/i);
  });
});

describe('buildBrandSlotDesignRecipe + creative brief', () => {
  it('injects structured brief into recipe for two Yula slots', () => {
    const sunsetBrief = seedSlotCreativeBrief({
      brandName: 'Yula Bodrum',
      location: 'Bodrum',
      slotName: 'Gün batımı story',
      slotKey: 'beach_club_sunset_golden_story',
      templateType: 'atmosphere',
      format: 'story',
    });
    const recipe = buildBrandSlotDesignRecipe({
      brandName: 'Yula Bodrum',
      sector: 'beach_club',
      location: 'Bodrum',
      primary: '#00C5CC',
      accent: '#f5a25d',
      slotKey: 'beach_club_sunset_golden_story',
      slotName: 'Gün batımı story',
      channel: 'story',
      level: 'designed',
      layoutFamily: null,
      creativeBrief: sunsetBrief,
    });
    expect(recipe).toContain('SLOT CREATIVE BRIEF');
    expect(recipe).toContain(sunsetBrief.creative_intent_tr);
    expect(formatSlotCreativeBriefPromptBlock(sunsetBrief)).toContain('Must show');
  });
});

describe('parseSlotCreativeCustomization', () => {
  it('rejects empty intent', () => {
    expect(parseSlotCreativeCustomization({ must_show: ['x'] })).toBeNull();
  });
});

describe('buildEmptySlotCreativeUpserts', () => {
  it('seeds empty beach_club + local_products_shop assignments only', async () => {
    const { buildEmptySlotCreativeUpserts } = await import('@/lib/slot-creative-library-persist');
    const upserts = buildEmptySlotCreativeUpserts(
      [
        {
          id: '1',
          workspace_id: 'w',
          slot_key: 'beach_club_dj_night_teaser_post',
          enabled: true,
          priority: 10,
          assignment_source: 'auto_default',
          notes: null,
          customization: {},
          slot: {
            slot_key: 'beach_club_dj_night_teaser_post',
            label_tr: 'DJ gece teaser',
            label_en: 'DJ night teaser',
            format: 'post',
            design_template_type: 'event_special',
            prompt_pack: {},
          } as never,
        },
        {
          id: '2',
          workspace_id: 'w',
          slot_key: 'local_products_shop_harvest_post',
          enabled: true,
          priority: 20,
          assignment_source: 'auto_default',
          notes: null,
          customization: {
            version: 1,
            creative_intent_tr: 'Operator harvest brief',
            seed_source: 'operator',
          },
          slot: {
            slot_key: 'local_products_shop_harvest_post',
            label_tr: 'Hasat',
            label_en: 'Harvest',
            format: 'post',
            design_template_type: 'menu_highlight',
            prompt_pack: {},
          } as never,
        },
        {
          id: '3',
          workspace_id: 'w',
          slot_key: 'beach_club_sunset_golden_story',
          enabled: false,
          priority: 30,
          assignment_source: 'auto_default',
          notes: null,
          customization: {},
          slot: null,
        },
      ],
      { brandName: 'Test Brand', location: 'Bodrum' },
    );
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.slot_key).toBe('beach_club_dj_night_teaser_post');
    expect(upserts[0]?.customization.creative_intent_tr).toMatch(/gece|etkinlik|DJ/i);
  });
});
