import { describe, expect, it } from 'vitest';
import {
  buildSlotLookDirective,
  resolveSlotLookKind,
  slotLookPrefersGraphicCompose,
} from '@/lib/slot-look-directive';
import { buildDesignedPostDesignCardPrompt } from '@/lib/fal-designer-production';

describe('resolveSlotLookKind', () => {
  it('maps DJ / event slots to nightlife_event (beach_club)', () => {
    expect(resolveSlotLookKind({
      announcementType: 'event_announcement',
      catalogSlotKey: 'beach_club_dj_night_teaser_post',
      headline: 'DJ Night',
      caption: 'Cumartesi gece canlı set',
      sector: 'beach_club',
    })).toBe('nightlife_event');
  });

  it('maps sunset / daily_story to golden_hour', () => {
    expect(resolveSlotLookKind({
      announcementType: 'daily_story',
      catalogSlotKey: 'beach_club_sunset_ambiance_post',
      headline: 'Gün batımı',
      caption: 'Altın saat teras',
      sector: 'beach_club',
    })).toBe('golden_hour');
  });

  it('maps offer / daybed to offer_booking (retail-adjacent)', () => {
    expect(resolveSlotLookKind({
      announcementType: 'campaign_offer',
      catalogSlotKey: 'beach_club_daybed_offer_post',
      headline: 'Şezlong rezervasyonu',
      sector: 'beach_club',
    })).toBe('offer_booking');
    expect(resolveSlotLookKind({
      announcementType: 'product_highlight',
      headline: 'Yeni ürün',
      caption: 'jar pack sku',
      sector: 'local_products_shop',
    })).toBe('product_hero');
  });
});

describe('buildSlotLookDirective', () => {
  it('DJ and sunset directives are visibly different (silhouette test)', () => {
    const dj = buildSlotLookDirective({
      announcementType: 'event_announcement',
      catalogSlotKey: 'beach_club_dj_night_teaser_post',
      headline: 'DJ Night',
      brandName: 'Beach Club',
      sector: 'beach_club',
      brandColors: { primary: '#212529', accent: '#ffc107' },
    });
    const sunset = buildSlotLookDirective({
      announcementType: 'daily_story',
      catalogSlotKey: 'beach_club_sunset_ambiance_post',
      headline: 'Gün batımı',
      brandName: 'Beach Club',
      sector: 'beach_club',
      brandColors: { primary: '#212529', accent: '#ffc107' },
    });
    expect(dj).toContain('nightlife');
    expect(dj).toContain('silhouette test');
    expect(dj).toMatch(/DJ|after-dark|neon/i);
    expect(dj).toContain('#212529');
    expect(dj).toContain('#ffc107');
    expect(dj).toContain('BRAND PALETTE LOCK');
    expect(dj).not.toContain('amber/magenta/navy');
    expect(sunset).toContain('golden-hour');
    expect(sunset).toContain('#ffc107');
    expect(dj).not.toEqual(sunset);
    expect(dj).toContain('must not resemble a sunset');
    expect(sunset).toContain('must not resemble a DJ');
    // Graphic paint-panel compose retired — all looks are photo-led.
    expect(slotLookPrefersGraphicCompose('nightlife_event')).toBe(false);
    expect(slotLookPrefersGraphicCompose('golden_hour')).toBe(false);
    expect(slotLookPrefersGraphicCompose('offer_booking')).toBe(false);
  });
});

describe('design-card slot look wiring', () => {
  it('injects distinct SLOT LOOK for DJ vs sunset in protected prompt', () => {
    const dj = buildDesignedPostDesignCardPrompt({
      vibe: 'warm_coastal',
      headline: 'DJ Night',
      subtitle: 'Cumartesi',
      caption: 'Cumartesi gece — canlı set',
      brandColors: { primary: '#E85A3C', accent: '#1B3A5C' },
      brandName: 'Sarnıç Beach',
      sector: 'beach_club',
      aspectRatio: '4:5',
      designIntensityLevel: 'bold_editorial',
      announcementType: 'event_announcement',
      catalogSlotKey: 'beach_club_dj_night_teaser_post',
    });
    const sunset = buildDesignedPostDesignCardPrompt({
      vibe: 'warm_coastal',
      headline: 'Gün batımı',
      subtitle: 'Altın saat',
      caption: 'Altın saat teras',
      brandColors: { primary: '#E85A3C', accent: '#1B3A5C' },
      brandName: 'Sarnıç Beach',
      sector: 'beach_club',
      aspectRatio: '4:5',
      designIntensityLevel: 'balanced',
      announcementType: 'daily_story',
      catalogSlotKey: 'beach_club_sunset_ambiance_post',
    });
    expect(dj).toContain('SLOT LOOK');
    expect(sunset).toContain('SLOT LOOK');
    expect(dj).toMatch(/Kind=nightlife_event/);
    expect(sunset).toMatch(/Kind=golden_hour/);
    expect(dj).toContain('BRAND COLOR LOCK');
    expect(dj).toContain('#E85A3C');
    expect(dj).toContain('#1B3A5C');
    expect(dj).toContain('COMPOSE ORDER (MANDATORY photo-led)');
    expect(dj).toMatch(/nightlife|impact|condensed/i);
    expect(sunset).toContain('COMPOSE ORDER (MANDATORY photo-led)');
  });
});
