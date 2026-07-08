import { describe, expect, it } from 'vitest';
import { getProductionDedupeKey } from '@/lib/production-bundle';
import type { OutputArtifact } from '@/types';

function artifact(partial: Partial<OutputArtifact> & { metadata?: Record<string, unknown> }): OutputArtifact {
  const meta = partial.metadata ?? {};
  return {
    id: partial.id ?? 'a1',
    title: partial.title ?? 'Yaz Kokteyl Gecesi',
    content: JSON.stringify({
      kind: meta.kind ?? 'instagram_reel',
      headline: 'Yaz Kokteyl Gecesi',
      ...(partial.content ? JSON.parse(String(partial.content)) : {}),
    }),
    contentUrl: partial.contentUrl ?? 'https://example.com/1.png',
    status: partial.status ?? 'pending_review',
    createdAt: partial.createdAt ?? new Date().toISOString(),
    metadata: {
      mission_id: 'b2bcdec1-074b-42b3-92a0-3017c729eb9c',
      idea_index: 4,
      production_role: 'organic_reel',
      pipeline: 'runway_reel',
      ...meta,
    },
  } as unknown as OutputArtifact;
}

describe('getProductionDedupeKey', () => {
  it('keeps distinct manifest slots at same idea_index separate', () => {
    const reel = artifact({ id: 'r1', metadata: { production_role: 'organic_reel', idea_index: 4 } });
    const carousel = artifact({
      id: 'c1',
      metadata: {
        production_role: 'organic_carousel',
        idea_index: 4,
        kind: 'instagram_carousel',
      },
    });
    expect(getProductionDedupeKey(reel)).not.toBe(getProductionDedupeKey(carousel));
  });
});
