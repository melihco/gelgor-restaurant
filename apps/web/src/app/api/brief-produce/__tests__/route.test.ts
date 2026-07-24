import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const afterMock = vi.fn((fn: () => void | Promise<void>) => {
  // Do not run background production — zero-cost verification.
  void fn;
});

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return {
    ...actual,
    after: (fn: () => void | Promise<void>) => afterMock(fn),
  };
});

vi.mock('@/lib/server-config', () => ({
  serverConfig: {
    crewBackend: { baseUrl: 'http://crew.test' },
    internal: { apiKey: 'test-key' },
  },
}));

vi.mock('@/lib/runtime-config', () => ({
  getNextjsInternalOrigin: () => 'http://web.test',
}));

describe('POST /api/brief-produce (CRUD / contract, no image spend)', () => {
  beforeEach(() => {
    afterMock.mockClear();
  });

  it('rejects invalid payloads before queueing', async () => {
    const { POST } = await import('../route');

    const missingTitle = await POST(new NextRequest('http://localhost/api/brief-produce', {
      method: 'POST',
      body: JSON.stringify({
        workspaceId: '327db521-ede2-48e0-8f06-4146ee458c50',
        title: '  ',
        outputType: 'post',
        background: true,
      }),
      headers: { 'Content-Type': 'application/json' },
    }));
    expect(missingTitle.status).toBe(400);
    expect(afterMock).not.toHaveBeenCalled();

    const badType = await POST(new NextRequest('http://localhost/api/brief-produce', {
      method: 'POST',
      body: JSON.stringify({
        workspaceId: '327db521-ede2-48e0-8f06-4146ee458c50',
        title: 'Bal',
        outputType: 'carousel',
        background: true,
      }),
      headers: { 'Content-Type': 'application/json' },
    }));
    expect(badType.status).toBe(400);
    await expect(badType.json()).resolves.toEqual({
      error: 'outputType must be story, reel, or post',
    });
  });

  it('queues background job with format + count and does not invoke auto-produce in test', async () => {
    const { POST } = await import('../route');

    const res = await POST(new NextRequest('http://localhost/api/brief-produce', {
      method: 'POST',
      body: JSON.stringify({
        workspaceId: '327db521-ede2-48e0-8f06-4146ee458c50',
        title: 'Yaz Balları',
        extraDirection: 'samimi ürün',
        outputType: 'story',
        count: 2,
        photoUrls: ['https://cdn.example.com/a.jpg'],
        background: true,
      }),
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': '327db521-ede2-48e0-8f06-4146ee458c50',
        'X-Office-Id': 'office-1',
      },
    }));

    expect(res.status).toBe(202);
    const data = await res.json() as {
      ok: boolean;
      queued: boolean;
      jobId: string;
      title: string;
      outputType: string;
      count: number;
    };
    expect(data.ok).toBe(true);
    expect(data.queued).toBe(true);
    expect(data.jobId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(data.title).toBe('Yaz Balları');
    expect(data.outputType).toBe('story');
    expect(data.count).toBe(2);
    // after() registered once — callback intentionally not executed (no provider spend)
    expect(afterMock).toHaveBeenCalledTimes(1);
  });
});
