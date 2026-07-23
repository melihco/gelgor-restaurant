import { describe, expect, it } from 'vitest';
import { resolveCampaignConcept } from '../campaign-concepts';
import { resolveAgencyTemplate } from '../select-template';
import { runAgencyCreativeDirectorPipeline } from '../run-pipeline';
import { AGENCY_TEMPLATE_CATALOG } from '../agency-templates';

describe('agency creative director pipeline', () => {
  it('catalog includes the four operator templates', () => {
    const ids = AGENCY_TEMPLATE_CATALOG.map((t) => t.id);
    expect(ids).toContain('diagonal_luxury_story');
    expect(ids).toContain('editorial_luxury_post');
    expect(ids).toContain('restaurant_food_story');
    expect(ids).toContain('cocktail_campaign');
  });

  it('maps DJ night → nightlife campaign + story template', () => {
    const campaign = resolveCampaignConcept({
      headline: 'DJ Night',
      caption: 'Cumartesi gece canlı set',
      announcementType: 'event_announcement',
      catalogSlotKey: 'beach_club_dj_night_teaser_post',
      businessType: 'beach_club',
    });
    expect(campaign.id).toBe('nightlife_event');

    const template = resolveAgencyTemplate({
      campaign,
      format: 'story',
      headline: 'DJ Night',
      caption: 'Cumartesi gece',
      catalogSlotKey: 'beach_club_dj_night_teaser_post',
    });
    expect(['diagonal_luxury_story', 'restaurant_food_story']).toContain(template.id);
  });

  it('maps seafood menu → seafood/brunch campaign + editorial or cocktail post', () => {
    const pipeline = runAgencyCreativeDirectorPipeline({
      format: 'post',
      brandName: 'Yula Bodrum',
      brandColors: { primary: '#f4a261', accent: '#264653' },
      vibe: 'editorial_serif',
      location: 'Bodrum',
      headline: 'Deniz Mahsulleri',
      subheadline: 'Hafta sonu menü',
      cta: 'DM',
      caption: 'deniz mahsulleri menüsü seafood',
      announcementType: 'campaign_offer',
      catalogSlotKey: 'beach_club_cocktail_menu_post',
      businessType: 'beach_club',
      headingFont: 'Playfair Display',
    });
    expect(['seafood_menu', 'signature_cocktails', 'weekend_brunch']).toContain(
      pipeline.campaign.id,
    );
    expect(pipeline.prompt).toContain('AGENCY CREATIVE DIRECTOR');
    expect(pipeline.prompt).toContain('ON-CANVAS TEXT CONTRACT');
    expect(pipeline.prompt).toContain('MANDATORY GRAPHIC CRAFT');
    expect(pipeline.prompt).toContain('FONT LOCK');
    expect(pipeline.geometricShellId).toBe('circle_portrait_lockup');
    expect(pipeline.prompt).toContain('circle_portrait_lockup');
    expect(pipeline.prompt).toContain('Deniz Mahsulleri');
    expect(pipeline.prompt).toContain('#f4a261');
    expect(pipeline.prompt).toContain('Playfair Display');
    expect(pipeline.prompt).toContain('beach_club_cocktail_menu_post');
  });

  it('maps product harvest to product campaign + editorial luxury post', () => {
    const pipeline = runAgencyCreativeDirectorPipeline({
      format: 'post',
      brandName: 'Karaman Datça',
      brandColors: { primary: '#5C6B3C', accent: '#C4784A' },
      vibe: 'handwritten',
      headline: 'Bayram Sepeti',
      caption: 'Datça bademi harvest ürün',
      catalogSlotKey: 'local_products_shop_harvest_post',
      businessType: 'local_products_shop',
    });
    expect(pipeline.campaign.id).toBe('product_harvest');
    expect(pipeline.template.id).toBe('editorial_luxury_post');
    expect(pipeline.geometricShellId).toBeTruthy();
    expect(pipeline.prompt).toMatch(/packaging|label|editorial|craft/i);
  });

  it('locks cocktail campaign for wine/rosé captions', () => {
    const campaign = resolveCampaignConcept({
      headline: 'Rosé Hour',
      caption: 'şarap cocktail terrace',
    });
    expect(campaign.id).toBe('signature_cocktails');
    const template = resolveAgencyTemplate({
      campaign,
      format: 'post',
      caption: 'rosé wine crystal',
    });
    expect(template.id).toBe('cocktail_campaign');
  });
});
