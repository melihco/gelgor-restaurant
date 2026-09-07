import { describe, expect, it } from 'vitest';
import {
  isIncompleteOverlayPhrase,
  isMeaningfulFalOverlayText,
} from '@/lib/fal-caption-headline';
import {
  describeFeedSlotPack,
  fitHeadlineToMottoBox,
  groundFeedSlotCopy,
  headlineTakenFromCaption,
  isStampedFeedSlotPackVisible,
  lockFeedCardCopy,
  parseFeedSlotPack,
  stampFeedSlotPackMetadata,
  validateFeedSlotPack,
} from '@/lib/feed-slot-pack';

describe('feed-slot-pack — local_products_shop', () => {
  it('accepts a labeled bottle when headline comes from the caption', () => {
    const parsed = parseFeedSlotPack({
      slotJob: 'ürün hero',
      photoUrl: 'https://cdn.example.com/oil.jpg',
      photoRole: 'product_for_sale',
      caption: 'Sızma zeytinyağımız raflarda. Sofraya bir damla yeter.',
      headline: 'Sızma zeytinyağımız raflarda',
      shellDirection: 'product_hero',
      evidenceNote: 'Etiket: NATUREL SIZMA ZEYTİNYAĞI',
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(describeFeedSlotPack(parsed.pack)).toMatch(/satılık ürün/);
      expect(describeFeedSlotPack(parsed.pack)).toMatch(/Sızma/);
    }
  });

  it('rejects a selling pack when evidence has no product identity', () => {
    const issues = validateFeedSlotPack({
      slotJob: 'ürün hero',
      photoUrl: 'https://cdn.example.com/oil.jpg',
      photoRole: 'product_for_sale',
      caption: 'Erken hasat zeytinyağımız Datça’dan.',
      headline: 'Erken hasat zeytinyağımız',
      shellDirection: 'product_hero',
      evidenceNote: 'yazı yok',
    });
    expect(issues).toContain('product_needs_identity');
  });
});

describe('feed-slot-pack — beach_club', () => {
  it('accepts an unlabeled table bottle as decor, not a product shell', () => {
    const parsed = parseFeedSlotPack({
      slotJob: 'gün batımı ambiyans',
      photoUrl: 'https://cdn.example.com/table.jpg',
      photoRole: 'table_prop',
      caption: 'Gün batımında masada kal, altın saat kaçmasın.',
      headline: 'Gün batımında masada kal',
      shellDirection: 'venue_ambiance',
      evidenceNote: 'yazı yok, masa dekoru',
    });
    expect(parsed.ok).toBe(true);
  });

  it('rejects dressing a table prop in a product shell', () => {
    const issues = validateFeedSlotPack({
      slotJob: 'gün batımı',
      photoUrl: 'https://cdn.example.com/table.jpg',
      photoRole: 'table_prop',
      caption: 'Gün batımında masada kal, altın saat kaçmasın.',
      headline: 'Gün batımında masada kal',
      shellDirection: 'product_hero',
      evidenceNote: 'yazı yok, masa dekoru',
    });
    expect(issues).toContain('prop_cannot_sell');
  });

  it('rejects selling a product basket on a lawn / umbrella / lounger job', () => {
    const issues = validateFeedSlotPack({
      slotJob: 'çim alan şemsiye şezlong',
      photoUrl: 'https://cdn.example.com/basket.jpg',
      photoRole: 'product_for_sale',
      caption: 'Datça’nın lezzetlerini keşfedin: badem, çam balı ve zeytinyağı.',
      headline: 'Datça’nın lezzetlerini keşfedin',
      shellDirection: 'product_hero',
      evidenceNote: 'Etiket: DATÇA NATUREL SIZMA ZEYTİNYAĞI',
    });
    expect(issues).toContain('place_cannot_sell');
  });

  it('rejects an English event headline on a Turkish sunset caption', () => {
    expect(
      headlineTakenFromCaption(
        'Check out our upcoming events',
        'Gün batımında masada kal, altın saat kaçmasın.',
      ),
    ).toBe(false);
  });
});

describe('feed-slot-pack — copy from evidence, not leftover ideation', () => {
  it('shop: drops copied early-harvest ideation and writes from the label', () => {
    const r = groundFeedSlotCopy({
      slotJob: 'ürün hero',
      photoRole: 'product_for_sale',
      shellDirection: 'product_hero',
      evidenceNote:
        "Bir sepet içinde zeytinyağı, çam balı ve badem var. Etiketlerde 'DATÇA NATÜREL SIZMA ZEYTİYAĞI', 'DATÇA ÇAM BALI', 'DATÇA BADEMİ' yazıyor.",
      caption: 'Erken hasat zeytinyağımız Datça’dan sofralarınıza gelir.',
      headline: 'Erken hasat zeytinyağımız Datça’dan sofralarınıza gelir.',
      ideationHint: 'Erken hasat zeytinyağımız Datça’dan sofralarınıza gelir.',
    });
    expect(r.changed).toBe(true);
    expect(r.caption.toLowerCase()).not.toMatch(/erken hasat/);
    expect(r.headline.toLowerCase()).not.toMatch(/erken hasat/);
    expect(r.caption).toMatch(/sızma|sizma|SIZMA/i);
    expect(r.caption).toMatch(/bal|badem/i);
    expect(r.headline.toLowerCase()).not.toMatch(/gelin|alın/);
    expect(r.caption.toLowerCase()).not.toMatch(/gelin,|alın\./);
    expect(r.caption.toLowerCase()).not.toMatch(/sizi bekliyoruz|deneyimlemek|keşfedin|experience/);
    expect(headlineTakenFromCaption(r.headline, r.caption)).toBe(true);
  });

  it('shop: still drops harvest when the ideation hint is missing', () => {
    const r = groundFeedSlotCopy({
      slotJob: 'ürün hero',
      photoRole: 'product_for_sale',
      shellDirection: 'product_hero',
      evidenceNote:
        "Etiketlerde 'DATÇA NATÜREL SIZMA ZEYTİYAĞI', 'DATÇA ÇAM BALI', 'DATÇA BADEMİ' yazıyor.",
      caption: 'Erken hasat zeytinyağımız Datça’dan sofralarınıza gelir.',
      headline: 'Erken hasat zeytinyağımız Datça’dan sofralarınıza gelir.',
    });
    expect(r.caption.toLowerCase()).not.toMatch(/erken hasat/);
    expect(r.caption).toMatch(/sızma|sizma/i);
  });

  it('shop: keeps early harvest when the label proves it', () => {
    const r = groundFeedSlotCopy({
      slotJob: 'ürün hero',
      photoRole: 'product_for_sale',
      shellDirection: 'product_hero',
      evidenceNote: "Etiket: 'ERKEN HASAT SIZMA ZEYTİNYAĞI'",
      caption: 'Erken hasat sızma zeytinyağımız raflarda. Bu parti bitince yok.',
      headline: 'Erken hasat sızma zeytinyağımız raflarda',
      ideationHint: 'Erken hasat sızma zeytinyağımız raflarda.',
    });
    expect(r.caption).toMatch(/erken hasat/i);
    expect(r.caption).toMatch(/sızma/i);
  });

  it('beach: does not invent a lake when the photo side names the sea', () => {
    const r = groundFeedSlotCopy({
      slotJob: 'çim alan şemsiye şezlong',
      photoRole: 'venue',
      shellDirection: 'venue_ambiance',
      evidenceNote: 'Göl manzarası, kapalı şemsiyeler, yeşil ağaçlar',
      caption: 'Göl kenarında dinlendirici bir gün için mükemmel bir yer.',
      headline: 'Göl kenarında dinlendirici bir gün için mükemmel bir yer.',
      ideationHint: 'Check out our upcoming events this weekend.',
      photoSideText: 'çim, kapalı şemsiye, begonvil, açık deniz ufku',
    });
    expect(r.evidenceNote).toMatch(/deniz/i);
    expect(r.evidenceNote).not.toMatch(/göl/i);
    expect(r.caption).toMatch(/deniz/i);
    expect(r.caption).not.toMatch(/\bgöl\b/i);
    expect(r.caption).not.toMatch(/mükemmel bir yer|dinlendirici/i);
    expect(r.headline).not.toMatch(/çim|şemsiye|şezlong/i);
    expect(r.caption.toLowerCase()).not.toMatch(/gelin/);
    expect(isIncompleteOverlayPhrase(r.headline)).toBe(false);
    expect(isMeaningfulFalOverlayText(r.headline)).toBe(true);
    expect(headlineTakenFromCaption(r.headline, r.caption)).toBe(true);
  });

  it('cafe: keeps reservation copy when the plate and fireplace are in evidence', () => {
    const caption = 'Bu akşam için yerinizi ayırtın — şömine başı akşam yemeği.';
    const r = groundFeedSlotCopy({
      slotJob: 'yer ayırt',
      photoRole: 'table_prop',
      shellDirection: 'venue_ambiance',
      evidenceNote: 'Bir tabakta et, patates, salata ve arka planda yanan bir şömine görünmekte.',
      caption,
      headline: caption,
      ideationHint: caption,
    });
    expect(r.caption).toBe(caption);
    expect(r.headline).toMatch(/yerinizi ayırtın|şömine/i);
  });
});

describe('feed-slot-pack — motto box + caption open', () => {
  it('shop: a complete long sentence is not sawed for the box', () => {
    const locked = lockFeedCardCopy({
      headline: 'Sızma zeytinyağımız raflarda sofranıza bir damla yeter',
      caption: 'Sızma zeytinyağımız raflarda sofranıza bir damla yeter. Kavanoz etiketli.',
    });
    expect(locked.headline).toMatch(/sofranıza bir damla yeter/i);
    expect(locked.headline).not.toMatch(/Sızma zeytinyağımız$/);
  });

  it('shop: keeps a four-word oil motto inside the box', () => {
    expect(fitHeadlineToMottoBox('Yağın en sakin hali.')).toBe('Yağın en sakin hali');
    const locked = lockFeedCardCopy({
      headline: 'Yağın en sakin hali.',
      caption: 'Natürel sızma. Bal yanında.',
    });
    expect(locked.headline).toBe('Yağın en sakin hali');
    expect(locked.caption.startsWith('Yağın en sakin hali')).toBe(true);
  });

  it('beach: does not invent extra words when the motto already fits', () => {
    expect(fitHeadlineToMottoBox('Deniz duruyor. Kalın.')).toBe('Deniz duruyor');
  });

  it('beach: walks a furniture-list headline back to a complete motto', () => {
    const fitted = fitHeadlineToMottoBox('Deniz kenarında çim, şemsiye ve şezlong');
    expect(isIncompleteOverlayPhrase(fitted)).toBe(false);
    expect(isMeaningfulFalOverlayText(fitted)).toBe(true);
    expect(fitted).not.toMatch(/şemsiye|şezlong|,/i);
  });

  it('beach: inventory place copy rebuilds into a paintable motto', () => {
    const r = groundFeedSlotCopy({
      slotJob: 'çim alan şemsiye şezlong',
      photoRole: 'venue',
      shellDirection: 'venue_ambiance',
      evidenceNote: 'çim, kapalı şemsiye, begonvil, açık deniz ufku',
      caption: 'Deniz kenarında çim, şemsiye ve şezlong. Uzanın, kalın.',
      headline: 'Deniz kenarında çim, şemsiye',
      photoSideText: 'çim, kapalı şemsiye, begonvil, açık deniz ufku',
    });
    expect(r.headline).not.toMatch(/çim|şemsiye|şezlong/i);
    expect(isMeaningfulFalOverlayText(r.headline)).toBe(true);
    expect(isIncompleteOverlayPhrase(r.headline)).toBe(false);
    expect(r.caption).toMatch(/deniz/i);
    expect(headlineTakenFromCaption(r.headline, r.caption)).toBe(true);
  });
});

describe('feed-slot-pack — vitrine stamp', () => {
  const shopPack = {
    slotJob: 'ürün hero',
    photoUrl: 'https://cdn.example.com/oil.jpg',
    photoRole: 'product_for_sale' as const,
    caption: 'Yağın en sakin hali. Natürel sızma.',
    headline: 'Yağın en sakin hali',
    shellDirection: 'product_hero' as const,
    evidenceNote: 'Etiket: NATUREL SIZMA ZEYTİNYAĞI',
  };

  it('shop: stamps a full pack visible', () => {
    const stamp = stampFeedSlotPackMetadata(shopPack);
    expect(stamp.feed_slot_pack_ok).toBe(true);
    expect(isStampedFeedSlotPackVisible(stamp)).toBe(true);
  });

  it('beach: half pack and ok:false stay hidden', () => {
    expect(stampFeedSlotPackMetadata({
      slotJob: 'gün batımı',
      photoUrl: 'https://cdn.example.com/lawn.jpg',
      photoRole: 'table_prop',
      caption: 'Gün batımında masada kal.',
      headline: 'Gün batımında masada kal',
      shellDirection: 'product_hero',
      evidenceNote: 'yazı yok, masa dekoru',
    }).feed_slot_pack_ok).toBe(false);
    expect(isStampedFeedSlotPackVisible({ feed_slot_pack_ok: false })).toBe(false);
  });

  it('unstamped metadata stays visible so old cards and reels remain', () => {
    expect(isStampedFeedSlotPackVisible({})).toBe(true);
    expect(isStampedFeedSlotPackVisible(null)).toBe(true);
  });
});
