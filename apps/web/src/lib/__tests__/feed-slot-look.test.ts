import { describe, expect, it } from 'vitest';
import type OpenAI from 'openai';
import {
  isCampaignSentenceLock,
  isLookedFeedSlotPersistable,
  lookFeedSlotPack,
  lookSystemPrompt,
  shouldLookFeedSlotPack,
  shouldSkipFeedMeaningRematch,
  slotJobFromCatalogKey,
} from '@/lib/feed-slot-look';
import { parseFeedSlotPack, validateFeedSlotPack } from '@/lib/feed-slot-pack';

type Captured = { content?: unknown };

function fakeOpenai(payload: Record<string, unknown>, captured?: Captured) {
  return {
    chat: {
      completions: {
        create: async (req: { messages: Array<{ role: string; content: unknown }> }) => {
          if (captured) captured.content = req.messages.find((m) => m.role === 'user')?.content;
          return {
            choices: [{ message: { content: JSON.stringify(payload) } }],
            usage: { prompt_tokens: 80, completion_tokens: 40 },
          };
        },
      },
    },
  } as unknown as OpenAI;
}

describe('feed-slot-look — shop + beach', () => {
  it('grounds a copied early-harvest sentence to the label on the bottle', async () => {
    const result = await lookFeedSlotPack(
      {
        slotJob: 'ürün hero',
        language: 'Turkish',
        ideationHint: 'Erken hasat zeytinyağımız Datça’dan sofralarınıza gelir.',
        candidates: [{
          url: 'https://cdn.example.com/oil.jpg',
          visibleLabelText: 'DATÇA NATÜREL SIZMA ZEYTİYAĞI, DATÇA ÇAM BALI, DATÇA BADEMİ',
        }],
      },
      {
        openai: fakeOpenai({
          pickIndex: 0,
          photoRole: 'product_for_sale',
          evidenceNote:
            "Bir sepet içinde zeytinyağı, çam balı ve badem var. Etiketlerde 'DATÇA NATÜREL SIZMA ZEYTİYAĞI', 'DATÇA ÇAM BALI', 'DATÇA BADEMİ' yazıyor.",
          caption: 'Erken hasat zeytinyağımız Datça’dan sofralarınıza gelir.',
          headline: 'Erken hasat zeytinyağımız Datça’dan sofralarınıza gelir.',
          shellDirection: 'product_hero',
        }),
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack.caption.toLowerCase()).not.toMatch(/erken hasat/);
      expect(result.pack.headline.toLowerCase()).not.toMatch(/erken hasat/);
      expect(result.pack.caption).toMatch(/sızma|sizma|SIZMA/i);
      expect(result.pack.headline.toLowerCase()).not.toMatch(/gelin|alın/);
    }
  });

  it('rewrites an early-harvest hint to the label that is actually on the bottle', async () => {
    const result = await lookFeedSlotPack(
      {
        slotJob: 'product hero',
        language: 'Turkish',
        ideationHint: 'Erken hasat zeytinyağımız Datça’dan.',
        candidates: [{
          url: 'https://cdn.example.com/oil.jpg',
          visibleLabelText: 'NATUREL SIZMA ZEYTİNYAĞI',
          description: 'Labeled oil bottle',
        }],
      },
      {
        openai: fakeOpenai({
          pickIndex: 0,
          photoRole: 'product_for_sale',
          evidenceNote: 'Etiket: NATUREL SIZMA ZEYTİNYAĞI',
          caption: 'Sızma zeytinyağımız raflarda. Sofraya bir damla yeter.',
          headline: 'Başka bir slogan',
          shellDirection: 'product_hero',
        }),
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack.caption).toMatch(/Sızma/);
      expect(result.pack.caption).not.toMatch(/Erken hasat|Datça/);
      expect(result.pack.headline).toMatch(/Sızma zeytinyağımız raflarda/);
    }
  });

  it('accepts a bakery loaf for sale when evidence names the loaf, not a label', () => {
    const parsed = parseFeedSlotPack({
      slotJob: 'ürün hero',
      photoUrl: 'https://cdn.example.com/loaf.jpg',
      photoRole: 'product_for_sale',
      caption: 'Sabah somunu tezgahda. Sıcakken gelin.',
      headline: 'Sabah somunu tezgahda',
      shellDirection: 'product_hero',
      evidenceNote: 'tezgahda somun, yazı yok',
    });
    expect(parsed.ok).toBe(true);
  });

  it('keeps an unlabeled beach table bottle as decor, not a product claim', async () => {
    const result = await lookFeedSlotPack(
      {
        slotJob: 'sunset ambiance',
        language: 'Turkish',
        ideationHint: 'Check out our upcoming events',
        candidates: [{
          url: 'https://cdn.example.com/sunset-table.jpg',
          description: 'Sunset table with an unlabeled bottle among glasses',
        }],
      },
      {
        openai: fakeOpenai({
          pickIndex: 0,
          photoRole: 'table_prop',
          evidenceNote: 'yazı yok, masa dekoru, gün batımı',
          caption: 'Gün batımında masada kal, altın saat kaçmasın.',
          headline: 'Gün batımında masada kal',
          shellDirection: 'venue_ambiance',
        }),
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack.photoRole).toBe('table_prop');
      expect(result.pack.shellDirection).toBe('venue_ambiance');
      expect(result.pack.caption).not.toMatch(/event|harvest|sızma/i);
    }
  });

  it('fail-closes when the model invents a harvest claim on an unlabeled bottle', async () => {
    const result = await lookFeedSlotPack(
      {
        slotJob: 'product hero',
        language: 'Turkish',
        candidates: [{
          url: 'https://cdn.example.com/oil.jpg',
          description: 'Bottle, no readable label',
        }],
      },
      {
        openai: fakeOpenai({
          pickIndex: 0,
          photoRole: 'product_for_sale',
          evidenceNote: 'yazı yok',
          caption: 'Erken hasat zeytinyağımız Datça’dan.',
          headline: 'Erken hasat zeytinyağımız',
          shellDirection: 'product_hero',
        }),
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('product_needs_identity');
  });

  it('rewrites an invented lake when the photo side names the sea', async () => {
    const result = await lookFeedSlotPack(
      {
        slotJob: 'çim alan şemsiye şezlong',
        language: 'Turkish',
        ideationHint: 'Check out our upcoming events this weekend.',
        candidates: [{
          url: 'https://cdn.example.com/lawn.jpg',
          description: 'çim, kapalı şemsiye, begonvil, açık deniz ufku',
        }],
      },
      {
        openai: fakeOpenai({
          pickIndex: 0,
          photoRole: 'venue',
          evidenceNote: 'Göl manzarası, kapalı şemsiyeler, yeşil ağaçlar',
          caption: 'Göl kenarında dinlendirici bir gün için mükemmel bir yer.',
          headline: 'Göl kenarında dinlendirici bir gün için mükemmel bir yer.',
          shellDirection: 'venue_ambiance',
        }),
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack.evidenceNote).toMatch(/deniz/i);
      expect(result.pack.caption).toMatch(/deniz/i);
      expect(result.pack.caption).not.toMatch(/\bgöl\b/i);
      expect(result.pack.caption).not.toMatch(/mükemmel bir yer/i);
      expect(result.pack.headline).not.toMatch(/çim|şemsiye|şezlong/i);
    }
  });

  it('fail-closes when a place job is packed as a shop basket', async () => {
    const result = await lookFeedSlotPack(
      {
        slotJob: 'çim alan şemsiye şezlong',
        language: 'Turkish',
        ideationHint: 'Check out our upcoming events this weekend.',
        candidates: [
          { url: 'https://cdn.example.com/lawn.jpg', description: 'Grass, umbrellas, loungers' },
          { url: 'https://cdn.example.com/basket.jpg', visibleLabelText: 'SIZMA' },
        ],
      },
      {
        openai: fakeOpenai({
          pickIndex: 1,
          photoRole: 'product_for_sale',
          evidenceNote: 'Etiket: DATÇA NATUREL SIZMA ZEYTİNYAĞI',
          caption: 'Datça’nın lezzetlerini keşfedin: badem ve zeytinyağı.',
          headline: 'Datça’nın lezzetlerini keşfedin',
          shellDirection: 'product_hero',
        }),
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('place_cannot_sell');
  });

  it('fail-closes when no candidate can prove the job', async () => {
    const result = await lookFeedSlotPack(
      {
        slotJob: 'product hero',
        candidates: [{ url: 'https://cdn.example.com/crowd.jpg' }],
      },
      { openai: fakeOpenai({ pickIndex: null, caption: '', headline: '', evidenceNote: '', photoRole: 'venue', shellDirection: 'venue_ambiance' }) },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('no_pick');
  });

  it('accepts a data-image vision url so local files can be looked at', async () => {
    const result = await lookFeedSlotPack(
      {
        slotJob: 'ürün hero',
        language: 'Turkish',
        candidates: [{
          url: '/local/oil.jpg',
          visionUrl: 'data:image/jpeg;base64,ZmFrZQ==',
          visibleLabelText: 'NATUREL SIZMA ZEYTİNYAĞI',
        }],
      },
      {
        openai: fakeOpenai({
          pickIndex: 0,
          photoRole: 'product_for_sale',
          evidenceNote: 'Etiket: NATUREL SIZMA ZEYTİNYAĞI',
          caption: 'Sızma zeytinyağımız raflarda. Sofraya bir damla yeter.',
          headline: 'Sızma zeytinyağımız raflarda',
          shellDirection: 'product_hero',
        }),
      },
    );
    expect(result.ok).toBe(true);
  });

  it('shop + beach: looked stills persist only with a full pack; reel/campaign do not need one', () => {
    const shopWeekly = {
      slot_role: 'fal_designed_post',
      pipeline: 'fal_design',
      catalog_slot_key: 'local_products_shop_product_hero_post',
      publish_channel: 'instagram_organic',
    };
    const beachWeekly = {
      slot_role: 'fal_designed_post',
      pipeline: 'fal_design',
      catalog_slot_key: 'beach_club_sunset_ambiance_story',
      publish_channel: 'instagram_organic',
    };
    const fullShop = {
      slotJob: 'ürün hero',
      photoUrl: 'https://cdn.example.com/oil.jpg',
      photoRole: 'product_for_sale' as const,
      caption: 'Sızma zeytinyağımız raflarda. Sofraya bir damla yeter.',
      headline: 'Sızma zeytinyağımız raflarda',
      shellDirection: 'product_hero' as const,
      evidenceNote: 'Etiket: NATUREL SIZMA ZEYTİNYAĞI',
    };
    const fullBeach = {
      slotJob: 'gün batımı',
      photoUrl: 'https://cdn.example.com/pier.jpg',
      photoRole: 'venue' as const,
      caption: 'Deniz duruyor. Kenarda kalın.',
      headline: 'Deniz duruyor',
      shellDirection: 'venue_ambiance' as const,
      evidenceNote: 'iskele, açık deniz ufku',
    };
    expect(isLookedFeedSlotPersistable(shopWeekly, fullShop)).toBe(true);
    expect(isLookedFeedSlotPersistable(shopWeekly, null)).toBe(false);
    expect(isLookedFeedSlotPersistable(beachWeekly, fullBeach)).toBe(true);
    expect(isLookedFeedSlotPersistable(beachWeekly, null)).toBe(false);
    expect(isLookedFeedSlotPersistable({
      slot_role: 'organic_reel',
      pipeline: 'fal_reel',
    }, null)).toBe(true);
    expect(isLookedFeedSlotPersistable({
      slot_role: 'offer_campaign_post',
      pipeline: 'fal_design',
      catalog_slot_key: 'local_products_shop_offer_campaign_post',
    }, null)).toBe(true);
  });

  it('does not look at reels and locks meaning rematch after a valid pack', () => {
    expect(shouldLookFeedSlotPack({ slot_role: 'organic_reel', pipeline: 'fal_reel' })).toBe(false);
    expect(shouldLookFeedSlotPack({
      slot_role: 'fal_designed_post',
      pipeline: 'fal_design',
      publish_channel: 'instagram_organic',
    })).toBe(true);
    expect(slotJobFromCatalogKey('local_products_shop_limited_batch_post')).toBe('limited batch post');
    const pack = parseFeedSlotPack({
      slotJob: 'ürün hero',
      photoUrl: 'https://cdn.example.com/oil.jpg',
      photoRole: 'product_for_sale',
      caption: 'Sızma zeytinyağımız raflarda. Sofraya bir damla yeter.',
      headline: 'Sızma zeytinyağımız raflarda',
      shellDirection: 'product_hero',
      evidenceNote: 'Etiket: NATUREL SIZMA ZEYTİNYAĞI',
    });
    expect(pack.ok).toBe(true);
    if (pack.ok) expect(shouldSkipFeedMeaningRematch(pack.pack)).toBe(true);
    expect(shouldSkipFeedMeaningRematch(null)).toBe(false);
  });

  it('keeps weekly shop and beach stills on the pack door', () => {
    expect(shouldLookFeedSlotPack({
      slot_role: 'fal_designed_post',
      pipeline: 'fal_design',
      catalog_slot_key: 'local_products_shop_product_hero_post',
      publish_channel: 'instagram_organic',
    })).toBe(true);
    expect(shouldLookFeedSlotPack({
      slot_role: 'fal_designed_post',
      pipeline: 'fal_design',
      catalog_slot_key: 'beach_club_sunset_ambiance_story',
      publish_channel: 'instagram_organic',
    })).toBe(true);
    expect(isCampaignSentenceLock({
      slot_role: 'campaign_story_motion',
      pipeline: 'fal_story',
      catalog_slot_key: 'local_products_shop_farm_visit_story',
    })).toBe(false);
    expect(shouldLookFeedSlotPack({
      slot_role: 'campaign_story_motion',
      pipeline: 'fal_story',
      catalog_slot_key: 'local_products_shop_farm_visit_story',
      publish_channel: 'instagram_organic',
    })).toBe(true);
    expect(shouldLookFeedSlotPack({
      slot_role: 'campaign_story_motion',
      pipeline: 'fal_story',
      catalog_slot_key: 'beach_club_weekend_hours_story',
      publish_channel: 'instagram_organic',
    })).toBe(true);
    expect(shouldLookFeedSlotPack({
      slot_role: 'premium_editorial_campaign_story',
      pipeline: 'premium_editorial',
      catalog_slot_key: 'local_products_shop_premium_editorial_campaign_story',
      publish_channel: 'instagram_organic',
    })).toBe(true);
    expect(shouldLookFeedSlotPack({
      slot_role: 'premium_editorial_campaign_post',
      pipeline: 'premium_editorial',
      catalog_slot_key: 'beach_club_premium_editorial_campaign_post',
      publish_channel: 'instagram_organic',
    })).toBe(true);
  });

  it('does not mix a locked campaign sentence into the weekly pack', () => {
    expect(isCampaignSentenceLock({
      slot_role: 'offer_campaign_post',
      pipeline: 'fal_design',
      catalog_slot_key: 'local_products_shop_offer_campaign_post',
    })).toBe(true);
    expect(shouldLookFeedSlotPack({
      slot_role: 'offer_campaign_post',
      pipeline: 'fal_design',
      catalog_slot_key: 'local_products_shop_offer_campaign_post',
    })).toBe(false);
    expect(shouldLookFeedSlotPack({
      slot_role: 'fal_designed_post',
      pipeline: 'fal_design',
      catalog_slot_key: 'beach_club_daybed_offer_post',
      publish_channel: 'instagram_campaign',
    })).toBe(false);
    expect(shouldLookFeedSlotPack({
      slot_role: 'fal_designed_post',
      pipeline: 'fal_design',
      rationale: 'ad_hoc_brief_fal_designed_post',
    })).toBe(false);
  });

  it('adaptive look prefers the caption scene, not any labeled bottle', () => {
    const adaptive = lookSystemPrompt(true);
    expect(adaptive).toMatch(/best-caption-first|ordered best-caption-first/);
    expect(adaptive).toMatch(/labeled product is correct only/i);
    expect(adaptive).not.toMatch(/Still pick a real hero \(labeled product/);
  });

  it('adaptive scene keeps the weekly process sentence on a bottle still', async () => {
    const result = await lookFeedSlotPack(
      {
        slotJob: 'ürün hero',
        language: 'Turkish',
        adaptiveScene: true,
        ideationHint: 'Üretimde bugün iş başındayız',
        candidates: [{
          url: 'https://cdn.example.com/oil.jpg',
          visibleLabelText: 'NATUREL SIZMA ZEYTİNYAĞI',
          description: 'Labeled oil bottle on a shelf',
        }],
      },
      {
        openai: fakeOpenai({
          pickIndex: 0,
          photoRole: 'product_for_sale',
          evidenceNote: "Etiket: 'NATUREL SIZMA ZEYTİNYAĞI'. Rafta bir şişe.",
          caption: 'Sızma zeytinyağımız raflarda. Sofraya bir damla yeter.',
          headline: 'Sızma zeytinyağımız raflarda',
          shellDirection: 'product_hero',
        }),
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack.caption.toLowerCase()).toMatch(/üretim|iş baş/);
      expect(result.pack.photoRole).toBe('product_for_sale');
    }
  });

  it('rescues a sawed shop headline from the caption sentence', async () => {
    const result = await lookFeedSlotPack(
      {
        slotJob: 'ürün hero',
        language: 'Turkish',
        candidates: [{
          url: 'https://cdn.example.com/oil.jpg',
          visibleLabelText: 'NATUREL SIZMA ZEYTİNYAĞI',
        }],
      },
      {
        openai: fakeOpenai({
          pickIndex: 0,
          photoRole: 'product_for_sale',
          evidenceNote: 'Etiket: NATUREL SIZMA ZEYTİNYAĞI',
          caption: 'Sızma zeytinyağımız raflarda. Sofraya bir damla yeter.',
          headline: 'Zeytinyağımızın üretim sürecine',
          shellDirection: 'product_hero',
        }),
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack.headline).toMatch(/Sızma zeytinyağımız raflarda/i);
      expect(result.pack.headline.toLowerCase()).not.toMatch(/üretim sürecine/);
    }
  });

  it('shop: refuses scene_fill when a gallery bottle was picked', async () => {
    const result = await lookFeedSlotPack(
      {
        slotJob: 'ürün hero',
        language: 'Turkish',
        candidates: [{
          url: 'https://cdn.example.com/oil.jpg',
          visibleLabelText: 'NATUREL SIZMA ZEYTİNYAĞI',
        }],
      },
      {
        openai: fakeOpenai({
          pickIndex: 0,
          photoRole: 'scene_fill',
          evidenceNote: 'Üretilmiş ayva reçeli kavanozu',
          caption: 'Yeni lezzetleri keşfet. Ayva reçeli rafta.',
          headline: 'Yeni lezzetleri keşfet',
          shellDirection: 'product_hero',
        }),
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('no_pick');
  });

  it('beach: refuses scene_fill when a venue still was picked', async () => {
    const result = await lookFeedSlotPack(
      {
        slotJob: 'gün batımı ambiyans',
        language: 'Turkish',
        candidates: [{
          url: 'https://cdn.example.com/pier.jpg',
          description: 'Pier umbrellas open sea',
        }],
      },
      {
        openai: fakeOpenai({
          pickIndex: 0,
          photoRole: 'scene_fill',
          evidenceNote: 'Üretilmiş gün batımı',
          caption: 'Deniz duruyor. Kenarda kalın.',
          headline: 'Deniz duruyor',
          shellDirection: 'venue_ambiance',
        }),
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('no_pick');
  });
});

describe('feed-slot-pack identity — not label-only', () => {
  it('rejects sell packs whose evidence is only “no text”', () => {
    expect(validateFeedSlotPack({
      slotJob: 'ürün hero',
      photoUrl: 'https://cdn.example.com/oil.jpg',
      photoRole: 'product_for_sale',
      caption: 'Erken hasat zeytinyağımız Datça’dan.',
      headline: 'Erken hasat zeytinyağımız',
      shellDirection: 'product_hero',
      evidenceNote: 'yazı yok',
    })).toContain('product_needs_identity');
  });
});
