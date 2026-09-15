import { describe, expect, it } from 'vitest';
import type { OutputArtifact } from '@/types';
import {
  briefVariantSiblingsToDismiss,
  briefVariantTabLabel,
  collapseBriefVariantsForFeed,
  groupPendingBriefVariants,
  readBriefVariantTag,
} from '../brief-variants';
import { buildBriefProduceIdeas, resolveBriefExpectedArtifacts, resolveBriefVariantCount } from '../brief-produce-plan';
import { pickAlternateDesignDirections } from '../brief-design-direction';

function art(id: string, status: OutputArtifact['status'], meta: Record<string, unknown>): OutputArtifact {
  return {
    id,
    agentRunId: 'run',
    type: 'image',
    title: id,
    content: '',
    mimeType: 'image/jpeg',
    status,
    metadata: meta,
    createdAt: '2026-09-15T00:00:00Z',
  };
}

describe('"+" pick-one variants', () => {
  it('plan fans one idea into N looks with a shared group and distinct labels', () => {
    expect(resolveBriefVariantCount('post', 2)).toBe(2);
    expect(resolveBriefVariantCount('story', '9')).toBe(3);
    expect(resolveBriefVariantCount('reel', 3)).toBe(1);
    expect(resolveBriefVariantCount('carousel', 3)).toBe(1);
    expect(resolveBriefExpectedArtifacts('post', 2, 2)).toBe(4);
    expect(resolveBriefExpectedArtifacts('carousel', 5, 3)).toBe(1);

    expect(pickAlternateDesignDirections('brand', 2)).toEqual(['editorial', 'bold']);
    expect(pickAlternateDesignDirections('luxury', 1)).toEqual(['warm']);
    expect(pickAlternateDesignDirections('bold', 5)).not.toContain('bold');

    const ideas = buildBriefProduceIdeas({
      title: 'Cuma DJ Night',
      extraDirection: '',
      outputType: 'post',
      count: 1,
      photoUrls: [],
      bcd: null,
      choices: { goal: 'event', designDirection: 'minimal' },
      variantCount: 3,
      variantGroupSeed: 'job-1',
    });
    expect(ideas).toHaveLength(3);
    expect(new Set(ideas.map((i) => i.brief_variant_group))).toEqual(new Set(['job-1:0']));
    expect(ideas.map((i) => i.brief_variant_index)).toEqual([0, 1, 2]);
    expect(ideas.map((i) => i.brief_variant_label)).toEqual(['Minimal', 'Cesur', 'Sıcak']);
    expect(ideas[0]!.visual_direction).toContain('DESIGN DIRECTION: minimal');
    expect(ideas[1]!.visual_direction).toContain('DESIGN DIRECTION: bold');
    expect(ideas[1]!.visual_direction).not.toContain('DESIGN DIRECTION: minimal');
    // headline / goal identical across looks
    expect(new Set(ideas.map((i) => i.headline)).size).toBe(1);
    expect(ideas.every((i) => i.visual_direction?.includes('PURPOSE: event'))).toBe(true);
  });

  it('single variant leaves ideas untagged and free of helper fields', () => {
    const ideas = buildBriefProduceIdeas({
      title: 'Bal',
      extraDirection: '',
      outputType: 'post',
      count: 2,
      photoUrls: [],
      bcd: null,
      variantCount: 1,
    });
    expect(ideas).toHaveLength(2);
    expect(ideas[0]!.brief_variant_group).toBeUndefined();
    expect('raw' in ideas[0]!).toBe(false);
  });

  it('feed groups pending siblings, collapses to the lead, and dismisses the rest on pick', () => {
    const a = art('a', 'pending_review', { brief_variant_group: 'g1', brief_variant_index: 1, brief_variant_count: 2, brief_variant_label: 'Cesur' });
    const b = art('b', 'pending_review', { brief_variant_group: 'g1', brief_variant_index: 0, brief_variant_count: 2, brief_variant_label: 'Marka çizgisi' });
    const lone = art('c', 'pending_review', { brief_variant_group: 'g2', brief_variant_index: 0, brief_variant_count: 2 });
    const approved = art('d', 'approved', { brief_variant_group: 'g2', brief_variant_index: 1, brief_variant_count: 2 });
    const plain = art('e', 'pending_review', { source: 'auto-produce' });

    const groups = groupPendingBriefVariants([a, b, lone, approved, plain]);
    expect([...groups.keys()]).toEqual(['g1']);
    expect(groups.get('g1')!.map((x) => x.id)).toEqual(['b', 'a']);

    const items = collapseBriefVariantsForFeed([a, b, lone, approved, plain], groups);
    expect(items.map((x) => x.id)).toEqual(['b', 'c', 'd', 'e']);

    expect(briefVariantSiblingsToDismiss(groups.get('g1')!, 'a')).toEqual(['b']);
    expect(briefVariantTabLabel(b)).toBe('A · Marka çizgisi');
    expect(briefVariantTabLabel(lone)).toBe('A');
    expect(readBriefVariantTag({})).toBeNull();
  });
});
