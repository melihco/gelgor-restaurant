import { describe, expect, it } from 'vitest';
import {
  isIncompleteOverlayPhrase,
  isMeaningfulFalOverlayText,
} from '@/lib/fal-caption-headline';
import {
  captionOpensWithHeadline,
  describeFeedSlotPack,
  fitHeadlineToMottoBox,
  galleryInventoryText,
  galleryInventoryTextForIdea,
  galleryShelfLabelTextForIdea,
  GALLERY_INVENTORY_CLAIM_BUDGET,
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

  it('rejects early-harvest copy when the bottle evidence is mixed flavor', () => {
    const issues = validateFeedSlotPack({
      slotJob: 'ürün hero',
      photoUrl: 'https://cdn.example.com/oil.jpg',
      photoRole: 'product_for_sale',
      caption: 'Erken hasat zeytinyağımız, hem taze hem de zengin bir lezzet sunar.',
      headline: 'Erken hasat zeytinyağımız',
      shellDirection: 'product_hero',
      evidenceNote: 'Karışık çeşnili zeytinyağı şişesi, 500ml etiket',
    });
    expect(issues).toContain('copy_misses_evidence');
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

  it('adaptive restage allows a labeled product seed on a place job', () => {
    const issues = validateFeedSlotPack({
      slotJob: 'çim alan şemsiye şezlong',
      photoUrl: 'https://cdn.example.com/basket.jpg',
      photoRole: 'product_for_sale',
      caption: 'Çim alanda akşam ışığı. Şişe masada, deniz açık.',
      headline: 'Çim alanda akşam ışığı',
      shellDirection: 'product_hero',
      evidenceNote: 'Etiket: DATÇA NATUREL SIZMA ZEYTİNYAĞI',
    }, { adaptiveScene: true });
    expect(issues).not.toContain('place_cannot_sell');
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

  it('beach: rejects a two-word stay-in-the-shade command as the headline', () => {
    const issues = validateFeedSlotPack({
      slotJob: 'şezlong gölge',
      photoUrl: 'https://cdn.example.com/lounger.jpg',
      photoRole: 'venue',
      caption: 'Gölgede kalın. Şezlong ve kapalı şemsiye, deniz açık.',
      headline: 'Gölgede kalın',
      shellDirection: 'venue_ambiance',
      evidenceNote: 'şezlong, kapalı şemsiye, açık deniz',
    });
    expect(issues).toContain('empty_place_command');
  });

  it('shop: a labeled jam name is not a place command', () => {
    const parsed = parseFeedSlotPack({
      slotJob: 'ürün hero',
      photoUrl: 'https://cdn.example.com/jam.jpg',
      photoRole: 'product_for_sale',
      caption: 'Ayva reçelimiz raflarda. Etikette Ayva Reçeli yazıyor.',
      headline: 'Ayva reçeli',
      shellDirection: 'product_hero',
      evidenceNote: 'Etiket: AYVA REÇELİ',
    });
    expect(parsed.ok).toBe(true);
  });

  it('keeps a venue pack when the sea is in evidence, not a product grade', () => {
    const parsed = parseFeedSlotPack({
      slotJob: 'gün batımı ambiyans',
      photoUrl: 'https://cdn.example.com/pier.jpg',
      photoRole: 'venue',
      caption: 'Bitez iskelesinde durun. Deniz açık.',
      headline: 'Bitez iskelesinde durun',
      shellDirection: 'venue_ambiance',
      evidenceNote: 'İskele, şemsiye, açık deniz ufku',
    });
    expect(parsed.ok).toBe(true);
  });

  it('accepts a luxury English line that shares the terrace claim', () => {
    const parsed = parseFeedSlotPack({
      slotJob: 'terrace sunset',
      photoUrl: 'https://cdn.example.com/terrace.jpg',
      photoRole: 'venue',
      caption: 'The terrace holds the last light. The sea stays open.',
      headline: 'Last light on the terrace',
      shellDirection: 'venue_ambiance',
      evidenceNote: 'Terrace, umbrellas, open sea horizon',
    });
    expect(parsed.ok).toBe(true);
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
    expect(captionOpensWithHeadline(r.caption, r.headline)).toBe(false);
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

  it('shop: mixed-flavor evidence drops early-harvest leftover', () => {
    const r = groundFeedSlotCopy({
      slotJob: 'ürün hero',
      photoRole: 'product_for_sale',
      shellDirection: 'product_hero',
      evidenceNote: 'Karışık çeşnili zeytinyağı şişesi, 500ml etiket',
      caption: 'Erken hasat zeytinyağımız, hem taze hem de zengin bir lezzet sunar.',
      headline: 'Erken hasat zeytinyağımız',
    });
    expect(r.changed).toBe(true);
    expect(r.caption.toLowerCase()).not.toMatch(/erken hasat/);
    expect(r.caption.toLowerCase()).toMatch(/karisik|karışık|cesnili|çeşnili/);
    expect(headlineTakenFromCaption(r.headline, r.caption)).toBe(true);
    expect(captionOpensWithHeadline(r.caption, r.headline)).toBe(false);
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
    expect(captionOpensWithHeadline(r.caption, r.headline)).toBe(false);
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
    expect(r.headline).toMatch(/şömine/i);
    expect(captionOpensWithHeadline(r.caption, r.headline)).toBe(false);
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
    expect(locked.caption).toBe('Natürel sızma. Bal yanında.');
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

  it('beach: does not invent a pier when the still only names the sea', () => {
    const r = groundFeedSlotCopy({
      slotJob: 'çim alan şemsiye şezlong',
      photoRole: 'venue',
      shellDirection: 'venue_ambiance',
      evidenceNote: 'çim, kapalı şemsiye, begonvil, açık deniz ufku',
      caption: 'Göz alıcı bir manzara ile dinlenmek için mükemmel bir yer.',
      headline: 'Deniz manzarası eşliğinde huzur dolu anlar.',
      photoSideText: 'çim, kapalı şemsiye, begonvil, açık deniz ufku',
    });
    expect(r.caption).toBe('Deniz duruyor. Alan açık.');
    expect(r.caption).not.toMatch(/iskele/i);
  });

  it('beach: English brand does not paint Deniz duruyor on a sea card', () => {
    const r = groundFeedSlotCopy({
      slotJob: 'sunset terrace',
      photoRole: 'venue',
      shellDirection: 'venue_ambiance',
      evidenceNote: 'Terrace, umbrellas, open sea horizon',
      caption: 'Check out our weekend events. Umbrellas and lawns wait.',
      headline: 'Check out our weekend events',
      photoSideText: 'terrace umbrellas open sea horizon',
      language: 'English',
    });
    expect(r.caption).toBe('The sea is still. The place is open.');
    expect(r.caption).not.toMatch(/Deniz duruyor|İskele yerinde|The pier holds/);
    expect(r.headline).not.toMatch(/Deniz duruyor/);
  });

  it('shop: English brand does not paint Etiket duruyor', () => {
    const r = groundFeedSlotCopy({
      slotJob: 'product hero',
      photoRole: 'product_for_sale',
      shellDirection: 'product_hero',
      evidenceNote: "Label: 'HONEY'",
      caption: 'Early harvest olive oil from the grove this week.',
      headline: 'Early harvest olive oil from the grove this week.',
      language: 'en',
    });
    expect(r.caption).toMatch(/honey/i);
    expect(r.caption).toMatch(/The label stays/i);
    expect(r.caption).not.toMatch(/Etiket duruyor/);
  });

  it('shop: Turkish brand still paints Etiket duruyor when the label is the only line', () => {
    const r = groundFeedSlotCopy({
      slotJob: 'ürün hero',
      photoRole: 'product_for_sale',
      shellDirection: 'product_hero',
      evidenceNote: "Etiket: 'BAL'",
      caption: 'Erken hasat zeytinyağımız Datça’dan sofralarınıza gelir.',
      headline: 'Erken hasat zeytinyağımız Datça’dan sofralarınıza gelir.',
    });
    expect(r.caption).toMatch(/bal/i);
    expect(r.caption).toMatch(/Etiket duruyor/);
    expect(r.caption).not.toMatch(/The label stays/);
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
    expect(captionOpensWithHeadline(r.caption, r.headline)).toBe(false);
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

  it('shop: generic favorite sentence on an oil still stamps visible', () => {
    const favorite = {
      slotJob: 'müşteri favorisi',
      photoUrl: 'https://cdn.example.com/oil.jpg',
      photoRole: 'product_for_sale' as const,
      caption: 'Müşterilerimizden gelen yorumlara göre bu kavanoz sofrada kalıyor.',
      headline: 'Bu kavanoz sofrada kalıyor',
      shellDirection: 'product_hero' as const,
      evidenceNote: 'Etiket: NATUREL SIZMA ZEYTİNYAĞI',
    };
    expect(validateFeedSlotPack(favorite)).not.toContain('copy_misses_evidence');
    const stamp = stampFeedSlotPackMetadata(favorite);
    expect(stamp.feed_slot_pack_ok).toBe(true);
    expect(isStampedFeedSlotPackVisible(stamp)).toBe(true);
  });

  it('shop: generic assortment copy on a multi-jar still does not hunt labels', () => {
    const pack = {
      slotJob: 'müşteri favorisi',
      photoUrl: 'https://cdn.example.com/honey.jpg',
      photoRole: 'product_for_sale' as const,
      caption: 'Doğal ve katkısız lezzetleri deneyin',
      headline: 'Çam balı',
      shellDirection: 'product_hero' as const,
      evidenceNote:
        "Üç kavanoz bal, etiketlerde 'Çam Balı', 'Kekik Balı', 'Çiçek Balı' yazıyor.",
    };
    expect(validateFeedSlotPack(pack)).toEqual([]);
    const grounded = groundFeedSlotCopy({
      slotJob: pack.slotJob,
      photoRole: pack.photoRole,
      shellDirection: pack.shellDirection,
      evidenceNote: pack.evidenceNote,
      caption: pack.caption,
      headline: pack.headline,
    });
    expect(grounded.caption).toBe(pack.caption);
  });

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

  it('trusts produce stamp even if a later parse would miss evidence', () => {
    expect(isStampedFeedSlotPackVisible({
      feed_slot_pack_ok: true,
      feed_slot_pack: {
        slotJob: 'müşteri favorisi',
        photoUrl: 'https://cdn.example.com/oil.jpg',
        photoRole: 'product_for_sale',
        caption: 'Müşterilerimizden gelen yorumlara göre bu kavanoz sofrada kalıyor.',
        headline: 'Bu kavanoz sofrada kalıyor',
        shellDirection: 'product_hero',
        evidenceNote: 'Etiket: NATUREL SIZMA ZEYTİNYAĞI',
      },
    })).toBe(true);
  });

  it('unstamped metadata stays visible so old cards and reels remain', () => {
    expect(isStampedFeedSlotPackVisible({})).toBe(true);
    expect(isStampedFeedSlotPackVisible(null)).toBe(true);
  });
});

describe('galleryInventoryTextForIdea — shop + beach', () => {
  it('shop: almond paste label survives a long oil-first shelf', () => {
    const gallery: Record<string, { visibleLabelText: string; primarySubject: string }> = {};
    for (let i = 0; i < 20; i += 1) {
      gallery[`oil-${i}`] = {
        visibleLabelText: 'Erken Hasat Zeytinyağı Naturel Sızma Soğuk Sıkım 2000 ml',
        primarySubject: 'olive_oil',
      };
    }
    gallery.almond = {
      visibleLabelText: 'Badem Ezmesi Marzipan 215 g',
      primarySubject: 'almond_paste',
    };
    const raw = galleryInventoryText(gallery);
    expect(raw.length).toBeGreaterThan(GALLERY_INVENTORY_CLAIM_BUDGET);
    expect(raw.slice(0, GALLERY_INVENTORY_CLAIM_BUDGET)).not.toMatch(/Badem Ezmesi/);
    const ranked = galleryInventoryTextForIdea(
      gallery,
      'Müşterilerimizin en sevdiği lezzetlerden biri: badem ezmesi!',
    );
    expect(ranked.length).toBeLessThanOrEqual(GALLERY_INVENTORY_CLAIM_BUDGET);
    expect(ranked).toMatch(/Badem Ezmesi/);
  });

  it('beach: spritz label stays in budget ahead of generic venue tags', () => {
    const gallery: Record<string, { visibleLabelText: string; primarySubject: string }> = {};
    for (let i = 0; i < 20; i += 1) {
      gallery[`lawn-${i}`] = {
        visibleLabelText: 'çim şemsiye şezlong begonvil açık deniz ufku',
        primarySubject: 'venue',
      };
    }
    gallery.bar = {
      visibleLabelText: 'YULA SPRITZ',
      primarySubject: 'cocktail',
    };
    const ranked = galleryInventoryTextForIdea(
      gallery,
      'Terasta Yula spritz, gün batımında kalın.',
    );
    expect(ranked).toMatch(/YULA SPRITZ/);
  });

  it('restaurant: garden tags are not shelf labels', () => {
    const ranked = galleryShelfLabelTextForIdea(
      {
        garden: {
          visibleLabelText: '',
          primarySubject: 'garden',
          contentTags: ['garden', 'table', 'turkish_breakfast'],
        },
      },
      'Serpme köy kahvaltımızla bahçede buluşun',
    );
    expect(ranked).toBe('');
  });

  it('shop: çam balı label ranks ahead of oil-only tags', () => {
    const gallery: Record<string, { visibleLabelText: string; primarySubject: string }> = {};
    for (let i = 0; i < 20; i += 1) {
      gallery[`oil-${i}`] = {
        visibleLabelText: 'Erken Hasat Zeytinyağı Naturel Sızma',
        primarySubject: 'olive_oil',
      };
    }
    gallery.honey = {
      visibleLabelText: 'ÇAM BALI PINE HONEY',
      primarySubject: 'honey',
    };
    const ranked = galleryShelfLabelTextForIdea(
      gallery,
      'Müşterilerimiz çam balını çok seviyor',
    );
    expect(ranked).toMatch(/ÇAM BALI/);
  });
});
