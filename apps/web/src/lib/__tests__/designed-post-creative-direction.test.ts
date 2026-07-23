import { describe, expect, it } from 'vitest';
import {
  formatDesignedPostCreativeDirectionBlock,
  resolveDesignedPostCreativeDirection,
} from '../designed-post-creative-direction';

describe('designed-post-creative-direction', () => {
  it('builds Canva-style creative direction for beach_club event', () => {
    const cd = resolveDesignedPostCreativeDirection({
      workspaceId: 'ws-beach',
      brandName: 'Sarnıç Beach',
      businessType: 'beach_club',
      headline: 'DJ Night',
      caption: 'Cumartesi gece',
      slotLook: 'nightlife_event',
      announcementType: 'event_announcement',
      brandColors: { primary: '#212529', accent: '#ffc107' },
    });
    expect(cd.premiumLevel).toBe('high');
    expect(cd.templateFamily).toBe('event_announcement');
    expect(cd.typographyDirection.toLowerCase()).toMatch(/condensed|impact|display/);
    expect(cd.brandPersonality.length).toBeGreaterThan(0);
  });

  it('builds organic artisan direction for local products', () => {
    const cd = resolveDesignedPostCreativeDirection({
      workspaceId: 'ws-shop',
      brandName: 'Karaman Datça',
      businessType: 'local_products_shop',
      headline: 'Bayram Sepeti',
      slotLook: 'product_hero',
      brandColors: { primary: '#5C6B3C', accent: '#C4784A' },
    });
    expect(cd.templateFamily).toBe('organic_artisan');
    const block = formatDesignedPostCreativeDirectionBlock(cd);
    expect(block).toContain('CREATIVE DIRECTION');
    expect(block).toContain('organic_artisan');
    expect(block).toContain('FORBIDDEN');
  });
});
