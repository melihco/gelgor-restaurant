import { describe, expect, it } from 'vitest';
import {
  briefGoalLabel,
  buildBriefDesignDirectives,
  buildBriefDetailCaptionTail,
  buildBriefDetailSubline,
  resolveBriefCta,
  sanitizeBriefDetails,
  suggestBriefGoal,
} from '../brief-design-direction';
import {
  applyBriefOwnerChoices,
  buildBriefProduceIdeas,
  clampBriefCarouselSlides,
  resolveBriefIdeaCount,
} from '../brief-produce-plan';
import type { ParsedIdea } from '@/app/api/auto-produce/caption-publish-resolver';

describe('"+" owner choices (goal / look / facts)', () => {
  it('suggests a goal from the owner prompt across sectors', () => {
    // beach_club
    expect(suggestBriefGoal('Cuma DJ Night')).toBe('event');
    expect(suggestBriefGoal('Daybed %20 indirim')).toBe('promo');
    // local_products_shop
    expect(suggestBriefGoal('Yeni reçel çeşidimiz rafta')).toBe('new_item');
    expect(suggestBriefGoal('Mutfağa aşçı arıyoruz')).toBe('hiring');
    expect(suggestBriefGoal('ab')).toBeNull();
    expect(briefGoalLabel('promo')).toBe('Kampanya');
  });

  it('sanitizes facts and renders one short verbatim subline', () => {
    const details = sanitizeBriefDetails({ date: ' 12 Eylül ', time: '21:00', price: '₺350', location: 'İskele', cta: 'Rezervasyon', junk: 'x' });
    expect(details).toEqual({ date: '12 Eylül', time: '21:00', price: '₺350', location: 'İskele', cta: 'Rezervasyon', link: undefined });
    expect(buildBriefDetailSubline(details)).toBe('12 Eylül · 21:00 · ₺350 · İskele');
    expect(buildBriefDetailCaptionTail(details)).toContain('📅 12 Eylül · 21:00');
    expect(buildBriefDetailCaptionTail(details)).toContain('💰 ₺350');
    expect(sanitizeBriefDetails(null)).toEqual({});
  });

  it('CTA falls back to the goal default, explicit wins', () => {
    expect(resolveBriefCta('event', undefined)).toBe('Rezervasyon');
    expect(resolveBriefCta('event', 'Bilet al')).toBe('Bilet al');
    expect(resolveBriefCta(null, undefined)).toBeUndefined();
  });

  it('directives layer look + purpose + verbatim facts, never a template lock', () => {
    const out = buildBriefDesignDirectives({
      goal: 'promo',
      designDirection: 'bold',
      details: { price: '%20', cta: 'Fırsatı yakala' },
    });
    expect(out.some((d) => d.startsWith('DESIGN DIRECTION: bold'))).toBe(true);
    expect(out.some((d) => d.startsWith('PURPOSE: offer'))).toBe(true);
    expect(out).toContain('ON-CANVAS FACTS (verbatim, small secondary line): "%20"');
    expect(out).toContain('ON-CANVAS CTA (verbatim, one short button or line): "Fırsatı yakala"');
    expect(out.join(' ')).not.toMatch(/template|şablon/i);
  });

  it('folds choices into the idea: caption tail, visual directives, subtitle/cta', () => {
    const base: ParsedIdea = {
      headline: 'Dolunay Gecesi',
      caption_draft: 'Ay ışığında set.',
      visual_direction: 'moonlit deck',
    };
    const idea = applyBriefOwnerChoices(base, {
      goal: 'event',
      designDirection: 'luxury',
      details: { date: '12 Eylül', time: '21:00' },
    });
    expect(idea.caption_draft).toBe('Ay ışığında set.\n\n📅 12 Eylül · 21:00');
    expect(idea.visual_direction).toMatch(/^moonlit deck\nDESIGN DIRECTION: luxury/);
    expect(idea.canva_field_copy?.subtitle).toBe('12 Eylül · 21:00');
    expect(idea.cta).toBe('Rezervasyon');
    // no choices → untouched
    expect(applyBriefOwnerChoices(base, undefined)).toBe(base);
  });

  it('carousel brief = one idea, count becomes the slide target (2–6)', () => {
    expect(resolveBriefIdeaCount('carousel', '5')).toBe(1);
    expect(resolveBriefIdeaCount('post', '3')).toBe(3);
    expect(clampBriefCarouselSlides('1')).toBe(2);
    expect(clampBriefCarouselSlides('9')).toBe(6);
    expect(clampBriefCarouselSlides(undefined)).toBe(4);

    // beach_club style brief
    const beach = buildBriefProduceIdeas({
      title: 'Hafta sonu programı',
      extraDirection: '',
      outputType: 'carousel',
      count: 5,
      photoUrls: [],
      bcd: null,
    });
    expect(beach).toHaveLength(1);
    expect(beach[0]!.content_type).toBe('carousel');
    expect(beach[0]!.format).toBe('carousel');
    expect(beach[0]!.carousel_slide_target).toBe(5);

    // local_products_shop brief with owner photos → slides come from them
    const shop = buildBriefProduceIdeas({
      title: 'Ürün çeşitlerimiz',
      extraDirection: '',
      outputType: 'carousel',
      count: 3,
      photoUrls: ['https://x/a.jpg', 'https://x/b.jpg', 'https://x/c.jpg'],
      bcd: null,
    });
    expect(shop[0]!.force_attached_photos).toBe(true);
    expect(shop[0]!.attached_photo_urls).toHaveLength(3);
    expect(shop[0]!.carousel_slide_target).toBe(3);
  });

  it('buildBriefProduceIdeas carries choices without touching the locked headline', () => {
    const ideas = buildBriefProduceIdeas({
      title: 'Yeni Bal Rafta',
      extraDirection: '',
      outputType: 'post',
      count: 1,
      photoUrls: [],
      bcd: null,
      lockUserHeadline: true,
      choices: { goal: 'new_item', designDirection: 'warm', details: { price: '₺250' } },
    });
    expect(ideas[0]!.headline).toBe('Yeni Bal Rafta');
    expect(ideas[0]!.canva_field_copy?.title).toBe('Yeni Bal Rafta');
    expect(ideas[0]!.canva_field_copy?.subtitle).toBe('₺250');
    expect(ideas[0]!.visual_direction).toContain('PURPOSE: new product');
    expect(ideas[0]!.caption_draft).toContain('💰 ₺250');
  });
});
