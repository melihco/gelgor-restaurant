import { describe, expect, it } from 'vitest';
import {
  parseStudioFeedPack,
  STUDIO_VERSION,
  type SlotTicket,
  type StudioFeedPack,
} from '@smartagency/contracts';
import { acceptBoundPack, bindTicket } from '@/studio/bind';
import { studioForbidsSatoriEscape, shouldSkipPaintRematch } from '@/studio/paint';
import { produceSlot } from '@/studio/produce-slot';
import { needsLookVisionResolve } from '@/studio/look-urls';
import { produceFromQueueJob } from '@/studio/produce-from-job';
import { shouldUseLocalTypography } from '@/lib/local-typography-renderer';

function shopHeroPack(): StudioFeedPack {
  return {
    slotJob: 'ürün hero',
    photoUrl: 'https://cdn.example.com/oil.jpg',
    photoRole: 'product_for_sale',
    caption: 'Sızma zeytinyağımız raflarda. Sofraya bir damla yeter.',
    headline: 'Sızma zeytinyağımız raflarda',
    shellDirection: 'product_hero',
    evidenceNote: 'Etiket: NATUREL SIZMA ZEYTİNYAĞI',
  };
}

function beachVenuePack(): StudioFeedPack {
  return {
    slotJob: 'gün batımı ambiyans',
    photoUrl: 'https://cdn.example.com/sunset.jpg',
    photoRole: 'venue',
    caption: 'Gün batımında iskelede yeriniz hazır. Akşam burada başlar.',
    headline: 'Gün batımında iskelede yeriniz hazır',
    shellDirection: 'venue_ambiance',
    evidenceNote: 'Gün batımı iskele, yazı yok, masa dekoru değil',
  };
}

function ticket(partial: Partial<SlotTicket> & Pick<SlotTicket, 'slotKey' | 'format' | 'slotRole' | 'pipeline'>): SlotTicket {
  return {
    studioVersion: STUDIO_VERSION,
    workspaceId: '11111111-1111-1111-1111-111111111111',
    missionId: '22222222-2222-2222-2222-222222222222',
    idea: { purpose: 'weekly_feed' },
    ...partial,
  };
}

describe('studio golden — local_products_shop', () => {
  it('binds a labeled bottle hero and gates ready when designed + grafiker 9', async () => {
    const pack = shopHeroPack();
    expect(parseStudioFeedPack(pack).ok).toBe(true);
    expect(acceptBoundPack(pack).ok).toBe(true);

    const result = await produceSlot(
      ticket({
        slotKey: '0:fal_designed_post',
        format: 'post',
        slotRole: 'fal_designed_post',
        pipeline: 'fal_design',
        pack,
      }),
      {
        paint: async () => ({
          engine: 'gpt_image_designed',
          imageUrl: 'https://cdn.example.com/designed-oil.jpg',
          satoriEscapeUsed: false,
          grafikerScore: 9,
          typographyValid: true,
        }),
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.disposition).toBe('ready');
      expect(result.gate.blockFeed).toBe(false);
      expect(result.paint.satoriEscapeUsed).toBe(false);
    }
  });

  it('bind-fails an incomplete farm-story headline (kesik satır)', () => {
    const cut = acceptBoundPack({
      ...shopHeroPack(),
      slotJob: 'çiftlik ziyareti',
      photoRole: 'venue',
      shellDirection: 'event',
      headline: 'Zeytinyağımızın üretim sürecine',
      caption: 'Zeytinyağımızın üretim sürecine gelin bakın.',
      evidenceNote: 'Zeytin bahçesi, ağaç sırası',
    });
    expect(cut.ok).toBe(false);
    if (!cut.ok) expect(cut.codes).toContain('incomplete_headline');
  });

  it('gate-withholds grafiker 3 — floor stays 4', async () => {
    const result = await produceSlot(
      ticket({
        slotKey: '1:fal_designed_post',
        format: 'post',
        slotRole: 'fal_designed_post',
        pipeline: 'fal_design',
        pack: shopHeroPack(),
      }),
      {
        paint: async () => ({
          engine: 'gpt_image_designed',
          imageUrl: 'https://cdn.example.com/weak.jpg',
          grafikerScore: 3,
          typographyValid: true,
        }),
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe('gate');
      expect(result.gate?.blockCode).toBe('quality_hard_block');
      expect(result.disposition).toBe('withheld');
    }
  });
});

describe('studio golden — beach_club', () => {
  it('binds a sunset venue story and gates ready', async () => {
    const pack = beachVenuePack();
    expect(acceptBoundPack(pack).ok).toBe(true);
    const result = await produceSlot(
      ticket({
        slotKey: '0:campaign_story_motion',
        format: 'story',
        slotRole: 'campaign_story_motion',
        pipeline: 'fal_story',
        pack,
      }),
      {
        paint: async () => ({
          engine: 'gpt_image_designed',
          imageUrl: 'https://cdn.example.com/designed-sunset.jpg',
          grafikerScore: 8,
          typographyValid: true,
        }),
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.gate.blockFeed).toBe(false);
  });

  it('bind-fails selling a lawn umbrella as product_hero', () => {
    const rejected = bindTicket(ticket({
      slotKey: '1:fal_designed_post',
      format: 'post',
      slotRole: 'fal_designed_post',
      pipeline: 'fal_design',
      pack: {
        slotJob: 'şemsiye çim ambiyans',
        photoUrl: 'https://cdn.example.com/umbrella.jpg',
        photoRole: 'product_for_sale',
        caption: 'Şemsiyelerimiz sizi bekliyor. Çimde yerinizi alın.',
        headline: 'Şemsiyelerimiz sizi bekliyor',
        shellDirection: 'product_hero',
        evidenceNote: 'Çim, şemsiye, yazı yok',
      },
    }));
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.codes.some((c) => c === 'place_cannot_sell' || c === 'product_needs_identity')).toBe(true);
    }
  });

  it('reel without video fails at motion — still pack does not leak to Akış', async () => {
    const result = await produceSlot(
      ticket({
        slotKey: '2:fal_reel_motion',
        format: 'reel',
        slotRole: 'fal_reel_motion',
        pipeline: 'fal_reel',
        pack: beachVenuePack(),
      }),
      {
        paint: async () => ({
          engine: 'gpt_image_designed',
          imageUrl: 'https://cdn.example.com/reel-cover.jpg',
          grafikerScore: 8,
        }),
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.stage).toBe('motion');
  });
});

describe('studio paint policy', () => {
  it('forbids Satori once the pack is locked — both sectors', () => {
    expect(studioForbidsSatoriEscape({ packLocked: true })).toBe(true);
    expect(studioForbidsSatoriEscape({ punchlineLockSource: 'feed_slot_pack' })).toBe(true);
    expect(studioForbidsSatoriEscape({})).toBe(false);
    process.env.LOCAL_TYPOGRAPHY_ENABLED = 'true';
    expect(shouldUseLocalTypography('fal_designed_post', 'fal_design', null, {
      forbidSatoriEscape: true,
    })).toBe(false);
    expect(shouldUseLocalTypography('campaign_story_motion', 'fal_story', null, {
      forbidSatoriEscape: true,
    })).toBe(false);
  });

  it('skips rematch after bind', () => {
    expect(shouldSkipPaintRematch(true)).toBe(true);
    expect(shouldSkipPaintRematch(false)).toBe(false);
  });

  it('rejects a Satori escape adapter even with a valid pack', async () => {
    const result = await produceSlot(
      ticket({
        slotKey: '0:fal_designed_post',
        format: 'post',
        slotRole: 'fal_designed_post',
        pipeline: 'fal_design',
        pack: shopHeroPack(),
      }),
      {
        paint: async () => ({
          engine: 'satori_local',
          imageUrl: 'https://cdn.example.com/satori.jpg',
          satoriEscapeUsed: true,
        }),
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.stage).toBe('paint');
  });
});

describe('studio look URL resolve', () => {
  it('marks internal media paths for resolve — not only /api/media', () => {
    expect(needsLookVisionResolve('/api/media?key=abc')).toBe(true);
    expect(needsLookVisionResolve('/uploads/oil.jpg')).toBe(true);
    expect(needsLookVisionResolve('https://cdn.example.com/oil.jpg')).toBe(false);
    expect(needsLookVisionResolve('data:image/jpeg;base64,abc')).toBe(false);
  });
});

describe('studio worker job envelope', () => {
  it('rejects a tenant envelope mismatch without calling produce', async () => {
    const result = await produceFromQueueJob({
      autoProduceBody: { workspaceId: 'other', missionId: 'm1', ideas: [] },
      factoryJobs: [],
      missionId: 'm1',
      workspaceId: '11111111-1111-1111-1111-111111111111',
      callbackUrl: 'http://127.0.0.1/callback',
    });
    expect(result.status).toBe(400);
    expect(String(result.body.error)).toMatch(/tenant envelope/);
  });
});
