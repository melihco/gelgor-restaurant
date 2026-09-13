import { describe, expect, it } from 'vitest';
import type OpenAI from 'openai';
import {
  applyFeedPackConsistency,
  judgeFeedPackConsistency,
  packTellsSameProductStory,
} from '@/lib/feed-pack-consistency';
import type { FeedSlotPack } from '@/lib/feed-slot-pack';

const shopPack = (): FeedSlotPack => ({
  slotJob: 'ürün hero',
  photoUrl: 'https://cdn.example.com/oil.jpg',
  photoRole: 'product_for_sale',
  caption: 'Sızma zeytinyağımız raflarda. Sofraya bir damla yeter.',
  headline: 'Sızma zeytinyağımız raflarda',
  shellDirection: 'product_hero',
  evidenceNote: 'Etiket: NATUREL SIZMA ZEYTİNYAĞI',
});

const beachPack = (): FeedSlotPack => ({
  slotJob: 'gün batımı',
  photoUrl: 'https://cdn.example.com/terrace.jpg',
  photoRole: 'venue',
  caption: 'Deniz duruyor. Kenarda kalın.',
  headline: 'Deniz duruyor',
  shellDirection: 'venue_ambiance',
  evidenceNote: 'iskele, açık deniz ufku',
});

function fakeVerdictOpenai(body: Record<string, unknown>, calls: { count: number }) {
  return {
    chat: {
      completions: {
        create: async (req: { messages: Array<{ role: string; content: unknown }> }) => {
          calls.count += 1;
          const bag = JSON.stringify(req.messages);
          expect(bag).toMatch(/SLOT JOB/);
          expect(bag).not.toMatch(/PRODUCT_CLASS|harvest list/);
          return {
            choices: [{ message: { content: JSON.stringify(body) } }],
            usage: { prompt_tokens: 50, completion_tokens: 16 },
          };
        },
      },
    },
  } as unknown as OpenAI;
}

describe('feed-pack-consistency — shop + beach', () => {
  it('shop: favorite slot + product shell is the same story when the label matches', async () => {
    const favorite = {
      ...shopPack(),
      slotJob: 'müşteri favorisi',
      caption: 'Badem ezmemiz rafta. Bir kaşık yeter.',
      headline: 'Badem ezmemiz rafta',
      evidenceNote: 'Etiket: BADEM EZMESİ',
    };
    expect(packTellsSameProductStory(favorite)).toBe(true);
    const result = await applyFeedPackConsistency(favorite, {
      judge: async () => ({ ok: false }),
    });
    expect(result.ok).toBe(true);
  });

  it('shop: oil caption on a jam label withholds before paint', async () => {
    const calls = { count: 0 };
    const mismatch = {
      ...shopPack(),
      caption: 'Sızma zeytinyağımız raflarda. Sofraya bir damla yeter.',
      headline: 'Sızma zeytinyağımız raflarda',
      evidenceNote: 'Etiket: İNCİR REÇELİ',
    };
    expect(packTellsSameProductStory(mismatch)).toBe(false);
    const result = await applyFeedPackConsistency(mismatch, {
      judge: async () => {
        calls.count += 1;
        return { ok: false };
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('incoherent_pack');
    expect(calls.count).toBe(1);
  });

  it('shop: model may replace a sawed headline from the caption', async () => {
    const calls = { count: 0 };
    const cut: FeedSlotPack = {
      ...shopPack(),
      headline: 'Sızma zeytinyağımız r',
    };
    const result = await applyFeedPackConsistency(cut, {
      openai: fakeVerdictOpenai({
        ok: true,
        headline: 'Sızma zeytinyağımız raflarda',
      }, calls),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack.headline).toBe('Sızma zeytinyağımız raflarda');
    }
    expect(calls.count).toBe(1);
  });

  it('beach: sunset copy on a lunch plate withholds', async () => {
    const result = await applyFeedPackConsistency({
      ...beachPack(),
      caption: 'Öğle tabağı hazır. Masada kalın.',
      headline: 'Öğle tabağı hazır',
      evidenceNote: 'iskele, açık deniz ufku',
    }, {
      judge: async () => ({ ok: false }),
    });
    expect(result.ok).toBe(false);
  });

  it('fail-opens when the model throws', async () => {
    const verdict = await judgeFeedPackConsistency({
      pack: shopPack(),
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
    expect(verdict.ok).toBe(true);
  });
});
