/**
 * GET /api/remotion/video/[filename]
 * Serves locally rendered Remotion MP4 files from /tmp/remotion-serve/
 * Used when R2 is not configured (dev environment).
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
export const runtime = 'nodejs';

const SERVE_DIR = '/tmp/remotion-serve';

function isAllowedFilename(filename: string): boolean {
  return filename.endsWith('.mp4') && !filename.includes('/') && !filename.includes('..');
}

function resolveServeFile(filename: string): { filePath: string; size: number } | 'forbidden' | 'missing' {
  if (!isAllowedFilename(filename)) return 'forbidden';
  const filePath = path.join(SERVE_DIR, filename);
  if (!fs.existsSync(filePath)) return 'missing';
  const size = fs.statSync(filePath).size;
  return { filePath, size };
}

function parseRangeHeader(
  rangeHeader: string | null,
  totalSize: number,
): { start: number; end: number } | null {
  if (!rangeHeader || totalSize <= 0) return null;
  const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
  if (!match) return null;
  const start = parseInt(match[1]!, 10);
  const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
  if (!Number.isFinite(start) || start < 0 || start >= totalSize) return null;
  return { start, end: Math.min(end, totalSize - 1) };
}

function fileToReadableStream(filePath: string, rangeStart = 0, rangeEnd?: number): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const stream = fs.createReadStream(filePath, {
        start: rangeStart,
        end: rangeEnd,
        highWaterMark: 64 * 1024,
      });
      stream.on('data', (chunk) => controller.enqueue(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      stream.on('end', () => controller.close());
      stream.on('error', (err) => controller.error(err));
    },
  });
}

function videoResponse(
  filePath: string,
  size: number,
  req: NextRequest,
): NextResponse {
  const range = parseRangeHeader(req.headers.get('range'), size);
  const baseHeaders = {
    'Content-Type': 'video/mp4',
    'Cache-Control': 'public, max-age=3600',
    'Accept-Ranges': 'bytes',
  };

  if (range) {
    const chunkSize = range.end - range.start + 1;
    return new NextResponse(fileToReadableStream(filePath, range.start, range.end), {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Length': String(chunkSize),
        'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
      },
    });
  }

  return new NextResponse(fileToReadableStream(filePath), {
    status: 200,
    headers: {
      ...baseHeaders,
      'Content-Length': String(size),
    },
  });
}

export async function HEAD(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
): Promise<NextResponse> {
  const { filename } = await params;
  const resolved = resolveServeFile(filename);
  if (resolved === 'forbidden') {
    return new NextResponse(null, { status: 403 });
  }
  if (resolved === 'missing') {
    return new NextResponse(null, { status: 404 });
  }
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': resolved.size.toString(),
      'Cache-Control': 'public, max-age=3600',
      'Accept-Ranges': 'bytes',
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
): Promise<NextResponse> {
  const { filename } = await params;
  const resolved = resolveServeFile(filename);
  if (resolved === 'forbidden') {
    return new NextResponse('Not allowed', { status: 403 });
  }
  if (resolved === 'missing') {
    return new NextResponse('Not found', { status: 404 });
  }

  return videoResponse(resolved.filePath, resolved.size, req);
}
