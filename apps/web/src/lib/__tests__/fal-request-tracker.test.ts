import { describe, expect, it } from 'vitest';
import {
  artifactContainsMediaUrl,
  beginFalRequestSlot,
  clearFalRequestSlot,
  getCapturedFalRequests,
  markFalRequestCompleted,
  recordFalRequestSubmitted,
} from '../fal-request-tracker';

describe('fal-request-tracker', () => {
  it('captures requests per slot buffer', () => {
    beginFalRequestSlot();
    recordFalRequestSubmitted({
      requestId: 'req-1',
      model: 'ideogram/v4',
      kind: 'still',
    });
    markFalRequestCompleted('req-1', 'https://fal.media/files/abc.png');
    const rows = getCapturedFalRequests();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('completed');
    expect(rows[0]?.outputUrl).toContain('fal.media');
    clearFalRequestSlot();
    expect(getCapturedFalRequests()).toEqual([]);
  });

  it('matches artifact media URLs including fal_requests metadata', () => {
    const hit = artifactContainsMediaUrl(
      {
        contentUrl: 'https://cdn.example.com/a.png',
        metadata: {
          fal_requests: [{ outputUrl: 'https://fal.media/files/video.mp4?token=1' }],
        },
      },
      'https://fal.media/files/video.mp4',
    );
    expect(hit).toBe(true);
  });
});
