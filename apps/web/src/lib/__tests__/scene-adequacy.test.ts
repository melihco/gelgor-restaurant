import { describe, it, expect } from 'vitest';
import {
  extractSceneRequirements,
  evaluatePhotoSceneAdequacy,
  repickGalleryForSceneAdequacy,
} from '@/lib/scene-adequacy';
import { buildVenueGalleryFingerprint } from '@/lib/venue-gallery-fingerprint';
import type { GalleryPhotoMeta } from '@/lib/gallery-photo-matcher';

const gardenMeta: GalleryPhotoMeta = {
  contentTags: ['garden', 'breakfast'],
  description: 'Bahçede serpme kahvaltı mandalina ağaçları',
  mood: 'morning',
};

const foodMeta: GalleryPhotoMeta = {
  contentTags: ['food', 'plate'],
  description: 'Yakın çekim tabak',
};

describe('scene-adequacy', () => {
  it('extracts night and crowd requirements from Turkish caption', () => {
    const reqs = extractSceneRequirements({
      headline: 'Cumartesi gece yoğunluğu',
      caption: 'Hafta sonu akşam yoğun servis',
    });
    expect(reqs.map((r) => r.id)).toEqual(expect.arrayContaining(['night', 'crowd']));
  });

  it('scores breakfast photo low for night crowd brief', () => {
    const reqs = extractSceneRequirements({ headline: 'Cumartesi gece yoğunluğu' });
    const adequacy = evaluatePhotoSceneAdequacy(gardenMeta, reqs);
    expect(adequacy.ratio).toBeLessThan(0.5);
    expect(adequacy.missing).toContain('night');
  });

  it('re-picks a better gallery photo for scene needs when available', () => {
    const galleryMeta: Record<string, GalleryPhotoMeta> = {
      breakfast: gardenMeta,
      plate: foodMeta,
      night: {
        contentTags: ['terrace', 'night', 'dining'],
        description: 'Gece açık hava bahçe masaları misafirler',
        mood: 'evening',
      },
    };
    const photos = ['breakfast', 'plate', 'night'];
    const fingerprint = buildVenueGalleryFingerprint(galleryMeta, 'restaurant');
    const result = repickGalleryForSceneAdequacy({
      currentUrl: 'breakfast',
      caption: 'Cumartesi gece yoğunluğu',
      headline: 'Cumartesi gece yoğunluğu',
      galleryPhotos: photos,
      galleryMeta,
      fingerprint,
    });
    expect(result).not.toBeNull();
    expect(result!.pick.url).toBe('night');
    expect(result!.adequacy.ratio).toBeGreaterThan(result!.previousAdequacy.ratio);
  });

  it('flags sea caption conflict when gallery has no sea evidence', () => {
    const galleryMeta: Record<string, GalleryPhotoMeta> = {
      g1: gardenMeta,
      g2: { ...gardenMeta, description: 'Bahçe masaları' },
      g3: { ...gardenMeta, description: 'Açık hava yeşil alan' },
    };
    const fingerprint = buildVenueGalleryFingerprint(galleryMeta, 'restaurant');
    const reqs = extractSceneRequirements({ caption: 'Deniz kenarı akşam yemeği' });
    const adequacy = evaluatePhotoSceneAdequacy(gardenMeta, reqs, fingerprint);
    expect(adequacy.conflicts.some((c) => c.includes('sea'))).toBe(true);
  });
});
