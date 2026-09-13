import { describe, expect, it, vi } from 'vitest';
import type OpenAI from 'openai';

vi.mock('@/lib/external-image-fetch', () => ({
  fetchReviewableFrameBuffer: vi.fn(async () => null),
}));
import {
  describeLookPersistError,
  isCampaignSentenceLock,
  isLookOpsFailure,
  isLookedFeedSlotPersistable,
  lookFeedSlotPack,
  lookJobKind,
  lookSystemPrompt,
  shouldLookFeedSlotPack,
  shouldSkipFeedMeaningRematch,
  slotJobFromCatalogKey,
} from '@/lib/feed-slot-look';
import { parseFeedSlotPack, validateFeedSlotPack } from '@/lib/feed-slot-pack';

type Captured = { content?: unknown };

function fakeOpenai(payload: Record<string, unknown>, captured?: Captured) {
  return fakeOpenaiSequence([payload], captured);
}

function fakeOpenaiSequence(payloads: Record<string, unknown>[], captured?: Captured) {
  let i = 0;
  return {
    chat: {
      completions: {
        create: async (req: { messages: Array<{ role: string; content: unknown }> }) => {
          if (captured) captured.content = req.messages;
          const payload = payloads[Math.min(i, payloads.length - 1)]!;
          i += 1;
          return {
            choices: [{ message: { content: JSON.stringify(payload) } }],
            usage: { prompt_tokens: 80, completion_tokens: 40 },
          };
        },
      },
    },
  } as unknown as OpenAI;
}

function fakeOpenaiThrowThen(
  payload: Record<string, unknown>,
  calls: { count: number },
) {
  return {
    chat: {
      completions: {
        create: async () => {
          calls.count += 1;
          if (calls.count === 1) throw new Error('Request timed out');
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
  it('classifies catalog jobs without brand names', () => {
    expect(lookJobKind({
      slotJob: 'ürün hero',
      catalogSlotKey: 'local_products_shop_product_hero_post',
    })).toBe('sell');
    expect(lookJobKind({
      slotJob: 'müşteri favorisi',
      catalogSlotKey: 'local_products_shop_customer_favorite_post',
    })).toBe('sell');
    expect(lookJobKind({
      slotJob: 'sınırlı parti',
      catalogSlotKey: 'local_products_shop_limited_batch_post',
    })).toBe('sell');
    expect(lookJobKind({
      slotJob: 'gün batımı',
      catalogSlotKey: 'beach_club_sunset_ambiance_story',
    })).toBe('place');
    expect(lookJobKind({
      slotJob: 'dükkan atmosferi',
      catalogSlotKey: 'local_products_shop_shop_ambiance_post',
    })).toBe('place');
    expect(lookJobKind({
      slotJob: 'pazar günü',
      catalogSlotKey: 'local_products_shop_market_day_post',
    })).toBe('place');
    expect(lookJobKind({
      slotJob: 'el işi süreç',
      catalogSlotKey: 'local_products_shop_craft_process_reel',
    })).toBe('process');
    expect(lookJobKind({
      slotJob: 'çiftlik ziyareti',
      catalogSlotKey: 'local_products_shop_farm_visit_story',
    })).toBe('process');
  });

  it('shop: invented SKU caption skips the look call', async () => {
    const calls = { count: 0 };
    const result = await lookFeedSlotPack(
      {
        slotJob: 'müşteri favorisi',
        catalogSlotKey: 'local_products_shop_customer_favorite_post',
        ideationHint: 'Müşterilerimiz şam balını çok seviyor!',
        inventoryText: 'DİKEN BALI ÇAM BALI honey',
        candidates: [{
          url: 'https://cdn.example.com/diken.jpg',
          visibleLabelText: 'DİKEN BALI',
          primarySubject: 'honey',
        }],
      },
      {
        judgeProductClaim: async () => true,
        openai: {
          chat: {
            completions: {
              create: async () => {
                calls.count += 1;
                throw new Error('look must not run');
              },
            },
          },
        } as unknown as OpenAI,
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('invented_product_claim');
    expect(calls.count).toBe(0);
  });

  it('beach: invented cocktail caption skips the look call', async () => {
    const calls = { count: 0 };
    const result = await lookFeedSlotPack(
      {
        slotJob: 'gün batımı',
        catalogSlotKey: 'beach_club_sunset_ambiance_story',
        ideationHint: 'Gece menümüzde yeni lagoon spritz var.',
        inventoryText: 'YULA SPRITZ cocktail',
        candidates: [{
          url: 'https://cdn.example.com/spritz.jpg',
          visibleLabelText: 'YULA SPRITZ',
          primarySubject: 'cocktail',
        }],
      },
      {
        judgeProductClaim: async () => true,
        openai: {
          chat: {
            completions: {
              create: async () => {
                calls.count += 1;
                throw new Error('look must not run');
              },
            },
          },
        } as unknown as OpenAI,
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('invented_product_claim');
    expect(calls.count).toBe(0);
  });

  it('shop: incoherent pack fails after look', async () => {
    const result = await lookFeedSlotPack(
      {
        slotJob: 'ürün hero',
        catalogSlotKey: 'local_products_shop_product_hero_post',
        ideationHint: 'Sızma zeytinyağımız raflarda.',
        candidates: [{
          url: 'https://cdn.example.com/oil.jpg',
          visibleLabelText: 'NATUREL SIZMA ZEYTİNYAĞI',
        }],
      },
      {
        judgePackConsistency: async () => ({ ok: false }),
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
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('incoherent_pack');
  });

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
      expect(result.pack.headline).toMatch(/damla yeter/i);
      expect(result.pack.headline).not.toMatch(/^Sızma zeytinyağımız raflarda$/);
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

  it('adaptive place job may seed a labeled bottle for later restage', async () => {
    const result = await lookFeedSlotPack(
      {
        slotJob: 'dükkan atmosferi',
        catalogSlotKey: 'local_products_shop_shop_ambiance_post',
        language: 'Turkish',
        adaptiveScene: true,
        ideationHint: 'Dükkan atmosferi bu akşam sakin.',
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
          caption: 'Dükkan atmosferi bu akşam sakin. Raflarda sızma duruyor.',
          headline: 'Dükkan bu akşam sakin',
          shellDirection: 'product_hero',
        }),
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack.photoRole).toBe('product_for_sale');
      expect(result.pack.caption.toLowerCase()).toMatch(/dükkan|atmosfer/);
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

  it('shop sell: one more look when the first pass drops a labeled product', async () => {
    const captured: Captured = {};
    const result = await lookFeedSlotPack(
      {
        slotJob: 'müşteri favorisi',
        catalogSlotKey: 'local_products_shop_customer_favorite_post',
        language: 'Turkish',
        ideationHint: 'Müşterilerimiz bu ürünü çok seviyor',
        candidates: [{
          url: 'https://cdn.example.com/jar.jpg',
          visibleLabelText: 'ÇAM BALI',
        }],
      },
      {
        openai: fakeOpenaiSequence([
          { pickIndex: null, caption: '', headline: '', evidenceNote: '', photoRole: 'venue', shellDirection: 'venue_ambiance' },
          {
            pickIndex: 0,
            photoRole: 'product_for_sale',
            evidenceNote: 'Etiket: ÇAM BALI',
            caption: 'Çam balımız rafta. Bir kaşık yeter.',
            headline: 'Çam balımız rafta',
            shellDirection: 'product_hero',
          },
        ], captured),
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack.photoUrl).toBe('https://cdn.example.com/jar.jpg');
      expect(result.pack.caption).toMatch(/Çam/);
      expect(result.pack.headline).toMatch(/kaşık|kasik/i);
    }
    const messages = captured.content as Array<{ role: string; content: unknown }>;
    expect(JSON.stringify(messages)).toMatch(/sell job/i);
  });

  it('shop: adaptive bind keeps a labeled seed when look returns null', async () => {
    const result = await lookFeedSlotPack(
      {
        slotJob: 'ürün hero',
        catalogSlotKey: 'local_products_shop_product_hero_post',
        language: 'Turkish',
        adaptiveScene: true,
        ideationHint: 'Erken hasat zeytinyağımız raflarda duruyor.',
        candidates: [{
          url: 'https://cdn.example.com/oil.jpg',
          visibleLabelText: 'NATUREL SIZMA ZEYTİNYAĞI',
          description: 'Labeled oil bottle on a shelf',
        }],
      },
      {
        openai: fakeOpenai({
          pickIndex: null,
          caption: '',
          headline: '',
          evidenceNote: '',
          photoRole: 'venue',
          shellDirection: 'venue_ambiance',
        }),
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack.photoUrl).toBe('https://cdn.example.com/oil.jpg');
      expect(result.pack.caption.length).toBeGreaterThanOrEqual(16);
    }
  });

  it('beach: adaptive bind keeps a plated seed when look returns null', async () => {
    const result = await lookFeedSlotPack(
      {
        slotJob: 'gün batımı',
        catalogSlotKey: 'beach_club_sunset_ambiance_story',
        language: 'Turkish',
        adaptiveScene: true,
        ideationHint: 'Gün batımında masada kal, altın saat açık denizde.',
        candidates: [{
          url: 'https://cdn.example.com/plate.jpg',
          suggestedAssetType: 'food_drink_photo',
          description: 'Plated lunch on a set table',
        }],
      },
      {
        openai: fakeOpenai({
          pickIndex: null,
          caption: '',
          headline: '',
          evidenceNote: '',
          photoRole: 'venue',
          shellDirection: 'venue_ambiance',
        }),
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack.photoUrl).toBe('https://cdn.example.com/plate.jpg');
      expect(result.pack.caption.toLowerCase()).toMatch(/gün batım|masa|deniz/);
    }
  });

  it('beach place: does not force a labeled bottle when the first look refuses', async () => {
    const result = await lookFeedSlotPack(
      {
        slotJob: 'gün batımı',
        catalogSlotKey: 'beach_club_sunset_ambiance_story',
        language: 'Turkish',
        candidates: [
          { url: 'https://cdn.example.com/bottle.jpg', visibleLabelText: 'SIZMA' },
        ],
      },
      { openai: fakeOpenai({ pickIndex: null, caption: '', headline: '', evidenceNote: '', photoRole: 'venue', shellDirection: 'venue_ambiance' }) },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('no_pick');
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
    expect(isLookedFeedSlotPersistable(shopWeekly, {
      ...fullShop,
      caption: 'Müşterilerimizden gelen yorumlara göre bu kavanoz sofrada kalıyor.',
      headline: 'Bu kavanoz sofrada kalıyor',
    })).toBe(false);
    expect(isLookedFeedSlotPersistable(shopWeekly, {
      ...fullShop,
      caption: 'Müşterilerimizden gelen yorumlara göre bu kavanoz sofrada kalıyor.',
      headline: 'Bu kavanoz sofrada kalıyor',
    }, { adaptiveScene: true })).toBe(true);
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
    expect(describeLookPersistError(['look_call_failed'])).toBe(
      'Bakış yapılamadı (bakış çağrısı)',
    );
    expect(describeLookPersistError(['look_no_credits'])).toBe(
      'Bakış yapılamadı (no credits remaining)',
    );
    expect(isLookOpsFailure(['look_no_credits'])).toBe(false);
    expect(describeLookPersistError(['look_vision_blocked'])).toBe(
      'Bakış yapılamadı (fotoğraf açılamadı)',
    );
    expect(describeLookPersistError(['no_pick'])).toBe(
      'Paket yok (Aday fotoğraflar bu işi kanıtlamıyor)',
    );
    expect(describeLookPersistError(['missing_caption'])).toBe(
      'Paket yok (Alt yazı yok veya çok kısa)',
    );
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

  it('adaptive look restages later; sell still picks identity; pack stays one', () => {
    const adaptive = lookSystemPrompt(true);
    const base = lookSystemPrompt(false);
    expect(base).toMatch(/job_kind/);
    expect(base).toMatch(/do not switch to a different product/i);
    expect(base).not.toMatch(/or return pickIndex null/);
    expect(adaptive).toMatch(/best-caption-first|ordered best-caption-first/);
    expect(adaptive).toMatch(/restage the still/i);
    expect(adaptive).toMatch(/Product, caption, and headline stay one pack/i);
    expect(adaptive).toMatch(/A labeled product is the right pick when the job is selling/i);
    expect(adaptive).toMatch(/Do not return null because the farm, shop, or process is not in the frame/i);
    expect(adaptive).not.toMatch(/A bottle cannot prove a shop-interior/);
    expect(adaptive).not.toMatch(/Still pick a real hero \(labeled product/);
    expect(base).toMatch(/separate on-canvas social line/i);
    expect(base).not.toMatch(/must come from the caption/);
  });

  it('keeps a complete grounded tone line that is not the caption opening', async () => {
    const captured: Captured = {};
    const result = await lookFeedSlotPack(
      {
        slotJob: 'gün batımı',
        language: 'English',
        brandTone: 'luxury',
        candidates: [{
          url: 'https://cdn.example.com/terrace.jpg',
          description: 'Terrace, umbrellas, open sea horizon',
        }],
      },
      {
        openai: fakeOpenai({
          pickIndex: 0,
          photoRole: 'venue',
          evidenceNote: 'Terrace, umbrellas, open sea horizon',
          caption: 'The terrace holds the last light. The sea stays open.',
          headline: 'Last light on the terrace',
          shellDirection: 'venue_ambiance',
        }, captured),
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack.headline).toBe('Last light on the terrace');
      expect(result.pack.caption).toMatch(/terrace holds the last light/i);
    }
    const messages = captured.content as Array<{ role: string; content: unknown }>;
    const blob = JSON.stringify(messages);
    expect(blob).toMatch(/language\\":\\"English/);
    expect(blob).toMatch(/brand_tone\\":\\"luxury/);
  });

  it('shop: omitted language writes Turkish, not English', async () => {
    const captured: Captured = {};
    await lookFeedSlotPack(
      {
        slotJob: 'ürün hero',
        candidates: [{
          url: 'https://cdn.example.com/oil.jpg',
          description: 'Labeled olive oil tin',
        }],
      },
      {
        openai: fakeOpenai({
          pickIndex: 0,
          photoRole: 'product_for_sale',
          evidenceNote: 'Labeled olive oil tin',
          caption: 'Sızma zeytinyağımız raflarda. Sofraya bir damla yeter.',
          headline: 'Raflarda sızma',
          shellDirection: 'product_hero',
        }, captured),
      },
    );
    const blob = JSON.stringify(captured.content);
    expect(blob).toMatch(/language\\":\\"Turkish/);
    expect(blob).not.toMatch(/language\\":\\"English/);
  });

  it('beach: language code en becomes English in the look prompt', async () => {
    const captured: Captured = {};
    await lookFeedSlotPack(
      {
        slotJob: 'gün batımı',
        language: 'en',
        candidates: [{
          url: 'https://cdn.example.com/terrace.jpg',
          description: 'Terrace, umbrellas, open sea horizon',
        }],
      },
      {
        openai: fakeOpenai({
          pickIndex: 0,
          photoRole: 'venue',
          evidenceNote: 'Terrace, umbrellas, open sea horizon',
          caption: 'The terrace holds the last light. The sea stays open.',
          headline: 'Last light on the terrace',
          shellDirection: 'venue_ambiance',
        }, captured),
      },
    );
    const blob = JSON.stringify(captured.content);
    expect(blob).toMatch(/language\\":\\"English/);
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
      expect(result.pack.headline).toMatch(/damla yeter/i);
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

  it('shop: retries one timed-out look call in-process', async () => {
    const calls = { count: 0 };
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
        openai: fakeOpenaiThrowThen({
          pickIndex: 0,
          photoRole: 'product_for_sale',
          evidenceNote: 'Etiket: NATUREL SIZMA ZEYTİNYAĞI',
          caption: 'Sızma zeytinyağımız raflarda. Sofraya bir damla yeter.',
          headline: 'Sızma zeytinyağımız raflarda',
          shellDirection: 'product_hero',
        }, calls),
      },
    );
    expect(calls.count).toBe(2);
    expect(result.ok).toBe(true);
  });

  it('beach: retries one timed-out look call in-process', async () => {
    const calls = { count: 0 };
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
        openai: fakeOpenaiThrowThen({
          pickIndex: 0,
          photoRole: 'venue',
          evidenceNote: 'iskele, açık deniz ufku',
          caption: 'Deniz duruyor. İskele yerinde.',
          headline: 'İskele yerinde',
          shellDirection: 'venue_ambiance',
        }, calls),
      },
    );
    expect(calls.count).toBe(2);
    expect(result.ok).toBe(true);
  });

  it('shop: empty OpenAI wallet is a credit lock, not a look retry', async () => {
    const calls = { count: 0 };
    const result = await lookFeedSlotPack(
      {
        slotJob: 'müşteri favorisi',
        language: 'Turkish',
        adaptiveScene: true,
        candidates: [{
          url: 'https://cdn.example.com/oil.jpg',
          visibleLabelText: 'NATUREL SIZMA ZEYTİNYAĞI',
        }],
      },
      {
        openai: {
          chat: {
            completions: {
              create: async () => {
                calls.count += 1;
                throw new Error('429 You have no credits remaining. Add credits to continue using the API');
              },
            },
          },
        } as unknown as OpenAI,
      },
    );
    expect(calls.count).toBe(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('look_no_credits');
  });

  it('beach: empty OpenAI wallet is a credit lock, not a look retry', async () => {
    const calls = { count: 0 };
    const result = await lookFeedSlotPack(
      {
        slotJob: 'gün batımı ambiyans',
        language: 'Turkish',
        adaptiveScene: true,
        candidates: [{
          url: 'https://cdn.example.com/pier.jpg',
          description: 'Pier umbrellas open sea',
        }],
      },
      {
        openai: {
          chat: {
            completions: {
              create: async () => {
                calls.count += 1;
                throw new Error('429 You have no credits remaining. Add credits to continue using the API');
              },
            },
          },
        } as unknown as OpenAI,
      },
    );
    expect(calls.count).toBe(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('look_no_credits');
  });

  it('shop: does not send a blocked Instagram URL to the look model', async () => {
    const result = await lookFeedSlotPack({
      slotJob: 'ürün hero',
      language: 'Turkish',
      candidates: [{
        url: 'https://scontent.cdninstagram.com/v/oil.jpg',
        visibleLabelText: 'NATUREL SIZMA ZEYTİNYAĞI',
      }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('look_vision_blocked');
  });

  it('beach: does not send a blocked Wix URL to the look model', async () => {
    const result = await lookFeedSlotPack({
      slotJob: 'gün batımı ambiyans',
      language: 'Turkish',
      candidates: [{
        url: 'https://static.wixstatic.com/media/pier.jpg',
        description: 'Pier umbrellas open sea',
      }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('look_vision_blocked');
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
