import { describe, expect, it } from 'vitest';
import {
  buildSlotCopyFitDirective,
  fitSlotPunchline,
  resolveSlotSampleCopy,
} from '../slot-sample-copy';
import { buildDesignPresetFromCatalogSlot } from '../catalog-design-template-presets';
import type { ProductionSlotDefinition } from '../production-slot-catalog';

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function mockSlot(partial: Partial<ProductionSlotDefinition> & { slot_key: string }): ProductionSlotDefinition {
  return {
    slot_key: partial.slot_key,
    sector_id: partial.sector_id ?? 'beach_club',
    label_tr: partial.label_tr ?? 'Slot',
    label_en: partial.label_en ?? 'Slot',
    format: partial.format ?? 'post',
    design_template_type: partial.design_template_type ?? 'venue_showcase',
    pipeline: partial.pipeline ?? 'fal_designed_post',
    slot_role: partial.slot_role ?? 'fal_designed_post',
    is_optional: partial.is_optional ?? false,
    default_enabled: partial.default_enabled ?? true,
    default_priority: partial.default_priority ?? 10,
    match_signals: partial.match_signals ?? {},
    ...partial,
  } as ProductionSlotDefinition;
}

describe('slot-sample-copy', () => {
  it('fits punchlines to word/char budget', () => {
    expect(fitSlotPunchline('"Harika bir deneyim"', 3, 28)).toBe('Harika bir deneyim');
    expect(wordCount(fitSlotPunchline('Sınırlı süre — kaçırma sakın', 3, 24))).toBeLessThanOrEqual(3);
  });

  it('maps social_proof to short punchline — not long quote', () => {
    const copy = resolveSlotSampleCopy({
      catalogSlotKey: 'beach_club_guest_social_proof_post',
      templateType: 'social_proof',
    });
    expect(copy.headline).not.toMatch(/"/);
    expect(copy.headline.toLowerCase()).not.toContain('deneyim');
    expect(wordCount(copy.headline)).toBeLessThanOrEqual(3);
    expect(copy.headline.length).toBeLessThanOrEqual(28);
    expect(copy.subtitle).toBeTruthy();
    expect(wordCount(copy.subtitle!)).toBeLessThanOrEqual(3);
  });

  it('maps aerial / venue slots to short atmosphere lines', () => {
    const aerial = resolveSlotSampleCopy({
      catalogSlotKey: 'beach_club_aerial_venue_post',
      templateType: 'venue_showcase',
    });
    expect(aerial.headline).toBe('Atmosfer');
    expect(aerial.subtitle).toBeUndefined();

    const venue = resolveSlotSampleCopy({
      catalogSlotKey: 'beach_club_venue_ambiance_post',
      templateType: 'venue_showcase',
    });
    expect(wordCount(venue.headline)).toBeLessThanOrEqual(3);
  });

  it('suppresses subtitle when showSubline is false', () => {
    const copy = resolveSlotSampleCopy({
      catalogSlotKey: 'beach_club_guest_social_proof_post',
      templateType: 'social_proof',
      showSubline: false,
    });
    expect(copy.headline).toBeTruthy();
    expect(copy.subtitle).toBeUndefined();
  });

  it('buildSlotCopyFitDirective mentions no-overflow and subline off', () => {
    const withSub = buildSlotCopyFitDirective({ headline: 'Harika', subtitle: 'Misafir' });
    expect(withSub).toContain('COPY FIT');
    expect(withSub).toMatch(/never clip|overflow/i);

    const noSub = buildSlotCopyFitDirective({ headline: 'Atmosfer' });
    expect(noSub).toMatch(/SUBLINE: OFF/i);
  });

  it('catalog preset builder returns ≤3-word headlines for beach club slots', () => {
    const social = buildDesignPresetFromCatalogSlot(mockSlot({
      slot_key: 'beach_club_guest_social_proof_post',
      label_tr: 'Misafir sosyal kanıt',
      design_template_type: 'social_proof',
    }));
    expect(wordCount(social.sampleHeadline)).toBeLessThanOrEqual(3);
    expect(social.sampleHeadline).not.toMatch(/"/);

    const aerial = buildDesignPresetFromCatalogSlot(mockSlot({
      slot_key: 'beach_club_havadan_mekan_post',
      label_tr: 'Havadan mekan',
      design_template_type: 'venue_showcase',
    }));
    expect(wordCount(aerial.sampleHeadline)).toBeLessThanOrEqual(3);
    expect(aerial.sampleHeadline.length).toBeLessThanOrEqual(28);
  });

  it('restaurant_cafe slots get food-specific punchlines — not Özel Kampanya / Daybed', () => {
    const chef = resolveSlotSampleCopy({
      catalogSlotKey: 'restaurant_cafe_chef_special_post',
      templateType: 'campaign_announcement',
      slotLabel: 'Şef özel',
      sector: 'restaurant_cafe',
    });
    expect(chef.headline).toMatch(/Şef|Özel/i);
    expect(chef.headline).not.toBe('Özel Kampanya');

    const signature = resolveSlotSampleCopy({
      catalogSlotKey: 'restaurant_cafe_signature_dish_post',
      templateType: 'menu_highlight',
      slotLabel: 'İmza tabak',
      sector: 'restaurant_cafe',
    });
    expect(signature.headline).toMatch(/İmza|Tabak|Sofrada/i);
    expect(signature.headline).not.toBe('Öne Çıkan');

    const booking = resolveSlotSampleCopy({
      catalogSlotKey: 'restaurant_cafe_weekend_booking_story',
      templateType: 'campaign_announcement',
      format: 'story',
      sector: 'restaurant_cafe',
    });
    expect(booking.headline.toLowerCase()).not.toContain('daybed');
    expect(booking.headline).toMatch(/Hafta|Rezerv/i);

    const brunch = buildDesignPresetFromCatalogSlot(mockSlot({
      slot_key: 'restaurant_cafe_brunch_offer_post',
      sector_id: 'restaurant_cafe',
      label_tr: 'Brunch teklifi',
      design_template_type: 'campaign_announcement',
    }));
    expect(brunch.sampleHeadline).not.toBe('Özel Kampanya');
    expect(wordCount(brunch.sampleHeadline)).toBeLessThanOrEqual(3);
  });

  it('beach daybed still maps to Daybed', () => {
    const copy = resolveSlotSampleCopy({
      catalogSlotKey: 'beach_club_daybed_booking_post',
      templateType: 'campaign_announcement',
      sector: 'beach_club',
    });
    expect(copy.headline).toBe('Daybed');
  });
});
