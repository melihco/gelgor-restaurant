import { describe, expect, it } from 'vitest';
import {
  acceptFeedHeadline,
  buildHeadlinePrompt,
  normalizeHeadlineCandidate,
  writeFeedHeadline,
} from '@/lib/headline-writer';

const SHOP_CAPTION = 'Zeytinyağlarımızı deneyen herkesin beğenisini topluyor. Sofranıza bir damla yeter, tadı kalır.';
const BEACH_CAPTION = 'The terrace holds the last light of the day. Cocktails arrive as the sun drops behind the pier.';

describe('headline-writer — gate', () => {
  it('shop: rejects the caption opening, incomplete tails and ungrounded lines', () => {
    expect(acceptFeedHeadline({ headline: 'Zeytinyağlarımızı deneyen herkesin', caption: SHOP_CAPTION })).toBe(false);
    expect(acceptFeedHeadline({ headline: 'Sofranıza bir', caption: SHOP_CAPTION })).toBe(false);
    expect(acceptFeedHeadline({ headline: 'Lezzet şöleni başlıyor', caption: SHOP_CAPTION })).toBe(false);
    expect(acceptFeedHeadline({ headline: 'Karaman', caption: SHOP_CAPTION, brandName: 'Karaman' })).toBe(false);
  });

  it('shop: accepts a suffix-different product word grounded in the caption', () => {
    expect(acceptFeedHeadline({ headline: 'Zeytinyağı sofranıza', caption: SHOP_CAPTION })).toBe(true);
    expect(acceptFeedHeadline({ headline: 'Bir damla yeter', caption: SHOP_CAPTION })).toBe(true);
  });

  it('beach: accepts a scene line, rejects a two-word place command', () => {
    expect(acceptFeedHeadline({ headline: 'Cocktails at the pier', caption: BEACH_CAPTION })).toBe(true);
    expect(acceptFeedHeadline({
      headline: 'Gölgede kalın',
      caption: 'Çim alan açık. Gölgede kalın.',
      photoRole: 'venue',
      shellDirection: 'venue_ambiance',
    })).toBe(false);
  });

  it('normalizes quotes, emoji and trailing punctuation', () => {
    expect(normalizeHeadlineCandidate('“Bir damla yeter.” 🌿')).toBe('Bir damla yeter');
  });
});

describe('headline-writer — order', () => {
  it('shop: a passing hint wins without calling the model', async () => {
    let called = 0;
    const r = await writeFeedHeadline({
      caption: SHOP_CAPTION,
      hint: 'Bir damla yeter',
      generate: async () => { called += 1; return ['Zeytinyağı sofranıza']; },
    });
    expect(r).toMatchObject({ headline: 'Bir damla yeter', source: 'hint' });
    expect(called).toBe(0);
  });

  it('shop: a stripped hint falls to the first AI candidate that passes the gate', async () => {
    const r = await writeFeedHeadline({
      caption: SHOP_CAPTION,
      hint: '',
      language: 'Turkish',
      generate: async (prompt) => {
        expect(prompt.language).toBe('Turkish');
        expect(prompt.user).toMatch(/CAPTION:/);
        return ['Lezzet şöleni başlıyor', 'Zeytinyağı sofranıza'];
      },
    });
    expect(r.headline).toBe('Zeytinyağı sofranıza');
    expect(r.source).toBe('ai');
    expect(r.rejected).toContain('Lezzet şöleni başlıyor');
  });

  it('beach: model unavailable → later caption sentence, never the opening thought', async () => {
    const r = await writeFeedHeadline({
      caption: BEACH_CAPTION,
      hint: 'The terrace holds the last light',
      language: 'English',
      generate: async () => { throw new Error('no credits'); },
    });
    expect(r.source).toBe('caption');
    expect(r.headline.toLowerCase()).not.toMatch(/^the terrace holds/);
    expect(r.headline.length).toBeGreaterThanOrEqual(4);
  });

  it('shop: single-sentence caption with no usable line → sample only if grounded, else none', async () => {
    const r = await writeFeedHeadline({
      caption: 'Zeytinyağlarımızı deneyen herkesin beğenisini topluyor.',
      hint: '',
      catalogSlotKey: 'local_products_shop_product_hero_post',
      sector: 'local_products_shop',
      language: 'Turkish',
      generate: async () => [],
    });
    expect(['sample', 'none']).toContain(r.source);
    if (r.source === 'none') expect(r.headline).toBe('');
  });

  it('prompt carries tone, slot and language for both sectors', () => {
    const p = buildHeadlinePrompt({ caption: BEACH_CAPTION, slotJob: 'sunset ambiance', brandTone: 'relaxed', language: 'en' });
    expect(p.user).toMatch(/LANGUAGE: English/);
    expect(p.user).toMatch(/SLOT: sunset ambiance/);
    expect(p.user).toMatch(/TONE: relaxed/);
    expect(p.system).toMatch(/exactly 2 lines/);
  });
});

describe('acceptFeedHeadline refuses caption meta lines (shop + beach)', () => {
  it('never lets the label filler become the headline', () => {
    expect(acceptFeedHeadline({ headline: 'Etiket duruyor', caption: 'Erken hasat zeytinyağı. Etiket duruyor.' })).toBe(false);
    expect(acceptFeedHeadline({ headline: 'The label stays', caption: 'Sunset spritz. The label stays.' })).toBe(false);
    // Place-evidence rebuilds: photo notes for shop and beach, never a card line.
    expect(acceptFeedHeadline({ headline: 'Yer duruyor', caption: 'Alan açık. Yer duruyor.' })).toBe(false);
    expect(acceptFeedHeadline({ headline: 'Deniz duruyor', caption: 'Deniz duruyor. İskele yerinde.' })).toBe(false);
    expect(acceptFeedHeadline({ headline: 'The sea is still', caption: 'The sea is still. The pier holds.' })).toBe(false);
  });
  it('accepts a lexical compound product name as a complete line', () => {
    expect(acceptFeedHeadline({ headline: 'Erken hasat zeytinyağı', caption: 'Bu hafta tezgahta erken hasat zeytinyağı var. Tadına bakın.' })).toBe(true);
  });
});
