import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  __resetDesignTemplateJobStatusMemoryForTests,
  setDesignTemplateJobStatus,
} from '@/lib/design-template-job-status';

const afterMock = vi.fn((fn: () => void | Promise<void>) => {
  // Do not run background generation — zero-cost verification.
  void fn;
});

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return {
    ...actual,
    after: (fn: () => void | Promise<void>) => afterMock(fn),
  };
});

vi.mock('@/lib/crew-proxy', () => ({
  fetchCrewBackendJson: vi.fn(async (path: string) => {
    if (path.includes('/gallery-analysis')) {
      return { ok: true, status: 200, data: { photo_a: {} }, error: null };
    }
    if (path.includes('/brand-context/')) {
      return {
        ok: true,
        status: 200,
        data: {
          business_name: 'Test Beach',
          business_type: 'beach_club',
          reference_image_urls: [
            'https://cdn.example.com/a.jpg',
            'https://cdn.example.com/b.jpg',
            'https://cdn.example.com/c.jpg',
          ],
        },
        error: null,
      };
    }
    return { ok: false, status: 404, data: null, error: 'not_mocked' };
  }),
}));

vi.mock('@/app/api/auto-produce/gallery-context', () => ({
  fetchGalleryContext: vi.fn(async () => ({
    hasPhotos: true,
    photos: [
      'https://cdn.example.com/a.jpg',
      'https://cdn.example.com/b.jpg',
      'https://cdn.example.com/c.jpg',
    ],
    meta: {},
  })),
}));

describe('POST /api/brand-context/.../generate-design-templates (background)', () => {
  beforeEach(() => {
    afterMock.mockClear();
    __resetDesignTemplateJobStatusMemoryForTests();
  });

  it('queues background job with 202 and does not run generation in test', async () => {
    const { POST } = await import('../route');
    const workspaceId = '327db521-ede2-48e0-8f06-4146ee458c50';

    const res = await POST(
      new NextRequest(`http://localhost/api/brand-context/${workspaceId}/generate-design-templates`, {
        method: 'POST',
        body: JSON.stringify({ locale: 'tr', background: true }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ workspaceId }) },
    );

    expect(res.status).toBe(202);
    const data = await res.json() as {
      ok: boolean;
      queued: boolean;
      background: boolean;
      jobId: string;
      reused: boolean;
    };
    expect(data.ok).toBe(true);
    expect(data.queued).toBe(true);
    expect(data.background).toBe(true);
    expect(data.reused).toBe(false);
    expect(data.jobId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(afterMock).toHaveBeenCalledTimes(1);
  });

  it('returns existing jobId when workspace already has in-flight job (idempotent)', async () => {
    const { POST } = await import('../route');
    const workspaceId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const existingJobId = '11111111-2222-3333-4444-555555555555';

    await setDesignTemplateJobStatus({
      jobId: existingJobId,
      workspaceId,
      status: 'running',
      generated: 0,
    });

    const res = await POST(
      new NextRequest(`http://localhost/api/brand-context/${workspaceId}/generate-design-templates`, {
        method: 'POST',
        body: JSON.stringify({ locale: 'tr', background: true }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ workspaceId }) },
    );

    expect(res.status).toBe(202);
    const data = await res.json() as {
      jobId: string;
      reused: boolean;
      queued: boolean;
    };
    expect(data.jobId).toBe(existingJobId);
    expect(data.reused).toBe(true);
    expect(data.queued).toBe(true);
    expect(afterMock).not.toHaveBeenCalled();
  });
});
