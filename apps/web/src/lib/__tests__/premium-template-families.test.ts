import { describe, expect, it } from 'vitest';
import {
  preferredArchetypeForFamily,
  resolvePremiumTemplateFamily,
  PREMIUM_TEMPLATE_FAMILIES,
} from '../premium-template-families';

describe('premium-template-families', () => {
  it('covers all eight premium families', () => {
    expect(Object.keys(PREMIUM_TEMPLATE_FAMILIES)).toHaveLength(8);
  });

  it('maps nightlife / beach_club DJ to event_announcement', () => {
    const family = resolvePremiumTemplateFamily({
      businessType: 'beach_club',
      announcementType: 'event_announcement',
      headline: 'DJ Night',
      caption: 'Cumartesi gece set',
    });
    expect(family.id).toBe('event_announcement');
    expect(family.preferredArchetypes).toContain('neon_night_promo');
  });

  it('maps local_products_shop harvest to organic_artisan', () => {
    const family = resolvePremiumTemplateFamily({
      businessType: 'local_products_shop',
      slotLook: 'product_hero',
      catalogSlotKey: 'local_products_shop_harvest_post',
      headline: 'Bayram Sepeti',
    });
    expect(family.id).toBe('organic_artisan');
  });

  it('maps seafood menu offer to mediterranean or menu family', () => {
    const family = resolvePremiumTemplateFamily({
      businessType: 'beach_club',
      announcementType: 'daily_story',
      headline: 'Deniz Mahsulleri',
      caption: 'Hafta sonu menü seafood',
    });
    expect(['menu_food_highlight', 'mediterranean_lifestyle', 'luxury_hospitality']).toContain(
      family.id,
    );
  });

  it('rotates preferred archetype away from recent when possible', () => {
    const a = preferredArchetypeForFamily('luxury_hospitality', ['cinematic_full_bleed']);
    expect(a).not.toBe('cinematic_full_bleed');
    expect(PREMIUM_TEMPLATE_FAMILIES.luxury_hospitality.preferredArchetypes).toContain(a);
  });
});
