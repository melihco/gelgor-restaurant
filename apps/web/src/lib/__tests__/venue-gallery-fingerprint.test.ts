import { describe, it, expect } from 'vitest';
import {
  buildVenueGalleryFingerprint,
  buildVenueFingerprintPromptBlock,
  shouldApplyVenueGalleryFingerprint,
} from '@/lib/venue-gallery-fingerprint';
import type { GalleryPhotoMeta } from '@/lib/gallery-photo-matcher';

describe('venue-gallery-fingerprint', () => {
  const gardenRestaurantGallery: Record<string, GalleryPhotoMeta> = {
    'https://cdn.example/a.jpg': {
      contentTags: ['garden', 'breakfast', 'outdoor'],
      description: 'Serpme kahvaltı bahçede mandalina ağaçları altında',
      mood: 'warm morning',
    },
    'https://cdn.example/b.jpg': {
      contentTags: ['terrace', 'dining'],
      description: 'Açık hava bahçe masaları yeşil çim',
    },
    'https://cdn.example/c.jpg': {
      contentTags: ['food', 'plate'],
      description: 'Tabak yakın çekim kahvaltı',
    },
  };

  it('skips non-venue sectors', () => {
    expect(shouldApplyVenueGalleryFingerprint('agency_services')).toBe(false);
    expect(buildVenueGalleryFingerprint(gardenRestaurantGallery, 'agency_services')).toBeNull();
  });

  it('detects garden venue without sea from gallery analysis', () => {
    const fp = buildVenueGalleryFingerprint(gardenRestaurantGallery, 'restaurant');
    expect(fp).not.toBeNull();
    expect(fp!.present.some((p) => p.id === 'garden')).toBe(true);
    expect(fp!.present.some((p) => p.id === 'sea_view')).toBe(false);
    expect(fp!.absentGuards).toContain('sea_view');
    expect(fp!.negativeGuards.join(' ')).toMatch(/ocean|seafront|waterfront/i);
  });

  it('prompt block forbids absent environments for beach club with sea photos', () => {
    const beachGallery: Record<string, GalleryPhotoMeta> = {
      u1: {
        contentTags: ['beach', 'sea', 'sunset'],
        description: 'Deniz manzaralı teras gün batımı',
      },
      u2: {
        contentTags: ['pool', 'lounge'],
        description: 'Havuz kenarı şezlong',
      },
      u3: {
        contentTags: ['cocktail', 'bar'],
        description: 'Gece bar kokteyl',
      },
    };
    const fp = buildVenueGalleryFingerprint(beachGallery, 'beach_club');
    const block = buildVenueFingerprintPromptBlock(fp);
    expect(block).toContain('VENUE GALLERY FINGERPRINT');
    expect(block).toMatch(/sea view/i);
    expect(fp!.absentGuards).not.toContain('sea_view');
  });

  it('returns empty prompt block when confidence is low', () => {
    const fp = buildVenueGalleryFingerprint(
      { u1: { description: 'single photo' } },
      'restaurant',
    );
    expect(buildVenueFingerprintPromptBlock(fp)).toBe('');
  });
});
