import { describe, expect, it } from 'vitest';
import {
  BRIEF_MAX_REVISION_ROUNDS,
  buildBriefRequestSnapshot,
  buildBriefRevisionProduceBody,
  canReviseBriefArtifact,
  readBriefRequestSnapshot,
  resolveArtifactDesignDirection,
  revisionWantsNewPhoto,
} from '../brief-revision';
import { applyBriefOwnerChoices, buildBriefProduceIdeas, stampBriefRequestSnapshot } from '../brief-produce-plan';

const snapshot = buildBriefRequestSnapshot({
  title: 'Cuma DJ Night',
  direction: 'enerjik, gece',
  outputType: 'post',
  count: 2,
  goal: 'event',
  designDirection: 'bold',
  details: { date: '12 Eylül', time: '22:00' },
  lockUserHeadline: true,
  photoUrls: [],
});

const producedMeta = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  source: 'new_brief',
  ad_hoc_brief: true,
  brief_request: snapshot,
  selected_gallery_url: 'https://cdn/x/deck.jpg',
  reference_photo_url: 'https://cdn/x/deck-enhanced.jpg',
  ...extra,
});

describe('"+" revise loop', () => {
  it('snapshot round-trips through metadata and rides on every idea', () => {
    expect(readBriefRequestSnapshot({ brief_request: snapshot })).toEqual(snapshot);
    expect(readBriefRequestSnapshot({ brief_request: { title: '', outputType: 'post' } })).toBeNull();
    expect(readBriefRequestSnapshot({ brief_request: { title: 'x', outputType: 'pdf' } })).toBeNull();

    const ideas = stampBriefRequestSnapshot(
      buildBriefProduceIdeas({ title: 'Bal', extraDirection: '', outputType: 'post', count: 2, photoUrls: [], bcd: null, variantCount: 2 }),
      snapshot,
    );
    expect(ideas).toHaveLength(4);
    expect(ideas.every((i) => (i.brief_request as { title: string }).title === 'Cuma DJ Night')).toBe(true);
  });

  it('only "+" cards with a snapshot and rounds left can be revised', () => {
    expect(canReviseBriefArtifact(producedMeta())).toBe(true);
    expect(canReviseBriefArtifact(producedMeta({ brief_revision_round: 1 }))).toBe(true);
    expect(canReviseBriefArtifact(producedMeta({ brief_revision_round: BRIEF_MAX_REVISION_ROUNDS }))).toBe(false);
    expect(canReviseBriefArtifact({ source: 'auto-produce', brief_request: snapshot })).toBe(false);
    expect(canReviseBriefArtifact({ source: 'new_brief' })).toBe(false);
  });

  it('builds the next request: same idea + look, one design, source photo pinned, round +1', () => {
    const body = buildBriefRevisionProduceBody({
      workspaceId: 'ws',
      artifactId: 'art-1',
      metadata: producedMeta({ brief_variant_label: 'Minimal' }),
      note: '  Başlığı   büyüt ',
    });
    expect(body).not.toBeNull();
    expect(body!.title).toBe('Cuma DJ Night');
    expect(body!.count).toBe(1);
    expect(body!.variants).toBe(1);
    expect(body!.designDirection).toBe('minimal'); // the look the owner is revising, not the original pick
    expect(body!.goal).toBe('event');
    expect(body!.lockUserHeadline).toBe(true);
    expect(body!.photoUrls).toEqual(['https://cdn/x/deck.jpg']);
    expect(body!.revision).toEqual({ of: 'art-1', round: 1, note: 'Başlığı büyüt' });
    expect(body!.background).toBe(true);
  });

  it('"fotoğrafı değiştir" releases the photo pin; rounds cap at the limit', () => {
    expect(revisionWantsNewPhoto('Fotoğrafı değiştir')).toBe(true);
    expect(revisionWantsNewPhoto('başka bir görsel olsun')).toBe(true);
    expect(revisionWantsNewPhoto('daha koyu zemin')).toBe(false);

    const swap = buildBriefRevisionProduceBody({ workspaceId: 'ws', artifactId: 'a', metadata: producedMeta(), note: 'Fotoğrafı değiştir' });
    expect(swap!.photoUrls).toEqual([]);

    const second = buildBriefRevisionProduceBody({ workspaceId: 'ws', artifactId: 'a', metadata: producedMeta({ brief_revision_round: 1 }), note: 'sade' });
    expect(second!.revision.round).toBe(2);
    const third = buildBriefRevisionProduceBody({ workspaceId: 'ws', artifactId: 'a', metadata: producedMeta({ brief_revision_round: 2 }), note: 'sade' });
    expect(third).toBeNull();
    expect(buildBriefRevisionProduceBody({ workspaceId: 'ws', artifactId: 'a', metadata: producedMeta(), note: '   ' })).toBeNull();
  });

  it('carousel revisions keep the slide count and never pin a single photo', () => {
    const carouselSnap = buildBriefRequestSnapshot({ title: 'Çeşitlerimiz', direction: '', outputType: 'carousel', count: 5 });
    const body = buildBriefRevisionProduceBody({
      workspaceId: 'ws', artifactId: 'a', metadata: producedMeta({ brief_request: carouselSnap }), note: 'kapak daha sade',
    });
    expect(body!.count).toBe(5);
    expect(body!.photoUrls).toEqual([]);
  });

  it('the note becomes a binding painter directive and is stamped on the idea', () => {
    const idea = applyBriefOwnerChoices(
      { headline: 'Cuma DJ Night', visual_direction: 'neon deck' },
      { designDirection: 'bold', revision: { of: 'art-1', round: 1, note: 'Başlığı büyüt' } },
    );
    const lines = String(idea.visual_direction).split('\n');
    expect(lines[0]).toBe('neon deck');
    expect(lines.at(-1)).toMatch(/^OWNER REVISION \(round 1.*"Başlığı büyüt"$/);
    expect(idea.brief_revision_of).toBe('art-1');
    expect(idea.brief_revision_round).toBe(1);
    expect(idea.brief_revision_note).toBe('Başlığı büyüt');
    expect(resolveArtifactDesignDirection({ brief_variant_label: 'Lüks' }, 'brand')).toBe('luxury');
    expect(resolveArtifactDesignDirection({}, 'warm')).toBe('warm');
  });
});
