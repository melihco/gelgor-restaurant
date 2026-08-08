/**
 * AI catalog slot picker — sector-agnostic intent matching.
 * Multi-tenant: beach_club + local_products_shop (no pilot UUID branches).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrandActiveSlotSet } from '@/lib/brand-active-slot-resolver';
import {
  buildCatalogSlotPickerUserPrompt,
  CATALOG_SLOT_PICKER_SYSTEM,
  candidateFromActiveSlot,
  candidatesFromActiveSlots,
  formatPickerCandidateLine,
  intentFamilyFromSignals,
  normalizePickerFormat,
  parseCatalogSlotAiPick,
  preferAiCatalogSlotsOnIdeas,
} from '@/lib/catalog-slot-ai-picker';
import { synthesizeSectorSlotDefinitions } from '@/lib/sector-slot-pack';

const { createMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class OpenAI {
    chat = {
      completions: {
        create: createMock,
      },
    };
  },
}));

vi.mock('@/lib/server-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server-config')>();
  return {
    ...actual,
    serverConfig: {
      ...actual.serverConfig,
      openai: { ...actual.serverConfig.openai, apiKey: 'test-key' },
      ai: {
        ...actual.serverConfig.ai,
        chatModel: () => 'gpt-4o-mini',
      },
    },
  };
});

vi.mock('@/lib/ai-cost-telemetry', () => ({
  emitAiCostLine: vi.fn(),
  estimateOpenAiUsd: () => 0.001,
}));

function slot(
  partial: Pick<
    BrandActiveSlotSet['slots'][number],
    'slotKey' | 'labelTr' | 'labelEn' | 'format' | 'priority' | 'slotRole' | 'pipeline'
  > & {
    designTemplateType?: string;
    matchSignals?: Record<string, unknown>;
  },
): BrandActiveSlotSet['slots'][number] {
  const { designTemplateType, matchSignals, ...rest } = partial;
  return {
    ...rest,
    designTemplateType: designTemplateType ?? 'event_special',
    librarySlotKey: null,
    enabled: true,
    hasTemplate: true,
    templateId: null,
    promptPack: {},
    matchSignals: matchSignals ?? {},
  };
}

function beachClubStorySlots(): BrandActiveSlotSet {
  const slots = [
    slot({
      slotKey: 'beach_club_day_pass_story',
      labelTr: 'Day Giriş',
      labelEn: 'Day Pass',
      format: 'story',
      priority: 150,
      slotRole: 'story_motion',
      pipeline: 'story_overlay',
      designTemplateType: 'campaign_announcement',
      matchSignals: {
        announcement_types: ['offer_campaign'],
        keywords: ['day pass', 'giriş', 'ticket'],
      },
    }),
    slot({
      slotKey: 'beach_club_cocktail_promo_story',
      labelTr: 'Kokteyl',
      labelEn: 'Cocktail',
      format: 'story',
      priority: 130,
      slotRole: 'story_motion',
      pipeline: 'story_overlay',
      designTemplateType: 'campaign_announcement',
      matchSignals: {
        announcement_types: ['offer_campaign', 'product_showcase'],
        keywords: ['cocktail', 'kokteyl', 'drink', 'bar'],
      },
    }),
    slot({
      slotKey: 'beach_club_dj_event_story',
      labelTr: 'DJ Gece',
      labelEn: 'DJ Night',
      format: 'story',
      priority: 120,
      slotRole: 'story_motion',
      pipeline: 'story_overlay',
      designTemplateType: 'event_special',
      matchSignals: {
        announcement_types: ['event_teaser', 'event_announcement'],
        keywords: ['dj', 'night', 'party', 'live music'],
      },
    }),
    slot({
      slotKey: 'beach_club_event_announcement_story',
      labelTr: 'Etkinlik',
      labelEn: 'Event',
      format: 'story',
      priority: 110,
      slotRole: 'story_motion',
      pipeline: 'story_overlay',
      designTemplateType: 'event_special',
      matchSignals: {
        announcement_types: ['event_teaser', 'event_announcement'],
        keywords: ['event', 'named night', 'party'],
      },
    }),
    slot({
      slotKey: 'beach_club_sunset_post',
      labelTr: 'Gün batımı',
      labelEn: 'Sunset',
      format: 'post',
      priority: 100,
      slotRole: 'fal_designed_post',
      pipeline: 'fal_design',
      designTemplateType: 'venue_showcase',
      matchSignals: { announcement_types: ['venue_showcase'], keywords: ['ambiance'] },
    }),
  ];
  return {
    sectorId: 'beach_club',
    workspaceId: 'ws-beach',
    slots,
    enabledSlotKeys: new Set(slots.map((s) => s.slotKey)),
    unassignedCatalogKeys: [],
  };
}

function shopPostSlots(): BrandActiveSlotSet {
  const slots = [
    slot({
      slotKey: 'local_products_shop_product_hero_post',
      labelTr: 'Ürün hero',
      labelEn: 'Product hero',
      format: 'post',
      priority: 100,
      slotRole: 'fal_designed_post',
      pipeline: 'fal_design',
      designTemplateType: 'menu_highlight',
      matchSignals: {
        announcement_types: ['product_reveal', 'product_showcase'],
        keywords: ['product', 'ürün', 'hero'],
      },
    }),
    slot({
      slotKey: 'local_products_shop_limited_batch_post',
      labelTr: 'Kampanya',
      labelEn: 'Offer',
      format: 'post',
      priority: 90,
      slotRole: 'fal_designed_post',
      pipeline: 'fal_design',
      designTemplateType: 'campaign_announcement',
      matchSignals: {
        announcement_types: ['offer_campaign'],
        keywords: ['offer', 'batch', 'kampanya'],
      },
    }),
  ];
  return {
    sectorId: 'local_products_shop',
    workspaceId: 'ws-shop',
    slots,
    enabledSlotKeys: new Set(slots.map((s) => s.slotKey)),
    unassignedCatalogKeys: [],
  };
}

describe('normalizePickerFormat', () => {
  it('maps instagram aliases to package formats', () => {
    expect(normalizePickerFormat('instagram_story')).toBe('story');
    expect(normalizePickerFormat('feed')).toBe('post');
    expect(normalizePickerFormat('story')).toBe('story');
  });
});

describe('intentFamilyFromSignals (sector-agnostic)', () => {
  it('maps event / product / offer / venue without sector branches', () => {
    expect(
      intentFamilyFromSignals({
        slotKey: 'beach_club_dj_event_story',
        designTemplateType: 'event_special',
        announcementTypes: ['event_announcement'],
      }),
    ).toBe('event');
    expect(
      intentFamilyFromSignals({
        slotKey: 'local_products_shop_product_hero_post',
        designTemplateType: 'menu_highlight',
        announcementTypes: ['product_showcase'],
      }),
    ).toBe('product_menu');
    expect(
      intentFamilyFromSignals({
        slotKey: 'beach_club_day_pass_story',
        designTemplateType: 'campaign_announcement',
        announcementTypes: ['offer_campaign'],
      }),
    ).toBe('offer_ticket');
    expect(
      intentFamilyFromSignals({
        slotKey: 'restaurant_cafe_venue_ambiance_post',
        designTemplateType: 'venue_showcase',
        announcementTypes: ['venue_showcase'],
      }),
    ).toBe('venue');
  });

  it('treats cocktail promo as product_menu, not event', () => {
    expect(
      intentFamilyFromSignals({
        slotKey: 'beach_club_cocktail_promo_story',
        designTemplateType: 'campaign_announcement',
        announcementTypes: ['offer_campaign'],
        keywords: ['cocktail', 'drink'],
      }),
    ).toBe('product_menu');
  });

  it('maps gift-set slots/keywords to product_menu and farm_visit to brand_bts', () => {
    expect(
      intentFamilyFromSignals({
        slotKey: 'local_products_shop_gift_bundle_post',
        designTemplateType: 'menu_highlight',
        announcementTypes: ['product_showcase'],
        keywords: ['hediye', 'gift set'],
      }),
    ).toBe('product_menu');
    expect(
      intentFamilyFromSignals({
        keywords: ['tatlı hediye setlerimizle yazı tatlandır', 'reçel'],
      }),
    ).toBe('product_menu');
    expect(
      intentFamilyFromSignals({
        slotKey: 'local_products_shop_farm_visit_story',
        designTemplateType: 'daily_story',
        announcementTypes: ['behind_the_scenes'],
        keywords: ['çiftlik ziyareti', 'farm visit'],
      }),
    ).toBe('brand_bts');
  });
});

describe('pack SSOT signals (beach_club + local_products_shop)', () => {
  it('synthesized beach slots carry usable AI keywords', () => {
    const defs = synthesizeSectorSlotDefinitions('beach_club');
    const dj = defs.find((d) => d.slot_key.endsWith('dj_event_story'));
    const cocktail = defs.find((d) => d.slot_key.endsWith('cocktail_promo_story'));
    const dayPass = defs.find((d) => d.slot_key.endsWith('day_pass_story'));
    expect(dj?.design_template_type).toBe('event_special');
    expect(dj?.match_signals?.keywords).toEqual(
      expect.arrayContaining(['dj', 'night']),
    );
    expect(cocktail?.match_signals?.keywords).toEqual(
      expect.arrayContaining(['cocktail', 'kokteyl']),
    );
    expect(dayPass?.match_signals?.keywords).toEqual(
      expect.arrayContaining(['day pass', 'giriş']),
    );
  });

  it('synthesized shop product hero is product family', () => {
    const defs = synthesizeSectorSlotDefinitions('local_products_shop');
    const hero = defs.find((d) => d.slot_key.endsWith('product_hero_post'));
    expect(hero).toBeTruthy();
    expect(
      intentFamilyFromSignals({
        slotKey: hero!.slot_key,
        designTemplateType: String(hero!.design_template_type),
        announcementTypes: asAnn(hero!.match_signals),
        keywords: asKw(hero!.match_signals),
      }),
    ).toBe('product_menu');
  });

  it('synthesized shop gift vs farm_visit carry distinct strong families', () => {
    const defs = synthesizeSectorSlotDefinitions('local_products_shop');
    const gift = defs.find((d) => d.slot_key.endsWith('gift_bundle_post'));
    const farm = defs.find((d) => d.slot_key.endsWith('farm_visit_story'));
    expect(gift?.design_template_type).toBe('menu_highlight');
    expect(farm?.design_template_type).toBe('daily_story');
    expect(gift?.match_signals?.keywords).toEqual(
      expect.arrayContaining(['hediye', 'gift']),
    );
    expect(farm?.match_signals?.keywords).toEqual(
      expect.arrayContaining(['farm visit', 'çiftlik ziyareti']),
    );
    expect(
      intentFamilyFromSignals({
        slotKey: gift!.slot_key,
        designTemplateType: String(gift!.design_template_type),
        announcementTypes: asAnn(gift!.match_signals),
        keywords: asKw(gift!.match_signals),
      }),
    ).toBe('product_menu');
    expect(
      intentFamilyFromSignals({
        slotKey: farm!.slot_key,
        designTemplateType: String(farm!.design_template_type),
        announcementTypes: asAnn(farm!.match_signals),
        keywords: asKw(farm!.match_signals),
      }),
    ).toBe('brand_bts');
  });
});

function asAnn(signals: Record<string, unknown> | undefined): string[] {
  const v = signals?.announcement_types;
  return Array.isArray(v) ? v.map(String) : [];
}

function asKw(signals: Record<string, unknown> | undefined): string[] {
  const v = signals?.keywords;
  return Array.isArray(v) ? v.map(String) : [];
}

describe('candidatesFromActiveSlots', () => {
  it('filters story + stamps intent_family (beach_club)', () => {
    const c = candidatesFromActiveSlots(beachClubStorySlots(), 'story');
    expect(c.map((x) => x.slot_key)).toEqual([
      'beach_club_day_pass_story',
      'beach_club_cocktail_promo_story',
      'beach_club_dj_event_story',
      'beach_club_event_announcement_story',
    ]);
    const dj = c.find((x) => x.slot_key.includes('dj_event'));
    const cocktail = c.find((x) => x.slot_key.includes('cocktail'));
    expect(dj?.intent_family).toBe('event');
    expect(cocktail?.intent_family).toBe('product_menu');
  });

  it('filters shop post candidates', () => {
    const c = candidatesFromActiveSlots(shopPostSlots(), 'post');
    expect(c).toHaveLength(2);
    expect(c[0]!.intent_family).toBe('product_menu');
  });
});

describe('prompt construction (no sector if/else)', () => {
  it('system prompt is taxonomy-based, not brand-specific', () => {
    expect(CATALOG_SLOT_PICKER_SYSTEM).toMatch(/intent_family/);
    expect(CATALOG_SLOT_PICKER_SYSTEM).toMatch(/TITLE is primary/i);
    expect(CATALOG_SLOT_PICKER_SYSTEM).not.toMatch(/sarn[iı]ç|yula|karaman/i);
    expect(CATALOG_SLOT_PICKER_SYSTEM).not.toMatch(/if \(sector/);
  });

  it('user prompt lists structured candidate fields for both sectors', () => {
    const beachPrompt = buildCatalogSlotPickerUserPrompt({
      title: 'Cuba Night',
      direction: 'tropikal içecekler ve sıcak ışıklar',
      format: 'story',
      sector: 'beach_club',
      candidates: candidatesFromActiveSlots(beachClubStorySlots(), 'story'),
    });
    expect(beachPrompt).toContain('PRIMARY INTENT');
    expect(beachPrompt).toContain('family=event');
    expect(beachPrompt).toContain('family=product_menu');
    expect(beachPrompt).toContain('beach_club_dj_event_story');

    const shopPrompt = buildCatalogSlotPickerUserPrompt({
      title: 'Yeni bal kavanozu',
      format: 'post',
      sector: 'local_products_shop',
      candidates: candidatesFromActiveSlots(shopPostSlots(), 'post'),
    });
    expect(shopPrompt).toContain('product_hero');
    expect(shopPrompt).toContain('family=product_menu');
  });

  it('formatPickerCandidateLine exposes announcement_types', () => {
    const line = formatPickerCandidateLine(
      candidateFromActiveSlot(beachClubStorySlots().slots[2]!),
      0,
    );
    expect(line).toMatch(/announcement_types=\[/);
    expect(line).toMatch(/family=event/);
  });
});

describe('parseCatalogSlotAiPick', () => {
  const allowed = new Set([
    'beach_club_day_pass_story',
    'beach_club_dj_event_story',
    'beach_club_event_announcement_story',
  ]);

  it('accepts exact key from allowed set', () => {
    const parsed = parseCatalogSlotAiPick(
      '{"catalog_slot_key":"beach_club_dj_event_story","reason":"named night event"}',
      allowed,
    );
    expect(parsed).toEqual({
      catalog_slot_key: 'beach_club_dj_event_story',
      reason: 'named night event',
    });
  });

  it('rejects invented keys', () => {
    expect(
      parseCatalogSlotAiPick(
        '{"catalog_slot_key":"cuba_night_story","reason":"fit"}',
        allowed,
      ),
    ).toBeNull();
  });
});

describe('preferAiCatalogSlotsOnIdeas', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('Cuba Night story prefers dj/event over cocktail (beach_club)', async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              catalog_slot_key: 'beach_club_dj_event_story',
              reason: 'named night → event slot',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 200, completion_tokens: 20 },
    });

    const ideas = await preferAiCatalogSlotsOnIdeas({
      ideas: [
        {
          headline: 'Cuba Night',
          caption_draft: 'Tropikal renkler ve serinletici içecekler',
          format: 'story',
        },
      ],
      activeSlots: beachClubStorySlots(),
      sector: 'beach_club',
    });

    expect(ideas[0]!.catalog_slot_key).toBe('beach_club_dj_event_story');
    expect(ideas[0]!.catalog_slot_key).not.toMatch(/cocktail|day_pass/);
    expect(ideas[0]!.catalog_slot_picker).toBe('ai');
    expect(ideas[0]!.catalog_slot_picker_family).toBe('event');

    const userMsg = createMock.mock.calls[0]?.[0]?.messages?.[1]?.content as string;
    expect(userMsg).toContain('Cuba Night');
    expect(userMsg).toContain('family=event');
  });

  it('shop product brief picks product hero (local_products_shop)', async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              catalog_slot_key: 'local_products_shop_product_hero_post',
              reason: 'product showcase',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 15 },
    });

    const ideas = await preferAiCatalogSlotsOnIdeas({
      ideas: [
        {
          headline: 'Yeni bal kavanozu',
          caption: 'Organik çiçek balı raflarda',
          format: 'post',
        },
      ],
      activeSlots: shopPostSlots(),
      sector: 'local_products_shop',
    });

    expect(ideas[0]!.catalog_slot_key).toBe('local_products_shop_product_hero_post');
    expect(ideas[0]!.catalog_slot_picker_family).toBe('product_menu');
  });

  it('leaves idea unchanged when model returns invalid key', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: '{"catalog_slot_key":"not_real","reason":"x"}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const idea = { headline: 'Cuba Night', format: 'story' };
    const ideas = await preferAiCatalogSlotsOnIdeas({
      ideas: [idea],
      activeSlots: beachClubStorySlots(),
      sector: 'beach_club',
    });

    expect(ideas[0]).toEqual(idea);
    expect(createMock).toHaveBeenCalled();
  });

  it('rejects gift-set brief rematched onto farm_visit story (local_products_shop)', async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              catalog_slot_key: 'local_products_shop_farm_visit_story',
              reason: 'jam jars → farm visit',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 80, completion_tokens: 20 },
    });

    const shopStorySlots: BrandActiveSlotSet = {
      sectorId: 'local_products_shop',
      workspaceId: 'ws-shop',
      slots: [
        slot({
          slotKey: 'local_products_shop_new_arrival_story',
          labelTr: 'Yeni gelen story',
          labelEn: 'New arrival story',
          format: 'story',
          priority: 120,
          slotRole: 'campaign_story_motion',
          pipeline: 'fal_story',
          designTemplateType: 'menu_highlight',
          matchSignals: {
            announcement_types: ['product_reveal', 'product_showcase'],
            keywords: ['yeni ürün', 'product', 'arrival'],
          },
        }),
        slot({
          slotKey: 'local_products_shop_farm_visit_story',
          labelTr: 'Çiftlik ziyareti story',
          labelEn: 'Farm visit story',
          format: 'story',
          priority: 110,
          slotRole: 'campaign_story_motion',
          pipeline: 'fal_story',
          designTemplateType: 'daily_story',
          matchSignals: {
            announcement_types: ['behind_the_scenes'],
            keywords: ['farm visit', 'çiftlik ziyareti'],
          },
        }),
      ],
      enabledSlotKeys: new Set([
        'local_products_shop_new_arrival_story',
        'local_products_shop_farm_visit_story',
      ]),
      unassignedCatalogKeys: [],
    };

    const idea = {
      headline: 'Tatlı Hediye Setlerimizle Yazı Tatlandır!',
      caption_draft:
        'Use a variety of jam jars and honey products photos — showcases our diverse gift offerings.',
      format: 'story',
      subject_key: 'jam',
    };
    const ideas = await preferAiCatalogSlotsOnIdeas({
      ideas: [idea],
      activeSlots: shopStorySlots,
      sector: 'local_products_shop',
    });

    // AI picked farm_visit — product_menu vs brand_bts conflict → heuristic fallback.
    expect(ideas[0]).toEqual(idea);
    expect(ideas[0]!.catalog_slot_key).toBeUndefined();
  });

  it('rejects product_menu brief rematched onto event calendar slot', async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              catalog_slot_key: 'beach_club_events_calendar_post',
              reason: 'signature dishes → product menu',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 80, completion_tokens: 20 },
    });

    const postSlots: BrandActiveSlotSet = {
      sectorId: 'beach_club',
      workspaceId: 'ws-beach',
      slots: [
        slot({
          slotKey: 'beach_club_menu_highlight_post',
          labelTr: 'Menü',
          labelEn: 'Menu',
          format: 'post',
          priority: 120,
          slotRole: 'fal_designed_post',
          pipeline: 'fal_design',
          designTemplateType: 'menu_highlight',
          matchSignals: {
            announcement_types: ['product_showcase', 'menu_highlight'],
            keywords: ['dish', 'menu', 'food', 'yemek'],
          },
        }),
        slot({
          slotKey: 'beach_club_events_calendar_post',
          labelTr: 'Takvim',
          labelEn: 'Calendar',
          format: 'post',
          priority: 110,
          slotRole: 'fal_designed_post',
          pipeline: 'fal_design',
          designTemplateType: 'event_special',
          matchSignals: {
            announcement_types: ['event_announcement'],
            keywords: ['event', 'calendar', 'schedule'],
          },
        }),
      ],
      enabledSlotKeys: new Set([
        'beach_club_menu_highlight_post',
        'beach_club_events_calendar_post',
      ]),
      unassignedCatalogKeys: [],
    };

    const idea = {
      headline: 'Signature Dishes',
      caption_draft:
        'Dive into the rich flavors of our signature dishes! Every meal is a celebration.',
      format: 'post',
    };
    const ideas = await preferAiCatalogSlotsOnIdeas({
      ideas: [idea],
      activeSlots: postSlots,
      sector: 'beach_club',
    });

    // AI picked event — strong family conflict → leave idea for heuristic stamp.
    expect(ideas[0]).toEqual(idea);
    expect(ideas[0]!.catalog_slot_key).toBeUndefined();
  });
});
