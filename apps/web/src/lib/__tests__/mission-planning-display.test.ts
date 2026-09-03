import { describe, expect, it } from 'vitest';
import { collectUniqueMissionIdeationIdeas } from '@/lib/parse-ideation-summary';
import {
  buildMissionPlanningDisplayIdeas,
  buildMissionProductionIdeas,
} from '@/lib/mission-production-plan';
import {
  resolveIdeationHeadline,
  resolveIdeationOverlayHeadline,
} from '@/lib/production-idea-parse';
import { countPlanningNodeResults } from '@/lib/mission-pipeline-transparency';

const singleIdeaNode = {
  node_key: 'weekly_content_ideation',
  task_type: 'content_ideation',
  status: 'completed',
  output_summary: JSON.stringify([
    {
      concept_title: 'Yeni Ürünlerimiz Geldi!',
      caption_draft: 'Yerel lezzetler seni bekliyor.',
      content_type: 'instagram_post',
    },
  ]),
};

describe('resolveIdeationHeadline', () => {
  it('prefers concept_title over shorter caption fragment in headline', () => {
    expect(resolveIdeationHeadline({
      concept_title: 'Dive into OUR SUNSET RITUAL!!',
      headline: 'Join us for a taste',
    })).toBe('Dive into OUR SUNSET RITUAL!!');
  });
});

describe('resolveIdeationOverlayHeadline', () => {
  it('prefers marketing headline over planning concept_title', () => {
    expect(resolveIdeationOverlayHeadline({
      concept_title: 'Yaz sezonu',
      headline: 'Sıcak gecelerde buluşalım',
    })).toBe('Sıcak gecelerde buluşalım');
  });

  it('skips label-style canva headline in favor of root marketing line', () => {
    expect(resolveIdeationOverlayHeadline({
      concept_title: 'DJ gecesi story',
      headline: 'Yıldızların altında dans',
      canva_field_copy: { headline: 'DJ gecesi story' },
    })).toBe('Yıldızların altında dans');
  });

  it('uses canva marketing headline when publishable', () => {
    expect(resolveIdeationOverlayHeadline({
      concept_title: 'Haftalık vitrin',
      headline: 'Haftalık vitrin',
      canva_field_copy: { headline: 'Doğal lezzetleri keşfet' },
    })).toBe('Doğal lezzetleri keşfet');
  });

  it('content_calendar items use quoted tagline as on-canvas overlay', () => {
    expect(resolveIdeationOverlayHeadline({
      source_track: 'calendar',
      source_node: 'content_calendar',
      concept_title: 'Erken Hasat Vitrini',
      headline: 'Erken Hasat Vitrini',
      tagline: '"Datça\'nın özgün tatları burada."',
      canva_field_copy: { headline: 'Caption-derived wrong line' },
    })).toBe("Datça'nın özgün tatları burada.");
  });

  it('calendar_enriched ideation prefers tagline over event_name canva', () => {
    expect(resolveIdeationOverlayHeadline({
      calendar_enriched: true,
      concept_title: 'Sunset Ritual',
      tagline: 'Golden hour on the terrace',
      canva_field_copy: { headline: 'Sunset Ritual' },
    })).toBe('Golden hour on the terrace');
  });
});

describe('buildMissionPlanningDisplayIdeas', () => {
  it('shows unique ideation ideas without 16-slot format backfill', () => {
    const display = buildMissionPlanningDisplayIdeas({ nodes: [singleIdeaNode] });
    const production = buildMissionProductionIdeas({ nodes: [singleIdeaNode] });

    expect(display).toHaveLength(1);
    expect(display[0]?.concept_title).toBe('Yeni Ürünlerimiz Geldi!');
    expect(production).toHaveLength(1);
    expect(production[0]?.concept_title).toBe('Yeni Ürünlerimiz Geldi!');
  });

  it('dedupes repeated headlines across nodes', () => {
    const nodes = [
      singleIdeaNode,
      {
        ...singleIdeaNode,
        node_key: 'post_ideation',
        output_summary: JSON.stringify([
          {
            headline: 'Yeni Ürünlerimiz Geldi!',
            caption_draft: 'Duplicate headline should merge.',
            content_type: 'instagram_post',
          },
          {
            headline: 'Üretim Sürecimizi Keşfedin!',
            caption_draft: 'Emeğin ardındaki hikaye.',
            content_type: 'instagram_reel',
          },
        ]),
      },
    ];

    const unique = collectUniqueMissionIdeationIdeas(nodes);
    expect(unique).toHaveLength(2);
    expect(unique.map((i) => i.headline ?? i.concept_title)).toEqual([
      'Yeni Ürünlerimiz Geldi!',
      'Üretim Sürecimizi Keşfedin!',
    ]);
  });

  // A mission graph may carry several ideation nodes, each briefed with the whole
  // slot plan, so each answers with a full weekly package in its own words. One
  // live Karaman week had three and enqueued 44 jobs across 17 slots.
  it('keeps one idea per catalog slot when several nodes answer the same plan', () => {
    const node = (key: string, ideas: Array<Record<string, unknown>>) => ({
      node_key: key,
      task_type: 'content_ideation',
      status: 'completed',
      output_summary: JSON.stringify(ideas),
    });
    const nodes = [
      node('in_store_promotion', [
        {
          headline: 'Erken hasat zeytinyağı rafta',
          caption_draft: 'Bu yılın ilk sıkımı geldi.',
          content_type: 'instagram_story',
          catalog_slot_key: 'local_products_shop_new_arrival_story',
        },
      ]),
      node('social_media_campaign', [
        {
          headline: 'Taze ürünler tezgâhta',
          caption_draft: 'Yeni gelenleri kaçırmayın.',
          content_type: 'instagram_story',
          catalog_slot_key: 'local_products_shop_new_arrival_story',
        },
        {
          headline: 'Bu sabah çiftlikteydik',
          caption_draft: 'Üreticimizin bahçesinden.',
          content_type: 'instagram_story',
          catalog_slot_key: 'local_products_shop_farm_visit_story',
        },
      ]),
    ];

    const unique = collectUniqueMissionIdeationIdeas(nodes);

    expect(unique.map((i) => i.catalog_slot_key)).toEqual([
      'local_products_shop_new_arrival_story',
      'local_products_shop_farm_visit_story',
    ]);
    expect(unique[0]?.headline).toBe('Erken hasat zeytinyağı rafta');
  });

  it('leaves a restaurant plan with one idea per slot untouched', () => {
    const nodes = [{
      node_key: 'content_ideation',
      task_type: 'content_ideation',
      status: 'completed',
      output_summary: JSON.stringify([
        {
          headline: 'Masanız hazır, buyurun',
          caption_draft: 'Akşam için yeriniz ayrıldı.',
          content_type: 'instagram_story',
          catalog_slot_key: 'restaurant_cafe_table_ready_story',
        },
        {
          headline: 'Sonbahar menüsü başladı',
          caption_draft: 'Mevsimin tabakları listede.',
          content_type: 'instagram_story',
          catalog_slot_key: 'restaurant_cafe_new_menu_story',
        },
        {
          headline: 'Misafirimiz ne demiş',
          caption_draft: 'Bu haftanın yorumu.',
          content_type: 'instagram_post',
          catalog_slot_key: 'restaurant_cafe_customer_review_post',
        },
      ]),
    }];

    expect(collectUniqueMissionIdeationIdeas(nodes)).toHaveLength(3);
  });

  it('keeps ideas that claim no catalog slot', () => {
    const nodes = [{
      node_key: 'content_ideation',
      task_type: 'content_ideation',
      status: 'completed',
      output_summary: JSON.stringify([
        { headline: 'Serbest fikir bir', caption_draft: 'Katalogla eşleşmeyen.', content_type: 'instagram_post' },
        { headline: 'Serbest fikir iki', caption_draft: 'Bu da eşleşmiyor.', content_type: 'instagram_post' },
      ]),
    }];

    expect(collectUniqueMissionIdeationIdeas(nodes)).toHaveLength(2);
  });
});

describe('countPlanningNodeResults — content_strategy', () => {
  it('counts one strategy document, not pillar_mix rows', () => {
    const strategyNode = {
      task_type: 'content_strategy',
      status: 'completed',
      output_payload: {
        weekly_theme: 'Exciting Summer Nights at Sarnıç Beach',
        mission_brief: 'Highlight seafood menu and DJ nights.',
        pillar_mix: [
          { pillar: 'product/service value' },
          { pillar: 'event_announcement' },
          { pillar: 'social proof' },
          { pillar: 'conversion CTA' },
        ],
      },
    };

    expect(countPlanningNodeResults(strategyNode)).toBe(1);
  });
});
