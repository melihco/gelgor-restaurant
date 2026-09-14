import { describe, expect, it } from 'vitest';
import type OpenAI from 'openai';
import { galleryInventoryText } from '@/lib/feed-slot-pack';
import {
  ideaCoveredByShelfLabels,
  ideaShelfLabelOverlap,
  ideaShelfLabelOverlapRooted,
  judgeInventedProductClaim,
  pickMissesNamedCandidateSku,
} from '@/lib/idea-product-claim';

function fakeJudgeOpenai(invented: boolean, calls: { count: number }) {
  return {
    chat: {
      completions: {
        create: async (req: { messages: Array<{ role: string; content: unknown }> }) => {
          calls.count += 1;
          const bag = JSON.stringify(req.messages);
          expect(bag).toMatch(/SHELF \/ LABELS/);
          expect(bag).not.toMatch(/şam→çam|harvest list|PRODUCT_CLASS/);
          return {
            choices: [{ message: { content: JSON.stringify({ invented }) } }],
            usage: { prompt_tokens: 40, completion_tokens: 8 },
          };
        },
      },
    },
  } as unknown as OpenAI;
}

describe('judgeInventedProductClaim — shop + beach', () => {
  it('does not call the model when the gallery has no labels', async () => {
    const calls = { count: 0 };
    const invented = await judgeInventedProductClaim({
      ideaText: 'Müşterilerimiz şam balını çok seviyor.',
      inventoryText: '',
      openai: fakeJudgeOpenai(true, calls),
    });
    expect(invented).toBe(false);
    expect(calls.count).toBe(0);
  });

  it('shop: model can withhold an invented honey variety', async () => {
    const inventory = galleryInventoryText({
      a: { visibleLabelText: 'DİKEN BALI', primarySubject: 'honey', contentTags: ['honey', 'jar'] },
      b: { visibleLabelText: 'ÇAM BALI', primarySubject: 'honey' },
    });
    const calls = { count: 0 };
    expect(await judgeInventedProductClaim({
      ideaText: 'Müşterilerimiz şam balını çok seviyor! Doğal ve katkısız şam balımızı tadın.',
      inventoryText: inventory,
      openai: fakeJudgeOpenai(true, calls),
    })).toBe(true);
    expect(calls.count).toBe(1);
  });

  it('shop: labeled variety and harvest grade stay open when the model says so', async () => {
    const calls = { count: 0 };
    expect(await judgeInventedProductClaim({
      ideaText: 'Müşterilerimiz çam balını çok seviyor.',
      inventoryText: 'DİKEN BALI ÇAM BALI honey',
      openai: fakeJudgeOpenai(false, calls),
    })).toBe(false);
    expect(await judgeInventedProductClaim({
      ideaText: 'Erken hasat zeytinyağımız Datça’dan sofralarınıza gelir.',
      inventoryText: 'NATUREL SIZMA ZEYTİNYAĞI olive_oil',
      openai: fakeJudgeOpenai(false, calls),
    })).toBe(false);
    expect(calls.count).toBe(1);
  });

  it('beach: invented drink name can withhold; labeled spritz stays open', async () => {
    const calls = { count: 0 };
    expect(await judgeInventedProductClaim({
      ideaText: 'Gece menümüzde yeni lagoon spritz var, terasta deneyin.',
      inventoryText: 'YULA SPRITZ cocktail sunset',
      openai: fakeJudgeOpenai(true, calls),
    })).toBe(true);
    expect(await judgeInventedProductClaim({
      ideaText: 'Terasta Yula spritz, gün batımında kalın.',
      inventoryText: 'YULA SPRITZ cocktail sunset',
      openai: fakeJudgeOpenai(false, calls),
    })).toBe(false);
    expect(calls.count).toBe(1);
  });

  it('shop: labeled çam balı does not call the model', async () => {
    const calls = { count: 0 };
    const invented = await judgeInventedProductClaim({
      ideaText: 'Müşterilerimiz çam balını çok seviyor. Datça’nın çam balı.',
      inventoryText: 'DİKEN BALI ÇAM BALI PINE HONEY honey',
      openai: fakeJudgeOpenai(true, calls),
    });
    expect(invented).toBe(false);
    expect(calls.count).toBe(0);
  });

  it('restaurant: empty shelf does not invent a breakfast claim', async () => {
    const calls = { count: 0 };
    const invented = await judgeInventedProductClaim({
      ideaText: 'Bu yaz bahçemizde sunulan serpme köy kahvaltımızla buluşun.',
      inventoryText: '',
      openai: fakeJudgeOpenai(true, calls),
    });
    expect(invented).toBe(false);
    expect(calls.count).toBe(0);
  });

  it('beach: unlabeled venue tags are not a drink catalog', async () => {
    const calls = { count: 0 };
    const invented = await judgeInventedProductClaim({
      ideaText: 'Signature cocktail at sunset on the terrace.',
      inventoryText: '',
      openai: fakeJudgeOpenai(true, calls),
    });
    expect(invented).toBe(false);
    expect(calls.count).toBe(0);
  });

  it('fail-opens when the model throws', async () => {
    const invented = await judgeInventedProductClaim({
      ideaText: 'Müşterilerimiz şam balını çok seviyor.',
      inventoryText: 'DİKEN BALI ÇAM BALI honey',
      openai: {
        chat: {
          completions: {
            create: async () => {
              throw new Error('Request timed out');
            },
          },
        },
      } as unknown as OpenAI,
    });
    expect(invented).toBe(false);
  });
});

describe('ideaCoveredByShelfLabels — shop + restaurant', () => {
  it('shop: çam balı hits ÇAM BALI / PINE HONEY', () => {
    expect(ideaCoveredByShelfLabels(
      'Çam balımız doğadan sofranıza',
      'DİKEN BALI ÇAM BALI PINE HONEY',
    )).toBe(true);
  });

  it('shop: şam balı does not ride on çam labels', () => {
    expect(ideaCoveredByShelfLabels(
      'Müşterilerimiz şam balını çok seviyor',
      'DİKEN BALI ÇAM BALI',
    )).toBe(false);
  });

  it('restaurant: breakfast copy is not covered by garden tags', () => {
    expect(ideaCoveredByShelfLabels(
      'Serpme köy kahvaltımızla buluşun',
      'garden table dining turkish_breakfast',
    )).toBe(false);
  });

  it('shop: plural harvest copy does not count as a sızma-label hit', () => {
    expect(ideaShelfLabelOverlap(
      'Erken hasat zeytinyağlarımızla yemeklerinize lezzet katın',
      'NATUREL SIZMA ZEYTİNYAĞI',
    )).toBe(0);
    // Shortlist ranking is suffix-tolerant: the family root counts there.
    expect(ideaShelfLabelOverlapRooted(
      'Erken hasat zeytinyağlarımızla yemeklerinize lezzet katın',
      'NATUREL SIZMA ZEYTİNYAĞI',
    )).toBe(1);
    expect(ideaShelfLabelOverlapRooted(
      'Zeytinyağlarımızı deneyen herkesin beğenisini topluyor',
      'ERKEN HASAT ZEYTİNYAĞI',
    )).toBe(1);
    expect(ideaShelfLabelOverlap(
      'Sızma zeytinyağımız raflarda',
      'NATUREL SIZMA ZEYTİNYAĞI',
    )).toBe(2);
    expect(ideaCoveredByShelfLabels(
      'Erken hasat zeytinyağlarımızla yemeklerinize lezzet katın',
      'NATUREL SIZMA ZEYTİNYAĞI DATÇA DOĞAL LEZZET İNCİR REÇELİ',
    )).toBe(false);
  });

  it('beach: terrace copy hits venue tags, not a plate', () => {
    expect(ideaShelfLabelOverlap(
      'The terrace holds the last light',
      'terrace sunset umbrellas sea',
    )).toBeGreaterThanOrEqual(1);
    expect(ideaCoveredByShelfLabels(
      'The terrace holds the last light',
      'lunch plate salad',
    )).toBe(false);
  });
});

describe('pickMissesNamedCandidateSku (live Karaman no_pick storm)', () => {
  const honeyShelf = [
    'Karaman Dala Süzme Çiçek Balı',
    'SÜZME KEKİK BALI',
    'SÜZME ÇAM BALı',
    'Süzme Çiçek Balı',
  ];

  it('generic customer-favorite idea names nothing → model pick stands', () => {
    const idea = 'Siz de bu eşsiz lezzeti deneyin — Müşterilerimiz doğallığını ve tadını çok seviyor! 🍯 Doğal lezzetleri keşfedin';
    expect(pickMissesNamedCandidateSku(idea, honeyShelf, 'Karaman Dala Süzme Çiçek Balı')).toBe(false);
  });

  it('idea naming Süzme Çam Balı rejects a çiçek jar and accepts the çam jar', () => {
    const idea = 'Süzme Çam Balı’nı keşfedin ve sağlıklı yaşam';
    expect(pickMissesNamedCandidateSku(idea, honeyShelf, 'Süzme Çiçek Balı')).toBe(true);
    expect(pickMissesNamedCandidateSku(idea, honeyShelf, 'SÜZME ÇAM BALı')).toBe(false);
  });

  it('house words (Karaman, Datça) shared by most labels do not count as SKU identity', () => {
    const shelf = ['Karaman Datça Petek Balı', 'Karaman Datça Erken Hasat Zeytinyağı', 'Karaman Datça Kekik Balı'];
    const idea = 'Karaman Datça’da bu hafta lezzet dolu günler';
    expect(pickMissesNamedCandidateSku(idea, shelf, 'Karaman Datça Petek Balı')).toBe(false);
  });

  it('beach club: cocktail idea names Aperol; a Hugo pick misses', () => {
    const shelf = ['Aperol Spritz', 'Hugo Spritz', 'Limoncello Spritz'];
    expect(pickMissesNamedCandidateSku('Gün batımında Aperol Spritz saati', shelf, 'Hugo Spritz')).toBe(true);
    expect(pickMissesNamedCandidateSku('Gün batımında Aperol Spritz saati', shelf, 'Aperol Spritz')).toBe(false);
  });
});
