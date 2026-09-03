/**
 * Every visual review that fetched a rendered frame got nothing back, because
 * renders are persisted as our own relative `/api/media?key=…` paths and the
 * external fetch rejects anything that is not an absolute URL. Of 269 live
 * frames only 8 carried a review flag and all 8 read "not reviewed".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const resolveExternallyAccessibleUrl = vi.fn();

vi.mock('@/lib/media-url', () => ({ resolveExternallyAccessibleUrl }));

const R2_MEDIA_PATH = '/api/media?key=0466adb9%2Fimage%2F2026-07-21%2F9466dc70';
const PRESIGNED = 'https://r2.example.com/0466adb9/image/2026-07-21/9466dc70?sig=abc';

/** Import fresh each time so the module-level fetch stub is honoured. */
async function load() {
  return import('../external-image-fetch');
}

function stubFetch(status: number, bytes = 4096) {
  const impl = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => new Uint8Array(bytes).fill(7).buffer,
  }));
  vi.stubGlobal('fetch', impl);
  return impl;
}

afterEach(() => {
  vi.unstubAllGlobals();
  resolveExternallyAccessibleUrl.mockReset();
});

describe('fetchReviewableFrameBuffer', () => {
  it('resolves a relative media path before fetching it', async () => {
    resolveExternallyAccessibleUrl.mockResolvedValue(PRESIGNED);
    const fetchImpl = stubFetch(200);
    const { fetchReviewableFrameBuffer } = await load();

    const buf = await fetchReviewableFrameBuffer(R2_MEDIA_PATH);

    expect(resolveExternallyAccessibleUrl).toHaveBeenCalledWith(R2_MEDIA_PATH);
    expect(buf?.length).toBe(4096);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(PRESIGNED);
  });

  it('passes an absolute URL straight through', async () => {
    const fetchImpl = stubFetch(200);
    const { fetchReviewableFrameBuffer } = await load();

    const buf = await fetchReviewableFrameBuffer('https://cdn.example.com/frame.jpg');

    expect(resolveExternallyAccessibleUrl).not.toHaveBeenCalled();
    expect(buf?.length).toBe(4096);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://cdn.example.com/frame.jpg');
  });

  it('returns null when the path cannot be made reachable', async () => {
    resolveExternallyAccessibleUrl.mockResolvedValue('');
    stubFetch(200);
    const { fetchReviewableFrameBuffer } = await load();

    expect(await fetchReviewableFrameBuffer(R2_MEDIA_PATH)).toBeNull();
  });

  it('returns null on an empty url without calling out', async () => {
    const fetchImpl = stubFetch(200);
    const { fetchReviewableFrameBuffer } = await load();

    expect(await fetchReviewableFrameBuffer('   ')).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('still rejects a relative path the plain external fetch is given', async () => {
    // The old behaviour, kept deliberately: callers that already resolved their
    // URL must not silently gain a second resolution pass.
    stubFetch(200);
    const { fetchExternalImageBuffer } = await load();

    expect(await fetchExternalImageBuffer(R2_MEDIA_PATH)).toBeNull();
  });
});
