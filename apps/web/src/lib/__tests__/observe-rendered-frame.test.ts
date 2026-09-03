import { describe, expect, it } from 'vitest';
import { observeRenderedFrame } from '@/lib/grafiker-quality';

describe('observeRenderedFrame', () => {
  it('does not invent a review when the frame cannot be fetched (beach_club story)', async () => {
    const out = await observeRenderedFrame('', 'Gün batımı', 'story');
    expect(out.reviewed).toBe(false);
    expect(out.score).toBeNull();
  });

  it('does not invent a review for an unreadable local-products post URL', async () => {
    const out = await observeRenderedFrame('/api/media?key=missing-local-product', 'Zeytinyağı');
    expect(out.reviewed).toBe(false);
    expect(out.score).toBeNull();
  });
});
