import { describe, expect, it } from 'vitest';
import { stampFeedSlotPackMetadata } from '@/lib/feed-slot-pack';
import {
  filterFeedPublishableArtifacts,
  isArtifactFeedPublishable,
} from '@/lib/weekly-publish-package';
import type { OutputArtifact } from '@/types';

const SHOP_PACK = {
  slotJob: 'ürün hero',
  photoUrl: 'https://cdn.example.com/oil.jpg',
  photoRole: 'product_for_sale' as const,
  caption: 'Yağın en sakin hali. Natürel sızma.',
  headline: 'Yağın en sakin hali',
  shellDirection: 'product_hero' as const,
  evidenceNote: 'Etiket: NATUREL SIZMA ZEYTİNYAĞI',
};

const BEACH_PACK = {
  slotJob: 'gün batımı ambiyans',
  photoUrl: 'https://cdn.example.com/lawn.jpg',
  photoRole: 'venue' as const,
  caption: 'Deniz duruyor. Kenarda kalın.',
  headline: 'Deniz duruyor',
  shellDirection: 'venue_ambiance' as const,
  evidenceNote: 'çim, kapalı şemsiye, açık deniz ufku',
};

function designedStill(id: string, meta: Record<string, unknown>): OutputArtifact {
  const url = '/api/media?key=tenant/image/x.jpg';
  return {
    id,
    agentRunId: 'run-1',
    type: 'image',
    title: id,
    mimeType: 'image/jpeg',
    status: 'pending_review',
    contentUrl: url,
    createdAt: '2026-09-06T12:00:00.000Z',
    content: JSON.stringify({
      kind: 'instagram_post',
      imageUrl: url,
      mission_id: 'mission-1',
      source: 'auto-produce',
    }),
    metadata: JSON.stringify({
      pipeline: 'fal_design',
      production_role: 'fal_designed_post',
      fal_designer_produced: true,
      fal_design_engine: 'gpt_image_designed',
      grafiker_pass: true,
      grafiker_score: 9,
      agency_produced: true,
      auto_produced: true,
      source: 'auto-produce',
      mission_id: 'mission-1',
      gallery_match_score: 70,
      ...meta,
    }),
  } as OutputArtifact;
}

function reelWithoutPack(id: string): OutputArtifact {
  const url = '/api/media?key=tenant/video/x.mp4';
  return {
    id,
    agentRunId: 'run-1',
    type: 'image',
    title: id,
    mimeType: 'video/mp4',
    status: 'pending_review',
    contentUrl: url,
    createdAt: '2026-09-06T12:00:00.000Z',
    content: JSON.stringify({
      kind: 'instagram_reel',
      videoUrl: url,
      mission_id: 'mission-1',
      source: 'auto-produce',
    }),
    metadata: JSON.stringify({
      pipeline: 'fal_reel',
      production_role: 'organic_reel',
      fal_designer_produced: true,
      auto_produced: true,
      source: 'auto-produce',
      mission_id: 'mission-1',
    }),
  } as OutputArtifact;
}

describe('Faz 4 — vitrine yalnız tam paket', () => {
  it('shop: full pack stays on the feed; half pack hides', () => {
    const full = designedStill('shop-full', stampFeedSlotPackMetadata(SHOP_PACK));
    const half = designedStill('shop-half', { feed_slot_pack_ok: false });
    expect(isArtifactFeedPublishable(full)).toBe(true);
    expect(isArtifactFeedPublishable(half)).toBe(false);
    expect(filterFeedPublishableArtifacts([full, half]).map((a) => a.id)).toEqual(['shop-full']);
  });

  it('beach: full pack stays on the feed; half pack hides', () => {
    const full = designedStill('beach-full', stampFeedSlotPackMetadata(BEACH_PACK));
    const half = designedStill('beach-half', stampFeedSlotPackMetadata({
      slotJob: 'çim alan şemsiye şezlong',
      photoUrl: 'https://cdn.example.com/basket.jpg',
      photoRole: 'product_for_sale',
      caption: 'Datça’nın lezzetlerini keşfedin.',
      headline: 'Datça’nın lezzetlerini keşfedin',
      shellDirection: 'product_hero',
      evidenceNote: 'Etiket: SIZMA',
    }));
    expect(isArtifactFeedPublishable(full)).toBe(true);
    expect(isArtifactFeedPublishable(half)).toBe(false);
  });

  it('reel without a pack stays visible; unstamped still is grandfathered', () => {
    const reel = reelWithoutPack('reel-1');
    const oldStill = designedStill('old-still', {});
    expect(isArtifactFeedPublishable(reel)).toBe(true);
    expect(isArtifactFeedPublishable(oldStill)).toBe(true);
  });
});
